import { describe, it, expect } from 'vitest'
import {
  formatPhoneNumber,
  buildWhatsAppExpiryMessage,
  buildSmsExpiryMessage,
  getWhatsAppUrl,
  getSmsUrl,
} from '../lib/expiryNotifications'

describe('Expiry Notifications (SMS & WhatsApp)', () => {
  it('normalizes 10-digit and international phone numbers accurately', () => {
    expect(formatPhoneNumber('9876543210')).toBe('919876543210')
    expect(formatPhoneNumber('+91 98765 43210')).toBe('919876543210')
    expect(formatPhoneNumber('91-98765-43210')).toBe('919876543210')
    expect(formatPhoneNumber('+1 (555) 234-5678')).toBe('15552345678')
  })

  it('builds an itemized WhatsApp alert with batch, expiry, and action recommendations', () => {
    const items = [
      {
        sku: 'AMOX-500',
        product: { productName: 'Amoxicillin 500mg' },
        batchNo: 'B-101',
        qty: 30,
        expiryDate: '2026-10-15',
        days: 5,
        actionRecommendation: 'Flash Clearance (50% Off)',
      },
      {
        sku: 'MILK-1L',
        product: { productName: 'Fresh Milk 1L' },
        batchNo: 'M-9',
        qty: 12,
        expiryDate: '2026-10-09',
        days: -1,
        actionRecommendation: 'Dispose / Write-off',
      },
    ]

    const msg = buildWhatsAppExpiryMessage({
      shopName: 'Aero Pharmacy',
      accountHolderName: 'Rajesh Patel',
      items,
    })

    expect(msg).toContain('Aero Pharmacy')
    expect(msg).toContain('Rajesh Patel')
    expect(msg).toContain('Amoxicillin 500mg')
    expect(msg).toContain('B-101')
    expect(msg).toContain('5 days left')
    expect(msg).toContain('Fresh Milk 1L')
    expect(msg).toContain('EXPIRED 1d ago')
    expect(msg).toContain('42 total units')
  })

  it('builds a concise SMS alert suitable for mobile text messaging', () => {
    const items = [
      {
        sku: 'DOLO-650',
        product: { productName: 'Dolo 650mg' },
        batchNo: 'D-22',
        qty: 50,
      },
      {
        sku: 'PAN-40',
        product: { productName: 'Pan 40mg' },
        batchNo: 'P-11',
        qty: 25,
      },
    ]

    const sms = buildSmsExpiryMessage({
      shopName: 'City Meds',
      items,
    })

    expect(sms).toContain('[StockFlow Alert]')
    expect(sms).toContain('City Meds')
    expect(sms).toContain('2 batches (75 units)')
    expect(sms).toContain('Dolo 650mg, Pan 40mg')
    expect(sms.length).toBeLessThan(250)
  })

  it('generates valid WhatsApp click-to-chat and SMS scheme links', () => {
    const waUrl = getWhatsAppUrl('9876543210', 'Test Alert Message')
    expect(waUrl).toContain('https://api.whatsapp.com/send?phone=919876543210')
    expect(waUrl).toContain('text=Test%20Alert%20Message')

    const smsUrl = getSmsUrl('9876543210', 'SMS Alert')
    expect(smsUrl).toContain('sms:919876543210?body=SMS%20Alert')
  })
})
