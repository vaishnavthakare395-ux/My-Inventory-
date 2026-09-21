import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let isExporting = false
let pendingExport = false

function triggerAutoExport() {
  if (isExporting) {
    pendingExport = true
    return
  }
  isExporting = true
  exec('firebase emulators:export ./emulator-data --project demo-stockflow --force', { cwd: rootDir }, (err) => {
    isExporting = false
    if (!err) {
      console.log('[AutoExport] Persisted accounts and database to ./emulator-data')
    } else {
      console.warn('[AutoExport] Error exporting:', err.message)
    }
    if (pendingExport) {
      pendingExport = false
      setTimeout(triggerAutoExport, 2000)
    }
  })
}

function autoExportPlugin() {
  return {
    name: 'stockflow-auto-export-middleware',
    configureServer(server) {
      server.middlewares.use('/api/export-emulator', (req, res) => {
        if (req.method === 'POST') {
          setTimeout(triggerAutoExport, 400)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, message: 'Persisting emulator data' }))
        } else {
          res.statusCode = 405
          res.end()
        }
      })

      // Continuous periodic background persistence every 30 seconds (only when using emulator)
      const autoSaveTimer = setInterval(() => {
        if (process.env.VITE_USE_EMULATORS === 'true') {
          triggerAutoExport()
        }
      }, 30000)

      server.httpServer?.on('close', () => {
        clearInterval(autoSaveTimer)
      })
    },
  }
}

// StockFlow build config. Dev server on 5173; production bundle to dist.
export default defineConfig({
  plugins: [react(), autoExportPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  // Strip console/debugger from the production bundle so no internal hints leak.
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Neutral chunk names (no vendor giveaway in filenames).
        manualChunks: {
          viz: ['three', '@react-three/fiber', '@react-three/drei'],
          core: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          charts: ['recharts'],
          io: ['xlsx', 'papaparse'],
        },
      },
    },
  },
})
