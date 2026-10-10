import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAlerts } from '../lib/AlertsContext'
import { stockByLocation } from '../lib/api'
import NearbyShopsMap from '../components/NearbyShopsMap'
import AssociatedShopsTable from '../components/AssociatedShopsTable'

export default function Dashboard() {
  const { profile, locations, myLocationIds } = useAuth()
  const { activeLocation } = useWorkspace()
  const { alerts, counts, batches } = useAlerts()
  const [totals, setTotals] = useState({})

  useEffect(() => {
    stockByLocation(myLocationIds.length ? myLocationIds : null).then(setTotals).catch(() => setTotals({}))
  }, [myLocationIds.join(',')])

  const unitsInStock = Object.values(totals).reduce((s, n) => s + (n || 0), 0)
  const alertLocs = {}
  for (const a of alerts) { /* per-location alert flags not tracked here */ }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Welcome back{profile?.name ? `, ${profile.name}` : ''}</h1>
          <div className="sub">{activeLocation ? activeLocation.name : 'Your shop workspace'}</div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Stat label="Units in stock" value={unitsInStock.toLocaleString()} />
        <Stat label="Active alerts" value={counts.total} tint={counts.urgent ? 'tint-red' : 'tint-amber'} />
        <Stat label="Expiry alerts" value={counts.expiry} />
        <Stat label="Low stock" value={counts.lowStock} />
      </div>

      {counts.expiry > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 8,
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 14 }}>
                {counts.expiry} Product Batch(es) Expiring Soon in {activeLocation?.name || 'Your Shop'}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                Account Holder: <b>{activeLocation?.ownerName || profile?.name || 'Account Holder'}</b>
                {(activeLocation?.ownerPhone || profile?.phone) && (
                  <span> · Mobile: <b className="mono">{activeLocation?.ownerPhone || profile?.phone}</b></span>
                )}
              </div>
            </div>
          </div>
          <Link
            to="/near-expiry"
            className="btn sm"
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
            }}
          >
            ✉️ Send Expiry SMS to Account Holder
          </Link>
        </div>
      )}

      <div className="card">
        <div className="row spread" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Associated Shops in Your Area</h3>
          <span className="badge sm purple">10 km Network Mesh</span>
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>
          Connected partner shops within 10 km radius of your location linked via an active network mesh.
        </div>
        <NearbyShopsMap locations={locations} currentShop={activeLocation} currentProfile={profile} />
      </div>

      <AssociatedShopsTable locations={locations} currentShop={activeLocation} currentProfile={profile} />
    </div>
  )
}

function Stat({ label, value, tint }) {
  return (
    <div className={`card stat ${tint || ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}
