import { useEffect, useRef, useState } from 'react'
import { startCameraScan, readTextFromImage, parseScan } from '../lib/scanner'

// Camera scanner with an OCR fallback tab for items whose expiry is only printed
// as text. onDetect gets { ...parseScan(text), raw } from a scan, or
// { type:'ocr', expiry, text } from OCR.
export default function ScannerModal({ open, onClose, onDetect }) {
  const [mode, setMode] = useState('scan')
  const videoRef = useRef(null)
  const stopRef = useRef(null)
  const [camError, setCamError] = useState('')

  useEffect(() => {
    if (!open || mode !== 'scan') return
    let cancelled = false
    setCamError('')

    startCameraScan(videoRef.current, (text) => {
      if (cancelled) return
      onDetect({ ...parseScan(text), raw: text })
    })
      .then((stop) => {
        if (cancelled) stop()
        else stopRef.current = stop
      })
      .catch(() => setCamError('Could not open the camera. Check permissions or use OCR.'))

    return () => {
      cancelled = true
      stopRef.current?.()
      stopRef.current = null
    }
  }, [open, mode, onDetect])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row spread" style={{ marginBottom: 14 }}>
          <h3>Scan item</h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>

        <div className="pill-tabs" style={{ marginBottom: 14 }}>
          <button className={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')}>Camera</button>
          <button className={mode === 'ocr' ? 'on' : ''} onClick={() => setMode('ocr')}>Photo / OCR</button>
        </div>

        {mode === 'scan' ? (
          <div>
            <div className="scan-frame">
              <video ref={videoRef} muted playsInline />
              <div className="scan-reticle" />
              <div className="scan-line" />
            </div>
            {camError && <p className="form-error" style={{ marginTop: 12 }}>{camError}</p>}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Point at a barcode, GS1 2D code, or a QR label.
            </p>
          </div>
        ) : (
          <OcrPanel onDetect={onDetect} />
        )}
      </div>
    </div>
  )
}

const CLOUD_OCR_ON = !!import.meta.env.VITE_OCR_PROXY_URL

function OcrPanel({ onDetect }) {
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [engine, setEngine] = useState(CLOUD_OCR_ON ? 'cloud' : 'tesseract')

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setProgress(0)
    setResult(null)
    try {
      const r = await readTextFromImage(file, setProgress, engine)
      setResult(r)
    } catch (err) {
      try {
        const r = await readTextFromImage(file, setProgress, 'tesseract')
        setResult(r)
      } catch {
        setResult({ text: '', expiry: '' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Take or upload a clear photo of the expiry text on the pack. We read only the expiry date
        and you confirm before saving.
      </p>

      {CLOUD_OCR_ON && (
        <div className="pill-tabs" style={{ marginBottom: 12 }}>
          <button className={engine === 'cloud' ? 'on' : ''} onClick={() => setEngine('cloud')}>Accurate</button>
          <button className={engine === 'tesseract' ? 'on' : ''} onClick={() => setEngine('tesseract')}>Fast</button>
        </div>
      )}

      <input className="input" type="file" accept="image/*" capture="environment" onChange={handleFile} />

      {busy && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ fontSize: 13 }}>Reading… {Math.round(progress * 100)}%</div>
          <div className="bar"><span style={{ width: `${progress * 100}%` }} /></div>
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Expiry (edit if wrong)</label>
            <input
              className="input"
              type="date"
              value={result.expiry || ''}
              onChange={(e) => setResult({ ...result, expiry: e.target.value })}
            />
          </div>
          <button
            className="btn primary"
            onClick={() => onDetect({ type: 'ocr', expiry: result.expiry, text: result.text })}
          >
            Use this expiry
          </button>
        </div>
      )}
    </div>
  )
}
