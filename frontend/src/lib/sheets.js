import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { saveProduct, addStock, batchesAtLocation, getProductsBySkus } from './api'

// Parse a CSV file into rows of objects keyed by header.
export function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => resolve(res.data),
      error: reject,
    })
  })
}

// Maps the Shopify export columns we care about onto our product fields. Falls
// back to plain headers (sku, product_name, ...) for hand-made sheets.
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim()
  }
  return ''
}

export function rowToProduct(row) {
  const sku = pick(row, ['Variant SKU', 'sku', 'SKU'])
  if (!sku) return null
  return {
    sku,
    productName: pick(row, ['Title', 'product_name', 'productName', 'name']) || sku,
    barcode: pick(row, ['Variant Barcode', 'barcode', 'Barcode']),
    brand: pick(row, ['Vendor', 'brand', 'Brand']),
    primaryVendor: pick(row, ['Vendor', 'primary_vendor', 'primaryVendor']),
    reorderLevel: Number(pick(row, ['reorder_level', 'reorderLevel'])) || 0,
  }
}

// Imports products from a parsed sheet. Optionally also seeds opening stock when
// the row carries qty/stockGroup/expiry columns and a target location is given.
export async function importProducts(rows, { locationId, by, onProgress } = {}) {
  let products = 0
  let stockRows = 0
  for (let i = 0; i < rows.length; i++) {
    const p = rowToProduct(rows[i])
    if (!p) continue
    await saveProduct(p)
    products++

    const qty = Number(pick(rows[i], ['Variant Inventory Qty', 'quantity', 'qty']))
    const batchNo = pick(rows[i], ['stock_group', 'stockGroup', 'batch_no', 'batchNo', 'batch'])
    if (locationId && qty > 0 && batchNo) {
      await addStock({
        sku: p.sku,
        locationId,
        batchNo,
        qty,
        expiryDate: pick(rows[i], ['expiry_date', 'expiryDate', 'expiry']),
        by,
      })
      stockRows++
    }
    onProgress?.((i + 1) / rows.length)
  }
  return { products, stockRows }
}

// Exports a warehouse's current stock to an .xlsx workbook (one file per
// warehouse). The app stays the source of truth; this is a read-only snapshot.
export async function exportWarehouseStock(location) {
  const batches = await batchesAtLocation(location.id)
  const products = await getProductsBySkus(batches.map((b) => b.sku))
  const bySku = {}
  for (const p of products) bySku[p.sku] = p

  const data = batches.map((b) => ({
    SKU: b.sku,
    Product: bySku[b.sku]?.productName || '',
    Barcode: bySku[b.sku]?.barcode || '',
    Warehouse: location.name,
    'Stock Group': b.batchNo,
    Qty: b.qty,
    Expiry: b.expiryDate || '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `StockFlow_${location.code || location.name}_${stamp}.xlsx`)
  return data.length
}
