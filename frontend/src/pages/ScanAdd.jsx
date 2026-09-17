import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAuth } from '../lib/AuthContext'
import { useAlerts } from '../lib/AlertsContext'
import { useToast } from '../lib/ToastContext'
import { findProduct, addStock, saveProduct } from '../lib/api'
import { parseScan } from '../lib/scanner'
import ScannerModal from '../components/ScannerModal'
import { printQrLabel } from '../components/QrLabel'

const empty = { sku: '', barcode: '', productName: '', batchNo: '', qty: '', expiryDate: '' }

export default function ScanAdd() {
  const { activeLocation } = useWorkspace()
  const { profile, isAdmin } = useAuth()
  const { refresh } = useAlerts()
  const toast = useToast()

  const [form, setForm] = useState(empty)
  const [knownProduct, setKnownProduct] = useState(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const inputRef = useRef(null)
  const batchRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const lookup = async (raw) => {
    const parsed = parseScan(raw)
    if (parsed.type === 'label') {
      setForm((f) => ({ ...f, sku: parsed.sku, batchNo: parsed.batchNo || f.batchNo, expiryDate: parsed.expiryDate || f.expiryDate }))
      await resolveProduct({ sku: parsed.sku })
      return
    }
    if (parsed.type === 'gs1') {
      setForm((f) => ({ ...f, barcode: parsed.barcode || f.barcode, batchNo: parsed.batchNo || f.batchNo, expiryDate: parsed.expiryDate || f.expiryDate }))
      await resolveProduct({ barcode: parsed.barcode, sku: parsed.barcode })
      if (parsed.batchNo || parsed.expiryDate) toast.ok('2D code read: batch & expiry filled automatically.')
      return
    }
    await resolveProduct({ barcode: parsed.barcode, sku: parsed.barcode })
  }

  const resolveProduct = async ({ sku, barcode }) => {
    const p = await findProduct({ sku, barcode })
    if (p) {
      setKnownProduct(p)
      setForm((f) => ({ ...f, sku: p.sku, barcode: p.barcode || barcode || '', productName: p.productName }))
      toast.ok(`Found: ${p.productName}`)
      setTimeout(() => batchRef.current?.focus(), 50)
    } else {
      setKnownProduct(null)
      setForm((f) => ({ ...f, sku: sku || f.sku, barcode: barcode || f.barcode }))
      toast.info('New product — fill in its name to register it.')
    }
  }

  const onDetect = (d) => {
    if (d.type === 'ocr') {
      setForm((f) => ({ ...f, expiryDate: d.expiry || f.expiryDate }))
      setScanOpen(false)
      toast.ok('Read expiry — please confirm.')
      return
    }
    if (d.raw) lookup(d.raw)
    else if (d.type === 'label') lookup(`SF|${d.sku}|${d.batchNo}|${d.expiryDate}|${d.locationId}`)
    else lookup(d.barcode)
    setScanOpen(false)
  }

  const onLookupKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = e.target.value.trim()
      if (v) lookup(v)
    }
  }

  const save = async () => {
    if (isAdmin) return toast.err('Admins cannot add products. Products must be added by the shop user.')
    if (!activeLocation) return toast.err('Select a warehouse first.')
    if (!form.sku) return toast.err('A SKU is required.')
    if (!form.productName && !knownProduct) return toast.err('Enter the product name.')
    if (!(Number(form.qty) > 0)) return toast.err('Quantity must be more than zero.')

    const batchNo = form.batchNo.trim() || (form.expiryDate ? `EXP-${form.expiryDate.slice(0, 7)}` : 'DEFAULT')

    setBusy(true)
    try {
      if (!knownProduct) {
        await saveProduct({ sku: form.sku, productName: form.productName, barcode: form.barcode })
      }
      await addStock({
        sku: form.sku,
        locationId: activeLocation.id,
        batchNo,
        qty: Number(form.qty),
        expiryDate: form.expiryDate,
        by: profile?.email,
      })
      setLastSaved({ ...form, batchNo, location: activeLocation })
      toast.ok(`Added ${form.qty} to ${activeLocation.name}.`)
      setForm(empty)
      setKnownProduct(null)
      inputRef.current?.focus()
      refresh()
    } catch (err) {
      toast.err(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Add Stock</h1>
          <div className="sub">{activeLocation ? `Adding into ${activeLocation.name}` : 'Choose a warehouse to add stock'}</div>
        </div>
      </div>

      {isAdmin && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent, #6366f1)', background: 'rgba(99, 102, 241, 0.08)' }}>
          <div style={{ fontWeight: 600, color: 'var(--accent, #6366f1)' }}>Platform Admin — Product Management Restricted</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Admin accounts only onboard shops and create user credentials. Admins cannot add or remove products.
            Products must be added by shop user accounts directly.
          </p>
        </div>
      )}

      <button className="scan-hero" onClick={() => setScanOpen(true)}>
        <span className="scan-hero-ic">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
          </svg>
        </span>
        <span className="scan-hero-text">
          <b>Tap to scan</b>
          <small>Camera or USB barcode · or type the SKU below</small>
        </span>
        <span className="scan-hero-go">Scan →</span>
      </button>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3><span className="step-n">1</span> Find product</h3>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Type the SKU (or scan barcode / QR), then press Enter</label>
            <input ref={inputRef} className="input mono" placeholder="e.g. SKU-001 or 890xxxxxxxx" onKeyDown={onLookupKey} />
            <span className="faint" style={{ fontSize: 12 }}>Name &amp; details fill in automatically when the product is known.</span>
          </div>
          {knownProduct ? (
            <div className="badge good" style={{ marginBottom: 10 }}><span className="dot" /> {knownProduct.productName}</div>
          ) : form.sku ? (
            <div className="badge warn" style={{ marginBottom: 10 }}><span className="dot" /> New product — needs a name</div>
          ) : null}
          <div className="field"><label>SKU</label><input className="input mono" value={form.sku} onChange={set('sku')} /></div>
          <div className="field">
            <label>Product name</label>
            <input className="input" value={form.productName} onChange={set('productName')} disabled={!!knownProduct} placeholder={knownProduct ? knownProduct.productName : 'Display name'} />
          </div>
          <div className="field"><label>Barcode (leave blank for no-barcode items)</label><input className="input mono" value={form.barcode} onChange={set('barcode')} /></div>
        </div>

        <div className="card">
          <h3><span className="step-n">2</span> Expiry &amp; quantity</h3>
          <button className="scan-mini" onClick={() => setScanOpen(true)} style={{ marginTop: 12 }}>
            <span className="scan-mini-ic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
              </svg>
            </span>
            <span><b>Scan expiry from pack</b><small>Photo of the pack — we read just the expiry date</small></span>
          </button>
          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <div className="field"><label>Expiry date</label><input ref={batchRef} className="input" type="date" value={form.expiryDate} onChange={set('expiryDate')} /></div>
            <div className="field"><label>Quantity</label><input className="input" type="number" min="1" value={form.qty} onChange={set('qty')} placeholder="e.g. 50" /></div>
          </div>
          <details style={{ marginBottom: 14 }}>
            <summary className="muted" style={{ fontSize: 13, cursor: 'pointer' }}>Batch / lot number (optional)</summary>
            <div className="field" style={{ marginTop: 10 }}>
              <input className="input mono" value={form.batchNo} onChange={set('batchNo')} placeholder="leave blank — grouped by expiry automatically" />
            </div>
          </details>
          <button className="btn green" onClick={save} disabled={busy || isAdmin} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Saving…' : isAdmin ? 'Admin Restricted (Cannot Add Products)' : 'Save to inventory'}
          </button>
        </div>
      </div>

      {lastSaved && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row spread">
            <div>
              <h3>Saved</h3>
              <div className="sub">{lastSaved.productName || lastSaved.sku} · {lastSaved.qty} units · {lastSaved.location?.name}</div>
            </div>
            <button className="btn sm" onClick={() => printQrLabel({ sku: lastSaved.sku, batchNo: lastSaved.batchNo, expiryDate: lastSaved.expiryDate, locationId: lastSaved.location?.id })}>
              Print QR label
            </button>
          </div>
        </div>
      )}

      <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onDetect={onDetect} />
    </div>
  )
}
