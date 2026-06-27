import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'

const WorkspaceCtx = createContext(null)

const STORE_KEY = 'sf.activeLocation'

// Holds the warehouse the user is currently working in. Defaults to their first
// assigned location and is remembered across reloads.
export function WorkspaceProvider({ children }) {
  const { myLocations } = useAuth()
  const [activeLocationId, setActiveLocationId] = useState(
    () => localStorage.getItem(STORE_KEY) || ''
  )

  useEffect(() => {
    if (!myLocations.length) return
    const stillValid = myLocations.some((l) => l.id === activeLocationId)
    if (!stillValid) {
      const next = myLocations[0].id
      setActiveLocationId(next)
      localStorage.setItem(STORE_KEY, next)
    }
  }, [myLocations, activeLocationId])

  const setActive = (id) => {
    setActiveLocationId(id)
    localStorage.setItem(STORE_KEY, id)
  }

  const activeLocation = useMemo(
    () => myLocations.find((l) => l.id === activeLocationId) || null,
    [myLocations, activeLocationId]
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
