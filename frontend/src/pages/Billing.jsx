import { useState, useEffect, useMemo, useRef } from 'react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useAuth } from '../lib/AuthContext'
import { useAlerts } from '../lib/AlertsContext'
import { useToast } from '../lib/ToastContext'
import { createBill, listBills } from '../lib/api'
import { parseScan } from '../lib/scanner'
import ScannerModal from '../components/ScannerModal'

export default function Billing() {
  const { activeLocation } = useWorkspace()
  const { batches, productsBySku, refresh: refreshStock } = useAlerts()
  const { profile, isAdmin } = useAuth()
  const toast = useToast()

  // Tabs: 'pos' or 'history'
  const [activeTab, setActiveTab] = useState('pos')

  // Scanner & Batch Picker Modals
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [batchPickerModal, setBatchPickerModal] = useState(null) // { productName, sku, batches, scannedExpiry }

  // Cart State
  const [cart, setCart] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState(null)

  // Bill History State
  const [bills, setBills] = useState([])
  const [loadingBills, setLoadingBills] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyDateFilter, setHistoryDateFilter] = useState('all') // 'today', 'week', 'month', 'all'

  const searchInputRef = useRef(null)

  // Live in-stock batches for current active location
  const inventory = useMemo(() => {
    return (batches || []).filter((b) => (b.qty || 0) > 0)
  }, [batches])

  // Load Past Bills
  const loadHistory = async () => {
    if (!activeLocation) return
    setLoadingBills(true)
    try {
      const pastBills = await listBills(activeLocation.id)
      setBills(pastBills)
    } catch (err) {
      toast.err('Failed to load bill history: ' + err.message)
    } finally {
      setLoadingBills(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [activeLocation?.id])

  // Filtered in-stock products for POS search dropdown
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return []
    return inventory
      .map((b) => {
        const prod = productsBySku[b.sku] || {}
        return {
          ...b,
          productName: prod.productName || b.sku,
          brand: prod.brand || '',
          category: prod.category || '',
          barcode: prod.barcode || '',
          sellingPrice: b.sellingPrice || prod.sellingPrice || 0,
          buyingPrice: b.buyingPrice || prod.buyingPrice || 0,
        }
      })
      .filter((item) => {
        const haystack = `${item.sku} ${item.productName} ${item.brand} ${item.barcode} ${item.batchNo}`.toLowerCase()
        return haystack.includes(q)
      })
      .slice(0, 10)
  }, [inventory, productsBySku, productSearch])

  // Add Item to Cart (Targets the SPECIFIC batch chosen by scan/expiry)
  const addToCart = (item) => {
    const existingIndex = cart.findIndex((c) => c.batchId === item.id)
    if (existingIndex >= 0) {
      // Increase qty if stock allows
      const currentCartItem = cart[existingIndex]
      if (currentCartItem.qty >= item.qty) {
        toast.err(`Cannot add more. Only ${item.qty} units available in this batch (${item.batchNo}).`)
        return
      }
      const updated = [...cart]
      updated[existingIndex].qty += 1
      updated[existingIndex].subtotal = updated[existingIndex].qty * updated[existingIndex].unitPrice
      setCart(updated)
    } else {
      const prod = productsBySku[item.sku] || {}
      setCart([
        ...cart,
        {
          batchId: item.id,
          sku: item.sku,
          productName: prod.productName || item.productName || item.sku,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate || '',
          maxStock: item.qty,
          qty: 1,
          unitPrice: Number(item.sellingPrice || prod.sellingPrice) || 0,
          buyingPrice: Number(item.buyingPrice || prod.buyingPrice) || 0,
          subtotal: Number(item.sellingPrice || prod.sellingPrice) || 0,
        },
      ])
    }
    setProductSearch('')
    searchInputRef.current?.focus()
  }

  // Switch Batch for an Item in the Cart (Change Target Expiry Date)
  const switchCartBatch = (oldBatchId, newBatchId) => {
    if (oldBatchId === newBatchId) return
    const newBatch = inventory.find((b) => b.id === newBatchId)
    if (!newBatch) return

    setCart((prev) =>
      prev.map((it) => {
        if (it.batchId !== oldBatchId) return it
        const prod = productsBySku[newBatch.sku] || {}
        const safeQty = Math.min(it.qty, newBatch.qty)
        const price = Number(newBatch.sellingPrice || prod.sellingPrice || it.unitPrice) || 0
        return {
          ...it,
          batchId: newBatch.id,
          batchNo: newBatch.batchNo,
          expiryDate: newBatch.expiryDate || '',
          maxStock: newBatch.qty,
          qty: safeQty,
          unitPrice: price,
          subtotal: safeQty * price,
        }
      })
    )
    toast.ok(`Switched to batch ${newBatch.batchNo} (Expiry: ${newBatch.expiryDate})`)
  }

  // Barcode & QR Code Processing (Extracts Expiry Date and Targets the Batch)
  const processScan = (scanInput) => {
    let parsed
    if (typeof scanInput === 'string') {
      parsed = parseScan(scanInput) || { type: 'barcode', barcode: scanInput.trim() }
    } else {
      parsed = scanInput
    }

    const raw = (parsed.raw || parsed.barcode || parsed.sku || parsed.gtin || '').trim()
    const targetCode = (parsed.sku || parsed.barcode || parsed.gtin || raw).toLowerCase()
    const targetExpiry = (parsed.expiryDate || '').trim()
    const targetBatchNo = (parsed.batchNo || '').trim()

    if (!targetCode) return

    // Find in inventory matching this SKU, barcode, or product name
    const matches = inventory.filter((b) => {
      const prod = productsBySku[b.sku] || {}
      return (
        b.sku.toLowerCase() === targetCode ||
        (b.barcode && b.barcode.toLowerCase() === targetCode) ||
        (prod.barcode && prod.barcode.toLowerCase() === targetCode) ||
        (prod.productName && prod.productName.toLowerCase() === targetCode)
      )
    })

    if (!matches.length) {
      toast.err(`No in-stock item found for scanned code: "${raw || targetCode}"`)
      return
    }

    // 1. If an Expiry Date was extracted from the barcode scan (e.g. GS1 2D barcode or Shelf QR)
    if (targetExpiry) {
      const exactExpiryMatch = matches.find(
        (b) => b.expiryDate === targetExpiry || (b.expiryDate && b.expiryDate.startsWith(targetExpiry))
      )
      if (exactExpiryMatch) {
        addToCart(exactExpiryMatch)
        toast.ok(`✓ Scanned from Barcode: Expiry ${exactExpiryMatch.expiryDate} (Batch ${exactExpiryMatch.batchNo})`)
        setScanModalOpen(false)
        setProductSearch('')
        return
      }
    }

    // 2. If a Batch No was extracted from the barcode
    if (targetBatchNo) {
      const exactBatchMatch = matches.find((b) => b.batchNo === targetBatchNo)
      if (exactBatchMatch) {
        addToCart(exactBatchMatch)
        toast.ok(`✓ Scanned from Barcode: Batch ${exactBatchMatch.batchNo} (Expiry: ${exactBatchMatch.expiryDate})`)
        setScanModalOpen(false)
        setProductSearch('')
        return
      }
    }

    // 3. If only 1 batch is in stock for this product:
    if (matches.length === 1) {
      addToCart(matches[0])
      toast.ok(`✓ Added: ${matches[0].productName || matches[0].sku} (Expiry: ${matches[0].expiryDate || 'N/A'})`)
      setScanModalOpen(false)
      setProductSearch('')
      return
    }

    // 4. Multiple batches exist with different expiry dates:
    // Prompt cashier to select the specific expiry date printed on the item being billed
    const prod = productsBySku[matches[0].sku] || {}
    setBatchPickerModal({
      open: true,
      productName: prod.productName || matches[0].sku,
      sku: matches[0].sku,
      scannedExpiry: targetExpiry,
      batches: matches,
    })
    setScanModalOpen(false)
    setProductSearch('')
  }

  // Update Cart Item Quantity
  const updateQty = (batchId, newQty) => {
    const q = parseInt(newQty, 10)
    setCart((prev) =>
      prev.map((it) => {
        if (it.batchId !== batchId) return it
        if (isNaN(q) || q <= 0) return { ...it, qty: 1, subtotal: it.unitPrice }
        if (q > it.maxStock) {
          toast.err(`Batch limit exceeded. Only ${it.maxStock} units available in this batch.`)
          return { ...it, qty: it.maxStock, subtotal: it.maxStock * it.unitPrice }
        }
        return { ...it, qty: q, subtotal: q * it.unitPrice }
      })
    )
  }

  // Remove Item from Cart
  const removeFromCart = (batchId) => {
    setCart((prev) => prev.filter((it) => it.batchId !== batchId))
  }

  // Clear Cart
  const clearCart = () => {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setDiscount('')
    setNotes('')
  }

  // Calculate Totals
  const subtotal = cart.reduce((s, it) => s + (it.subtotal || 0), 0)
  const discountVal = Math.min(subtotal, Math.max(0, parseFloat(discount) || 0))
  const grandTotal = Math.max(0, subtotal - discountVal)
  const totalItemsCount = cart.reduce((s, it) => s + it.qty, 0)

  // Handle Save Bill (Strictly Deducts from the Selected Batches — NO FEFO Override)
  const handleSaveBill = async () => {
    if (isAdmin) return toast.err('Admins cannot create bills. Bills must be created by shop user.')
    if (!activeLocation) return toast.err('Please select an active shop warehouse first.')
    if (!cart.length) return toast.err('Cart is empty. Please add items to generate a bill.')

    setBusy(true)
    try {
      const bill = await createBill({
        locationId: activeLocation.id,
        shopName: activeLocation.name || 'My Shop',
        shopAddress: activeLocation.address || '',
        shopPhone: activeLocation.phone || activeLocation.ownerPhone || '',
        items: cart,
        customerName,
        customerPhone,
        paymentMethod,
        discount: discountVal,
        notes,
        by: profile?.email || 'cashier',
      })

      toast.ok(`Bill #${bill.invoiceNo} saved! Stock deducted from targeted batches.`)
      setActiveReceipt(bill)
      clearCart()
      // Refresh inventory and bills
      refreshStock?.()
      loadHistory()
    } catch (err) {
      toast.err('Error saving bill: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  // Filtered Bill History
  const filteredBills = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    const now = new Date()

    return bills.filter((b) => {
      // Text search
      if (q) {
        const text = `${b.invoiceNo || ''} ${b.customerName || ''} ${b.customerPhone || ''} ${b.paymentMethod || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }

      // Date filter
      if (historyDateFilter !== 'all') {
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0)
        const diffMs = now.getTime() - bDate.getTime()
        const diffDays = diffMs / (1000 * 60 * 60 * 24)

        if (historyDateFilter === 'today' && diffDays > 1) return false
        if (historyDateFilter === 'week' && diffDays > 7) return false
        if (historyDateFilter === 'month' && diffDays > 30) return false
      }

      return true
    })
  }, [bills, historySearch, historyDateFilter])

  const formatDateTime = (ts) => {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>Billing &amp; Point of Sale (POS)</h1>
          <div className="sub">
            {activeLocation ? activeLocation.name : 'Select a Shop'} · Barcode &amp; Expiry-Targeted Sales Invoices
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="row" style={{ gap: 8 }}>
          <button
            className={`btn sm ${activeTab === 'pos' ? 'primary' : 'ghost'}`}
            onClick={() => setActiveTab('pos')}
          >
            🛒 New Bill (POS)
          </button>
          <button
            className={`btn sm ${activeTab === 'history' ? 'primary' : 'ghost'}`}
            onClick={() => setActiveTab('history')}
          >
            📜 Bill History ({bills.length})
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: NEW BILL (POS)                                        */}
      {/* ============================================================ */}
      {activeTab === 'pos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 1fr)', gap: 16 }}>
          {/* Left Column: Cart & Item Entry */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Search / Scan Bar */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div className="field" style={{ position: 'relative' }}>
                <div className="row spread" style={{ marginBottom: 4, alignItems: 'center' }}>
                  <label style={{ fontWeight: 600, fontSize: 13.5 }}>
                    Scan Barcode or Search In-Stock Product
                  </label>
                  <span className="badge sm muted" style={{ fontSize: 10.5 }}>
                    Press [Enter] to scan · Reads Expiry Directly
                  </span>
                </div>

                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input
                    ref={searchInputRef}
                    className="input mono"
                    placeholder="Scan barcode, GS1 QR, or search product name / SKU..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (productSearch.trim()) {
                          processScan(productSearch.trim())
                        }
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn primary sm"
                    style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, height: 38 }}
                    onClick={() => setScanModalOpen(true)}
                    title="Open Camera Barcode Scanner"
                  >
                    📷 Scan Barcode / QR
                  </button>
                  {productSearch && (
                    <button className="btn ghost sm" onClick={() => setProductSearch('')}>
                      Clear
                    </button>
                  )}
                </div>

                {/* Dropdown search results */}
                {filteredProducts.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--card, #1e293b)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                      zIndex: 30,
                      maxHeight: 280,
                      overflowY: 'auto',
                      marginTop: 4,
                    }}
                  >
                    {filteredProducts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => addToCart(p)}
                        style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.productName}</div>
                          <div className="faint" style={{ fontSize: 11.5 }}>
                            SKU: <span className="mono">{p.sku}</span> · Batch: <span className="mono">{p.batchNo}</span> ·{' '}
                            <span style={{ color: '#22c55e', fontWeight: 600 }}>Exp: {p.expiryDate || 'N/A'}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                            ₹{Number(p.sellingPrice).toFixed(2)}
                          </div>
                          <span className="badge green sm">{p.qty} in stock</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                className="row spread"
                style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    🛒 Customer Cart ({cart.length} line item{cart.length !== 1 ? 's' : ''})
                  </div>
                  <span className="badge green sm" style={{ fontSize: 10, fontWeight: 700 }}>
                    🎯 Exact Batch Deduction (No FEFO Override)
                  </span>
                </div>
                {cart.length > 0 && (
                  <button className="btn ghost sm danger" onClick={clearCart} style={{ fontSize: 11 }}>
                    Empty Cart
                  </button>
                )}
              </div>

              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th>Batch &amp; Expiry Date (Deducted)</th>
                      <th>Rate</th>
                      <th style={{ width: 130 }}>Quantity</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.length === 0 && (
                      <tr>
                        <td colSpan={7} className="empty" style={{ padding: '36px 16px' }}>
                          Cart is currently empty. Scan a barcode above to add items directly by expiry date.
                        </td>
                      </tr>
                    )}
                    {cart.map((it, idx) => {
                      // Look up other batches available for this SKU in case cashier wants to switch batch
                      const availableBatchesForSku = inventory.filter((b) => b.sku === it.sku)

                      return (
                        <tr key={it.batchId}>
                          <td>{idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{it.productName}</div>
                            <div className="faint mono" style={{ fontSize: 11 }}>{it.sku}</div>
                          </td>
                          <td>
                            {availableBatchesForSku.length > 1 ? (
                              <div>
                                <select
                                  className="select"
                                  style={{ fontSize: 11.5, padding: '3px 8px', maxWidth: 210, borderColor: 'var(--border)' }}
                                  value={it.batchId}
                                  onChange={(e) => switchCartBatch(it.batchId, e.target.value)}
                                  title="Change the batch/expiry to match the exact physical item being sold"
                                >
                                  {availableBatchesForSku.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.batchNo} (Exp: {b.expiryDate}) · {b.qty} left
                                    </option>
                                  ))}
                                </select>
                                <div className="faint" style={{ fontSize: 10, marginTop: 2 }}>
                                  {availableBatchesForSku.length} batches in stock
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="mono" style={{ fontWeight: 600 }}>{it.batchNo}</span>
                                <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginTop: 2 }}>
                                  📅 Exp: {it.expiryDate || 'N/A'}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="mono">₹{it.unitPrice.toFixed(2)}</td>
                          <td>
                            <div className="row" style={{ alignItems: 'center', gap: 4 }}>
                              <button
                                type="button"
                                className="btn ghost sm"
                                style={{ padding: '2px 8px', fontSize: 13 }}
                                onClick={() => updateQty(it.batchId, it.qty - 1)}
                              >
                                -
                              </button>
                              <input
                                className="input mono"
                                type="number"
                                min="1"
                                max={it.maxStock}
                                value={it.qty}
                                onChange={(e) => updateQty(it.batchId, e.target.value)}
                                style={{ width: 50, textAlign: 'center', padding: '4px 2px' }}
                              />
                              <button
                                type="button"
                                className="btn ghost sm"
                                style={{ padding: '2px 8px', fontSize: 13 }}
                                onClick={() => updateQty(it.batchId, it.qty + 1)}
                              >
                                +
                              </button>
                            </div>
                            <div className="faint" style={{ fontSize: 10, marginTop: 2, textAlign: 'center' }}>
                              Max: {it.maxStock} in batch
                            </div>
                          </td>
                          <td className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>
                            ₹{it.subtotal.toFixed(2)}
                          </td>
                          <td>
                            <button
                              className="btn ghost sm danger"
                              style={{ padding: '2px 6px', fontSize: 12 }}
                              onClick={() => removeFromCart(it.batchId)}
                              title="Remove from cart"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Customer Info & Checkout Bill Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Customer Details */}
            <div className="card">
              <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Customer Details (Optional)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="field">
                  <label>Customer Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Walk-in Customer / Ramesh"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Mobile Number</label>
                  <input
                    className="input mono"
                    placeholder="e.g. 9876543210"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Payment Method</label>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {[
                      { id: 'cash', label: '💵 Cash' },
                      { id: 'upi', label: '📱 UPI / QR' },
                      { id: 'card', label: '💳 Card' },
                      { id: 'credit', label: '📝 Due/Credit' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`btn sm ${paymentMethod === m.id ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => setPaymentMethod(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Discount Amount (₹)</label>
                  <input
                    className="input mono"
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Bill Summary Card */}
            <div className="card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Invoice Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
                <div className="row spread">
                  <span className="muted">Total Line Items</span>
                  <span className="mono">{cart.length}</span>
                </div>
                <div className="row spread">
                  <span className="muted">Total Quantity Sold</span>
                  <span className="mono">{totalItemsCount} units</span>
                </div>
                <div className="row spread">
                  <span className="muted">Subtotal</span>
                  <span className="mono">₹{subtotal.toFixed(2)}</span>
                </div>
                {discountVal > 0 && (
                  <div className="row spread" style={{ color: '#22c55e' }}>
                    <span>Discount</span>
                    <span className="mono">-₹{discountVal.toFixed(2)}</span>
                  </div>
                )}
                <div
                  className="row spread"
                  style={{
                    borderTop: '1px solid var(--border)',
                    paddingTop: 10,
                    marginTop: 4,
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  <span>Grand Total</span>
                  <span className="mono" style={{ color: 'var(--accent, #6366f1)' }}>
                    ₹{grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <button
                  className="btn primary"
                  style={{ width: '100%', padding: '12px 16px', fontSize: 15, fontWeight: 700 }}
                  disabled={cart.length === 0 || busy}
                  onClick={handleSaveBill}
                >
                  {busy ? 'Saving Bill & Deducting Stock…' : '💳 Save & Generate Bill'}
                </button>
                <div className="faint" style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                  ✓ Stock is deducted strictly from each item's scanned expiry batch.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: BILL HISTORY & ARCHIVE                                */}
      {/* ============================================================ */}
      {activeTab === 'history' && (
        <div className="card">
          {/* Filters Bar */}
          <div className="row spread" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ width: 260 }}
                placeholder="Search Invoice #, Customer, Phone..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <select
                className="select"
                style={{ width: 'auto' }}
                value={historyDateFilter}
                onChange={(e) => setHistoryDateFilter(e.target.value)}
              >
                <option value="all">All Dates</option>
                <option value="today">Today Only</option>
                <option value="week">Past 7 Days</option>
                <option value="month">This Month</option>
              </select>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {filteredBills.length} invoice{filteredBills.length !== 1 ? 's' : ''} found
            </div>
          </div>

          {/* History Table */}
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>Items Sold</th>
                  <th>Total Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingBills && (
                  <tr>
                    <td colSpan={7} className="empty">Loading bill history…</td>
                  </tr>
                )}
                {!loadingBills && filteredBills.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">No bills found matching your criteria.</td>
                  </tr>
                )}
                {filteredBills.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{formatDateTime(b.createdAt)}</div>
                    </td>
                    <td>
                      <span className="mono" style={{ fontWeight: 700, color: 'var(--accent, #6366f1)' }}>
                        {b.invoiceNo}
                      </span>
                    </td>
                    <td>
                      <div>{b.customerName || 'Walk-in Customer'}</div>
                      {b.customerPhone && (
                        <div className="faint mono" style={{ fontSize: 11 }}>📞 {b.customerPhone}</div>
                      )}
                    </td>
                    <td>
                      <span className="badge sm muted" style={{ textTransform: 'uppercase' }}>
                        {b.paymentMethod || 'cash'}
                      </span>
                    </td>
                    <td>
                      <div><b>{b.totalQty || (b.items ? b.items.reduce((s, it) => s + (it.qty || 0), 0) : 0)}</b> units</div>
                      <div className="faint" style={{ fontSize: 11 }}>{b.items?.length || 0} product(s)</div>
                    </td>
                    <td className="mono" style={{ fontWeight: 700, fontSize: 14 }}>
                      ₹{Number(b.grandTotal || b.subtotal || 0).toFixed(2)}
                    </td>
                    <td>
                      <button
                        className="btn ghost sm"
                        style={{ fontSize: 12, padding: '3px 8px' }}
                        onClick={() => setActiveReceipt(b)}
                      >
                        🖨️ View Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: BATCH / EXPIRY DATE PICKER                           */}
      {/* ============================================================ */}
      {batchPickerModal && (
        <div className="modal-backdrop" onClick={() => setBatchPickerModal(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Select Item's Expiry Date</h3>
              <button className="btn ghost sm" onClick={() => setBatchPickerModal(null)}>✕</button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 14px' }}>
              Product: <b>{batchPickerModal.productName}</b> (<span className="mono">{batchPickerModal.sku}</span>)<br />
              Multiple batches exist in stock. Select the expiry date printed on the physical item being sold:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {batchPickerModal.batches.map((b) => (
                <div
                  key={b.id}
                  className="card"
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onClick={() => {
                    addToCart(b)
                    setBatchPickerModal(null)
                    toast.ok(`Targeting batch ${b.batchNo} (Expiry: ${b.expiryDate})`)
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent, #6366f1)'
                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      📅 Expiry: <span style={{ color: '#22c55e' }}>{b.expiryDate || 'N/A'}</span>
                    </div>
                    <div className="faint mono" style={{ fontSize: 11.5, marginTop: 2 }}>
                      Batch No: {b.batchNo}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="badge green sm">{b.qty} units in stock</span>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                      ₹{Number(b.sellingPrice || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={() => setBatchPickerModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* CAMERA SCANNER MODAL                                         */}
      {/* ============================================================ */}
      <ScannerModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onDetect={(detectResult) => {
          processScan(detectResult)
        }}
      />

      {/* ============================================================ */}
      {/* PRINTABLE RECEIPT MODAL                                      */}
      {/* ============================================================ */}
      {activeReceipt && (
        <div className="modal-backdrop" onClick={() => setActiveReceipt(null)}>
          <div
            className="modal"
            style={{ maxWidth: 460, padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Printable Receipt Body */}
            <div
              id="printable-receipt"
              style={{
                padding: '24px 28px',
                background: '#ffffff',
                color: '#111827',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {/* Shop Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px dashed #d1d5db', paddingBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
                  {activeReceipt.shopName || activeLocation?.name || 'MY SHOP'}
                </h2>
                <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                  {activeReceipt.shopAddress || activeLocation?.address || 'Retail Store Outlet'}
                </div>
                {(activeReceipt.shopPhone || activeLocation?.phone || activeLocation?.ownerPhone) && (
                  <div style={{ fontSize: 11, color: '#4b5563' }}>
                    Tel: {activeReceipt.shopPhone || activeLocation?.phone || activeLocation?.ownerPhone}
                  </div>
                )}
              </div>

              {/* Invoice Metadata */}
              <div style={{ margin: '12px 0', fontSize: 11.5, borderBottom: '1px dashed #d1d5db', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><b>Invoice #:</b> {activeReceipt.invoiceNo}</span>
                  <span><b>Date:</b> {formatDateTime(activeReceipt.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span><b>Customer:</b> {activeReceipt.customerName || 'Walk-in'}</span>
                  <span><b>Payment:</b> {String(activeReceipt.paymentMethod || 'cash').toUpperCase()}</span>
                </div>
                {activeReceipt.customerPhone && (
                  <div style={{ marginTop: 2 }}>
                    <b>Phone:</b> {activeReceipt.customerPhone}
                  </div>
                )}
              </div>

              {/* Items List */}
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #9ca3af', textAlign: 'left' }}>
                    <th style={{ padding: '4px 0' }}>Item</th>
                    <th style={{ padding: '4px 0', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '4px 0', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '4px 0', textAlign: 'right' }}>Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeReceipt.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px dotted #e5e7eb' }}>
                      <td style={{ padding: '6px 0' }}>
                        <div style={{ fontWeight: 600 }}>{it.productName || it.sku}</div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>
                          Batch: {it.batchNo || '—'} {it.expiryDate ? `· Exp: ${it.expiryDate}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '6px 0', textAlign: 'center' }}>{it.qty}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>₹{Number(it.unitPrice).toFixed(2)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>
                        ₹{Number(it.subtotal || it.qty * it.unitPrice).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Financial Totals */}
              <div style={{ borderTop: '1px dashed #d1d5db', paddingTop: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Subtotal</span>
                  <span>₹{Number(activeReceipt.subtotal).toFixed(2)}</span>
                </div>
                {activeReceipt.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#16a34a' }}>
                    <span>Discount</span>
                    <span>-₹{Number(activeReceipt.discount).toFixed(2)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 800,
                    fontSize: 15,
                    borderTop: '1px solid #111827',
                    paddingTop: 6,
                    marginTop: 4,
                  }}
                >
                  <span>Grand Total</span>
                  <span>₹{Number(activeReceipt.grandTotal || activeReceipt.subtotal).toFixed(2)}</span>
                </div>
              </div>

              {/* Thank You Note */}
              <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: '#6b7280' }}>
                Thank you for shopping with us! Please visit again.
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div
              className="row spread"
              style={{
                padding: '12px 18px',
                background: 'var(--card, #1e293b)',
                borderTop: '1px solid var(--border)',
              }}
            >
              <button className="btn ghost sm" onClick={() => setActiveReceipt(null)}>
                Close
              </button>
              <button
                className="btn primary sm"
                onClick={() => {
                  window.print()
                }}
              >
                🖨️ Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
