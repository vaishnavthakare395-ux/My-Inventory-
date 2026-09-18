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

async function main() {
  console.log('Seeding settings...')
  await db.doc('settings/order_sources').set({ sites: ORDER_SITES, updatedAt: Timestamp.now() }, { merge: true })
  await db.doc('settings/shipping_answers').set({ ...SHIPPING_ANSWERS, updatedAt: Timestamp.now() }, { merge: true })

  console.log('Seeding admin account...')
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

  console.log('\n--- Clean Slate Seeding Completed (Zero Products) ---')
  console.log('Admin Email:    ' + ADMIN_EMAIL)
  console.log('Admin Password: ' + ADMIN_PASSWORD)
  process.exit(0)
}

main().catch((err) => {
  console.error('Seeding error:', err)
  process.exit(1)
})
