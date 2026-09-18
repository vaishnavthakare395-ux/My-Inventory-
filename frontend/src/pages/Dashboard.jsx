import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAlerts } from '../lib/AlertsContext'
import { stockByLocation } from '../lib/api'
import NearbyShopsMap from '../components/NearbyShopsMap'

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

      <div className="grid cols-2">
        <div className="card">
          <div className="row spread" style={{ marginBottom: 4 }}>
            <h3 style={{ margin: 0 }}>Associated Shops in Your Area</h3>
            <span className="badge sm purple">10 km Network</span>
          </div>
          <div className="sub" style={{ marginBottom: 12 }}>
            Connected partner shops within 10 km radius of your location.
          </div>
          <NearbyShopsMap locations={locations} currentShop={activeLocation} currentProfile={profile} />
        </div>

        <div className="card">
          <div className="row spread"><h3>Needs attention</h3><span className="faint" style={{ fontSize: 12 }}>{alerts.length} item(s)</span></div>
          <div className="bell-list" style={{ marginTop: 10, maxHeight: 360, overflowY: 'auto' }}>
            {alerts.length === 0 && <div className="empty">Nothing needs attention.</div>}
            {alerts.slice(0, 40).map((a, i) => (
              <div key={i} className={`bell-item sev-${a.severity}`}>
                <span className="sev-dot" />
                <span className="bell-msg">{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
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
