import { describe, it, expect } from 'vitest'
import {
  getMonthDateRange,
  calculateBillMetrics,
  calculateAllMonthsHistory,
  calculateDailyComparison,
  calculateProductLosses,
  getBillDate,
} from '../lib/analysisCalculations'

describe('Sales Analysis Calculation Engine', () => {
  describe('getMonthDateRange', () => {
    it('accurately computes month start and end dates', () => {
      const sep = getMonthDateRange('2026-09')
      expect(sep.startDate.getFullYear()).toBe(2026)
      expect(sep.startDate.getMonth()).toBe(8) // September is index 8
      expect(sep.startDate.getDate()).toBe(1)
      expect(sep.endDate.getDate()).toBe(30)

      const oct = getMonthDateRange('2026-10')
      expect(oct.startDate.getDate()).toBe(1)
      expect(oct.endDate.getDate()).toBe(31)

      const feb2024 = getMonthDateRange('2024-02') // leap year
      expect(feb2024.endDate.getDate()).toBe(29)
    })
  })

  describe('getBillDate', () => {
    it('parses timestamps, dates, and ISO strings correctly', () => {
      const d = new Date('2026-08-15T10:00:00Z')
      expect(getBillDate({ createdAt: d }).getTime()).toBe(d.getTime())

      // Firestore Timestamp-like object
      const fakeTs = { toDate: () => d }
      expect(getBillDate({ createdAt: fakeTs }).getTime()).toBe(d.getTime())

      const fakeMillis = { toMillis: () => d.getTime() }
      expect(getBillDate({ createdAt: fakeMillis }).getTime()).toBe(d.getTime())

      // ISO string
      expect(getBillDate({ createdAt: '2026-08-15T10:00:00Z' }).getTime()).toBe(d.getTime())
    })
  })

  describe('calculateBillMetrics', () => {
    const productsBySku = {
      'PARACET-500': { sku: 'PARACET-500', buyingPrice: 20, sellingPrice: 35 },
      'AMOX-250': { sku: 'AMOX-250', buyingPrice: 50, sellingPrice: 80 },
    }

    it('calculates revenue, COGS, net profit amount and profit margin', () => {
      const sampleBills = [
        {
          id: 'bill-1',
          invoiceNo: 'INV-101',
          createdAt: new Date('2026-10-05T12:00:00'),
          grandTotal: 150,
          items: [
            { sku: 'PARACET-500', qty: 2, unitPrice: 35, buyingPrice: 20 }, // rev 70, cogs 40
            { sku: 'AMOX-250', qty: 1, unitPrice: 80, buyingPrice: 50 }, // rev 80, cogs 50
          ],
        },
      ]

      const analyzed = calculateBillMetrics(sampleBills, productsBySku)
      expect(analyzed).toHaveLength(1)
      const b = analyzed[0]
      expect(b.revenue).toBe(150)
      expect(b.cogs).toBe(90) // 40 + 50
      expect(b.profit).toBe(60) // 150 - 90
      expect(b.profitMargin).toBe(40) // 60 / 150 * 100 = 40%
      expect(b.monthKey).toBe('2026-10')
      expect(b.day).toBe(5)
    })
  })

  describe('calculateAllMonthsHistory', () => {
    it('aggregates multi-month sales bills into chronological month intervals with profit amount & percentage', () => {
      const bills = [
        {
          monthKey: '2026-08',
          revenue: 1000,
          cogs: 600,
          profit: 400,
        },
        {
          monthKey: '2026-08',
          revenue: 500,
          cogs: 300,
          profit: 200,
        },
        {
          monthKey: '2026-09',
          revenue: 2000,
          cogs: 1200,
          profit: 800,
        },
        {
          monthKey: '2026-10',
          revenue: 1500,
          cogs: 900,
          profit: 600,
        },
      ]

      const history = calculateAllMonthsHistory(bills)
      expect(history).toHaveLength(3)

      // August 2026
      expect(history[0].monthKey).toBe('2026-08')
      expect(history[0].billsCount).toBe(2)
      expect(history[0].totalRevenue).toBe(1500)
      expect(history[0].totalCogs).toBe(900)
      expect(history[0].totalProfit).toBe(600)
      expect(history[0].profitMargin).toBe(40) // 600 / 1500 = 40%
      expect(history[0].startDateFormatted).toBeDefined()
      expect(history[0].endDateFormatted).toBeDefined()

      // September 2026
      expect(history[1].monthKey).toBe('2026-09')
      expect(history[1].totalRevenue).toBe(2000)
      expect(history[1].totalProfit).toBe(800)
      expect(history[1].profitMargin).toBe(40)
      // MoM growth from 600 to 800: (800 - 600) / 600 * 100 = 33.33%
      expect(history[1].momGrowth).toBeCloseTo(33.33, 1)

      // October 2026
      expect(history[2].monthKey).toBe('2026-10')
      expect(history[2].totalRevenue).toBe(1500)
      expect(history[2].totalProfit).toBe(600)
      // MoM growth from 800 to 600: (600 - 800) / 800 * 100 = -25%
      expect(history[2].momGrowth).toBe(-25)
    })
  })

  describe('calculateDailyComparison', () => {
    it('creates 31-day comparison series for current vs last month', () => {
      const currentMonthBills = [
        { day: 1, revenue: 500, profit: 200 },
        { day: 5, revenue: 1000, profit: 400 },
      ]
      const lastMonthBills = [
        { day: 1, revenue: 300, profit: 120 },
        { day: 5, revenue: 800, profit: 320 },
      ]

      const dailyRevenue = calculateDailyComparison(
        currentMonthBills,
        lastMonthBills,
        2026,
        9, // Oct
        2026,
        8, // Sep
        'revenue'
      )

      expect(dailyRevenue.length).toBeGreaterThanOrEqual(30)
      expect(dailyRevenue[0]).toEqual({ day: 'Day 1', currentMonth: 500, lastMonth: 300 })
      expect(dailyRevenue[4]).toEqual({ day: 'Day 5', currentMonth: 1000, lastMonth: 800 })
      expect(dailyRevenue[1]).toEqual({ day: 'Day 2', currentMonth: 0, lastMonth: 0 })
    })
  })

  describe('calculateProductLosses', () => {
    const productsBySku = {
      'MED-01': { sku: 'MED-01', productName: 'Cough Syrup', buyingPrice: 40, category: 'Pharma' },
      'MED-02': { sku: 'MED-02', productName: 'Pain Balm', buyingPrice: 25, category: 'Pharma' },
    }

    it('identifies expired inventory waste losses', () => {
      const batches = [
        {
          id: 'b-exp',
          sku: 'MED-01',
          batchNo: 'B-EXPIRED',
          qty: 10,
          buyingPrice: 40,
          expiryDate: '2026-01-01', // well in the past
        },
      ]
      const losses = calculateProductLosses(batches, [], [], productsBySku)
      expect(losses).toHaveLength(1)
      expect(losses[0].reasonType).toBe('expired')
      expect(losses[0].totalLoss).toBe(400) // 10 * 40
      expect(losses[0].lostQty).toBe(10)
    })

    it('identifies damaged customer returns as losses', () => {
      const returns = [
        {
          id: 'ret-1',
          sku: 'MED-02',
          batchNo: 'B-DAMAGED',
          returnedQty: 4,
          conditionStatus: 'Damaged',
        },
      ]
      const losses = calculateProductLosses([], returns, [], productsBySku)
      expect(losses).toHaveLength(1)
      expect(losses[0].reasonType).toBe('return')
      expect(losses[0].totalLoss).toBe(100) // 4 * 25
    })

    it('identifies items sold below cost price (negative margin)', () => {
      const bills = [
        {
          id: 'bill-loss',
          invoiceNo: 'INV-DISC',
          items: [
            {
              sku: 'MED-01',
              qty: 5,
              unitPrice: 30, // sold at 30, but bought at 40 -> loss of 10 per unit
              buyingPrice: 40,
            },
          ],
        },
      ]
      const losses = calculateProductLosses([], [], bills, productsBySku)
      expect(losses).toHaveLength(1)
      expect(losses[0].reasonType).toBe('discount')
      expect(losses[0].totalLoss).toBe(50) // 5 * 10
    })

    it('sorts multiple losses by highest loss amount first', () => {
      const batches = [
        { id: 'b1', sku: 'MED-01', qty: 2, buyingPrice: 40, expiryDate: '2026-01-01' }, // 80 loss
        { id: 'b2', sku: 'MED-02', qty: 20, buyingPrice: 25, expiryDate: '2026-01-01' }, // 500 loss
      ]
      const losses = calculateProductLosses(batches, [], [], productsBySku)
      expect(losses).toHaveLength(2)
      expect(losses[0].totalLoss).toBe(500)
      expect(losses[1].totalLoss).toBe(80)
    })
  })
})
