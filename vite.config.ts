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
        // Chunks are code-split and well under 2 MiB now, but keep a headroom
        // ceiling so a single large vendor chunk can never silently drop out of
        // the precache manifest (the previous 3 MB entry chunk did exactly that).
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // workbox matches urlPattern against the FULL url, so a `^/api` regex
            // never matched — use a URL predicate on the pathname instead.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/projects'),
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
  build: {
    rollupOptions: {
      output: {
        // Isolate the heaviest libraries into their own chunks so they are
        // fetched only by the routes that use them and cached independently.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-charts': ['recharts'],
          'vendor-xlsx': ['xlsx'],
          'vendor-pptx': ['pptxgenjs'],
          'vendor-pdf': ['jspdf'],
        },
      },
    },
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
