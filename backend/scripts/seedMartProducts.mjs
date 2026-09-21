import fs from 'node:fs'
import path from 'node:path'

// Read access token from firebase-tools config
const configPath = path.join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json')
const tokenData = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const token = tokenData.tokens.access_token

const PROJECT_ID = 'my-inventory-system-6094e'
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

const TARGET_LOCATION = 'SHOP_MUBEPOE3' // global mart (wizardo_@gmail.com)
const TARGET_USER = 'wizardo_@gmail.com'

const PARTNER_LOCATION = 'SHOP_MUBFLMDG' // i mart (patel123@gmail.com)
const PARTNER_USER = 'patel123@gmail.com'

// Helper to convert plain JS object to Firestore REST fields format
function toFirestoreFields(obj) {
  const fields = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null }
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v }
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        fields[k] = { integerValue: String(v) }
      } else {
        fields[k] = { doubleValue: v }
      }
    } else if (typeof v === 'string') {
      if (v.endsWith('Z') && !isNaN(Date.parse(v))) {
        fields[k] = { timestampValue: v }
      } else {
        fields[k] = { stringValue: v }
      }
    } else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map((item) => toFirestoreValue(item)) } }
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } }
    }
  }
  return fields
}

function toFirestoreValue(v) {
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  return { stringValue: String(v) }
}

async function setDocument(collection, docId, data) {
  const url = `${BASE_URL}/${collection}/${docId}`
  const body = JSON.stringify({ fields: toFirestoreFields(data) })
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to set ${collection}/${docId} (${res.status}): ${errText}`)
  }
  return res.json()
}

async function addLedgerDoc(data) {
  const url = `${BASE_URL}/stock_ledger`
  const body = JSON.stringify({ fields: toFirestoreFields(data) })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to add stock_ledger doc (${res.status}): ${errText}`)
  }
  return res.json()
}

const PRODUCTS = [
  {
    sku: 'MART-OIL-1L',
    productName: 'Fortune Sunlite Sunflower Oil 1L',
    category: 'Groceries & Staples',
    brand: 'Fortune',
    barcode: '8901030010014',
    unit: 'Bottle',
    buyingPrice: 120,
    sellingPrice: 160,
    emergencyPrice: 140, // profit: 20 vs 40 (50% < 60%)
    batchNo: 'BATCH-2026-A1',
    qty: 45,
    expiryDate: '2027-03-31',
    partnerQty: 20
  },
  {
    sku: 'MART-SALT-1KG',
    productName: 'Tata Salt Vacuum Evaporated 1kg',
    category: 'Groceries & Staples',
    brand: 'Tata',
    barcode: '8901030020021',
    unit: 'Packet',
    buyingPrice: 20,
    sellingPrice: 28,
    emergencyPrice: 24, // profit: 4 vs 8 (50% < 60%)
    batchNo: 'BATCH-2026-B1',
    qty: 100,
    expiryDate: '2027-08-31',
    partnerQty: 0
  },
  {
    sku: 'MART-ATTA-5KG',
    productName: 'Aashirvaad Sharbati Whole Wheat Atta 5kg',
    category: 'Groceries & Staples',
    brand: 'Aashirvaad',
    barcode: '8901030030038',
    unit: 'Bag',
    buyingPrice: 220,
    sellingPrice: 280,
    emergencyPrice: 250, // profit: 30 vs 60 (50% < 60%)
    batchNo: 'BATCH-2026-C1',
    qty: 30,
    expiryDate: '2027-01-15',
    partnerQty: 15
  },
  {
    sku: 'MART-RICE-5KG',
    productName: 'Daawat Rozana Super Basmati Rice 5kg',
    category: 'Groceries & Staples',
    brand: 'Daawat',
    barcode: '8901030040045',
    unit: 'Bag',
    buyingPrice: 320,
    sellingPrice: 420,
    emergencyPrice: 370, // profit: 50 vs 100 (50% < 60%)
    batchNo: 'BATCH-2026-D1',
    qty: 25,
    expiryDate: '2027-06-30',
    partnerQty: 0
  },
  {
    sku: 'MART-BTR-500G',
    productName: 'Amul Pasteurised Salted Butter 500g',
    category: 'Dairy & Breakfast',
    brand: 'Amul',
    barcode: '8901030050052',
    unit: 'Pack',
    buyingPrice: 230,
    sellingPrice: 275,
    emergencyPrice: 252, // profit: 22 vs 45 (48.8% < 60%)
    batchNo: 'BATCH-2026-E1',
    qty: 40,
    expiryDate: '2026-12-25',
    partnerQty: 0
  },
  {
    sku: 'MART-LAYS-50G',
    productName: "Lay's India's Magic Masala Chips 50g",
    category: 'Snacks & Munchies',
    brand: "Lay's",
    barcode: '8901030060069',
    unit: 'Packet',
    buyingPrice: 15,
    sellingPrice: 20,
    emergencyPrice: 17, // profit: 2 vs 5 (40% < 60%)
    batchNo: 'BATCH-2026-F1',
    qty: 80,
    expiryDate: '2026-11-20',
    partnerQty: 0
  },
  {
    sku: 'MART-PARLE-250G',
    productName: 'Parle-G Original Glucose Biscuits 250g',
    category: 'Snacks & Munchies',
    brand: 'Parle',
    barcode: '8901030070076',
    unit: 'Packet',
    buyingPrice: 22,
    sellingPrice: 30,
    emergencyPrice: 26, // profit: 4 vs 8 (50% < 60%)
    batchNo: 'BATCH-2026-G1',
    qty: 120,
    expiryDate: '2027-05-10',
    partnerQty: 0
  },
  {
    sku: 'MART-CHOC-60G',
    productName: 'Cadbury Dairy Milk Silk Chocolate 60g',
    category: 'Chocolates & Sweets',
    brand: 'Cadbury',
    barcode: '8901030080083',
    unit: 'Bar',
    buyingPrice: 65,
    sellingPrice: 85,
    emergencyPrice: 75, // profit: 10 vs 20 (50% < 60%)
    batchNo: 'BATCH-2026-H1',
    qty: 60,
    expiryDate: '2027-02-28',
    partnerQty: 0
  },
  {
    sku: 'MART-TEA-500G',
    productName: 'Tata Tea Gold Premium Tea 500g',
    category: 'Beverages',
    brand: 'Tata',
    barcode: '8901030090090',
    unit: 'Pouch',
    buyingPrice: 260,
    sellingPrice: 330,
    emergencyPrice: 295, // profit: 35 vs 70 (50% < 60%)
    batchNo: 'BATCH-2026-I1',
    qty: 35,
    expiryDate: '2027-09-30',
    partnerQty: 18
  },
  {
    sku: 'MART-SURF-1KG',
    productName: 'Surf Excel Easy Wash Detergent Powder 1kg',
    category: 'Cleaning & Household',
    brand: 'Surf Excel',
    barcode: '8901030100103',
    unit: 'Pouch',
    buyingPrice: 110,
    sellingPrice: 145,
    emergencyPrice: 128, // profit: 18 vs 35 (51.4% < 60%)
    batchNo: 'BATCH-2026-J1',
    qty: 50,
    expiryDate: '2027-10-31',
    partnerQty: 0
  },
  {
    sku: 'MART-COLG-150G',
    productName: 'Colgate Strong Teeth Dental Cream Toothpaste 150g',
    category: 'Personal Care',
    brand: 'Colgate',
    barcode: '8901030110119',
    unit: 'Tube',
    buyingPrice: 80,
    sellingPrice: 110,
    emergencyPrice: 95, // profit: 15 vs 30 (50% < 60%)
    batchNo: 'BATCH-2026-K1',
    qty: 65,
    expiryDate: '2027-08-15',
    partnerQty: 0
  },
  {
    sku: 'MART-MAGGI-280G',
    productName: 'Maggi 2-Minute Masala Instant Noodles 4-Pack (280g)',
    category: 'Instant Food',
    brand: 'Nestle',
    barcode: '8901030120125',
    unit: 'Pack',
    buyingPrice: 46,
    sellingPrice: 60,
    emergencyPrice: 53, // profit: 7 vs 14 (50% < 60%)
    batchNo: 'BATCH-2026-L1',
    qty: 90,
    expiryDate: '2027-04-30',
    partnerQty: 0
  }
]

async function run() {
  const nowIso = new Date().toISOString()
  console.log(`Starting Mart Products seed for ${TARGET_LOCATION} (Global Mart)...`)

  for (const item of PRODUCTS) {
    console.log(`-> Processing ${item.sku} - ${item.productName}...`)

    // 1. Create or update product definition
    await setDocument('products', item.sku, {
      sku: item.sku,
      productName: item.productName,
      category: item.category,
      brand: item.brand,
      barcode: item.barcode,
      unit: item.unit,
      reorderLevel: 10,
      buyingPrice: item.buyingPrice,
      sellingPrice: item.sellingPrice,
      emergencyPrice: item.emergencyPrice,
      status: 'Active',
      createdAt: nowIso,
      updatedAt: nowIso
    })

    // 2. Create batch inventory for Global Mart
    const targetBatchKey = `${item.sku}__${TARGET_LOCATION}__${item.batchNo}`
    await setDocument('batch_inventory', targetBatchKey, {
      sku: item.sku,
      locationId: TARGET_LOCATION,
      batchNo: item.batchNo,
      barcode: item.barcode,
      qty: item.qty,
      expiryDate: item.expiryDate,
      buyingPrice: item.buyingPrice,
      sellingPrice: item.sellingPrice,
      emergencyPrice: item.emergencyPrice,
      createdAt: nowIso,
      updatedAt: nowIso
    })

    // 3. Stock ledger entry for Global Mart
    await addLedgerDoc({
      reason: 'purchase_in',
      sku: item.sku,
      locationId: TARGET_LOCATION,
      batchNo: item.batchNo,
      delta: item.qty,
      by: TARGET_USER,
      note: 'Initial supermarket inventory intake',
      ref: 'PO-MART-2026-01',
      at: nowIso
    })

    // 4. Partner shop stock (if partnerQty > 0)
    if (item.partnerQty > 0) {
      const partnerBatchKey = `${item.sku}__${PARTNER_LOCATION}__${item.batchNo}`
      await setDocument('batch_inventory', partnerBatchKey, {
        sku: item.sku,
        locationId: PARTNER_LOCATION,
        batchNo: item.batchNo,
        barcode: item.barcode,
        qty: item.partnerQty,
        expiryDate: item.expiryDate,
        buyingPrice: item.buyingPrice,
        sellingPrice: item.sellingPrice,
        emergencyPrice: item.emergencyPrice,
        createdAt: nowIso,
        updatedAt: nowIso
      })

      await addLedgerDoc({
        reason: 'purchase_in',
        sku: item.sku,
        locationId: PARTNER_LOCATION,
        batchNo: item.batchNo,
        delta: item.partnerQty,
        by: PARTNER_USER,
        note: 'Partner mart stock intake',
        ref: 'PO-PARTNER-2026-01',
        at: nowIso
      })
      console.log(`   [Partner stock added for ${PARTNER_LOCATION}: ${item.partnerQty} units]`)
    }
  }

  console.log('\n✅ Successfully seeded 12 Supermarket Mart products with batches and ledger entries!')
}

run().catch((err) => {
  console.error('Error seeding mart products:', err)
  process.exit(1)
})
