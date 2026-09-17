import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-stockflow'

const app = initializeApp({ projectId: PROJECT_ID })
const auth = getAuth(app)
const db = getFirestore(app)

const LOCATIONS = [
  { id: 'DEL', name: 'Delhi', code: 'DEL', type: 'warehouse', active: true },
  { id: 'HAR', name: 'Haridwar', code: 'HAR', type: 'warehouse', active: true },
  { id: 'BEL', name: 'Belmont', code: 'BEL', type: 'warehouse', active: true },
  { id: 'RIC', name: 'Richmond', code: 'RIC', type: 'warehouse', active: true },
  { id: 'HQ', name: 'Head Office', code: 'HQ', type: 'office', active: true },
]

const ORDER_SITES = ['My Store', 'Marketplace', 'Amazon', 'Other 1', 'Other 2', 'Other 3']

const SHIPPING_ANSWERS = {
  dispatch: [
    { key: 'closest_expiry', label: 'Ship from closest expiry stock', blocksFulfillment: false },
    { key: 'selected_warehouse', label: 'Ship from selected warehouse', blocksFulfillment: false },
    { key: 'hold_manager_review', label: 'Hold for manager review', blocksFulfillment: true },
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

const PRODUCTS = [
  {
    sku: 'COF-ETH-001',
    skuRaw: 'COF-ETH-001',
    productName: 'Ethiopian Yirgacheffe Single Origin 500g',
    barcode: '890103080001',
    brand: 'Highland',
    primaryVendor: 'Highland Roasters',
    category: 'Beverages',
    type: 'Coffee',
    price: 18.5,
    status: 'Active',
  },
  {
    sku: 'TEA-DAR-002',
    skuRaw: 'TEA-DAR-002',
    productName: 'Darjeeling First Flush Whole Leaf Tea 250g',
    barcode: '890103080002',
    brand: 'Himalayan',
    primaryVendor: 'Himalayan Teas',
    category: 'Beverages',
    type: 'Tea',
    price: 12.0,
    status: 'Active',
  },
  {
    sku: 'HON-WLD-003',
    skuRaw: 'HON-WLD-003',
    productName: 'Wild Forest Raw Organic Honey 500g',
    barcode: '890103080003',
    brand: 'Bee Naturals',
    primaryVendor: 'Bee Naturals',
    category: 'Pantry',
    type: 'Honey',
    price: 14.25,
    status: 'Active',
  },
  {
    sku: 'OAT-ORG-004',
    skuRaw: 'OAT-ORG-004',
    productName: 'Organic Rolled Porridge Oats 1kg',
    barcode: '890103080004',
    brand: 'Valley Mills',
    primaryVendor: 'Valley Mills',
    category: 'Grains',
    type: 'Cereal',
    price: 8.99,
    status: 'Active',
  },
]

const BATCHES = [
  { sku: 'COF-ETH-001', locationId: 'DEL', batchNo: 'LOT-2026-A1', qty: 150, expiryDate: '2026-10-15' },
  { sku: 'COF-ETH-001', locationId: 'DEL', batchNo: 'LOT-2026-A2', qty: 200, expiryDate: '2026-12-30' },
  { sku: 'COF-ETH-001', locationId: 'BEL', batchNo: 'LOT-2026-A3', qty: 75, expiryDate: '2026-11-20' },
  { sku: 'TEA-DAR-002', locationId: 'DEL', batchNo: 'LOT-2026-T1', qty: 80, expiryDate: '2026-09-30' },
  { sku: 'HON-WLD-003', locationId: 'HAR', batchNo: 'LOT-2026-H1', qty: 120, expiryDate: '2027-05-20' },
  { sku: 'OAT-ORG-004', locationId: 'BEL', batchNo: 'LOT-2026-O1', qty: 300, expiryDate: '2027-01-15' },
]

function batchKey(sku, locationId, batchNo) {
  return `${sku}__${locationId}__${batchNo}`.replace(/\s+/g, '_')
}

async function main() {
  console.log('Seeding locations...')
  for (const l of LOCATIONS) {
    await db.doc(`locations/${l.id}`).set(l, { merge: true })
  }

  console.log('Seeding settings...')
  await db.doc('settings/order_sources').set({ sites: ORDER_SITES, updatedAt: Timestamp.now() }, { merge: true })
  await db.doc('settings/shipping_answers').set({ ...SHIPPING_ANSWERS, updatedAt: Timestamp.now() }, { merge: true })

  console.log('Seeding admin account...')
  const ADMIN_EMAIL = 'admin@example.com'
  const ADMIN_PASSWORD = 'password123'
  let admin
  try {
    admin = await auth.getUserByEmail(ADMIN_EMAIL)
  } catch {
    admin = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: 'Admin User',
    })
  }
  await db.doc(`users/${admin.uid}`).set(
    { email: ADMIN_EMAIL, name: 'Admin User', role: 'admin', assignedLocationIds: [] },
    { merge: true }
  )

  console.log('Seeding sample products...')
  for (const p of PRODUCTS) {
    await db.doc(`products/${p.sku}`).set({ ...p, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }, { merge: true })
  }

  console.log('Seeding sample batch inventory & ledger...')
  for (const b of BATCHES) {
    const id = batchKey(b.sku, b.locationId, b.batchNo)
    await db.doc(`batch_inventory/${id}`).set({
      ...b,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true })

    await db.collection('stock_ledger').add({
      reason: 'ADD_STOCK',
      sku: b.sku,
      locationId: b.locationId,
      batchNo: b.batchNo,
      delta: b.qty,
      by: ADMIN_EMAIL,
      createdAt: Timestamp.now(),
    })
  }

  console.log('\n--- Seeding Completed Successfully! ---')
  console.log('Admin Email:    ' + ADMIN_EMAIL)
  console.log('Admin Password: ' + ADMIN_PASSWORD)
  process.exit(0)
}

main().catch((err) => {
  console.error('Seeding error:', err)
  process.exit(1)
})
