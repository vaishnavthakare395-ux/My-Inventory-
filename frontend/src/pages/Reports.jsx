import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { reconciliationReport, reorderList } from '../lib/reports'

export default function Reports() {
  const [tab, setTab] = useState('reconcile')
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <div className="sub">Stock reconciliation and vendor-wise reorder planning.</div>
        </div>
      </div>

      <div className="pill-tabs" style={{ marginBottom: 16 }}>
        <button className={tab === 'reconcile' ? 'on' : ''} onClick={() => setTab('reconcile')}>Reconciliation</button>
        <button className={tab === 'reorder' ? 'on' : ''} onClick={() => setTab('reorder')}>Reorder list</button>
      </div>

      {tab === 'reconcile' ? <Reconciliation /> : <Reorder />}
    </div>
  )
}

function Reconciliation() {
  const { myLocations } = useAuth()
  const toast = useToast()
  const [loc, setLoc] = useState(myLocations[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const run = async () => {
    if (!loc) return toast.err('Pick a warehouse.')
    setBusy(true)
    setResult(null)
    try {
      const r = await reconciliationReport(loc)
      setResult(r)
      toast.ok(r.mismatches.length ? `${r.mismatches.length} mismatch(es) found.` : 'All balanced — no mismatch.')
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Checks that every stock group's current quantity equals the sum of its ledger movements.
        Any difference means a write bypassed the audit trail — the data-mismatch alarm.
      </p>
      <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto' }} value={loc} onChange={(e) => setLoc(e.target.value)}>
          {myLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button className="btn primary" disabled={busy} onClick={run}>
          {busy ? 'Checking…' : 'Run reconciliation'}
        </button>
      </div>

      {result && (
        result.mismatches.length === 0 ? (
          <div className="badge good"><span className="dot" /> Balanced — {result.checked} stock groups checked, 0 mismatches</div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>SKU</th><th>Stock group</th><th>In stock</th><th>Ledger total</th><th>Difference</th></tr>
              </thead>
              <tbody>
                {result.mismatches.map((m, i) => (
                  <tr key={i}>
                    <td className="mono">{m.sku}</td>
                    <td className="mono">{m.batchNo}</td>
                    <td>{m.stockQty}</td>
                    <td>{m.ledgerQty}</td>
                    <td style={{ color: 'var(--red)', fontWeight: 700 }}>{m.diff > 0 ? '+' : ''}{m.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

function Reorder() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await reorderList()
      setResult(r)
      toast.ok(r.count ? `${r.count} product(s) need reordering.` : 'Nothing below reorder level.')
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Products at or below their reorder level, grouped by vendor — ready to turn into purchase
        orders. Only products with a reorder level set are checked.
      </p>
      <button className="btn primary" disabled={busy} onClick={run} style={{ marginBottom: 16 }}>
        {busy ? 'Building…' : 'Build reorder list'}
      </button>

      {result && result.count === 0 && (
        <div className="badge good"><span className="dot" /> Nothing needs reordering</div>
      )}

      {result && result.vendors.map((v) => (
        <div key={v.vendor} style={{ marginBottom: 18 }}>
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 15 }}>{v.vendor}</h3>
            <span className="faint" style={{ fontSize: 12 }}>{v.items.length} item(s)</span>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>SKU</th><th>Product</th><th>In stock</th><th>Reorder level</th></tr>
              </thead>
              <tbody>
                {v.items.map((p) => (
                  <tr key={p.sku}>
                    <td className="mono">{p.sku}</td>
                    <td>{p.name}</td>
                    <td style={{ color: p.inStock === 0 ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>{p.inStock}</td>
                    <td>{p.reorderLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
