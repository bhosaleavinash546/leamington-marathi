/**
 * EDU v6 — chip markings read on full-resolution tiles of the whole-board photos.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { tileGrid, tilesFor, ocrTiles, TILE_PX } from '../server/utils/pcb-ocr-tiles.js';

const require = createRequire(import.meta.url);

describe('tile grid', () => {
  it('an image within the tile size is one tile', () => {
    expect(tileGrid(1500, 900)).toEqual([{ x: 0, y: 0, w: 1500, h: 900, row: 0, col: 0 }]);
  });
  it('a 4,080 × 2,295 board photo is 3 × 2 tiles, each ≤ 1,568 px, covering it with overlap', () => {
    const g = tileGrid(4080, 2295);
    expect(g.length).toBe(6);
    for (const t of g) { expect(t.w).toBeLessThanOrEqual(TILE_PX); expect(t.h).toBeLessThanOrEqual(TILE_PX); }
    // covered: every column of pixels and every row lies inside some tile; neighbours overlap
    const cols = [...new Set(g.map(t => t.x))].sort((a, b) => a - b);
    expect(cols[0]).toBe(0);
    expect(Math.max(...g.map(t => t.x + t.w))).toBe(4080);
    expect(Math.max(...g.map(t => t.y + t.h))).toBe(2295);
    for (let i = 1; i < cols.length; i++) expect(cols[i]).toBeLessThan(cols[i - 1] + g[0].w);
  });
  it('covers any size without a gap', () => {
    for (const [w, h] of [[3264, 1836], [6000, 4000], [1600, 5000], [1569, 1569]] as const) {
      const g = tileGrid(w, h);
      expect(Math.max(...g.map(t => t.x + t.w))).toBe(w);
      expect(Math.max(...g.map(t => t.y + t.h))).toBe(h);
      const xs = [...new Set(g.map(t => t.x))].sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThanOrEqual(xs[i - 1] + g[0].w);
    }
  });
});

describe('tiles from a photo', () => {
  const { createCanvas } = require('@napi-rs/canvas');
  const jpeg = async (w: number, h: number) => { const c = createCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#2a7'; x.fillRect(0, 0, w, h); return c.encode('jpeg', 80) as Promise<Buffer>; };
  it('cuts a large whole-board photo into labelled JPEG tiles; a small one is not tiled', async () => {
    const t = await tilesFor(await jpeg(3264, 1836), 'Top side');
    expect(t.length).toBe(6);
    expect(t[0].label).toMatch(/^Top side — full-resolution tile 1\.1/);
    expect(t.every(x => x.mimetype === 'image/jpeg' && x.buffer.length > 0)).toBe(true);
    expect(await tilesFor(await jpeg(1400, 1000), 'Top side')).toEqual([]);
  });
  it('only the whole-board photos are tiled — close-ups and zooms are not', async () => {
    const big = await jpeg(3264, 1836);
    const t = await ocrTiles([{ buffer: big }, { buffer: big }, { buffer: big }], ['Top side', 'Close-up 1', 'Zoom of top side 1']);
    expect(t.length).toBe(6);
    expect(t.every(x => x.label.startsWith('Top side'))).toBe(true);
  });
  it('PCB_OCR_TILES=0 switches tiling off', async () => {
    process.env.PCB_OCR_TILES = '0';
    try { expect(await tilesFor(await jpeg(3264, 1836), 'Top side')).toEqual([]); } finally { delete process.env.PCB_OCR_TILES; }
  });
});
