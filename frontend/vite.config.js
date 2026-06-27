import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// StockFlow build config. Dev server on 5173; production bundle to dist.
export default defineConfig({
  plugins: [react()],
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
