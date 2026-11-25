/**
 * Chip markings read on full-resolution tiles (EDU v6, Nov 2026).
 *
 * On the EDU control board only two part numbers were read off the chips (the AURIX and the TJA1463A); most of the
 * markings read by hand later came from full-resolution crops of the same photos. The model sees an image at most
 * ~1,568 px on its long edge — a 4,080 px board photo is shrunk ×2.6 and a 1 mm marking becomes a few pixels. So the OCR
 * stage gets each whole-board photo ALSO as overlapping tiles, each at most TILE_PX on its long edge, cut from the
 * full-resolution upload: the markings keep their pixels. The whole photo stays in front of the tiles for context.
 *
 * Only the OCR stage receives tiles; the BOM stage sees the photos as before. Cap: MAX_TILES_PER_PHOTO and
 * MAX_TILES_TOTAL; beyond them the photo is read whole. PCB_OCR_TILES=0 switches tiling off.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canvasLib(): any | null { try { return require('@napi-rs/canvas'); } catch { return null; } }

/** The long edge the model reads an image at without shrinking it (Anthropic vision guidance: ~1,568 px). */
export const TILE_PX = 1568;
export const TILE_OVERLAP = 0.12;
export const MAX_TILES_PER_PHOTO = 9;
export const MAX_TILES_TOTAL = 18;

export interface TileRect { x: number; y: number; w: number; h: number; row: number; col: number }

/**
 * The tile grid for a w × h image: the fewest rows × columns so that every tile, with OVERLAP on each inner edge, is at
 * most `tile` px on both edges; tiles cover the image exactly (the last row / column ends at the edge). An image already
 * within `tile` is one tile.
 */
export function tileGrid(w: number, h: number, tile = TILE_PX, overlap = TILE_OVERLAP): TileRect[] {
  if (!(w > 0 && h > 0)) return [];
  const n = (len: number) => len <= tile ? 1 : Math.ceil((len - tile * overlap) / (tile * (1 - overlap)));
  const cols = n(w), rows = n(h);
  // At most `tile` on each edge; never narrower than w / cols, so the tiles always cover the image.
  const tw = Math.min(w, tile, Math.ceil(w / cols + (cols > 1 ? tile * overlap : 0)));
  const th = Math.min(h, tile, Math.ceil(h / rows + (rows > 1 ? tile * overlap : 0)));
  const out: TileRect[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = cols === 1 ? 0 : Math.round((w - tw) * c / (cols - 1));
    const y = rows === 1 ? 0 : Math.round((h - th) * r / (rows - 1));
    out.push({ x, y, w: tw, h: th, row: r, col: c });
  }
  return out;
}

export interface TileFile { buffer: Buffer; mimetype: 'image/jpeg'; label: string; originalname: string; size: number }

/** Cut one photo into tiles (JPEG, quality 0.9). [] when the photo needs no tiling, cannot be decoded, or the canvas
 *  library is missing — the caller then sends the photo whole, as before. */
export async function tilesFor(buf: Buffer, label: string, maxTiles = MAX_TILES_PER_PHOTO): Promise<TileFile[]> {
  if (process.env.PCB_OCR_TILES === '0') return [];
  const lib = canvasLib();
  if (!lib) return [];
  let img: { width: number; height: number };
  try { img = await lib.loadImage(buf); } catch { return []; }
  const grid = tileGrid(img.width, img.height);
  if (grid.length <= 1 || grid.length > maxTiles) return [];
  const rows = Math.max(...grid.map(t => t.row)) + 1, cols = Math.max(...grid.map(t => t.col)) + 1;
  const out: TileFile[] = [];
  for (const t of grid) {
    const c = lib.createCanvas(t.w, t.h);
    c.getContext('2d').drawImage(img, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
    const jpg: Buffer = await c.encode('jpeg', 90);
    const where = `${rows > 1 ? ['top', 'middle', 'bottom'][Math.round(t.row / Math.max(1, rows - 1) * 2)] : ''}${rows > 1 && cols > 1 ? ' ' : ''}${cols > 1 ? ['left', 'centre', 'right'][Math.round(t.col / Math.max(1, cols - 1) * 2)] : ''}`;
    out.push({ buffer: jpg, mimetype: 'image/jpeg', label: `${label} — full-resolution tile ${t.row + 1}.${t.col + 1} (${where})`, originalname: `${label}-tile-${t.row + 1}-${t.col + 1}.jpg`, size: jpg.length });
  }
  return out;
}

/** The OCR stage's images: every photo as sent, then the whole-board photos (labels "Top side" / "Bottom side") as
 *  full-resolution tiles, up to MAX_TILES_TOTAL in all. */
export async function ocrTiles(files: Array<{ buffer: Buffer }>, labels: string[]): Promise<TileFile[]> {
  const out: TileFile[] = [];
  for (let i = 0; i < files.length && out.length < MAX_TILES_TOTAL; i++) {
    const label = labels[i] ?? '';
    if (!/^(top|bottom) side$/i.test(label.trim())) continue;
    const t = await tilesFor(files[i].buffer, label, Math.min(MAX_TILES_PER_PHOTO, MAX_TILES_TOTAL - out.length));
    out.push(...t);
  }
  return out;
}
