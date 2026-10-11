// scripts/seed_omi_correct_location.mjs
import https from 'https';
import http from 'http';

const API_KEY = 'AIzaSyBhFlyOq0Ta97Yxi_ttDUs04ZPYiTCTXHE';
const PROJECT_ID = 'my-inventory-system-6094e';
const LOCAL_PROJECT = 'demo-stockflow';
const USER_EMAIL = 'admin_cleanup_1791676359433@stockflow.local';
const USER_PASS = 'CleanPassword123!';

// The exact location ID assigned to omi's account (v mart) in Firestore:
const OMI_LOCATION_ID = 'SHOP_MV32S9PX';
const OMI_EMAIL = 'vaishnavthakare395@gmail.com';
const OMI_NAME = 'omi';
const OMI_SHOP_NAME = 'v mart';

const products = [
  {
    sku: 'AASH-ATTA-10KG',
    productName: 'Aashirvaad Superior MP Chakki Atta 10kg',
    category: 'Groceries & Staples',
    unit: 'pack',
    barcode: '8901725181020',
    batchNo: 'B-VMART-ATTA-01',
    qty: 35,
    expiryDate: '2027-05-15',
    buyingPrice: 350,
    sellingPrice: 450,
    emergencyPrice: 385, // profit 35 < 60
    mrp: 460,
  },
  {
    sku: 'FORT-OIL-5L',
    productName: 'Fortune Sunlite Refined Sunflower Oil 5L Can',
    category: 'Supermarket / Edible Oils',
    unit: 'can',
    barcode: '8906007280056',
    batchNo: 'B-VMART-OIL-01',
    qty: 25,
    expiryDate: '2027-08-20',
    buyingPrice: 600,
    sellingPrice: 760,
    emergencyPrice: 660, // profit 60 < 96
    mrp: 775,
  },
  {
    sku: 'MAGG-NOOD-70G',
    productName: 'Maggi 2-Minute Instant Noodles 70g (Pack of 12)',
    category: 'Packaged Foods & Snacks',
    unit: 'pack',
    barcode: '8901058852331',
    batchNo: 'B-VMART-MAGG-01',
    qty: 60,
    expiryDate: '2027-04-10',
    buyingPrice: 130,
    sellingPrice: 168,
    emergencyPrice: 148,
    mrp: 168,
  },
  {
    sku: 'TATA-SALT-1KG',
    productName: 'Tata Salt Vacuum Evaporated Iodised 1kg',
    category: 'Groceries & Staples',
    unit: 'pack',
    barcode: '8904043901005',
    batchNo: 'B-VMART-SALT-01',
    qty: 80,
    expiryDate: '2028-01-15',
    buyingPrice: 20,
    sellingPrice: 28,
    emergencyPrice: 24,
    mrp: 30,
  },
  {
    sku: 'AMUL-BUTTER-500G',
    productName: 'Amul Pasteurised Butter 500g Block',
    category: 'Dairy & Refrigerated',
    unit: 'pack',
    barcode: '8901262010054',
    batchNo: 'B-VMART-BUTT-01',
    qty: 30,
    expiryDate: '2026-12-25',
    buyingPrice: 235,
    sellingPrice: 285,
    emergencyPrice: 260,
    mrp: 290,
  },
  {
    sku: 'SURF-EXCEL-EASY-1KG',
    productName: 'Surf Excel Easy Wash Detergent Powder 1kg',
    category: 'Household & Laundry',
    unit: 'pack',
    barcode: '8901030654124',
    batchNo: 'B-VMART-SURF-01',
    qty: 45,
    expiryDate: '2028-06-30',
    buyingPrice: 110,
    sellingPrice: 145,
    emergencyPrice: 125,
    mrp: 150,
  },
  {
    sku: 'PARLE-G-GLUCOSE-800G',
    productName: 'Parle-G Original Glucose Biscuits 800g Family Pack',
    category: 'Snacks & Biscuits',
    unit: 'pack',
    barcode: '8901719101019',
    batchNo: 'B-VMART-PARL-01',
    qty: 50,
    expiryDate: '2027-03-20',
    buyingPrice: 65,
    sellingPrice: 85,
    emergencyPrice: 75,
    mrp: 90,
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
    const postData = data ? JSON.stringify(data) : '';
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
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Logging in to Cloud Firebase...');
  const authRes = await reqPromise(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, 'POST', {
    email: USER_EMAIL,
    password: USER_PASS,
    returnSecureToken: true
  });
  const idToken = authRes.idToken;
  console.log('Logged in successfully!');

  // Seed for both the primary location SHOP_MV32S9PX and fallback SHOP_V_MART
  const locationsToSeed = [OMI_LOCATION_ID, 'SHOP_V_MART'];

  for (const locId of locationsToSeed) {
    for (const p of products) {
      const prodDoc = {
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
          locationId: locId,
          locationName: OMI_SHOP_NAME,
          isEmergencyAvailable: true,
          ownerEmail: OMI_EMAIL,
          by: OMI_EMAIL,
          ownerName: OMI_NAME,
          updatedAt: new Date().toISOString()
        })
      };

      const batchDoc = {
        fields: toFirestoreFields({
          sku: p.sku,
          productName: p.productName,
          batchNo: p.batchNo,
          locationId: locId,
          locationName: OMI_SHOP_NAME,
          qty: p.qty,
          expiryDate: p.expiryDate,
          buyingPrice: p.buyingPrice,
          sellingPrice: p.sellingPrice,
          emergencyPrice: p.emergencyPrice,
          mrp: p.mrp,
          isEmergencyAvailable: true,
          ownerEmail: OMI_EMAIL,
          by: OMI_EMAIL,
          ownerName: OMI_NAME,
          updatedAt: new Date().toISOString()
        })
      };

      // 1. Cloud Firestore
      const cloudProdUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/products/${p.sku}`;
      await reqPromise(cloudProdUrl, 'PATCH', prodDoc, { Authorization: `Bearer ${idToken}` });

      const batchKey = `${locId}_${p.batchNo}`;
      const cloudBatchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/batch_inventory/${batchKey}`;
      await reqPromise(cloudBatchUrl, 'PATCH', batchDoc, { Authorization: `Bearer ${idToken}` });

      // 2. Local Emulator
      const emuProdUrl = `http://localhost:8080/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents/products/${p.sku}`;
      await reqPromise(emuProdUrl, 'PATCH', prodDoc, { Authorization: 'Bearer owner' }).catch(() => {});

      const emuBatchUrl = `http://localhost:8080/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents/batch_inventory/${batchKey}`;
      await reqPromise(emuBatchUrl, 'PATCH', batchDoc, { Authorization: 'Bearer owner' }).catch(() => {});
    }
  }

  console.log(`All 7 products successfully linked to omi account (${OMI_EMAIL}, ${OMI_SHOP_NAME})!`);
}

main().catch(console.error);
