import { EXPIRY_WINDOWS } from './constants'

const MS_PER_DAY = 86_400_000

// Expiry dates are stored as ISO 'YYYY-MM-DD' strings (date-only, no timezone
// surprises). Parse at local midnight.
export function parseExpiry(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function daysUntil(expiry, from = new Date()) {
  const date = typeof expiry === 'string' ? parseExpiry(expiry) : expiry
  if (!date) return null
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((date - a) / MS_PER_DAY)
}

// One label for a batch given its expiry and stock level vs reorder point.
// Returns { tone: 'good'|'warn'|'bad', text, days }.
export function batchStatus(expiry, qty, reorderLevel) {
  const days = daysUntil(expiry)
  const low = typeof reorderLevel === 'number' && qty <= reorderLevel

  if (days !== null && days < 0) {
    return { tone: 'bad', text: 'Expired', days }
  }
  if (days !== null && days <= EXPIRY_WINDOWS.CRITICAL) {
    return { tone: 'bad', text: `Expiring ${days}d`, days }
  }
  if (days !== null && days <= EXPIRY_WINDOWS.WARN) {
    return { tone: 'warn', text: low ? 'Low + Expiring' : `Expiring ${days}d`, days }
  }
  if (low) {
    return { tone: 'warn', text: 'Low stock', days }
  }
  if (days !== null && days <= EXPIRY_WINDOWS.WATCH) {
    return { tone: 'warn', text: `Watch (${days}d)`, days }
  }
  return { tone: 'good', text: 'Good', days }
}

// First-Expiry-First-Out: soonest expiry first. Batches with no expiry sink to
// the bottom. Ties broken by smaller quantity so near-empty batches clear out.
export function fefoSort(batches) {
  return [...batches].sort((a, b) => {
    const da = daysUntil(a.expiryDate)
    const db = daysUntil(b.expiryDate)
    if (da === null && db === null) return a.qty - b.qty
    if (da === null) return 1
    if (db === null) return -1
    if (da !== db) return da - db
    return a.qty - b.qty
  })
}

// Pretty date for display, e.g. 15-Jun-2026.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function formatExpiry(value) {
  const date = parseExpiry(value)
  if (!date) return '—'
  const d = String(date.getDate()).padStart(2, '0')
  return `${d}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`
}
