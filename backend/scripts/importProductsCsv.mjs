// Imports a product-master CSV into Firestore products.
// Dry-run by default; pass --commit to write live product documents.
// Add --replace to remove product docs that are not present in the CSV.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const KEY = path.join(ROOT, 'serviceAccountKey.json')
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'stockflow-hub'
const SAMPLE_LIMIT = 25
const WRITE_CHUNK_SIZE = 450

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--') && !a.includes('=')))
const argValue = (name, fallback = '') => {
  const prefix = `${name}=`
  const hit = args.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

const fileArg = argValue('--file')
const commit = flags.has('--commit')
const replace = flags.has('--replace')
const chunkSize = Math.min(WRITE_CHUNK_SIZE, Math.max(1, Number(argValue('--chunk', WRITE_CHUNK_SIZE)) || WRITE_CHUNK_SIZE))

if (!fileArg) {
  console.error('Usage: npm run import:products -- --file="C:\\path\\products.csv" [--commit] [--replace]')
  process.exit(1)
}

if (fs.existsSync(KEY)) {
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(KEY, 'utf8'))), projectId: PROJECT_ID })
} else {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
}

const db = getFirestore()

function normalizeSku(value) { return String(value || '').trim().toUpperCase() }
function docIdPart(value) {
  const encoded = encodeURIComponent(String(value || '').trim())
  if (!encoded) return ''
  if (encoded === '.' || encoded === '..' || /^__.*__$/.test(encoded)) return `id_${encoded}`
  return encoded
}
function productDocId(sku) { return docIdPart(normalizeSku(sku)) }

function pick(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}
function samplePush(list, value) { if (list.length < SAMPLE_LIMIT) list.push(value) }
function parseNumber(value) {
  const raw = String(value || '').trim().replace(/,/g, '')
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
function cleanStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'inactive') return 'Inactive'
  if (raw === 'discontinued') return 'Discontinued'
  return 'Active'
}
function variantSuffix(row) {
  const parts = []
  for (let i = 1; i <= 3; i++) {
    const name = pick(row, [`Option${i} Name`])
    const value = pick(row, [`Option${i} Value`])
    if (!value || value.toLowerCase() === 'default title') continue
    parts.push(name && name.toLowerCase() !== 'title' ? `${name}: ${value}` : value)
  }
  return parts.join(' / ')
}
function rowToProduct(row) {
  const skuRaw = pick(row, ['Variant SKU', 'sku', 'SKU'])
  const sku = normalizeSku(skuRaw)
  if (!sku) return null
  const title = pick(row, ['Title', 'product_name', 'productName', 'name']) || sku
  const suffix = variantSuffix(row)
  return {
    sku, skuRaw,
    productName: suffix ? `${title} - ${suffix}` : title,
    barcode: pick(row, ['Variant Barcode', 'barcode', 'Barcode']),
    brand: pick(row, ['Vendor', 'brand', 'Brand']),
    primaryVendor: pick(row, ['Vendor', 'primary_vendor', 'primaryVendor']),
    altVendor1: pick(row, ['alt_vendor_1', 'altVendor1']),
    altVendor2: pick(row, ['alt_vendor_2', 'altVendor2']),
    category: pick(row, ['Product Category', 'category', 'Category']),
    type: pick(row, ['Type', 'type', 'product_type', 'productType']),
    tags: pick(row, ['Tags', 'tags']),
    url: pick(row, ['URL', 'Url', 'url', 'Online Store URL', 'Product URL', 'Variant URL', 'link']),
    sourceWebsite: pick(row, ['Source', 'Website', 'Channel', 'source', 'sourceWebsite']),
    variantGrams: parseNumber(pick(row, ['Variant Grams', 'variantGrams', 'grams'])),
    price: parseNumber(pick(row, ['Variant Price', 'price', 'Price'])),
    compareAtPrice: parseNumber(pick(row, ['Variant Compare At Price', 'compareAtPrice', 'Compare At Price'])),
    seoDescription: pick(row, ['SEO Description', 'seoDescription', 'description']),
    reorderLevel: parseNumber(pick(row, ['reorder_level', 'reorderLevel'])),
    status: cleanStatus(pick(row, ['status', 'Status'])),
  }
}
function productPayload(product) {
  return {
    sku: product.sku,
    skuRaw: product.skuRaw || product.sku,
    productName: product.productName || product.sku,
    barcode: product.barcode || '',
    brand: product.brand || '',
    primaryVendor: product.primaryVendor || '',
    altVendor1: product.altVendor1 || '',
    altVendor2: product.altVendor2 || '',
    category: product.category || '',
    type: product.type || '',
    tags: product.tags || '',
    url: product.url || '',
    sourceWebsite: product.sourceWebsite || '',
    variantGrams: Number(product.variantGrams) || 0,
    price: Number(product.price) || 0,
    compareAtPrice: Number(product.compareAtPrice) || 0,
    seoDescription: product.seoDescription || '',
    reorderLevel: Number(product.reorderLevel) || 0,
    status: product.status || 'Active',
    updatedAt: Timestamp.now(),
    source: 'product_master_csv',
  }
}

function parseCsv(text) {
  const rawRows = []
  let row = []; let field = ''; let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; const next = text[i + 1]
    if (ch === '"') {
      if (quoted && next === '"') { field += '"'; i++ } else { quoted = !quoted }
      continue
    }
    if (!quoted && ch === ',') { row.push(field); field = ''; continue }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      row.push(field); rawRows.push(row); row = []; field = ''
      if (ch === '\r' && next === '\n') i++
      continue
    }
    field += ch
  }
  if (field || row.length) { row.push(field); rawRows.push(row) }
  if (!rawRows.length) return { headers: [], rows: [] }
  const headers = rawRows[0].map((h) => String(h || '').trim())
  const rows = rawRows.slice(1)
    .filter((r) => r.some((cell) => String(cell || '').trim() !== ''))
    .map((r) => { const out = {}; headers.forEach((h, i) => { if (h) out[h] = r[i] ?? '' }); return out })
  return { headers, rows }
}

function analyse(rows) {
  const seenSkus = new Map(); const duplicateSkus = new Map(); const products = []
  const missingSkuRows = []; const invalidDocIdRows = []
  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; const product = rowToProduct(rows[i])
    if (!product) { samplePush(missingSkuRows, rowNumber); continue }
    if (!productDocId(product.sku)) { samplePush(invalidDocIdRows, { row: rowNumber, sku: product.sku }); continue }
    if (seenSkus.has(product.sku)) {
      const dup = duplicateSkus.get(product.sku) || { sku: product.sku, firstRow: seenSkus.get(product.sku), count: 0 }
      dup.count += 1; duplicateSkus.set(product.sku, dup); continue
    }
    seenSkus.set(product.sku, rowNumber); products.push(product)
  }
  const duplicateSkuRows = [...duplicateSkus.values()].reduce((s, x) => s + x.count, 0)
  return {
    products,
    report: {
      totalRows: rows.length, validProducts: products.length,
      missingSkuCount: rows.length - products.length - duplicateSkuRows - invalidDocIdRows.length,
      missingSkuRows, invalidDocIdRows,
      duplicateSkuGroups: duplicateSkus.size, duplicateSkuRows,
    },
  }
}

async function writeProducts(products) {
  let written = 0
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize)
    const batch = db.batch()
    for (const product of chunk) batch.set(db.collection('products').doc(productDocId(product.sku)), productPayload(product), { merge: true })
    await batch.commit()
    written += chunk.length
    console.log(`Wrote ${written}/${products.length} products`)
  }
  return written
}

async function loadExistingProductIds() {
  const ids = new Set()
  const snap = await db.collection('products').select().get()
  snap.forEach((doc) => ids.add(doc.id))
  return ids
}
async function deleteProductIds(ids) {
  let deleted = 0; const list = [...ids]
  for (let i = 0; i < list.length; i += chunkSize) {
    const batch = db.batch()
    for (const id of list.slice(i, i + chunkSize)) batch.delete(db.collection('products').doc(id))
    await batch.commit()
    deleted += Math.min(chunkSize, list.length - i)
    console.log(`Deleted ${deleted}/${list.length} stale products`)
  }
  return deleted
}

async function run() {
  const filePath = path.resolve(fileArg)
  const parsed = parseCsv(fs.readFileSync(filePath, 'utf8'))
  const { products, report } = analyse(parsed.rows)
  const csvProductIds = new Set(products.map((p) => productDocId(p.sku)))
  const existingIds = replace && commit ? await loadExistingProductIds() : new Set()
  const staleProductIds = replace ? [...existingIds].filter((id) => !csvProductIds.has(id)) : []

  console.log(JSON.stringify({
    projectId: PROJECT_ID, mode: commit ? 'commit' : 'dry-run', replace, file: filePath,
    headers: parsed.headers, existingProducts: replace ? existingIds.size : undefined,
    csvProductDocs: csvProductIds.size, staleProductsToDelete: replace ? staleProductIds.length : undefined,
    ...report,
  }, null, 2))

  if (!commit) {
    console.log('\nDry-run only. Re-run with --commit to upsert product documents.')
    if (replace) console.log('With --commit --replace, product docs not present in this CSV will be deleted after upsert.')
    return
  }

  const written = await writeProducts(products)
  const deleted = replace ? await deleteProductIds(staleProductIds) : 0
  console.log(JSON.stringify({ projectId: PROJECT_ID, committed: true, replace, written, deleted }, null, 2))
}

run().catch((err) => { console.error(err); process.exit(1) })
