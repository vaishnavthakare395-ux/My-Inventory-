import { useEffect, useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useToast } from '../lib/ToastContext'
import { listBills, batchesAtLocation, listReturns, getProductsBySkus } from '../lib/api'
import {
  calculateBillMetrics,
  calculateAllMonthsHistory,
  calculateDailyComparison,
  calculateProductLosses,
  MONTH_NAMES,
} from '../lib/analysisCalculations'

export default function SalesAnalysis() {
  const { activeLocation } = useWorkspace()
  const toast = useToast()

  const [bills, setBills] = useState([])
  const [batches, setBatches] = useState([])
  const [returnsList, setReturnsList] = useState([])
  const [productsBySku, setProductsBySku] = useState({})
  const [loading, setLoading] = useState(true)

  // Modal for All-Months Profit History
  const [showAllMonthsModal, setShowAllMonthsModal] = useState(false)
  const [chartMode, setChartMode] = useState('revenue') // 'revenue' | 'profit'

  useEffect(() => {
    if (!activeLocation) return
    setLoading(true)

    Promise.all([
      listBills(activeLocation.id),
      batchesAtLocation(activeLocation.id),
      listReturns(activeLocation.id),
    ])
      .then(async ([bData, invData, retData]) => {
        setBills(bData || [])
        setBatches(invData || [])
        setReturnsList(retData || [])

        // Fetch product catalog for pricing details
        const skus = [
          ...new Set([
            ...(invData || []).map((x) => x.sku),
            ...(retData || []).map((x) => x.sku),
            ...(bData || []).flatMap((b) => (b.items || []).map((it) => it.sku)),
          ].filter(Boolean)),
        ]

        if (skus.length > 0) {
          try {
            const prods = await getProductsBySkus(skus)
            const map = {}
            for (const p of prods) map[p.sku] = p
            setProductsBySku(map)
          } catch {
            // Ignore
          }
        }
      })
      .catch((err) => {
        toast.err('Failed to load sales analysis: ' + err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [activeLocation?.id])

  // Helper to parse date from bill
  const getBillDate = (b) => {
    if (b.createdAt?.toDate) return b.createdAt.toDate()
    if (b.createdAt?.toMillis) return new Date(b.createdAt.toMillis())
    if (typeof b.createdAt === 'string') return new Date(b.createdAt)
    return new Date()
  }

  // Current & Last Month date identifiers
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthIdx = now.getMonth() // 0-indexed

  const lastMonthDate = new Date(currentYear, currentMonthIdx - 1, 1)
  const lastYear = lastMonthDate.getFullYear()
  const lastMonthIdx = lastMonthDate.getMonth()

  const currentMonthKey = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`
  const lastMonthKey = `${lastYear}-${String(lastMonthIdx + 1).padStart(2, '0')}`

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  // Compute Bill-level metrics
  const analyzedBills = useMemo(() => {
    return calculateBillMetrics(bills, productsBySku)
  }, [bills, productsBySku])

  // Current Month vs Last Month Aggregates
  const currentMonthBills = useMemo(
    () => analyzedBills.filter((b) => b.monthKey === currentMonthKey),
    [analyzedBills, currentMonthKey]
  )
  const lastMonthBills = useMemo(
    () => analyzedBills.filter((b) => b.monthKey === lastMonthKey),
    [analyzedBills, lastMonthKey]
  )

  const currentMonthRevenue = currentMonthBills.reduce((s, b) => s + b.revenue, 0)
  const currentMonthProfit = currentMonthBills.reduce((s, b) => s + b.profit, 0)
  const currentMonthMargin = currentMonthRevenue > 0 ? (currentMonthProfit / currentMonthRevenue) * 100 : 0

  const lastMonthRevenue = lastMonthBills.reduce((s, b) => s + b.revenue, 0)
  const lastMonthProfit = lastMonthBills.reduce((s, b) => s + b.profit, 0)
  const lastMonthMargin = lastMonthRevenue > 0 ? (lastMonthProfit / lastMonthRevenue) * 100 : 0

  const profitDiff = currentMonthProfit - lastMonthProfit
  const profitGrowthPct =
    lastMonthProfit !== 0
      ? ((currentMonthProfit - lastMonthProfit) / Math.abs(lastMonthProfit)) * 100
      : currentMonthProfit > 0
      ? 100
      : 0

  // -------------------------------------------------------------
  // ALL-MONTHS PROFIT HISTORY BREAKDOWN
  // -------------------------------------------------------------
  const allMonthsHistory = useMemo(() => {
    return calculateAllMonthsHistory(analyzedBills)
  }, [analyzedBills])

  // -------------------------------------------------------------
  // SALES COMPARISON GRAPH (DAYS 1 to 31)
  // -------------------------------------------------------------
  const dailyComparisonData = useMemo(() => {
    return calculateDailyComparison(
      currentMonthBills,
      lastMonthBills,
      currentYear,
      currentMonthIdx,
      lastYear,
      lastMonthIdx,
      chartMode
    )
  }, [currentMonthBills, lastMonthBills, currentYear, currentMonthIdx, lastYear, lastMonthIdx, chartMode])

  // -------------------------------------------------------------
  // PRODUCT-WISE LOSS ANALYSIS
  // -------------------------------------------------------------
  const productLossList = useMemo(() => {
    return calculateProductLosses(batches, returnsList, bills, productsBySku)
  }, [batches, returnsList, bills, productsBySku])

  const totalCalculatedLoss = productLossList.reduce((s, it) => s + it.totalLoss, 0)

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>Sales &amp; Profit Analysis</h1>
          <div className="sub">
            {activeLocation ? activeLocation.name : 'Select Shop'} · Monthly Sales Trends, Profit Margins &amp; Product Loss Diagnostics
          </div>
        </div>

        {/* Action Button: All Months Profit */}
        <button
          className="btn primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontWeight: 600 }}
          onClick={() => setShowAllMonthsModal(true)}
        >
          <span>📊 View All Months Profit History</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 1. TOP KPI SUMMARY: CURRENT MONTH VS LAST MONTH PROFIT     */}
      {/* ============================================================ */}
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        {/* Current Month Profit Card */}
        <div className="card" style={{ borderLeft: '4px solid #22c55e', position: 'relative' }}>
          <div className="row spread">
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase' }}>
              Current Month Profit
            </span>
            <span className="badge green sm">{monthNames[currentMonthIdx]}</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: currentMonthProfit >= 0 ? '#16a34a' : '#ef4444' }}>
            ₹{currentMonthProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="row spread" style={{ marginTop: 8, fontSize: 12 }}>
            <span className="muted">Sales: ₹{currentMonthRevenue.toLocaleString('en-IN')}</span>
            <span style={{ fontWeight: 600, color: '#16a34a' }}>
              {currentMonthMargin.toFixed(1)}% margin
            </span>
          </div>
        </div>

        {/* Last Month Profit Card */}
        <div className="card" style={{ borderLeft: '4px solid #6366f1' }}>
          <div className="row spread">
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase' }}>
              Last Month Profit
            </span>
            <span className="badge purple sm">{monthNames[lastMonthIdx]}</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: '#4f46e5' }}>
            ₹{lastMonthProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="row spread" style={{ marginTop: 8, fontSize: 12 }}>
            <span className="muted">Sales: ₹{lastMonthRevenue.toLocaleString('en-IN')}</span>
            <span style={{ fontWeight: 600, color: '#6366f1' }}>
              {lastMonthMargin.toFixed(1)}% margin
            </span>
          </div>
        </div>

        {/* Month-over-Month Profit Variance */}
        <div className="card" style={{ borderLeft: `4px solid ${profitDiff >= 0 ? '#22c55e' : '#ef4444'}` }}>
          <div className="row spread">
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase' }}>
              MoM Profit Change
            </span>
            <span className={`badge sm ${profitDiff >= 0 ? 'green' : 'red'}`}>
              {profitDiff >= 0 ? '▲ Growth' : '▼ Dip'}
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: profitDiff >= 0 ? '#16a34a' : '#ef4444' }}>
            {profitDiff >= 0 ? '+' : ''}₹{profitDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            <strong>{profitGrowthPct >= 0 ? '+' : ''}{profitGrowthPct.toFixed(1)}%</strong> vs {monthNames[lastMonthIdx]}
          </div>
        </div>

        {/* Total Product Losses Card */}
        <div className="card" style={{ borderLeft: '4px solid #f97316' }}>
          <div className="row spread">
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase' }}>
              Identified Product Losses
            </span>
            <span className="badge red sm">{productLossList.length} items</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: '#ea580c' }}>
            ₹{totalCalculatedLoss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            Expiry waste &amp; damaged returns
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. TOP HALF: GRAPH FORMAT SALES COMPARISON                  */}
      {/* ============================================================ */}
      <div className="card" style={{ marginBottom: 24, padding: '20px 24px' }}>
        <div className="row spread" style={{ marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              Monthly Sales Performance Comparison (Calendar Day)
            </h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              Comparing {monthNames[lastMonthIdx]} (Last Month) vs {monthNames[currentMonthIdx]} (Current Month) day-by-day sales collections.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, background: 'var(--bg-input, #f3f4f6)', padding: 4, borderRadius: 8 }}>
            <button
              type="button"
              className={`btn sm ${chartMode === 'revenue' ? 'primary' : 'ghost'}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setChartMode('revenue')}
            >
              Sales Revenue (₹)
            </button>
            <button
              type="button"
              className={`btn sm ${chartMode === 'profit' ? 'primary' : 'ghost'}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => setChartMode('profit')}
            >
              Net Profit (₹)
            </button>
          </div>
        </div>

        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyComparisonData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="curMonthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="lastMonthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
              <Tooltip
                formatter={(val, name) => [`₹${Number(val).toLocaleString('en-IN')}`, name]}
                contentStyle={{
                  background: '#1e293b',
                  color: '#fff',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="currentMonth"
                name={`${monthNames[currentMonthIdx]} (Current Month)`}
                stroke="#22c55e"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#curMonthGrad)"
              />
              <Area
                type="monotone"
                dataKey="lastMonth"
                name={`${monthNames[lastMonthIdx]} (Last Month)`}
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#lastMonthGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. BOTTOM HALF: PRODUCT LOSS ANALYSIS (HOW MUCH LOSS)       */}
      {/* ============================================================ */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="row spread" style={{ marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>Product-Wise Loss Diagnostics</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              Identifies exact financial loss per SKU due to unsalable expired stock, damaged customer returns, or below-cost discounting.
            </p>
          </div>
          <span className="badge red">
            Total Financial Loss: ₹{totalCalculatedLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Product &amp; SKU</th>
                <th>Category</th>
                <th>Loss Reason</th>
                <th style={{ textAlign: 'center' }}>Units Lost</th>
                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                <th style={{ textAlign: 'right' }}>Total Loss (₹)</th>
                <th>Corrective Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {productLossList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty" style={{ padding: 24, textAlign: 'center', color: '#16a34a' }}>
                    🎉 Outstanding! No product losses detected across inventory, returns, or billing sales.
                  </td>
                </tr>
              ) : (
                productLossList.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div className="mono faint" style={{ fontSize: 11 }}>{item.sku} · Batch {item.batchNo}</div>
                    </td>
                    <td>
                      <span className="badge sm muted">{item.category}</span>
                    </td>
                    <td>
                      <span className={`badge sm ${item.reasonType === 'expired' ? 'red' : item.reasonType === 'return' ? 'orange' : 'purple'}`}>
                        {item.reason}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {item.lostQty}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      ₹{item.unitCost.toFixed(2)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                      -₹{item.totalLoss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      💡 {item.recommendation}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. MODAL: ALL MONTHS PROFIT HISTORY BREAKDOWN               */}
      {/* ============================================================ */}
      {showAllMonthsModal && (
        <div className="modal-backdrop" onClick={() => setShowAllMonthsModal(false)}>
          <div
            className="modal"
            style={{ maxWidth: 840, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row spread" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  📊 Complete Monthly Profit History
                </h2>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  Profit amount and percentage for every calendar month from your first transaction to date.
                </div>
              </div>
              <button className="btn ghost sm" onClick={() => setShowAllMonthsModal(false)}>
                ✕
              </button>
            </div>

            <div className="table-wrap" style={{ maxHeight: 440, overflowY: 'auto' }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Period (Start → End Date)</th>
                    <th style={{ textAlign: 'center' }}>Invoices</th>
                    <th style={{ textAlign: 'right' }}>Total Sales (₹)</th>
                    <th style={{ textAlign: 'right' }}>Net Profit (₹)</th>
                    <th style={{ textAlign: 'right' }}>Profit Margin (%)</th>
                    <th style={{ textAlign: 'center' }}>MoM Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {allMonthsHistory.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty" style={{ padding: 24, textAlign: 'center' }}>
                        No billing history recorded yet.
                      </td>
                    </tr>
                  ) : (
                    allMonthsHistory.map((m) => (
                      <tr key={m.monthKey}>
                        <td style={{ fontWeight: 600 }}>{m.label}</td>
                        <td className="mono faint" style={{ fontSize: 11.5 }}>
                          {m.startDateFormatted} → {m.endDateFormatted}
                        </td>
                        <td style={{ textAlign: 'center' }}>{m.billsCount}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          ₹{m.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td
                          className="mono"
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: m.totalProfit >= 0 ? '#16a34a' : '#ef4444',
                          }}
                        >
                          ₹{m.totalProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          <span className={`badge sm ${m.profitMargin >= 15 ? 'green' : m.profitMargin > 0 ? 'orange' : 'red'}`}>
                            {m.profitMargin.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {m.momGrowth !== 0 ? (
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: m.momGrowth >= 0 ? '#16a34a' : '#ef4444' }}>
                              {m.momGrowth >= 0 ? '▲ +' : '▼ '}{m.momGrowth.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="row spread" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                * All profits calculated strictly from customer sales dates against purchasing batch costs.
              </div>
              <button className="btn primary sm" onClick={() => setShowAllMonthsModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
