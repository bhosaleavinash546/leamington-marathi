import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/calculator/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
