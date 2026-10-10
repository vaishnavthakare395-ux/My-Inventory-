import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'

const WorkspaceCtx = createContext(null)

const STORE_KEY = 'sf.activeLocation'

// Holds the warehouse the user is currently working in. Defaults to their first
// assigned location and is remembered across reloads.
export function WorkspaceProvider({ children }) {
  const { user, profile, myLocations, locations } = useAuth()
  const userShopId = profile?.shopLocationId || profile?.assignedLocationIds?.[0]
  const userKey = user?.uid ? `${STORE_KEY}_${user.uid}` : STORE_KEY

  const [activeLocationId, setActiveLocationId] = useState(
    () => localStorage.getItem(userKey) || userShopId || ''
  )

  useEffect(() => {
    // If the user has a specific assigned shop, ensure their active location defaults to their shop
    if (userShopId && (myLocations.some((l) => l.id === userShopId) || locations.some((l) => l.id === userShopId))) {
      const stored = localStorage.getItem(userKey)
      if (!stored || !myLocations.some((l) => l.id === stored)) {
        setActiveLocationId(userShopId)
        localStorage.setItem(userKey, userShopId)
        return
      }
    }

    if (!myLocations.length) return
    const stillValid = myLocations.some((l) => l.id === activeLocationId)
    if (!stillValid) {
      const next = userShopId && myLocations.some((l) => l.id === userShopId)
        ? userShopId
        : myLocations[0].id
      setActiveLocationId(next)
      localStorage.setItem(userKey, next)
    }
  }, [myLocations, activeLocationId, userShopId, userKey, locations])

  const setActive = (id) => {
    setActiveLocationId(id)
    localStorage.setItem(userKey, id)
  }

  const activeLocation = useMemo(
    () => myLocations.find((l) => l.id === activeLocationId) || locations.find((l) => l.id === activeLocationId) || null,
    [myLocations, locations, activeLocationId]
  )

  return (
    <WorkspaceCtx.Provider value={{ activeLocationId, activeLocation, setActive }}>
      {children}
    </WorkspaceCtx.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
