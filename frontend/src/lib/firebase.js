import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBhFlyOq0Ta97Yxi_ttDUs04ZPYiTCTXHE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'my-inventory-system-6094e.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'my-inventory-system-6094e',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'my-inventory-system-6094e.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '378673395737',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:378673395737:web:2d24421fc4d3e1092f5288',
}

export const app = initializeApp(config)
export const auth = getAuth(app)
export const db = getFirestore(app)

// Local development against the Firebase emulators when explicitly enabled.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
