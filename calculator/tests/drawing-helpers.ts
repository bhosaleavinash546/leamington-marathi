/** Helpers for the drawing-reader tests: build an extraction context from a few lines of text. */
import type { ExtractContext, SheetData, SheetLayout, TextLine, Segment, Region } from '../server/drawing/types';
import { analyseLayout } from '../server/drawing/layout';

export interface L { text: string; x: number; y: number; size?: number; rotation?: number; region?: Region; method?: TextLine['method']; reliability?: number }

/** Lines at given baselines on one sheet. `layout: true` runs the real layout pass over them (and the line work). */
export function ctxOf(lines: L[], opts: { h?: Segment[]; v?: Segment[]; o?: Segment[]; layout?: boolean; width?: number; height?: number } = {}): ExtractContext {
  const W = opts.width ?? 1190, H = opts.height ?? 842;
  const tl: TextLine[] = lines.map((l, id) => {
    const size = l.size ?? 10, rot = l.rotation ?? 0;
    const w = l.text.length * size * 0.55;
    const bbox: [number, number, number, number] = rot === 90 ? [l.x - size * 0.8, l.y - w, l.x + size * 0.2, l.y] : [l.x, l.y - size * 0.8, l.x + w, l.y + size * 0.2];
    const u0 = rot === 90 ? -l.y : l.x, v = rot === 90 ? l.x : l.y;
    return { id, text: l.text, sheet: 1, bbox, size, rotation: rot, method: l.method ?? 'pdf-text', ...(l.reliability !== undefined ? { reliability: l.reliability } : {}),
      u0, u1: u0 + w, v, ...(l.region ? { region: l.region } : {}) };
  });
  const sheet: SheetData = {
    info: { sheet: 1, widthPt: W, heightPt: H, content: 'vector-text', textItemCount: tl.length, rotationDeg: 0 },
    items: [], lines: tl, hSegs: opts.h ?? [], vSegs: opts.v ?? [], oSegs: opts.o ?? [], stats: { pathOps: 0, glyphLikePaths: 0, imageCoverage: 0, textChars: 0 },
  };
  let layout: SheetLayout = { sheet: 1, notes: [], tables: [], viewAreas: [] };
  if (opts.layout) layout = analyseLayout({ sheet: 1, width: W, height: H, lines: tl, hSegs: sheet.hSegs, vSegs: sheet.vSegs, oSegs: sheet.oSegs });
  else for (const l of tl) l.region = l.region ?? 'view';
  return { sourceFile: 'test', sheets: [sheet], layouts: [layout], lines: tl };
}

/** A rectangle as four wall segments. */
export function box(x0: number, y0: number, x1: number, y1: number): { h: Segment[]; v: Segment[] } {
  return { h: [{ x0, y0, x1, y1: y0 }, { x0, y0: y1, x1, y1 }], v: [{ x0, y0, x1: x0, y1 }, { x0: x1, y0, x1, y1 }] };
}
