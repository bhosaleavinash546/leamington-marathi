import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/calculator/',
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
