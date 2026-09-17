import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth'
import { auth } from './firebase'
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
          const [p, locs] = await Promise.all([getUser(fbUser.uid), listLocations()])
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
