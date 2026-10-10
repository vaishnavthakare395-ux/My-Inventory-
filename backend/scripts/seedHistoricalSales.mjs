import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-stockflow'

const app = initializeApp({ projectId: PROJECT_ID }, 'seed-sales-' + Date.now())
const db = getFirestore(app)

const PATEL_LOC_ID = 'LOC_PATEL_MART'

async function run() {
  console.log('Seeding historical sales data for Patel Fresh Mart...')

  const sampleBills = [
    // August 2026
    {
      invoiceNo: 'INV-20260812-4011',
      locationId: PATEL_LOC_ID,
      shopName: 'Patel Fresh Mart',
      customerName: 'Amit Sharma',
      paymentMethod: 'UPI',
      totalQty: 10,
      subtotal: 740,
      discount: 0,
      grandTotal: 740,
      items: [
        {
          sku: 'AMUL-MILK-1L',
          productName: 'Amul Taaza Milk 1L',
          batchNo: 'B-MLK-0924',
          qty: 10,
          unitPrice: 74,
          buyingPrice: 62,
          subtotal: 740,
        },
      ],
      createdAt: Timestamp.fromDate(new Date(2026, 7, 12, 14, 30)), // Aug 12
    },
    {
      invoiceNo: 'INV-20260824-4012',
      locationId: PATEL_LOC_ID,
      shopName: 'Patel Fresh Mart',
      customerName: 'Neha Verma',
      paymentMethod: 'Cash',
      totalQty: 8,
      subtotal: 1160,
      discount: 40,
      grandTotal: 1120,
      items: [
        {
          sku: 'TROP-ORG-1L',
          productName: 'Tropicana 100% Orange Juice 1L',
          batchNo: 'B-JCE-3105',
          qty: 8,
          unitPrice: 145,
          buyingPrice: 105,
          subtotal: 1160,
        },
      ],
      createdAt: Timestamp.fromDate(new Date(2026, 7, 24, 18, 15)), // Aug 24
    },

    // September 2026 (Last Month)
    {
      invoiceNo: 'INV-20260905-5021',
      locationId: PATEL_LOC_ID,
      shopName: 'Patel Fresh Mart',
      customerName: 'Sanjay Gupta',
      paymentMethod: 'Card',
      totalQty: 15,
      subtotal: 1110,
      discount: 0,
      grandTotal: 1110,
      items: [
        {
          sku: 'AMUL-MILK-1L',
          productName: 'Amul Taaza Milk 1L',
          batchNo: 'B-MLK-0924',
          qty: 15,
          unitPrice: 74,
          buyingPrice: 62,
          subtotal: 1110,
        },
      ],
      createdAt: Timestamp.fromDate(new Date(2026, 8, 5, 11, 20)), // Sep 5
    },
    {
      invoiceNo: 'INV-20260918-5022',
      locationId: PATEL_LOC_ID,
      shopName: 'Patel Fresh Mart',
      customerName: 'Priya Mehta',
      paymentMethod: 'UPI',
      totalQty: 12,
      subtotal: 1740,
      discount: 50,
      grandTotal: 1690,
      items: [
        {
          sku: 'TROP-ORG-1L',
          productName: 'Tropicana 100% Orange Juice 1L',
          batchNo: 'B-JCE-3105',
          qty: 12,
          unitPrice: 145,
          buyingPrice: 105,
          subtotal: 1740,
        },
      ],
      createdAt: Timestamp.fromDate(new Date(2026, 8, 18, 17, 45)), // Sep 18
    },
    {
      invoiceNo: 'INV-20260928-5023',
      locationId: PATEL_LOC_ID,
      shopName: 'Patel Fresh Mart',
      customerName: 'Rohan Joshi',
      paymentMethod: 'Cash',
      totalQty: 20,
      subtotal: 1180,
      discount: 0,
      grandTotal: 1180,
      items: [
        {
          sku: 'DETT-HW-175',
          productName: 'Dettol Liquid Handwash Refill 175ml',
          batchNo: 'B-DHW-7721',
          qty: 20,
          unitPrice: 59,
          buyingPrice: 44,
          subtotal: 1180,
        },
      ],
      createdAt: Timestamp.fromDate(new Date(2026, 8, 28, 19, 10)), // Sep 28
    },

    // October 2026 (Current Month)
    {
      invoiceNo: 'INV-20261003-6031',
      locationId: PATEL_LOC_ID,
      shopName: 'Patel Fresh Mart',
      customerName: 'Kavita Rao',
      paymentMethod: 'UPI',
      totalQty: 18,
      subtotal: 1332,
      discount: 32,
      grandTotal: 1300,
      items: [
        {
          sku: 'AMUL-MILK-1L',
          productName: 'Amul Taaza Milk 1L',
          batchNo: 'B-MLK-0924',
          qty: 18,
          unitPrice: 74,
          buyingPrice: 62,
          subtotal: 1332,
        },
      ],
      createdAt: Timestamp.fromDate(new Date(2026, 9, 3, 10, 15)), // Oct 3
    },
    {
      invoiceNo: 'INV-20261008-6032',
      locationId: PATEL_LOC_ID,
      shopName: 'Patel Fresh Mart',
      customerName: 'Vikas Malhotra',
      paymentMethod: 'Card',
      totalQty: 14,
      subtotal: 2030,
      discount: 30,
      grandTotal: 2000,
      items: [
        {
          sku: 'TROP-ORG-1L',
          productName: 'Tropicana 100% Orange Juice 1L',
          batchNo: 'B-JCE-3105',
          qty: 14,
          unitPrice: 145,
          buyingPrice: 105,
          subtotal: 2030,
        },
      ],
      createdAt: Timestamp.fromDate(new Date(2026, 9, 8, 16, 40)), // Oct 8
    },
  ]

  for (const bill of sampleBills) {
    const ref = db.collection('bills').doc()
    await ref.set({
      ...bill,
      updatedAt: bill.createdAt,
    })
  }

  // Seed sample expired inventory batch to demonstrate product loss diagnostic
  await db.doc(`batch_inventory/EXP-YOGURT__${PATEL_LOC_ID}__B-EXP-01`).set({
    sku: 'EXP-YOGURT',
    locationId: PATEL_LOC_ID,
    batchNo: 'B-EXP-01',
    qty: 12,
    expiryDate: '2026-08-01', // Expired
    buyingPrice: 35,
    sellingPrice: 50,
    emergencyPrice: 42,
    createdAt: Timestamp.fromDate(new Date(2026, 6, 1)),
    updatedAt: Timestamp.now(),
  })

  await db.doc('products/EXP-YOGURT').set(
    {
      sku: 'EXP-YOGURT',
      productName: 'Greek Organic Yogurt 200g',
      category: 'Dairy',
      buyingPrice: 35,
      sellingPrice: 50,
      emergencyPrice: 42,
      createdAt: Timestamp.now(),
    },
    { merge: true }
  )

  // Seed sample damaged return
  await db.collection('returns').doc('RET-DMG-001').set({
    id: 'RET-DMG-001',
    sku: 'TROP-ORG-1L',
    locationId: PATEL_LOC_ID,
    returnedQty: 3,
    conditionStatus: 'Damaged',
    reason: 'Bottle seal broken during customer transit',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })

  console.log('Successfully seeded historical bills and loss diagnostics!')
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
