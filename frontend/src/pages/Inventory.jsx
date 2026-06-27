import { useMemo, useState } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAlerts } from '../lib/AlertsContext'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { removeBatch } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import BatchBoxes3D from '../components/BatchBoxes3D'
import { batchStatus, formatExpiry } from '../lib/fefo'

export default function Inventory() {
  const { activeLocation } = useWorkspace()
  const { batches, productsBySku, loading, refresh } = useAlerts()
  const { canManage, profile } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [confirm, setConfirm] = useState(null)

  const doRemove = async () => {
    if (!confirm) return
    try {
      await removeBatch({ batchId: confirm.id, by: profile?.email, reason: 'Removed from inventory' })
      toast.ok(`Removed batch ${confirm.batchNo}.`)
      setConfirm(null)
      refresh()
    } catch (err) {
      toast.err(err.message)
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return batches
      .map((b) => {
        const product = productsBySku[b.sku] || {}
        return { ...b, product, status: batchStatus(b.expiryDate, b.qty, product.reorderLevel) }
      })
      .filter((r) => {
        if (q && !(`${r.sku} ${r.product.productName || ''} ${r.batchNo}`.toLowerCase().includes(q))) return false
        if (filter === 'expiring') return r.status.days !== null && r.status.days <= 90
        if (filter === 'low') return r.status.text.toLowerCase().includes('low')
        return true
      })
  }, [batches, productsBySku, search, filter])

  const totalUnits = rows.reduce((s, r) => s + (r.qty || 0), 0)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <div className="sub">{activeLocation ? activeLocation.name : 'All locations'} · live stock (FEFO order)</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <BatchBoxes3D batches={batches} productsBySku={productsBySku} />
      </div>

      <div className="card">
        <div className="row spread" style={{ marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 240 }} placeholder="Search SKU / product / batch" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="expiring">Expiring (≤90d)</option>
              <option value="low">Low stock</option>
            </select>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>{rows.length} batches · {totalUnits.toLocaleString()} units</div>
        </div>

        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>SKU</th><th>Product</th><th>Stock group</th><th>Qty</th><th>Expiry</th><th>Status</th><th>FEFO</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={canManage ? 8 : 7} className="empty">Loading stock…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={canManage ? 8 : 7} className="empty">No matching stock. Add some on the Scan & Add page.</td></tr>}
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="mono">{r.sku}</td>
                  <td>{r.product.productName || '—'}</td>
                  <td className="mono">{r.batchNo}</td>
                  <td>{r.qty}</td>
                  <td>{formatExpiry(r.expiryDate)}</td>
                  <td><StatusBadge tone={r.status.tone}>{r.status.text}</StatusBadge></td>
                  <td>{i === 0 && r.status.days !== null && r.status.days <= 90 ? <StatusBadge tone="info">Dispatch first</StatusBadge> : <span className="faint">—</span>}</td>
                  {canManage && (
                    <td><button className="btn danger sm" onClick={() => setConfirm(r)} title="Remove this batch">Delete</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>Remove this batch?</h3>
            <p className="muted" style={{ fontSize: 13.5, margin: '10px 0 4px' }}>
              This deletes the batch from inventory. Use it for wrong entries or dummy/test stock. The removal is recorded in the audit ledger.
            </p>
            <div className="card" style={{ margin: '12px 0', background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{confirm.product.productName || confirm.sku}</div>
              <div className="faint" style={{ fontSize: 12.5 }}>{confirm.sku} · batch {confirm.batchNo} · {confirm.qty} units · {formatExpiry(confirm.expiryDate)}</div>
            </div>
            <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn danger sm" onClick={doRemove}>Delete batch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
