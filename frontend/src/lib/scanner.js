import { BrowserMultiFormatReader } from '@zxing/browser'
import QRCode from 'qrcode'
import { looksLikeGs1, parseGs1 } from './gs1'

// Our own labels: SF|sku|batch|expiry|location
const QR_PREFIX = 'SF'

export function encodeLabelPayload({ sku, batchNo, expiryDate, locationId }) {
  return [QR_PREFIX, sku, batchNo, expiryDate || '', locationId || ''].join('|')
}

// Branch on what was scanned: our label, a GS1 2D code, or a plain barcode.
export function parseScan(text) {
  if (!text) return null
  const raw = text.trim()

  if (raw.startsWith(QR_PREFIX + '|')) {
    const [, sku, batchNo, expiryDate, locationId] = raw.split('|')
    return { type: 'label', sku, batchNo, expiryDate: expiryDate || '', locationId: locationId || '' }
  }

  if (looksLikeGs1(raw)) {
    const g = parseGs1(raw)
    if (g) {
      return {
        type: 'gs1',
        gtin: g.gtin,
        barcode: g.gtin,
        batchNo: g.batchNo || '',
        expiryDate: g.expiry ? monthToFullDate(g.expiry) : '',
        serial: g.serial || '',
      }
    }
  }

  return { type: 'barcode', barcode: raw }
}

export async function makeQrDataUrl(payload) {
  return QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
}

// Continuous camera decode into videoEl. Calls onResult(text) per read.
export async function startCameraScan(videoEl, onResult) {
  const reader = new BrowserMultiFormatReader()
  const controls = await reader.decodeFromVideoDevice(undefined, videoEl, (result) => {
    if (result) onResult(result.getText())
  })
  return () => controls.stop()
}

// --- OCR (single entry point; engine swappable, no key in the browser) ---
export async function extractTextFromImage(imageSource, { engine = 'tesseract', onProgress } = {}) {
  if (engine === 'cloud' && import.meta.env.VITE_OCR_PROXY_URL) {
    return ocrViaProxy(imageSource, onProgress)
  }
  return ocrWithTesseract(imageSource, onProgress)
}

export async function readTextFromImage(imageSource, onProgress, engine = 'tesseract') {
  const text = await extractTextFromImage(imageSource, { engine, onProgress })
  return { text, expiry: guessExpiry(text) }
}

async function ocrWithTesseract(imageSource, onProgress) {
  const { default: Tesseract } = await import('tesseract.js')
  const { data } = await Tesseract.recognize(imageSource, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  return data.text || ''
}

async function ocrViaProxy(imageSource, onProgress) {
  onProgress?.(0.2)
  const base64 = await toBase64(imageSource)
  const res = await fetch(import.meta.env.VITE_OCR_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ image: base64 }),
  })
  onProgress?.(0.9)
  if (!res.ok) throw new Error('Cloud OCR unavailable — falling back to offline')
  const json = await res.json().catch(() => ({}))
  onProgress?.(1)
  return json.text || ''
}

async function toBase64(imageSource) {
  let blob
  if (imageSource instanceof Blob) blob = imageSource
  else blob = await (await fetch(imageSource)).blob()
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
  return String(dataUrl).split(',')[1]
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

// Extract ONLY the expiry: ignore manufacturing dates, PIN codes and past dates;
// prefer a date near an expiry keyword, else the furthest-out future date.
export function guessExpiry(rawText) {
  const text = (rawText || '').toLowerCase().replace(/[.]/g, ' ')
  const today = new Date()
  const minValid = new Date(today.getFullYear(), today.getMonth(), 1)
  const MFG_KW = /(mfg|mfd|manufactured?|packed|pkd|prod(?:uction)?)/

  // 1) Strongest signal: a date right after an expiry keyword.
  const labelled = text.match(
    /(?:exp(?:iry)?|expires?|use\s*by|best\s*before|bb|b\/b)\b[:\s-]*([a-z0-9 /\-]{4,20})/
  )
  if (labelled) {
    const d = parseAnyDate(labelled[1])
    if (d && new Date(d) >= minValid) return d
  }

  // 2) Otherwise scan chunks, drop manufacturing/past dates, take the latest.
  const chunks = text.split(/[,;|\n]+|\s{2,}/)
  let best = ''
  for (const chunk of chunks) {
    if (MFG_KW.test(chunk)) continue
    const d = parseAnyDate(chunk)
    if (!d) continue
    const dt = new Date(d)
    if (dt < minValid) continue
    if (!best || dt > new Date(best)) best = d
  }
  return best
}

function parseAnyDate(s) {
  let m
  m = s.match(/\b(\d{1,2})[\s/\-]*([a-z]{3,})[a-z]*[\s/\-]*(\d{2,4})\b/)
  if (m && MONTHS[m[2].slice(0, 3)]) return iso(m[3], MONTHS[m[2].slice(0, 3)], m[1])
  m = s.match(/\b([a-z]{3,})[a-z]*[\s/\-]*(\d{2,4})\b/)
  if (m && MONTHS[m[1].slice(0, 3)]) return isoMonthEnd(m[2], MONTHS[m[1].slice(0, 3)])
  m = s.match(/\b(20\d{2})[\s/\-](\d{1,2})\b/)
  if (m && +m[2] >= 1 && +m[2] <= 12) return isoMonthEnd(m[1], +m[2])
  m = s.match(/\b(\d{1,2})[\s/\-](\d{1,2})[\s/\-](\d{2,4})\b/)
  if (m && +m[2] >= 1 && +m[2] <= 12) return iso(m[3], +m[2], m[1])
  m = s.match(/\b(\d{1,2})[\s/\-](\d{2,4})\b/)
  if (m && +m[1] >= 1 && +m[1] <= 12) return isoMonthEnd(m[2], +m[1])
  m = s.match(/\b(20\d{2})(\d{2})\b/)
  if (m && +m[2] >= 1 && +m[2] <= 12) return isoMonthEnd(m[1], +m[2])
  return ''
}

function fullYear(y) {
  const n = Number(y)
  return n < 100 ? 2000 + n : n
}
function iso(y, mo, d) {
  const yy = fullYear(y)
  return `${yy}-${String(Number(mo)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
}
function isoMonthEnd(y, mo) {
  const yy = fullYear(y)
  const last = new Date(yy, Number(mo), 0).getDate()
  return iso(yy, mo, last)
}

// GS1 "YYYY-MM" -> YYYY-MM-DD (last day of month) for storage.
export function monthToFullDate(yyyymm) {
  if (!/^\d{4}-\d{2}$/.test(yyyymm || '')) return ''
  const [y, mo] = yyyymm.split('-')
  return isoMonthEnd(y, +mo)
}
