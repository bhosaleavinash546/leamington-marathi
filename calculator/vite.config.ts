import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/calculator/',
  build: {
    outDir: 'dist',
    rollupOptions: { input: 'index.html' },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
