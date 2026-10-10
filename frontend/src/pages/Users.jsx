import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { listUsers, createStaffUser, listLocations, deleteStaffUser } from '../lib/api'
import { ROLES, ROLE_LABELS, SHOP_TYPES, SUBSCRIPTION_PLANS } from '../lib/constants'

const emptyForm = {
  email: '',
  password: '',
  name: '',
  phone: '',
  role: 'user',
  shopName: '',
  shopType: 'pharmacy',
  gstNumber: '',
  address: '',
  subscriptionPlan: '1_month',
  assignedLocationIds: [],
}

export default function Users() {
  const { locations, isAdmin, myLocationIds } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [allLocs, setAllLocs] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  // Google Maps verification state
  const [verifyingMap, setVerifyingMap] = useState(false)
  const [mapResult, setMapResult] = useState(null)
  const [notFound, setNotFound] = useState(false)

  const load = async () => {
    try {
      const [u, l] = await Promise.all([listUsers(), listLocations()])
      setRows(u)
      setAllLocs(l)
    } catch {
      setRows([])
    }
  }

  useEffect(() => { load() }, [])

  const locMap = Object.fromEntries(allLocs.map((l) => [l.id, l]))

  const verifyLocation = async () => {
    const query = form.address.trim()
    if (!query) return toast.err('Enter the shop location/address to verify.')
    setVerifyingMap(true)
    setMapResult(null)
    setNotFound(false)

    try {
      // Query OpenStreetMap Nominatim geocoder
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      if (res.ok) {
        const data = await res.json()
        if (data && data.length > 0) {
          const item = data[0]
          const lat = parseFloat(item.lat).toFixed(5)
          const lon = parseFloat(item.lon).toFixed(5)
          const gMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
          setMapResult({
            lat,
            lon,
            formattedAddress: item.display_name,
            googleMapsUrl: gMapsUrl,
            embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(item.lon) - 0.01}%2C${parseFloat(item.lat) - 0.01}%2C${parseFloat(item.lon) + 0.01}%2C${parseFloat(item.lat) + 0.01}&layer=mapnik&marker=${item.lat}%2C${item.lon}`,
          })
          setNotFound(false)
          toast.ok('Location verified on map!')
          return
        }
      }
      // If no result found in the selected area
      setMapResult(null)
      setNotFound(true)
      toast.err('The shop is not found in the area.')
    } catch (err) {
      setMapResult(null)
      setNotFound(true)
      toast.err('The shop is not found in the area.')
    } finally {
      setVerifyingMap(false)
    }
  }

  const create = async () => {
    if (!form.email || !form.password) return toast.err('User email and password are required.')
    if (form.password.length < 6) return toast.err('Password must be at least 6 characters.')
    if (!form.phone.trim()) return toast.err('Owner contact number is required.')
    if (!form.shopName.trim()) return toast.err('Shop name is required.')
    if (!form.address.trim()) return toast.err('Shop location/address is required.')
    if (!mapResult || !mapResult.lat) {
      setNotFound(true)
      return toast.err('The shop is not found in the area. Account cannot be created.')
    }

    const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === form.subscriptionPlan) || SUBSCRIPTION_PLANS[0]
    const startDate = new Date()
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + selectedPlan.months)

    setBusy(true)
    try {
      await createStaffUser({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim() || form.shopName.trim(),
        phone: form.phone.trim(),
        role: form.role,
        shopName: form.shopName.trim(),
        shopType: form.shopType,
        gstNumber: form.gstNumber.trim().toUpperCase(),
        address: mapResult.formattedAddress || form.address.trim(),
        coordinates: { lat: mapResult.lat, lon: mapResult.lon },
        googleMapsUrl: mapResult.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.address)}`,
        subscriptionDuration: selectedPlan.id,
        subscriptionPlanLabel: selectedPlan.label,
        subscriptionPrice: selectedPlan.price,
        subscriptionStartDate: startDate.toISOString(),
        subscriptionEndDate: endDate.toISOString(),
      })

      toast.ok(`Account created for ${form.shopName}! (${selectedPlan.label} subscription active)`)
      setForm(emptyForm)
      setMapResult(null)
      setNotFound(false)
      load()
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeAccount = async (u) => {
    const shopTitle = u.shopName || u.name || u.email
    if (!window.confirm(`Are you sure you want to delete the account for "${shopTitle}"?`)) return
    try {
      const locId = u.shopLocationId || (u.assignedLocationIds && u.assignedLocationIds[0])
      await deleteStaffUser({ uid: u.id, locationId: locId })
      toast.ok(`Removed account for ${shopTitle}.`)
      load()
    } catch (err) {
      toast.err('Could not delete account: ' + err.message)
    }
  }

  const shopTypeBadge = (typeId) => {
    const match = SHOP_TYPES.find((s) => s.id === typeId)
    return match ? `${match.icon} ${match.label}` : typeId || 'Shop'
  }

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === form.subscriptionPlan) || SUBSCRIPTION_PLANS[0]

  const formatFutureDate = (months) => {
    const d = new Date()
    d.setMonth(d.getMonth() + months)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>User &amp; Shop Onboarding</h1>
          <div className="sub">
            Onboard any shop (Pharmacy, General Store, Mart) with Google Maps verification. No pre-added products; each shop manages its own catalog.
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        {/* Onboarding Form */}
        <div className="card">
          <div className="row spread" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Onboard New Shop &amp; User</h3>
            <span className="badge green">Admin Access</span>
          </div>

          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Admins create user accounts and register the shop location. The shop owner will log in and add their own products.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* User Account Details */}
            <div style={{ background: 'var(--card-subtle, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--accent, #6366f1)' }}>
                1. User Account Credentials
              </div>
              <div className="field">
                <label>User Email (for login) *</label>
                <input
                  className="input"
                  type="email"
                  placeholder="e.g. owner@citymeds.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Temporary Password (min 6 chars) *</label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. Welcome@2026"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Owner / Manager Full Name</label>
                <input
                  className="input"
                  placeholder="e.g. Dr. Rajesh Gupta"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Owner Contact Number *</label>
                <input
                  className="input"
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            {/* Shop Details */}
            <div style={{ background: 'var(--card-subtle, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--accent, #6366f1)' }}>
                2. Shop Details &amp; Category
              </div>
              <div className="field">
                <label>Shop / Business Name *</label>
                <input
                  className="input"
                  placeholder="e.g. City Meds Pharmacy, Apex SuperMart"
                  value={form.shopName}
                  onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Kind of Shop (Shop Type) *</label>
                <select
                  className="select"
                  value={form.shopType}
                  onChange={(e) => setForm({ ...form, shopType: e.target.value })}
                >
                  {SHOP_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>GST Number / GSTIN (Printed on Bills)</label>
                <input
                  className="input mono"
                  placeholder="e.g. 07AAAAA0000A1Z5 (15-digit GSTIN)"
                  maxLength={15}
                  value={form.gstNumber}
                  onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            {/* Location & Google Maps Cross-Verification */}
            <div style={{ background: 'var(--card-subtle, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--accent, #6366f1)' }}>
                3. Shop Location &amp; Google Maps Verification
              </div>
              <div className="field">
                <label>Shop Location / Address *</label>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    placeholder="e.g. Shop 14, Main Market, Sector 18, Noida"
                    value={form.address}
                    onChange={(e) => {
                      setForm({ ...form, address: e.target.value })
                      setMapResult(null)
                      setNotFound(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        verifyLocation()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn primary sm"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={verifyLocation}
                    disabled={verifyingMap || !form.address.trim()}
                  >
                    {verifyingMap ? 'Verifying…' : '🔍 Verify on Map'}
                  </button>
                </div>
              </div>

              {/* Error: Shop Not Found in Area */}
              {notFound && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: '1px solid #ef4444',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 18 }}>❌</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>The shop is not found in the area</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      Account creation blocked. Please check the address or enter a valid area/landmark to cross-verify.
                    </div>
                  </div>
                </div>
              )}

              {/* Map Verification Result Box (Success) */}
              {mapResult && mapResult.lat && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'rgba(34, 197, 94, 0.06)',
                  }}
                >
                  <div className="row spread" style={{ alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--green, #22c55e)' }}>
                        ✓ Shop Location Verified on Map
                      </div>
                      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                        {mapResult.formattedAddress}
                      </div>
                      <div className="mono" style={{ fontSize: 11.5, marginTop: 4, color: 'var(--muted)' }}>
                        Lat: {mapResult.lat}, Lon: {mapResult.lon}
                      </div>
                    </div>
                    <a
                      href={mapResult.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn sm"
                      style={{ textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>Google Maps</span> ↗
                    </a>
                  </div>

                  {mapResult.embedUrl && (
                    <div style={{ marginTop: 8, borderRadius: 4, overflow: 'hidden', height: 160 }}>
                      <iframe
                        title="Shop Location Map Preview"
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        scrolling="no"
                        src={mapResult.embedUrl}
                        style={{ border: 0 }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subscription Plan & Duration */}
            <div style={{ background: 'var(--card-subtle, rgba(255,255,255,0.03))', padding: 12, borderRadius: 8 }}>
              <div className="row spread" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent, #6366f1)' }}>
                  4. Subscription Duration &amp; Pricing *
                </div>
                <span className="badge green sm">Billed Upfront</span>
              </div>

              <div className="grid cols-2" style={{ gap: 8, marginBottom: 10 }}>
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const isSelected = form.subscriptionPlan === plan.id
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setForm({ ...form, subscriptionPlan: plan.id })}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: isSelected ? '2px solid var(--accent, #6366f1)' : '1px solid var(--border)',
                        background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div className="row spread">
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{plan.label}</span>
                        {plan.badge && <span className="badge purple sm">{plan.badge}</span>}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: 'var(--accent, #6366f1)' }}>
                        {plan.currency}{plan.price.toLocaleString()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedPlan && (
                <div style={{ fontSize: 12, color: 'var(--muted)', background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: 4 }}>
                  Selected: <strong>{selectedPlan.label}</strong> ({selectedPlan.currency}{selectedPlan.price.toLocaleString()}) · Active from today until <strong>{formatFutureDate(selectedPlan.months)}</strong>
                </div>
              )}
            </div>

            {/* Zero-Product Slate Notice */}
            <div
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '8px 12px',
                borderRadius: 6,
                borderLeft: '3px solid var(--accent, #6366f1)',
              }}
            >
              <b>Clean Slate Policy:</b> Newly created shop accounts start with 0 products. The shop user will add their products and stock upon login.
            </div>

            <button
              className="btn primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '10px 0' }}
              disabled={busy || !form.email || !form.password || !form.shopName || !mapResult?.lat}
              onClick={create}
            >
              {busy ? 'Creating Shop Account…' : 'Create Shop Account'}
            </button>
          </div>
        </div>

        {/* Existing Users and Shops */}
        <div className="card">
          <div className="row spread" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Registered Shops &amp; Users</h3>
            <span className="muted" style={{ fontSize: 13 }}>{rows.length} accounts</span>
          </div>

          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Shop &amp; Category</th>
                  <th>Owner &amp; Contact</th>
                  <th>Subscription</th>
                  <th>Verified Location</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty">No user accounts created yet.</td>
                  </tr>
                )}
                {rows.map((u) => {
                  const locId = u.shopLocationId || (u.assignedLocationIds && u.assignedLocationIds[0])
                  const loc = locMap[locId] || {}
                  const shopName = u.shopName || loc.name || '—'
                  const shopType = u.shopType || loc.shopType || loc.type
                  const address = u.verifiedAddress || loc.address || '—'
                  const gMapsUrl = u.googleMapsUrl || loc.googleMapsUrl
                  const phone = u.phone || loc.phone
                  const planLabel = u.subscriptionPlanLabel || loc.subscriptionPlanLabel || (u.role === 'admin' ? 'Lifetime Admin' : '1 Month')
                  const planPrice = u.subscriptionPrice || loc.subscriptionPrice || 499

                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{shopName}</div>
                        <div style={{ fontSize: 11.5, marginTop: 2 }}>
                          <span className="badge sm muted">{shopTypeBadge(shopType)}</span>
                        </div>
                        {(u.gstNumber || loc.gstNumber) && (
                          <div className="mono faint" style={{ fontSize: 11, color: 'var(--accent, #6366f1)', marginTop: 3 }}>
                            GSTIN: {u.gstNumber || loc.gstNumber}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{u.name || '—'}</div>
                        <div className="mono faint" style={{ fontSize: 11.5 }}>{u.email}</div>
                        {phone && <div style={{ fontSize: 11.5, color: 'var(--accent, #6366f1)', marginTop: 2 }}>📞 {phone}</div>}
                      </td>
                      <td>
                        <span className={`badge sm ${u.role === 'admin' ? 'purple' : 'green'}`}>
                          {planLabel}
                        </span>
                        {u.role !== 'admin' && (
                          <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                            ₹{planPrice.toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="faint" style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={address}>
                          {address}
                        </div>
                        {gMapsUrl && (
                          <a
                            href={gMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: 'var(--accent, #6366f1)', display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 2 }}
                          >
                            <span>View on Map</span> ↗
                          </a>
                        )}
                      </td>
                      <td>
                        {u.role !== 'admin' && (
                          <button
                            className="btn danger sm"
                            onClick={() => removeAccount(u)}
                            title="Delete this shop account"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

