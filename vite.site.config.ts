import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf-8'));

/**
 * The public shop-window build (`npm run build:site`) — the landing page only,
 * for GitHub Pages. See site/StaticSite.tsx for why the app itself cannot go
 * there.
 *
 * `base` matters: Pages serves a project site from /<repo>/, so every asset URL
 * has to carry that prefix — including the `url('/fonts/…')` in index.css,
 * which Vite rewrites against `base` at build time. Override with SITE_BASE
 * when hosting somewhere else.
 */
export default defineConfig({
  base: process.env.SITE_BASE ?? '/leamington-marathi/',
  root: resolve(here, 'site'),
  // publicDir stays ON: it is what makes Vite rewrite `url('/fonts/…')` in
  // index.css against `base`. With it off the font urls ship bare and 404 on
  // Pages. The postbuild prunes the files this page does not use.
  publicDir: resolve(here, 'public'),
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  build: {
    outDir: resolve(here, 'dist-site'),
    emptyOutDir: true,
  },
});
