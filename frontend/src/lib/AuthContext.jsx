import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  updatePassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import { getUser, listLocations } from './api'
import { setLocationNames } from './sheetSync'
import { ROLES } from './constants'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // firebase user
  const [profile, setProfile] = useState(null) // users/{uid} doc
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true)
      setUser(fbUser)
      try {
        if (fbUser) {
          let [p, locs] = await Promise.all([getUser(fbUser.uid), listLocations()])
          if (!p) {
            // Auto-provision user profile on first Google sign-in
            const emailLower = (fbUser.email || '').toLowerCase()
            const initialRole = emailLower.includes('admin')
              ? ROLES.ADMIN
              : emailLower.includes('cashier')
              ? ROLES.USER
              : ROLES.MANAGER

            const newProfile = {
              id: fbUser.uid,
              uid: fbUser.uid,
              email: fbUser.email || '',
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
              photoURL: fbUser.photoURL || '',
              role: initialRole,
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }
            try {
              await setDoc(doc(db, 'users', fbUser.uid), newProfile)
              p = newProfile
            } catch (createErr) {
              console.warn('Could not auto-provision user doc in Firestore:', createErr)
              p = newProfile
            }
          }
          setProfile(p)
          setLocations(locs)
          setLocationNames(Object.fromEntries(locs.map((l) => [l.id, l.name])))
        } else {
          setProfile(null)
          setLocations([])
          setLocationNames({})
        }
      } catch (err) {
        console.error('Could not load user profile:', err)
        setProfile(null)
        setLocations([])
        setLocationNames({})
      } finally {
        setLoading(false)
      }
    })
  }, [])

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password)
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    return signInWithPopup(auth, provider)
  }

  const register = async ({ email, password, name, phone, role = ROLES.MANAGER, shopName = '' }) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (name && cred.user) {
      await updateProfile(cred.user, { displayName: name }).catch(() => {})
    }

    const userDoc = {
      id: cred.user.uid,
      uid: cred.user.uid,
      email,
      name: name || email.split('@')[0],
      phone: phone || '',
      role,
      shopName: shopName || '',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(doc(db, 'users', cred.user.uid), userDoc)

    // If registering as store manager and shop name provided, auto-create initial shop location
    if (role === ROLES.MANAGER && shopName) {
      const locRef = doc(collection(db, 'locations'))
      await setDoc(locRef, {
        id: locRef.id,
        name: shopName,
        ownerEmail: email,
        ownerPhone: phone || '',
        phone: phone || '',
        active: true,
        mapVerified: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

    return cred
  }

  const logout = () => signOut(auth)
  const changePassword = (newPassword) => updatePassword(auth.currentUser, newPassword)

  const role = profile?.role
  // Admins and managers work across every location; plain users are limited to
  // the warehouses assigned to them (matches firestore.rules canAccessLocation).
  const allAccess = role === ROLES.ADMIN || role === ROLES.MANAGER
  const myLocationIds = allAccess ? locations.map((l) => l.id) : profile?.assignedLocationIds || []
  const myLocations = locations.filter((l) => myLocationIds.includes(l.id))

  const value = {
    user,
    profile,
    role,
    locations,
    myLocations,
    myLocationIds,
    loading,
    login,
    loginWithGoogle,
    register,
    logout,
    changePassword,
    isAdmin: role === ROLES.ADMIN,
    isManager: role === ROLES.MANAGER,
    canManage: role === ROLES.ADMIN || role === ROLES.MANAGER,
    canAddRemoveProducts: role !== ROLES.ADMIN && (role === ROLES.USER || role === ROLES.MANAGER),
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
