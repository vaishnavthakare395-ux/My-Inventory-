import { useEffect, useMemo, useState, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useToast } from '../lib/ToastContext'
import { batchesAtLocation, listBills, getProductsBySkus } from '../lib/api'
import {
  FESTIVALS,
  generateClearanceOffers,
  generateReorderRecommendations,
  generateSalesIntelligence,
  generateFestivalCampaigns,
  askShopCopilot,
} from '../lib/aiAssist'
import { IconSparkles } from '../components/icons'

const TABS = [
  { id: 'clearance', label: '🚨 Clearance & Flash Offers' },
  { id: 'restock', label: '📦 Predictive Restocking' },
  { id: 'festivals', label: '🪔 Festival Campaigns' },
  { id: 'sales', label: '📊 Sales Intelligence' },
]

export default function Assist() {
  const { activeLocation } = useWorkspace()
  const { profile } = useAuth()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('clearance')
  const [loading, setLoading] = useState(true)
  const [batches, setBatches] = useState([])
  const [bills, setBills] = useState([])
  const [products, setProducts] = useState([])
  const [selectedFestival, setSelectedFestival] = useState('diwali')
  const [restockFilter, setRestockFilter] = useState('ALL') // ALL, CRITICAL, LOW_STOCK, DEAD_STOCK

  // Chat Copilot State
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: `Hello! I am your **StockFlow AI Copilot** 🤖. I continuously analyze your inventory batches, customer bills, and upcoming seasonal opportunities.\n\nAsk me anything about clearance discounts, how much to reorder, or promotional ideas!`,
    },
  ])
  const [inputQuery, setInputQuery] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const chatEndRef = useRef(null)

  // Load store data
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      if (!activeLocation?.id) return
      setLoading(true)
      try {
        const [bRows, billRows] = await Promise.all([
          batchesAtLocation(activeLocation.id),
          listBills(activeLocation.id, { limitCount: 200 }),
        ])

        const skuSet = new Set([...bRows.map((b) => b.sku), ...billRows.flatMap((bi) => (bi.items || []).map((i) => i.sku))])
        const prodList = await getProductsBySkus([...skuSet].filter(Boolean))

        if (cancelled) return
        setBatches(bRows)
        setBills(billRows)
        setProducts(prodList)
      } catch (err) {
        console.error('Error loading AI Assist data:', err)
        toast.err('Failed to load store inventory for AI Assist')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [activeLocation?.id])

  // Products by SKU map
  const productsBySku = useMemo(() => {
    const map = {}
    products.forEach((p) => {
      map[p.sku] = p
    })
    return map
  }, [products])

  // Shop Name
  const shopName = activeLocation?.name || profile?.shopName || 'Your Shop'

  // 1. Clearance Offers
  const clearanceOffers = useMemo(() => {
    return generateClearanceOffers(batches, productsBySku, shopName)
  }, [batches, productsBySku, shopName])

  // 2. Predictive Restock
  const reorderRecs = useMemo(() => {
    return generateReorderRecommendations(batches, bills, products)
  }, [batches, bills, products])

  const filteredReorderRecs = useMemo(() => {
    if (restockFilter === 'ALL') return reorderRecs
    if (restockFilter === 'CRITICAL') return reorderRecs.filter((r) => r.status === 'CRITICAL' || r.status === 'STOCKOUT')
    if (restockFilter === 'LOW_STOCK') return reorderRecs.filter((r) => r.status === 'LOW_STOCK')
    if (restockFilter === 'DEAD_STOCK') return reorderRecs.filter((r) => r.status === 'DEAD_STOCK')
    return reorderRecs
  }, [reorderRecs, restockFilter])

  // 3. Sales Intelligence
  const salesIntel = useMemo(() => {
    return generateSalesIntelligence(bills, batches)
  }, [bills, batches])

  // 4. Festival Engine
  const festivalData = useMemo(() => {
    return generateFestivalCampaigns(selectedFestival, shopName, products)
  }, [selectedFestival, shopName, products])

  // Context for Chat Assistant
  const shopContext = useMemo(() => {
    return {
      shopName,
      totalUnits: batches.reduce((s, b) => s + (b.qty || 0), 0),
      totalRevenue: salesIntel.totalGrossRevenue,
      totalBills: bills.length,
      nearExpiryItems: clearanceOffers.map((c) => ({
        productName: c.productName,
        sku: c.sku,
        batchNo: c.batchNo,
        qty: c.qty,
        daysLeft: c.daysLeft,
        clearancePrice: c.clearancePrice,
        sellingPrice: c.sellingPrice,
        discountPct: c.discountPct,
      })),
      lowStockItems: reorderRecs
        .filter((r) => r.status === 'CRITICAL' || r.status === 'STOCKOUT' || r.status === 'LOW_STOCK')
        .map((r) => ({
          productName: r.productName,
          currentStock: r.currentStock,
          dailyVelocity: r.dailyVelocity,
          runwayDays: r.runwayDays,
          recommendedOrderQty: r.recommendedOrderQty,
        })),
      topProducts: salesIntel.topProducts,
    }
  }, [shopName, batches, salesIntel, bills.length, clearanceOffers, reorderRecs])

  // Chat submit
  const handleSendChat = async (queryText) => {
    const q = (queryText || inputQuery).trim()
    if (!q || chatBusy) return

    setInputQuery('')
    setChatMessages((prev) => [...prev, { role: 'user', text: q }])
    setChatBusy(true)

    try {
      const response = await askShopCopilot(q, shopContext)
      setChatMessages((prev) => [...prev, { role: 'assistant', text: response }])
    } catch (e) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Sorry, I encountered an issue analyzing this. Please try again.' },
      ])
    } finally {
      setChatBusy(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  const copyToClipboard = (text, label = 'Promo text') => {
    navigator.clipboard.writeText(text)
    toast.ok(`${label} copied to clipboard!`)
  }

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      {/* Page Header */}
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
            }}
          >
            <IconSparkles style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>AI Assist &amp; Store Copilot</h1>
            <div className="sub" style={{ fontSize: 13 }}>
              Smart clearance pricing, predictive restocking, sales velocity analytics &amp; festive marketing campaigns for {shopName}.
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <span className="badge green sm" style={{ fontWeight: 600 }}>
            ● AI Live Synced
          </span>
        </div>
      </div>

      {/* Main Grid: 2 Columns (Main Content 65%, Interactive Copilot Chat 35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: 16 }}>
        {/* Left Column: Analytical Tabs */}
        <div>
          {/* Navigation Tabs */}
          <div className="tabs" style={{ marginBottom: 14 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
                style={{ fontSize: 13, padding: '8px 14px' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Calculating real-time store analytics and predictive recommendations…
            </div>
          ) : (
            <>
              {/* TAB 1: NEAR-EXPIRY CLEARANCE & OFFERS */}
              {activeTab === 'clearance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="card" style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div className="row spread wrap" style={{ gap: 8, alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                          🚨 Expiry Clearance Engine ({clearanceOffers.length} At-Risk Batches)
                        </h3>
                        <div className="sub" style={{ fontSize: 12.5 }}>
                          Algorithms calculate markdown prices that protect your cost price ($BP$) while accelerating inventory velocity before total write-off.
                        </div>
                      </div>
                      <span className="badge amber sm" style={{ fontWeight: 600 }}>
                        Recovers Working Capital
                      </span>
                    </div>
                  </div>

                  {clearanceOffers.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--muted)' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>No Critical Expiry Risks Found!</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>
                        All batches in {shopName} have more than 60 days of shelf life remaining.
                      </div>
                    </div>
                  ) : (
                    clearanceOffers.map((item) => (
                      <div
                        key={item.batchId}
                        className="card"
                        style={{
                          borderLeft: `4px solid ${item.urgencyColor === 'red' ? '#ef4444' : item.urgencyColor === 'orange' ? '#f97316' : '#eab308'}`,
                        }}
                      >
                        <div className="row spread wrap" style={{ gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                          <div>
                            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: 15 }}>{item.productName}</span>
                              <span className="badge sm faint" style={{ fontFamily: 'monospace' }}>
                                Batch {item.batchNo}
                              </span>
                              <span className={`badge sm ${item.urgencyColor}`}>
                                {item.urgencyBadge}
                              </span>
                            </div>
                            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                              SKU: {item.sku} · Physical Expiry: <strong>{item.expiryDate}</strong> ({item.daysLeft} days remaining)
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <span className="badge green" style={{ fontSize: 12, fontWeight: 700 }}>
                              {item.qty} units in stock
                            </span>
                          </div>
                        </div>

                        {/* Pricing & Markdown Analysis */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                            gap: 8,
                            padding: '10px 12px',
                            borderRadius: 6,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--border)',
                            marginBottom: 12,
                          }}
                        >
                          <div>
                            <div className="faint" style={{ fontSize: 11 }}>Original MRP / SP</div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>₹{item.sellingPrice}</div>
                          </div>
                          <div>
                            <div className="faint" style={{ fontSize: 11 }}>Cost / BP (Floor)</div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#f59e0b' }}>₹{item.buyingPrice || '—'}</div>
                          </div>
                          <div>
                            <div className="faint" style={{ fontSize: 11 }}>Suggested Clearance</div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981' }}>
                              ₹{item.clearancePrice} <span style={{ fontSize: 11.5, fontWeight: 400 }}>(-{item.discountPct}%)</span>
                            </div>
                          </div>
                          <div>
                            <div className="faint" style={{ fontSize: 11 }}>Customer Savings</div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#6366f1' }}>₹{item.customerSavings}/unit</div>
                          </div>
                        </div>

                        {/* Bundles & Promotions */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                            AI Suggested Bundle &amp; Flash Strategies
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                            {item.bundles.map((b, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  background: 'rgba(99, 102, 241, 0.05)',
                                  border: '1px dashed rgba(99, 102, 241, 0.3)',
                                }}
                              >
                                <div className="row spread" style={{ marginBottom: 2 }}>
                                  <strong style={{ fontSize: 12.5, color: 'var(--text)' }}>{b.title}</strong>
                                  <span className="badge sm blue" style={{ fontSize: 10.5 }}>{b.effectiveDiscount}</span>
                                </div>
                                <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.3 }}>{b.desc}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="row spread wrap" style={{ gap: 8, alignItems: 'center' }}>
                          <button
                            className="btn sm primary"
                            onClick={() => copyToClipboard(item.whatsappMsg, 'WhatsApp Flash Offer')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                          >
                            📱 Copy WhatsApp Broadcast Message
                          </button>

                          <span className="faint" style={{ fontSize: 11.5 }}>
                            💡 Place near front counter or push to loyal customers
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: PREDICTIVE RESTOCKING */}
              {activeTab === 'restock' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="card">
                    <div className="row spread wrap" style={{ gap: 10, alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: 15 }}>
                          📦 Intelligent Stock Replenishment &amp; Runway Analysis
                        </h3>
                        <div className="sub" style={{ fontSize: 12.5 }}>
                          Calculates daily sales velocity from customer billing history to forecast exact stockout dates and recommend optimal reorder sizes.
                        </div>
                      </div>

                      {/* Filter Pills */}
                      <div className="row" style={{ gap: 6 }}>
                        {[
                          { id: 'ALL', label: 'All Items' },
                          { id: 'CRITICAL', label: '🚨 Critical / Out' },
                          { id: 'LOW_STOCK', label: '⚠️ Low Stock' },
                          { id: 'DEAD_STOCK', label: '🛑 Dead Stock' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            className={`btn sm ${restockFilter === f.id ? 'primary' : ''}`}
                            onClick={() => setRestockFilter(f.id)}
                            style={{ fontSize: 11.5, padding: '3px 8px' }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Product / SKU</th>
                            <th>In Stock</th>
                            <th>Units Sold</th>
                            <th>Daily Velocity</th>
                            <th>Estimated Runway</th>
                            <th>Recommended Order (ROQ)</th>
                            <th>Status &amp; AI Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredReorderRecs.length === 0 ? (
                            <tr>
                              <td colSpan="7" style={{ textAlign: 'center', padding: 24 }} className="muted">
                                No products found matching this filter.
                              </td>
                            </tr>
                          ) : (
                            filteredReorderRecs.map((r) => (
                              <tr key={r.sku}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{r.productName}</div>
                                  <div className="faint" style={{ fontSize: 11 }}>{r.sku} · {r.category}</div>
                                </td>
                                <td>
                                  <span style={{ fontWeight: 600, color: r.currentStock === 0 ? '#ef4444' : 'inherit' }}>
                                    {r.currentStock}
                                  </span>
                                </td>
                                <td>{r.totalSold}</td>
                                <td>
                                  <strong>{r.dailyVelocity}</strong> <span className="faint" style={{ fontSize: 11 }}>/ day</span>
                                </td>
                                <td>
                                  <span className={`badge sm ${r.statusColor === 'red' ? 'red' : r.statusColor === 'amber' ? 'amber' : r.statusColor === 'blue' ? 'purple' : 'green'}`}>
                                    {r.runwayDays}
                                  </span>
                                </td>
                                <td>
                                  {r.recommendedOrderQty > 0 ? (
                                    <div>
                                      <span style={{ fontWeight: 700, color: '#10b981', fontSize: 14 }}>
                                        +{r.recommendedOrderQty} units
                                      </span>
                                      {r.estimatedReorderCost > 0 && (
                                        <div className="faint" style={{ fontSize: 11 }}>
                                          ~₹{r.estimatedReorderCost.toLocaleString()} est. cost
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="muted" style={{ fontSize: 12 }}>— Sufficient</span>
                                  )}
                                </td>
                                <td style={{ maxWidth: 260 }}>
                                  <div style={{ fontSize: 11.5, lineHeight: 1.35 }}>
                                    {r.advice}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: FESTIVAL & OCCASION CAMPAIGNS */}
              {activeTab === 'festivals' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="card">
                    <div className="row spread wrap" style={{ gap: 8, marginBottom: 12, alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: '0 0 2px 0', fontSize: 15 }}>
                          🪔 Festive &amp; Occasion Campaign Builder
                        </h3>
                        <div className="sub" style={{ fontSize: 12.5 }}>
                          Select an upcoming festival or sales event to generate tailored promotions, combo bundles, and ready-to-share WhatsApp copy.
                        </div>
                      </div>
                    </div>

                    {/* Festival Selector Pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {FESTIVALS.map((f) => (
                        <button
                          key={f.id}
                          className={`btn sm ${selectedFestival === f.id ? 'primary' : ''}`}
                          onClick={() => setSelectedFestival(f.id)}
                          style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <span>{f.icon}</span> <span>{f.name.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Festival Banner */}
                  <div
                    className="card"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                    }}
                  >
                    <div className="row spread wrap" style={{ gap: 8, alignItems: 'center' }}>
                      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 32 }}>{festivalData.festival.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{festivalData.festival.name}</div>
                          <div className="faint" style={{ fontSize: 12 }}>
                            {festivalData.festival.season} · Recommended categories: {festivalData.festival.highlight}
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        {festivalData.festival.tags.map((t, idx) => (
                          <span key={idx} className="badge purple sm">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Campaign Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {festivalData.campaigns.map((camp, idx) => (
                      <div key={idx} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div className="row spread" style={{ marginBottom: 6 }}>
                            <span className="badge green sm">{camp.bannerTag}</span>
                            <span className="faint" style={{ fontSize: 11 }}>Strategy #{idx + 1}</span>
                          </div>
                          <h4 style={{ margin: '4px 0 6px 0', fontSize: 14.5 }}>{camp.title}</h4>
                          <div className="sub" style={{ fontSize: 12, marginBottom: 8 }}>
                            <strong>Goal:</strong> {camp.objective}
                          </div>
                          <div
                            style={{
                              padding: '8px 10px',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid var(--border)',
                              fontSize: 12,
                              marginBottom: 10,
                            }}
                          >
                            <strong>Structure:</strong> {camp.structure}
                          </div>

                          {camp.suggestedItems?.length > 0 && (
                            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
                              Suggested products: {camp.suggestedItems.join(', ')}
                            </div>
                          )}
                        </div>

                        <button
                          className="btn sm primary"
                          onClick={() => copyToClipboard(camp.whatsappCopy, 'Campaign WhatsApp Copy')}
                          style={{ width: '100%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          📋 Copy WhatsApp Campaign Copy
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: SALES INTELLIGENCE */}
              {activeTab === 'sales' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Valuation & Sales Cards */}
                  <div className="grid cols-4" style={{ gap: 10 }}>
                    <div className="card stat tint-green">
                      <div className="label">Total Gross Sales</div>
                      <div className="value">₹{salesIntel.totalGrossRevenue.toLocaleString()}</div>
                      <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>From {salesIntel.totalBillsCount} bill(s)</div>
                    </div>
                    <div className="card stat tint-purple">
                      <div className="label">Gross Profit Earned</div>
                      <div className="value">₹{salesIntel.grossProfit.toLocaleString()}</div>
                      <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Overall Margin: {salesIntel.marginPct}%</div>
                    </div>
                    <div className="card stat">
                      <div className="label">Average Bill Value</div>
                      <div className="value">₹{salesIntel.avgBillValue.toLocaleString()}</div>
                      <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Per customer visit</div>
                    </div>
                    <div className="card stat">
                      <div className="label">Units Sold</div>
                      <div className="value">{salesIntel.totalUnitsSold.toLocaleString()}</div>
                      <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>Total items billed</div>
                    </div>
                  </div>

                  <div className="grid cols-2" style={{ gap: 12 }}>
                    {/* Top Products */}
                    <div className="card">
                      <h3 style={{ margin: '0 0 10px 0', fontSize: 14.5 }}>🏆 Top Revenue Driving Products</h3>
                      {salesIntel.topProducts.length === 0 ? (
                        <div className="faint" style={{ padding: 16, textAlign: 'center' }}>No sales data recorded yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {salesIntel.topProducts.map((p, idx) => (
                            <div
                              key={p.sku}
                              className="row spread"
                              style={{
                                padding: '8px 10px',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <div className="row" style={{ gap: 8 }}>
                                <span className="badge sm blue">{idx + 1}</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                                  <div className="faint" style={{ fontSize: 11 }}>{p.qtySold} units sold</div>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#10b981' }}>₹{p.revenue}</div>
                                <div className="faint" style={{ fontSize: 10.5 }}>Profit: ₹{p.profit}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Payment Mode Distribution */}
                    <div className="card">
                      <h3 style={{ margin: '0 0 10px 0', fontSize: 14.5 }}>💳 Payment Methods Breakdown</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          { key: 'cash', label: '💵 Cash', val: salesIntel.paymentBreakdown.cash, col: '#10b981' },
                          { key: 'upi', label: '📱 UPI / QR Code', val: salesIntel.paymentBreakdown.upi, col: '#6366f1' },
                          { key: 'card', label: '💳 Credit / Debit Card', val: salesIntel.paymentBreakdown.card, col: '#0ea5e9' },
                          { key: 'due', label: '⏳ Store Due / Khata', val: salesIntel.paymentBreakdown.due, col: '#f59e0b' },
                        ].map((m) => {
                          const pct = salesIntel.totalGrossRevenue > 0 ? Math.round((m.val / salesIntel.totalGrossRevenue) * 100) : 0
                          return (
                            <div key={m.key} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                              <div className="row spread" style={{ marginBottom: 4 }}>
                                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.label}</span>
                                <span style={{ fontWeight: 700, fontSize: 13 }}>₹{m.val.toLocaleString()} ({pct}%)</span>
                              </div>
                              <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: m.col, borderRadius: 3 }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column: Interactive AI Store Copilot Chat Pane */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: 720,
            border: '1px solid var(--line)',
            background: '#ffffff',
            boxShadow: 'var(--shadow)',
          }}
        >
          {/* Chat Header */}
          <div className="row spread" style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--pista-500), var(--pista-600))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 14,
                }}
              >
                🤖
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Shop Copilot Chat</div>
                <div className="faint" style={{ fontSize: 11 }}>Grounded in {shopName} data</div>
              </div>
            </div>

            <span className="badge green sm" style={{ fontSize: 10.5 }}>Local AI Active</span>
          </div>

          {/* Quick Prompt Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {[
              'Clear items expiring in 30d',
              'What should I reorder this week?',
              'Diwali promo offer ideas',
              'Top selling products',
            ].map((p, idx) => (
              <button
                key={idx}
                className="btn sm faint"
                onClick={() => handleSendChat(p)}
                disabled={chatBusy}
                style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 12 }}
              >
                ✨ {p}
              </button>
            ))}
          </div>

          {/* Messages Transcript */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingRight: 4,
              marginBottom: 10,
            }}
          >
            {chatMessages.map((m, idx) => {
              const isUser = m.role === 'user'
              return (
                <div
                  key={idx}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: isUser ? 'var(--pista-600)' : 'var(--pista-50)',
                    color: isUser ? '#ffffff' : 'var(--text)',
                    border: isUser ? 'none' : '1px solid var(--line)',
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {m.text}
                </div>
              )
            })}
            {chatBusy && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.05)',
                  fontSize: 12,
                  color: 'var(--muted)',
                }}
              >
                🤖 Analyzing inventory &amp; calculating strategies…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendChat()
            }}
            style={{ display: 'flex', gap: 6 }}
          >
            <input
              type="text"
              className="input"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask Copilot: 'What should I reorder?' or 'Suggest an offer'"
              disabled={chatBusy}
              style={{ fontSize: 12, flex: 1 }}
            />
            <button
              type="submit"
              className="btn primary"
              disabled={!inputQuery.trim() || chatBusy}
              style={{ padding: '0 14px', fontSize: 12 }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
