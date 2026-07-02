import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brainspark-logo.svg', 'favicon.ico'],
      manifest: {
        name: 'BrainSpark — Cost Reduction AI',
        short_name: 'BrainSpark',
        description: 'AI-powered automotive cost reduction analysis platform',
        theme_color: '#0d1f33',
        background_color: '#0d1f33',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/dashboard',
        icons: [
          { src: '/brainspark-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/projects/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-projects', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    include: ['pptxgenjs', 'jszip'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
