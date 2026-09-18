import { useState, useEffect, useMemo } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { searchEmergencyStock, createEmergencyOrder, listEmergencyOrders } from '../lib/api'
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

export default function EmergencyRequirement() {
  const { activeLocation } = useWorkspace()
  const { profile } = useAuth()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('search') // search | outgoing | incoming
  const [queryText, setQueryText] = useState('')
  const [maxDistance, setMaxDistance] = useState(10) // default 10 km
  const [results, setResults] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Purchase modal
  const [selectedItem, setSelectedItem] = useState(null)
  const [purchaseQty, setPurchaseQty] = useState(1)
  const [urgencyNote, setUrgencyNote] = useState('')
  const [buyingBusy, setBuyingBusy] = useState(false)
  const [completedOrder, setCompletedOrder] = useState(null)

  // Current Shop Coordinates
  const currentCoords = useMemo(() => {
    if (activeLocation?.coordinates?.lat && activeLocation?.coordinates?.lon) {
      return {
        lat: parseFloat(activeLocation.coordinates.lat),
        lon: parseFloat(activeLocation.coordinates.lon),
      }
    }
    if (profile?.coordinates?.lat && profile?.coordinates?.lon) {
      return {
        lat: parseFloat(profile.coordinates.lat),
        lon: parseFloat(profile.coordinates.lon),
      }
    }
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
      setResults(data)
    } catch (err) {
      console.error('Error searching emergency stock:', err)
      toast.err('Failed to search emergency stock.')
    } finally {
      setLoading(false)
    }
  }

  // Load previous orders
  const loadOrders = async () => {
    if (!activeLocation?.id) return
    setOrdersLoading(true)
    try {
      const list = await listEmergencyOrders(activeLocation.id)
      setOrders(list)
    } catch (err) {
      console.error('Error loading emergency orders:', err)
    } finally {
      setOrdersLoading(false)
    }
  }

  useEffect(() => {
    loadSearch()
  }, [queryText, activeLocation?.id])

  useEffect(() => {
    if (activeTab !== 'search') {
      loadOrders()
    }
  }, [activeTab, activeLocation?.id])

  // Filter and sort search results by proximity
  const filteredResults = useMemo(() => {
    return results
      .map((item) => {
        let dist = null
        if (item.sellerCoordinates?.lat && item.sellerCoordinates?.lon) {
          dist = getDistanceKm(
            currentCoords.lat,
            currentCoords.lon,
            parseFloat(item.sellerCoordinates.lat),
            parseFloat(item.sellerCoordinates.lon)
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

  // Execute emergency purchase
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
      toast.ok(`Emergency purchase of ${qty} units completed!`)
      loadSearch()
      loadOrders()
    } catch (err) {
      toast.err(err.message || 'Emergency purchase failed.')
    } finally {
      setBuyingBusy(false)
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
              ⚡ Urgent Network
            </span>
          </div>
          <div className="sub">
            Search urgent products across associated partner shops &amp; buy at discounted emergency prices
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="row" style={{ gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button
          className={`btn ${activeTab === 'search' ? 'primary' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          🔍 Search &amp; Buy Emergency Stock
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
        >
          📥 Incoming Emergency Requests ({incomingOrders.length})
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
                {[5, 10, 25, 0].map((dist) => (
                  <button
                    key={dist}
                    className={`btn sm ${maxDistance === dist ? 'primary' : ''}`}
                    onClick={() => setMaxDistance(dist)}
                    style={{ padding: '3px 8px', fontSize: 11.5 }}
                  >
                    {dist === 0 ? 'All' : `≤ ${dist} km`}
                  </button>
                ))}
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
                      <th>Product &amp; Category</th>
                      <th>Partner Shop &amp; Distance</th>
                      <th>Available Stock</th>
                      <th>Normal Retail</th>
                      <th>Emergency Price</th>
                      <th>Savings</th>
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
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <span>⚡ Buy Emergency</span>
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

      {/* Tab 2: Outgoing Purchases */}
      {activeTab === 'outgoing' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>My Emergency Purchases</h3>
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
                    <th>Total Billed</th>
                    <th>Status</th>
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
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.sellerShopName}</div>
                        {o.sellerPhone && <div className="muted" style={{ fontSize: 11 }}>📞 {o.sellerPhone}</div>}
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
                        <span className="badge sm green">✓ {o.status || 'Completed'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Incoming Requests */}
      {activeTab === 'incoming' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Incoming Emergency Requests from Other Shops</h3>
            <span className="muted" style={{ fontSize: 13 }}>{incomingOrders.length} orders received</span>
          </div>

          {ordersLoading ? (
            <div className="empty">Loading orders…</div>
          ) : incomingOrders.length === 0 ? (
            <div className="empty" style={{ padding: '36px 16px' }}>
              No emergency purchases received from other shops yet.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Date &amp; Order ID</th>
                    <th>Purchased Product</th>
                    <th>Buyer Shop</th>
                    <th>Quantity Sold</th>
                    <th>Emergency Price</th>
                    <th>Amount Received</th>
                    <th>Status</th>
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
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.buyerShopName}</div>
                        {o.buyerPhone && <div className="muted" style={{ fontSize: 11 }}>📞 {o.buyerPhone}</div>}
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
                        <span className="badge sm green">✓ {o.status || 'Completed'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Emergency Purchase Modal */}
      {selectedItem && (
        <div className="modal-backdrop" onClick={() => !buyingBusy && setSelectedItem(null)}>
          <div className="modal card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <h3 style={{ margin: 0, color: '#ef4444' }}>Emergency Purchase Request</h3>
              </div>
              <button className="btn sm" onClick={() => !buyingBusy && setSelectedItem(null)}>✕</button>
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
                placeholder="e.g. Urgent customer at counter, picking up in 15 mins."
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
                {buyingBusy ? 'Processing Order…' : 'Confirm Emergency Purchase'}
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
                <h3 style={{ margin: 0, color: '#22c55e' }}>Emergency Purchase Confirmed</h3>
              </div>
              <button className="btn sm" onClick={() => setCompletedOrder(null)}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
              Your emergency procurement has been recorded and stock was reserved from the seller.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div className="row spread">
                <span className="faint">Order ID:</span>
                <span className="mono">#{completedOrder.orderId.slice(0, 10)}</span>
              </div>
              <div className="row spread" style={{ marginTop: 6 }}>
                <span className="faint">Product:</span>
                <b>{completedOrder.productName}</b>
              </div>
              <div className="row spread" style={{ marginTop: 6 }}>
                <span className="faint">Quantity Procured:</span>
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
                <span className="faint">Pickup From:</span>
                <b>{completedOrder.sellerShopName}</b>
              </div>
              {completedOrder.sellerPhone && (
                <div className="row spread" style={{ marginTop: 4 }}>
                  <span className="faint">Seller Contact:</span>
                  <a href={`tel:${completedOrder.sellerPhone}`} style={{ color: 'var(--accent, #6366f1)', textDecoration: 'none' }}>
                    📞 {completedOrder.sellerPhone}
                  </a>
                </div>
              )}
            </div>

            <div className="row end" style={{ gap: 8 }}>
              <button className="btn primary" onClick={() => setCompletedOrder(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
