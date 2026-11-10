/**
 * Sheet layout from text positions and line work: the frame, the zone grid, the title block and its cells, the notes
 * block, the revision table, a gear data table and the view areas. Geometry and label lists only — nothing learned.
 *
 * Works in the sheet's upright frame (orient.ts). Every line is tagged with its region and zone on the way out.
 */
import type { BBox, NoteEntry, Segment, SheetLayout, TextLine, TitleField } from './types.js';
import { centre, containsPoint, intersects, union, unionAll, area, roundBox } from './geom.js';

export interface LayoutInput { sheet: number; width: number; height: number; lines: TextLine[]; hSegs: Segment[]; vSegs: Segment[]; oSegs: Segment[] }

// ── Labels ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Title-block labels, English and German, as they are normalised by `labelNorm` (upper case, "NO" for number). */
export const TITLE_LABELS: Record<string, string[]> = {
  partNumber: ['PART NO', 'PART NO.', 'P/N', 'PN', 'ITEM NO', 'PART ID', 'TEILENUMMER', 'TEILE-NO', 'TEILE NO', 'TEIL-NO', 'TEILNUMMER', 'SACHNUMMER',
    'SACH-NO', 'SACHNO', 'ARTIKELNUMMER', 'ARTIKEL-NO', 'IDENT-NO', 'IDENTNUMMER', 'TEILE-NUMMER'],
  partName: ['TITLE', 'PART NAME', 'DESCRIPTION', 'DESIGNATION', 'PART DESCRIPTION', 'DRAWING TITLE', 'PART TITLE', 'BENENNUNG', 'BEZEICHNUNG', 'TITEL'],
  drawingNumber: ['DRAWING NO', 'DWG NO', 'DRG NO', 'DWG', 'DOCUMENT NO', 'DOC NO', 'ZEICHNUNGSNUMMER', 'ZEICHNUNGS-NO', 'ZEICHNUNGSNO', 'ZEICHN-NO',
    'ZEICHNUNG NO', 'ZEICHNUNGS NO', 'DOKUMENTNUMMER', 'DOKUMENT-NO'],
  revision: ['REV', 'REVISION', 'ISSUE', 'REV NO', 'REV LEVEL', 'CHANGE LEVEL', 'ÄNDERUNGSINDEX', 'AENDERUNGSINDEX', 'INDEX', 'ÄND', 'AUSGABE',
    'ÄNDERUNGSSTAND', 'VERSION', 'ÄND-INDEX', 'REV INDEX'],
  date: ['DATE', 'DATUM', 'DRAWN DATE', 'DATE DRAWN', 'ISSUE DATE', 'ERSTELLT AM', 'DATE OF ISSUE'],
  scale: ['SCALE', 'MASSSTAB', 'MASSTAB', 'MAßSTAB'],
  sheet: ['SHEET', 'SHT', 'SHEET NO', 'BLATT', 'BLATT NO', 'BL', 'PAGE'],
  units: ['UNITS', 'UNIT', 'DIMENSIONS IN', 'EINHEIT', 'EINHEITEN', 'MASSEINHEIT'],
  projection: ['PROJECTION', 'PROJECTION METHOD', 'PROJEKTION', 'PROJEKTIONSMETHODE'],
  company: ['COMPANY', 'OWNER', 'LEGAL OWNER', 'FIRMA', 'EIGENTÜMER'],
  material: ['MATERIAL', "MAT'L", 'MATL', 'MAT', 'MATERIAL SPEC', 'MATERIAL SPECIFICATION', 'WERKSTOFF', 'HALBZEUG', 'WERKSTOFF HALBZEUG', 'ROHTEIL',
    '材料', '材质', '材料牌号'],
  finish: ['FINISH', 'SURFACE FINISH', 'SURFACE TREATMENT', 'TREATMENT', 'COATING', 'SURFACE PROTECTION', 'PROTECTIVE FINISH', 'OBERFLÄCHE',
    'OBERFLAECHE', 'OBERFLÄCHENBEHANDLUNG', 'OBERFLÄCHENSCHUTZ', 'BESCHICHTUNG'],
  generalTolerance: ['GENERAL TOLERANCE', 'GENERAL TOLERANCES', 'TOLERANCES', 'TOLERANCE', 'TOLERANCING', 'GEN TOL', 'GENERAL TOL',
    'ALLGEMEINTOLERANZ', 'ALLGEMEINTOLERANZEN', 'FREIMASSTOLERANZ', 'FREIMASSTOLERANZEN', 'TOLERANZEN', 'ALLGEMEINTOL', 'TOLERIERUNG'],
  mass: ['MASS', 'WEIGHT', 'WT', 'MASS (KG)', 'WEIGHT (KG)', 'MASS KG', 'WEIGHT KG', 'GEWICHT', 'MASSE', 'CALC WEIGHT', 'NET WEIGHT', 'GEWICHT (KG)', 'MASSE (KG)'],
  thickness: ['THICKNESS', 'SHEET THICKNESS', 'MATERIAL THICKNESS', 'GAUGE', 'THK', 'BLECHDICKE', 'DICKE', 'MATERIALSTÄRKE', 'MATERIALDICKE', 'STÄRKE'],
  heatTreatment: ['HEAT TREATMENT', 'HEAT TREAT', 'WÄRMEBEHANDLUNG', 'WAERMEBEHANDLUNG'],
  roughness: ['SURFACE ROUGHNESS', 'ROUGHNESS', 'SURFACE TEXTURE', 'RAUHEIT', 'OBERFLÄCHENRAUHEIT', 'RAUTIEFE', 'OBERFLÄCHENGÜTE'],
  // anchors: they place the block but carry no parameter
  drawn: ['DRAWN', 'DRAWN BY', 'DRN', 'GEZEICHNET', 'GEZ', 'ERSTELLT', 'BEARB', 'BEARBEITET', 'DESIGNED', 'DESIGNED BY'],
  checked: ['CHECKED', 'CHECKED BY', 'CHK', 'CHKD', 'GEPRÜFT', 'GEPR'],
  approved: ['APPROVED', 'APPROVED BY', 'APPD', 'APPR', 'APVD', 'FREIGEGEBEN', 'FREIGABE', 'GENEHMIGT', 'NORM'],
};

/** Upper case, no dots or colons, every spelling of "number" as NO, bilingual labels kept whole. */
export function labelNorm(s: string): string {
  return s.toUpperCase().replace(/[.:#]/g, ' ').replace(/№/g, ' NO ')
    .replace(/\b(NUMBER|NUMMER|NUM|NR|NO)\b/g, 'NO').replace(/-\s*NO\b/g, '-NO').replace(/\s+/g, ' ').trim();
}

const LABEL_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [key, list] of Object.entries(TITLE_LABELS)) for (const l of list) m.set(labelNorm(l), key);
  return m;
})();

/** The field a label line names, when the whole line is a label ("Werkstoff", "DRAWING NO.", "Benennung / Title"). */
export function labelKey(text: string): string | undefined {
  const n = labelNorm(text);
  if (!n || n.length > 40) return undefined;
  const direct = LABEL_INDEX.get(n);
  if (direct) return direct;
  if (/[/|]/.test(n)) {
    for (const part of n.split(/\s*[/|]\s*/)) { const k = LABEL_INDEX.get(part.trim()); if (k) return k; }
  }
  return undefined;
}

/** "MATERIAL: EN-GJS-500-7" → { key: 'material', value: 'EN-GJS-500-7' }. Needs the colon, or `loose` inside a block. */
export function labelPrefix(text: string, loose = false): { key: string; value: string } | undefined {
  const m = /^(.{2,40}?)\s*[:=]\s*(\S.*)$/.exec(text);
  if (m) { const k = labelKey(m[1]); if (k) return { key: k, value: m[2].trim() }; }
  if (loose) {
    const words = text.split(/\s+/);
    for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
      const k = labelKey(words.slice(0, n).join(' '));
      if (k) return { key: k, value: words.slice(n).join(' ') };
    }
  }
  return undefined;
}

// ── Cells ───────────────────────────────────────────────────────────────────────────────────────────────────────

const MIN_WALL = 8;

/** The box of line work around a point: the nearest wall on each side that spans the point. */
export function cellAt(x: number, y: number, inp: { hSegs: Segment[]; vSegs: Segment[]; width: number; height: number }): { bbox: BBox; closed: boolean } {
  let left = 0, right = inp.width, top = 0, bottom = inp.height;
  let l = false, r = false, t = false, b = false;
  for (const s of inp.vSegs) {
    if (s.y1 - s.y0 < MIN_WALL || y < s.y0 - 0.8 || y > s.y1 + 0.8) continue;
    if (s.x0 <= x && (!l || s.x0 > left)) { left = s.x0; l = true; }
    if (s.x0 > x && (!r || s.x0 < right)) { right = s.x0; r = true; }
  }
  for (const s of inp.hSegs) {
    if (s.x1 - s.x0 < MIN_WALL || x < s.x0 - 0.8 || x > s.x1 + 0.8) continue;
    if (s.y0 <= y && (!t || s.y0 > top)) { top = s.y0; t = true; }
    if (s.y0 > y && (!b || s.y0 < bottom)) { bottom = s.y0; b = true; }
  }
  return { bbox: [left, top, right, bottom], closed: l && r && t && b };
}

// ── Frame and zones ─────────────────────────────────────────────────────────────────────────────────────────────

function findBorder(inp: LayoutInput): BBox | undefined {
  const { width: W, height: H } = inp;
  const longH = inp.hSegs.filter(s => s.x1 - s.x0 >= 0.6 * W);
  const longV = inp.vSegs.filter(s => s.y1 - s.y0 >= 0.6 * H);
  if (longH.length < 2 || longV.length < 2) return undefined;
  // the inner frame: the innermost long line within the outer 12 % on each side
  const pick = (vals: number[], lo: number, hi: number, inner: 'max' | 'min'): number | undefined => {
    const c = vals.filter(v => v >= lo && v <= hi);
    if (!c.length) return undefined;
    return inner === 'max' ? Math.max(...c) : Math.min(...c);
  };
  const x0 = pick(longV.map(s => s.x0), 0, 0.12 * W, 'max'), x1 = pick(longV.map(s => s.x0), 0.88 * W, W, 'min');
  const y0 = pick(longH.map(s => s.y0), 0, 0.12 * H, 'max'), y1 = pick(longH.map(s => s.y0), 0.88 * H, H, 'min');
  if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) return undefined;
  return [x0, y0, x1, y1];
}

function findZones(inp: LayoutInput, border: BBox | undefined): SheetLayout['zones'] {
  const { width: W, height: H } = inp;
  const b = border ?? [0, 0, W, H];
  const margin = (l: TextLine): 'top' | 'bottom' | 'left' | 'right' | undefined => {
    const [cx, cy] = centre(l.bbox);
    const band = Math.max(14, 2.2 * l.size);
    if (cy < b[1] + (border ? 2 : band) && cy > b[1] - 40) return 'top';
    if (cy > b[3] - (border ? 2 : band) && cy < b[3] + 40) return 'bottom';
    if (cx < b[0] + (border ? 2 : band) && cx > b[0] - 40) return 'left';
    if (cx > b[2] - (border ? 2 : band) && cx < b[2] + 40) return 'right';
    return undefined;
  };
  const nums: Array<{ label: string; c: number; side: string }> = [], lets: Array<{ label: string; c: number; side: string }> = [];
  for (const l of inp.lines) {
    const t = l.text.trim();
    const side = margin(l);
    if (!side) continue;
    const [cx, cy] = centre(l.bbox);
    if (/^\d{1,2}$/.test(t) && (side === 'top' || side === 'bottom')) nums.push({ label: t, c: cx, side });
    else if (/^[A-HJ-NPR-Z]$/.test(t) && (side === 'left' || side === 'right')) lets.push({ label: t, c: cy, side });
  }
  const one = <T extends { label: string; c: number; side: string }>(list: T[], sides: [string, string]): T[] => {
    const a = list.filter(e => e.side === sides[0]), c = list.filter(e => e.side === sides[1]);
    const best = a.length >= c.length ? a : c;
    const seen = new Set<string>();
    return best.sort((p, q) => p.c - q.c).filter(e => (seen.has(e.label) ? false : (seen.add(e.label), true)));
  };
  const cols = one(nums, ['bottom', 'top']), rows = one(lets, ['left', 'right']);
  if (cols.length < 2 || rows.length < 2) return undefined;
  // labels must be in sequence (ascending or descending) to be a grid and not stray digits
  const seq = (vals: number[]): boolean => vals.every((v, i) => i === 0 || v - vals[i - 1] === 1) || vals.every((v, i) => i === 0 || v - vals[i - 1] === -1);
  if (!seq(cols.map(c => Number(c.label))) || !seq(rows.map(r => r.label.charCodeAt(0)))) {
    // letters skip I and O on ISO sheets: allow steps of 1 or 2
    const lv = rows.map(r => r.label.charCodeAt(0));
    const loose = lv.every((v, i) => i === 0 || Math.abs(v - lv[i - 1]) <= 2) && (lv[lv.length - 1] - lv[0]) !== 0;
    if (!seq(cols.map(c => Number(c.label))) || !loose) return undefined;
  }
  const spans = (list: Array<{ label: string; c: number }>, lo: number, hi: number): Array<{ label: string; a: number; b: number }> =>
    list.map((e, i) => ({
      label: e.label,
      a: i === 0 ? lo : (list[i - 1].c + e.c) / 2,
      b: i === list.length - 1 ? hi : (e.c + list[i + 1].c) / 2,
    }));
  return {
    cols: spans(cols, b[0], b[2]).map(s => ({ label: s.label, x0: s.a, x1: s.b })),
    rows: spans(rows, b[1], b[3]).map(s => ({ label: s.label, y0: s.a, y1: s.b })),
  };
}

export function zoneOf(zones: SheetLayout['zones'], x: number, y: number): string | undefined {
  if (!zones) return undefined;
  const c = zones.cols.find(e => x >= e.x0 && x <= e.x1), r = zones.rows.find(e => y >= e.y0 && y <= e.y1);
  return c && r ? `${r.label}${c.label}` : undefined;
}

// ── Title block ─────────────────────────────────────────────────────────────────────────────────────────────────

interface Hit { line: TextLine; key: string; cell: BBox; closed: boolean; inlineValue?: string; extent?: BBox }

/** A label cell together with the cell that may hold its value: the next one on its row, and the one under it. */
function withValueCells(h: Hit, inp: LayoutInput, pageArea: number): BBox {
  if (!h.closed) return h.cell;
  let b = h.cell;
  const rc = cellAt(h.cell[2] + 2.5, (h.cell[1] + h.cell[3]) / 2, inp);
  if (rc.closed && area(rc.bbox) < 0.2 * pageArea && Math.abs(rc.bbox[1] - h.cell[1]) < 3 && Math.abs(rc.bbox[3] - h.cell[3]) < 3) b = union(b, rc.bbox);
  const bc = cellAt((h.cell[0] + h.cell[2]) / 2, h.cell[3] + 2.5, inp);
  if (bc.closed && area(bc.bbox) < 0.2 * pageArea && Math.abs(bc.bbox[0] - h.cell[0]) < 3 && Math.abs(bc.bbox[2] - h.cell[2]) < 3) b = union(b, bc.bbox);
  return b;
}

function findTitleBlock(inp: LayoutInput, exclude: BBox[]): SheetLayout['titleBlock'] {
  const pageArea = inp.width * inp.height;
  const upright = inp.lines.filter(l => l.rotation === 0 && !exclude.some(b => containsPoint(b, ...centre(l.bbox))));
  const hits: Hit[] = [];
  for (const l of upright) {
    let key = labelKey(l.text);
    let inlineValue: string | undefined;
    if (!key) { const p = labelPrefix(l.text); if (p) { key = p.key; inlineValue = p.value; } }
    if (!key) continue;
    const [cx, cy] = centre(l.bbox);
    const c = cellAt(cx, cy, inp);
    const small = c.closed && area(c.bbox) < 0.2 * pageArea;
    hits.push({ line: l, key, cell: small ? c.bbox : [l.bbox[0] - 4, l.bbox[1] - 4, l.bbox[2] + 4, l.bbox[3] + 4], closed: small, ...(inlineValue !== undefined ? { inlineValue } : {}) });
  }
  if (hits.length < 3) return undefined;
  for (const h of hits) h.extent = withValueCells(h, inp, pageArea);
  // connected groups of label cells (each with its value cell)
  const parent = hits.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
    const a = hits[i], b = hits[j];
    const near = a.closed && b.closed ? intersects(a.extent!, b.extent!, 2.5) : intersects(a.cell, b.cell, Math.max(60, 9 * Math.max(a.line.size, b.line.size)));
    if (near) parent[find(i)] = find(j);
  }
  const groups = new Map<number, Hit[]>();
  hits.forEach((h, i) => { const r = find(i); const g = groups.get(r); if (g) g.push(h); else groups.set(r, [h]); });
  let best: Hit[] | undefined; let bestScore = 0;
  for (const g of groups.values()) {
    const keys = new Set(g.map(h => h.key));
    if (keys.size < 3) continue;
    const box = unionAll(g.map(h => h.cell));
    // the block sits at an edge of the sheet, usually bottom-right: prefer that on a tie
    const score = keys.size * 10 + (box[3] > 0.7 * inp.height ? 2 : 0) + (box[2] > 0.7 * inp.width ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = g; }
  }
  if (!best) return undefined;
  let bbox = unionAll(best.map(h => h.extent ?? h.cell));
  // close the rectangle over cells that hold values but no label
  for (let pass = 0; pass < 2; pass++) {
    for (const l of upright) {
      const [cx, cy] = centre(l.bbox);
      if (!containsPoint(bbox, cx, cy, 1)) continue;
      const c = cellAt(cx, cy, inp);
      if (c.closed && area(c.bbox) < 0.2 * pageArea) bbox = union(bbox, c.bbox);
    }
  }
  if (area(bbox) > 0.45 * pageArea) return undefined;            // that is the sheet, not a title block
  const inside = upright.filter(l => containsPoint(bbox, ...centre(l.bbox), 1));
  // inside the block a label may run into its value without a colon ("SCALE 1:2")
  const blockHits: Hit[] = [];
  for (const l of inside) {
    let key = labelKey(l.text); let inlineValue: string | undefined;
    if (!key) { const p = labelPrefix(l.text, true); if (p && p.value) { key = p.key; inlineValue = p.value; } }
    if (!key) continue;
    const [cx, cy] = centre(l.bbox);
    const c = cellAt(cx, cy, inp);
    const small = c.closed && area(c.bbox) < 0.2 * pageArea;
    blockHits.push({ line: l, key, cell: small ? c.bbox : l.bbox, closed: small, ...(inlineValue !== undefined ? { inlineValue } : {}) });
  }
  const isLabel = new Set(blockHits.map(h => h.line.id));
  const linesIn = (cell: BBox): TextLine[] => inside.filter(l => !isLabel.has(l.id) && containsPoint(cell, ...centre(l.bbox), 0.5))
    .sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  const fields: Record<string, TitleField> = {};
  const set = (h: Hit, value: string, lines: TextLine[], vb: BBox): void => {
    const v = value.replace(/\s+/g, ' ').trim();
    if (!v || fields[h.key]) return;
    fields[h.key] = { label: h.line.text, value: v, bbox: roundBox(vb), lineIds: lines.map(l => l.id), labelLineId: h.line.id };
  };
  for (const h of blockHits.sort((a, b) => a.line.bbox[1] - b.line.bbox[1] || a.line.bbox[0] - b.line.bbox[0])) {
    if (fields[h.key]) continue;
    if (h.inlineValue) { set(h, h.inlineValue, [h.line], h.line.bbox); continue; }
    if (h.closed) {
      const labelsInCell = blockHits.filter(o => containsPoint(h.cell, ...centre(o.line.bbox), 0.5)).length;
      if (labelsInCell === 1) {
        const same = linesIn(h.cell);
        if (same.length) { set(h, same.map(l => l.text).join(' '), same, unionAll(same.map(l => l.bbox))); continue; }
        // the value cell to the right, on the same row
        const rc = cellAt(h.cell[2] + 2.5, (h.cell[1] + h.cell[3]) / 2, inp);
        if (rc.closed && Math.abs(rc.bbox[1] - h.cell[1]) < 3 && Math.abs(rc.bbox[3] - h.cell[3]) < 3 && rc.bbox[0] >= h.cell[2] - 1) {
          const right = linesIn(rc.bbox);
          const labelThere = blockHits.some(o => containsPoint(rc.bbox, ...centre(o.line.bbox), 0.5));
          if (right.length && !labelThere) { set(h, right.map(l => l.text).join(' '), right, unionAll(right.map(l => l.bbox))); continue; }
        }
        // the value cell below, in the same column
        const bc = cellAt((h.cell[0] + h.cell[2]) / 2, h.cell[3] + 2.5, inp);
        if (bc.closed && Math.abs(bc.bbox[0] - h.cell[0]) < 3 && Math.abs(bc.bbox[2] - h.cell[2]) < 3 && bc.bbox[1] >= h.cell[3] - 1) {
          const below = linesIn(bc.bbox);
          const labelThere = blockHits.some(o => containsPoint(bc.bbox, ...centre(o.line.bbox), 0.5));
          if (below.length && !labelThere) { set(h, below.map(l => l.text).join(' '), below, unionAll(below.map(l => l.bbox))); continue; }
        }
        continue;
      }
    }
    // no usable cell: the nearest value to the right on the label's baseline, else just below it
    const s = h.line.size;
    const right = inside.filter(l => !isLabel.has(l.id) && Math.abs(l.v - h.line.v) < 0.6 * Math.max(s, l.size) && l.bbox[0] >= h.line.bbox[2] - 1 && l.bbox[0] - h.line.bbox[2] < 14 * s)
      .sort((a, b) => a.bbox[0] - b.bbox[0])[0];
    const blockedRight = right && blockHits.some(o => o.line.id !== h.line.id && Math.abs(o.line.v - h.line.v) < 0.6 * s && o.line.bbox[0] > h.line.bbox[2] && o.line.bbox[0] < right.bbox[0]);
    if (right && !blockedRight) { set(h, right.text, [right], right.bbox); continue; }
    const below = inside.filter(l => !isLabel.has(l.id) && l.bbox[1] >= h.line.bbox[3] - 0.4 * s && l.bbox[1] - h.line.bbox[3] < 2.6 * Math.max(s, l.size)
      && l.bbox[0] < h.line.bbox[2] + 2 * s && l.bbox[2] > h.line.bbox[0] - 2 * s)
      .sort((a, b) => a.bbox[1] - b.bbox[1] || Math.abs(a.bbox[0] - h.line.bbox[0]) - Math.abs(b.bbox[0] - h.line.bbox[0]))[0];
    if (below) set(h, below.text, [below], below.bbox);
  }
  return { bbox: roundBox(bbox), fields };
}

// ── Notes ───────────────────────────────────────────────────────────────────────────────────────────────────────

const NOTES_HEADING = /^(?:(?:GENERAL|ALLGEMEINE|DRAWING|MANUFACTURING)\s+)?(?:NOTES?|ANMERKUNG(?:EN)?|HINWEISE?|BEMERKUNG(?:EN)?|NOTAS?|REMARQUES?|TECHNISCHE\s+ANFORDERUNGEN|TECHNICAL\s+REQUIREMENTS)\b\s*(?:\(.{0,40}\))?\s*[:.]?\s*$/i;
const NOTE_START = /^\(?(\d{1,2})[.):]\s*(\S.*)?$/;
const NOTE_START_LOOSE = /^(\d{1,2})\s+(\S.*)$/;

interface Row { v: number; x0: number; x1: number; size: number; lines: TextLine[]; text: string }

function rowsOf(lines: TextLine[]): Row[] {
  const sorted = [...lines].sort((a, b) => a.v - b.v || a.bbox[0] - b.bbox[0]);
  const rows: Row[] = [];
  for (const l of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(l.v - last.v) <= 0.45 * Math.min(l.size, last.size)) { last.lines.push(l); last.x1 = Math.max(last.x1, l.bbox[2]); last.x0 = Math.min(last.x0, l.bbox[0]); }
    else rows.push({ v: l.v, x0: l.bbox[0], x1: l.bbox[2], size: l.size, lines: [l], text: '' });
  }
  for (const r of rows) { r.lines.sort((a, b) => a.bbox[0] - b.bbox[0]); r.text = r.lines.map(l => l.text).join(' ').replace(/\s+/g, ' ').trim(); }
  return rows;
}

function parseNoteRows(rows: Row[], sheet: number): NoteEntry[] {
  const entries: Array<NoteEntry & { numX: number }> = [];
  if (!rows.length) return [];
  const numbered = rows.some(r => NOTE_START.test(r.text));
  let prevNo: number | undefined;
  let unnum = 0;
  let prevV: number | undefined;
  for (const r of rows) {
    const m = NOTE_START.exec(r.text) ?? NOTE_START_LOOSE.exec(r.text);
    const cur = entries[entries.length - 1];
    let isNew = false, no = '', body = r.text;
    if (m) {
      const n = Number(m[1]);
      const strict = NOTE_START.test(r.text);
      const aligned = !cur || r.x0 <= cur.numX + 0.8 * r.size;
      const inSeq = prevNo === undefined ? (strict ? n <= 20 : n === 1) : (n > prevNo && n <= prevNo + 2);
      if (aligned && inSeq) { isNew = true; no = String(n); body = (m[2] ?? '').trim(); prevNo = n; }
    }
    if (!isNew && !cur) { isNew = true; no = `-${++unnum}`; }
    else if (!isNew && cur && !numbered && prevV !== undefined && r.v - prevV > 1.75 * r.size) { isNew = true; no = `-${++unnum}`; }
    if (isNew) entries.push({ no, text: body, bbox: unionAll(r.lines.map(l => l.bbox)), lineIds: r.lines.map(l => l.id), sheet, numX: r.x0 });
    else if (cur) {
      cur.text = `${cur.text} ${r.text}`.replace(/\s+/g, ' ').trim();
      cur.bbox = union(cur.bbox, unionAll(r.lines.map(l => l.bbox)));
      cur.lineIds.push(...r.lines.map(l => l.id));
    }
    prevV = r.v;
  }
  return entries.filter(e => e.text).map(({ numX: _numX, ...e }) => ({ ...e, bbox: roundBox(e.bbox) }));
}

function findNotes(inp: LayoutInput, exclude: BBox[], border: BBox | undefined): SheetLayout['notes'] {
  const upright = inp.lines.filter(l => l.rotation === 0 && !exclude.some(b => containsPoint(b, ...centre(l.bbox)))
    && (!border || containsPoint(border, ...centre(l.bbox))));
  const out: SheetLayout['notes'] = [];
  const used = new Set<number>();
  const collect = (start: TextLine, includeStart: boolean): { rows: Row[]; lines: TextLine[] } => {
    const s = start.size;
    const x0 = start.bbox[0] - 2.5 * s;
    // lines that begin in the block's left band
    const band = upright.filter(l => !used.has(l.id) && l.bbox[1] >= start.bbox[1] - 0.5 * s && l.bbox[0] >= x0 && l.bbox[0] <= start.bbox[0] + 14 * s
      && l.size <= 1.6 * s && l.size >= 0.55 * s && (includeStart || l.id !== start.id));
    const leftRows = rowsOf(band);
    const kept: Row[] = [];
    let lastV = includeStart ? start.v - 0.01 : start.v;
    let lastSize = s;
    for (const r of leftRows) {
      if (r.v - lastV > 3.3 * Math.max(lastSize, r.size)) break;
      kept.push(r); lastV = r.v; lastSize = r.size;
    }
    if (!kept.length) return { rows: [], lines: [] };
    // the block's right edge: as far as its own lines reach
    const xr = Math.max(...kept.map(r => r.x1));
    const vTop = kept[0].v - 1.2 * s, vBot = kept[kept.length - 1].v + 0.5 * s;
    const all = upright.filter(l => !used.has(l.id) && (includeStart || l.id !== start.id) && l.v >= vTop && l.v <= vBot && l.bbox[0] >= x0 && l.bbox[0] <= xr + 2 * s && l.size <= 1.6 * s && l.size >= 0.5 * s);
    return { rows: rowsOf(all), lines: all };
  };
  for (const l of upright) {
    if (used.has(l.id) || !NOTES_HEADING.test(l.text.trim())) continue;
    const { rows, lines } = collect(l, false);
    const entries = parseNoteRows(rows, inp.sheet);
    if (!entries.length) continue;
    used.add(l.id); lines.forEach(x => used.add(x.id));
    out.push({ bbox: roundBox(unionAll([l.bbox, ...lines.map(x => x.bbox)])), heading: l.text.trim(), entries });
  }
  // "NOTE: …" on one line
  for (const l of upright) {
    if (used.has(l.id)) continue;
    const m = /^(?:NOTE|HINWEIS|ANMERKUNG)\s*:\s*(\S.+)$/i.exec(l.text.trim());
    if (!m) continue;
    used.add(l.id);
    out.push({ bbox: roundBox(l.bbox), heading: undefined, entries: [{ no: '-1', text: m[1].trim(), bbox: roundBox(l.bbox), lineIds: [l.id], sheet: inp.sheet }] });
  }
  // a numbered list with no heading: 1. 2. 3. in one column
  const starts = upright.filter(l => !used.has(l.id) && /^\(?1[.)]\s*\S?/.test(l.text.trim()));
  for (const st of starts) {
    if (used.has(st.id)) continue;
    const { rows, lines } = collect(st, true);
    const entries = parseNoteRows(rows, inp.sheet);
    if (entries.filter(e => /^\d+$/.test(e.no)).length < 3) continue;
    lines.forEach(x => used.add(x.id));
    out.push({ bbox: roundBox(unionAll(lines.map(x => x.bbox))), heading: undefined, entries });
  }
  return out;
}

// ── Revision table ──────────────────────────────────────────────────────────────────────────────────────────────

const REV_HEADERS = /^(REV(?:ISION)?S?\.?|ISSUE|INDEX|ÄND(?:ERUNG)?\.?|DESCRIPTION|DESCRIPTION OF CHANGE|CHANGE|ÄNDERUNG(?:EN)?|BESCHREIBUNG|DATE|DATUM|BY|NAME|APPROVED|APPD\.?|ECN|ECO|ECR|ZONE|CHK\.?|CHECKED)$/i;

function findRevisionTable(inp: LayoutInput): SheetLayout['revisionTable'] {
  const upright = inp.lines.filter(l => l.rotation === 0);
  const rows = rowsOf(upright);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const heads = r.lines.filter(l => REV_HEADERS.test(l.text.trim()));
    const kinds = new Set(heads.map(h => h.text.trim().toUpperCase().replace(/\.$/, '')));
    const hasRev = [...kinds].some(k => /^(REV|REVISION|REVISIONS|ISSUE|INDEX|ÄND|ÄNDERUNG)$/.test(k));
    const hasDesc = [...kinds].some(k => /^(DESCRIPTION|DESCRIPTION OF CHANGE|CHANGE|ÄNDERUNG|ÄNDERUNGEN|BESCHREIBUNG)$/.test(k));
    if (heads.length < 3 || !hasRev || !hasDesc) continue;
    const x0 = Math.min(...heads.map(h => h.bbox[0])) - 6, x1 = Math.max(...heads.map(h => h.bbox[2])) + 40;
    const body: Row[] = [];
    const walk = (dir: 1 | -1): Row[] => {
      const got: Row[] = []; let lastV = r.v;
      for (let j = i + dir; j >= 0 && j < rows.length; j += dir) {
        const c = rows[j];
        if (Math.abs(c.v - lastV) > 2.8 * Math.max(r.size, c.size)) break;
        const inX = c.lines.filter(l => l.bbox[0] >= x0 && l.bbox[2] <= x1 + 60);
        if (!inX.length) continue;                              // a row elsewhere on the sheet at this height
        got.push({ ...c, lines: inX }); lastV = c.v;
      }
      return got;
    };
    const down = walk(1), up = walk(-1);
    body.push(...(down.length >= up.length ? down : up));
    const all = [...heads, ...body.flatMap(b => b.lines)];
    return { bbox: roundBox(unionAll(all.map(l => l.bbox))), rows: body.map(b => b.lines.map(l => l.text)) };
  }
  return undefined;
}

// ── Gear data table ─────────────────────────────────────────────────────────────────────────────────────────────

export const GEAR_LABELS: Array<{ key: string; re: RegExp }> = [
  { key: 'teeth', re: /^(NUMBER OF TEETH|NO\.? OF TEETH|TEETH|TOOTH COUNT|ZÄHNEZAHL|ZAEHNEZAHL)\b/i },
  { key: 'module', re: /^(NORMAL MODULE|MODULE|NORMALMODUL|MODUL)\b/i },
  { key: 'pressureAngle', re: /^(NORMAL PRESSURE ANGLE|PRESSURE ANGLE|EINGRIFFSWINKEL|NORMALEINGRIFFSWINKEL)\b/i },
  { key: 'helixAngle', re: /^(HELIX ANGLE|SCHRÄGUNGSWINKEL|SCHRAEGUNGSWINKEL)\b/i },
  { key: 'helixHand', re: /^(HAND OF HELIX|HELIX HAND|HAND|FLANKENRICHTUNG|STEIGUNGSRICHTUNG)\b/i },
  { key: 'faceWidth', re: /^(FACE WIDTH|ZAHNBREITE)\b/i },
  { key: 'qualityClass', re: /^(GEAR QUALITY|QUALITY CLASS|QUALITY GRADE|ACCURACY GRADE|ACCURACY CLASS|TOLERANCE CLASS|QUALITY|VERZAHNUNGSQUALITÄT|QUALITÄT)\b/i },
  { key: 'profileShift', re: /^(PROFILE SHIFT COEFFICIENT|PROFILE SHIFT|ADDENDUM MODIFICATION COEFFICIENT|ADDENDUM MODIFICATION|PROFILVERSCHIEBUNGSFAKTOR|PROFILVERSCHIEBUNG)\b/i },
];

function findGearTable(inp: LayoutInput, exclude: BBox[]): SheetLayout['tables'] {
  const upright = inp.lines.filter(l => l.rotation === 0 && !exclude.some(b => containsPoint(b, ...centre(l.bbox))));
  const hits = upright.map(l => ({ l, g: GEAR_LABELS.find(g => g.re.test(l.text.trim())) })).filter((h): h is { l: TextLine; g: { key: string; re: RegExp } } => !!h.g);
  if (new Set(hits.map(h => h.g.key)).size < 3) return [];
  // keep hits that sit in one column block
  const xs = hits.map(h => h.l.bbox[0]).sort((a, b) => a - b);
  const med = xs[Math.floor(xs.length / 2)];
  const col = hits.filter(h => Math.abs(h.l.bbox[0] - med) < 12 * h.l.size);
  if (new Set(col.map(h => h.g.key)).size < 3) return [];
  const rows: SheetLayout['tables'][number]['rows'] = [];
  for (const h of col.sort((a, b) => a.l.v - b.l.v)) {
    const s = h.l.size;
    // the value is on the label's own line ("MODULE 2.5") or further right on its baseline
    const m = h.g.re.exec(h.l.text.trim());
    const rest = h.l.text.trim().slice(m ? m[0].length : 0).replace(/^[\s:=]+/, '');
    const right = upright.filter(l => l.id !== h.l.id && Math.abs(l.v - h.l.v) <= 0.5 * Math.max(s, l.size) && l.bbox[0] >= h.l.bbox[2] - 1 && l.bbox[0] - h.l.bbox[2] < 40 * s)
      .sort((a, b) => a.bbox[0] - b.bbox[0]);
    const value = [rest, ...right.map(l => l.text)].filter(Boolean).join(' ').trim();
    if (!value) continue;
    rows.push({ label: h.g.key, value, lineIds: [h.l.id, ...right.map(l => l.id)], bbox: roundBox(unionAll([h.l.bbox, ...right.map(l => l.bbox)])) });
  }
  if (rows.length < 3) return [];
  return [{ kind: 'gear', bbox: roundBox(unionAll(rows.map(r => r.bbox))), rows }];
}

// ── View areas ──────────────────────────────────────────────────────────────────────────────────────────────────

function findViewAreas(inp: LayoutInput, exclude: BBox[], border: BBox | undefined): BBox[] {
  const cell = 24;
  const cols = Math.ceil(inp.width / cell) + 1, rows = Math.ceil(inp.height / cell) + 1;
  const grid = new Uint8Array(cols * rows);
  const frame = border ?? [0, 0, inp.width, inp.height];
  const mark = (s: Segment): void => {
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    // the frame's own lines are not a view
    if (len > 0.55 * Math.min(inp.width, inp.height) && (Math.abs(s.x0 - s.x1) < 1 || Math.abs(s.y0 - s.y1) < 1)) return;
    const n = Math.max(1, Math.ceil(len / 12));
    for (let i = 0; i <= n; i++) {
      const x = s.x0 + (s.x1 - s.x0) * i / n, y = s.y0 + (s.y1 - s.y0) * i / n;
      if (!containsPoint(frame, x, y) || exclude.some(b => containsPoint(b, x, y, 2))) continue;
      grid[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1;
    }
  };
  inp.hSegs.forEach(mark); inp.vSegs.forEach(mark); inp.oSegs.forEach(mark);
  const seen = new Uint8Array(grid.length);
  const out: BBox[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1;
    let n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    while (stack.length) {
      const k = stack.pop()!; n++;
      const cx = k % cols, cy = Math.floor(k / cols);
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (grid[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n >= 10) out.push([x0 * cell, y0 * cell, Math.min(inp.width, (x1 + 1) * cell), Math.min(inp.height, (y1 + 1) * cell)]);
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, 40).map(roundBox);
}

// ── Whole sheet ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Read the layout of one sheet and tag each line with its region, zone and note number. */
export function analyseLayout(inp: LayoutInput): SheetLayout {
  const border = findBorder(inp);
  const zones = findZones(inp, border);
  const revisionTable = findRevisionTable(inp);
  const titleBlock = findTitleBlock(inp, revisionTable ? [revisionTable.bbox] : []);
  const taken: BBox[] = [...(titleBlock ? [titleBlock.bbox] : []), ...(revisionTable ? [revisionTable.bbox] : [])];
  const tables = findGearTable(inp, taken);
  const notes = findNotes(inp, [...taken, ...tables.map(t => t.bbox)], border);
  const blocks = [...taken, ...tables.map(t => t.bbox), ...notes.map(n => n.bbox)];
  const viewAreas = findViewAreas(inp, blocks, border);

  const noteOf = new Map<number, string>();
  for (const n of notes) for (const e of n.entries) for (const id of e.lineIds) noteOf.set(id, e.no);
  const noteLineIds = new Set<number>(noteOf.keys());
  for (const l of inp.lines) {
    const [cx, cy] = centre(l.bbox);
    if (titleBlock && containsPoint(titleBlock.bbox, cx, cy, 1)) l.region = 'title-block';
    else if (noteLineIds.has(l.id) || notes.some(n => containsPoint(n.bbox, cx, cy, 0.5) && l.rotation === 0)) l.region = 'notes';
    else if (revisionTable && containsPoint(revisionTable.bbox, cx, cy, 1)) l.region = 'revision-table';
    else if (tables.some(t => containsPoint(t.bbox, cx, cy, 1))) l.region = 'table';
    else if (border && !containsPoint(border, cx, cy)) l.region = 'other';
    else if (viewAreas.some(v => containsPoint(v, cx, cy, 36))) l.region = 'view';
    else l.region = 'other';
    const z = zoneOf(zones, cx, cy);
    if (z) l.zone = z;
    const no = noteOf.get(l.id);
    if (no) l.noteNo = no;
  }
  return {
    sheet: inp.sheet,
    ...(border ? { border: roundBox(border) } : {}),
    ...(zones ? { zones } : {}),
    ...(titleBlock ? { titleBlock } : {}),
    notes,
    ...(revisionTable ? { revisionTable } : {}),
    tables,
    viewAreas,
  };
}
