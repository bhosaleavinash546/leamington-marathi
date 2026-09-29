/**
 * Fab data as ground truth — Excellon drill and Gerber files, measured, no AI.
 *
 * A photo cannot show a board's layer count, its via count or its exact size;
 * the model guessed all three and the guess drove the bare-board cost (the
 * radar run: 220 vias guessed against ~1,000 drilled). The fab data package
 * states them. This reads what it can, deterministically, and the route
 * overrides the model's guess with it — as CAD geometry overrides the AI for
 * machined parts.
 *
 *  - Excellon (.drl/.txt/.xln/.exc, KiCad, Altium, Eagle): hole table + counts.
 *    Holes ≤ VIA_MAX_MM are vias; larger ones are component / mounting holes.
 *    A drill file whose name spans an inner layer pair is blind/buried.
 *  - Gerber outline (.gko/.gm1/.gml/-Edge_Cuts/outline/profile): board extents.
 *    Any copper layer serves as a fallback for extents.
 *  - Copper-layer file names give the layer count.
 */

export interface FabFile { name: string; text: string }

export interface HoleRow { diaMm: number; count: number }

export interface FabMeasurement {
  widthMm: number | null;
  heightMm: number | null;
  layers: number | null;
  throughVias: number | null;
  blindVias: number;
  /** Component / mounting holes (> VIA_MAX_MM). */
  throughHoles: number;
  holeTable: HoleRow[];
  filesUsed: string[];
  notes: string[];
}

export const VIA_MAX_MM = 0.6;

const r1 = (n: number) => Math.round(n * 10) / 10;

// ── Excellon ────────────────────────────────────────────────────────────────
export function isExcellon(name: string, text: string): boolean {
  return /\.(drl|xln|exc|drd|ncd|tap)$/i.test(name) || /^M48\b/m.test(text) && /^T\d+C/m.test(text);
}

export interface ExcellonResult { holes: HoleRow[]; total: number }

export function parseExcellon(text: string): ExcellonResult {
  const lines = text.split(/\r?\n/);
  let metric = /^(METRIC|M71)\b/m.test(text) && !/^(INCH|M72)\b/m.test(text);
  if (!/^(METRIC|M71|INCH|M72)\b/m.test(text)) metric = true; // KiCad/Altium default to mm today
  const tools = new Map<string, number>();
  const counts = new Map<string, number>();
  let cur = '';
  let inHeader = true;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith(';')) continue;
    if (/^(%|M95)$/.test(l)) { inHeader = false; continue; }
    const def = /^T(\d+)(?:[FSZHB]\d+)*C([\d.]+)/i.exec(l);
    if (def && inHeader) {
      const d = parseFloat(def[2]);
      tools.set(def[1].replace(/^0+/, '') || '0', metric ? d : d * 25.4);
      continue;
    }
    const sel = /^T(\d+)$/i.exec(l);
    if (sel) { cur = sel[1].replace(/^0+/, '') || '0'; continue; }
    if (!cur) continue;
    // A hit is an X/Y coordinate; a G85 slot is one routed feature.
    if (/^(X-?[\d.]+)?(Y-?[\d.]+)?(G85.*)?$/i.test(l) && /[XY]/i.test(l)) counts.set(cur, (counts.get(cur) ?? 0) + 1);
  }
  const holes: HoleRow[] = [];
  let total = 0;
  for (const [t, c] of counts) {
    const dia = tools.get(t);
    if (dia == null) continue;
    holes.push({ diaMm: Math.round(dia * 1000) / 1000, count: c });
    total += c;
  }
  holes.sort((a, b) => a.diaMm - b.diaMm);
  return { holes, total };
}

// ── Gerber (RS-274X) extents ────────────────────────────────────────────────
export interface GerberExtents { widthMm: number; heightMm: number }

export function parseGerberExtents(text: string): GerberExtents | null {
  const fs = /%FS[LT]?[AI]X(\d)(\d)Y(\d)(\d)\*%/.exec(text);
  if (!fs) return null;
  const xDec = Number(fs[2]), yDec = Number(fs[4]);
  const inch = /%MOIN\*%/.test(text);
  const scale = inch ? 25.4 : 1;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let lastX = 0, lastY = 0;
  const re = /(?:X(-?\d+))?(?:Y(-?\d+))?(?:I-?\d+)?(?:J-?\d+)?D0?([123])\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] != null) lastX = Number(m[1]) / 10 ** xDec;
    if (m[2] != null) lastY = Number(m[2]) / 10 ** yDec;
    if (m[3] === '3' && m[1] == null && m[2] == null) continue;
    if (lastX < minX) minX = lastX; if (lastX > maxX) maxX = lastX;
    if (lastY < minY) minY = lastY; if (lastY > maxY) maxY = lastY;
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return null;
  return { widthMm: r1((maxX - minX) * scale), heightMm: r1((maxY - minY) * scale) };
}

// ── File roles from names ───────────────────────────────────────────────────
export function isOutlineFile(name: string): boolean {
  return /\.(gko|gm1|gml|gm2|gbo\b)$/i.test(name) && !/\.gbo$/i.test(name)
    || /edge[_-]?cuts|outline|profile|board[_-]?outline|\.gko$|\.gm1$/i.test(name);
}

export function isCopperFile(name: string): boolean {
  return /\.(gtl|gbl|g[1-9]\d?|gp[1-9]\d?|cmp|sol|top|bot|ly[1-9]\d?)$/i.test(name)
    || /(F|B|In\d+)[_-]?Cu\.(gbr|gbx|art)$/i.test(name)
    || /(top|bottom|inner\d*)[_-]?(copper|layer)/i.test(name);
}

/** A drill file spanning an inner layer pair ("L2-L3", "2-3", "blind", "buried"). */
export function isBlindOrBuriedDrill(name: string): boolean {
  if (/blind|buried|micro|uvia/i.test(name)) return true;
  const m = /L?(\d+)[-_]L?(\d+)/i.exec(name.replace(/\.[^.]+$/, ''));
  return !!m && !(Number(m[1]) === 1 && Number(m[2]) >= 2 && /PTH|plated/i.test(name) === false && Number(m[2]) <= 1);
}

// ── Whole-package measurement ───────────────────────────────────────────────
export function measureFabData(files: FabFile[]): FabMeasurement {
  const out: FabMeasurement = { widthMm: null, heightMm: null, layers: null, throughVias: null, blindVias: 0, throughHoles: 0, holeTable: [], filesUsed: [], notes: [] };
  let copper = 0;
  let anyDrill = false;
  let sawThroughDrill = false;
  const copperExtents: GerberExtents[] = [];
  for (const f of files) {
    const name = f.name.split(/[\\/]/).pop() ?? f.name;
    if (isExcellon(name, f.text)) {
      const d = parseExcellon(f.text);
      if (d.total === 0) { out.notes.push(`${name}: no holes read`); continue; }
      anyDrill = true;
      out.filesUsed.push(name);
      const blind = isBlindOrBuriedDrill(name);
      for (const h of d.holes) {
        if (blind) out.blindVias += h.count;
        else if (h.diaMm <= VIA_MAX_MM) out.throughVias = (out.throughVias ?? 0) + h.count;
        else out.throughHoles += h.count;
        if (!blind) {
          const row = out.holeTable.find(r => r.diaMm === h.diaMm);
          if (row) row.count += h.count; else out.holeTable.push({ ...h });
        }
      }
      if (!blind) sawThroughDrill = true;
      continue;
    }
    if (isOutlineFile(name)) {
      const e = parseGerberExtents(f.text);
      if (e) { out.widthMm = e.widthMm; out.heightMm = e.heightMm; out.filesUsed.push(name); }
      else out.notes.push(`${name}: outline extents not read`);
      continue;
    }
    if (isCopperFile(name)) {
      copper++;
      out.filesUsed.push(name);
      const e = parseGerberExtents(f.text);
      if (e) copperExtents.push(e);
    }
  }
  if (anyDrill && sawThroughDrill && out.throughVias == null) out.throughVias = 0;
  if (out.widthMm == null && copperExtents.length) {
    const e = copperExtents.reduce((a, b) => (a.widthMm * a.heightMm >= b.widthMm * b.heightMm ? a : b));
    out.widthMm = e.widthMm; out.heightMm = e.heightMm;
    out.notes.push('board size taken from copper extents (no outline layer) — may include a frame or fiducials');
  }
  if (copper >= 1) out.layers = Math.max(copper, copper === 1 ? 1 : 2);
  out.holeTable.sort((a, b) => a.diaMm - b.diaMm);
  return out;
}

/** Apply a measurement to a board spec IN PLACE; returns what changed, for the warnings list. */
export function applyFabMeasurement(spec: Record<string, unknown>, m: FabMeasurement): string[] {
  const changed: string[] = [];
  if (m.widthMm && m.heightMm) {
    changed.push(`size ${m.widthMm} × ${m.heightMm} mm (was ${spec.widthMm} × ${spec.heightMm})`);
    spec.widthMm = m.widthMm; spec.heightMm = m.heightMm; spec.dimensionsSource = 'measured';
  }
  if (m.layers != null && m.layers >= 2) {
    changed.push(`${m.layers} copper layers (was ${spec.estimatedLayers})`);
    spec.estimatedLayers = m.layers; spec.layersSource = 'measured';
  }
  if (m.throughVias != null) {
    changed.push(`${m.throughVias} through vias ≤ ${VIA_MAX_MM} mm (was ${spec.throughVias}), ${m.throughHoles} larger holes`);
    spec.throughVias = m.throughVias; spec.viasSource = 'measured';
    if (m.blindVias > 0) { spec.blindVias = m.blindVias; changed.push(`${m.blindVias} blind/buried vias`); }
  }
  return changed;
}
