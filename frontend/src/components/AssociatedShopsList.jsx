import { useState, useMemo } from 'react'
import { SHOP_TYPES } from '../lib/constants'
import { getDistanceKm, extractCoords } from '../lib/geoMesh'
import { deleteStaffUser } from '../lib/api'
import { useToast } from '../lib/ToastContext'

export default function AssociatedShopsList({ locations = [], currentShop, currentProfile }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [deletingId, setDeletingId] = useState(null)
  const toast = useToast()

  const handleDeleteShop = async (shop) => {
    if (!window.confirm(`Are you sure you want to delete "${shop.name}" from the network?`)) return
    setDeletingId(shop.id)
    try {
      await deleteStaffUser({ locationId: shop.id, uid: shop.userId || shop.ownerId || shop.id })
      toast.ok(`Deleted "${shop.name}". Please refresh to update.`)
      window.location.reload()
    } catch (err) {
      toast.err('Failed to delete shop: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  // Extract reference coords for distance
  const currentCoords = useMemo(() => {
    const fromShop = extractCoords(currentShop)
    if (fromShop) return fromShop
    const fromProfile = extractCoords(currentProfile)
    if (fromProfile) return fromProfile
    const anyLoc = locations.find((l) => extractCoords(l) !== null)
    if (anyLoc) return extractCoords(anyLoc)
    return null
  }, [currentShop, currentProfile, locations])

  // Get readable label & icon for shop type
  const getShopTypeMeta = (typeId) => {
    const raw = (typeId || '').toLowerCase()
    const found = SHOP_TYPES.find((t) => t.id === raw || (raw === 'warehouse' && t.id === 'general_store'))
    if (found) return found
    if (raw.includes('pharm')) return { id: 'pharmacy', label: 'Pharmacy / Medical', icon: '💊' }
    if (raw.includes('mart') || raw.includes('super')) return { id: 'mart', label: 'Supermarket / Mart', icon: '🛒' }
    if (raw.includes('groc')) return { id: 'grocery', label: 'Grocery & Produce', icon: '🥦' }
    return { id: 'general_store', label: 'General Store', icon: '🏪' }
  }

  // Parse and enrich all associated shops
  const enrichedShops = useMemo(() => {
    return locations
      .filter((loc) => {
        // Must be active and associated with our network
        return (loc.ownerEmail || loc.mapVerified || loc.ownerName) && loc.active !== false
      })
      .map((loc) => {
        const coords = extractCoords(loc)
        const isCurrent =
          Boolean(currentShop?.id && loc.id === currentShop.id) ||
          Boolean(currentProfile?.shopLocationId && loc.id === currentProfile.shopLocationId) ||
          Boolean(
            loc.ownerEmail &&
            currentProfile?.email &&
            loc.ownerEmail.toLowerCase() === currentProfile.email.toLowerCase() &&
            loc.id === (currentShop?.id || currentProfile?.shopLocationId)
          )

        let distanceKm = null
        if (isCurrent) {
          distanceKm = 0
        } else if (currentCoords && coords) {
          distanceKm = getDistanceKm(currentCoords.lat, currentCoords.lon, coords.lat, coords.lon)
        }

        const typeMeta = getShopTypeMeta(loc.shopType || loc.type)
        const phone = loc.ownerPhone || loc.phone || ''
        const address = loc.address || loc.verifiedAddress || 'Address on record'

        const emailPrefix = loc.ownerEmail ? loc.ownerEmail.split('@')[0] : ''
        const cleanEmailName = emailPrefix
          ? (emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)).replace(/[0-9._-]+/g, ' ').replace(/\s+/g, ' ').trim()
          : ''
        const currentUserName = isCurrent ? (currentProfile?.name || currentProfile?.displayName || '') : ''

        const ownerName =
          (loc.registeredName && loc.registeredName !== 'Store Owner' ? loc.registeredName : '') ||
          (loc.ownerName && loc.ownerName !== 'Store Owner' ? loc.ownerName : '') ||
          currentUserName ||
          loc.contactPerson ||
          cleanEmailName ||
          (emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : '') ||
          'Registered Account'

        return {
          ...loc,
          isCurrent,
          distanceKm,
          typeMeta,
          phone,
          ownerName,
          address,
          coords,
        }
      })
      .filter((shop, idx, arr) => {
        // Deduplicate shops: keep only unique shops by (normalized name + owner email)
        const key = `${(shop.name || '').trim().toLowerCase()}__${(shop.ownerEmail || shop.phone || '').trim().toLowerCase()}`
        return arr.findIndex((s) => `${(s.name || '').trim().toLowerCase()}__${(s.ownerEmail || s.phone || '').trim().toLowerCase()}` === key) === idx
      })
      .sort((a, b) => {
        if (a.isCurrent) return -1
        if (b.isCurrent) return 1
        return (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999)
      })
  }, [locations, currentShop, currentProfile, currentCoords])

  // Filter based on search input and type filter
  const filteredShops = useMemo(() => {
    return enrichedShops.filter((shop) => {
      const matchType = typeFilter === 'ALL' || shop.typeMeta.id === typeFilter
      if (!matchType) return false

      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase().trim()
      const haystack = `${shop.name || ''} ${shop.address || ''} ${shop.ownerName || ''} ${shop.phone || ''} ${shop.ownerEmail || ''} ${shop.typeMeta.label || ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [enrichedShops, searchTerm, typeFilter])

  return (
    <div className="card" style={{ marginTop: 16 }}>
      {/* Header with Title and Search Controls */}
      <div className="row spread" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Associated Partner Stores</h3>
            <span className="badge green" style={{ fontSize: 11.5 }}>
              {enrichedShops.length} Registered Stores
            </span>
          </div>
          <div className="sub" style={{ marginTop: 4 }}>
            Directory of partner retail shops, supermarkets, and pharmacies associated with your network.
          </div>
        </div>

        {/* Filter controls */}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select
            className="select sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ minWidth: 150 }}
          >
            <option value="ALL">All Store Types</option>
            {SHOP_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="input sm"
            placeholder="Search by store, owner, city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 220 }}
          />
        </div>
      </div>

      {/* Directory Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', minWidth: 180 }}>Shop Name</th>
              <th style={{ textAlign: 'left', minWidth: 160 }}>Shop Type</th>
              <th style={{ textAlign: 'left', minWidth: 240 }}>Location &amp; Address</th>
              <th style={{ textAlign: 'left', minWidth: 160 }}>Registered Owner</th>
              <th style={{ textAlign: 'left', minWidth: 180 }}>Contact Details</th>
              <th style={{ textAlign: 'right', minWidth: 110 }}>Proximity</th>
              <th style={{ textAlign: 'center', minWidth: 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredShops.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '24px 16px' }} className="muted">
                  No associated partner shops match your search criteria.
                </td>
              </tr>
            ) : (
              filteredShops.map((shop) => (
                <tr key={shop.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* 1. Shop Name */}
                  <td style={{ verticalAlign: 'middle', padding: '12px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{shop.typeMeta.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                          {shop.name}
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 2 }}>
                          {shop.isCurrent ? (
                            <span className="badge sm purple" style={{ fontSize: 10, padding: '1px 6px' }}>
                              Current Store
                            </span>
                          ) : (
                            <span className="badge sm green" style={{ fontSize: 10, padding: '1px 6px' }}>
                              Verified Partner
                            </span>
                          )}
                          {shop.code && (
                            <span className="faint" style={{ fontSize: 11 }}>
                              #{shop.code}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 2. Shop Type */}
                  <td style={{ verticalAlign: 'middle', padding: '12px 10px' }}>
                    <span
                      className="badge sm"
                      style={{
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: '#6366f1',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '3px 8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      {shop.typeMeta.icon} {shop.typeMeta.label}
                    </span>
                  </td>

                  {/* 3. Location & Address */}
                  <td style={{ verticalAlign: 'middle', padding: '12px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ color: '#ef4444', fontSize: 14, marginTop: 1 }}>📍</span>
                      <div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.35, color: 'var(--fg)' }}>
                          {shop.address}
                        </div>
                        {shop.googleMapsUrl ? (
                          <a
                            href={shop.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 11,
                              color: 'var(--accent, #6366f1)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              marginTop: 3,
                              fontWeight: 500,
                            }}
                          >
                            🗺️ View on Google Maps ↗
                          </a>
                        ) : shop.coords ? (
                          <a
                            href={`https://www.google.com/maps?q=${shop.coords.lat},${shop.coords.lon}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 11,
                              color: 'var(--accent, #6366f1)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              marginTop: 3,
                              fontWeight: 500,
                            }}
                          >
                            🗺️ Open in Maps ↗
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  {/* 4. Registered Owner Name */}
                  <td style={{ verticalAlign: 'middle', padding: '12px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#059669',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12.5,
                          fontWeight: 700,
                          flexShrink: 0,
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        {(shop.ownerName || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg)' }}>
                          {shop.ownerName}
                        </div>
                        <div className="faint" style={{ fontSize: 10.5 }}>
                          Registered Member
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 5. Contact Details */}
                  <td style={{ verticalAlign: 'middle', padding: '12px 10px' }}>
                    <div>
                      {shop.phone ? (
                        <a
                          href={`tel:${shop.phone}`}
                          style={{
                            fontWeight: 600,
                            fontSize: 12.5,
                            color: 'var(--fg)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          📞 <span style={{ textDecoration: 'underline' }}>{shop.phone}</span>
                        </a>
                      ) : (
                        <span className="faint" style={{ fontSize: 12 }}>
                          No phone recorded
                        </span>
                      )}

                      {shop.ownerEmail && (
                        <div style={{ marginTop: 2 }}>
                          <a
                            href={`mailto:${shop.ownerEmail}`}
                            className="muted"
                            style={{
                              fontSize: 11,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            ✉️ {shop.ownerEmail}
                          </a>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 6. Proximity / Distance */}
                  <td style={{ verticalAlign: 'middle', padding: '12px 10px', textAlign: 'right' }}>
                    {shop.isCurrent ? (
                      <span className="badge sm purple" style={{ fontWeight: 700 }}>
                        Your Store
                      </span>
                    ) : shop.distanceKm != null ? (
                      <div>
                        <span
                          className={`badge sm ${shop.distanceKm <= 5 ? 'green' : shop.distanceKm <= 15 ? 'blue' : 'amber'}`}
                          style={{ fontWeight: 600 }}
                        >
                          {shop.distanceKm < 0.1 ? '< 0.1 km' : `${shop.distanceKm} km`}
                        </span>
                        <div className="faint" style={{ fontSize: 10, marginTop: 2 }}>
                          from your shop
                        </div>
                      </div>
                    ) : (
                      <span className="faint" style={{ fontSize: 11 }}>
                        Partner Network
                      </span>
                    )}
                  </td>

                  {/* 7. Action: Delete / Remove */}
                  <td style={{ verticalAlign: 'middle', padding: '12px 10px', textAlign: 'center' }}>
                    {!shop.isCurrent && (
                      <button
                        className="btn danger sm"
                        style={{ padding: '3px 8px', fontSize: 11.5 }}
                        disabled={deletingId === shop.id}
                        onClick={() => handleDeleteShop(shop)}
                        title="Delete this shop from the network"
                      >
                        {deletingId === shop.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
