import { describe, it, expect } from 'vitest'
import { fefoSort, daysUntil, batchStatus, parseExpiry } from '../lib/fefo'

describe('FEFO (First-Expiry-First-Out) Utilities', () => {
  it('correctly calculates days until expiry', () => {
    const today = new Date()
    const futureDate = new Date(today)
    futureDate.setDate(today.getDate() + 10)
    const futureIso = futureDate.toISOString().slice(0, 10)

    const days = daysUntil(futureIso)
    expect(days).toBeGreaterThanOrEqual(9)
    expect(days).toBeLessThanOrEqual(11)
  })

  it('detects expired dates as negative days and returns Expired status', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 5)
    const pastIso = pastDate.toISOString().slice(0, 10)

    const days = daysUntil(pastIso)
    expect(days).toBeLessThan(0)

    const status = batchStatus(pastIso, 10, 5)
    expect(status.tone).toBe('bad')
    expect(status.text).toBe('Expired')
  })

  it('sorts batches with earliest expiry first (FEFO)', () => {
    const batches = [
      { id: 'b3', expiryDate: '2026-12-01', qty: 10 },
      { id: 'b1', expiryDate: '2026-05-01', qty: 5 },
      { id: 'b4', expiryDate: '', qty: 20 }, // no expiry date goes last
      { id: 'b2', expiryDate: '2026-08-15', qty: 8 },
    ]

    const sorted = fefoSort(batches)
    expect(sorted[0].id).toBe('b1')
    expect(sorted[1].id).toBe('b2')
    expect(sorted[2].id).toBe('b3')
    expect(sorted[3].id).toBe('b4')
  })

  it('breaks ties using smaller quantity to clear near-empty batches', () => {
    const batches = [
      { id: 'b2', expiryDate: '2026-06-01', qty: 20 },
      { id: 'b1', expiryDate: '2026-06-01', qty: 5 },
    ]

    const sorted = fefoSort(batches)
    expect(sorted[0].id).toBe('b1')
    expect(sorted[1].id).toBe('b2')
  })

  it('handles null, undefined, and malformed dates gracefully', () => {
    expect(daysUntil(null)).toBeNull()
    expect(daysUntil('')).toBeNull()
    expect(daysUntil('invalid-date')).toBeNull()
    expect(parseExpiry(null)).toBeNull()
  })
})
