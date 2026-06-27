import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { listEditRequests, resolveEditRequest } from '../lib/api'

export default function Approvals() {
  const { profile } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])

  const load = () => listEditRequests().then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const resolve = async (id, status) => {
    try {
      await resolveEditRequest(id, status, profile?.email)
      toast.ok(`Request ${status}.`)
      load()
    } catch (err) {
      toast.err(err.message)
    }
  }

  const pending = rows.filter((r) => (r.approvalStatus || 'pending') === 'pending')

  return (
    <div className="page">
      <div className="page-head"><div><h1>Approvals</h1><div className="sub">Edit / shipment-sheet change requests awaiting review.</div></div></div>

      <div className="card">
        <h3>Pending requests <span className="faint" style={{ fontSize: 12 }}>({pending.length})</span></h3>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="t">
            <thead><tr><th>SKU</th><th>Stock group</th><th>Change</th><th>Reason</th><th>By</th><th></th></tr></thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan="6" className="empty">Nothing pending.</td></tr>}
              {pending.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.sku || '—'}</td>
                  <td className="mono">{r.batch || r.batchNo || '—'}</td>
                  <td>{r.qtyChange != null ? (r.qtyChange > 0 ? `+${r.qtyChange}` : r.qtyChange) : '—'}</td>
                  <td className="faint" style={{ fontSize: 12.5 }}>{r.reason || '—'}</td>
                  <td className="faint" style={{ fontSize: 12 }}>{r.createdBy || r.by || '—'}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn green sm" onClick={() => resolve(r.id, 'approved')}>Approve</button>
                      <button className="btn danger sm" onClick={() => resolve(r.id, 'rejected')}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
