import { useState, useMemo } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAlerts } from '../lib/AlertsContext'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { removeBatch } from '../lib/api'
import { daysUntil, formatExpiry } from '../lib/fefo'
import { EXPIRY_WINDOWS } from '../lib/constants'
import { printQrLabel } from '../components/QrLabel'
import * as XLSX from 'xlsx'

export default function NearExpiry() {
  const { activeLocation } = useWorkspace()
  const { batches, productsBySku, loading, refresh } = useAlerts()
  const { profile, isAdmin, canManage } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [windowFilter, setWindowFilter] = useState('all_expiring') // all_expiring | expired | critical | month | watch | all
  const [sortBy, setSortBy] = useState('soonest') // soonest | furthest | qty_desc | name_asc
  const [writeOffModal, setWriteOffModal] = useState(null)
  const [writeOffReason, setWriteOffReason] = useState('Expired stock write-off')
  const [busy, setBusy] = useState(false)

  // Enrich batches with expiry calculations
  const enriched = useMemo(() => {
    return batches.map((b) => {
      const product = productsBySku[b.sku] || {}
      const days = daysUntil(b.expiryDate)
      let urgency = 'good'
      let urgencyLabel = 'Good'
      let actionRecommendation = 'Normal Sale'

      if (days === null) {
        urgency = 'muted'
        urgencyLabel = 'No Expiry Set'
        actionRecommendation = 'Check Packaging'
      } else if (days < 0) {
        urgency = 'expired'
        urgencyLabel = `Expired (${Math.abs(days)}d ago)`
        actionRecommendation = 'Dispose / Write-off'
      } else if (days <= EXPIRY_WINDOWS.CRITICAL) { // <= 7d
        urgency = 'critical'
        urgencyLabel = days === 0 ? 'Expires TODAY' : `Expires in ${days}d`
        actionRecommendation = 'Flash Clearance (50%+ Off)'
      } else if (days <= EXPIRY_WINDOWS.WARN) { // <= 30d
        urgency = 'warning'
        urgencyLabel = `Expires in ${days}d`
        actionRecommendation = 'Promote Sale / Front Shelf'
      } else if (days <= EXPIRY_WINDOWS.WATCH) { // <= 90d
        urgency = 'watch'
        urgencyLabel = `${days} days left`
        actionRecommendation = 'FEFO Priority Dispatch'
      } else {
        urgency = 'good'
        urgencyLabel = `${days} days left`
        actionRecommendation = 'Normal Rotation'
      }

      return {
        ...b,
        product,
        days,
        urgency,
        urgencyLabel,
        actionRecommendation,
      }
    })
  }, [batches, productsBySku])

  // Summary Metrics
  const metrics = useMemo(() => {
    let expiredCount = 0
    let expiredUnits = 0
    let criticalCount = 0
    let criticalUnits = 0
    let monthCount = 0
    let monthUnits = 0
    let watchCount = 0
    let watchUnits = 0
    let totalRiskUnits = 0

    for (const item of enriched) {
      const d = item.days
      const q = item.qty || 0
      if (d !== null && d <= EXPIRY_WINDOWS.WATCH) {
        totalRiskUnits += q
      }

      if (d !== null && d < 0) {
        expiredCount++
        expiredUnits += q
      } else if (d !== null && d <= EXPIRY_WINDOWS.CRITICAL) {
        criticalCount++
        criticalUnits += q
      } else if (d !== null && d <= EXPIRY_WINDOWS.WARN) {
        monthCount++
        monthUnits += q
      } else if (d !== null && d <= EXPIRY_WINDOWS.WATCH) {
        watchCount++
        watchUnits += q
      }
    }

    return {
      expiredCount,
      expiredUnits,
      criticalCount,
      criticalUnits,
      monthCount,
      monthUnits,
      watchCount,
      watchUnits,
      totalRiskUnits,
    }
  }, [enriched])

  // Filter & Sort
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return enriched
      .filter((item) => {
        // Text search
        if (q) {
          const matchStr = `${item.sku} ${item.product.productName || ''} ${item.batchNo} ${item.product.category || ''}`.toLowerCase()
          if (!matchStr.includes(q)) return false
        }

        // Window filter
        const d = item.days
        if (windowFilter === 'all_expiring') {
          return d !== null && d <= EXPIRY_WINDOWS.WATCH
        }
        if (windowFilter === 'expired') {
          return d !== null && d < 0
        }
        if (windowFilter === 'critical') {
          return d !== null && d >= 0 && d <= EXPIRY_WINDOWS.CRITICAL
        }
        if (windowFilter === 'month') {
          return d !== null && d > EXPIRY_WINDOWS.CRITICAL && d <= EXPIRY_WINDOWS.WARN
        }
        if (windowFilter === 'watch') {
          return d !== null && d > EXPIRY_WINDOWS.WARN && d <= EXPIRY_WINDOWS.WATCH
        }
        return true // 'all'
      })
      .sort((a, b) => {
        if (sortBy === 'soonest') {
          if (a.days === null && b.days === null) return 0
          if (a.days === null) return 1
          if (b.days === null) return -1
          return a.days - b.days
        }
        if (sortBy === 'furthest') {
          if (a.days === null && b.days === null) return 0
          if (a.days === null) return 1
          if (b.days === null) return -1
          return b.days - a.days
        }
        if (sortBy === 'qty_desc') {
          return (b.qty || 0) - (a.qty || 0)
        }
        if (sortBy === 'name_asc') {
          return (a.product.productName || a.sku).localeCompare(b.product.productName || b.sku)
        }
        return 0
      })
  }, [enriched, search, windowFilter, sortBy])

  // Write-off / Dispose batch
  const handleWriteOff = async () => {
    if (!writeOffModal) return
    if (isAdmin) {
      return toast.err('Admins cannot modify shop inventory.')
    }
    setBusy(true)
    try {
      await removeBatch({
        batchId: writeOffModal.id,
        by: profile?.email || 'shop-user',
        reason: `${writeOffReason} (${writeOffModal.qty} units)`,
      })
      toast.ok(`Written off ${writeOffModal.qty} units of batch ${writeOffModal.batchNo}.`)
      setWriteOffModal(null)
      refresh()
    } catch (err) {
      toast.err(err.message || 'Failed to write off batch.')
    } finally {
      setBusy(false)
    }
  }

  // Export to Excel / CSV
  const exportClearanceSheet = () => {
    if (!filtered.length) {
      return toast.err('No items to export.')
    }
    const data = filtered.map((r) => ({
      SKU: r.sku,
      'Product Name': r.product.productName || '—',
      Category: r.product.category || '—',
      'Batch Number': r.batchNo,
      'Quantity On Hand': r.qty,
      'Expiry Date': r.expiryDate || 'N/A',
      'Days Remaining': r.days !== null ? r.days : 'N/A',
      Urgency: r.urgencyLabel,
      'Recommended Action': r.actionRecommendation,
      'Shop Location': activeLocation?.name || '',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Near Expiry')
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Near_Expiry_${activeLocation?.code || 'Shop'}_${stamp}.xlsx`)
    toast.ok('Clearance sheet exported successfully.')
  }

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>Near Expiry Items</h1>
          <div className="sub">
            {activeLocation ? activeLocation.name : 'All locations'} · Batches expiring soon or expired (FEFO priority)
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={refresh} title="Refresh inventory">
            🔄 Refresh
          </button>
          <button className="btn primary sm" onClick={exportClearanceSheet} title="Export clearance sheet to Excel">
            📥 Export Clearance Sheet
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid cols-5" style={{ marginBottom: 16, gap: 12 }}>
        <div
          className="card"
          style={{
            background: metrics.expiredCount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'inherit',
            border: metrics.expiredCount > 0 ? '1px solid #ef4444' : '1px solid var(--border)',
            cursor: 'pointer',
          }}
          onClick={() => setWindowFilter('expired')}
        >
          <div className="row spread">
            <span className="faint" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Expired</span>
            <span style={{ fontSize: 16 }}>🔴</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: metrics.expiredCount > 0 ? '#ef4444' : 'inherit' }}>
            {metrics.expiredCount}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {metrics.expiredUnits} units to dispose
          </div>
        </div>

        <div
          className="card"
          style={{
            background: metrics.criticalCount > 0 ? 'rgba(249, 115, 22, 0.1)' : 'inherit',
            border: metrics.criticalCount > 0 ? '1px solid #f97316' : '1px solid var(--border)',
            cursor: 'pointer',
          }}
          onClick={() => setWindowFilter('critical')}
        >
          <div className="row spread">
            <span className="faint" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Critical (≤ 7d)</span>
            <span style={{ fontSize: 16 }}>🟠</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: metrics.criticalCount > 0 ? '#f97316' : 'inherit' }}>
            {metrics.criticalCount}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {metrics.criticalUnits} units this week
          </div>
        </div>

        <div
          className="card"
          style={{
            background: metrics.monthCount > 0 ? 'rgba(245, 158, 11, 0.08)' : 'inherit',
            border: metrics.monthCount > 0 ? '1px solid #f59e0b' : '1px solid var(--border)',
            cursor: 'pointer',
          }}
          onClick={() => setWindowFilter('month')}
        >
          <div className="row spread">
            <span className="faint" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>8 – 30 Days</span>
            <span style={{ fontSize: 16 }}>🟡</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: metrics.monthCount > 0 ? '#f59e0b' : 'inherit' }}>
            {metrics.monthCount}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {metrics.monthUnits} units within month
          </div>
        </div>

        <div
          className="card"
          style={{
            cursor: 'pointer',
          }}
          onClick={() => setWindowFilter('watch')}
        >
          <div className="row spread">
            <span className="faint" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>31 – 90 Days</span>
            <span style={{ fontSize: 16 }}>🟢</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
            {metrics.watchCount}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {metrics.watchUnits} units in 3 months
          </div>
        </div>

        <div className="card" style={{ background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          <div className="row spread">
            <span className="faint" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent, #6366f1)' }}>Total At Risk</span>
            <span style={{ fontSize: 16 }}>📦</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: 'var(--accent, #6366f1)' }}>
            {metrics.totalRiskUnits.toLocaleString()}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            Units expiring ≤ 90d
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row spread wrap" style={{ gap: 12 }}>
          {/* Filter Pills */}
          <div className="row wrap" style={{ gap: 6 }}>
            <button
              className={`btn sm ${windowFilter === 'all_expiring' ? 'primary' : ''}`}
              onClick={() => setWindowFilter('all_expiring')}
            >
              All Expiring (≤90d)
            </button>
            <button
              className={`btn sm ${windowFilter === 'expired' ? 'primary' : ''}`}
              onClick={() => setWindowFilter('expired')}
              style={windowFilter === 'expired' ? { background: '#ef4444', borderColor: '#ef4444' } : {}}
            >
              Expired ({metrics.expiredCount})
            </button>
            <button
              className={`btn sm ${windowFilter === 'critical' ? 'primary' : ''}`}
              onClick={() => setWindowFilter('critical')}
              style={windowFilter === 'critical' ? { background: '#f97316', borderColor: '#f97316' } : {}}
            >
              ≤ 7 Days ({metrics.criticalCount})
            </button>
            <button
              className={`btn sm ${windowFilter === 'month' ? 'primary' : ''}`}
              onClick={() => setWindowFilter('month')}
            >
              ≤ 30 Days ({metrics.monthCount})
            </button>
            <button
              className={`btn sm ${windowFilter === 'watch' ? 'primary' : ''}`}
              onClick={() => setWindowFilter('watch')}
            >
              ≤ 90 Days ({metrics.watchCount})
            </button>
            <button
              className={`btn sm ${windowFilter === 'all' ? 'primary' : ''}`}
              onClick={() => setWindowFilter('all')}
            >
              All Inventory ({batches.length})
            </button>
          </div>

          {/* Search & Sort */}
          <div className="row wrap" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ width: 220 }}
              placeholder="Search product / SKU / batch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select"
              style={{ width: 'auto' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="soonest">Sort: Soonest Expiry (FEFO)</option>
              <option value="furthest">Sort: Furthest Expiry</option>
              <option value="qty_desc">Sort: Highest Quantity</option>
              <option value="name_asc">Sort: Product Name A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="card">
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>
            {windowFilter === 'expired' && 'Expired Stock Items'}
            {windowFilter === 'critical' && 'Critical Expiring Batches (≤ 7 Days)'}
            {windowFilter === 'month' && 'Batches Expiring in 8 – 30 Days'}
            {windowFilter === 'watch' && 'Batches Expiring in 31 – 90 Days'}
            {windowFilter === 'all_expiring' && 'All Near Expiry & Expired Items'}
            {windowFilter === 'all' && 'All Inventory Batches'}
          </h3>
          <span className="muted" style={{ fontSize: 13 }}>
            Showing {filtered.length} batch(es) · {filtered.reduce((s, r) => s + (r.qty || 0), 0).toLocaleString()} units
          </span>
        </div>

        {loading ? (
          <div className="empty">Loading near expiry items…</div>
        ) : filtered.length === 0 ? (
          <div className="empty" style={{ padding: '36px 16px' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>No items matching this expiry filter</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {batches.length === 0
                ? 'No inventory batches exist yet. Use "Scan & Add" to register products with batch numbers and expiry dates.'
                : 'All tracked items have healthy expiration dates outside this window.'}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Product &amp; SKU</th>
                  <th>Stock Group / Batch</th>
                  <th>Quantity</th>
                  <th>Expiry Date</th>
                  <th>Time Remaining</th>
                  <th>Recommended Action</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isExpired = r.days !== null && r.days < 0
                  const isCritical = r.days !== null && r.days >= 0 && r.days <= EXPIRY_WINDOWS.CRITICAL
                  const isWarn = r.days !== null && r.days > EXPIRY_WINDOWS.CRITICAL && r.days <= EXPIRY_WINDOWS.WARN

                  return (
                    <tr
                      key={r.id}
                      style={{
                        background: isExpired
                          ? 'rgba(239, 68, 68, 0.04)'
                          : isCritical
                          ? 'rgba(249, 115, 22, 0.04)'
                          : 'transparent',
                      }}
                    >
                      {/* Product Name & SKU */}
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                          {r.product.productName || r.sku}
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 2 }}>
                          <span className="mono faint" style={{ fontSize: 11.5 }}>
                            {r.sku}
                          </span>
                          {r.product.category && (
                            <span className="badge sm muted">{r.product.category}</span>
                          )}
                        </div>
                      </td>

                      {/* Batch No */}
                      <td>
                        <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>
                          {r.batchNo}
                        </span>
                      </td>

                      {/* Qty */}
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {r.qty} <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>{r.product.unit || 'units'}</span>
                        </div>
                        {r.product.reorderLevel && r.qty <= r.product.reorderLevel && (
                          <div className="badge sm red" style={{ marginTop: 2 }}>Low Stock</div>
                        )}
                      </td>

                      {/* Expiry Date */}
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {formatExpiry(r.expiryDate)}
                        </div>
                        <div className="faint mono" style={{ fontSize: 11 }}>
                          {r.expiryDate || 'No date'}
                        </div>
                      </td>

                      {/* Time Remaining / Urgency Badge */}
                      <td>
                        {isExpired ? (
                          <span className="badge sm red" style={{ fontWeight: 600 }}>
                            ● {r.urgencyLabel}
                          </span>
                        ) : isCritical ? (
                          <span className="badge sm" style={{ background: '#f97316', color: '#fff', fontWeight: 600 }}>
                            ⚡ {r.urgencyLabel}
                          </span>
                        ) : isWarn ? (
                          <span className="badge sm yellow" style={{ fontWeight: 600 }}>
                            ⏳ {r.urgencyLabel}
                          </span>
                        ) : r.days !== null && r.days <= EXPIRY_WINDOWS.WATCH ? (
                          <span className="badge sm green" style={{ fontWeight: 600 }}>
                            👁 {r.urgencyLabel}
                          </span>
                        ) : (
                          <span className="badge sm muted">
                            {r.urgencyLabel}
                          </span>
                        )}
                      </td>

                      {/* Action Recommendation */}
                      <td>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: isExpired
                              ? 'rgba(239, 68, 68, 0.1)'
                              : isCritical
                              ? 'rgba(249, 115, 22, 0.1)'
                              : isWarn
                              ? 'rgba(245, 158, 11, 0.1)'
                              : 'rgba(255, 255, 255, 0.04)',
                            color: isExpired
                              ? '#ef4444'
                              : isCritical
                              ? '#f97316'
                              : isWarn
                              ? '#f59e0b'
                              : 'var(--text)',
                            display: 'inline-block',
                          }}
                        >
                          {r.actionRecommendation}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <button
                            className="btn sm"
                            onClick={() => printQrLabel({ sku: r.sku, batchNo: r.batchNo, expiryDate: r.expiryDate, locationId: r.locationId })}
                            title="Print clearance shelf label"
                            style={{ padding: '4px 8px', fontSize: 11.5 }}
                          >
                            🏷️ Label
                          </button>
                          {!isAdmin && (
                            <button
                              className="btn danger sm"
                              onClick={() => {
                                setWriteOffModal(r)
                                setWriteOffReason(isExpired ? 'Expired stock disposal' : 'Clearance write-down')
                              }}
                              title="Write off or remove expired/damaged batch from stock"
                              style={{ padding: '4px 8px', fontSize: 11.5 }}
                            >
                              Dispose
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Write-off / Disposal Confirmation Modal */}
      {writeOffModal && (
        <div className="modal-backdrop" onClick={() => !busy && setWriteOffModal(null)}>
          <div className="modal card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#ef4444' }}>Dispose / Write-Off Batch</h3>
              <button className="btn sm" onClick={() => !busy && setWriteOffModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 14px' }}>
              Are you sure you want to write off and remove this batch from live stock? This action logs an adjustment entry in the stock ledger.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
              <div className="row spread">
                <span className="faint">Product:</span>
                <b>{writeOffModal.product.productName || writeOffModal.sku}</b>
              </div>
              <div className="row spread" style={{ marginTop: 4 }}>
                <span className="faint">Stock Group / Batch:</span>
                <span className="mono">{writeOffModal.batchNo}</span>
              </div>
              <div className="row spread" style={{ marginTop: 4 }}>
                <span className="faint">Quantity Being Removed:</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>{writeOffModal.qty} units</span>
              </div>
              <div className="row spread" style={{ marginTop: 4 }}>
                <span className="faint">Expiry Date:</span>
                <span>{formatExpiry(writeOffModal.expiryDate)} ({writeOffModal.urgencyLabel})</span>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 16 }}>
              <label>Reason for Removal / Disposal</label>
              <select
                className="select"
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
              >
                <option value="Expired stock disposal">Expired stock disposal</option>
                <option value="Damaged / Unusable stock">Damaged / Unusable stock</option>
                <option value="Shelf clearance markdown">Shelf clearance markdown</option>
                <option value="Stock audit adjustment">Stock audit adjustment</option>
                <option value="Customer return discarded">Customer return discarded</option>
              </select>
            </div>

            <div className="row end" style={{ gap: 8 }}>
              <button className="btn" disabled={busy} onClick={() => setWriteOffModal(null)}>
                Cancel
              </button>
              <button className="btn danger" disabled={busy} onClick={handleWriteOff}>
                {busy ? 'Writing Off…' : 'Confirm Disposal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
