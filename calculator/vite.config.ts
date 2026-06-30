import { defineConfig } from 'vite';

const isMobile = process.env.BUILD_TARGET === 'mobile';

export default defineConfig({
  root: '.',
  // Capacitor's WebView loads from the file system root, so base must be '/'
  // Web deployment under /calculator/ keeps the original path.
  base: isMobile ? '/' : '/calculator/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: { index: 'index.html', auth: 'auth.html' },
      output: {
        // Split large vendor libraries into separate, long-cached chunks so app
        // code changes don't invalidate them and they download in parallel.
        // xlsx and html2canvas are intentionally NOT listed — they are loaded
        // dynamically and must stay as lazy async chunks (off the initial load).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/xlsx') || id.includes('html2canvas') || id.includes('dompurify') || id.includes('/purify')) return;
          if (id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('chart.js') || id.includes('@kurkle')) return 'vendor-chart';
          if (id.includes('/gsap') || id.includes('/motion')) return 'vendor-motion';
          return 'vendor';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
