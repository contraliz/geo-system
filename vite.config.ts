import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/anthropic': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/api/publisher': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
})
