import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { listUsers, listLocations, deleteStaffUser, updateMemberSubscription } from '../lib/api'
import { SHOP_TYPES, SUBSCRIPTION_PLANS } from '../lib/constants'

export default function Admin() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Extend Subscription Modal
  const [renewTarget, setRenewTarget] = useState(null)
  const [renewDuration, setRenewDuration] = useState('1_month')
  const [busyRenew, setBusyRenew] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [u, l] = await Promise.all([listUsers(), listLocations()])
      setUsers(u)
      setLocations(l)
    } catch (err) {
      toast.err('Failed to load members: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const locMap = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations])

  // Enhance member data with computed subscription status
  const members = useMemo(() => {
    const now = new Date()

    return users.map((u) => {
      const locId = u.shopLocationId || (u.assignedLocationIds && u.assignedLocationIds[0])
      const loc = locMap[locId] || {}
      const shopName = u.shopName || loc.name || 'Admin Platform'
      const shopType = u.shopType || loc.shopType || loc.type || 'other'
      const ownerName = u.name || '�'
      const phone = u.phone || loc.phone || '�'
      const email = u.email || '�'
      const address = u.verifiedAddress || loc.address || '�'
      const gMapsUrl = u.googleMapsUrl || loc.googleMapsUrl

      // Dates & Subscriptions
      let createdAtDate = null
      if (u.createdAt) {
        createdAtDate = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt)
      } else {
        createdAtDate = new Date()
      }

      const planId = u.subscriptionDuration || loc.subscriptionDuration || '1_month'
      const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId) || SUBSCRIPTION_PLANS[0]
      const planLabel = u.subscriptionPlanLabel || loc.subscriptionPlanLabel || (u.role === 'admin' ? 'Lifetime Access' : plan.label)
      const price = u.subscriptionPrice !== undefined ? u.subscriptionPrice : (loc.subscriptionPrice || plan.price)

      let endDate = null
      if (u.subscriptionEndDate || loc.subscriptionEndDate) {
        endDate = new Date(u.subscriptionEndDate || loc.subscriptionEndDate)
      } else if (u.role === 'admin') {
        endDate = null // Never expires
      } else {
        // Fallback: 1 month from creation
        endDate = new Date(createdAtDate)
        endDate.setMonth(endDate.getMonth() + plan.months)
      }

      let status = 'active'
      let daysRemaining = null

      if (u.role === 'admin') {
        status = 'active'
      } else if (endDate) {
        const diffTime = endDate - now
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (daysRemaining < 0) {
          status = 'expired'
        } else if (daysRemaining <= 15) {
          status = 'expiring_soon'
        } else {
          status = 'active'
        }
      }

      return {
        ...u,
        shopName,
        shopType,
        ownerName,
        phone,
        email,
        address,
        gMapsUrl,
        locId,
        createdAtDate,
        planId,
        planLabel,
        price,
        endDate,
        daysRemaining,
        status,
        isAdmin: u.role === 'admin',
      }
    })
  }, [users, locMap])

  // Filtered members
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => {
      if (q) {
        const match = `${m.shopName} ${m.ownerName} ${m.phone} ${m.email} ${m.address}`.toLowerCase().includes(q)
        if (!match) return false
      }
      if (planFilter !== 'all' && m.planId !== planFilter) return false
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      return true
    })
  }, [members, search, planFilter, statusFilter])

  // Metrics
  const metrics = useMemo(() => {
    const nonAdmins = members.filter((m) => !m.isAdmin)
    const active = nonAdmins.filter((m) => m.status === 'active')
    const expiringSoon = nonAdmins.filter((m) => m.status === 'expiring_soon')
    const expired = nonAdmins.filter((m) => m.status === 'expired')
    const totalRev = nonAdmins.reduce((sum, m) => sum + (Number(m.price) || 0), 0)

    return {
      total: nonAdmins.length,
      active: active.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
      totalRev,
    }
  }, [members])

  const shopTypeBadge = (typeId) => {
    const match = SHOP_TYPES.find((s) => s.id === typeId)
    return match ? `${match.icon} ${match.label}` : typeId || 'Shop'
  }

  const handleDelete = async (m) => {
    if (!window.confirm(`Are you sure you want to delete "${m.shopName}" (${m.ownerName})?`)) return
    try {
      await deleteStaffUser({ uid: m.id, locationId: m.locId })
      toast.ok(`Deleted member ${m.shopName}.`)
      loadData()
    } catch (err) {
      toast.err('Could not delete member: ' + err.message)
    }
  }

  const handleRenewSubmit = async () => {
    if (!renewTarget) return
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === renewDuration) || SUBSCRIPTION_PLANS[0]

    // Extend from current end date or from today if already expired
    const baseDate = renewTarget.endDate && renewTarget.endDate > new Date()
      ? new Date(renewTarget.endDate)
      : new Date()
    baseDate.setMonth(baseDate.getMonth() + plan.months)

    setBusyRenew(true)
    try {
      await updateMemberSubscription({
        uid: renewTarget.id,
        locationId: renewTarget.locId,
        durationId: plan.id,
        planLabel: plan.label,
        price: plan.price,
        endDate: baseDate.toISOString(),
      })
      toast.ok(`Subscription for ${renewTarget.shopName} extended by ${plan.label}!`)
      setRenewTarget(null)
      loadData()
    } catch (err) {
      toast.err('Failed to extend subscription: ' + err.message)
    } finally {
      setBusyRenew(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return '�'
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1>Members List &amp; Subscriptions</h1>
          <div className="sub">
            Overview of all shop accounts, owner contact details, creation dates, and subscription validity.
          </div>
        </div>
        <Link to="/users" className="btn primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>+ Onboard New Shop</span>
        </Link>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Total Shop Members
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            {metrics.total}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Registered shop accounts
          </div>
        </div>

        <div className="card">
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Active Subscriptions
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--green, #22c55e)' }}>
            {metrics.active}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            In good standing
          </div>
        </div>

        <div className="card">
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Expiring Soon (&lt; 15d)
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: metrics.expiringSoon > 0 ? '#f59e0b' : 'inherit' }}>
            {metrics.expiringSoon}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Due for renewal
          </div>
        </div>

        <div className="card">
          <div className="faint" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Total Plan Value
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--accent, #6366f1)' }}>
            ₹{metrics.totalRev.toLocaleString()}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Subscriptions billed
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row spread wrap" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 10, flex: 1 }}>
            <input
              className="input"
              style={{ minWidth: 260 }}
              placeholder="Search shop, owner, phone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="select"
              style={{ width: 'auto' }}
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
            >
              <option value="all">All Plans</option>
              {SUBSCRIPTION_PLANS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <select
              className="select"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="muted" style={{ fontSize: 13 }}>
            Showing {filtered.length} of {members.length} members
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Shop Name &amp; Type</th>
                <th>Owner Name</th>
                <th>Contact Number</th>
                <th>Creation Date</th>
                <th>Duration &amp; Price</th>
                <th>Subscription End Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="empty">Loading members directory�</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty">
                    {members.length === 0
                      ? 'No shop members registered yet. Onboard your first shop to get started.'
                      : 'No members match the search filters.'}
                  </td>
                </tr>
              )}
              {filtered.map((m) => (
                <tr key={m.id}>
                  {/* Shop Name & Type */}
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.shopName}</div>
                    <div style={{ marginTop: 3 }}>
                      <span className="badge sm muted">{shopTypeBadge(m.shopType)}</span>
                    </div>
                  </td>

                  {/* Owner Name */}
                  <td>
                    <div style={{ fontWeight: 500 }}>{m.ownerName}</div>
                    <div className="mono faint" style={{ fontSize: 11.5 }}>{m.email}</div>
                  </td>

                  {/* Contact Number */}
                  <td>
                    {m.phone && m.phone !== '�' ? (
                      <a
                        href={`tel:${m.phone}`}
                        style={{ color: 'var(--accent, #6366f1)', textDecoration: 'none', fontWeight: 500, fontSize: 12.5 }}
                      >
                        ?? {m.phone}
                      </a>
                    ) : (
                      <span className="faint">�</span>
                    )}
                  </td>

                  {/* Creation Date */}
                  <td className="faint" style={{ fontSize: 12.5 }}>
                    {formatDate(m.createdAtDate)}
                  </td>

                  {/* Duration & Price */}
                  <td>
                    <span className={`badge sm ${m.isAdmin ? 'purple' : 'green'}`}>
                      {m.planLabel}
                    </span>
                    {!m.isAdmin && (
                      <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                        ₹{Number(m.price).toLocaleString()}
                      </div>
                    )}
                  </td>

                  {/* Subscription End Date */}
                  <td>
                    {m.isAdmin ? (
                      <span className="faint">Lifetime</span>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 12.5 }}>{formatDate(m.endDate)}</div>
                        {m.daysRemaining !== null && (
                          <div
                            style={{
                              fontSize: 11.5,
                              marginTop: 2,
                              color: m.daysRemaining <= 0 ? 'var(--red, #ef4444)' : m.daysRemaining <= 15 ? '#f59e0b' : 'var(--muted)',
                            }}
                          >
                            {m.daysRemaining > 0
                              ? `${m.daysRemaining} days left`
                              : m.daysRemaining === 0
                              ? 'Expires today'
                              : `Expired ${Math.abs(m.daysRemaining)}d ago`}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td>
                    {m.isAdmin ? (
                      <span className="badge sm purple">Super Admin</span>
                    ) : m.status === 'active' ? (
                      <span className="badge sm green">Active</span>
                    ) : m.status === 'expiring_soon' ? (
                      <span className="badge sm" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderColor: '#f59e0b' }}>
                        Expiring Soon
                      </span>
                    ) : (
                      <span className="badge sm danger">Expired</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td>
                    {!m.isAdmin && (
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setRenewTarget(m)
                            setRenewDuration(m.planId || '1_month')
                          }}
                          title="Extend or renew subscription"
                        >
                          Renew
                        </button>
                        <button
                          className="btn sm danger"
                          onClick={() => handleDelete(m)}
                          title="Delete member account"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Renew / Extend Subscription Modal */}
      {renewTarget && (
        <div className="modal-backdrop" onClick={() => setRenewTarget(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Extend Subscription</h3>
              <button className="btn ghost sm" onClick={() => setRenewTarget(null)}>?</button>
            </div>

            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Select a new subscription duration for <strong>{renewTarget.shopName}</strong> ({renewTarget.ownerName}).
            </p>

            <div className="field">
              <label>Select Extension Plan</label>
              <div className="grid cols-2" style={{ gap: 8, marginTop: 6 }}>
                {SUBSCRIPTION_PLANS.map((p) => {
                  const isSel = renewDuration === p.id
                  return (
                    <div
                      key={p.id}
                      onClick={() => setRenewDuration(p.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: isSel ? '2px solid var(--accent, #6366f1)' : '1px solid var(--border)',
                        background: isSel ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="row spread">
                        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{p.label}</span>
                        {p.badge && <span className="badge purple sm">{p.badge}</span>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: 'var(--accent, #6366f1)' }}>
                        {p.currency}{p.price.toLocaleString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ marginTop: 18 }} className="row spread">
              <button className="btn ghost sm" onClick={() => setRenewTarget(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busyRenew}
                onClick={handleRenewSubmit}
              >
                {busyRenew ? 'Updating�' : 'Confirm & Extend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
