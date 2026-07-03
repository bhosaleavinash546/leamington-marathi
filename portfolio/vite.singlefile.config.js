import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Produces ONE self-contained index.html (JS, CSS and fonts inlined) in dist-single/.
// Build with:  npm run build:single
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000, // inline fonts as data: URIs too
    cssCodeSplit: false,
  },
})
