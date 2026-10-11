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

// Haversine distance calculator in kilometers
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

// Extract valid latitude and longitude coordinates
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

  // Navigation tabs: 'search' (Buy), 'incoming' (Sell), 'outgoing' (My Orders)
  const [activeTab, setActiveTab] = useState('search')

  // Search state
  const [queryText, setQueryText] = useState('')
  const [maxDistance, setMaxDistance] = useState(0) // 0 = All partner shops
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  // Orders state
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Order modal state
  const [selectedItem, setSelectedItem] = useState(null)
  const [purchaseQty, setPurchaseQty] = useState(1)
  const [urgencyNote, setUrgencyNote] = useState('')
  const [buyingBusy, setBuyingBusy] = useState(false)
  const [completedOrder, setCompletedOrder] = useState(null)

  // Action busy tracking
  const [actionBusyId, setActionBusyId] = useState(null)

  // Effective active location with solid profile/locations fallback
  const effectiveLocation = useMemo(() => {
    if (activeLocation) return activeLocation
    const shopId = profile?.shopLocationId || profile?.assignedLocationIds?.[0]
    return {
      id: shopId || 'SHOP_DEFAULT',
      name: profile?.shopName || 'Your Shop',
      phone: profile?.phone || '',
      address: profile?.address || '',
    }
  }, [activeLocation, profile])

  // Current shop coordinates for distance sorting
  const currentCoords = useMemo(() => {
    const fromShop = extractCoords(effectiveLocation)
    if (fromShop) return fromShop
    const fromProfile = extractCoords(profile)
    if (fromProfile) return fromProfile
    return { lat: 18.6280, lon: 73.8710 } // default coordinate fallback
  }, [effectiveLocation, profile])

  // Load available emergency stock from other associated shops
  const loadSearch = async () => {
    setLoading(true)
    try {
      const data = await searchEmergencyStock({
        queryText,
        userLocationId: effectiveLocation?.id || '',
      })
      setResults(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('Error searching emergency stock:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Load emergency orders involving this shop
  const loadOrders = async () => {
    const locId = effectiveLocation?.id
    if (!locId) {
      setOrders([])
      return
    }
    setOrdersLoading(true)
    try {
      const list = await listEmergencyOrders(locId)
      setOrders(Array.isArray(list) ? list : [])
    } catch (err) {
      console.warn('Error loading emergency orders:', err)
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'search') {
      loadSearch()
    } else {
      loadOrders()
    }
  }, [activeTab, queryText, effectiveLocation?.id])

  // Filter and sort search results by distance
  const filteredResults = useMemo(() => {
    return results
      .map((item) => {
        let dist = null
        const sCoords = extractCoords(item.sellerCoordinates ? { coordinates: item.sellerCoordinates } : item)
        if (sCoords && currentCoords) {
          dist = getDistanceKm(currentCoords.lat, currentCoords.lon, sCoords.lat, sCoords.lon)
        }
        return { ...item, distanceKm: dist }
      })
      .filter((item) => {
        if (maxDistance === 0) return true
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

  // Incoming requests (Other shops wanting to buy from me at emergency price)
  const incomingOrders = useMemo(() => {
    const locId = effectiveLocation?.id
    return orders.filter((o) => o.sellerLocationId === locId)
  }, [orders, effectiveLocation?.id])

  // Outgoing requests (Requests I sent to buy from other shops at emergency price)
  const outgoingOrders = useMemo(() => {
    const locId = effectiveLocation?.id
    return orders.filter((o) => o.buyerLocationId === locId)
  }, [orders, effectiveLocation?.id])

  const pendingIncomingCount = useMemo(() => {
    return incomingOrders.filter((o) => o.status === 'requested').length
  }, [incomingOrders])

  // Buyer submits purchase request
  const handlePurchase = async () => {
    if (!selectedItem) return
    const loc = effectiveLocation
    const qty = parseInt(purchaseQty, 10)
    if (!(qty > 0) || qty > selectedItem.qty) {
      return toast.err(`Please enter a quantity between 1 and ${selectedItem.qty}.`)
    }

    setBuyingBusy(true)
    try {
      const orderId = await createEmergencyOrder({
        buyerLocationId: loc.id,
        buyerShopName: loc.name || 'Partner Store',
        buyerEmail: profile?.email || '',
        buyerPhone: loc.phone || profile?.phone || '',
        sellerLocationId: selectedItem.sellerLocationId,
        sellerShopName: selectedItem.sellerShopName,
        sellerEmail: selectedItem.sellerEmail || '',
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
        sellerOwnerName: selectedItem.sellerOwnerName,
        sellerAddress: selectedItem.sellerAddress,
        sellerPhone: selectedItem.sellerPhone,
        notes: urgencyNote,
      }

      setCompletedOrder(completed)
      setSelectedItem(null)
      toast.ok(`Emergency request sent to ${selectedItem.sellerShopName}!`)
      loadOrders()
    } catch (err) {
      toast.err(err.message || 'Failed to submit emergency purchase request.')
    } finally {
      setBuyingBusy(false)
    }
  }

  // Seller accepts incoming request and deducts stock from inventory
  const handleAcceptOrder = async (order) => {
    if (!order) return
    setActionBusyId(order.id)
    try {
      await acceptEmergencyOrder({
        orderId: order.id,
        sellerEmail: profile?.email || '',
      })
      toast.ok(`Order accepted! Stock deducted and reserved for ${order.buyerShopName}.`)
      loadOrders()
      loadSearch()
    } catch (err) {
      console.error('Error accepting emergency order:', err)
      toast.err(err.message || 'Failed to accept emergency request.')
    } finally {
      setActionBusyId(null)
    }
  }

  // Seller declines request
  const handleRejectOrder = async (order) => {
    if (!order) return
    const reason = 'Out of stock / reserved for walk-in customer'

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

  // Buyer confirms receipt into own store inventory
  const handleReceiveStock = async (order) => {
    if (!order) return
    const loc = effectiveLocation

    setActionBusyId(order.id)
    try {
      await receiveEmergencyOrder({
        orderId: order.id,
        buyerEmail: profile?.email || '',
      })
      toast.ok(`Stock received! ${order.qty} units added to ${loc.name} inventory.`)
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
            <h1 style={{ margin: 0 }}>Emergency Stock</h1>
            <span className="badge sm" style={{ background: '#ef4444', color: '#fff', fontWeight: 700 }}>
              ⚡ Inter-Shop Network
            </span>
          </div>
          <div className="sub">
            Associated shops inter-store emergency network — one shopkeeper searches for products required, and partner shopkeepers sell at special emergency wholesale prices.
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
              🤝 Associated Shops Peer-to-Peer Emergency Network
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
            <span><b>1. Search Required Product:</b> Find needed stock across partner shops.</span>
          </div>
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🏷️</span>
            <span><b>2. Emergency Wholesale Price:</b> Buy at discounted inter-shop rates.</span>
          </div>
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🤝</span>
            <span><b>3. Shopkeeper-to-Shopkeeper:</b> Seller accepts &amp; stock transfers directly.</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="row" style={{ gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button
          className={`btn ${activeTab === 'search' ? 'primary' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          🔍 Search Required Stock ({filteredResults.length} Available)
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
        <button
          className={`btn ${activeTab === 'outgoing' ? 'primary' : ''}`}
          onClick={() => setActiveTab('outgoing')}
        >
          📤 My Purchase Orders ({outgoingOrders.length})
        </button>
      </div>

      {/* TAB 1: Search & Buy (Products I Need) */}
      {activeTab === 'search' && (
        <>
          {/* Search Controls */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row spread wrap" style={{ gap: 12 }}>
              <div className="row" style={{ flex: 1, minWidth: 260, gap: 10 }}>
                <input
                  className="input"
                  placeholder="Search product name, SKU, barcode, or category…"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Distance Filter & Refresh */}
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

          {/* Results Table */}
          <div className="card">
            <div className="row spread" style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Available Emergency Stock in Partner Shops</h3>
              <span className="muted" style={{ fontSize: 13 }}>
                {filteredResults.length} matching item(s) found
              </span>
            </div>

            {loading ? (
              <div className="empty">Searching associated network for emergency stock…</div>
            ) : filteredResults.length === 0 ? (
              <div className="empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>No matching emergency stock found in partner shops</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  When other associated shops add products with an Emergency Price, they will appear here immediately for purchase.
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
                            {item.sellerOwnerName && (
                              <div className="faint" style={{ fontSize: 11.5, marginTop: 1 }}>
                                Owner: <b>{item.sellerOwnerName}</b>
                              </div>
                            )}
                            <div className="row" style={{ gap: 6, marginTop: 3, alignItems: 'center' }}>
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

      {/* TAB 2: Incoming Requests (Sell to Partner Shops) */}
      {activeTab === 'incoming' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0 }}>Incoming Emergency Requests from Partner Shops</h3>
              <div className="sub">
                Requests from neighboring associated stores needing emergency stock from your shop at your Emergency Price
              </div>
            </div>
            <button className="btn sm" onClick={loadOrders} disabled={ordersLoading}>
              🔄 Refresh
            </button>
          </div>

          {ordersLoading ? (
            <div className="empty">Loading incoming requests…</div>
          ) : incomingOrders.length === 0 ? (
            <div className="empty" style={{ padding: '36px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📥</div>
              <div style={{ fontWeight: 600 }}>No incoming emergency requests</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                When another associated shop requests emergency products from your store, they will appear here for you to fulfill.
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Date &amp; ID</th>
                    <th>Product Requested</th>
                    <th>Requesting Associated Shop</th>
                    <th>Quantity</th>
                    <th>Unit Emergency Price</th>
                    <th>Total Bill</th>
                    <th>Status &amp; Action</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingOrders.map((o) => (
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
                          <div className="row" style={{ gap: 6 }}>
                            <button
                              className="btn primary sm"
                              disabled={actionBusyId === o.id}
                              onClick={() => handleAcceptOrder(o)}
                              style={{ background: '#22c55e', borderColor: '#22c55e', fontWeight: 700 }}
                            >
                              {actionBusyId === o.id ? 'Fulfilling…' : '✅ Accept & Sell'}
                            </button>
                            <button
                              className="btn sm"
                              disabled={actionBusyId === o.id}
                              onClick={() => handleRejectOrder(o)}
                              style={{ color: '#ef4444' }}
                            >
                              ✕ Decline
                            </button>
                          </div>
                        )}
                        {o.status === 'accepted' && (
                          <span className="badge sm green" style={{ fontWeight: 700 }}>
                            ✓ Stock Deducted &amp; Reserved
                          </span>
                        )}
                        {o.status === 'completed' && (
                          <span className="badge sm info" style={{ fontWeight: 700 }}>
                            📦 Fulfilled &amp; Received
                          </span>
                        )}
                        {o.status === 'rejected' && (
                          <div>
                            <span className="badge sm muted">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Outgoing Orders (My Purchases from Other Shops) */}
      {activeTab === 'outgoing' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0 }}>My Emergency Purchases &amp; Orders</h3>
              <div className="sub">
                Emergency purchase requests you sent to other associated partner shops
              </div>
            </div>
            <button className="btn sm" onClick={loadOrders} disabled={ordersLoading}>
              🔄 Refresh
            </button>
          </div>

          {ordersLoading ? (
            <div className="empty">Loading your orders…</div>
          ) : outgoingOrders.length === 0 ? (
            <div className="empty" style={{ padding: '36px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📤</div>
              <div style={{ fontWeight: 600 }}>No emergency orders placed yet</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Search for products required by your store to place an emergency purchase request.
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Date &amp; ID</th>
                    <th>Product &amp; SKU</th>
                    <th>Selling Partner Shop</th>
                    <th>Quantity</th>
                    <th>Unit Emergency Price</th>
                    <th>Total Bill</th>
                    <th>Status &amp; Action</th>
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
                        <span className="mono faint" style={{ fontSize: 11 }}>{o.sku}</span>
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
                            ⏳ Waiting for Seller Approval
                          </span>
                        )}
                        {o.status === 'accepted' && (
                          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                            <span className="badge sm green" style={{ fontWeight: 600 }}>
                              ✓ Approved by Seller
                            </span>
                            <button
                              className="btn primary sm"
                              disabled={actionBusyId === o.id}
                              onClick={() => handleReceiveStock(o)}
                              style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 700 }}
                            >
                              {actionBusyId === o.id ? 'Receiving…' : '📦 Confirm Receipt'}
                            </button>
                          </div>
                        )}
                        {o.status === 'completed' && (
                          <span className="badge sm info" style={{ fontWeight: 700 }}>
                            ✓ In Your Inventory
                          </span>
                        )}
                        {o.status === 'rejected' && (
                          <div>
                            <span className="badge sm muted">✕ Declined</span>
                            {o.rejectReason && (
                              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                                {o.rejectReason}
                              </div>
                            )}
                          </div>
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
              Send an instant emergency purchase request to <b>{selectedItem.sellerShopName}</b> at their special Emergency Price. Once accepted by the partner shopkeeper, the stock will be deducted from their store and transferred to your shop.
            </div>

            {/* Product & Seller Details */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{selectedItem.productName}</div>
              <div className="row spread" style={{ marginTop: 6, fontSize: 12.5 }}>
                <span className="faint">Selling Shop:</span>
                <b>{selectedItem.sellerShopName}</b>
              </div>
              {selectedItem.sellerOwnerName && (
                <div className="row spread" style={{ marginTop: 4, fontSize: 12.5 }}>
                  <span className="faint">Shopkeeper:</span>
                  <b>{selectedItem.sellerOwnerName}</b>
                </div>
              )}
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

            {/* Total Calculation */}
            <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <div className="row spread" style={{ alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Emergency Bill</div>
                  <div className="faint" style={{ fontSize: 11 }}>{purchaseQty || 0} units @ ₹{selectedItem.emergencyPrice.toFixed(2)}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>
                  ₹{((parseInt(purchaseQty, 10) || 0) * selectedItem.emergencyPrice).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Urgency Note */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Urgency Note for Seller (Optional)</label>
              <input
                className="input"
                placeholder="e.g. Out of stock on counter, customer waiting, need 5 units urgently"
                value={urgencyNote}
                onChange={(e) => setUrgencyNote(e.target.value)}
              />
            </div>

            {/* Modal Actions */}
            <div className="row spread" style={{ gap: 10 }}>
              <button className="btn" onClick={() => setSelectedItem(null)} disabled={buyingBusy}>
                Cancel
              </button>
              <button className="btn primary" onClick={handlePurchase} disabled={buyingBusy}>
                {buyingBusy ? 'Sending Request…' : '🚀 Send Emergency Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Confirmation Toast Modal */}
      {completedOrder && (
        <div className="modal-backdrop" onClick={() => setCompletedOrder(null)}>
          <div className="modal card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>🎉</div>
              <h3 style={{ margin: 0, color: '#22c55e' }}>Emergency Request Sent!</h3>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Your request has been delivered to <b>{completedOrder.sellerShopName}</b>. Once accepted by the shopkeeper, the stock will be reserved for you.
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              <div className="row spread">
                <span className="faint">Product:</span>
                <b>{completedOrder.productName}</b>
              </div>
              <div className="row spread" style={{ marginTop: 4 }}>
                <span className="faint">Quantity:</span>
                <b>{completedOrder.qty} units</b>
              </div>
              <div className="row spread" style={{ marginTop: 4 }}>
                <span className="faint">Emergency Rate:</span>
                <span>₹{completedOrder.emergencyPrice.toFixed(2)}</span>
              </div>
              <div className="row spread" style={{ marginTop: 4, fontWeight: 700 }}>
                <span>Total Amount:</span>
                <span style={{ color: '#22c55e' }}>₹{completedOrder.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setCompletedOrder(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
