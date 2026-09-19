import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-stockflow'

const app = initializeApp({ projectId: PROJECT_ID }, 'seed-local-' + Date.now())
const auth = getAuth(app)
const db = getFirestore(app)

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

const ADMIN_EMAIL = 'admin@stockflow.local'
const ADMIN_PASSWORD = 'AdminPass123!'

const PATEL_EMAIL = 'patel.mart@stockflow.local'
const PATEL_PASSWORD = 'Password123!'
const PATEL_LOC_ID = 'LOC_PATEL_MART'

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const PATEL_PRODUCTS = [
  {
    sku: 'AMUL-MILK-1L',
    productName: 'Amul Taaza Milk 1L',
    category: 'Dairy',
    brand: 'Amul',
    barcode: '8901262010053',
    buyingPrice: 62,
    sellingPrice: 74,
    emergencyPrice: 69, // Profit: 7 vs 12 max 7.20 (58.3% < 60%)
    batchNo: 'B-MLK-0924',
    qty: 45,
    expiryDate: addDays(14),
  },
  {
    sku: 'AMUL-BTR-500',
    productName: 'Amul Salted Butter 500g',
    category: 'Dairy',
    brand: 'Amul',
    barcode: '8901262010107',
    buyingPrice: 240,
    sellingPrice: 285,
    emergencyPrice: 265, // Profit: 25 vs 45 max 27 (55.5% < 60%)
    batchNo: 'B-BTR-1088',
    qty: 30,
    expiryDate: addDays(60),
  },
  {
    sku: 'AASH-ATTA-5KG',
    productName: 'Aashirvaad Superior MP Sharbati Atta 5kg',
    category: 'Staples',
    brand: 'Aashirvaad',
    barcode: '8901030383709',
    buyingPrice: 215,
    sellingPrice: 265,
    emergencyPrice: 244, // Profit: 29 vs 50 max 30 (58% < 60%)
    batchNo: 'B-ATT-2702',
    qty: 25,
    expiryDate: addDays(120),
  },
  {
    sku: 'FORT-OIL-1L',
    productName: 'Fortune Sunlite Refined Sunflower Oil 1L',
    category: 'Oils & Ghee',
    brand: 'Fortune',
    barcode: '8906007280014',
    buyingPrice: 128,
    sellingPrice: 165,
    emergencyPrice: 149, // Profit: 21 vs 37 max 22.20 (56.7% < 60%)
    batchNo: 'B-OIL-9912',
    qty: 40,
    expiryDate: addDays(180),
  },
  {
    sku: 'HG-BREAD-400',
    productName: 'Harvest Gold White Bread 400g',
    category: 'Bakery',
    brand: 'Harvest Gold',
    barcode: '8906013310019',
    buyingPrice: 38,
    sellingPrice: 50,
    emergencyPrice: 45, // Profit: 7 vs 12 max 7.20 (58.3% < 60%)
    batchNo: 'B-BRD-4411',
    qty: 20,
    expiryDate: addDays(5), // Expiring in 5 days!
  },
  {
    sku: 'TROP-JCE-1L',
    productName: 'Tropicana 100% Real Orange Juice 1L',
    category: 'Beverages',
    brand: 'Tropicana',
    barcode: '8902080000018',
    buyingPrice: 105,
    sellingPrice: 145,
    emergencyPrice: 128, // Profit: 23 vs 40 max 24 (57.5% < 60%)
    batchNo: 'B-JCE-3105',
    qty: 35,
    expiryDate: addDays(90),
  },
  {
    sku: 'DETT-HW-175',
    productName: 'Dettol Liquid Handwash Refill 175ml',
    category: 'Personal Care',
    brand: 'Dettol',
    barcode: '8901396388837',
    buyingPrice: 44,
    sellingPrice: 59,
    emergencyPrice: 52, // Profit: 8 vs 15 max 9 (53.3% < 60%)
    batchNo: 'B-DHW-7721',
    qty: 50,
    expiryDate: addDays(365),
  },
]

async function main() {
  console.log('Seeding global settings...')
  await db.doc('settings/order_sources').set({ sites: ORDER_SITES, updatedAt: Timestamp.now() }, { merge: true })
  await db.doc('settings/shipping_answers').set({ ...SHIPPING_ANSWERS, updatedAt: Timestamp.now() }, { merge: true })

  console.log('Seeding System Admin account...')
  let admin
  try {
    admin = await auth.getUserByEmail(ADMIN_EMAIL)
  } catch {
    admin = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: 'System Admin',
    })
  }
  await db.doc(`users/${admin.uid}`).set(
    { email: ADMIN_EMAIL, name: 'System Admin', role: 'admin', assignedLocationIds: [] },
    { merge: true }
  )

  console.log('Seeding Patel Fresh Mart account...')
  let patelUser
  try {
    patelUser = await auth.getUserByEmail(PATEL_EMAIL)
  } catch {
    patelUser = await auth.createUser({
      email: PATEL_EMAIL,
      password: PATEL_PASSWORD,
      displayName: 'Rajesh Patel',
    })
  }

  await db.doc(`users/${patelUser.uid}`).set(
    {
      email: PATEL_EMAIL,
      name: 'Rajesh Patel',
      role: 'user',
      assignedLocationIds: [PATEL_LOC_ID],
    },
    { merge: true }
  )

  console.log('Seeding Patel Fresh Mart location...')
  await db.doc(`locations/${PATEL_LOC_ID}`).set(
    {
      id: PATEL_LOC_ID,
      code: 'PATEL',
      name: 'Patel Fresh Mart',
      type: 'mart',
      address: 'Shop 14, Galleria Market, DLF Phase 4, Gurugram, Haryana',
      lat: 28.4682,
      lng: 77.0827,
      ownerEmail: PATEL_EMAIL,
      ownerName: 'Rajesh Patel',
      ownerPhone: '+91 98765 43210',
      active: true,
      mapVerified: true,
      subscriptionPlan: '1_year',
      subscriptionStatus: 'active',
      subscriptionAmount: 9999,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  )

  console.log(`Seeding ${PATEL_PRODUCTS.length} Supermarket products for Patel Fresh Mart (strictly < 60% profit rule)...`)
  for (const item of PATEL_PRODUCTS) {
    // 1. Save product
    await db.doc(`products/${item.sku}`).set(
      {
        sku: item.sku,
        productName: item.productName,
        category: item.category,
        brand: item.brand,
        barcode: item.barcode,
        buyingPrice: item.buyingPrice,
        sellingPrice: item.sellingPrice,
        emergencyPrice: item.emergencyPrice,
        reorderLevel: 10,
        status: 'Active',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    )

    // 2. Save batch inventory
    const batchKey = `${item.sku}__${PATEL_LOC_ID}__${item.batchNo}`
    await db.doc(`batch_inventory/${batchKey}`).set(
      {
        sku: item.sku,
        locationId: PATEL_LOC_ID,
        batchNo: item.batchNo,
        qty: item.qty,
        expiryDate: item.expiryDate,
        buyingPrice: item.buyingPrice,
        sellingPrice: item.sellingPrice,
        emergencyPrice: item.emergencyPrice,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    )
  }

  console.log('\n======================================================')
  console.log(' SEEDING COMPLETED SUCCESSFULLY')
  console.log('======================================================')
  console.log('Admin Account:        ' + ADMIN_EMAIL + ' / ' + ADMIN_PASSWORD)
  console.log('Patel Mart Account:   ' + PATEL_EMAIL + ' / ' + PATEL_PASSWORD)
  console.log('Patel Location:       Patel Fresh Mart (' + PATEL_LOC_ID + ')')
  console.log('Products Added:       ' + PATEL_PRODUCTS.length + ' supermarket items adhering to < 60% profit rule')
  console.log('======================================================\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('Seeding error:', err)
  process.exit(1)
})
