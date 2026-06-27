import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

// Live mirror of stock movements into a Google Sheet via an Apps Script web app.
// The app stays the source of truth; this just appends a copy of each event so
// the team can watch it in a spreadsheet. A failed push never blocks the actual
// stock write.

let urlCache // undefined = not loaded, '' = configured off, string = active

// locationId -> readable name, primed once locations load, so the Stock sheet
// tabs read "Delhi" instead of "DEL".
let locationNames = {}
export function setLocationNames(map) {
  locationNames = map || {}
}
export function locationName(id) {
  return locationNames[id] || id
}

async function loadUrl() {
  if (urlCache !== undefined) return urlCache
  const snap = await getDoc(doc(db, 'settings', 'sheet_sync'))
  urlCache = snap.exists() && snap.data().enabled ? snap.data().url || '' : ''
  return urlCache
}

export async function getSheetSync() {
  const snap = await getDoc(doc(db, 'settings', 'sheet_sync'))
  return snap.exists() ? snap.data() : { url: '', enabled: false }
}

export async function saveSheetSync({ url, enabled }) {
  urlCache = enabled ? url || '' : ''
  await setDoc(doc(db, 'settings', 'sheet_sync'), {
    url: url || '',
    enabled: !!enabled,
    updatedAt: serverTimestamp(),
  })
}

// Apps Script web apps reject cross-origin JSON preflights, so we send the body
// as text/plain (no preflight) and don't read the response (no-cors).
export function pushToSheet(sheet, row) {
  loadUrl()
    .then((url) => {
      if (!url) return
      return fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ sheet, row }),
      })
    })
    .catch(() => {
      /* mirror only — never disrupt the stock operation */
    })
}

// Used by the admin "Test" button to confirm the URL is reachable.
export async function testSheetUrl(url) {
  await fetch(url, { method: 'GET', mode: 'no-cors' })
  return true
}
