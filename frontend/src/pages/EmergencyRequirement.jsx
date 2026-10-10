import { useState, useEffect, useMemo } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import {
  searchEmergencyStock,
  createEmergencyOrder,
  listEmergencyOrders,
  acceptEmergencyOrder,
  rejectEmergencyOrder,
  receiveEmergencyOrder,
} from '../lib/api'
import { formatExpiry } from '../lib/fefo'

// Distance calculator in km
function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return parseFloat((R * c).toFixed(1))
}

// Universal coordinate extractor supporting both lat/lng and coordinates.lat/lon
function extractCoords(loc) {
  if (!loc) return null
  const rawLat = loc.lat ?? loc.coordinates?.lat
  const rawLon = loc.lon ?? loc.lng ?? loc.coordinates?.lon ?? loc.coordinates?.lng
  if (rawLat == null || rawLon == null) return null
  const lat = parseFloat(rawLat)
  const lon = parseFloat(rawLon)
  if (isNaN(lat) || isNaN(lon)) return null
  return { lat, lon }
}

export default function EmergencyRequirement() {
  const { activeLocation } = useWorkspace()
  const { profile } = useAuth()
  const toast = useToast()

  // Tabs: 'search', 'outgoing', or 'incoming'
  const [activeTab, setActiveTab] = useState('search')

  // Search & Filter State
  const [queryText, setQueryText] = useState('')
  const [maxDistance, setMaxDistance] = useState(0) // Default to 0 (All partner shops across network)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  // Orders State
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Order Placement Modal
  const [selectedItem, setSelectedItem] = useState(null)
  const [purchaseQty, setPurchaseQty] = useState(1)
  const [urgencyNote, setUrgencyNote] = useState('')
  const [buyingBusy, setBuyingBusy] = useState(false)
  const [completedOrder, setCompletedOrder] = useState(null)

  // Actions busy tracking
  const [actionBusyId, setActionBusyId] = useState(null)

  // Current Shop Coordinates
  const currentCoords = useMemo(() => {
    const fromShop = extractCoords(activeLocation)
    if (fromShop) return fromShop

    const fromProfile = extractCoords(profile)
    if (fromProfile) return fromProfile

    return { lat: 28.4682, lon: 77.0864 } // default fallback
  }, [activeLocation, profile])

  // Load emergency products across partner shops
  const loadSearch = async () => {
    setLoading(true)
    try {
      const data = await searchEmergencyStock({
        queryText,
        userLocationId: activeLocation?.id || '',
      })
      setResults(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('Error searching emergency stock:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Load previous orders
  const loadOrders = async () => {
    if (!activeLocation?.id) {
      setOrders([])
      return
    }
    setOrdersLoading(true)
    try {
      const list = await listEmergencyOrders(activeLocation.id)
      setOrders(Array.isArray(list) ? list : [])
    } catch (err) {
      console.warn('Error loading emergency orders:', err)
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }

  useEffect(() => {
    loadSearch()
  }, [queryText, activeLocation?.id])

  useEffect(() => {
    if (activeTab === 'search') {
      loadSearch()
    } else {
      loadOrders()
    }
  }, [activeTab, activeLocation?.id])

  // Filter and sort search results by proximity
  const filteredResults = useMemo(() => {
    return results
      .map((item) => {
        let dist = null
        const sCoords = extractCoords(item.sellerCoordinates ? { coordinates: item.sellerCoordinates } : item)
        if (sCoords) {
          dist = getDistanceKm(
            currentCoords.lat,
            currentCoords.lon,
            sCoords.lat,
            sCoords.lon
          )
        }
        return { ...item, distanceKm: dist }
      })
      .filter((item) => {
        if (maxDistance === 0) return true // all distances
        if (item.distanceKm === null) return true
        return item.distanceKm <= maxDistance
      })
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0
        if (a.distanceKm === null) return 1
        if (b.distanceKm === null) return -1
        return a.distanceKm - b.distanceKm
      })
  }, [results, currentCoords, maxDistance])

  // Split orders into outgoing and incoming
  const outgoingOrders = useMemo(() => {
    return orders.filter((o) => o.buyerLocationId === activeLocation?.id)
  }, [orders, activeLocation?.id])

  const incomingOrders = useMemo(() => {
    return orders.filter((o) => o.sellerLocationId === activeLocation?.id)
  }, [orders, activeLocation?.id])

  const pendingIncomingCount = useMemo(() => {
    return incomingOrders.filter((o) => o.status === 'requested').length
  }, [incomingOrders])

  // Execute emergency purchase request
  const handlePurchase = async () => {
    if (!selectedItem || !activeLocation) return
    const qty = parseInt(purchaseQty, 10)
    if (!(qty > 0) || qty > selectedItem.qty) {
      return toast.err(`Please enter a quantity between 1 and ${selectedItem.qty}.`)
    }

    setBuyingBusy(true)
    try {
      const orderId = await createEmergencyOrder({
        buyerLocationId: activeLocation.id,
        buyerShopName: activeLocation.name,
        buyerEmail: profile?.email || '',
        buyerPhone: activeLocation.phone || profile?.phone || '',
        sellerLocationId: selectedItem.sellerLocationId,
        sellerShopName: selectedItem.sellerShopName,
        sellerEmail: selectedItem.sellerPhone ? `${selectedItem.sellerPhone}@partner` : '',
        sellerPhone: selectedItem.sellerPhone,
        sku: selectedItem.sku,
        productName: selectedItem.productName,
        batchId: selectedItem.batchId,
        batchNo: selectedItem.batchNo,
        expiryDate: selectedItem.expiryDate || '',
        qty,
        emergencyPrice: selectedItem.emergencyPrice,
        notes: urgencyNote,
      })

      const completed = {
        orderId,
        productName: selectedItem.productName,
        sku: selectedItem.sku,
        batchNo: selectedItem.batchNo,
        qty,
        emergencyPrice: selectedItem.emergencyPrice,
        totalAmount: qty * selectedItem.emergencyPrice,
        sellerShopName: selectedItem.sellerShopName,
        sellerAddress: selectedItem.sellerAddress,
        sellerPhone: selectedItem.sellerPhone,
        notes: urgencyNote,
      }

      setCompletedOrder(completed)
      setSelectedItem(null)
      toast.ok(`Emergency request sent to ${selectedItem.sellerShopName}!`)
      loadOrders()
    } catch (err) {
      toast.err(err.message || 'Failed to send emergency request.')
    } finally {
      setBuyingBusy(false)
    }
  }

  // Seller accepts incoming request
  const handleAcceptOrder = async (order) => {
    if (!order || !activeLocation) return
    if (!window.confirm(`Accept emergency request for ${order.qty} units of ${order.productName} and deduct from your inventory?`)) return

    setActionBusyId(order.id)
    try {
      await acceptEmergencyOrder({
        orderId: order.id,
        sellerEmail: profile?.email || '',
      })
      toast.ok(`Request accepted! Stock deducted and reserved for ${order.buyerShopName}.`)
      loadOrders()
      loadSearch()
    } catch (err) {
      console.error('Error accepting emergency order:', err)
      toast.err(err.message || 'Failed to accept emergency request.')
    } finally {
      setActionBusyId(null)
    }
  }

  // Seller declines incoming request
  const handleRejectOrder = async (order) => {
    if (!order) return
    const reason = window.prompt('Reason for declining this emergency request (optional):', 'Out of stock / reserved for counter customer')
    if (reason === null) return

    setActionBusyId(order.id)
    try {
      await rejectEmergencyOrder({
        orderId: order.id,
        reason,
        sellerEmail: profile?.email || '',
      })
      toast.ok('Emergency request declined.')
      loadOrders()
    } catch (err) {
      console.error('Error rejecting emergency order:', err)
      toast.err(err.message || 'Failed to decline emergency request.')
    } finally {
      setActionBusyId(null)
    }
  }

  // Buyer marks accepted stock as received into inventory
  const handleReceiveStock = async (order) => {
    if (!order || !activeLocation) return
    if (!window.confirm(`Confirm receipt of ${order.qty} units of ${order.productName} into ${activeLocation.name}? Stock will be added to your shop inventory.`)) return

    setActionBusyId(order.id)
    try {
      await receiveEmergencyOrder({
        orderId: order.id,
        buyerEmail: profile?.email || '',
      })
      toast.ok(`Stock received! ${order.qty} units added to your inventory.`)
      loadOrders()
    } catch (err) {
      console.error('Error receiving emergency order:', err)
      toast.err(err.message || 'Failed to receive emergency stock.')
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <h1 style={{ margin: 0 }}>Emergency Requirement</h1>
            <span className="badge sm" style={{ background: '#ef4444', color: '#fff', fontWeight: 700 }}>
              ⚡ Associated Shops Network
            </span>
          </div>
          <div className="sub">
            Inter-shop emergency marketplace — one shopkeeper searches for products required, and partner shopkeepers sell at special emergency wholesale prices.
          </div>
        </div>
      </div>

      {/* Network Explanation Banner */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          padding: '14px 18px',
          borderRadius: 10,
        }}
      >
        <div className="row spread wrap" style={{ gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--fg)' }}>
              🤝 Associated Shops Peer-to-Peer Emergency Marketplace
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, maxWidth: 680 }}>
              When your shop has an urgent stock shortage, search and source directly from other registered associated stores at their discounted <b>Emergency Price</b>.
            </div>
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="badge sm" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid #22c55e', fontWeight: 700 }}>
              🏪 Active Store: {activeLocation?.name || 'Your Shop'}
            </span>
          </div>
        </div>

        {/* 3 Step Workflow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <span><b>1. Search Required Product:</b> Find needed stock in partner shops.</span>
          </div>
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🏷️</span>
            <span><b>2. Emergency Wholesale Price:</b> Buy at discounted inter-shop rates.</span>
          </div>
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🤝</span>
            <span><b>3. Shopkeeper-to-Shopkeeper:</b> Seller fulfills &amp; transfers stock.</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="row" style={{ gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button
          className={`btn ${activeTab === 'search' ? 'primary' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          🔍 Search Required Stock ({filteredResults.length} in Network)
        </button>
        <button
          className={`btn ${activeTab === 'outgoing' ? 'primary' : ''}`}
          onClick={() => setActiveTab('outgoing')}
        >
          📤 My Emergency Purchases ({outgoingOrders.length})
        </button>
        <button
          className={`btn ${activeTab === 'incoming' ? 'primary' : ''}`}
          onClick={() => setActiveTab('incoming')}
          style={{ position: 'relative' }}
        >
          📥 Sell to Partner Shops ({incomingOrders.length}
          {pendingIncomingCount > 0 && (
            <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
              {pendingIncomingCount} new
            </span>
          )}
          )
        </button>
      </div>

      {/* Tab 1: Search & Buy */}
      {activeTab === 'search' && (
        <>
          {/* Search Controls */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row spread wrap" style={{ gap: 12 }}>
              <div className="row" style={{ flex: 1, minWidth: 260, gap: 10 }}>
                <input
                  className="input"
                  placeholder="Search product name, SKU, brand, or category…"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Proximity Filter */}
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span className="faint" style={{ fontSize: 12 }}>Distance:</span>
                {[
                  { label: 'All Shops', val: 0 },
                  { label: '≤ 10 km', val: 10 },
                  { label: '≤ 25 km', val: 25 },
                  { label: '≤ 50 km', val: 50 },
                ].map((d) => (
                  <button
                    key={d.val}
                    className={`btn sm ${maxDistance === d.val ? 'primary' : ''}`}
                    onClick={() => setMaxDistance(d.val)}
                    style={{ padding: '3px 8px', fontSize: 11.5 }}
                  >
                    {d.label}
                  </button>
                ))}
                {/* Refresh Stock Button */}
                <button
                  className="btn sm"
                  onClick={loadSearch}
                  disabled={loading}
                  title="Refresh Emergency Network Stock"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, marginLeft: 6 }}
                >
                  <span style={{ display: 'inline-block', transform: loading ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>🔄</span>
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>
          </div>

          {/* Results List */}
          <div className="card">
            <div className="row spread" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Available Emergency Stock in Partner Shops</h3>
              <span className="muted" style={{ fontSize: 13 }}>
                {filteredResults.length} matching item(s) found
              </span>
            </div>

            {loading ? (
              <div className="empty">Searching network for emergency stock…</div>
            ) : filteredResults.length === 0 ? (
              <div className="empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>No matching products found in partner shops</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Try a broader search term, increase the distance filter, or check back as partner shops register stock.
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Product Required &amp; Category</th>
                      <th>Selling Associated Shop &amp; Distance</th>
                      <th>Available Stock</th>
                      <th>Normal Retail</th>
                      <th>⚡ Emergency Price</th>
                      <th>Inter-Shop Savings</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((item) => {
                      const savings = item.sellingPrice > item.emergencyPrice
                        ? item.sellingPrice - item.emergencyPrice
                        : 0
                      const savingsPercent = item.sellingPrice > 0
                        ? Math.round((savings / item.sellingPrice) * 100)
                        : 0

                      return (
                        <tr key={item.batchId}>
                          {/* Product */}
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                              {item.productName}
                            </div>
                            <div className="row" style={{ gap: 6, marginTop: 2 }}>
                              <span className="mono faint" style={{ fontSize: 11.5 }}>
                                {item.sku}
                              </span>
                              <span className="badge sm muted">{item.category}</span>
                            </div>
                          </td>

                          {/* Seller Shop */}
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              🏪 {item.sellerShopName}
                            </div>
                            <div className="row" style={{ gap: 6, marginTop: 2, alignItems: 'center' }}>
                              {item.distanceKm !== null ? (
                                <span className="badge sm green" style={{ fontWeight: 700 }}>
                                  📍 {item.distanceKm} km away
                                </span>
                              ) : (
                                <span className="badge sm muted">Partner Network</span>
                              )}
                              {item.sellerPhone && (
                                <a
                                  href={`tel:${item.sellerPhone}`}
                                  style={{ fontSize: 11.5, color: 'var(--accent, #6366f1)', textDecoration: 'none' }}
                                >
                                  📞 {item.sellerPhone}
                                </a>
                              )}
                            </div>
                            <div className="faint" style={{ fontSize: 11, marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.sellerAddress}>
                              {item.sellerAddress || 'Verified address'}
                            </div>
                          </td>

                          {/* Qty */}
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                              {item.qty} <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>{item.unit}</span>
                            </div>
                            <div className="faint mono" style={{ fontSize: 11, marginTop: 2 }}>
                              Batch: {item.batchNo}
                            </div>
                          </td>

                          {/* Normal Price */}
                          <td>
                            <div className="muted" style={{ fontSize: 13, textDecoration: savings > 0 ? 'line-through' : 'none' }}>
                              ₹{item.sellingPrice.toFixed(2)}
                            </div>
                          </td>

                          {/* Emergency Price */}
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#22c55e' }}>
                              ₹{item.emergencyPrice.toFixed(2)}
                            </div>
                            <span className="faint" style={{ fontSize: 10.5 }}>Per unit</span>
                          </td>

                          {/* Savings */}
                          <td>
                            {savings > 0 ? (
                              <span className="badge sm green" style={{ fontWeight: 700 }}>
                                Save ₹{savings.toFixed(2)} ({savingsPercent}%)
                              </span>
                            ) : (
                              <span className="badge sm muted">At Par</span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td>
                            <button
                              className="btn primary sm"
                              onClick={() => {
                                setSelectedItem(item)
                                setPurchaseQty(1)
                                setUrgencyNote('')
                              }}
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}
                            >
                              <span>⚡ Buy at Emergency Price</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab 2: Outgoing Purchases / Requests */}
      {activeTab === 'outgoing' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0 }}>My Emergency Purchases &amp; Requests</h3>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                Requests sent to partner shops for emergency stock
              </div>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{outgoingOrders.length} orders placed</span>
          </div>

          {ordersLoading ? (
            <div className="empty">Loading orders…</div>
          ) : outgoingOrders.length === 0 ? (
            <div className="empty" style={{ padding: '36px 16px' }}>
              No emergency purchases placed yet. Search products in partner shops to buy urgently needed stock.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Date &amp; Order ID</th>
                    <th>Product &amp; SKU</th>
                    <th>Seller Shop</th>
                    <th>Quantity</th>
                    <th>Emergency Price</th>
                    <th>Total Bill</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {outgoingOrders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                          {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : 'Recent'}
                        </div>
                        <span className="mono faint" style={{ fontSize: 11 }}>#{o.id.slice(0, 8)}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.productName}</div>
                        <span className="mono faint" style={{ fontSize: 11 }}>{o.sku} · Batch {o.batchNo}</span>
                        {o.notes && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            💬 <i>"{o.notes}"</i>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>🏪 {o.sellerShopName}</div>
                        {o.sellerPhone && (
                          <div style={{ fontSize: 11.5, marginTop: 2 }}>
                            <a href={`tel:${o.sellerPhone}`} style={{ color: 'var(--accent, #6366f1)', textDecoration: 'none' }}>
                              📞 {o.sellerPhone}
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        <b>{o.qty} units</b>
                      </td>
                      <td>
                        ₹{Number(o.emergencyPrice).toFixed(2)}
                      </td>
                      <td>
                        <b style={{ color: '#22c55e', fontSize: 14 }}>₹{Number(o.totalAmount).toFixed(2)}</b>
                      </td>
                      <td>
                        {o.status === 'requested' && (
                          <span className="badge sm" style={{ background: '#f59e0b', color: '#fff', fontWeight: 600 }}>
                            ⏳ Requested (Awaiting Seller)
                          </span>
                        )}
                        {o.status === 'accepted' && (
                          <span className="badge sm" style={{ background: '#22c55e', color: '#fff', fontWeight: 600 }}>
                            ✓ Accepted · Ready
                          </span>
                        )}
                        {o.status === 'completed' && (
                          <span className="badge sm" style={{ background: '#3b82f6', color: '#fff', fontWeight: 600 }}>
                            📦 Stock Added to Shop
                          </span>
                        )}
                        {o.status === 'rejected' && (
                          <div>
                            <span className="badge sm" style={{ background: '#ef4444', color: '#fff', fontWeight: 600 }}>
                              ✕ Declined
                            </span>
                            {o.rejectReason && (
                              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                                {o.rejectReason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {o.status === 'accepted' ? (
                          <button
                            className="btn primary sm"
                            disabled={actionBusyId === o.id}
                            onClick={() => handleReceiveStock(o)}
                            style={{ background: '#22c55e', borderColor: '#22c55e', whiteSpace: 'nowrap' }}
                          >
                            {actionBusyId === o.id ? 'Receiving…' : '📥 Receive Stock'}
                          </button>
                        ) : o.status === 'requested' ? (
                          <span className="faint" style={{ fontSize: 11.5 }}>
                            Awaiting response
                          </span>
                        ) : o.status === 'completed' ? (
                          <span className="badge sm green">In Inventory</span>
                        ) : (
                          <span className="faint" style={{ fontSize: 11 }}>Declined</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Incoming Requests from other shops */}
      {activeTab === 'incoming' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0 }}>Incoming Emergency Requests from Other Shops</h3>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                Partner shops urgently requesting stock from your inventory
              </div>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{incomingOrders.length} requests received</span>
          </div>

          {ordersLoading ? (
            <div className="empty">Loading orders…</div>
          ) : incomingOrders.length === 0 ? (
            <div className="empty" style={{ padding: '36px 16px' }}>
              No emergency requests received from other shops yet.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Date &amp; Order ID</th>
                    <th>Requested Product</th>
                    <th>Buyer Shop &amp; Contact</th>
                    <th>Quantity</th>
                    <th>Emergency Price</th>
                    <th>Total Amount</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingOrders.map((o) => (
                    <tr key={o.id} style={o.status === 'requested' ? { background: 'rgba(245, 158, 11, 0.05)' } : {}}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                          {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : 'Recent'}
                        </div>
                        <span className="mono faint" style={{ fontSize: 11 }}>#{o.id.slice(0, 8)}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.productName}</div>
                        <span className="mono faint" style={{ fontSize: 11 }}>{o.sku} · Batch {o.batchNo}</span>
                        {o.notes && (
                          <div style={{ fontSize: 11.5, background: 'rgba(239, 68, 68, 0.08)', color: '#b91c1c', padding: '3px 6px', borderRadius: 4, marginTop: 4 }}>
                            ⚡ <b>Urgency Note:</b> {o.notes}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>🏪 {o.buyerShopName}</div>
                        {o.buyerPhone && (
                          <div style={{ fontSize: 11.5, marginTop: 2 }}>
                            <a href={`tel:${o.buyerPhone}`} style={{ color: 'var(--accent, #6366f1)', textDecoration: 'none' }}>
                              📞 {o.buyerPhone}
                            </a>
                          </div>
                        )}
                        {o.buyerEmail && <div className="faint" style={{ fontSize: 10.5 }}>{o.buyerEmail}</div>}
                      </td>
                      <td>
                        <b>{o.qty} units</b>
                      </td>
                      <td>
                        ₹{Number(o.emergencyPrice).toFixed(2)}
                      </td>
                      <td>
                        <b style={{ color: '#22c55e', fontSize: 14 }}>₹{Number(o.totalAmount).toFixed(2)}</b>
                      </td>
                      <td>
                        {o.status === 'requested' && (
                          <span className="badge sm" style={{ background: '#f59e0b', color: '#fff', fontWeight: 600 }}>
                            ⏳ Action Needed
                          </span>
                        )}
                        {o.status === 'accepted' && (
                          <span className="badge sm" style={{ background: '#22c55e', color: '#fff', fontWeight: 600 }}>
                            ✓ Stock Deducted &amp; Reserved
                          </span>
                        )}
                        {o.status === 'completed' && (
                          <span className="badge sm" style={{ background: '#3b82f6', color: '#fff', fontWeight: 600 }}>
                            📦 Fulfilled &amp; Collected
                          </span>
                        )}
                        {o.status === 'rejected' && (
                          <div>
                            <span className="badge sm" style={{ background: '#ef4444', color: '#fff', fontWeight: 600 }}>
                              ✕ Declined
                            </span>
                            {o.rejectReason && (
                              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                                {o.rejectReason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {o.status === 'requested' ? (
                          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <button
                              className="btn primary sm"
                              disabled={actionBusyId === o.id}
                              onClick={() => handleAcceptOrder(o)}
                              style={{ background: '#22c55e', borderColor: '#22c55e', whiteSpace: 'nowrap' }}
                            >
                              {actionBusyId === o.id ? 'Processing…' : '✓ Accept & Supply'}
                            </button>
                            <button
                              className="btn sm"
                              disabled={actionBusyId === o.id}
                              onClick={() => handleRejectOrder(o)}
                              style={{ color: '#ef4444', borderColor: '#ef4444', whiteSpace: 'nowrap' }}
                            >
                              ✕ Decline
                            </button>
                          </div>
                        ) : o.status === 'accepted' ? (
                          <span className="badge sm green">Stock Reserved</span>
                        ) : o.status === 'completed' ? (
                          <span className="badge sm info">Fulfilled</span>
                        ) : (
                          <span className="faint" style={{ fontSize: 11 }}>Declined</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Emergency Purchase Request Modal */}
      {selectedItem && (
        <div className="modal-backdrop" onClick={() => !buyingBusy && setSelectedItem(null)}>
          <div className="modal card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <h3 style={{ margin: 0, color: '#ef4444' }}>Buy at Emergency Price from Associated Shop</h3>
              </div>
              <button className="btn sm" onClick={() => !buyingBusy && setSelectedItem(null)}>✕</button>
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
              Send an instant emergency request to <b>{selectedItem.sellerShopName}</b> at their special Emergency Price. Once accepted by the partner shopkeeper, the stock will be deducted from their inventory and transferred to your shop.
            </div>

            {/* Product & Seller Details */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{selectedItem.productName}</div>
              <div className="row spread" style={{ marginTop: 6, fontSize: 12.5 }}>
                <span className="faint">Selling Shop:</span>
                <b>{selectedItem.sellerShopName}</b>
              </div>
              <div className="row spread" style={{ marginTop: 4, fontSize: 12.5 }}>
                <span className="faint">Proximity:</span>
                <span style={{ color: '#22c55e', fontWeight: 600 }}>
                  {selectedItem.distanceKm !== null ? `${selectedItem.distanceKm} km away` : 'Partner Network'}
                </span>
              </div>
              {selectedItem.sellerPhone && (
                <div className="row spread" style={{ marginTop: 4, fontSize: 12.5 }}>
                  <span className="faint">Seller Phone:</span>
                  <a href={`tel:${selectedItem.sellerPhone}`} style={{ color: 'var(--accent, #6366f1)', textDecoration: 'none' }}>
                    📞 {selectedItem.sellerPhone}
                  </a>
                </div>
              )}
              <div className="row spread" style={{ marginTop: 4, fontSize: 12.5 }}>
                <span className="faint">Seller Address:</span>
                <span style={{ maxWidth: 220, textAlign: 'right' }}>{selectedItem.sellerAddress}</span>
              </div>
            </div>

            {/* Price & Quantity Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div className="field">
                <label>Emergency Unit Price</label>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e', marginTop: 4 }}>
                  ₹{selectedItem.emergencyPrice.toFixed(2)}
                </div>
                <div className="faint" style={{ fontSize: 11 }}>Retail: ₹{selectedItem.sellingPrice.toFixed(2)}</div>
              </div>

              <div className="field">
                <label>Required Quantity (Max {selectedItem.qty}) *</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max={selectedItem.qty}
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
            </div>

            {/* Total Cost Calculation */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid #22c55e',
                marginBottom: 14,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Emergency Bill</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {purchaseQty || 0} units @ ₹{selectedItem.emergencyPrice.toFixed(2)}
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>
                ₹{((parseInt(purchaseQty, 10) || 0) * selectedItem.emergencyPrice).toFixed(2)}
              </div>
            </div>

            {/* Urgency Note */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Urgency Note / Pickup Instructions (optional)</label>
              <textarea
                className="input"
                rows="2"
                placeholder="e.g. Urgent customer at counter, will pick up in 15 mins."
                value={urgencyNote}
                onChange={(e) => setUrgencyNote(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="row end" style={{ gap: 8 }}>
              <button className="btn" disabled={buyingBusy} onClick={() => setSelectedItem(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={buyingBusy || !(parseInt(purchaseQty, 10) > 0) || parseInt(purchaseQty, 10) > selectedItem.qty}
                onClick={handlePurchase}
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
              >
                {buyingBusy ? 'Sending Request…' : '🚀 Send Emergency Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Order Receipt Modal */}
      {completedOrder && (
        <div className="modal-backdrop" onClick={() => setCompletedOrder(null)}>
          <div className="modal card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <h3 style={{ margin: 0, color: '#22c55e' }}>Emergency Request Sent!</h3>
              </div>
              <button className="btn sm" onClick={() => setCompletedOrder(null)}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
              Your emergency request has been sent to <b>{completedOrder.sellerShopName}</b>. Once accepted by the shopkeeper, the stock will be reserved for you.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div className="row spread">
                <span className="faint">Request ID:</span>
                <span className="mono">#{completedOrder.orderId.slice(0, 10)}</span>
              </div>
              <div className="row spread" style={{ marginTop: 6 }}>
                <span className="faint">Product:</span>
                <b>{completedOrder.productName}</b>
              </div>
              <div className="row spread" style={{ marginTop: 6 }}>
                <span className="faint">Quantity Requested:</span>
                <b>{completedOrder.qty} units</b>
              </div>
              <div className="row spread" style={{ marginTop: 6 }}>
                <span className="faint">Emergency Rate:</span>
                <span>₹{completedOrder.emergencyPrice.toFixed(2)}</span>
              </div>
              <div className="row spread" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span style={{ fontWeight: 600 }}>Total Payable:</span>
                <b style={{ color: '#22c55e', fontSize: 16 }}>₹{completedOrder.totalAmount.toFixed(2)}</b>
              </div>
              <div className="row spread" style={{ marginTop: 8 }}>
                <span className="faint">Requested From:</span>
                <b>{completedOrder.sellerShopName}</b>
              </div>
              {completedOrder.sellerPhone && (
                <div className="row spread" style={{ marginTop: 4 }}>
                  <span className="faint">Seller Phone:</span>
                  <a href={`tel:${completedOrder.sellerPhone}`} style={{ color: 'var(--accent, #6366f1)', textDecoration: 'none' }}>
                    📞 {completedOrder.sellerPhone}
                  </a>
                </div>
              )}
            </div>

            <div className="row end" style={{ gap: 8 }}>
              <button className="btn primary" onClick={() => setCompletedOrder(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
