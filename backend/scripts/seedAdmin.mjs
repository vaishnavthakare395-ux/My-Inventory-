// Ensures the admin account, default locations and order-source settings exist
// on the LIVE project. Idempotent (merge writes). Uses gcloud ADC or a
// serviceAccountKey.json. Run: node scripts/seedAdmin.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KEY = path.join(__dirname, '..', 'serviceAccountKey.json')
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-firebase-project-id'

// Set these via environment variables before seeding — do NOT hardcode real credentials.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-in-env'

const LOCATIONS = [
  { id: 'DEL', name: 'Delhi', code: 'DEL' },
  { id: 'HAR', name: 'Haridwar', code: 'HAR' },
  { id: 'BEL', name: 'Belmont', code: 'BEL' },
  { id: 'RIC', name: 'Richmond', code: 'RIC' },
  { id: 'HQ', name: 'Head Office', code: 'HQ' },
]
const ORDER_SOURCES = ['My Store', 'Marketplace', 'Amazon', 'Other 1', 'Other 2', 'Other 3']

if (fs.existsSync(KEY)) initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))), projectId: PROJECT_ID })
else initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })

const db = getFirestore()
const auth = getAuth()

async function run() {
  for (const l of LOCATIONS) {
    await db.doc(`locations/${l.id}`).set({ ...l, type: 'warehouse', active: true }, { merge: true })
  }
  console.log('locations ensured:', LOCATIONS.length)

  await db.doc('settings/order_sources').set({ sites: ORDER_SOURCES }, { merge: true })
  console.log('order sources ensured')

  let admin
  try { admin = await auth.getUserByEmail(ADMIN_EMAIL) }
  catch { admin = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: 'Admin' }); console.log('created admin:', ADMIN_EMAIL, '| temp password:', ADMIN_PASSWORD) }

  await db.doc(`users/${admin.uid}`).set({ email: ADMIN_EMAIL, name: 'Admin', role: 'admin', assignedLocationIds: [] }, { merge: true })
  console.log('admin profile ensured:', ADMIN_EMAIL)
  process.exit(0)
}
run().catch((e) => { console.error(e); process.exit(1) })
