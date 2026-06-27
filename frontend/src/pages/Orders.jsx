import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useAlerts } from '../lib/AlertsContext'
import { useToast } from '../lib/ToastContext'
import {
  fulfilOrder,
  markOrderDelivered,
  getOrderSources,
  getShippingAnswers,
  DEFAULT_SHIPPING_ANSWERS,
  shippingAnswerOption,
  shippingOptionLabel,
  findProduct,
  batchesForSkuAtLocations,
  allOrdersForLocations,
  getProductsBySkus,
} from '../lib/api'
import { daysUntil, formatExpiry } from '../lib/fefo'
import { FlowBadge } from '../components/StatusBadge'

const makeBlank = (answers = DEFAULT_SHIPPING_ANSWERS) => ({
  websiteSource: '',
  orderId: '',
  sku: '',
  qty: '1',
  dispatchKey: answers.dispatch[0]?.key || '',
  packingKey: answers.packing[0]?.key || '',
  courierKey: answers.courier[0]?.key || '',
  customerName: '',
  customerPhone: '',
  customerCity: '',
})

export default function Orders() {
  const { profile, myLocationIds, locations } = useAuth()
  const { refresh } = useAlerts()
  const toast = useToast()

  const [answers, setAnswers] = useState(DEFAULT_SHIPPING_ANSWERS)
  const [form, setForm] = useState(() => makeBlank())
  const [sources, setSources] = useState([])
  const [product, setProduct] = useState(null)
  const [lookupDone, setLookupDone] = useState(false)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [stockRows, setStockRows] = useState([])
  const [batchId, setBatchId] = useState('')
  const [orders, setOrders] = useState([])
  const [orderProductsBySku, setOrderProductsBySku] = useState({})
  const [busy, setBusy] = useState(false)

  const locationKey = myLocationIds.join('|')
  const qty = Number(form.qty) || 0

  const locationById = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l])),
    [locations]
  )
  const locationLabel = (id) => locationById[id]?.name || id

  const sellableBatches = useMemo(
    () => stockRows.filter((b) => b.qty > 0 && b.qty >= qty),
    [stockRows, qty]
  )
  const recommendedBatch = sellableBatches[0] || null
  const selectedBatch = stockRows.find((b) => b.id === batchId) || null
  const totalStock = stockRows.reduce((sum, b) => sum + (b.qty || 0), 0)
  const stockLocationCount = new Set(stockRows.map((b) => b.locationId)).size
  const selectedDispatch = useMemo(
    () => shippingAnswerOption(answers.dispatch, form.dispatchKey, form.dispatchAnswer),
    [answers.dispatch, form.dispatchKey, form.dispatchAnswer]
  )
  const selectedPacking = useMemo(
    () => shippingAnswerOption(answers.packing, form.packingKey, form.packingAnswer),
    [answers.packing, form.packingKey, form.packingAnswer]
  )
  const selectedCourier = useMemo(
    () => shippingAnswerOption(answers.courier, form.courierKey, form.courierAnswer),
    [answers.courier, form.courierKey, form.courierAnswer]
  )
  const dispatchBlocked = Boolean(selectedDispatch?.blocksFulfillment)
  const canFulfil =
    product &&
    selectedBatch &&
    qty > 0 &&
    selectedBatch.qty >= qty &&
    !dispatchBlocked

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const setSku = (e) => {
    setForm((f) => ({ ...f, sku: e.target.value }))
    setProduct(null)
    setLookupDone(false)
    setStockRows([])
    setBatchId('')
  }

  useEffect(() => {
    Promise.all([getOrderSources(), getShippingAnswers()]).then(([s, a]) => {
      setSources(s)
      setAnswers(a)
      setForm((f) => ({
        ...f,
        websiteSource: f.websiteSource || s[0] || '',
        dispatchKey: shippingAnswerOption(a.dispatch, f.dispatchKey, f.dispatchAnswer)?.key || a.dispatch[0]?.key || '',
        packingKey: shippingAnswerOption(a.packing, f.packingKey, f.packingAnswer)?.key || a.packing[0]?.key || '',
        courierKey: shippingAnswerOption(a.courier, f.courierKey, f.courierAnswer)?.key || a.courier[0]?.key || '',
      }))
    })
  }, [])

  const loadOrders = async () => {
    if (!myLocationIds.length) {
      setOrders([])
      setOrderProductsBySku({})
      return
    }

    const rows = await allOrdersForLocations(myLocationIds, 200)
    const products = await getProductsBySkus(rows.map((o) => o.sku))
    const bySku = {}
    for (const p of products) bySku[p.sku] = p
    setOrders(rows)
    setOrderProductsBySku(bySku)
  }

  useEffect(() => {
    loadOrders().catch((err) => console.error('Could not load orders:', err))
  }, [locationKey])

  useEffect(() => {
    if (!stockRows.length) {
      setBatchId('')
      return
    }
    const current = stockRows.find((b) => b.id === batchId)
    if (current && current.qty >= qty) return
    setBatchId(stockRows.find((b) => b.qty >= qty)?.id || '')
  }, [stockRows, qty, batchId])

  const searchSku = async () => {
    const sku = form.sku.trim()
    if (!sku) return toast.err('Enter a SKU to search.')
    if (!myLocationIds.length) return toast.err('No warehouse is assigned to this user.')

    setLookupBusy(true)
    setLookupDone(false)
    try {
      const [foundProduct, foundStock] = await Promise.all([
        findProduct({ sku }),
        batchesForSkuAtLocations(sku, myLocationIds),
      ])
      setProduct(foundProduct)
      setStockRows(foundStock)
      setLookupDone(true)
      setBatchId(foundStock.find((b) => b.qty >= (Number(form.qty) || 1))?.id || '')

      if (!foundProduct) {
        toast.info('Product not found. Create it from Scan & Add, then search again.')
      } else if (!foundStock.length) {
        toast.info('Product found, but no stock exists in assigned warehouses.')
      } else {
        const locationsWithStock = new Set(foundStock.map((b) => b.locationId)).size
        toast.ok(`Found ${foundStock.reduce((s, b) => s + b.qty, 0)} unit(s) across ${locationsWithStock} location(s).`)
      }
    } catch (err) {
      setProduct(null)
      setStockRows([])
      setBatchId('')
      setLookupDone(true)
      toast.err(err.message)
    } finally {
      setLookupBusy(false)
    }
  }

  const fulfil = async () => {
    if (!product) return toast.err('Search a valid product SKU first.')
    if (!selectedBatch) return toast.err('No eligible stock group is selected.')
    if (selectedBatch.qty < qty) return toast.err(`Only ${selectedBatch.qty} units in the selected stock group.`)
    if (dispatchBlocked) {
      return toast.err('Dispatch answer is on hold. Choose a ship answer before fulfilling.')
    }

    setBusy(true)
    try {
      const selection =
        recommendedBatch && selectedBatch.id === recommendedBatch.id
          ? 'FEFO recommended'
          : 'Manual warehouse override'
      await fulfilOrder({
        websiteSource: form.websiteSource,
        orderId: form.orderId,
        sku: form.sku.trim(),
        batchId,
        qty,
        locationId: selectedBatch.locationId,
        customer: {
          name: form.customerName,
          phone: form.customerPhone,
          city: form.customerCity,
        },
        shippingPlan: {
          dispatchKey: selectedDispatch?.key || '',
          dispatchAnswer: shippingOptionLabel(selectedDispatch),
          packingKey: selectedPacking?.key || '',
          packingAnswer: shippingOptionLabel(selectedPacking),
          courierKey: selectedCourier?.key || '',
          courierAnswer: shippingOptionLabel(selectedCourier),
          blocksFulfillment: dispatchBlocked,
          selection,
          recommendedLocationId: recommendedBatch?.locationId || '',
          recommendedStockGroup: recommendedBatch?.batchNo || '',
          selectedLocationId: selectedBatch.locationId,
          selectedStockGroup: selectedBatch.batchNo,
        },
        by: profile?.email,
      })
      toast.ok(`Order fulfilled from ${locationLabel(selectedBatch.locationId)} - ${qty} unit(s) shipped.`)
      setForm({ ...makeBlank(answers), websiteSource: form.websiteSource || sources[0] || '' })
      setProduct(null)
      setLookupDone(false)
      setStockRows([])
      setBatchId('')
      refresh()
      await loadOrders()
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  const recommendationText = (() => {
    if (!recommendedBatch) return 'No eligible stock'
    const days = daysUntil(recommendedBatch.expiryDate)
    const expiryText = days === null ? 'no expiry date' : `${days} day(s) to expiry`
    return `${locationLabel(recommendedBatch.locationId)} - ${expiryText}`
  })()

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Order Processing</h1>
          <div className="sub">
            Enter SKU, verify product, then ship from the closest-expiry eligible stock across assigned warehouses.
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>New order</h3>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Order source site</label>
              <select className="select" value={form.websiteSource} onChange={set('websiteSource')}>
                {sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Order ID</label>
              <input className="input mono" value={form.orderId} onChange={set('orderId')} placeholder="optional" />
            </div>
          </div>

          <div className="field">
            <label>Product SKU</label>
            <div className="row wrap">
              <input
                className="input mono"
                style={{ flex: '1 1 220px' }}
                value={form.sku}
                onChange={setSku}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') searchSku()
                }}
                placeholder="Enter SKU"
              />
              <button className="btn primary" type="button" disabled={lookupBusy} onClick={searchSku}>
                {lookupBusy ? 'Searching...' : 'Search SKU'}
              </button>
            </div>
          </div>

          {lookupDone && product && (
            <div className="mini-stat" style={{ marginBottom: 14 }}>
              <div className="mini-k">Product found</div>
              <div className="mini-v">{product.productName || product.sku}</div>
              <div className="mini-sub mono">{product.sku}</div>
            </div>
          )}

          {lookupDone && !product && (
            <div className="form-error">
              Product does not exist in the system. Create it first, then come back to fulfil the order.
              <div style={{ marginTop: 10 }}>
                <Link className="btn primary sm" to="/scan">Create in Scan & Add</Link>
              </div>
            </div>
          )}

          <div className="field">
            <label>Quantity</label>
            <input className="input" type="number" min="1" value={form.qty} onChange={set('qty')} />
          </div>

          <div className="divider" />
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Dispatch layer</h3>
          <div className="grid cols-3">
            <div className="field">
              <label>Dispatch answer</label>
              <select className="select" value={form.dispatchKey} onChange={set('dispatchKey')}>
                {answers.dispatch.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Packing answer</label>
              <select className="select" value={form.packingKey} onChange={set('packingKey')}>
                {answers.packing.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Courier answer</label>
              <select className="select" value={form.courierKey} onChange={set('courierKey')}>
                {answers.courier.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </div>
          </div>
          {dispatchBlocked && (
            <div className="form-error" style={{ marginTop: 10 }}>
              This dispatch answer is marked for manager review, so fulfilment is paused.
            </div>
          )}

          <div className="divider" />
          <div className="grid cols-2">
            <div className="field">
              <label>Customer name</label>
              <input className="input" value={form.customerName} onChange={set('customerName')} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input className="input" value={form.customerPhone} onChange={set('customerPhone')} />
            </div>
          </div>
          <div className="field">
            <label>City</label>
            <input className="input" value={form.customerCity} onChange={set('customerCity')} />
          </div>

          <button
            className="btn green"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={busy || !canFulfil}
            onClick={fulfil}
          >
            {busy ? 'Processing...' : 'Fulfil & ship order'}
          </button>
        </div>

        <div className="grid">
          <div className="card">
            <h3>Stock decision</h3>
            {!lookupDone && <div className="empty">Search a SKU to see stock across assigned warehouses.</div>}

            {lookupDone && product && (
              <>
                <div className="grid cols-3" style={{ marginTop: 12, marginBottom: 14 }}>
                  <div className="mini-stat">
                    <div className="mini-k">Total stock</div>
                    <div className="mini-v">{totalStock.toLocaleString()}</div>
                    <div className="mini-sub">{stockLocationCount} location(s)</div>
                  </div>
                  <div className="mini-stat">
                    <div className="mini-k">Recommended</div>
                    <div className="mini-v" style={{ fontSize: 15 }}>{recommendationText}</div>
                    <div className="mini-sub">closest expiry with enough qty</div>
                  </div>
                  <div className="mini-stat">
                    <div className="mini-k">Selected</div>
                    <div className="mini-v" style={{ fontSize: 15 }}>
                      {selectedBatch ? locationLabel(selectedBatch.locationId) : 'None'}
                    </div>
                    <div className="mini-sub">{selectedBatch?.batchNo || 'No stock group'}</div>
                  </div>
                </div>

                {stockRows.length === 0 && (
                  <div className="empty">Product exists, but no sellable stock is available in assigned warehouses.</div>
                )}
                {stockRows.length > 0 && sellableBatches.length === 0 && (
                  <div className="form-error">No single stock group has {qty} unit(s). Reduce quantity or transfer stock first.</div>
                )}

                {stockRows.length > 0 && (
                  <div className="table-wrap">
                    <table className="t">
                      <thead>
                        <tr><th></th><th>Location</th><th>Qty</th><th>Expiry</th><th>Stock group</th></tr>
                      </thead>
                      <tbody>
                        {stockRows.map((b) => {
                          const enough = b.qty >= qty
                          const isRecommended = recommendedBatch?.id === b.id
                          const isSelected = batchId === b.id
                          return (
                            <tr key={b.id}>
                              <td>
                                <button
                                  className={`btn sm ${isSelected ? 'primary' : 'ghost'}`}
                                  disabled={!enough}
                                  onClick={() => setBatchId(b.id)}
                                >
                                  {isSelected ? 'Selected' : 'Use'}
                                </button>
                              </td>
                              <td>
                                <div>{locationLabel(b.locationId)}</div>
                                {isRecommended && <div className="faint" style={{ fontSize: 11.5 }}>closest expiry</div>}
                              </td>
                              <td>{b.qty}</td>
                              <td>{formatExpiry(b.expiryDate)}</td>
                              <td className="mono">{b.batchNo}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h3>Recent orders</h3>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="t">
                <thead>
                  <tr><th>Source</th><th>Product</th><th>Qty</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr><td colSpan="5" className="empty">No orders yet.</td></tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.websiteSource}</td>
                      <td>
                        <div>{orderProductsBySku[o.sku]?.productName || o.sku}</div>
                        <div className="faint" style={{ fontSize: 11.5 }}>
                          {locationLabel(o.locationId)} - stock group {o.batchNo}
                        </div>
                        {o.shippingPlan?.dispatchAnswer && (
                          <div className="faint" style={{ fontSize: 11.5 }}>{o.shippingPlan.dispatchAnswer}</div>
                        )}
                      </td>
                      <td>{o.qty}</td>
                      <td><FlowBadge status={o.status} /></td>
                      <td>
                        {o.status === 'shipped' && (
                          <button className="btn ghost sm" onClick={() => markOrderDelivered(o.id).then(loadOrders)}>
                            Delivered
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
