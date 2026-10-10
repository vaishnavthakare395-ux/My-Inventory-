import { describe, it, expect } from 'vitest'

// Core anti-gouging business logic validation function
export function validateEmergencyPrice(buyingPrice, sellingPrice, emergencyPrice) {
  const bp = Number(buyingPrice) || 0
  const sp = Number(sellingPrice) || 0
  const ep = Number(emergencyPrice) || 0

  if (bp > 0 && sp > bp && ep > 0) {
    const normalProfit = sp - bp
    const emergencyProfit = ep - bp
    const maxAllowedProfit = 0.75 * normalProfit
    if (emergencyProfit >= maxAllowedProfit) {
      return {
        valid: false,
        error: `Emergency profit (₹${emergencyProfit.toFixed(2)}) must be strictly less than 75% of normal profit (₹${maxAllowedProfit.toFixed(2)}).`,
        normalProfit,
        emergencyProfit,
        maxAllowedProfit,
      }
    }
  }
  return { valid: true, error: null }
}

describe('Anti-Gouging Emergency Pricing Calculations', () => {
  it('accepts compliant emergency prices with profit < 75% of normal profit', () => {
    // Normal: Buying 100, Selling 200 -> Profit = 100. Max allowed profit = 75.
    // Emergency Price 160 -> Emergency Profit = 60 (60 < 75 -> Compliant)
    const res = validateEmergencyPrice(100, 200, 160)
    expect(res.valid).toBe(true)
    expect(res.error).toBeNull()
  })

  it('rejects gouging prices where profit is >= 75% of normal profit', () => {
    // Buying 100, Selling 200 -> Normal Profit = 100. Max allowed profit = 75.
    // Emergency Price 180 -> Emergency Profit = 80 (80 >= 75 -> Rejected)
    const res = validateEmergencyPrice(100, 200, 180)
    expect(res.valid).toBe(false)
    expect(res.error).toContain('strictly less than 75%')
  })

  it('rejects emergency price that exactly hits 75% boundary', () => {
    // Buying 100, Selling 200 -> Profit = 100. Exactly 75% is 75 -> Emergency Price 175
    const res = validateEmergencyPrice(100, 200, 175)
    expect(res.valid).toBe(false)
  })
})
