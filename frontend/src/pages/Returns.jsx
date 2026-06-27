import { useEffect, useState } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { addBackReturn, listReturns } from '../lib/api'
import { RETURN_REASONS, RETURN_CONDITIONS } from '../lib/constants'

const empty = { originalOrderId: '', sku: '', batchNo: '', returnedQty: '', returnReason: RETURN_REASONS[0], conditionStatus: 'Good', expiryDate: '' }

export default function Returns() {
  const { activeLocation } = useWorkspace()
  const { profile } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(empty)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)

  const load = () => { if (activeLocation) listReturns(activeLocation.id).then(setRows).catch(() => setRows([])) }
  useEffect(() => { load() }, [activeLocation?.id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!activeLocation) return toast.err('Select a warehouse first.')
    if (!form.sku || !form.batchNo) return toast.err('SKU and stock group required.')
    if (!(Number(form.returnedQty) > 0)) return toast.err('Returned quantity must be more than zero.')
    setBusy(true)
    try {
      await addBackReturn({
        originalOrderId: form.originalOrderId,
        returnReason: form.returnReason,
        sku: form.sku,
        batchNo: form.batchNo,
        locationId: activeLocation.id,
        returnedQty: Number(form.returnedQty),
        conditionStatus: form.conditionStatus,
        expiryDate: form.expiryDate,
        approvedBy: profile?.email,
      })
      toast.ok(form.conditionStatus === 'Good' ? 'Return added back to stock.' : 'Return logged (not added — not Good).')
      setForm(empty)
      load()
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Returns</h1><div className="sub">{activeLocation ? activeLocation.name : 'Pick a warehouse'} · verified add-back</div></div></div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Process a return</h3>
          <div className="field" style={{ marginTop: 12 }}><label>Original order id (optional)</label><input className="input mono" value={form.originalOrderId} onChange={set('originalOrderId')} /></div>
          <div className="grid cols-2">
            <div className="field"><label>SKU</label><input className="input mono" value={form.sku} onChange={set('sku')} /></div>
            <div className="field"><label>Stock group / batch</label><input className="input mono" value={form.batchNo} onChange={set('batchNo')} /></div>
          </div>
          <div className="grid cols-2">
            <div className="field"><label>Returned qty</label><input className="input" type="number" min="1" value={form.returnedQty} onChange={set('returnedQty')} /></div>
            <div className="field"><label>Expiry (for add-back)</label><input className="input" type="date" value={form.expiryDate} onChange={set('expiryDate')} /></div>
          </div>
          <div className="grid cols-2">
            <div className="field"><label>Reason</label><select className="select" value={form.returnReason} onChange={set('returnReason')}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</select></div>
            <div className="field"><label>Condition</label><select className="select" value={form.conditionStatus} onChange={set('conditionStatus')}>{RETURN_CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>Only "Good" condition is added back to sellable stock.</p>
          <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Process return'}</button>
        </div>

        <div className="card">
          <h3>Recent returns</h3>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="t">
              <thead><tr><th>SKU</th><th>Batch</th><th>Qty</th><th>Condition</th><th>Added back</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan="5" className="empty">No returns yet.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.sku}</td>
                    <td className="mono">{r.batchNo}</td>
                    <td>{r.returnedQty}</td>
                    <td>{r.conditionStatus}</td>
                    <td>{r.addedBack ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
