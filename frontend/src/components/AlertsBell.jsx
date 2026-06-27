import { useState, useMemo } from 'react'
import { useAlerts } from '../lib/AlertsContext'

const SEEN_KEY = 'sf.seenAlerts'
const loadSeen = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}
const alertKey = (a) => `${a.kind}:${a.sku}:${a.batchNo}:${a.severity}`

export default function AlertsBell() {
  const { alerts, counts } = useAlerts()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(loadSeen)

  // Badge shows only alerts you haven't viewed yet.
  const unseen = useMemo(() => alerts.filter((a) => !seen.has(alertKey(a))), [alerts, seen])
  const unseenUrgent = unseen.some((a) => a.severity === 'critical' || a.severity === 'expired')

  const openPanel = () => {
    setOpen((v) => {
      const next = !v
      if (next) {
        const all = new Set(alerts.map(alertKey))
        setSeen(all)
        localStorage.setItem(SEEN_KEY, JSON.stringify([...all]))
      }
      return next
    })
  }

  return (
    <div className="bell-wrap">
      <button className="bell" onClick={openPanel} title={`${counts.total} active alerts`}>
        <BellIcon />
        {unseen.length > 0 && (
          <span className={`bell-count ${unseenUrgent ? 'urgent' : ''}`}>
            {unseen.length > 99 ? '99+' : unseen.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="bell-head">
              <strong>Alerts</strong>
              <span className="muted">{counts.lowStock} low · {counts.expiry} expiry</span>
            </div>
            <div className="bell-list">
              {alerts.length === 0 && <div className="empty">Nothing needs attention.</div>}
              {alerts.slice(0, 40).map((a, i) => (
                <div key={i} className={`bell-item sev-${a.severity}`}>
                  <span className="sev-dot" />
                  <span className="bell-msg">{a.message}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}
