// Bootstraps local emulators with reference setup only.
// No users, products, stock groups, orders or transfers are created.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase/app'
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, Timestamp,
} from 'firebase/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = loadEnv(path.join(__dirname, '..', '..', 'frontend', '.env'))

if (env.VITE_USE_EMULATORS !== 'true') {
  console.error('Refusing to run client bootstrap unless VITE_USE_EMULATORS=true.')
  console.error('For live reference setup, use npm run seed:live.')
  process.exit(1)
}

const app = initializeApp({
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'stockflow-hub',
  apiKey: env.VITE_FIREBASE_API_KEY || 'local',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  appId: env.VITE_FIREBASE_APP_ID,
})

const db = getFirestore(app)
connectFirestoreEmulator(db, '127.0.0.1', 8080)
console.log('Bootstrapping local emulators with reference setup only.')

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const LOCATIONS = [
  { code: 'DEL', name: 'Delhi', type: 'warehouse' },
  { code: 'HAR', name: 'Haridwar', type: 'warehouse' },
  { code: 'BEL', name: 'Belmont', type: 'warehouse' },
  { code: 'RIC', name: 'Richmond', type: 'warehouse' },
  { code: 'HQ', name: 'Head Office', type: 'office' },
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

async function run() {
  console.log('Locations...')
  for (const l of LOCATIONS) {
    await setDoc(doc(db, 'locations', l.code), l, { merge: true })
  }

  console.log('Order setup...')
  await setSettingIfMissing('order_sources', { sites: ORDER_SITES, updatedAt: Timestamp.now() })
  await setSettingIfMissing('shipping_answers', { ...SHIPPING_ANSWERS, updatedAt: Timestamp.now() })

  console.log('\nDone. Created reference setup only. Add real users, products and stock from the app.')
  process.exit(0)
}

async function setSettingIfMissing(id, data) {
  const ref = doc(db, 'settings', id)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    console.log(`settings/${id} already exists; leaving it unchanged.`)
    return
  }
  await setDoc(ref, data)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
