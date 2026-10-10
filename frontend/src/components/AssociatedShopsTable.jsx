import { useState, useMemo } from 'react'
import { SHOP_TYPES } from '../lib/constants'

export default function AssociatedShopsTable({ locations = [], currentShop, currentProfile }) {
  const [searchTerm, setSearchTerm] = useState('')

  const getShopTypeMeta = (typeId) => {
    const raw = (typeId || '').toLowerCase()
    const found = SHOP_TYPES.find((t) => t.id === raw || (raw === 'warehouse' && t.id === 'general_store'))
    if (found) return found
    if (raw.includes('pharm')) return { id: 'pharmacy', label: 'Pharmacy / Medical', icon: '💊' }
    if (raw.includes('mart') || raw.includes('super')) return { id: 'mart', label: 'Supermarket / Mart', icon: '🛒' }
    if (raw.includes('groc')) return { id: 'general_store', label: 'General Store / Kirana', icon: '🥦' }
    if (raw.includes('dairy')) return { id: 'dairy', label: 'Dairy & Milk Parlour', icon: '🥛' }
    if (raw.includes('bake')) return { id: 'bakery', label: 'Bakery & Confectionery', icon: '🍞' }
    return { id: 'general_store', label: 'General Store', icon: '🏪' }
  }

  // Filter and enrich associated shops (only admin registered shops, no mock accounts)
  const shops = useMemo(() => {
    return locations
      .filter((loc) => {
        if (!loc || loc.active === false) return false
        const email = (loc.ownerEmail || loc.email || '').toLowerCase()
        if (email.endsWith('@stockflow.dev') || email.endsWith('@stockflow.local')) return false

        const isExplicitAdminReg = loc.registeredByAdmin === true
        const isTargetShop =
          ['SHOP_GLOBAL_MART', 'SHOP_V_MART', 'SHOP_I_MART'].includes(loc.id) ||
          ['global mart', 'v mart', 'i mart'].includes((loc.name || '').toLowerCase().trim())
        const isShopPrefixed = Boolean(loc.id && loc.id.startsWith('SHOP_') && loc.registeredByAdmin !== false)

        return (isExplicitAdminReg || isTargetShop || isShopPrefixed) && Boolean(loc.name)
      })
      .map((loc) => {
        const isCurrent =
          Boolean(currentShop?.id && loc.id === currentShop.id) ||
          Boolean(currentProfile?.shopLocationId && loc.id === currentProfile.shopLocationId) ||
          Boolean(
            loc.ownerEmail &&
            currentProfile?.email &&
            loc.ownerEmail.toLowerCase() === currentProfile.email.toLowerCase()
          )

        const typeMeta = getShopTypeMeta(loc.shopType || loc.type)
        const address = loc.address || loc.verifiedAddress || 'Registered on network'
        const gMapsUrl =
          loc.googleMapsUrl ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || loc.name)}`

        const ownerName =
          (loc.registeredName && loc.registeredName !== 'Store Owner' ? loc.registeredName : '') ||
          (loc.ownerName && loc.ownerName !== 'Store Owner' ? loc.ownerName : '') ||
          loc.contactPerson ||
          (isCurrent ? (currentProfile?.name || '') : '') ||
          (loc.ownerEmail ? loc.ownerEmail.split('@')[0] : '') ||
          'Account Holder'

        return {
          ...loc,
          isCurrent,
          typeMeta,
          address,
          gMapsUrl,
          ownerName,
        }
      })
      .filter((loc, idx, arr) => {
        // Deduplicate by name and owner
        const key = `${(loc.name || '').trim().toLowerCase()}__${(loc.ownerName || loc.ownerEmail || '').trim().toLowerCase()}`
        return arr.findIndex((s) => `${(s.name || '').trim().toLowerCase()}__${(s.ownerName || s.ownerEmail || '').trim().toLowerCase()}` === key) === idx
      })
  }, [locations, currentShop, currentProfile])

  const filteredShops = useMemo(() => {
    if (!searchTerm.trim()) return shops
    const q = searchTerm.toLowerCase()
    return shops.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.ownerName && s.ownerName.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.typeMeta?.label && s.typeMeta.label.toLowerCase().includes(q))
    )
  }, [shops, searchTerm])

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row spread wrap" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Associated Shops</h3>
            <span className="badge sm green">{shops.length} Registered</span>
          </div>
          <div className="sub" style={{ marginTop: 2 }}>
            Directory of partner retail shops, supermarkets, and pharmacies associated with your network
          </div>
        </div>

        <input
          type="text"
          className="search"
          placeholder="Search by shop, account holder, location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: 320, minWidth: 220 }}
        />
      </div>

      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th style={{ width: '25%' }}>Shop Name</th>
              <th style={{ width: '25%' }}>Account Holder Name</th>
              <th style={{ width: '30%' }}>Location</th>
              <th style={{ width: '20%' }}>Type of Shop</th>
            </tr>
          </thead>
          <tbody>
            {filteredShops.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">
                  No associated shops found.
                </td>
              </tr>
            ) : (
              filteredShops.map((shop) => (
                <tr key={shop.id || shop.name}>
                  <td>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 18 }}>{shop.typeMeta.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{shop.name}</div>
                        {shop.isCurrent && (
                          <span className="badge sm purple" style={{ marginTop: 2, fontSize: 10.5 }}>
                            Your Shop
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    <div style={{ fontWeight: 500 }}>{shop.ownerName}</div>
                    {shop.ownerPhone && (
                      <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                        📞 {shop.ownerPhone}
                      </div>
                    )}
                    {shop.ownerEmail && (
                      <div className="mono faint" style={{ fontSize: 11, marginTop: 1 }}>
                        {shop.ownerEmail}
                      </div>
                    )}
                  </td>

                  <td>
                    <div style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--text)' }}>
                      {shop.address}
                    </div>
                    {shop.gMapsUrl && (
                      <a
                        href={shop.gMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 11.5,
                          color: 'var(--accent, #6366f1)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          marginTop: 3,
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        📍 View on Google Maps ↗
                      </a>
                    )}
                  </td>

                  <td>
                    <span className="badge sm muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>{shop.typeMeta.icon}</span>
                      <span>{shop.typeMeta.label}</span>
                    </span>
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
