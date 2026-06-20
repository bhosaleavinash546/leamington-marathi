import { defineConfig } from 'vite';

const isMobile = process.env.BUILD_TARGET === 'mobile';

export default defineConfig({
  root: '.',
  // Capacitor's WebView loads from the file system root, so base must be '/'
  // Web deployment under /calculator/ keeps the original path.
  base: isMobile ? '/' : '/calculator/',
  build: {
    outDir: 'dist',
    rollupOptions: { input: 'index.html' },
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
