import { describe, it, expect } from 'vitest'

export function computeCartTotals(cart = [], manualDiscount = undefined) {
  const totalQty = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0)
  const totalMrp = cart.reduce((s, it) => {
    const mrp = Number(it.mrp !== undefined && it.mrp !== null && it.mrp !== '' ? it.mrp : it.unitPrice || 0)
    return s + ((Number(it.qty) || 0) * mrp)
  }, 0)
  const subtotal = cart.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0)

  // Auto discount is calculated by the difference between MRP and selling price (unitPrice)
  const autoDiscount = cart.reduce((s, it) => {
    const mrp = Number(it.mrp !== undefined && it.mrp !== null && it.mrp !== '' ? it.mrp : it.unitPrice || 0)
    const sp = Number(it.unitPrice) || 0
    const diff = Math.max(0, mrp - sp)
    return s + (diff * (Number(it.qty) || 0))
  }, 0)

  const discountToUse = manualDiscount !== undefined ? manualDiscount : autoDiscount
  const safeDiscount = Math.min(Math.max(totalMrp, subtotal), Math.max(0, Number(discountToUse) || 0))
  const grandTotal = Math.max(0, Math.round(subtotal * 100) / 100)

  return { totalQty, totalMrp, subtotal, discount: safeDiscount, grandTotal }
}

describe('POS Billing & Cart Calculations', () => {
  it('automatically calculates discount as difference between MRP and Selling Price', () => {
    const cart = [
      { sku: 'SKU1', batchId: 'b1', qty: 2, mrp: 60, unitPrice: 50 }, // diff = 10 * 2 = 20
      { sku: 'SKU2', batchId: 'b2', qty: 3, mrp: 25, unitPrice: 20 }, // diff = 5 * 3 = 15
    ]
    const totals = computeCartTotals(cart)
    expect(totals.totalQty).toBe(5)
    expect(totals.totalMrp).toBe(195)
    expect(totals.subtotal).toBe(160)
    expect(totals.discount).toBe(35) // ₹35 total savings for customer
    expect(totals.grandTotal).toBe(160) // Payable is selling price subtotal
  })

  it('yields 0 discount when MRP equals selling price', () => {
    const cart = [
      { sku: 'SKU1', batchId: 'b1', qty: 2, mrp: 50, unitPrice: 50 },
    ]
    const totals = computeCartTotals(cart)
    expect(totals.totalQty).toBe(2)
    expect(totals.totalMrp).toBe(100)
    expect(totals.subtotal).toBe(100)
    expect(totals.discount).toBe(0)
    expect(totals.grandTotal).toBe(100)
  })

  it('defaults MRP to unitPrice if mrp is undefined, resulting in 0 discount', () => {
    const cart = [
      { sku: 'SKU1', batchId: 'b1', qty: 1, unitPrice: 100 },
    ]
    const totals = computeCartTotals(cart)
    expect(totals.totalMrp).toBe(100)
    expect(totals.subtotal).toBe(100)
    expect(totals.discount).toBe(0)
    expect(totals.grandTotal).toBe(100)
  })

  it('prevents negative discount if selling price exceeds MRP', () => {
    const cart = [
      { sku: 'SKU1', batchId: 'b1', qty: 1, mrp: 80, unitPrice: 100 },
    ]
    const totals = computeCartTotals(cart)
    expect(totals.discount).toBe(0)
    expect(totals.grandTotal).toBe(100)
  })

  it('supports legacy manual discount override while capping safely', () => {
    const cart = [
      { sku: 'SKU1', batchId: 'b1', qty: 2, unitPrice: 50 },
      { sku: 'SKU2', batchId: 'b2', qty: 3, unitPrice: 20 },
    ]
    const totals = computeCartTotals(cart, 10)
    expect(totals.totalQty).toBe(5)
    expect(totals.subtotal).toBe(160)
    expect(totals.discount).toBe(10)
    expect(totals.grandTotal).toBe(160)
  })

  it('handles negative manual discount by resetting to zero', () => {
    const cart = [
      { sku: 'SKU1', batchId: 'b1', qty: 1, unitPrice: 100 },
    ]
    const totals = computeCartTotals(cart, -20)
    expect(totals.discount).toBe(0)
    expect(totals.grandTotal).toBe(100)
  })
})
