import { daysUntil } from './fefo'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Parses and extracts a standard Date object from a Firestore bill createdAt
 */
export function getBillDate(b) {
  if (!b) return new Date()
  if (b.createdAt?.toDate) return b.createdAt.toDate()
  if (b.createdAt?.toMillis) return new Date(b.createdAt.toMillis())
  if (typeof b.createdAt === 'string') return new Date(b.createdAt)
  if (b.createdAt instanceof Date) return b.createdAt
  return new Date()
}

/**
 * Returns formatted start and end dates for a monthKey (YYYY-MM)
 * e.g. "2026-09" -> { startDate: "01 Sep 2026", endDate: "30 Sep 2026" }
 */
export function getMonthDateRange(monthKey) {
  const [yr, mth] = monthKey.split('-').map(Number)
  const startDate = new Date(yr, mth - 1, 1)
  const endDate = new Date(yr, mth, 0) // last day of that month

  return {
    startDate,
    endDate,
    startDateFormatted: startDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    endDateFormatted: endDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  }
}

/**
 * Enriches bills with revenue, cost of goods sold (COGS), net profit, and profit margin.
 */
export function calculateBillMetrics(bills = [], productsBySku = {}) {
  return bills.map((b) => {
    const bDate = getBillDate(b)
    const yKey = `${bDate.getFullYear()}-${String(bDate.getMonth() + 1).padStart(2, '0')}`
    const day = bDate.getDate()

    const revenue = Number(b.grandTotal || b.subtotal || 0)

    let cogs = 0
    for (const it of b.items || []) {
      const prod = productsBySku[it.sku] || {}
      const buyingPrice = Number(it.buyingPrice || prod.buyingPrice || 0)
      cogs += Number(it.qty || 1) * buyingPrice
    }

    const profit = Math.max(-revenue, revenue - cogs)
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0

    return {
      ...b,
      dateObj: bDate,
      monthKey: yKey,
      day,
      revenue,
      cogs,
      profit,
      profitMargin,
    }
  })
}

/**
 * Computes all-months profit history with beginning and ending dates, revenue, profit amount,
 * and profit percentage (profit margin).
 */
export function calculateAllMonthsHistory(analyzedBills = []) {
  const map = new Map()

  for (const b of analyzedBills) {
    if (!map.has(b.monthKey)) {
      const [yr, mth] = b.monthKey.split('-').map(Number)
      const range = getMonthDateRange(b.monthKey)

      map.set(b.monthKey, {
        monthKey: b.monthKey,
        label: `${MONTH_NAMES[mth - 1]} ${yr}`,
        startDateFormatted: range.startDateFormatted,
        endDateFormatted: range.endDateFormatted,
        billsCount: 0,
        totalRevenue: 0,
        totalCogs: 0,
        totalProfit: 0,
      })
    }
    const entry = map.get(b.monthKey)
    entry.billsCount += 1
    entry.totalRevenue += b.revenue
    entry.totalCogs += b.cogs
    entry.totalProfit += b.profit
  }

  // Sort ascending chronologically
  const sorted = Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  return sorted.map((m, idx) => {
    const margin = m.totalRevenue > 0 ? (m.totalProfit / m.totalRevenue) * 100 : 0
    let momGrowth = 0
    if (idx > 0) {
      const prev = sorted[idx - 1]
      momGrowth =
        prev.totalProfit !== 0
          ? ((m.totalProfit - prev.totalProfit) / Math.abs(prev.totalProfit)) * 100
          : 0
    }
    return {
      ...m,
      profitMargin: margin,
      momGrowth,
    }
  })
}

/**
 * Computes daily 1-31 comparison data points between current month and last month.
 */
export function calculateDailyComparison(
  currentMonthBills = [],
  lastMonthBills = [],
  currentYear,
  currentMonthIdx,
  lastYear,
  lastMonthIdx,
  chartMode = 'revenue'
) {
  const daysInCurrentMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate()
  const daysInLastMonth = new Date(lastYear, lastMonthIdx + 1, 0).getDate()
  const maxDays = Math.max(daysInCurrentMonth, daysInLastMonth, 31)

  const curDayMap = {}
  for (const b of currentMonthBills) {
    curDayMap[b.day] = (curDayMap[b.day] || 0) + (chartMode === 'revenue' ? b.revenue : b.profit)
  }

  const lastDayMap = {}
  for (const b of lastMonthBills) {
    lastDayMap[b.day] = (lastDayMap[b.day] || 0) + (chartMode === 'revenue' ? b.revenue : b.profit)
  }

  const points = []
  for (let d = 1; d <= maxDays; d++) {
    points.push({
      day: `Day ${d}`,
      currentMonth: Math.round((curDayMap[d] || 0) * 100) / 100,
      lastMonth: Math.round((lastDayMap[d] || 0) * 100) / 100,
    })
  }
  return points
}

/**
 * Diagnoses product-wise losses: expired stock waste, damaged returns, sold below cost.
 */
export function calculateProductLosses(
  batches = [],
  returnsList = [],
  bills = [],
  productsBySku = {}
) {
  const losses = []

  // 1. Expired Stock Inventory Waste
  for (const b of batches) {
    const days = daysUntil(b.expiryDate)
    if (days !== null && days < 0 && b.qty > 0) {
      const prod = productsBySku[b.sku] || {}
      const bp = Number(b.buyingPrice || prod.buyingPrice || 0)
      const lossAmount = b.qty * bp
      losses.push({
        id: `exp-${b.id}`,
        sku: b.sku,
        productName: prod.productName || b.sku,
        category: prod.category || 'General',
        batchNo: b.batchNo || '—',
        reason: 'Expired Inventory Waste',
        reasonType: 'expired',
        lostQty: b.qty,
        unitCost: bp,
        totalLoss: lossAmount,
        recommendation: 'Write off batch and adjust disposal tax ledger.',
      })
    }
  }

  // 2. Damaged / Expired Customer Returns
  for (const ret of returnsList) {
    if (ret.conditionStatus === 'Damaged' || ret.conditionStatus === 'Expired') {
      const prod = productsBySku[ret.sku] || {}
      const bp = Number(prod.buyingPrice || 0)
      const qty = Number(ret.returnedQty || 0)
      const lossAmount = qty * bp
      losses.push({
        id: `ret-${ret.id}`,
        sku: ret.sku,
        productName: prod.productName || ret.sku,
        category: prod.category || 'Returns',
        batchNo: ret.batchNo || '—',
        reason: `Damaged Return (${ret.conditionStatus})`,
        reasonType: 'return',
        lostQty: qty,
        unitCost: bp,
        totalLoss: lossAmount,
        recommendation: 'File return-to-vendor (RTV) credit claim.',
      })
    }
  }

  // 3. Negative Margin / Heavy Discount Loss in Sales
  for (const b of bills) {
    for (const it of b.items || []) {
      const prod = productsBySku[it.sku] || {}
      const bp = Number(it.buyingPrice || prod.buyingPrice || 0)
      const sp = Number(it.unitPrice || 0)
      if (bp > 0 && sp < bp) {
        const unitLoss = bp - sp
        const totalItemLoss = unitLoss * Number(it.qty || 1)
        losses.push({
          id: `disc-${b.id}-${it.sku}`,
          sku: it.sku,
          productName: it.productName || it.sku,
          category: 'Pricing',
          batchNo: it.batchNo || '—',
          reason: `Sold Below Cost (Inv #${b.invoiceNo})`,
          reasonType: 'discount',
          lostQty: Number(it.qty || 1),
          unitCost: bp,
          totalLoss: totalItemLoss,
          recommendation: 'Review POS discount cap to prevent selling below cost.',
        })
      }
    }
  }

  return losses.sort((a, b) => b.totalLoss - a.totalLoss)
}
