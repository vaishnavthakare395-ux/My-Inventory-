import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

// Admin reports. Run on demand (not on page load) and read directly so they
// stay independent of api.js. Scope by location where possible to keep cost low.

const batchKey = (sku, locationId, batchNo) => `${sku}__${locationId}__${batchNo}`

// Reconciliation: ledger-delta sum per SKU+batch must equal current stock qty.
export async function reconciliationReport(locationId) {
  if (!locationId) throw new Error('Pick a warehouse to reconcile')

  const [invSnap, ledSnap] = await Promise.all([
    getDocs(query(collection(db, 'batch_inventory'), where('locationId', '==', locationId))),
    getDocs(query(collection(db, 'stock_ledger'), where('locationId', '==', locationId))),
  ])

  const current = new Map()
  invSnap.forEach((d) => {
    const b = d.data()
    current.set(batchKey(b.sku, b.locationId, b.batchNo), { sku: b.sku, batchNo: b.batchNo, qty: b.qty || 0 })
  })

  const ledger = new Map()
  ledSnap.forEach((d) => {
    const e = d.data()
    const k = batchKey(e.sku, e.locationId, e.batchNo)
    ledger.set(k, (ledger.get(k) || 0) + (e.delta || 0))
  })

  const rows = []
  const keys = new Set([...current.keys(), ...ledger.keys()])
  for (const k of keys) {
    const cur = current.get(k)
    const sku = cur?.sku || k.split('__')[0]
    const batchNo = cur?.batchNo || k.split('__')[2]
    const stockQty = cur?.qty ?? 0
    const ledgerQty = ledger.get(k) ?? 0
    if (stockQty !== ledgerQty) rows.push({ sku, batchNo, stockQty, ledgerQty, diff: stockQty - ledgerQty })
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  return { checked: keys.size, mismatches: rows }
}

// Vendor-wise reorder list: products at/below reorderLevel, grouped by vendor.
export async function reorderList() {
  const prodSnap = await getDocs(query(collection(db, 'products'), where('reorderLevel', '>', 0)))
  const products = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  if (!products.length) return { count: 0, vendors: [] }

  const skus = new Set(products.map((p) => p.sku))
  const stockBySku = new Map()
  const invSnap = await getDocs(collection(db, 'batch_inventory'))
  invSnap.forEach((d) => {
    const b = d.data()
    if (skus.has(b.sku)) stockBySku.set(b.sku, (stockBySku.get(b.sku) || 0) + (b.qty || 0))
  })

  const low = products
    .map((p) => ({
      sku: p.sku,
      name: p.productName || p.sku,
      vendor: p.primaryVendor || p.brand || 'Unknown vendor',
      reorderLevel: p.reorderLevel || 0,
      inStock: stockBySku.get(p.sku) || 0,
    }))
    .filter((p) => p.inStock <= p.reorderLevel)

  const byVendor = new Map()
  for (const p of low) {
    if (!byVendor.has(p.vendor)) byVendor.set(p.vendor, [])
    byVendor.get(p.vendor).push(p)
  }
  const vendors = [...byVendor.entries()]
    .map(([vendor, items]) => ({ vendor, items: items.sort((a, b) => a.inStock - b.inStock) }))
    .sort((a, b) => b.items.length - a.items.length)

  return { count: low.length, vendors }
}
