// scripts/seed_cloud_firestore.mjs
import https from 'https';

const API_KEY = 'AIzaSyBhFlyOq0Ta97Yxi_ttDUs04ZPYiTCTXHE';
const PROJECT_ID = 'my-inventory-system-6094e';
const USER_EMAIL = 'admin_cleanup_1791676359433@stockflow.local';
const USER_PASS = 'CleanPassword123!';

function postJson(urlStr, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(data);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
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

function patchJson(urlStr, data, idToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(data);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${idToken}`
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
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

const products = [
  {
    sku: 'AASH-ATTA-10KG',
    productName: 'Aashirvaad Superior MP Chakki Atta 10kg',
    category: 'Groceries & Staples',
    unit: 'pack',
    barcode: '8901725181020',
    batchNo: 'B-VMART-ATTA-01',
    locationId: 'SHOP_V_MART',
    locationName: 'v mart',
    qty: 35,
    expiryDate: '2027-05-15',
    buyingPrice: 350,
    sellingPrice: 450, // Profit = 100
    emergencyPrice: 385, // Emergency profit = 35 (35% < 60% rule satisfied!)
    mrp: 460,
    ownerEmail: 'vaishnavthakare395@gmail.com',
    ownerName: 'omiii',
    isEmergencyAvailable: true,
  },
  {
    sku: 'FORT-OIL-5L',
    productName: 'Fortune Sunlite Refined Sunflower Oil 5L Can',
    category: 'Supermarket / Edible Oils',
    unit: 'can',
    barcode: '8906007280056',
    batchNo: 'B-VMART-OIL-01',
    locationId: 'SHOP_V_MART',
    locationName: 'v mart',
    qty: 25,
    expiryDate: '2027-08-20',
    buyingPrice: 600,
    sellingPrice: 760, // Profit = 160
    emergencyPrice: 660, // Emergency profit = 60 (37.5% < 60% rule satisfied!)
    mrp: 775,
    ownerEmail: 'vaishnavthakare395@gmail.com',
    ownerName: 'omiii',
    isEmergencyAvailable: true,
  }
];

async function main() {
  console.log('Logging in to Firebase Auth...');
  const authRes = await postJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    email: USER_EMAIL,
    password: USER_PASS,
    returnSecureToken: true
  });
  const idToken = authRes.idToken;
  console.log('Logged in successfully!');

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
    await patchJson(prodUrl, prodDoc, idToken);
    console.log(`[Cloud Firestore] Created product: ${p.sku} (${p.productName})`);

    const batchId = `${p.locationId}_${p.batchNo}`;
    const batchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/batch_inventory/${batchId}`;
    await patchJson(batchUrl, batchDoc, idToken);
    console.log(`[Cloud Firestore] Created batch: ${batchId}`);
  }
  console.log('Done seeding Cloud Firestore!');
}

main().catch(console.error);
