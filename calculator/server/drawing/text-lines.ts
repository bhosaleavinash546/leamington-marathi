/**
 * Reading order: turn the runs a source emits (CAD PDFs emit one glyph or one word per run; OCR emits words; DXF emits
 * strings) into lines. Runs are merged along a shared baseline when the gap is a letter or word gap, the size matches
 * and no line work (a table or frame divider) stands between them. Works in the text's own frame, so text turned 90°,
 * 270° or to any angle (isometric annotation planes) is assembled the same way.
 */
import type { RawTextItem, Segment, TextLine, BBox } from './types.js';
import { frame, snapRotation, r2 } from './geom.js';

/** A divider in a text frame: its two ends as (u along the reading direction, v across it). */
export interface Sep { ua: number; va: number; ub: number; vb: number; umin: number }

/**
 * Line work that crosses the reading direction of a frame — candidate cell dividers. For upright and quarter-turned
 * text only true perpendiculars count. For text at any other angle (an isometric annotation plane) the frame is
 * drawn sheared, so a divider may lean up to ~60° from the perpendicular (and is then no longer than a frame is tall).
 */
export function separatorsFor(rotation: number, h: Segment[], v: Segment[], o: Segment[]): Sep[] {
  const f = frame(rotation);
  const axis = rotation % 90 === 0;
  const pool: Segment[] = rotation % 180 === 0 ? v : rotation % 180 === 90 ? h : [...h, ...v, ...o];
  // cos of the angle to the reading direction: within ~8° of perpendicular, or up to ~60° off it on a sheared frame
  const lean = axis ? 0.14 : 0.87;
  const out: Sep[] = [];
  for (const s of pool) {
    const ex = s.x1 - s.x0, ey = s.y1 - s.y0;
    const len = Math.hypot(ex, ey);
    if (len < 3) continue;
    const cos = Math.abs((ex * f.dx + ey * f.dy) / len);
    if (cos > lean) continue;
    if (!axis && cos > 0.14 && len > 60) continue;              // a long leaning line is a leader, not a cell wall
    const ua = s.x0 * f.dx + s.y0 * f.dy, ub = s.x1 * f.dx + s.y1 * f.dy;
    const va = s.x0 * f.mx + s.y0 * f.my, vb = s.x1 * f.mx + s.y1 * f.my;
    out.push(va <= vb ? { ua, va, ub, vb, umin: Math.min(ua, ub) } : { ua: ub, va: vb, ub: ua, vb: va, umin: Math.min(ua, ub) });
  }
  out.sort((a, b) => a.umin - b.umin);
  return out;
}

/** Is there a divider between two runs that end at `uA` and start at `uB` on the baseline `v`? */
export function hasSeparator(seps: Sep[], uA: number, uB: number, v: number, size: number): boolean {
  if (!seps.length) return false;
  const lo = uA - 0.08 * size, hi = uB + 0.08 * size;
  const from = lo - 3 * size;
  let a = 0, b = seps.length;
  while (a < b) { const m = (a + b) >> 1; if (seps[m].umin < from) a = m + 1; else b = m; }
  // where the divider stands across the height of the glyphs: a point for an upright divider, a span for a leaning one
  const vTop = v - 0.75 * size, vBase = v - 0.05 * size;
  for (let i = a; i < seps.length && seps[i].umin <= hi; i++) {
    const s = seps[i];
    if (!(s.va <= v - 0.5 * size && s.vb >= v - 0.2 * size)) continue;
    // a divider is taller than the letters it divides: a glyph's own stem (text drawn as curves) is not one
    if (s.vb - s.va < 1.05 * size) continue;
    // a leaning divider is a frame wall and no taller than a frame; a longer leaning line is a leader crossing the text
    if (Math.abs(s.ub - s.ua) > 0.15 * (s.vb - s.va) && s.vb - s.va > 2.6 * size) continue;
    const at = (vv: number): number => s.ua + (s.ub - s.ua) * (Math.min(s.vb, Math.max(s.va, vv)) - s.va) / Math.max(1e-6, s.vb - s.va);
    const u1 = at(vTop), u2 = at(vBase);
    if (Math.max(u1, u2) >= lo && Math.min(u1, u2) <= hi) return true;
  }
  return false;
}

/** How many dividers stand between `lo` and `hi` on the baseline `v` (cell walls beside a run of text). */
export function countSeparators(seps: Sep[], lo: number, hi: number, v: number, size: number): number {
  let n = 0;
  const vTop = v - 0.75 * size, vBase = v - 0.05 * size;
  for (const s of seps) {
    if (s.umin > hi) break;
    if (!(s.va <= v - 0.5 * size && s.vb >= v - 0.2 * size) || s.vb - s.va < 1.05 * size || s.vb - s.va > 4 * size) continue;
    const at = (vv: number): number => s.ua + (s.ub - s.ua) * (Math.min(s.vb, Math.max(s.va, vv)) - s.va) / Math.max(1e-6, s.vb - s.va);
    const u = (at(vTop) + at(vBase)) / 2;
    if (u >= lo && u <= hi) n++;
  }
  return n;
}

const WS = /^[\s ]*$/;

/** Assemble the runs of ONE sheet into lines. `startId` keeps ids unique across sheets. */
export function assembleLines(items: RawTextItem[], segs: { h: Segment[]; v: Segment[]; o: Segment[] }, startId = 0): TextLine[] {
  // Drop empties and exact duplicates (bold drawn as the same string twice).
  const seen = new Set<string>();
  const clean: Array<RawTextItem & { rot: number }> = [];
  for (const it of items) {
    if (WS.test(it.text) || !(it.size > 0)) continue;
    const rot = snapRotation(it.rotation);
    const key = `${rot}|${Math.round(it.ox * 2)}|${Math.round(it.oy * 2)}|${it.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ ...it, text: it.text.replace(/ /g, ' '), rot });
  }
  const groups = new Map<number, Array<RawTextItem & { rot: number }>>();
  for (const it of clean) { const g = groups.get(it.rot); if (g) g.push(it); else groups.set(it.rot, [it]); }

  const lines: Omit<TextLine, 'id'>[] = [];
  for (const rot of [...groups.keys()].sort((a, b) => a - b)) {
    const f = frame(rot);
    const seps = separatorsFor(rot, segs.h, segs.v, segs.o);
    const g = groups.get(rot)!.map(it => {
      const u0 = it.ox * f.dx + it.oy * f.dy;
      return { it, u0, u1: u0 + it.width, v: it.ox * f.mx + it.oy * f.my };
    }).sort((a, b) => a.v - b.v || a.u0 - b.u0);

    let i = 0;
    while (i < g.length) {
      // one baseline row
      let j = i + 1; const anchor = g[i]; let rowSize = anchor.it.size;
      while (j < g.length && g[j].v - anchor.v <= 0.3 * Math.min(rowSize, g[j].it.size)) { rowSize = Math.min(rowSize, g[j].it.size); j++; }
      const row = g.slice(i, j).sort((a, b) => a.u0 - b.u0 || a.v - b.v);
      i = j;
      let cur: typeof row = [];
      const flush = (): void => {
        if (!cur.length) return;
        let text = '';
        let relSum = 0, relN = 0, hasRel = false;
        for (let k = 0; k < cur.length; k++) {
          const c = cur[k];
          if (k > 0) {
            const gap = c.u0 - cur[k - 1].u1;
            if (gap > 0.15 * c.it.size && !/\s$/.test(text) && !/^\s/.test(c.it.text)) text += ' ';
          }
          text += c.it.text;
          if (c.it.reliability !== undefined) { hasRel = true; relSum += c.it.reliability * c.it.text.length; relN += c.it.text.length; }
        }
        text = text.replace(/\s+/g, ' ').trim();
        if (text) {
          const u0 = cur[0].u0, u1 = Math.max(...cur.map(c => c.u1));
          const v = cur.reduce((s, c) => s + c.v, 0) / cur.length;
          const size = Math.max(...cur.map(c => c.it.size));
          const corners: Array<[number, number]> = [[u0, v - 0.8 * size], [u1, v - 0.8 * size], [u0, v + 0.22 * size], [u1, v + 0.22 * size]];
          const xs = corners.map(([u, w]) => u * f.dx + w * f.mx), ys = corners.map(([u, w]) => u * f.dy + w * f.my);
          const bbox: BBox = [r2(Math.min(...xs)), r2(Math.min(...ys)), r2(Math.max(...xs)), r2(Math.max(...ys))];
          lines.push({
            text, sheet: cur[0].it.sheet, bbox, size: r2(size), rotation: rot, method: cur[0].it.method,
            ...(hasRel && relN ? { reliability: r2(relSum / relN) } : {}),
            u0: r2(u0), u1: r2(u1), v: r2(v), ...(cur[0].it.font ? { font: cur[0].it.font } : {}),
          });
        }
        cur = [];
      };
      for (const c of row) {
        if (cur.length) {
          const p = cur[cur.length - 1];
          const size = Math.min(p.it.size, c.it.size);
          const gap = c.u0 - p.u1;
          const ratio = c.it.size / p.it.size;
          // a symbol-font glyph (depth, diameter, a modifier) belongs to the value beside it whatever its size
          const sym = !!c.it.symbol || !!p.it.symbol;
          const split = gap > 1.5 * size || gap < -0.6 * size || (!sym && (ratio < 0.8 || ratio > 1.25))
            || c.it.method !== p.it.method
            || (gap > -0.2 * size && hasSeparator(seps, p.u1, c.u0, (p.v + c.v) / 2, size));
          if (split) flush();
        }
        cur.push(c);
      }
      flush();
    }
  }
  // Reading order: upright text first (top to bottom, left to right), then each turned frame in its own order.
  const ordered = lines.map((l, n) => ({ l, n })).sort((a, b) =>
    a.l.rotation - b.l.rotation || a.l.v - b.l.v || a.l.u0 - b.l.u0 || a.n - b.n);
  return ordered.map(({ l }, n) => ({ ...l, id: startId + n }));
}
