import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { useWorkspace } from './WorkspaceContext'
import { batchesAtLocation, getProductsBySkus } from './api'
import { buildAlerts, alertCounts } from './alerts'

const AlertsCtx = createContext(null)

// Loads the active location's live stock + product master and derives alerts.
// Pages reuse `batches` and `productsBySku` instead of refetching.
export function AlertsProvider({ children }) {
  const { user } = useAuth()
  const { activeLocationId } = useWorkspace()
  const [batches, setBatches] = useState([])
  const [productsBySku, setProductsBySku] = useState({})
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user || !activeLocationId) {
      setBatches([])
      setAlerts([])
      return
    }
    setLoading(true)
    try {
      const stock = await batchesAtLocation(activeLocationId)
      const products = await getProductsBySkus(stock.map((b) => b.sku))
      const bySku = {}
      for (const p of products) bySku[p.sku] = p
      setBatches(stock)
      setProductsBySku(bySku)
      setAlerts(buildAlerts(stock, bySku))
    } catch (err) {
      console.error('Could not load stock alerts:', err)
      setBatches([])
      setProductsBySku({})
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [user, activeLocationId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <AlertsCtx.Provider
      value={{ batches, productsBySku, alerts, counts: alertCounts(alerts), loading, refresh }}
    >
      {children}
    </AlertsCtx.Provider>
  )
}

export function useAlerts() {
  const ctx = useContext(AlertsCtx)
  if (!ctx) throw new Error('useAlerts must be used inside AlertsProvider')
  return ctx
}
