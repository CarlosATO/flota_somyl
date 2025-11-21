import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Force rebuild with environment variables
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5003',
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: 'http://localhost:5003',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
