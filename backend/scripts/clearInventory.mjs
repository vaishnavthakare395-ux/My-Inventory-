import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  getDocs,
  deleteDoc,
  doc,
} from 'firebase/firestore'

const config = {
  apiKey: 'AIzaSyBhFlyOq0Ta97Yxi_ttDUs04ZPYiTCTXHE',
  authDomain: 'my-inventory-system-6094e.firebaseapp.com',
  projectId: 'my-inventory-system-6094e',
  storageBucket: 'my-inventory-system-6094e.firebasestorage.app',
  messagingSenderId: '378673395737',
  appId: '1:378673395737:web:2d24421fc4d3e1092f5288',
}

async function clearCollection(db, colName, label) {
  const colRef = collection(db, colName)
  const snap = await getDocs(colRef)
  console.log(`[${label}] Found ${snap.docs.length} documents in ${colName}`)
  for (const d of snap.docs) {
    await deleteDoc(doc(db, colName, d.id))
  }
  console.log(`[${label}] Cleared all ${snap.docs.length} documents from ${colName}`)
}

async function main() {
  // 1. Clear from Local Emulator if running
  try {
    const emuApp = initializeApp(config, 'emuApp')
    const emuDb = getFirestore(emuApp)
    connectFirestoreEmulator(emuDb, '127.0.0.1', 8080)
    console.log('--- Clearing from Local Firestore Emulator (127.0.0.1:8080) ---')
    await clearCollection(emuDb, 'batch_inventory', 'Emulator')
    await clearCollection(emuDb, 'products', 'Emulator')
  } catch (err) {
    console.warn('Emulator clear skipped or error:', err.message)
  }

  // 2. Clear from Cloud Firestore
  try {
    const cloudApp = initializeApp(config, 'cloudApp')
    const cloudDb = getFirestore(cloudApp)
    console.log('--- Clearing from Live Cloud Firestore (my-inventory-system-6094e) ---')
    await clearCollection(cloudDb, 'batch_inventory', 'Cloud')
    await clearCollection(cloudDb, 'products', 'Cloud')
  } catch (err) {
    console.warn('Cloud clear skipped or error:', err.message)
  }

  console.log('Done clearing all products and inventory.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
