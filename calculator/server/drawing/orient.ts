/**
 * Sheet orientation. A sheet whose content is drawn turned (a landscape drawing on a portrait page: every string
 * reads bottom to top) is turned upright before the layout is read, and every location is turned back for the output.
 */
import type { BBox, RawTextItem, Segment } from './types.js';

export type Quarter = 0 | 90 | 180 | 270;

/** The reading direction most of the sheet's text has, weighted by characters. Needs a clear majority to leave 0. */
export function dominantRotation(items: RawTextItem[]): Quarter {
  const w: Record<number, number> = { 0: 0, 90: 0, 180: 0, 270: 0 };
  let total = 0;
  for (const it of items) {
    const r = ((Math.round(it.rotation / 90) * 90) % 360 + 360) % 360;
    if (Math.abs(((it.rotation - r + 540) % 360) - 180) > 8) continue;
    const n = it.text.replace(/\s/g, '').length;
    w[r] += n; total += n;
  }
  if (total < 20) return 0;
  let best: Quarter = 0;
  for (const r of [90, 180, 270] as Quarter[]) if (w[r] > w[best]) best = r;
  return best !== 0 && w[best] >= 0.6 * total ? best : 0;
}

/** Page point → upright frame. */
export function toUpright(x: number, y: number, q: Quarter, W: number, H: number): [number, number] {
  if (q === 90) return [H - y, x];
  if (q === 270) return [y, W - x];
  if (q === 180) return [W - x, H - y];
  return [x, y];
}

/** Upright frame → page point. */
export function fromUpright(x: number, y: number, q: Quarter, W: number, H: number): [number, number] {
  if (q === 90) return [y, H - x];
  if (q === 270) return [W - y, x];
  if (q === 180) return [W - x, H - y];
  return [x, y];
}

export function boxFromUpright(b: BBox, q: Quarter, W: number, H: number): BBox {
  if (q === 0) return b;
  const [ax, ay] = fromUpright(b[0], b[1], q, W, H), [bx, by] = fromUpright(b[2], b[3], q, W, H);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

export function itemsToUpright(items: RawTextItem[], q: Quarter, W: number, H: number): RawTextItem[] {
  if (q === 0) return items;
  return items.map(it => {
    const [ox, oy] = toUpright(it.ox, it.oy, q, W, H);
    return { ...it, ox, oy, rotation: ((it.rotation - q) % 360 + 360) % 360 };
  });
}

export function segsToUpright(h: Segment[], v: Segment[], o: Segment[], q: Quarter, W: number, H: number): { h: Segment[]; v: Segment[]; o: Segment[] } {
  if (q === 0) return { h, v, o };
  const map = (s: Segment): Segment => {
    const [x0, y0] = toUpright(s.x0, s.y0, q, W, H), [x1, y1] = toUpright(s.x1, s.y1, q, W, H);
    return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
  };
  const mapO = (s: Segment): Segment => {
    const [x0, y0] = toUpright(s.x0, s.y0, q, W, H), [x1, y1] = toUpright(s.x1, s.y1, q, W, H);
    return { x0, y0, x1, y1 };
  };
  // a quarter turn swaps horizontal and vertical
  return q === 180 ? { h: h.map(map), v: v.map(map), o: o.map(mapO) } : { h: v.map(map), v: h.map(map), o: o.map(mapO) };
}
