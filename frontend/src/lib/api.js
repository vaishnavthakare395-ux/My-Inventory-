import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp,
  documentId,
  deleteDoc,
} from 'firebase/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth'
import { db, app } from './firebase'
import { LEDGER_REASONS, TRANSFER_STATUS } from './constants'
import { fefoSort } from './fefo'
import { pushToSheet, locationName } from './sheetSync'

const nowStr = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

// Every stock mutation goes through this module. Direct component writes to
// batch_inventory are intentionally avoided so the ledger always stays in sync.

const col = (name) => collection(db, name)

function snapToRows(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

function newestFirst(rows) {
  return [...rows].sort((a, b) => {
    const at = a.createdAt?.toMillis?.() || 0
    const bt = b.createdAt?.toMillis?.() || 0
    return bt - at
  })
}

// A stable doc id for a stock group so the same SKU+location+group never duplicates.
export function batchKey(sku, locationId, batchNo) {
  return `${sku}__${locationId}__${batchNo}`.replace(/\s+/g, '_')
}

function positiveQty(value, label = 'Quantity') {
  const n = Number(value)
  if (!Number.isFinite(n) || !(n > 0)) throw new Error(`${label} must be greater than zero`)
  return n
}

function receivedQty(value, sent, label = 'Received quantity') {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be zero or greater`)
  if (n > sent) throw new Error(`${label} cannot be more than the sent quantity`)
  return n
}

export function transferItemKey(item) {
  return item.lineId || `${item.sku}__${item.batchNo}`
}

function normaliseTransferItems(items = []) {
  return items.map((item, index) => {
    if (!item?.sku || !item?.batchNo) throw new Error(`Item ${index + 1} needs SKU and stock group`)
    return {
      sku: item.sku,
      batchNo: item.batchNo,
      qty: positiveQty(item.qty, `Item ${index + 1} quantity`),
      expiryDate: item.expiryDate || '',
      lineId: `${item.sku}__${item.batchNo}`,
    }
  })
}

/* ---------------- locations ---------------- */

export async function listLocations() {
  const snap = await getDocs(query(col('locations'), orderBy('name')))
  return snapToRows(snap)
}

export async function saveLocation(location) {
  const id = location.id || location.code
  await setDoc(
    doc(db, 'locations', id),
    {
      name: location.name,
      code: location.code,
      type: location.type || 'warehouse',
      shopType: location.shopType || '',
      address: location.address || '',
      coordinates: location.coordinates || null,
      mapVerified: !!location.mapVerified,
      googleMapsUrl: location.googleMapsUrl || '',
      ownerEmail: location.ownerEmail || '',
      active: location.active !== false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
  return id
}

export async function setLocationActive(id, active) {
  await updateDoc(doc(db, 'locations', id), { active })
}

/* ---------------- settings (order-source websites) ---------------- */

// Order-source sites live in a single settings doc so admins can add/remove
// them without a code change. Seeded with the original six on first read.
const DEFAULT_SITES = ['My Store', 'Marketplace', 'Amazon', 'Other 1', 'Other 2', 'Other 3']

const HOLD_DISPATCH_KEY = 'hold_manager_review'
const HOLD_DISPATCH_LABEL = 'Hold for manager review'

export const DEFAULT_SHIPPING_ANSWERS = {
  dispatch: [
    { key: 'closest_expiry', label: 'Ship from closest expiry stock', blocksFulfillment: false },
    { key: 'selected_warehouse', label: 'Ship from selected warehouse', blocksFulfillment: false },
    { key: HOLD_DISPATCH_KEY, label: HOLD_DISPATCH_LABEL, blocksFulfillment: true },
  ],
  packing: [
    { key: 'standard_packing', label: 'Standard packing', blocksFulfillment: false },
    { key: 'urgent_packing', label: 'Urgent packing', blocksFulfillment: false },
    { key: 'address_check_needed', label: 'Address check needed', blocksFulfillment: false },
  ],
  courier: [
    { key: 'website_default_courier', label: 'Website default courier', blocksFulfillment: false },
    { key: 'manual_courier_booking', label: 'Manual courier booking', blocksFulfillment: false },
    { key: 'pickup_hand_off', label: 'Pickup / hand-off', blocksFulfillment: false },
  ],
}

export async function getOrderSources() {
  const snap = await getDoc(doc(db, 'settings', 'order_sources'))
  if (snap.exists() && Array.isArray(snap.data().sites)) return snap.data().sites
  return DEFAULT_SITES
}

export async function saveOrderSources(sites) {
  const clean = [...new Set(sites.map((s) => s.trim()).filter(Boolean))]
  await setDoc(doc(db, 'settings', 'order_sources'), { sites: clean, updatedAt: serverTimestamp() })
  return clean
}

function optionKey(category, label, index) {
  const slug = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return `${category}_${slug || index + 1}`
}

export function shippingOptionLabel(option) {
  return typeof option === 'string' ? option : option?.label || ''
}

export function shippingOptionKey(option, category = 'answer', index = 0) {
  if (option && typeof option === 'object' && option.key) return option.key
  return optionKey(category, shippingOptionLabel(option), index)
}

function normaliseOption(value, fallback, category, index) {
  const fallbackOption = fallback?.[index]
  const rawLabel = typeof value === 'string' ? value : value?.label
  const label = String(rawLabel || '').trim()
  if (!label) return null

  const defaultMatch = DEFAULT_SHIPPING_ANSWERS[category]?.find((o) => o.label === label)
  const fallbackKey = fallbackOption?.key || defaultMatch?.key
  const key = String((typeof value === 'object' && value?.key) || fallbackKey || optionKey(category, label, index)).trim()
  const hasExplicitBlockFlag =
    value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, 'blocksFulfillment')
  const defaultBlocksFulfillment =
    category === 'dispatch' &&
    Boolean(defaultMatch?.blocksFulfillment || key === HOLD_DISPATCH_KEY || label === HOLD_DISPATCH_LABEL)
  const blocksFulfillment =
    category === 'dispatch' &&
    (hasExplicitBlockFlag ? Boolean(value.blocksFulfillment) : defaultBlocksFulfillment)

  return { key, label, blocksFulfillment }
}

function cleanOptions(values, fallback, category) {
  const source = Array.isArray(values) ? values : []
  const seen = new Set()
  const clean = []

  source.forEach((value, index) => {
    const option = normaliseOption(value, fallback, category, index)
    if (!option || seen.has(option.key)) return
    seen.add(option.key)
    clean.push(option)
  })

  if (clean.length) return clean
  return fallback.map((value, index) => normaliseOption(value, fallback, category, index)).filter(Boolean)
}

export function normaliseShippingAnswers(answers = {}) {
  return {
    dispatch: cleanOptions(answers.dispatch, DEFAULT_SHIPPING_ANSWERS.dispatch, 'dispatch'),
    packing: cleanOptions(answers.packing, DEFAULT_SHIPPING_ANSWERS.packing, 'packing'),
    courier: cleanOptions(answers.courier, DEFAULT_SHIPPING_ANSWERS.courier, 'courier'),
  }
}

export function shippingAnswerOption(options = [], key, label) {
  return (
    options.find((o, index) => shippingOptionKey(o, 'answer', index) === key) ||
    options.find((o) => shippingOptionLabel(o) === label) ||
    options[0] ||
    null
  )
}

export async function getShippingAnswers() {
  const snap = await getDoc(doc(db, 'settings', 'shipping_answers'))
  if (!snap.exists()) return DEFAULT_SHIPPING_ANSWERS

  return normaliseShippingAnswers(snap.data())
}

export async function saveShippingAnswers(answers) {
  const clean = normaliseShippingAnswers(answers)
  await setDoc(doc(db, 'settings', 'shipping_answers'), { ...clean, updatedAt: serverTimestamp() })
  return clean
}

/* ---------------- users ---------------- */

export async function getUser(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function listUsers() {
  const snap = await getDocs(query(col('users'), orderBy('name')))
  return snapToRows(snap)
}

export async function saveUserProfile(uid, profile) {
  await setDoc(
    doc(db, 'users', uid),
    {
      email: profile.email,
      name: profile.name,
      role: profile.role,
      phone: profile.phone || '',
      assignedLocationIds: profile.assignedLocationIds || [],
      shopName: profile.shopName || '',
      shopType: profile.shopType || '',
      shopLocationId: profile.shopLocationId || '',
      verifiedAddress: profile.verifiedAddress || '',
      coordinates: profile.coordinates || null,
      googleMapsUrl: profile.googleMapsUrl || '',
      subscriptionDuration: profile.subscriptionDuration || '1_month',
      subscriptionPlanLabel: profile.subscriptionPlanLabel || '1 Month',
      subscriptionPrice: profile.subscriptionPrice || 499,
      subscriptionStartDate: profile.subscriptionStartDate || new Date().toISOString(),
      subscriptionEndDate: profile.subscriptionEndDate || '',
      createdAt: profile.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

// Creates a brand-new user login and creates their verified shop location.
// Spins up a secondary throwaway auth app so admin's session is not disturbed.
export async function createStaffUser({
  email,
  password,
  name,
  role = 'user',
  phone,
  shopName,
  shopType,
  address,
  coordinates,
  googleMapsUrl,
  subscriptionDuration,
  subscriptionPlanLabel,
  subscriptionPrice,
  subscriptionStartDate,
  subscriptionEndDate,
  assignedLocationIds = [],
}) {
  let finalLocationIds = [...assignedLocationIds]
  let createdLocationId = null

  // If a shop name is provided, automatically create this shop's location!
  if (shopName) {
    createdLocationId = `SHOP_${Date.now().toString(36).toUpperCase()}`
    const rawCode = (shopName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'SHOP').toUpperCase()
    const locCode = `${rawCode}-${createdLocationId.slice(-4)}`

    await saveLocation({
      id: createdLocationId,
      code: locCode,
      name: shopName,
      type: 'warehouse',
      shopType: shopType || 'general_store',
      address: address || '',
      coordinates: coordinates || null,
      mapVerified: true,
      googleMapsUrl: googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || shopName)}`,
      ownerEmail: email.trim(),
      ownerName: name || '',
      phone: phone || '',
      subscriptionDuration: subscriptionDuration || '1_month',
      subscriptionPlanLabel: subscriptionPlanLabel || '1 Month',
      subscriptionPrice: subscriptionPrice || 499,
      subscriptionStartDate: subscriptionStartDate || new Date().toISOString(),
      subscriptionEndDate: subscriptionEndDate || '',
      active: true,
    })

    if (!finalLocationIds.includes(createdLocationId)) {
      finalLocationIds.push(createdLocationId)
    }
  }

  const secondary = initializeApp(app.options, `staff-${Date.now()}`)
  try {
    const secAuth = getAuth(secondary)
    if (import.meta.env.VITE_USE_EMULATORS === 'true') {
      connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    }
    const cred = await createUserWithEmailAndPassword(secAuth, email.trim(), password)
    await saveUserProfile(cred.user.uid, {
      email: email.trim(),
      name,
      role,
      phone: phone || '',
      assignedLocationIds: finalLocationIds,
      shopName: shopName || '',
      shopType: shopType || '',
      shopLocationId: createdLocationId || (finalLocationIds[0] || ''),
      verifiedAddress: address || '',
      coordinates: coordinates || null,
      googleMapsUrl: googleMapsUrl || '',
      subscriptionDuration: subscriptionDuration || '1_month',
      subscriptionPlanLabel: subscriptionPlanLabel || '1 Month',
      subscriptionPrice: subscriptionPrice || 499,
      subscriptionStartDate: subscriptionStartDate || new Date().toISOString(),
      subscriptionEndDate: subscriptionEndDate || '',
      createdAt: serverTimestamp(),
    })
    return cred.user.uid
  } finally {
    await deleteApp(secondary)
  }
}

export async function updateMemberSubscription({ uid, locationId, durationId, planLabel, price, endDate }) {
  if (uid) {
    await updateDoc(doc(db, 'users', uid), {
      subscriptionDuration: durationId,
      subscriptionPlanLabel: planLabel,
      subscriptionPrice: price,
      subscriptionEndDate: endDate,
      updatedAt: serverTimestamp(),
    })
  }
  if (locationId) {
    await updateDoc(doc(db, 'locations', locationId), {
      subscriptionDuration: durationId,
      subscriptionPlanLabel: planLabel,
      subscriptionPrice: price,
      subscriptionEndDate: endDate,
      updatedAt: serverTimestamp(),
    })
  }
}

export async function deleteStaffUser({ uid, locationId }) {
  if (uid) {
    await deleteDoc(doc(db, 'users', uid))
  }
  if (locationId) {
    await deleteDoc(doc(db, 'locations', locationId))
  }
}

/* ---------------- products ---------------- */

export async function listProducts(max = 500) {
  const snap = await getDocs(query(col('products'), orderBy('productName'), limit(max)))
  return snapToRows(snap)
}

export async function getProductsBySkus(skus) {
  const unique = [...new Set((skus || []).filter(Boolean))]
  if (!unique.length) return []

  const rows = []
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30)
    const snap = await getDocs(query(col('products'), where(documentId(), 'in', chunk)))
    rows.push(...snapToRows(snap))
  }
  return rows
}

export async function findProduct({ sku, barcode }) {
  if (sku) {
    const snap = await getDoc(doc(db, 'products', sku))
    if (snap.exists()) return { id: snap.id, ...snap.data() }
  }
  if (barcode) {
    const snap = await getDocs(query(col('products'), where('barcode', '==', barcode), limit(1)))
    const rows = snapToRows(snap)
    if (rows.length) return rows[0]
  }
  return null
}

export async function saveProduct(product) {
  const id = product.sku
  await setDoc(
    doc(db, 'products', id),
    {
      sku: product.sku,
      productName: product.productName,
      barcode: product.barcode || '',
      brand: product.brand || '',
      primaryVendor: product.primaryVendor || '',
      altVendor1: product.altVendor1 || '',
      altVendor2: product.altVendor2 || '',
      reorderLevel: Number(product.reorderLevel) || 0,
      buyingPrice: Number(product.buyingPrice) || 0,
      sellingPrice: Number(product.sellingPrice) || 0,
      emergencyPrice: Number(product.emergencyPrice) || 0,
      status: product.status || 'Active',
    },
    { merge: true }
  )
  return id
}

/* ---------------- batch inventory ---------------- */

export async function batchesAtLocation(locationId) {
  const snap = await getDocs(query(col('batch_inventory'), where('locationId', '==', locationId)))
  return fefoSort(snapToRows(snap).filter((b) => b.qty > 0))
}

export async function batchesForLocations(locationIds = []) {
  const ids = [...new Set((locationIds || []).filter(Boolean))]
  if (!ids.length) return []

  const chunks = await Promise.all(ids.map((locationId) => batchesAtLocation(locationId)))
  return fefoSort(chunks.flat())
}

export async function batchesForSkuAtLocations(sku, locationIds = []) {
  const cleanSku = String(sku || '').trim()
  const ids = [...new Set((locationIds || []).filter(Boolean))]
  if (!cleanSku || !ids.length) return []

  const chunks = await Promise.all(
    ids.map(async (locationId) => {
      const snap = await getDocs(query(
        col('batch_inventory'),
        where('locationId', '==', locationId),
        where('sku', '==', cleanSku)
      ))
      return snapToRows(snap)
    })
  )
  return fefoSort(chunks.flat().filter((b) => b.qty > 0))
}

// Adds stock for a stock group and records the movement. Increments if the
// group already exists at that location.
export async function addStock({ sku, locationId, batchNo, qty, expiryDate, by, buyingPrice, sellingPrice, emergencyPrice }) {
  qty = positiveQty(qty)
  if (!sku || !locationId || !batchNo) throw new Error('sku, location and stock group are required')

  const id = batchKey(sku, locationId, batchNo)
  const ref = doc(db, 'batch_inventory', id)
  let newQty = qty

  const bPrice = Number(buyingPrice) || 0
  const sPrice = Number(sellingPrice) || 0
  const ePrice = Number(emergencyPrice) || 0

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      newQty = (existing.data().qty || 0) + qty
      const updateData = { qty: increment(qty), expiryDate, updatedAt: serverTimestamp() }
      if (bPrice) updateData.buyingPrice = bPrice
      if (sPrice) updateData.sellingPrice = sPrice
      if (ePrice) updateData.emergencyPrice = ePrice
      tx.update(ref, updateData)
    } else {
      tx.set(ref, {
        sku,
        locationId,
        batchNo,
        qty,
        expiryDate,
        buyingPrice: bPrice,
        sellingPrice: sPrice,
        emergencyPrice: ePrice,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    writeLedger(tx, {
      reason: LEDGER_REASONS.ADD_STOCK,
      sku,
      locationId,
      batchNo,
      delta: qty,
      by,
    })
  })
  // Live stock row: one row per SKU+stock group+location, updated in place.
  pushStock({ sku, batchNo, locationId, qty: newQty, expiryDate, by })
  return id
}

// Sends the current state of a stock group to the live Stock sheet. The Apps Script
// finds the matching SKU+stock group+location row and updates it (or adds one).
function pushStock({ sku, batchNo, locationId, qty, expiryDate, by }) {
  pushToSheet('Stock', {
    key: `${sku}|${batchNo}|${locationId}`,
    location: locationName(locationId), // tab name = readable location (Delhi, Belmont…)
    sku,
    stockGroup: batchNo,
    qty,
    expiry: expiryDate || '',
    status: qty <= 0 ? 'Out / removed' : 'In stock',
    updated: nowStr(),
    by: by || '',
  })
}

// Removes a stock group entirely — for wrong entries or dummy/test stock. Records the
// removal in the ledger so the audit trail explains where the units went.
export async function removeBatch({ batchId, by, reason }) {
  const ref = doc(db, 'batch_inventory', batchId)
  let removed = null
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Stock group not found')
    const b = snap.data()
    removed = b
    if (b.qty > 0) {
      writeLedger(tx, {
        reason: LEDGER_REASONS.ADJUST,
        sku: b.sku,
        locationId: b.locationId,
        batchNo: b.batchNo,
        delta: -b.qty,
        by,
        note: reason || 'Stock group removed',
      })
    }
    tx.delete(ref)
  })
  // Live Stock row goes to 0 / removed.
  pushStock({ sku: removed.sku, batchNo: removed.batchNo, locationId: removed.locationId, qty: 0, expiryDate: removed.expiryDate, by })
}

/* ---------------- ledger ---------------- */

// Note: called from inside a transaction. Uses a pre-generated doc ref so the
// write joins the same atomic commit as the stock change.
function writeLedger(tx, entry) {
  const ref = doc(col('stock_ledger'))
  tx.set(ref, {
    reason: entry.reason,
    sku: entry.sku,
    locationId: entry.locationId,
    batchNo: entry.batchNo || '',
    delta: entry.delta,
    by: entry.by || 'system',
    note: entry.note || '',
    ref: entry.ref || '',
    at: Timestamp.now(),
  })
}

export async function recentLedger(locationId, max = 100) {
  const base = locationId
    ? query(col('stock_ledger'), where('locationId', '==', locationId), orderBy('at', 'desc'), limit(max))
    : query(col('stock_ledger'), orderBy('at', 'desc'), limit(max))
  const snap = await getDocs(base)
  return snapToRows(snap)
}

// Total in-stock units grouped by location, for the dashboard map. Admin/manager
// only — uses a collection-wide read, so it's gated by rules.
export async function stockByLocation(locationIds = null) {
  if (Array.isArray(locationIds)) {
    const totals = {}
    await Promise.all(
      locationIds.map(async (locationId) => {
        const rows = await batchesAtLocation(locationId)
        totals[locationId] = rows.reduce((sum, b) => sum + (b.qty || 0), 0)
      })
    )
    return totals
  }

  const snap = await getDocs(query(col('batch_inventory'), where('qty', '>', 0)))
  const totals = {}
  for (const d of snap.docs) {
    const b = d.data()
    totals[b.locationId] = (totals[b.locationId] || 0) + b.qty
  }
  return totals
}

/* ---------------- counters (transfer numbers) ---------------- */

async function nextNumber(tx, key, prefix) {
  const ref = doc(db, 'counters', key)
  const snap = await tx.get(ref)
  const n = (snap.exists() ? snap.data().value : 0) + 1
  tx.set(ref, { value: n }, { merge: true })
  return `${prefix}-${String(n).padStart(5, '0')}`
}

/* ---------------- transfers ---------------- */

export async function listTransfers({ fromLocationId, toLocationId, incomingStatus } = {}) {
  let q
  if (toLocationId) {
    q = incomingStatus
      ? query(col('warehouse_transfers'), where('toLocationId', '==', toLocationId), where('status', '==', incomingStatus))
      : query(col('warehouse_transfers'), where('toLocationId', '==', toLocationId))
  } else if (fromLocationId) {
    q = query(col('warehouse_transfers'), where('fromLocationId', '==', fromLocationId), orderBy('createdAt', 'desc'))
  } else {
    q = query(col('warehouse_transfers'), orderBy('createdAt', 'desc'), limit(200))
  }
  return snapToRows(await getDocs(q))
}

export async function createTransfer({ fromLocationId, toLocationId, items, by }) {
  if (!fromLocationId || !toLocationId) throw new Error('Pick a source and destination')
  if (fromLocationId === toLocationId) throw new Error('Source and destination must differ')
  if (!items?.length) throw new Error('Add at least one item to the box')
  const cleanItems = normaliseTransferItems(items)

  const id = await runTransaction(db, async (tx) => {
    const transferNo = await nextNumber(tx, 'transfer', 'TRF')
    const ref = doc(col('warehouse_transfers'))
    tx.set(ref, {
      transferNo,
      fromLocationId,
      toLocationId,
      items: cleanItems,
      status: TRANSFER_STATUS.DRAFT,
      createdBy: by,
      createdAt: serverTimestamp(),
    })
    return ref.id
  })
  return id
}

// Draft -> Shipped: deduct each item from the source stock group and lock it in
// transit. All-or-nothing so a partial failure never leaves phantom stock.
export async function shipTransfer({ transferId, by }) {
  const ref = doc(db, 'warehouse_transfers', transferId)
  let shipped
  let remaining = {} // transfer line key -> remaining qty at source (reset each tx run)
  await runTransaction(db, async (tx) => {
    remaining = {}
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Transfer not found')
    const t = snap.data()
    if (t.status !== TRANSFER_STATUS.DRAFT) throw new Error('Only draft boxes can be shipped')
    const items = normaliseTransferItems(t.items || [])
    shipped = { ...t, items }

    // Read every source stock group first; transactions require reads before writes.
    const reads = []
    for (const item of items) {
      const bId = batchKey(item.sku, t.fromLocationId, item.batchNo)
      const bRef = doc(db, 'batch_inventory', bId)
      reads.push({ item, bRef, snap: await tx.get(bRef) })
    }
    for (const { item, snap: bSnap } of reads) {
      if (!bSnap.exists()) throw new Error(`Stock group ${item.batchNo} missing at source`)
      const have = bSnap.data().qty
      if (have < item.qty) throw new Error(`Stock group ${item.batchNo}: only ${have} available`)
    }
    for (const { item, bRef, snap: bSnap } of reads) {
      const key = transferItemKey(item)
      tx.update(bRef, { qty: increment(-item.qty), updatedAt: serverTimestamp() })
      remaining[key] = bSnap.data().qty - item.qty
      writeLedger(tx, {
        reason: LEDGER_REASONS.TRANSFER_OUT,
        sku: item.sku,
        locationId: t.fromLocationId,
        batchNo: item.batchNo,
        delta: -item.qty,
        by,
        ref: t.transferNo,
      })
    }
    tx.update(ref, {
      items,
      status: TRANSFER_STATUS.IN_TRANSIT,
      shippedBy: by,
      shippedAt: serverTimestamp(),
    })
  })
  for (const item of shipped.items) {
    // History row
    pushToSheet('Transfers', {
      time: nowStr(), action: 'Shipped (out)', sku: item.sku, stockGroup: item.batchNo,
      qty: -item.qty, from: locationName(shipped.fromLocationId), to: locationName(shipped.toLocationId),
      ref: shipped.transferNo, by: by || '',
    })
    // Live Stock row at source updates to remaining qty
    pushStock({ sku: item.sku, batchNo: item.batchNo, locationId: shipped.fromLocationId, qty: remaining[transferItemKey(item)], expiryDate: item.expiryDate, by })
  }
}

// In transit -> Accepted. Destination confirms a received quantity per item.
// If any received qty differs from sent, the box lands in MISMATCH for review
// but the matched portion is still added so stock is never lost.
export async function acceptTransfer({ transferId, received, by }) {
  const ref = doc(db, 'warehouse_transfers', transferId)
  let accepted
  let acceptedReceived = {}
  let destQty = {} // transfer line key -> resulting qty at destination (reset each tx run)
  await runTransaction(db, async (tx) => {
    acceptedReceived = {}
    destQty = {}
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Transfer not found')
    const t = snap.data()
    if (t.status !== TRANSFER_STATUS.IN_TRANSIT) throw new Error('This box is not in transit')
    const items = normaliseTransferItems(t.items || [])
    accepted = { ...t, items }

    let mismatch = false
    for (const item of items) {
      const key = transferItemKey(item)
      const got = receivedQty(
        received?.[key] ?? received?.[item.batchNo] ?? item.qty,
        item.qty,
        `Received quantity for ${item.sku} stock group ${item.batchNo}`
      )
      acceptedReceived[key] = got
      if (got !== item.qty) mismatch = true
      if (got > 0) {
        const bId = batchKey(item.sku, t.toLocationId, item.batchNo)
        const bRef = doc(db, 'batch_inventory', bId)
        const bSnap = await tx.get(bRef)
        destQty[key] = (bSnap.exists() ? bSnap.data().qty || 0 : 0) + got
        if (bSnap.exists()) {
          tx.update(bRef, { qty: increment(got), expiryDate: item.expiryDate, updatedAt: serverTimestamp() })
        } else {
          tx.set(bRef, {
            sku: item.sku,
            locationId: t.toLocationId,
            batchNo: item.batchNo,
            qty: got,
            expiryDate: item.expiryDate || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
        writeLedger(tx, {
          reason: LEDGER_REASONS.TRANSFER_IN,
          sku: item.sku,
          locationId: t.toLocationId,
          batchNo: item.batchNo,
          delta: got,
          by,
          ref: t.transferNo,
        })
      }
    }
    tx.update(ref, {
      items,
      status: mismatch ? TRANSFER_STATUS.MISMATCH : TRANSFER_STATUS.ACCEPTED,
      received: acceptedReceived,
      acceptedBy: by,
      acceptedAt: serverTimestamp(),
    })
  })
  for (const item of accepted.items) {
    const got = acceptedReceived[transferItemKey(item)] ?? item.qty
    if (got > 0) {
      pushToSheet('Transfers', {
        time: nowStr(), action: 'Received (in)', sku: item.sku, stockGroup: item.batchNo,
        qty: got, from: locationName(accepted.fromLocationId), to: locationName(accepted.toLocationId),
        ref: accepted.transferNo, by: by || '',
      })
      // Live Stock row at destination — now reliably the post-accept quantity.
      pushStock({ sku: item.sku, batchNo: item.batchNo, locationId: accepted.toLocationId, qty: destQty[transferItemKey(item)], expiryDate: item.expiryDate, by })
    }
  }
}

/* ---------------- orders ---------------- */

export async function listOrders(locationId, max = 200) {
  const q = locationId
    ? query(col('orders'), where('locationId', '==', locationId), orderBy('createdAt', 'desc'), limit(max))
    : query(col('orders'), orderBy('createdAt', 'desc'), limit(max))
  return snapToRows(await getDocs(q))
}

// Records an order and ships it from a chosen stock group in one shot.
export async function fulfilOrder({ websiteSource, orderId, sku, batchId, qty, locationId, customer, shippingPlan, by }) {
  qty = positiveQty(qty)
  if (!websiteSource) throw new Error('Select the order source site')
  if (!sku) throw new Error('Select a product')
  if (!locationId) throw new Error('Select a warehouse')
  if (!batchId) throw new Error('Pick a stock group to fulfil from')

  const bRef = doc(db, 'batch_inventory', batchId)
  const orderRef = doc(col('orders'))
  let soldBatchNo
  let soldRemaining = 0
  let soldExpiry = ''
  await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(bRef)
    if (!bSnap.exists()) throw new Error('Stock group not found')
    const b = bSnap.data()
    if (b.sku !== sku) throw new Error('Selected stock group does not match this SKU')
    if (b.locationId !== locationId) throw new Error('Selected stock group is not in this warehouse')
    if (b.qty < qty) throw new Error(`Only ${b.qty} units in this stock group`)
    soldBatchNo = b.batchNo
    soldRemaining = b.qty - qty
    soldExpiry = b.expiryDate || ''

    tx.update(bRef, { qty: increment(-qty), updatedAt: serverTimestamp() })
    tx.set(orderRef, {
      websiteSource,
      orderId: orderId || '',
      sku,
      batchNo: b.batchNo,
      locationId,
      qty,
      customer: customer || {},
      shippingPlan: shippingPlan || {},
      status: 'shipped',
      shipDate: serverTimestamp(),
      createdBy: by,
      createdAt: serverTimestamp(),
    })
    writeLedger(tx, {
      reason: LEDGER_REASONS.SOLD,
      sku,
      locationId,
      batchNo: b.batchNo,
      delta: -qty,
      by,
      ref: orderId || orderRef.id,
    })
  })
  pushToSheet('Orders', {
    time: nowStr(), site: websiteSource, orderId: orderId || orderRef.id, sku,
    stockGroup: soldBatchNo, qty, expiry: soldExpiry, location: locationName(locationId),
    dispatchAnswer: shippingPlan?.dispatchAnswer || '',
    packingAnswer: shippingPlan?.packingAnswer || '',
    courierAnswer: shippingPlan?.courierAnswer || '',
    selection: shippingPlan?.selection || '',
    customer: customer?.name || '', phone: customer?.phone || '', city: customer?.city || '', by: by || '',
  })
  // Live Stock row updates to the remaining qty after the sale.
  pushStock({ sku, batchNo: soldBatchNo, locationId, qty: soldRemaining, expiryDate: soldExpiry, by })
  return orderRef.id
}

// Raw orders for analytics. Managers see their locations; admins see all.
export async function allOrdersForLocations(locationIds, max = 1000) {
  if (locationIds && locationIds.length) {
    const ids = [...new Set(locationIds.filter(Boolean))]
    const rows = []
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30)
      const snap = await getDocs(query(
        col('orders'),
        where('locationId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        limit(max)
      ))
      rows.push(...snapToRows(snap))
    }
    return newestFirst(rows).slice(0, max)
  }

  const q = query(col('orders'), orderBy('createdAt', 'desc'), limit(max))
  return snapToRows(await getDocs(q))
}

export async function markOrderDelivered(orderId) {
  await updateDoc(doc(db, 'orders', orderId), {
    status: 'delivered',
    deliveryDate: serverTimestamp(),
  })
}

/* ---------------- returns ---------------- */

export async function listReturns(locationId, max = 100) {
  const q = locationId
    ? query(col('returns'), where('locationId', '==', locationId), orderBy('createdAt', 'desc'), limit(max))
    : query(col('returns'), orderBy('createdAt', 'desc'), limit(max))
  return snapToRows(await getDocs(q))
}

// Verified return add-back. Only the confirmed quantity comes back, and only
// for the exact SKU + stock group, with an approver on record.
export async function addBackReturn({
  originalOrderId,
  returnReason,
  sku,
  batchNo,
  locationId,
  returnedQty,
  conditionStatus,
  expiryDate,
  approvedBy,
}) {
  returnedQty = positiveQty(returnedQty, 'Returned quantity')

  const addBack = conditionStatus === 'Good'
  const id = batchKey(sku, locationId, batchNo)
  const bRef = doc(db, 'batch_inventory', id)
  const retRef = doc(col('returns'))
  let newQty = 0
  let stockExpiry = expiryDate || ''

  await runTransaction(db, async (tx) => {
    if (addBack) {
      const bSnap = await tx.get(bRef)
      if (bSnap.exists()) {
        newQty = (bSnap.data().qty || 0) + returnedQty
        stockExpiry = bSnap.data().expiryDate || stockExpiry
        tx.update(bRef, { qty: increment(returnedQty), updatedAt: serverTimestamp() })
      } else {
        newQty = returnedQty
        tx.set(bRef, {
          sku,
          locationId,
          batchNo,
          qty: returnedQty,
          expiryDate: expiryDate || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      writeLedger(tx, {
        reason: LEDGER_REASONS.RETURN_IN,
        sku,
        locationId,
        batchNo,
        delta: returnedQty,
        by: approvedBy,
        ref: originalOrderId,
      })
    }
    tx.set(retRef, {
      originalOrderId: originalOrderId || '',
      returnReason,
      sku,
      batchNo,
      locationId,
      returnedQty,
      conditionStatus,
      addedBack: addBack,
      approvedBy,
      createdAt: serverTimestamp(),
    })
  })
  if (addBack) {
    pushStock({ sku, batchNo, locationId, qty: newQty, expiryDate: stockExpiry, by: approvedBy })
  }
  pushToSheet('Returns', {
    time: nowStr(), orderId: originalOrderId || '', reason: returnReason, sku, stockGroup: batchNo,
    qty: returnedQty, condition: conditionStatus, addedBack: addBack ? 'Yes' : 'No',
    location: locationName(locationId), approvedBy: approvedBy || '',
  })
  return retRef.id
}

/* ---------------- edit requests ---------------- */

export async function createEditRequest(reqData) {
  const ref = await addDoc(col('edit_requests'), {
    ...reqData,
    approvalStatus: 'pending',
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function listEditRequests() {
  const snap = await getDocs(query(col('edit_requests'), orderBy('createdAt', 'desc'), limit(100)))
  return snapToRows(snap)
}

export async function resolveEditRequest(id, approvalStatus, resolvedBy) {
  await updateDoc(doc(db, 'edit_requests', id), {
    approvalStatus,
    resolvedBy,
    resolvedAt: serverTimestamp(),
  })
}

/* ---------------- emergency network ---------------- */

export async function searchEmergencyStock({ queryText = '', userLocationId }) {
  const cleanQ = queryText.trim().toLowerCase()

  // 1. Fetch all active batches with stock across network
  const snap = await getDocs(query(col('batch_inventory'), where('qty', '>', 0)))
  const allBatches = snapToRows(snap)

  // 2. Filter out current shop's own stock
  const otherBatches = allBatches.filter((b) => b.locationId !== userLocationId && b.qty > 0)
  if (!otherBatches.length) return []

  // 3. Fetch products & locations metadata
  const skus = [...new Set(otherBatches.map((b) => b.sku))]
  const [products, locSnap] = await Promise.all([
    getProductsBySkus(skus),
    getDocs(query(col('locations'))),
  ])

  const productMap = Object.fromEntries(products.map((p) => [p.sku, p]))
  const locMap = Object.fromEntries(snapToRows(locSnap).map((l) => [l.id, l]))

  // 4. Enrich and filter
  const results = []
  for (const b of otherBatches) {
    const prod = productMap[b.sku] || {}
    const loc = locMap[b.locationId] || {}

    if (cleanQ) {
      const haystack = `${b.sku} ${prod.productName || ''} ${prod.category || ''} ${prod.brand || ''} ${b.batchNo} ${loc.name || ''}`.toLowerCase()
      if (!haystack.includes(cleanQ)) continue
    }

    const buyingPrice = b.buyingPrice || prod.buyingPrice || 0
    const sellingPrice = b.sellingPrice || prod.sellingPrice || 0
    let emergencyPrice = b.emergencyPrice || prod.emergencyPrice || 0
    if (!emergencyPrice && sellingPrice) {
      emergencyPrice = Math.round(sellingPrice * 0.85)
    }

    results.push({
      id: b.id,
      batchId: b.id,
      sku: b.sku,
      batchNo: b.batchNo,
      qty: b.qty,
      expiryDate: b.expiryDate,
      buyingPrice,
      sellingPrice,
      emergencyPrice,
      productName: prod.productName || b.sku,
      category: prod.category || 'General',
      unit: prod.unit || 'units',
      barcode: prod.barcode || '',
      sellerLocationId: b.locationId,
      sellerShopName: loc.name || 'Partner Shop',
      sellerAddress: loc.address || '',
      sellerPhone: loc.phone || '',
      sellerCoordinates: loc.coordinates || null,
      sellerShopType: loc.shopType || 'general_store',
    })
  }

  return results
}

export async function createEmergencyOrder({
  buyerLocationId,
  buyerShopName,
  buyerEmail,
  buyerPhone,
  sellerLocationId,
  sellerShopName,
  sellerEmail,
  sellerPhone,
  sku,
  productName,
  batchId,
  batchNo,
  qty,
  emergencyPrice,
  notes,
}) {
  qty = positiveQty(qty)
  if (!batchId || !buyerLocationId || !sellerLocationId) {
    throw new Error('Missing required emergency purchase parameters.')
  }

  const batchRef = doc(db, 'batch_inventory', batchId)
  const orderRef = doc(col('emergency_orders'))
  const totalAmount = Math.round(qty * emergencyPrice * 100) / 100

  await runTransaction(db, async (tx) => {
    const bSnap = await tx.get(batchRef)
    if (!bSnap.exists()) throw new Error('Seller batch not found.')
    const currentQty = bSnap.data().qty || 0
    if (currentQty < qty) {
      throw new Error(`Insufficient stock available. Only ${currentQty} units left in seller's shop.`)
    }

    // Deduct stock from seller's batch
    tx.update(batchRef, {
      qty: increment(-qty),
      updatedAt: serverTimestamp(),
    })

    // Create Emergency Order record
    tx.set(orderRef, {
      id: orderRef.id,
      buyerLocationId,
      buyerShopName: buyerShopName || '',
      buyerEmail: buyerEmail || '',
      buyerPhone: buyerPhone || '',
      sellerLocationId,
      sellerShopName: sellerShopName || '',
      sellerEmail: sellerEmail || '',
      sellerPhone: sellerPhone || '',
      sku,
      productName: productName || sku,
      batchId,
      batchNo: batchNo || '',
      qty,
      emergencyPrice: Number(emergencyPrice) || 0,
      totalAmount,
      notes: notes || '',
      status: 'completed',
      createdAt: serverTimestamp(),
    })

    // Write audit ledger entry for seller
    writeLedger(tx, {
      reason: LEDGER_REASONS.EMERGENCY_OUT,
      sku,
      locationId: sellerLocationId,
      batchNo,
      delta: -qty,
      by: buyerEmail || 'emergency-buyer',
      note: `Emergency sale to ${buyerShopName || buyerLocationId}`,
      ref: orderRef.id,
    })
  })

  return orderRef.id
}

export async function listEmergencyOrders(locationId) {
  if (!locationId) return []
  const [buyerSnap, sellerSnap] = await Promise.all([
    getDocs(query(col('emergency_orders'), where('buyerLocationId', '==', locationId))),
    getDocs(query(col('emergency_orders'), where('sellerLocationId', '==', locationId))),
  ])

  const map = new Map()
  for (const d of [...buyerSnap.docs, ...sellerSnap.docs]) {
    map.set(d.id, { id: d.id, ...d.data() })
  }

  const all = Array.from(map.values())
  return all.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
}

