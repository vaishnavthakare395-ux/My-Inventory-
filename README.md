# StockFlow

Multi-warehouse inventory and order processing, built around batches and expiry dates. It does FEFO dispatch (first-expiry-first-out), barcode/GS1 scanning, and keeps a live mirror in Google Sheets.

I built this to get a wholesale operation off manual Excel tracking — the kind where you've got the same SKU sitting in several warehouses, each batch with its own expiry, and you need to ship the one that goes bad first without someone eyeballing a spreadsheet. Everything runs on Firebase's free tier.

![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Firestore](https://img.shields.io/badge/Firestore-FF6F00?style=flat-square&logo=firebase&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=flat-square&logo=three.js&logoColor=white)

**[→ Live demo](https://stockflow-hub.web.app)**

## What's in it

**Inventory** — each SKU fans out into its batches, color-coded by how close they are to expiry. Stock is tracked per location, ordered FEFO so the next thing to ship is always on top, and there's a 3D batch view if you want to actually see the shelf.

**Scan & add** — the flow starts from the SKU. Scan a barcode, a GS1 2D DataMatrix, or a QR label; OCR reads the expiry off the packaging. GS1 codes are nice because they carry the GTIN, batch and expiry all at once, so the form just fills itself.

**Transfers** — a box moves through Draft → Shipped → In-transit → Accepted (or Mismatch if the counts don't line up). While it's in transit the stock is locked atomically at both ends, so you never end up with phantom units sitting in two places.

**Orders** — also SKU-first. It recommends the FEFO batch but lets you override, pulls across locations when one warehouse can't cover the whole order, and spits out a shipping plan.

**Returns** — verified add-back. Only stock marked "Good" goes back on the shelf.

**Analytics & reports** — KPIs, movers, demand, expiry risk, order status. There's also a reconciliation report that checks the ledger against actual stock, and a vendor reorder list.

**Stock ledger** — append-only. Every movement is logged and nothing can be edited after the fact, so the audit trail is the source of truth.

**Sheets sync** — live per-location stock tabs plus monthly history, pushed out through a Google Apps Script web app.

Honestly the FEFO + transfer-locking part was the fiddly bit — getting the atomic writes right so a half-failed transfer doesn't leave stock duplicated took a few rounds.

## Roles

Three levels, enforced in the Firestore rules (not just the UI):

- **Admin** — everything. All locations, the ledger, import/export, users, settings.
- **Manager** — all locations for the day-to-day stuff (orders, transfers, stock, returns), but not the admin-only settings.
- **User** — limited to whichever warehouse(s) they're assigned.

The rules are role- and location-gated, the ledger is append-only, and transfers are read-scoped to the locations involved.

## Stack

- **Frontend** — React 18 + Vite, React Router, Framer Motion, Recharts, and Three.js (`@react-three/fiber` + `drei`) for the 3D bits.
- **Scanning** — `@zxing` for barcodes and GS1 2D DataMatrix, `tesseract.js` for OCR-ing the expiry date, plus QR labels.
- **Backend** — Cloud Firestore as the single source of truth, with Firebase Auth and Hosting.
- **Sync** — a Google Apps Script web app, one workbook per task.

No paid services — it sits inside Firebase's free tier.

## Running it locally

```bash
cd frontend
cp .env.example .env        # drop in your Firebase web config
npm install
npm run dev                 # http://localhost:5173
```

The Firestore rules, indexes and seed scripts live in [`backend/`](backend/):

```bash
cd backend
npm install
# seed an admin + some sample data — pass creds via env, don't hardcode them
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpassword \
GOOGLE_CLOUD_PROJECT=your-firebase-project-id \
node scripts/seedAdmin.mjs
```

## Pointing it at your own Firebase project

Out of the box this is wired to a project called `stockflow-hub` (see [`.firebaserc`](.firebaserc)). To run your own copy:

1. Make a Firebase project at [console.firebase.google.com](https://console.firebase.google.com), and turn on **Authentication** (Email/Password) and **Firestore**.
2. Swap the project ID in [`.firebaserc`](.firebaserc):
   ```json
   { "projects": { "default": "your-firebase-project-id" } }
   ```
3. Put your Firebase web SDK config into `frontend/.env` — there's a `.env.example` to copy from.
4. Build and deploy:
   ```bash
   cd frontend && npm run build && cd ..
   firebase deploy --only hosting,firestore:rules,firestore:indexes
   ```
5. Seed an admin with `backend/scripts/seedAdmin.mjs` and the env vars from above.

The live demo points at the original project — once you deploy your own, the URL becomes `https://<your-project-id>.web.app`.

## On secrets

- Nothing sensitive is committed. `.env`, service-account keys and `serviceAccountKey.json` are all gitignored.
- The higher-accuracy OCR goes through a server proxy, so no API key ever touches the browser.
- The Firestore rules do the real enforcement — role and location scoping, append-only ledger.
- Console logs are stripped from production builds.

---

Built by [Gauransh Ahuja](https://github.com/gauranshahuja) · React · Firebase · Firestore · Three.js
