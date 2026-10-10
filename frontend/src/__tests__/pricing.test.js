import { describe, it, expect } from 'vitest'

// Core anti-gouging business logic validation function
export function validateEmergencyPrice(buyingPrice, sellingPrice, emergencyPrice) {
  const bp = Number(buyingPrice) || 0
  const sp = Number(sellingPrice) || 0
  const ep = Number(emergencyPrice) || 0

  if (bp > 0 && sp > bp && ep > 0) {
    const normalProfit = sp - bp
    const emergencyProfit = ep - bp
    const maxAllowedProfit = 0.60 * normalProfit
    if (emergencyProfit >= maxAllowedProfit) {
      return {
        valid: false,
        error: `Emergency profit (₹${emergencyProfit.toFixed(2)}) must be strictly less than 60% of normal profit (₹${maxAllowedProfit.toFixed(2)}).`,
        normalProfit,
        emergencyProfit,
        maxAllowedProfit,
      }
    }
  }
  return { valid: true, error: null }
}

describe('Anti-Gouging Emergency Pricing Calculations', () => {
  it('accepts compliant emergency prices with profit < 60% of normal profit', () => {
    // Normal: Buying 100, Selling 150 -> Profit = 50. Max allowed profit = 30.
    // Emergency Price 125 -> Emergency Profit = 25 (25 < 30 -> Compliant)
    const res = validateEmergencyPrice(100, 150, 125)
    expect(res.valid).toBe(true)
    expect(res.error).toBeNull()
  })

  it('rejects gouging prices where profit is >= 60% of normal profit', () => {
    // Buying 100, Selling 150 -> Normal Profit = 50. Max allowed profit = 30.
    // Emergency Price 135 -> Emergency Profit = 35 (35 >= 30 -> Rejected)
    const res = validateEmergencyPrice(100, 150, 135)
    expect(res.valid).toBe(false)
    expect(res.error).toContain('strictly less than 60%')
  })

  it('rejects emergency price that exactly hits 60% boundary', () => {
    // Buying 100, Selling 150 -> Profit = 50. Exactly 60% is 30 -> Emergency Price 130
    const res = validateEmergencyPrice(100, 150, 130)
    expect(res.valid).toBe(false)
  })
})
