import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-stockflow'

const app = initializeApp({ projectId: PROJECT_ID }, 'seed-shop-' + Date.now())
const auth = getAuth(app)
const db = getFirestore(app)

async function createShop() {
  const email = 'patel.mart@stockflow.local'
  const password = 'Password123!'
  const name = 'Aarav Patel'
  const phone = '+91 98234 56789'
  const role = 'user'
  const shopName = 'Patel Fresh Mart'
  const shopType = 'mart'
  const address = 'Shop 12, Galleria Market, DLF Phase 4, Gurugram, Haryana 122002'
  const lat = 28.4682
  const lon = 77.0864
  const locId = 'LOC_PATEL_MART'

  const startDate = new Date()
  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + 6)

  // 1. Create or get Auth user
  let userRecord
  try {
    userRecord = await auth.getUserByEmail(email)
    console.log('Existing user found in Auth:', userRecord.uid)
    await auth.updateUser(userRecord.uid, {
      displayName: name,
      password: password,
    })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: name,
      })
      console.log('Created Auth user:', userRecord.uid)
    } else {
      throw err
    }
  }

  const uid = userRecord.uid

  // 2. Create Location document
  await db.collection('locations').doc(locId).set({
    code: 'PATEL-MART',
    name: shopName,
    type: 'warehouse',
    shopType: shopType,
    address: address,
    coordinates: { lat, lon },
    mapVerified: true,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    ownerEmail: email,
    ownerName: name,
    phone: phone,
    subscriptionDuration: '6_months',
    subscriptionPlanLabel: '6 Months',
    subscriptionPrice: 2499,
    subscriptionStartDate: startDate.toISOString(),
    subscriptionEndDate: endDate.toISOString(),
    active: true,
  }, { merge: true })
  console.log('Created location document:', locId)

  // 3. Create User document
  await db.collection('users').doc(uid).set({
    email,
    name,
    role,
    phone,
    assignedLocationIds: [locId],
    shopName,
    shopType,
    shopLocationId: locId,
    verifiedAddress: address,
    coordinates: { lat, lon },
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    subscriptionDuration: '6_months',
    subscriptionPlanLabel: '6 Months',
    subscriptionPrice: 2499,
    subscriptionStartDate: startDate.toISOString(),
    subscriptionEndDate: endDate.toISOString(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  console.log('Created user document:', uid)

  console.log('SUCCESS: Random shop account created successfully!')
  console.log(JSON.stringify({
    loginEmail: email,
    loginPassword: password,
    ownerName: name,
    ownerPhone: phone,
    shopName: shopName,
    shopCategory: 'Supermarket / Mart',
    verifiedLocation: address,
    subscriptionPlan: '6 Months (₹2,499)',
    validUntil: endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }, null, 2))

  process.exit(0)
}

createShop().catch((err) => {
  console.error('Failed to create shop:', err)
  process.exit(1)
})
