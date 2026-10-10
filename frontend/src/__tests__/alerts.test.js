import { describe, it, expect } from 'vitest'
import { buildAlerts, alertCounts } from '../lib/alerts'

describe('Stock & Expiry Alerts Logic', () => {
  const futureIso = (offsetDays) => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }

  it('builds critical alerts for batches expiring within 7 days', () => {
    const batches = [
      { sku: 'MED-PCM', batchNo: 'B1', qty: 20, expiryDate: futureIso(4) },
      { sku: 'MED-PCM', batchNo: 'B2', qty: 50, expiryDate: futureIso(120) },
    ]
    const productsBySku = {
      'MED-PCM': { productName: 'Paracetamol 500mg', reorderLevel: 5 },
    }

    const alerts = buildAlerts(batches, productsBySku)
    expect(alerts.length).toBe(1)
    expect(alerts[0].severity).toBe('critical')
    expect(alerts[0].kind).toBe('expiry')
    expect(alerts[0].batchNo).toBe('B1')
  })

  it('builds high alerts for batches expiring between 8 and 15 days', () => {
    const batches = [
      { sku: 'MED-PCM', batchNo: 'B1', qty: 20, expiryDate: futureIso(10) },
    ]
    const productsBySku = {
      'MED-PCM': { productName: 'Paracetamol 500mg', reorderLevel: 5 },
    }

    const alerts = buildAlerts(batches, productsBySku)
    expect(alerts.length).toBe(1)
    expect(alerts[0].severity).toBe('high')
    expect(alerts[0].kind).toBe('expiry')
  })

  it('builds low stock alerts when quantity is less than or equal to reorder level', () => {
    const batches = [
      { sku: 'TEA-RED', batchNo: 'B3', qty: 3, expiryDate: futureIso(180) },
    ]
    const productsBySku = {
      'TEA-RED': { productName: 'Red Label Tea 250g', reorderLevel: 5 },
    }

    const alerts = buildAlerts(batches, productsBySku)
    expect(alerts.length).toBe(1)
    expect(alerts[0].kind).toBe('low')
    expect(alerts[0].qty).toBe(3)
  })

  it('computes aggregated counts accurately', () => {
    const alerts = [
      { kind: 'expiry', severity: 'expired' },
      { kind: 'expiry', severity: 'critical' },
      { kind: 'expiry', severity: 'watch' },
      { kind: 'low', severity: 'high' },
    ]

    const counts = alertCounts(alerts)
    expect(counts.total).toBe(4)
    expect(counts.lowStock).toBe(1)
    expect(counts.expiry).toBe(3)
    expect(counts.urgent).toBe(2) // expired + critical
  })

  it('ignores batches with zero or negative quantity', () => {
    const batches = [
      { sku: 'MED-PCM', batchNo: 'B0', qty: 0, expiryDate: futureIso(2) },
    ]
    const productsBySku = {
      'MED-PCM': { productName: 'Paracetamol 500mg', reorderLevel: 10 },
    }

    const alerts = buildAlerts(batches, productsBySku)
    expect(alerts.length).toBe(0)
  })
})
