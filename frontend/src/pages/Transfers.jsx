import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAlerts } from '../lib/AlertsContext'
import { useToast } from '../lib/ToastContext'
import { createTransfer, shipTransfer, listTransfers } from '../lib/api'
import { FlowBadge } from '../components/StatusBadge'
import { formatExpiry } from '../lib/fefo'
import { TRANSFER_FLOW } from '../lib/constants'

export default function Transfers() {
  const { profile, locations } = useAuth()
  const { activeLocation } = useWorkspace()
  const { batches, productsBySku, refresh } = useAlerts()
  const toast = useToast()

  const [toLocationId, setToLocationId] = useState('')
  const [cart, setCart] = useState([])
  const [pickBatchId, setPickBatchId] = useState('')
  const [pickQty, setPickQty] = useState('')
  const [stockSearch, setStockSearch] = useState('')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)

  const destinations = locations.filter((l) => l.id !== activeLocation?.id)

  const loadHistory = async () => {
    if (!activeLocation) return
    setHistory(await listTransfers({ fromLocationId: activeLocation.id }))
  }

  useEffect(() => {
    loadHistory()
  }, [activeLocation])

  const availableBatches = useMemo(
    () => batches.filter((b) => !cart.some((c) => c.batchId === b.id)),
    [batches, cart]
  )
  const filteredBatches = useMemo(() => {
    const term = stockSearch.trim().toLowerCase()
    if (!term) return availableBatches
    return availableBatches.filter((b) => {
      const product = productsBySku[b.sku] || {}
      return (
        b.sku.toLowerCase().includes(term) ||
        b.batchNo.toLowerCase().includes(term) ||
        (product.productName || '').toLowerCase().includes(term) ||
        (product.barcode || '').toLowerCase().includes(term)
      )
    })
  }, [availableBatches, productsBySku, stockSearch])

  const addToCart = () => {
    const b = batches.find((x) => x.id === pickBatchId)
    if (!b) return toast.err('Pick a stock group.')
    const qty = Number(pickQty)
    if (!(qty > 0) || qty > b.qty) return toast.err(`Quantity must be between 1 and ${b?.qty}.`)
    setCart((c) => [
      ...c,
      { batchId: b.id, sku: b.sku, batchNo: b.batchNo, qty, expiryDate: b.expiryDate, max: b.qty },
    ])
    setPickBatchId('')
    setPickQty('')
  }

  const removeFromCart = (batchId) => setCart((c) => c.filter((x) => x.batchId !== batchId))

  const createAndShip = async () => {
    if (!activeLocation) return toast.err('No source warehouse.')
    if (!toLocationId) return toast.err('Pick a destination warehouse.')
    if (!cart.length) return toast.err('Add at least one stock group to the box.')

    setBusy(true)
    try {
      const items = cart.map((c) => ({ sku: c.sku, batchNo: c.batchNo, qty: c.qty, expiryDate: c.expiryDate }))
      const id = await createTransfer({
        fromLocationId: activeLocation.id,
        toLocationId,
        items,
        by: profile?.email,
      })
      await shipTransfer({ transferId: id, by: profile?.email })
      toast.ok('Box shipped — stock deducted and now in transit.')
      setCart([])
      setToLocationId('')
      refresh()
      loadHistory()
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  const locName = (id) => locations.find((l) => l.id === id)?.name || id

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Warehouse Transfers</h1>
          <div className="sub">
            Build a shipment box from {activeLocation?.name || 'your warehouse'} and ship it. Stock
            deducts on ship; destination adds it on accept.
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Build shipment box</h3>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Destination warehouse</label>
            <select className="select" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
              <option value="">Select…</option>
              {destinations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="divider" />

          <div className="field">
            <label>Search SKU / product / stock group</label>
            <input
              className="input"
              value={stockSearch}
              onChange={(e) => {
                setStockSearch(e.target.value)
                setPickBatchId('')
              }}
              placeholder="Type SKU, name, barcode or stock group"
            />
          </div>

          <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
              <label>Stock group (FEFO ordered)</label>
              <select className="select" value={pickBatchId} onChange={(e) => setPickBatchId(e.target.value)}>
                <option value="">Select stock group...</option>
                {filteredBatches.length === 0 && (
                  <option value="" disabled>No matching stock groups</option>
                )}
                {filteredBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {(productsBySku[b.sku]?.productName || b.sku)} · {b.sku} · {b.batchNo} · {b.qty} left · exp{' '}
                    {formatExpiry(b.expiryDate)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 110, marginBottom: 0 }}>
              <label>Qty</label>
              <input className="input" type="number" min="1" value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
            </div>
            <button className="btn sm" onClick={addToCart}>Add</button>
          </div>

          <div style={{ marginTop: 16 }}>
            {cart.length === 0 ? (
              <div className="empty">No items yet. Add stock groups above.</div>
            ) : (
              cart.map((c) => (
                <div key={c.batchId} className="cart-item">
                  <div>
                    <div style={{ fontSize: 13.5 }}>{productsBySku[c.sku]?.productName || c.sku}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {c.sku} · stock group {c.batchNo} · qty {c.qty}
                    </div>
                  </div>
                  <button className="btn ghost sm" onClick={() => removeFromCart(c.batchId)}>Remove</button>
                </div>
              ))
            )}
          </div>

          <button
            className="btn green"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={busy}
            onClick={createAndShip}
          >
            {busy ? 'Shipping…' : `Create & ship box (${cart.reduce((s, c) => s + c.qty, 0)} units)`}
          </button>
        </div>

        <div className="card">
          <h3>Outgoing from {activeLocation?.name || '—'}</h3>
          <div style={{ marginTop: 12, maxHeight: 520, overflowY: 'auto' }}>
            {history.length === 0 ? (
              <div className="empty">No transfers shipped from here yet.</div>
            ) : (
              history.map((t) => (
                <div key={t.id} className="card" style={{ marginBottom: 10, background: '#0c1322' }}>
                  <div className="row spread">
                    <strong className="mono">{t.transferNo}</strong>
                    <FlowBadge status={t.status} />
                  </div>
                  <div className="faint" style={{ fontSize: 12.5, margin: '6px 0' }}>
                    → {locName(t.toLocationId)} · {t.items?.length} SKUs ·{' '}
                    {t.items?.reduce((s, i) => s + i.qty, 0)} units
                  </div>
                  <FlowSteps status={t.status} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FlowSteps({ status }) {
  const idx = TRANSFER_FLOW.indexOf(status === 'mismatch' ? 'accepted' : status)
  const labels = ['Draft', 'Shipped', 'In transit', 'Accepted', 'Sold']
  return (
    <div className="flow-steps">
      {labels.map((l, i) => (
        <span key={l}>
          <span className={`flow-step ${i < idx ? 'done' : i === idx ? 'current' : ''}`}>{l}</span>
          {i < labels.length - 1 && <span className="flow-arrow"> › </span>}
        </span>
      ))}
    </div>
  )
}
