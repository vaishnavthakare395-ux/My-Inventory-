// scripts/seed_more_omiii_products.mjs
import https from 'https';
import http from 'http';

const API_KEY = 'AIzaSyBhFlyOq0Ta97Yxi_ttDUs04ZPYiTCTXHE';
const PROJECT_ID = 'my-inventory-system-6094e';
const LOCAL_PROJECT = 'demo-stockflow';
const USER_EMAIL = 'admin_cleanup_1791676359433@stockflow.local';
const USER_PASS = 'CleanPassword123!';

const moreProducts = [
  {
    sku: 'MAGG-NOOD-70G',
    productName: 'Maggi 2-Minute Instant Noodles 70g (Pack of 12)',
    category: 'Packaged Foods & Snacks',
    unit: 'pack',
    barcode: '8901058852331',
    batchNo: 'B-VMART-MAGG-01',
    locationId: 'SHOP_V_MART',
    locationName: 'v mart',
    qty: 60,
    expiryDate: '2027-04-10',
    buyingPrice: 130,
    sellingPrice: 168, // Profit = 38
    emergencyPrice: 148, // Emergency profit = 18 (47.4% < 60% rule)
    mrp: 168,
    ownerEmail: 'vaishnavthakare395@gmail.com',
    ownerName: 'omiii',
    isEmergencyAvailable: true,
  },
  {
    sku: 'TATA-SALT-1KG',
    productName: 'Tata Salt Vacuum Evaporated Iodised 1kg',
    category: 'Groceries & Staples',
    unit: 'pack',
    barcode: '8904043901005',
    batchNo: 'B-VMART-SALT-01',
    locationId: 'SHOP_V_MART',
    locationName: 'v mart',
    qty: 80,
    expiryDate: '2028-01-15',
    buyingPrice: 20,
    sellingPrice: 28, // Profit = 8
    emergencyPrice: 24, // Emergency profit = 4 (50.0% < 60% rule)
    mrp: 30,
    ownerEmail: 'vaishnavthakare395@gmail.com',
    ownerName: 'omiii',
    isEmergencyAvailable: true,
  },
  {
    sku: 'AMUL-BUTTER-500G',
    productName: 'Amul Pasteurised Butter 500g Block',
    category: 'Dairy & Refrigerated',
    unit: 'pack',
    barcode: '8901262010054',
    batchNo: 'B-VMART-BUTT-01',
    locationId: 'SHOP_V_MART',
    locationName: 'v mart',
    qty: 30,
    expiryDate: '2026-12-25',
    buyingPrice: 235,
    sellingPrice: 285, // Profit = 50
    emergencyPrice: 260, // Emergency profit = 25 (50.0% < 60% rule)
    mrp: 290,
    ownerEmail: 'vaishnavthakare395@gmail.com',
    ownerName: 'omiii',
    isEmergencyAvailable: true,
  },
  {
    sku: 'SURF-EXCEL-EASY-1KG',
    productName: 'Surf Excel Easy Wash Detergent Powder 1kg',
    category: 'Household & Laundry',
    unit: 'pack',
    barcode: '8901030654124',
    batchNo: 'B-VMART-SURF-01',
    locationId: 'SHOP_V_MART',
    locationName: 'v mart',
    qty: 45,
    expiryDate: '2028-06-30',
    buyingPrice: 110,
    sellingPrice: 145, // Profit = 35
    emergencyPrice: 125, // Emergency profit = 15 (42.8% < 60% rule)
    mrp: 150,
    ownerEmail: 'vaishnavthakare395@gmail.com',
    ownerName: 'omiii',
    isEmergencyAvailable: true,
  },
  {
    sku: 'PARLE-G-GLUCOSE-800G',
    productName: 'Parle-G Original Glucose Biscuits 800g Family Pack',
    category: 'Snacks & Biscuits',
    unit: 'pack',
    barcode: '8901719101019',
    batchNo: 'B-VMART-PARL-01',
    locationId: 'SHOP_V_MART',
    locationName: 'v mart',
    qty: 50,
    expiryDate: '2027-03-20',
    buyingPrice: 65,
    sellingPrice: 85, // Profit = 20
    emergencyPrice: 75, // Emergency profit = 10 (50.0% < 60% rule)
    mrp: 90,
    ownerEmail: 'vaishnavthakare395@gmail.com',
    ownerName: 'omiii',
    isEmergencyAvailable: true,
  }
];

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        fields[k] = { integerValue: v.toString() };
      } else {
        fields[k] = { doubleValue: v };
      }
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    }
  }
  return fields;
}

function reqPromise(urlStr, method, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body || '{}'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('--- 1. Seeding Local Firestore Emulator ---');
  for (const p of moreProducts) {
    const productDoc = {
      fields: toFirestoreFields({
        sku: p.sku,
        productName: p.productName,
        category: p.category,
        unit: p.unit,
        barcode: p.barcode,
        buyingPrice: p.buyingPrice,
        sellingPrice: p.sellingPrice,
        emergencyPrice: p.emergencyPrice,
        mrp: p.mrp,
        locationId: p.locationId,
        locationName: p.locationName,
        isEmergencyAvailable: p.isEmergencyAvailable,
        ownerEmail: p.ownerEmail,
        ownerName: p.ownerName,
        createdAt: new Date().toISOString()
      })
    };

    const batchDoc = {
      fields: toFirestoreFields({
        sku: p.sku,
        productName: p.productName,
        batchNo: p.batchNo,
        locationId: p.locationId,
        locationName: p.locationName,
        qty: p.qty,
        expiryDate: p.expiryDate,
        buyingPrice: p.buyingPrice,
        sellingPrice: p.sellingPrice,
        emergencyPrice: p.emergencyPrice,
        mrp: p.mrp,
        isEmergencyAvailable: p.isEmergencyAvailable,
        ownerEmail: p.ownerEmail,
        ownerName: p.ownerName,
        createdAt: new Date().toISOString()
      })
    };

    const prodUrl = `http://localhost:8080/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents/products/${p.sku}`;
    await reqPromise(prodUrl, 'PATCH', productDoc, { Authorization: 'Bearer owner' });

    const batchId = `${p.locationId}_${p.batchNo}`;
    const batchUrl = `http://localhost:8080/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents/batch_inventory/${batchId}`;
    await reqPromise(batchUrl, 'PATCH', batchDoc, { Authorization: 'Bearer owner' });
    console.log(`[Emulator] Seeded: ${p.sku} (${p.productName})`);
  }

  console.log('\n--- 2. Seeding Cloud Firestore (my-inventory-system-6094e) ---');
  const authRes = await reqPromise(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, 'POST', {
    email: USER_EMAIL,
    password: USER_PASS,
    returnSecureToken: true
  });
  const idToken = authRes.idToken;

  for (const p of moreProducts) {
    const productDoc = {
      fields: toFirestoreFields({
        sku: p.sku,
        productName: p.productName,
        category: p.category,
        unit: p.unit,
        barcode: p.barcode,
        buyingPrice: p.buyingPrice,
        sellingPrice: p.sellingPrice,
        emergencyPrice: p.emergencyPrice,
        mrp: p.mrp,
        locationId: p.locationId,
        locationName: p.locationName,
        isEmergencyAvailable: p.isEmergencyAvailable,
        ownerEmail: p.ownerEmail,
        ownerName: p.ownerName,
        createdAt: new Date().toISOString()
      })
    };

    const batchDoc = {
      fields: toFirestoreFields({
        sku: p.sku,
        productName: p.productName,
        batchNo: p.batchNo,
        locationId: p.locationId,
        locationName: p.locationName,
        qty: p.qty,
        expiryDate: p.expiryDate,
        buyingPrice: p.buyingPrice,
        sellingPrice: p.sellingPrice,
        emergencyPrice: p.emergencyPrice,
        mrp: p.mrp,
        isEmergencyAvailable: p.isEmergencyAvailable,
        ownerEmail: p.ownerEmail,
        ownerName: p.ownerName,
        createdAt: new Date().toISOString()
      })
    };

    const prodUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/products/${p.sku}`;
    await reqPromise(prodUrl, 'PATCH', productDoc, { Authorization: `Bearer ${idToken}` });

    const batchId = `${p.locationId}_${p.batchNo}`;
    const batchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/batch_inventory/${batchId}`;
    await reqPromise(batchUrl, 'PATCH', batchDoc, { Authorization: `Bearer ${idToken}` });
    console.log(`[Cloud] Seeded: ${p.sku} (${p.productName})`);
  }

  console.log('\nAll products successfully added to omiii account in both Emulator and Cloud!');
}

main().catch(console.error);
