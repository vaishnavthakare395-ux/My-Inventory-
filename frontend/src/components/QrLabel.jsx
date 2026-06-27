import { useEffect, useState } from 'react'
import { encodeLabelPayload, makeQrDataUrl } from '../lib/scanner'

// Renders a printable QR label for a batch so no-barcode items scan instantly
// next time. SF|sku|batch|expiry|location is encoded in the QR.
export default function QrLabel({ sku, batchNo, expiryDate, locationId }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (!sku) return
    makeQrDataUrl(encodeLabelPayload({ sku, batchNo, expiryDate, locationId })).then(setSrc)
  }, [sku, batchNo, expiryDate, locationId])

  if (!sku) return null
  return (
    <div className="qr-label">
      {src && <img src={src} alt="QR" />}
      <div className="qr-meta">{sku}</div>
      <div className="qr-meta">{batchNo}{expiryDate ? ` · ${expiryDate}` : ''}</div>
    </div>
  )
}

// Opens the browser print dialog with just the label.
export async function printQrLabel({ sku, batchNo, expiryDate, locationId }) {
  const src = await makeQrDataUrl(encodeLabelPayload({ sku, batchNo, expiryDate, locationId }))
  const w = window.open('', '_blank', 'width=360,height=420')
  if (!w) return
  w.document.write(`
    <html><head><title>${sku}</title></head>
    <body style="font-family:monospace;text-align:center;padding:16px">
      <img src="${src}" style="width:240px;height:240px" />
      <div style="margin-top:8px;font-size:14px">${sku}</div>
      <div style="font-size:12px">${batchNo || ''}${expiryDate ? ' · ' + expiryDate : ''}</div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`)
  w.document.close()
}
