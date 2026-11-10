/**
 * Image clean-up before OCR, on plain 8-bit greyscale buffers: background flattening and binarisation, speck removal,
 * skew estimation and rotation. Deterministic integer / float arithmetic only — no library, no model.
 */

export interface Grey { data: Uint8Array; width: number; height: number }

/** RGBA → 8-bit luma (ITU-R BT.601), composited on white. */
export function rgbaToGrey(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Grey {
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const a = rgba[j + 3];
    const l = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    out[i] = a === 255 ? l : (l * a + 255 * (255 - a)) / 255;
  }
  return { data: out, width, height };
}

/** Otsu's threshold on a histogram. */
export function otsu(hist: Uint32Array | number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/**
 * Flatten the paper and separate ink from it. The paper level is estimated block by block (the 85th percentile of a
 * 48 px block, smoothed), so a shadow or a yellowed sheet does not move the threshold. Returns the cleaned greyscale
 * (paper = 255, ink stretched to dark) and the ink mask.
 */
export function flattenAndBinarise(g: Grey): { grey: Grey; ink: Uint8Array } {
  const { data, width: w, height: h } = g;
  const B = 48;
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const bg = new Float32Array(bw * bh);
  const hist = new Uint32Array(256);
  const global = new Uint32Array(256);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    hist.fill(0);
    let n = 0;
    const y1 = Math.min(h, (by + 1) * B), x1 = Math.min(w, (bx + 1) * B);
    for (let y = by * B; y < y1; y += 2) { const row = y * w; for (let x = bx * B; x < x1; x += 2) { hist[data[row + x]]++; n++; } }
    let acc = 0, level = 255;
    const target = n * 0.15;                                   // 85th percentile from the top
    for (let t = 255; t >= 0; t--) { acc += hist[t]; if (acc >= target) { level = t; break; } }
    bg[by * bw + bx] = level;
    for (let t = 0; t < 256; t++) global[t] += hist[t];
  }
  // A block that is mostly ink (a filled area) takes its neighbours' paper level: 3×3 maximum, then a 3×3 mean.
  const tmp = new Float32Array(bg.length);
  const pass = (src: Float32Array, dst: Float32Array, max: boolean): void => {
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      let m = 0, s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || xx < 0 || yy >= bh || xx >= bw) continue;
        const v = src[yy * bw + xx]; if (v > m) m = v; s += v; n++;
      }
      dst[y * bw + x] = max ? m : s / n;
    }
  };
  pass(bg, tmp, true); pass(tmp, bg, false);
  let total = 0; for (let t = 0; t < 256; t++) total += global[t];
  const gThr = otsu(global, total);
  const out = new Uint8Array(w * h);
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1, Math.max(0, (y + 0.5) / B - 0.5)), y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1, Math.max(0, (x + 0.5) / B - 0.5)), x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
      const paper = Math.max(40, (bg[y0 * bw + x0] * (1 - tx) + bg[y0 * bw + x1] * tx) * (1 - ty) + (bg[y1 * bw + x0] * (1 - tx) + bg[y1 * bw + x1] * tx) * ty);
      const v = data[row + x];
      // ink: clearly darker than the local paper, or below half the global threshold
      const lo = paper * 0.45, hi = paper * 0.88;
      const n = v >= hi ? 255 : v <= lo ? 0 : Math.round(255 * (v - lo) / (hi - lo));
      out[row + x] = n;
      ink[row + x] = (v < paper * 0.7 || v < gThr * 0.5) ? 1 : 0;
    }
  }
  return { grey: { data: out, width: w, height: h }, ink };
}

/** Remove specks: an ink pixel with at most one ink neighbour (3×3) is noise, not a stroke. Whitens them in `grey` too. */
export function despeckle(ink: Uint8Array, grey: Grey): number {
  const { width: w, height: h, data } = grey;
  const kill: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      if (!ink[i]) continue;
      const n = ink[i - w - 1] + ink[i - w] + ink[i - w + 1] + ink[i - 1] + ink[i + 1] + ink[i + w - 1] + ink[i + w] + ink[i + w + 1];
      if (n <= 1) kill.push(i);
    }
  }
  for (const i of kill) { ink[i] = 0; data[i] = 255; }
  return kill.length;
}

/**
 * Skew of the sheet in degrees (positive = the content is turned counter-clockwise and must be turned clockwise to
 * straighten), from the projection profile: the angle at which rows of ink are sharpest. A drawing's border and
 * title-block lines make the peak narrow. Searched within ±6°, to 0.02°.
 */
export function estimateSkew(ink: Uint8Array, w: number, h: number): number {
  // sample ink pixels on a coarse lattice (at most ~250k)
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 6_000_000)));
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < h; y += step) { const row = y * w; for (let x = 0; x < w; x += step) if (ink[row + x]) { xs.push(x); ys.push(y); } }
  if (xs.length < 500) return 0;
  const keep = Math.max(1, Math.ceil(xs.length / 250_000));
  const px: number[] = [], py: number[] = [];
  for (let i = 0; i < xs.length; i += keep) { px.push(xs[i] - w / 2); py.push(ys[i] - h / 2); }
  const bins = Math.ceil(h * 1.3 / step) + 4;
  const prof = new Float64Array(bins);
  const score = (deg: number): number => {
    const t = Math.tan(deg * Math.PI / 180);
    prof.fill(0);
    for (let i = 0; i < px.length; i++) {
      const b = Math.round((py[i] + px[i] * t + h * 0.65) / step);
      if (b >= 0 && b < bins) prof[b]++;
    }
    let s = 0; for (let i = 0; i < bins; i++) s += prof[i] * prof[i];
    return s;
  };
  let best = 0, bestS = -1;
  const search = (from: number, to: number, inc: number): void => {
    for (let a = from; a <= to + 1e-9; a += inc) { const s = score(a); if (s > bestS) { bestS = s; best = a; } }
  };
  search(-6, 6, 0.5);
  search(best - 0.5, best + 0.5, 0.1);
  search(best - 0.1, best + 0.1, 0.02);
  // The profile sharpens when rows are sheared by tan(a): content turned counter-clockwise by s has rows rising to the
  // right (y falls as x grows), which the shear y + x·tan(a) undoes at a = s.
  return Math.round(best * 100) / 100;
}

/** Rotate a greyscale image about its centre by `deg` (positive = clockwise on screen), bilinear, white fill. */
export function rotateGrey(g: Grey, deg: number): Grey {
  const { data, width: w, height: h } = g;
  const out = new Uint8Array(w * h).fill(255);
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy, row = y * w;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      // inverse map: where did this pixel come from
      const sx = c * dx + s * dy + cx, sy = -s * dx + c * dy + cy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const fx = sx - x0, fy = sy - y0, i = y0 * w + x0;
      out[row + x] = (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + w] * (1 - fx) + data[i + w + 1] * fx) * fy;
    }
  }
  return { data: out, width: w, height: h };
}

/** Map a point of the straightened image back to the original (the inverse of `rotateGrey(g, deg)`). */
export function unrotatePoint(x: number, y: number, w: number, h: number, deg: number): [number, number] {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const dx = x - cx, dy = y - cy;
  return [c * dx + s * dy + cx, -s * dx + c * dy + cy];
}

/** Turn the image a quarter clockwise: a point (x, y) lands at (h − 1 − y, x). */
export function rotate90cw(g: Grey): Grey {
  const { data, width: w, height: h } = g;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = data[row + x]; }
  return { data: out, width: h, height: w };
}

/** Ink mask of a clean render (no flattening needed). */
export function inkMask(g: Grey, threshold = 160): Uint8Array {
  const m = new Uint8Array(g.data.length);
  for (let i = 0; i < m.length; i++) m[i] = g.data[i] < threshold ? 1 : 0;
  return m;
}
