import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAlerts } from '../lib/AlertsContext'
import { useToast } from '../lib/ToastContext'
import { listTransfers, acceptTransfer, transferItemKey } from '../lib/api'
import { TRANSFER_STATUS } from '../lib/constants'
import { formatExpiry } from '../lib/fefo'
import { FlowBadge } from '../components/StatusBadge'

export default function Receiving() {
  const { profile, locations } = useAuth()
  const { activeLocation } = useWorkspace()
  const { refresh } = useAlerts()
  const toast = useToast()

  const [incoming, setIncoming] = useState([])
  const [received, setReceived] = useState({}) // transferId -> { lineId: qty }
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    if (!activeLocation) return
    const rows = await listTransfers({
      toLocationId: activeLocation.id,
      incomingStatus: TRANSFER_STATUS.IN_TRANSIT,
    })
    setIncoming(rows)
    const seed = {}
    for (const t of rows) {
      seed[t.id] = {}
      for (const it of t.items) seed[t.id][transferItemKey(it)] = it.qty
    }
    setReceived(seed)
  }

  useEffect(() => {
    load()
  }, [activeLocation])

  const setQty = (transferId, lineId, value) => {
    setReceived((r) => ({ ...r, [transferId]: { ...r[transferId], [lineId]: value } }))
  }

  const accept = async (t) => {
    setBusyId(t.id)
    try {
      const map = {}
      for (const it of t.items) map[transferItemKey(it)] = Number(received[t.id]?.[transferItemKey(it)] ?? it.qty)
      await acceptTransfer({ transferId: t.id, received: map, by: profile?.email })
      const anyMismatch = t.items.some((it) => map[transferItemKey(it)] !== it.qty)
      toast.ok(anyMismatch ? 'Accepted with mismatch — flagged for admin review.' : 'Stock accepted and added to your warehouse.')
      refresh()
      load()
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const locName = (id) => locations.find((l) => l.id === id)?.name || id

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Receiving</h1>
          <div className="sub">
            Incoming boxes for {activeLocation?.name || 'your warehouse'}. Confirm received quantity
            per stock group - mismatches are flagged automatically.
          </div>
        </div>
        <button className="btn ghost sm" onClick={load}>Refresh</button>
      </div>

      {incoming.length === 0 ? (
        <div className="card empty">No boxes are currently in transit to this warehouse.</div>
      ) : (
        <div className="grid cols-2">
          {incoming.map((t) => (
            <div key={t.id} className="card tint-amber">
              <div className="row spread">
                <strong className="mono">{t.transferNo}</strong>
                <FlowBadge status={t.status} />
              </div>
              <div className="faint" style={{ fontSize: 12.5, margin: '6px 0 12px' }}>
                From {locName(t.fromLocationId)}
              </div>

              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr><th>SKU</th><th>Stock group</th><th>Expiry</th><th>Sent</th><th>Received</th></tr>
                  </thead>
                  <tbody>
                    {t.items.map((it) => {
                      const lineId = transferItemKey(it)
                      return (
                      <tr key={lineId}>
                        <td className="mono">{it.sku}</td>
                        <td className="mono">{it.batchNo}</td>
                        <td>{formatExpiry(it.expiryDate)}</td>
                        <td>{it.qty}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max={it.qty}
                            style={{ width: 90, padding: '6px 8px' }}
                            value={received[t.id]?.[lineId] ?? it.qty}
                            onChange={(e) => setQty(t.id, lineId, e.target.value)}
                          />
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <button
                className="btn green"
                style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                disabled={busyId === t.id}
                onClick={() => accept(t)}
              >
                {busyId === t.id ? 'Saving…' : 'Accept into inventory'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
