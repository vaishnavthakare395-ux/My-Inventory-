import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useAuth } from '../lib/AuthContext'
import { allOrdersForLocations, batchesForLocations, getProductsBySkus } from '../lib/api'
import { daysUntil } from '../lib/fefo'
import { EXPIRY_WINDOWS } from '../lib/constants'

const PIE = ['#84cc16', '#bef264', '#f5a524', '#f5564f']

export default function Analytics() {
  const { isAdmin, myLocationIds, locations } = useAuth()
  const [orders, setOrders] = useState([])
  const [batches, setBatches] = useState([])
  const [productsBySku, setProductsBySku] = useState({})

  const locationKey = myLocationIds.join('|')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!myLocationIds.length) {
        setOrders([])
        setBatches([])
        setProductsBySku({})
        return
      }

      const [orderRows, stockRows] = await Promise.all([
        allOrdersForLocations(myLocationIds),
        batchesForLocations(myLocationIds),
      ])
      const products = await getProductsBySkus([
        ...orderRows.map((o) => o.sku),
        ...stockRows.map((b) => b.sku),
      ])
      if (cancelled) return

      const bySku = {}
      for (const p of products) bySku[p.sku] = p
      setOrders(orderRows)
      setBatches(stockRows)
      setProductsBySku(bySku)
    }

    load().catch((err) => console.error('Could not load analytics:', err))
    return () => {
      cancelled = true
    }
  }, [locationKey])

  const topSkus = useMemo(() => {
    const sold = {}
    for (const o of orders) sold[o.sku] = (sold[o.sku] || 0) + (o.qty || 0)
    return Object.entries(sold)
      .map(([sku, qty]) => ({ name: productsBySku[sku]?.productName?.slice(0, 18) || sku, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
  }, [orders, productsBySku])

  const bySite = useMemo(() => {
    const m = {}
    for (const o of orders) m[o.websiteSource] = (m[o.websiteSource] || 0) + (o.qty || 0)
    return Object.entries(m).map(([name, qty]) => ({ name, qty }))
  }, [orders])

  const expiryRisk = useMemo(() => {
    const buckets = { '0–30 days': 0, '31–90 days': 0, '90+ days': 0, expired: 0 }
    for (const b of batches) {
      const d = daysUntil(b.expiryDate)
      if (d === null) continue
      if (d < 0) buckets.expired += b.qty
      else if (d <= EXPIRY_WINDOWS.WARN) buckets['0–30 days'] += b.qty
      else if (d <= EXPIRY_WINDOWS.WATCH) buckets['31–90 days'] += b.qty
      else buckets['90+ days'] += b.qty
    }
    return Object.entries(buckets).map(([name, value]) => ({ name, value }))
  }, [batches])

  const slowMovers = useMemo(() => {
    const soldSkus = new Set(orders.map((o) => o.sku))
    const stuck = {}
    for (const b of batches) {
      if (!soldSkus.has(b.sku)) stuck[b.sku] = (stuck[b.sku] || 0) + b.qty
    }
    return Object.entries(stuck)
      .map(([sku, qty]) => ({ name: productsBySku[sku]?.productName?.slice(0, 18) || sku, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
  }, [batches, orders, productsBySku])

  // Units fulfilled from each warehouse — shows where the load sits.
  const warehouseLoad = useMemo(() => {
    const m = {}
    for (const o of orders) m[o.locationId] = (m[o.locationId] || 0) + (o.qty || 0)
    return Object.entries(m).map(([id, qty]) => ({
      name: locations.find((l) => l.id === id)?.name || id,
      qty,
    }))
  }, [orders, locations])

  // Order status split (pending / shipped / delivered / returned).
  const statusSplit = useMemo(() => {
    const m = {}
    for (const o of orders) m[o.status || 'pending'] = (m[o.status || 'pending'] || 0) + 1
    return Object.entries(m).map(([name, value]) => ({ name, value }))
  }, [orders])

  // Headline KPIs.
  const kpis = useMemo(() => {
    const unitsSold = orders.reduce((s, o) => s + (o.qty || 0), 0)
    const inStock = batches.reduce((s, b) => s + b.qty, 0)
    const delivered = orders.filter((o) => o.status === 'delivered').length
    const expiringUnits = batches.reduce((s, b) => {
      const d = daysUntil(b.expiryDate)
      return d !== null && d >= 0 && d <= EXPIRY_WINDOWS.WARN ? s + b.qty : s
    }, 0)
    return { unitsSold, inStock, delivered, expiringUnits, orders: orders.length }
  }, [orders, batches])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Sales & Stock Analytics</h1>
          <div className="sub">
            {isAdmin ? 'Across all warehouses' : 'Your assigned warehouses'} · {orders.length} orders
          </div>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <Kpi label="Units sold" value={kpis.unitsSold} tint="cyan" sub={`${kpis.orders} orders`} />
        <Kpi label="Units in stock" value={kpis.inStock} tint="green" sub="across warehouses" />
        <Kpi label="Delivered" value={kpis.delivered} tint="violet" sub="orders completed" />
        <Kpi label="Expiring ≤30d" value={kpis.expiringUnits} tint="amber" sub="units at risk" />
      </div>

      <div className="grid cols-2">
        <ChartCard title="Fast movers" subtitle="Most units shipped — reorder these early">
          <Bars data={topSkus} color="#84cc16" />
        </ChartCard>

        <ChartCard title="Site-wise demand" subtitle="Units ordered per source site">
          <Bars data={bySite} color="#bef264" />
        </ChartCard>

        <ChartCard title="Warehouse load" subtitle="Units fulfilled from each warehouse">
          <Bars data={warehouseLoad} color="#84cc16" />
        </ChartCard>

        <ChartCard title="Order status" subtitle="Where current orders stand">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {statusSplit.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Legend />
              <Tooltip contentStyle={tooltip} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Expiry risk" subtitle="Units of stock grouped by time to expiry">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={expiryRisk} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {expiryRisk.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Legend />
              <Tooltip contentStyle={tooltip} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Slow movers" subtitle="In stock but not selling — watch for expiry">
          <Bars data={slowMovers} color="#f5a524" />
        </ChartCard>
      </div>
    </div>
  )
}

const tooltip = { background: '#111', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, color: '#f5f7f2' }

function Kpi({ label, value, sub, tint }) {
  return (
    <div className={`card tint-${tint} stat`}>
      <span className="label">{label}</span>
      <span className="value">{Number(value).toLocaleString()}</span>
      <span className="delta">{sub}</span>
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="sub" style={{ marginBottom: 10 }}>{subtitle}</div>
      {children}
    </div>
  )
}

function Bars({ data, color }) {
  if (!data.length) return <div className="empty">Not enough data yet.</div>
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#18233a" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#93a3bd', fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={56} />
        <YAxis tick={{ fill: '#93a3bd', fontSize: 11 }} />
        <Tooltip contentStyle={tooltip} cursor={{ fill: 'rgba(56,189,248,0.06)' }} />
        <Bar dataKey="qty" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
