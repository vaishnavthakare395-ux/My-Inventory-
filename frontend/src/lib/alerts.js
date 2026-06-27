import { EXPIRY_WINDOWS } from './constants'
import { daysUntil } from './fefo'

// Turns the active location's batches into a flat list of alerts the bell and
// dashboard show. Two kinds: expiry (near/over) and low stock (<= reorderLevel).
export function buildAlerts(batches = [], productsBySku = {}) {
  const out = []
  for (const b of batches) {
    if (!b || b.qty <= 0) continue
    const product = productsBySku[b.sku] || {}
    const name = product.productName || b.sku
    const days = daysUntil(b.expiryDate)

    if (days !== null) {
      if (days < 0) {
        out.push(alert('expiry', 'expired', b, `${name} — batch ${b.batchNo} EXPIRED (${Math.abs(days)}d ago)`, days))
      } else if (days <= EXPIRY_WINDOWS.CRITICAL) {
        out.push(alert('expiry', 'critical', b, `${name} — batch ${b.batchNo} expires in ${days}d`, days))
      } else if (days <= EXPIRY_WINDOWS.HIGH) {
        out.push(alert('expiry', 'high', b, `${name} — batch ${b.batchNo} expires in ${days}d`, days))
      } else if (days <= EXPIRY_WINDOWS.WATCH) {
        out.push(alert('expiry', 'watch', b, `${name} — batch ${b.batchNo} expires in ${days}d`, days))
      }
    }

    const reorder = Number(product.reorderLevel) || 0
    if (reorder > 0 && b.qty <= reorder) {
      out.push(alert('low', 'high', b, `${name} — low stock (${b.qty} ≤ ${reorder})`, days))
    }
  }

  // Most urgent first.
  const order = { expired: 0, critical: 1, high: 2, watch: 3 }
  return out.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
}

function alert(kind, severity, b, message, days) {
  return { kind, severity, sku: b.sku, batchNo: b.batchNo, qty: b.qty, days, message }
}

export function alertCounts(alerts = []) {
  let lowStock = 0
  let expiry = 0
  let urgent = 0
  for (const a of alerts) {
    if (a.kind === 'low') lowStock++
    else expiry++
    if (a.severity === 'critical' || a.severity === 'expired') urgent++
  }
  return { total: alerts.length, lowStock, expiry, urgent }
}
