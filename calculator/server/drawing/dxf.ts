/**
 * DXF drawings, basic: TEXT / MTEXT / ATTRIB strings, DIMENSION texts, and LINE / LWPOLYLINE line work, from model
 * space (and paper space as a second sheet when it holds text). One level of INSERT is expanded so a title block
 * kept as a block is read. Uses the group-code reader of server/utils/dxf-blank.ts.
 *
 * Not read: hatches, splines, arcs (no text in them), nested blocks, text styles (a string's width is estimated from
 * its height — DXF does not store it), external references.
 */
import { readPairs, type Pair } from '../utils/dxf-blank.js';
import type { RawTextItem, Segment } from './types.js';

interface Ent { type: string; pairs: Pair[] }
export interface DxfSheet { items: RawTextItem[]; h: Segment[]; v: Segment[]; o: Segment[]; widthPt: number; heightPt: number; space: 'model' | 'paper' }
export interface DxfRead { sheets: DxfSheet[]; units: 'mm' | 'inch'; unitsAssumed: boolean; warnings: string[]; entityCounts: Record<string, number> }

const get = (e: Ent, code: number): string | undefined => e.pairs.find(p => p.code === code)?.value.trim();
const getN = (e: Ent, code: number, dflt = 0): number => { const v = get(e, code); const n = v === undefined ? NaN : Number(v); return Number.isFinite(n) ? n : dflt; };
const all = (e: Ent, code: number): string[] => e.pairs.filter(p => p.code === code).map(p => p.value);

function entities(pairs: Pair[], from: number, to: number): Ent[] {
  const out: Ent[] = [];
  let cur: Ent | undefined;
  for (let i = from; i < to; i++) {
    const p = pairs[i];
    if (p.code === 0) { cur = { type: p.value.trim().toUpperCase(), pairs: [] }; out.push(cur); }
    else if (cur) cur.pairs.push(p);
  }
  return out;
}

function section(pairs: Pair[], name: string): [number, number] | undefined {
  for (let i = 0; i + 1 < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value.trim() === 'SECTION' && pairs[i + 1].code === 2 && pairs[i + 1].value.trim() === name) {
      for (let j = i + 2; j < pairs.length; j++) if (pairs[j].code === 0 && pairs[j].value.trim() === 'ENDSEC') return [i + 2, j];
      return [i + 2, pairs.length];
    }
  }
  return undefined;
}

/** DXF control codes and MTEXT formatting → plain text lines. */
export function plainText(raw: string): string[] {
  let t = raw.replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '').replace(/%%(\d{3})/g, (_, d) => String.fromCharCode(Number(d)));
  t = t.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // stacked text \S upper^lower; or \S a/b; → "upper/lower"
  t = t.replace(/\\S([^;^/#]*)[\^/#]([^;]*);/g, (_, a: string, b: string) => ` ${a.trim()}/${b.trim()}`);
  t = t.replace(/\\[fFhHwWqQaAcCtTpP][^;\\]*;/g, m => (/^\\P/.test(m) ? m : ''));
  t = t.replace(/\\[LlOoKk]/g, '').replace(/\\~/g, ' ').replace(/[{}]/g, '');
  return t.split(/\\P|\n/).map(s => s.replace(/\\\\/g, '\\').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

interface Xf { x: number; y: number; sx: number; sy: number; rot: number }
const ID: Xf = { x: 0, y: 0, sx: 1, sy: 1, rot: 0 };
function xf(t: Xf, x: number, y: number): [number, number] {
  const c = Math.cos(t.rot * Math.PI / 180), s = Math.sin(t.rot * Math.PI / 180);
  const X = x * t.sx, Y = y * t.sy;
  return [t.x + X * c - Y * s, t.y + X * s + Y * c];
}

interface RawT { text: string; x: number; y: number; h: number; rot: number }
interface RawL { x0: number; y0: number; x1: number; y1: number }

function collect(ents: Ent[], t: Xf, blocks: Map<string, Ent[]>, texts: RawT[], lines: RawL[], counts: Record<string, number>, depth: number, paper: boolean | undefined): void {
  for (const e of ents) {
    if (paper !== undefined && (getN(e, 67) === 1) !== paper) continue;
    const scale = Math.abs(t.sy) || 1;
    if (e.type === 'TEXT' || e.type === 'ATTRIB' || (e.type === 'ATTDEF' && depth === 0)) {
      const s = get(e, 1);
      if (!s) continue;
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      const h = getN(e, 40, 2.5) * scale;
      const hAlign = getN(e, 72), vAlign = getN(e, e.type === 'TEXT' ? 73 : 74);
      const text = plainText(s).join(' ');
      if (!text) continue;
      let [x, y] = xf(t, getN(e, 10), getN(e, 20));
      const rot = getN(e, 50) + t.rot;
      if ((hAlign !== 0 || vAlign !== 0) && get(e, 11) !== undefined) {
        const [ax, ay] = xf(t, getN(e, 11), getN(e, 21));
        const w = text.length * h * 0.6;
        const back = hAlign === 1 || hAlign === 4 ? 0.5 * w : hAlign === 2 ? w : 0;
        const down = vAlign === 3 ? h : vAlign === 2 ? 0.5 * h : 0;
        const c = Math.cos(rot * Math.PI / 180), sn = Math.sin(rot * Math.PI / 180);
        x = ax - back * c + down * sn; y = ay - back * sn - down * c;
      }
      texts.push({ text, x, y, h, rot });
    } else if (e.type === 'MTEXT') {
      const raw = [...all(e, 3), ...all(e, 1)].join('');
      const rows = plainText(raw);
      if (!rows.length) continue;
      counts.MTEXT = (counts.MTEXT ?? 0) + 1;
      const h = getN(e, 40, 2.5) * scale;
      let rot = getN(e, 50);
      if (get(e, 11) !== undefined) rot = Math.atan2(getN(e, 21), getN(e, 11)) * 180 / Math.PI;
      rot += t.rot;
      const attach = getN(e, 71, 1);
      const col = (attach - 1) % 3, rowA = Math.floor((attach - 1) / 3);
      const pitch = h * (5 / 3) * (getN(e, 44, 1) || 1);
      const total = pitch * (rows.length - 1) + h;
      const [x0, y0] = xf(t, getN(e, 10), getN(e, 20));
      const c = Math.cos(rot * Math.PI / 180), sn = Math.sin(rot * Math.PI / 180);
      rows.forEach((text, i) => {
        const w = text.length * h * 0.6;
        const back = col === 1 ? 0.5 * w : col === 2 ? w : 0;
        // distance from the attachment point down to this row's baseline
        const down = (rowA === 0 ? h : rowA === 1 ? h - total / 2 : h - total) + i * pitch;
        texts.push({ text, x: x0 - back * c + down * sn, y: y0 - back * sn - down * c, h, rot });
      });
    } else if (e.type === 'DIMENSION') {
      counts.DIMENSION = (counts.DIMENSION ?? 0) + 1;
      const override = get(e, 1) ?? '';
      const kind = getN(e, 70) & 7;
      const meas = getN(e, 42, NaN);
      let text: string | undefined;
      const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
      const measured = Number.isFinite(meas) && kind !== 2 && kind !== 5 ? `${kind === 3 ? 'Ø' : kind === 4 ? 'R' : ''}${fmt(meas * (kind <= 1 || kind === 6 ? 1 : 1))}` : undefined;
      if (override && override !== '<>' && override.trim() !== '') text = plainText(override.replace(/<>/g, measured ?? '')).join(' ');
      else text = measured;
      if (!text) continue;
      const [x, y] = xf(t, getN(e, 11), getN(e, 21));
      const h = 2.5 * scale;
      // the text middle point is given: place the baseline start half a (estimated) width back
      const w = text.length * h * 0.6;
      texts.push({ text, x: x - w / 2, y: y - h / 2, h, rot: t.rot });
    } else if (e.type === 'LINE') {
      const [x0, y0] = xf(t, getN(e, 10), getN(e, 20)), [x1, y1] = xf(t, getN(e, 11), getN(e, 21));
      lines.push({ x0, y0, x1, y1 });
    } else if (e.type === 'LWPOLYLINE') {
      const xs = all(e, 10).map(Number), ys = all(e, 20).map(Number);
      const closed = (getN(e, 70) & 1) === 1;
      const pts = xs.map((x, i) => xf(t, x, ys[i] ?? 0));
      for (let i = 1; i < pts.length; i++) lines.push({ x0: pts[i - 1][0], y0: pts[i - 1][1], x1: pts[i][0], y1: pts[i][1] });
      if (closed && pts.length > 2) lines.push({ x0: pts[pts.length - 1][0], y0: pts[pts.length - 1][1], x1: pts[0][0], y1: pts[0][1] });
    } else if (e.type === 'INSERT' && depth === 0) {
      const name = get(e, 2) ?? '';
      const def = blocks.get(name);
      if (!def || /^\*[DU]/i.test(name)) continue;
      counts.INSERT = (counts.INSERT ?? 0) + 1;
      const [ix, iy] = xf(t, getN(e, 10), getN(e, 20));
      collect(def, { x: ix, y: iy, sx: getN(e, 41, 1) * t.sx, sy: getN(e, 42, 1) * t.sy, rot: getN(e, 50) + t.rot }, blocks, texts, lines, counts, 1, undefined);
    }
  }
}

export function readDxf(text: string, sheetStart = 1): DxfRead {
  const pairs = readPairs(text);
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const entSec = section(pairs, 'ENTITIES');
  if (!entSec) return { sheets: [], units: 'mm', unitsAssumed: true, warnings: ['The DXF has no ENTITIES section: nothing to read.'], entityCounts: counts };
  // header: $INSUNITS (1 inch, 4 mm)
  let units: 'mm' | 'inch' = 'mm', unitsAssumed = true;
  const head = section(pairs, 'HEADER');
  if (head) for (let i = head[0]; i < head[1] - 1; i++) {
    if (pairs[i].code === 9 && pairs[i].value.trim() === '$INSUNITS') { const v = Number(pairs[i + 1].value); if (v === 1) { units = 'inch'; unitsAssumed = false; } else if (v === 4) { units = 'mm'; unitsAssumed = false; } }
  }
  if (unitsAssumed) warnings.push('The DXF does not declare its units: millimetres assumed.');
  const blocks = new Map<string, Ent[]>();
  const blkSec = section(pairs, 'BLOCKS');
  if (blkSec) {
    let name: string | undefined; let cur: Ent[] = [];
    for (const e of entities(pairs, blkSec[0], blkSec[1])) {
      if (e.type === 'BLOCK') { name = get(e, 2); cur = []; }
      else if (e.type === 'ENDBLK') { if (name) blocks.set(name, cur); name = undefined; }
      else if (name) cur.push(e);
    }
  }
  const ents = entities(pairs, entSec[0], entSec[1]);
  const k = units === 'inch' ? 72 : 72 / 25.4;
  const sheets: DxfSheet[] = [];
  for (const paper of [false, true]) {
    const texts: RawT[] = [], lines: RawL[] = [];
    collect(ents, ID, blocks, texts, lines, counts, 0, paper);
    if (!texts.length) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const see = (x: number, y: number): void => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const t of texts) { see(t.x, t.y); see(t.x + t.text.length * t.h * 0.6, t.y + t.h); }
    for (const l of lines) { see(l.x0, l.y0); see(l.x1, l.y1); }
    const pad = 5;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const sheet = sheetStart + sheets.length;
    const items: RawTextItem[] = texts.map(t => ({
      text: t.text, sheet, ox: (t.x - x0) * k, oy: (y1 - t.y) * k, width: t.text.length * t.h * 0.6 * k, size: t.h * k,
      rotation: ((t.rot % 360) + 360) % 360, method: 'dxf-entity' as const, reliability: 1,
    }));
    const h: Segment[] = [], v: Segment[] = [], o: Segment[] = [];
    for (const l of lines) {
      const a = { x0: (l.x0 - x0) * k, y0: (y1 - l.y0) * k, x1: (l.x1 - x0) * k, y1: (y1 - l.y1) * k };
      if (Math.hypot(a.x1 - a.x0, a.y1 - a.y0) < 3) continue;
      if (Math.abs(a.y0 - a.y1) < 0.3) h.push({ x0: Math.min(a.x0, a.x1), y0: (a.y0 + a.y1) / 2, x1: Math.max(a.x0, a.x1), y1: (a.y0 + a.y1) / 2 });
      else if (Math.abs(a.x0 - a.x1) < 0.3) v.push({ x0: (a.x0 + a.x1) / 2, y0: Math.min(a.y0, a.y1), x1: (a.x0 + a.x1) / 2, y1: Math.max(a.y0, a.y1) });
      else o.push(a);
    }
    sheets.push({ items, h, v, o, widthPt: (x1 - x0) * k, heightPt: (y1 - y0) * k, space: paper ? 'paper' : 'model' });
  }
  if (!sheets.length) warnings.push('The DXF holds no TEXT, MTEXT or DIMENSION entities: nothing to read.');
  else warnings.push('DXF text positions are exact; string widths are estimated from the text height (a DXF does not store them).');
  return { sheets, units, unitsAssumed, warnings, entityCounts: counts };
}
