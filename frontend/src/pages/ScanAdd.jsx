import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAuth } from '../lib/AuthContext'
import { useAlerts } from '../lib/AlertsContext'
import { useToast } from '../lib/ToastContext'
import { findProduct, addStock, saveProduct } from '../lib/api'
import { parseScan } from '../lib/scanner'
import ScannerModal from '../components/ScannerModal'
import { printQrLabel } from '../components/QrLabel'

const empty = {
  sku: '',
  barcode: '',
  productName: '',
  batchNo: '',
  qty: '',
  expiryDate: '',
  mrp: '',
  buyingPrice: '',
  sellingPrice: '',
  emergencyPrice: '',
}

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
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef(null)
  const batchRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Keep SKU, Barcode, and SearchQuery 100% identical and synchronized
  const handleCodeChange = (val) => {
    setSearchQuery(val)
    setForm((f) => ({
      ...f,
      sku: val,
      barcode: val,
    }))
  }

  const handleCodeBlur = () => {
    const v = (searchQuery || form.sku || '').trim()
    if (v && (!knownProduct || (knownProduct.sku !== v && knownProduct.barcode !== v))) {
      lookup(v)
    }
  }

  const lookup = async (raw) => {
    const rawStr = String(raw || '').trim()
    if (!rawStr) return
    const parsed = parseScan(rawStr)
    const codeToFill = parsed?.barcode || parsed?.sku || rawStr

    // Synchronize both SKU and Barcode immediately
    setSearchQuery(codeToFill)
    if (inputRef.current) {
      inputRef.current.value = codeToFill
    }

    if (parsed.type === 'label') {
      setForm((f) => ({
        ...f,
        sku: parsed.sku,
        barcode: parsed.sku,
        batchNo: parsed.batchNo || f.batchNo,
        expiryDate: parsed.expiryDate || f.expiryDate,
      }))
      await resolveProduct({ sku: parsed.sku, barcode: parsed.sku })
      return
    }
    if (parsed.type === 'gs1') {
      setForm((f) => ({
        ...f,
        sku: parsed.barcode || f.sku || rawStr,
        barcode: parsed.barcode || f.barcode || rawStr,
        batchNo: parsed.batchNo || f.batchNo,
        expiryDate: parsed.expiryDate || f.expiryDate,
      }))
      await resolveProduct({ barcode: parsed.barcode, sku: parsed.barcode })
      if (parsed.batchNo || parsed.expiryDate) toast.ok('2D code read: batch & expiry filled automatically.')
      return
    }
    setForm((f) => ({
      ...f,
      sku: codeToFill,
      barcode: codeToFill,
    }))
    await resolveProduct({ barcode: codeToFill, sku: codeToFill })
  }

  const resolveProduct = async ({ sku, barcode }) => {
    const code = (sku || barcode || '').trim()
    if (!code) return
    const p = await findProduct({ sku: code, barcode: code })
    if (p) {
      setKnownProduct(p)
      const pCode = p.barcode || p.sku || code
      setSearchQuery(pCode)
      setForm((f) => ({
        ...f,
        sku: pCode,
        barcode: pCode,
        productName: p.productName || '',
        mrp: p.mrp ? String(p.mrp) : (p.sellingPrice ? String(p.sellingPrice) : f.mrp),
        buyingPrice: p.buyingPrice ? String(p.buyingPrice) : f.buyingPrice,
        sellingPrice: p.sellingPrice ? String(p.sellingPrice) : f.sellingPrice,
        emergencyPrice: p.emergencyPrice ? String(p.emergencyPrice) : f.emergencyPrice,
      }))
      toast.ok(`Found: ${p.productName}`)
      setTimeout(() => batchRef.current?.focus(), 50)
    } else {
      setKnownProduct(null)
      setSearchQuery(code)
      setForm((f) => ({
        ...f,
        sku: code,
        barcode: code,
      }))
      toast.info('New product — enter name & pricing to register.')
    }
  }

  const onDetect = (d) => {
    if (d.type === 'ocr') {
      setForm((f) => ({ ...f, expiryDate: d.expiry || f.expiryDate }))
      setScanOpen(false)
      toast.ok('Read expiry — please confirm.')
      return
    }
    const scannedVal = d.raw || d.barcode || (d.type === 'label' ? `SF|${d.sku}|${d.batchNo}|${d.expiryDate}|${d.locationId}` : '')
    if (scannedVal) {
      lookup(scannedVal)
    }
    setScanOpen(false)
  }

  const onLookupKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = (searchQuery || form.sku || e.target.value || '').trim()
      if (v) lookup(v)
    }
  }

  // Pricing Calculations & 75% Rule Validation
  const bp = parseFloat(form.buyingPrice) || 0
  const sp = parseFloat(form.sellingPrice) || 0
  const ep = parseFloat(form.emergencyPrice) || 0
  const mrp = parseFloat(form.mrp) || sp

  const normalProfit = sp > bp ? sp - bp : 0
  const emergencyProfit = ep > bp ? ep - bp : 0
  const maxEmergencyProfitAllowed = normalProfit > 0 ? 0.75 * normalProfit : 0
  const maxEmergencyPriceAllowed = normalProfit > 0 ? bp + maxEmergencyProfitAllowed : bp

  const hasAllPrices = bp > 0 && sp > 0 && ep > 0
  const isSpValid = sp > bp
  // Profit made by emergency price must be STRICTLY LESS than 75% of profit by selling price
  const isEmergencyProfitValid = hasAllPrices && isSpValid && ep >= bp && emergencyProfit < maxEmergencyProfitAllowed
  const isEmergencyProfitExceeded = hasAllPrices && isSpValid && emergencyProfit >= maxEmergencyProfitAllowed

  const save = async () => {
    if (isAdmin) return toast.err('Admins cannot add products. Products must be added by the shop user.')
    if (!activeLocation) return toast.err('Select a warehouse/store first.')
    const code = (form.sku || searchQuery || form.barcode || '').trim()
    if (!code) return toast.err('Please enter or scan a SKU / Barcode in Step 1.')
    if (!form.productName && !knownProduct) return toast.err('Please enter the Product Name in Step 1.')
    if (!(Number(form.qty) > 0)) return toast.err('Quantity must be greater than zero in Step 2.')

    // Pricing validation
    if (!bp || bp <= 0) return toast.err('Please enter a valid Buying Price (Cost Price) in Question 1.')
    if (!sp || sp <= bp) return toast.err('Selling Price (Question 2) must be greater than Buying Price.')

    let finalEp = ep
    if (!finalEp && sp > bp) {
      finalEp = Number((bp + (normalProfit * 0.50)).toFixed(2))
    }
    if (finalEp < bp) return toast.err('Emergency Price (Question 3) cannot be lower than Buying Price.')
    const currEmergencyProfit = finalEp - bp
    if (currEmergencyProfit >= maxEmergencyProfitAllowed && maxEmergencyProfitAllowed > 0) {
      return toast.err(`Emergency profit (₹${currEmergencyProfit.toFixed(2)}) must be strictly less than 75% of selling profit (₹${maxEmergencyProfitAllowed.toFixed(2)}). Maximum allowed is ₹${(maxEmergencyPriceAllowed - 0.01).toFixed(2)}.`)
    }

    const batchNo = form.batchNo.trim() || (form.expiryDate ? `EXP-${form.expiryDate.slice(0, 7)}` : 'DEFAULT')
    const mrpNum = parseFloat(form.mrp) || sp

    setBusy(true)
    try {
      await saveProduct({
        sku: code,
        productName: form.productName || knownProduct?.productName,
        barcode: code,
        mrp: mrpNum,
        buyingPrice: bp,
        sellingPrice: sp,
        emergencyPrice: finalEp,
      })

      await addStock({
        sku: code,
        locationId: activeLocation.id,
        batchNo,
        qty: Number(form.qty),
        expiryDate: form.expiryDate,
        by: profile?.email,
        mrp: mrpNum,
        buyingPrice: bp,
        sellingPrice: sp,
        emergencyPrice: finalEp,
        productName: form.productName || knownProduct?.productName,
        category: form.category || knownProduct?.category,
        unit: form.unit || knownProduct?.unit,
        barcode: code,
      })

      setLastSaved({
        ...form,
        sku: code,
        barcode: code,
        batchNo,
        location: activeLocation,
        mrp: mrpNum,
        buyingPrice: bp,
        sellingPrice: sp,
        emergencyPrice: finalEp,
      })
      toast.ok(`Added ${form.qty} units to ${activeLocation.name}.`)
      setForm(empty)
      setKnownProduct(null)
      setSearchQuery('')
      if (inputRef.current) inputRef.current.value = ''
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

      <div className="grid cols-3" style={{ marginTop: 16, gap: 14 }}>
        {/* Step 1: Product Identification */}
        <div className="card">
          <h3><span className="step-n">1</span> Find Product</h3>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Type SKU / Barcode + Enter</label>
            <input
              ref={inputRef}
              className="input mono"
              placeholder="e.g. SKU-001 or 890xxxxxxxx"
              value={searchQuery}
              onChange={(e) => handleCodeChange(e.target.value)}
              onBlur={handleCodeBlur}
              onKeyDown={onLookupKey}
            />
            <span className="faint" style={{ fontSize: 11.5 }}>Name &amp; details auto-fill when known. Press Enter to search.</span>
          </div>

          {knownProduct ? (
            <div className="badge good" style={{ marginBottom: 10 }}>
              <span className="dot" /> Found in Catalog: {knownProduct.productName}
            </div>
          ) : form.sku ? (
            <div className="badge warn" style={{ marginBottom: 10 }}>
              <span className="dot" /> New Product — fill name &amp; pricing below
            </div>
          ) : null}

          <div className="field">
            <label>SKU / Barcode *</label>
            <input
              className="input mono"
              value={form.sku}
              onChange={(e) => handleCodeChange(e.target.value)}
              onBlur={handleCodeBlur}
              placeholder="e.g. SKU-001 or 890xxxxxxxx"
            />
            <span className="faint" style={{ fontSize: 11 }}>SKU and Barcode are synchronized to the same value.</span>
          </div>

          <div className="field">
            <label>Product Name *</label>
            <input
              className="input"
              value={form.productName}
              onChange={set('productName')}
              disabled={!!knownProduct}
              placeholder={knownProduct ? knownProduct.productName : 'Display name'}
            />
          </div>
        </div>

        {/* Step 2: Batch & Expiry */}
        <div className="card">
          <h3><span className="step-n">2</span> Expiry &amp; Quantity</h3>
          <button className="scan-mini" onClick={() => setScanOpen(true)} style={{ marginTop: 12 }}>
            <span className="scan-mini-ic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
              </svg>
            </span>
            <span><b>Scan expiry from pack</b><small>Photo of pack — reads expiry</small></span>
          </button>
          <div className="grid cols-2" style={{ marginTop: 14, gap: 10 }}>
            <div className="field"><label>Expiry date</label><input ref={batchRef} className="input" type="date" value={form.expiryDate} onChange={set('expiryDate')} /></div>
            <div className="field"><label>Quantity *</label><input className="input" type="number" min="1" value={form.qty} onChange={set('qty')} placeholder="e.g. 50" /></div>
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label>Batch / Lot Number (optional)</label>
            <input className="input mono" value={form.batchNo} onChange={set('batchNo')} placeholder="leave blank — grouped by expiry" />
          </div>
        </div>

        {/* Step 3: Mandatory Pricing Questions with 75% Profit Cap */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="row spread">
            <h3 style={{ margin: 0 }}><span className="step-n">3</span> Mandatory Product Pricing</h3>
            <span className="badge purple sm">75% Cap Rule</span>
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
            Answer the 3 mandatory pricing questions below. Profit made by emergency price must be strictly less than 75% of profit by selling price.
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Question 1: Buying Price */}
            <div className="field">
              <label style={{ fontWeight: 600, color: 'var(--text)' }}>
                1. Buying Price (Cost Price per unit) *
              </label>
              <div className="row" style={{ alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>₹</span>
                <input
                  className="input mono"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 100"
                  value={form.buyingPrice}
                  onChange={set('buyingPrice')}
                />
              </div>
              <span className="faint" style={{ fontSize: 11 }}>Cost price paid to supplier / vendor</span>
            </div>

            {/* Question 2: Selling Price */}
            <div className="field">
              <div className="row spread">
                <label style={{ fontWeight: 600, color: 'var(--text)' }}>
                  2. Selling Price (Regular Retail) *
                </label>
                {sp > bp && bp > 0 && (
                  <span className="badge green sm">Normal Profit: ₹{normalProfit.toFixed(2)}</span>
                )}
              </div>
              <div className="row" style={{ alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>₹</span>
                <input
                  className="input mono"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 200"
                  value={form.sellingPrice}
                  onChange={set('sellingPrice')}
                />
              </div>
              <span className="faint" style={{ fontSize: 11 }}>Normal customer selling price at your shop counter</span>
            </div>

            {/* Question 3: Emergency Price */}
            <div className="field">
              <div className="row spread" style={{ alignItems: 'center' }}>
                <label style={{ fontWeight: 600, color: 'var(--text)' }}>
                  3. Emergency Price (For Associated Partner Shops) *
                </label>
                {maxEmergencyProfitAllowed > 0 && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ fontSize: 11, padding: '2px 8px', borderColor: 'var(--border)' }}
                    onClick={() => setForm((prev) => ({ ...prev, emergencyPrice: (maxEmergencyPriceAllowed - 0.01).toFixed(2) }))}
                    title="Auto-fill with maximum price allowed under the 75% profit cap rule"
                  >
                    ⚡ Set Max: ₹{(maxEmergencyPriceAllowed - 0.01).toFixed(2)}
                  </button>
                )}
              </div>
              <div className="row" style={{ alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>₹</span>
                <input
                  className="input mono"
                  type="number"
                  step="0.01"
                  min="0"
                  max={maxEmergencyPriceAllowed > 0 ? (maxEmergencyPriceAllowed - 0.01).toFixed(2) : undefined}
                  placeholder={maxEmergencyPriceAllowed > 0 ? `Max ₹${(maxEmergencyPriceAllowed - 0.01).toFixed(2)}` : 'e.g. 160'}
                  value={form.emergencyPrice}
                  onChange={set('emergencyPrice')}
                  style={isEmergencyProfitExceeded ? { borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' } : {}}
                />
              </div>
              <span className="faint" style={{ fontSize: 11 }}>
                Discounted price when another associated shop buys this item in emergency
              </span>
            </div>

            {/* Optional MRP */}
            <div className="field">
              <div className="row spread">
                <label>Printed MRP (Maximum Retail Price on Package)</label>
                {mrp > sp && sp > 0 && (
                  <span className="badge green sm">Discount to Customer: ₹{(mrp - sp).toFixed(2)}</span>
                )}
              </div>
              <div className="row" style={{ alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>₹</span>
                <input
                  className="input mono"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 200 (Printed MRP)"
                  value={form.mrp}
                  onChange={set('mrp')}
                />
              </div>
            </div>

            {/* Profit & Validation Indicator */}
            {hasAllPrices && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 6,
                fontSize: 12,
                marginTop: 2,
                background: isEmergencyProfitExceeded
                  ? 'rgba(239, 68, 68, 0.1)'
                  : isEmergencyProfitValid
                  ? 'rgba(34, 197, 94, 0.08)'
                  : 'rgba(255, 255, 255, 0.02)',
                border: isEmergencyProfitExceeded
                  ? '1px solid #ef4444'
                  : isEmergencyProfitValid
                  ? '1px solid #22c55e'
                  : '1px solid var(--border)',
                color: isEmergencyProfitExceeded
                  ? '#ef4444'
                  : isEmergencyProfitValid
                  ? '#22c55e'
                  : 'inherit',
              }}>
                {isEmergencyProfitExceeded ? (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      ⚠️ 75% Profit Rule Exceeded:
                    </div>
                    <div>
                      • Normal Profit: <b>₹{normalProfit.toFixed(2)}</b> (₹{sp} - ₹{bp})<br />
                      • 75% Profit Cap: <b>₹{maxEmergencyProfitAllowed.toFixed(2)}</b><br />
                      • Your Emergency Profit: <b>₹{emergencyProfit.toFixed(2)}</b> ({((emergencyProfit / normalProfit) * 100).toFixed(1)}% of normal profit)<br />
                      Emergency profit must be <b>strictly less than 75%</b>. Maximum allowed emergency price is <b>₹{(maxEmergencyPriceAllowed - 0.01).toFixed(2)}</b>.
                    </div>
                  </div>
                ) : isEmergencyProfitValid ? (
                  <div>
                    ✓ <b>75% Rule Satisfied:</b> Emergency profit is <b>₹{emergencyProfit.toFixed(2)}</b> ({((emergencyProfit / normalProfit) * 100).toFixed(1)}% of normal profit ₹{normalProfit.toFixed(2)}), which is strictly under the 75% cap (₹{maxEmergencyProfitAllowed.toFixed(2)}).
                  </div>
                ) : sp <= bp ? (
                  <div style={{ color: '#f59e0b' }}>
                    Selling price must be higher than buying price.
                  </div>
                ) : ep < bp ? (
                  <div style={{ color: '#f59e0b' }}>
                    Emergency price cannot be lower than buying price.
                  </div>
                ) : null}
              </div>
            )}

            <button
              className="btn green"
              onClick={save}
              disabled={busy || isAdmin || isEmergencyProfitExceeded}
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', padding: '10px 0' }}
            >
              {busy ? 'Saving…' : isAdmin ? 'Admin Restricted' : 'Save to Inventory'}
            </button>
          </div>
        </div>
      </div>

      {lastSaved && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row spread">
            <div>
              <h3>Saved Successfully</h3>
              <div className="sub">
                {lastSaved.productName || lastSaved.sku} · {lastSaved.qty} units · {lastSaved.location?.name}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                Buying: ₹{lastSaved.buyingPrice} · Selling: ₹{lastSaved.sellingPrice} · Emergency: ₹{lastSaved.emergencyPrice}
              </div>
            </div>
            <button className="btn sm" onClick={() => printQrLabel({ sku: lastSaved.sku, batchNo: lastSaved.batchNo, expiryDate: lastSaved.expiryDate, locationId: lastSaved.location?.id })}>
              Print QR Label
            </button>
          </div>
        </div>
      )}

      <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onDetect={onDetect} />
    </div>
  )
}
