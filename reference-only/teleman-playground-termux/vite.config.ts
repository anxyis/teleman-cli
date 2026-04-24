import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'stream', 'util'],
      globals: {
        Buffer: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Core API proxy
      '/telegram-api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Backend Config Proxy
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
