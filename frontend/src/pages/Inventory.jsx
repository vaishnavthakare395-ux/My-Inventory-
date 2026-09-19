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
  const { canManage, isAdmin, profile } = useAuth()
  const canDelete = canManage && !isAdmin
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [confirm, setConfirm] = useState(null)

  const doRemove = async () => {
    if (isAdmin) return toast.err('Admins cannot remove products or stock.')
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
  const totalCostValue = rows.reduce((s, r) => {
    const bp = r.buyingPrice || r.product.buyingPrice || 0
    return s + bp * (r.qty || 0)
  }, 0)
  const totalRetailValue = rows.reduce((s, r) => {
    const sp = r.sellingPrice || r.product.sellingPrice || 0
    return s + sp * (r.qty || 0)
  }, 0)
  const totalProjectedProfit = totalRetailValue - totalCostValue

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <div className="sub">{activeLocation ? activeLocation.name : 'All locations'} · live stock & pricing (FEFO order)</div>
        </div>
      </div>

      {/* Inventory Valuation & Pricing Summary Cards */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>Total Stock Cost (BP)</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--text)' }}>
            ₹{totalCostValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{totalUnits.toLocaleString()} total units on shelf</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>Total Retail Value (SP)</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--accent, #6366f1)' }}>
            ₹{totalRetailValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>Expected customer sales revenue</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>Projected Retail Profit</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#22c55e' }}>
            +₹{totalProjectedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
            Overall margin: {totalRetailValue > 0 ? ((totalProjectedProfit / totalRetailValue) * 100).toFixed(1) : 0}%
          </div>
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
                <th>SKU</th>
                <th>Product</th>
                <th>Stock group</th>
                <th>Qty</th>
                <th>Buying (BP)</th>
                <th>Selling (SP)</th>
                <th>Emergency (EP)</th>
                <th>Profit / Margin</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>FEFO</th>
                {canDelete && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={canDelete ? 12 : 11} className="empty">Loading stock…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={canDelete ? 12 : 11} className="empty">No matching stock. Add some on the Scan & Add page.</td></tr>}
              {rows.map((r, i) => {
                const bp = Number(r.buyingPrice || r.product.buyingPrice) || 0
                const sp = Number(r.sellingPrice || r.product.sellingPrice) || 0
                const ep = Number(r.emergencyPrice || r.product.emergencyPrice) || 0
                const profit = sp > bp ? sp - bp : 0
                const margin = sp > 0 ? Math.round((profit / sp) * 100) : 0

                return (
                  <tr key={r.id}>
                    <td className="mono">{r.sku}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.product.productName || '—'}</div>
                      {r.product.brand && <div className="faint" style={{ fontSize: 11 }}>{r.product.brand} · {r.product.category || 'General'}</div>}
                    </td>
                    <td className="mono">{r.batchNo}</td>
                    <td>
                      <b>{r.qty}</b>
                    </td>
                    <td className="mono">
                      {bp > 0 ? `₹${bp.toFixed(2)}` : <span className="faint">—</span>}
                    </td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {sp > 0 ? `₹${sp.toFixed(2)}` : <span className="faint">—</span>}
                    </td>
                    <td className="mono" style={{ color: '#22c55e', fontWeight: 600 }}>
                      {ep > 0 ? `₹${ep.toFixed(2)}` : <span className="faint">—</span>}
                    </td>
                    <td>
                      {sp > bp && bp > 0 ? (
                        <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>+₹{profit.toFixed(2)}</span>
                          <span className="badge green sm" style={{ fontSize: 10, padding: '1px 5px' }}>{margin}%</span>
                        </div>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td>{formatExpiry(r.expiryDate)}</td>
                    <td><StatusBadge tone={r.status.tone}>{r.status.text}</StatusBadge></td>
                    <td>{i === 0 && r.status.days !== null && r.status.days <= 90 ? <StatusBadge tone="info">Dispatch first</StatusBadge> : <span className="faint">—</span>}</td>
                    {canDelete && (
                      <td><button className="btn danger sm" onClick={() => setConfirm(r)} title="Remove this batch">Delete</button></td>
                    )}
                  </tr>
                )
              })}
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
