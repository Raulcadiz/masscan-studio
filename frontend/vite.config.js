import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // bind to 0.0.0.0 — accessible from external IPs in dev
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,   // rewrite Origin header → backend sees localhost
      },
    },
  },
})
