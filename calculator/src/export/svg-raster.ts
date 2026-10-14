/**
 * SVG → PNG for report images (360 report, Oct 2026). Browser: the SVG is loaded as an image and drawn on a canvas at
 * `scale` × its size — a crisp PNG for jsPDF `addImage` and ExcelJS `addImage`. The function is SELF-CONTAINED (no
 * imports, no closures), so headless scripts pass the same function to Playwright's `page.evaluate` and CI draws the
 * same pixels as the screen (scripts/sw-report/report-sample.ts).
 */
export interface RasterImage { dataUrl: string; width: number; height: number }

export async function rasteriseSvg(args: { svg: string; width: number; height: number; scale: number }): Promise<RasterImage> {
  const { svg, width, height, scale } = args;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  img.decoding = 'sync';
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('SVG did not load')); img.src = url; });
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
}

/** Rasterise many SVGs (key → svg) at one scale per key. */
export async function rasteriseAll(items: Array<{ key: string; svg: string; width: number; height: number; scale: number }>): Promise<Map<string, RasterImage>> {
  const out = new Map<string, RasterImage>();
  for (const it of items) out.set(it.key, await rasteriseSvg(it));
  return out;
}
