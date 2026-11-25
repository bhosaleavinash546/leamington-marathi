/** Phase 2 · Block 3 evidence: where two screenshots differ — bands of rows with changed pixels and their x-extent.
 *  npx tsx fold-diff.ts <before.png> <after.png> [<before.png> <after.png> …]   (from calculator/) */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i += 2) {
  const p = PNG.sync.read(readFileSync(a[i])), q = PNG.sync.read(readFileSync(a[i + 1]));
  if (p.width !== q.width || p.height !== q.height) { console.log(a[i + 1].split('/').pop(), 'size differs', p.width, p.height, q.width, q.height); continue; }
  const rows: [number, number, number][] = []; let changed = 0;
  for (let y = 0; y < p.height; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < p.width; x++) {
      const k = (y * p.width + x) * 4;
      if (Math.abs(p.data[k] - q.data[k]) + Math.abs(p.data[k + 1] - q.data[k + 1]) + Math.abs(p.data[k + 2] - q.data[k + 2]) > 30) { changed++; if (x0 < 0) x0 = x; x1 = x; }
    }
    if (x0 >= 0) rows.push([y, x0, x1]);
  }
  const bands: number[][] = [];
  for (const [y, x0, x1] of rows) { const b = bands[bands.length - 1]; if (b && y - b[1] <= 6) { b[1] = y; b[2] = Math.min(b[2], x0); b[3] = Math.max(b[3], x1); } else bands.push([y, y, x0, x1]); }
  console.log(a[i + 1].split('/').pop(), `${p.width}x${p.height}`, 'changed px', changed, 'bands [y0,y1,x0,x1]:', JSON.stringify(bands));
}
