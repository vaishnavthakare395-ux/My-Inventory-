import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { listUsers, createStaffUser, saveUserProfile } from '../lib/api'
import { ROLES, ROLE_LABELS } from '../lib/constants'

const emptyForm = { email: '', password: '', name: '', role: 'user', assignedLocationIds: [] }

export default function Users() {
  const { locations, isAdmin, myLocationIds } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const load = () => listUsers().then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const locName = (id) => locations.find((l) => l.id === id)?.name || id
  const assignable = isAdmin ? locations : locations.filter((l) => myLocationIds.includes(l.id))

  const toggleLoc = (id) => setForm((f) => ({
    ...f,
    assignedLocationIds: f.assignedLocationIds.includes(id)
      ? f.assignedLocationIds.filter((x) => x !== id)
      : [...f.assignedLocationIds, id],
  }))

  const create = async () => {
    if (!form.email || !form.password) return toast.err('Email and password required.')
    if (form.password.length < 6) return toast.err('Password must be at least 6 characters.')
    setBusy(true)
    try {
      await createStaffUser(form)
      toast.ok(`Created ${form.email}.`)
      setForm(emptyForm)
      load()
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Users &amp; Access</h1><div className="sub">Create staff accounts and assign warehouses.</div></div></div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Add user</h3>
          <div className="field" style={{ marginTop: 12 }}><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>Temp password</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="staff changes it later" /></div>
          <div className="field">
            <label>Role</label>
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">{ROLE_LABELS[ROLES.USER]}</option>
              <option value="manager">{ROLE_LABELS[ROLES.MANAGER]}</option>
              {isAdmin && <option value="admin">{ROLE_LABELS[ROLES.ADMIN]}</option>}
            </select>
          </div>
          <div className="field">
            <label>Assigned warehouses</label>
            <div className="row wrap" style={{ gap: 8 }}>
              {assignable.map((l) => (
                <button key={l.id} type="button" className={`btn sm ${form.assignedLocationIds.includes(l.id) ? 'green' : 'ghost'}`} onClick={() => toggleLoc(l.id)}>{l.name}</button>
              ))}
            </div>
          </div>
          <button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create user'}</button>
        </div>

        <div className="card">
          <h3>Existing users</h3>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="t">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Warehouses</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan="4" className="empty">No users yet.</td></tr>}
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name || '—'}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{u.email}</td>
                    <td>{ROLE_LABELS[u.role] || u.role}</td>
                    <td className="faint" style={{ fontSize: 12 }}>{u.role === 'admin' ? 'All' : (u.assignedLocationIds || []).map(locName).join(', ') || '—'}</td>
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
