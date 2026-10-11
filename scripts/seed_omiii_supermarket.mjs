// scripts/seed_omiii_supermarket.mjs
import https from 'https';
import http from 'http';

const CLOUD_PROJECT = 'my-inventory-system-6094e';
const LOCAL_PROJECT = 'demo-stockflow';

// Two realistic supermarket products
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

function postRequest(urlStr, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
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

function patchRequest(urlStr, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'PATCH',
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

async function getFirebaseAuthToken(email, password) {
  // Use Firebase Auth REST API to get ID token
  // If we don't have api key handy, we can sign in or use local emulator
  const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSy...`;
}

// Let's seed to local emulator first, and then to cloud
async function seedEmulator() {
  console.log('--- Seeding Local Firestore Emulator (http://localhost:8080) ---');
  for (const p of products) {
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
    await patchRequest(prodUrl, productDoc, { Authorization: 'Bearer owner' });
    console.log(`[Emulator] Created product: ${p.sku} (${p.productName})`);

    const batchId = `${p.locationId}_${p.batchNo}`;
    const batchUrl = `http://localhost:8080/v1/projects/${LOCAL_PROJECT}/databases/(default)/documents/batch_inventory/${batchId}`;
    await patchRequest(batchUrl, batchDoc, { Authorization: 'Bearer owner' });
    console.log(`[Emulator] Created batch: ${batchId}`);
  }
}

async function seedCloud() {
  console.log('\n--- Seeding Cloud Firestore (my-inventory-system-6094e) ---');
  // In cloud Firestore, we can write via firebase-admin or use firestore REST API if open or authenticated
  // Or we can import firebase-admin using application default credentials or service account / firebase CLI token
}

async function run() {
  await seedEmulator();
}

run().catch(console.error);
