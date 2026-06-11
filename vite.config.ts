import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/rally/ in production, root in dev.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/rally/' : '/',
  plugins: [react()],
  server: { port: 5173, host: true },
}))
