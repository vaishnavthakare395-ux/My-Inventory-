import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { ROLE_LABELS, SUBSCRIPTION_PLANS } from '../lib/constants'

export default function Settings() {
  const { profile, role, user, myLocations, isAdmin, changePassword } = useAuth()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const subInfo = useMemo(() => {
    if (isAdmin) {
      return {
        code: 'SUB-ADMIN-LIFETIME',
        duration: 'Lifetime Platform Access',
        startDate: 'Permanent',
        endDate: 'Never Expires',
        badge: <span className="badge good">Active (Enterprise Admin)</span>,
      }
    }

    const loc = myLocations[0] || {}
    const planCode = profile?.subscriptionDuration || loc.subscriptionDuration || '1_month'
    const planObj = SUBSCRIPTION_PLANS.find((p) => p.id === planCode) || SUBSCRIPTION_PLANS[0]

    // Formatter
    const formatDate = (val) => {
      if (!val) return null
      const d = val.toDate ? val.toDate() : new Date(val)
      return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const startRaw = profile?.subscriptionStartDate || loc.subscriptionStartDate || profile?.createdAt || loc.createdAt
    const startStr = formatDate(startRaw) || '01 Oct 2026'

    let endStr = formatDate(profile?.subscriptionEndDate || loc.subscriptionEndDate)
    if (!endStr) {
      const d = startRaw ? (startRaw.toDate ? startRaw.toDate() : new Date(startRaw)) : new Date()
      d.setMonth(d.getMonth() + planObj.months)
      endStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    return {
      code: `SUB-${planCode.toUpperCase()}`,
      duration: `${planObj.label} (${planObj.months} month${planObj.months > 1 ? 's' : ''})`,
      startDate: startStr,
      endDate: endStr,
      badge: <span className="badge good">Active</span>,
    }
  }, [profile, myLocations, isAdmin])

  const savePw = async () => {
    if (pw.length < 6) return toast.err('Password must be at least 6 characters.')
    if (pw !== pw2) return toast.err('Passwords do not match.')
    setBusy(true)
    try {
      await changePassword(pw)
      toast.ok('Password updated.')
      setPw(''); setPw2('')
    } catch (err) {
      toast.err(err.code === 'auth/requires-recent-login' ? 'Please log out and back in, then retry.' : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><div className="sub">Your profile and account.</div></div></div>
      <div className="grid cols-2">
        <div className="card">
          <h3>Profile</h3>
          <div className="set-rows" style={{ marginTop: 12 }}>
            <Row k="Name" v={profile?.name || '—'} />
            <Row k="Email" v={user?.email} />
            <Row k="Role" v={ROLE_LABELS[role] || role} />
            <Row k="Warehouses" v={isAdmin ? 'All locations' : myLocations.map((l) => l.name).join(', ') || '—'} />
          </div>
        </div>

        <div className="card">
          <h3>Subscription &amp; Validity</h3>
          <div className="set-rows" style={{ marginTop: 12 }}>
            <Row k="Plan Code" v={<span className="mono" style={{ fontWeight: 600, color: 'var(--accent, #6366f1)' }}>{subInfo.code}</span>} />
            <Row k="Plan Duration" v={subInfo.duration} />
            <Row k="Starting Date" v={subInfo.startDate} />
            <Row k="Ending Date" v={subInfo.endDate} />
            <Row k="Subscription Status" v={subInfo.badge} />
          </div>
        </div>

        <div className="card">
          <h3>Change password</h3>
          <div className="field" style={{ marginTop: 12 }}>
            <label>New password</label>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <button className="btn primary" disabled={busy} onClick={savePw}>{busy ? 'Saving…' : 'Update password'}</button>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3>About this workspace</h3>
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            <Mini k="Data store" v="Secure cloud" sub="single source of truth" />
            <Mini k="Sync" v="Real-time" sub="all locations" />
            <Mini k="Access" v="Role-based" sub="per warehouse" />
          </div>
          {isAdmin && (
            <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
              <Link to="/admin" className="btn sm">Admin Console</Link>
              <Link to="/users" className="btn sm">Manage users</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }) {
  return <div className="set-row"><span className="set-k">{k}</span><span className="set-v">{v}</span></div>
}
function Mini({ k, v, sub }) {
  return <div className="mini-stat"><div className="mini-k">{k}</div><div className="mini-v">{v}</div><div className="mini-sub">{sub}</div></div>
}
