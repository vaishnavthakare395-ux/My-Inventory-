import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import {
  recentLedger, allOrdersForLocations, saveLocation, listLocations,
  setLocationActive, getOrderSources, saveOrderSources,
} from '../lib/api'
import { parseCsv, importProducts, exportWarehouseStock } from '../lib/sheets'
import { getSheetSync, saveSheetSync, testSheetUrl } from '../lib/sheetSync'
import { LEDGER_REASONS } from '../lib/constants'

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID

const REASON_LABEL = {
  [LEDGER_REASONS.ADD_STOCK]: 'Stock added',
  [LEDGER_REASONS.TRANSFER_OUT]: 'Transfer out',
  [LEDGER_REASONS.TRANSFER_IN]: 'Transfer in',
  [LEDGER_REASONS.SOLD]: 'Sold / shipped',
  [LEDGER_REASONS.RETURN_IN]: 'Return added',
  [LEDGER_REASONS.ADJUST]: 'Adjustment',
}

export default function Admin() {
  const { profile, locations } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('ledger')

  return (
    <div className="page">
      <div className="page-head"><div><h1>Admin Console</h1><div className="sub">Audit trail, all orders, locations and data import/export.</div></div></div>

      <div className="pill-tabs" style={{ marginBottom: 16 }}>
        <button className={tab === 'ledger' ? 'on' : ''} onClick={() => setTab('ledger')}>Stock ledger</button>
        <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>All orders</button>
        <button className={tab === 'data' ? 'on' : ''} onClick={() => setTab('data')}>Data &amp; Sheets</button>
        <button className={tab === 'locations' ? 'on' : ''} onClick={() => setTab('locations')}>Warehouses</button>
        <button className={tab === 'sites' ? 'on' : ''} onClick={() => setTab('sites')}>Order setup</button>
      </div>

      {tab === 'ledger' && <Ledger locations={locations} />}
      {tab === 'orders' && <AllOrders locations={locations} />}
      {tab === 'data' && <DataTools locations={locations} by={profile?.email} toast={toast} />}
      {tab === 'locations' && <Locations toast={toast} />}
      {tab === 'sites' && <Websites toast={toast} />}
    </div>
  )
}

function Ledger({ locations }) {
  const [rows, setRows] = useState([])
  const [loc, setLoc] = useState('')
  const locName = (id) => locations.find((l) => l.id === id)?.name || id
  useEffect(() => { recentLedger(loc || null, 200).then(setRows).catch(() => setRows([])) }, [loc])

  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h3>Stock movement ledger</h3>
        <select className="select" style={{ width: 'auto' }} value={loc} onChange={(e) => setLoc(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>When</th><th>Movement</th><th>SKU</th><th>Stock group</th><th>Qty change</th><th>Location</th><th>By</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="empty">No ledger entries yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="faint" style={{ fontSize: 12 }}>{fmtTime(r.at)}</td>
                <td>{REASON_LABEL[r.reason] || r.reason}</td>
                <td className="mono">{r.sku}</td>
                <td className="mono">{r.batchNo}</td>
                <td style={{ color: r.delta < 0 ? 'var(--red)' : 'var(--green)' }}>{r.delta > 0 ? '+' : ''}{r.delta}</td>
                <td>{locName(r.locationId)}</td>
                <td className="faint" style={{ fontSize: 12 }}>{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AllOrders({ locations }) {
  const [rows, setRows] = useState([])
  const locName = (id) => locations.find((l) => l.id === id)?.name || id
  useEffect(() => { allOrdersForLocations(null, 500).then(setRows).catch(() => setRows([])) }, [])

  return (
    <div className="card">
      <h3>All orders &amp; customers</h3>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="t">
          <thead><tr><th>Source</th><th>Order</th><th>SKU</th><th>Stock group</th><th>Qty</th><th>Warehouse</th><th>Customer</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="8" className="empty">No orders yet.</td></tr>}
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.websiteSource}</td>
                <td className="mono">{o.orderId || o.id.slice(0, 6)}</td>
                <td className="mono">{o.sku}</td>
                <td className="mono">{o.batchNo}</td>
                <td>{o.qty}</td>
                <td>{locName(o.locationId)}</td>
                <td><div>{o.customer?.name || '—'}</div><div className="faint" style={{ fontSize: 11.5 }}>{[o.customer?.phone, o.customer?.city].filter(Boolean).join(' · ')}</div></td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DataTools({ locations, by, toast }) {
  const [importLoc, setImportLoc] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const runImport = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return toast.err('Choose a CSV file first.')
    setBusy(true); setProgress(0)
    try {
      const rows = await parseCsv(file)
      const res = await importProducts(rows, { locationId: importLoc || null, by, onProgress: setProgress })
      toast.ok(`Imported ${res.products} products${res.stockRows ? `, ${res.stockRows} stock rows` : ''}.`)
    } catch (err) { toast.err(err.message) } finally { setBusy(false) }
  }

  const doExport = async (loc) => {
    try { const n = await exportWarehouseStock(loc); toast.ok(`Exported ${n} stock groups from ${loc.name}.`) }
    catch (err) { toast.err(err.message) }
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>Import products / stock (CSV)</h3>
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 14px' }}>Upload a Shopify export or a plain sheet (sku, product_name, barcode, and optionally qty, batch_no, expiry_date).</p>
        <div className="field">
          <label>Seed stock into warehouse (optional)</label>
          <select className="select" value={importLoc} onChange={(e) => setImportLoc(e.target.value)}>
            <option value="">Products only — no stock</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <input className="input" type="file" accept=".csv" ref={fileRef} />
        {busy && <div style={{ marginTop: 12 }}><div className="muted" style={{ fontSize: 13 }}>Importing… {Math.round(progress * 100)}%</div><div className="bar"><span style={{ width: `${progress * 100}%` }} /></div></div>}
        <button className="btn primary" style={{ marginTop: 12 }} disabled={busy} onClick={runImport}>{busy ? 'Importing…' : 'Import CSV'}</button>
      </div>

      <div className="card">
        <h3>Export warehouse stock</h3>
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 14px' }}>Download any warehouse's current stock as an Excel file.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          {locations.map((l) => <button key={l.id} className="btn sm" onClick={() => doExport(l)}>{l.name}</button>)}
        </div>
        <div className="row wrap" style={{ gap: 10, marginTop: 16 }}>
          <a className="btn sm" href={`https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data`} target="_blank" rel="noreferrer">Open data console</a>
        </div>
      </div>

      <SheetSync toast={toast} />
    </div>
  )
}

function SheetSync({ toast }) {
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getSheetSync().then((s) => { setUrl(s.url || ''); setEnabled(!!s.enabled) }) }, [])

  const save = async () => {
    setBusy(true)
    try { await saveSheetSync({ url: url.trim(), enabled }); toast.ok('Sheet sync saved.') }
    catch (e) { toast.err(e.message) } finally { setBusy(false) }
  }
  const test = async () => {
    if (!url.trim()) return toast.err('Paste the Web app URL first.')
    try { await testSheetUrl(url.trim()); toast.ok('Reached the script. Do a stock action to see a row appear.') }
    catch { toast.err('Could not reach that URL.') }
  }

  const now = new Date()
  const yearEndSoon = now.getMonth() >= 10
  const nextYear = now.getFullYear() + 1

  return (
    <div className="card tint-green" style={{ gridColumn: '1 / -1' }}>
      <h3>Live Google Sheet sync</h3>
      {yearEndSoon && (
        <div className="year-reminder">
          <span className="year-reminder-ic">🗓️</span>
          <div><b>Year-end coming up</b><div className="muted" style={{ fontSize: 12.5 }}>Create fresh workbooks for {nextYear}, paste their IDs into the Apps Script and deploy a new version.</div></div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13, margin: '8px 0 12px' }}>Each task goes into its own workbook; Stock is a live per-location mirror, the rest are monthly history. Firestore stays the source of truth.</p>
      <div className="field"><label>Apps Script Web app URL</label><input className="input mono" placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      <label className="row" style={{ gap: 8, marginBottom: 14, cursor: 'pointer' }}><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><span>Enable live sync</span></label>
      <div className="row" style={{ gap: 10 }}><button className="btn green" disabled={busy} onClick={save}>Save</button><button className="btn sm" onClick={test}>Test connection</button></div>
    </div>
  )
}

const emptyLoc = { name: '', code: '', type: 'warehouse', address: '', active: true }

function Locations({ toast }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptyLoc)
  const load = () => listLocations().then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name || !form.code) return toast.err('Name and code required.')
    try { await saveLocation(form); toast.ok('Warehouse saved.'); setForm(emptyLoc); load() }
    catch (err) { toast.err(err.message) }
  }
  const toggle = async (l) => { try { await setLocationActive(l.id, !(l.active !== false)); load() } catch (err) { toast.err(err.message) } }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>Add / edit warehouse</h3>
        <div className="field" style={{ marginTop: 12 }}><label>Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label>Code (e.g. DEL)</label><input className="input mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
        <div className="field"><label>Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <button className="btn primary" onClick={save}>Save warehouse</button>
      </div>
      <div className="card">
        <h3>Warehouses</h3>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="t">
            <thead><tr><th>Code</th><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.code || l.id}</td>
                  <td>{l.name}</td>
                  <td>{l.active !== false ? 'Active' : 'Paused'}</td>
                  <td><button className="btn ghost sm" onClick={() => toggle(l)}>{l.active !== false ? 'Pause' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Websites({ toast }) {
  const [sites, setSites] = useState([])
  const [val, setVal] = useState('')
  useEffect(() => { getOrderSources().then(setSites).catch(() => setSites([])) }, [])

  const add = async () => {
    const v = val.trim()
    if (!v) return
    const next = [...new Set([...sites, v])]
    try { await saveOrderSources(next); setSites(next); setVal(''); toast.ok('Website added.') } catch (e) { toast.err(e.message) }
  }
  const remove = async (s) => {
    const next = sites.filter((x) => x !== s)
    try { await saveOrderSources(next); setSites(next); toast.ok('Removed.') } catch (e) { toast.err(e.message) }
  }

  return (
    <div className="card">
      <h3>Order source websites</h3>
      <p className="muted" style={{ fontSize: 13, margin: '8px 0 14px' }}>These appear in the Orders source dropdown.</p>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <input className="input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Amazon" />
        <button className="btn primary sm" onClick={add}>Add</button>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {sites.map((s) => (
          <span key={s} className="badge muted" style={{ gap: 8 }}>{s}<button className="btn ghost sm" style={{ padding: '0 6px' }} onClick={() => remove(s)}>✕</button></span>
        ))}
      </div>
    </div>
  )
}

function fmtTime(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
