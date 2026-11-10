/**
 * Dimensions and their tolerances from the text beside the views: linear, Ø, R, angles, chamfers, counts
 * ("4x Ø8.5 THRU"), symmetric ±, bilateral +/− (written inline, or stacked as two small strings — re-assembled by
 * position), limits, ISO 286 fits (limits computed from data/iso286.ts), reference "( )" and boxed basic dimensions.
 *
 * What a dimension applies to is NOT decided here: a value is a value with its place on the sheet.
 */
import type { DraftParameter, ExtractContext, SheetData, TextLine } from '../types.js';
import { centre } from '../geom.js';
import { cellAt } from '../layout.js';
import { fitLimits, FIT_LETTERS } from '../data/iso286.js';
import { draft, normText, num, unitOfLines } from './common.js';
import { findThreads } from './threads.js';

const N = String.raw`(?:\d+(?:[.,]\d+)?|[.,]\d+)`;
const FIT = String.raw`(${FIT_LETTERS.filter(l => l === l.toLowerCase()).sort((a, b) => b.length - a.length).join('|')}|${FIT_LETTERS.filter(l => l !== l.toLowerCase()).sort((a, b) => b.length - a.length).join('|')}|[a-zA-Z]{1,2})(\d{1,2})`;

export interface DimensionRead {
  type: 'linear' | 'diameter' | 'radius' | 'angle' | 'chamfer';
  nominal: number;
  upper?: number; lower?: number;
  max?: number; min?: number;
  fit?: string;
  count?: number;
  reference?: boolean; basic?: boolean; spherical?: boolean;
  through?: boolean; depth?: number;
  chamferAngle?: number;
  holeEvidence?: string;
  note?: string;
  fitBasis?: string;
}

/** The tolerance written straight after a nominal value. Returns what it read and how much text it used. */
function inlineTolerance(rest: string): { read: Partial<DimensionRead>; used: number; fit?: { letter: string; grade: number; mate?: string } } {
  let m = new RegExp(String.raw`^\s?±\s?(${N})`).exec(rest);
  if (m) { const t = num(m[1]); return { read: { upper: t, lower: -t }, used: m[0].length }; }
  m = new RegExp(String.raw`^\s?\+\s?(${N})\s?[/\s]\s?-\s?(${N})`).exec(rest);
  if (m) return { read: { upper: num(m[1]), lower: -num(m[2]) }, used: m[0].length };
  m = new RegExp(String.raw`^\s?-\s?(${N})\s?[/\s]\s?\+\s?(${N})`).exec(rest);
  if (m) return { read: { upper: num(m[2]), lower: -num(m[1]) }, used: m[0].length };
  m = new RegExp(String.raw`^\s?\+\s?(${N})\s?[/\s]\s?\+\s?(${N})`).exec(rest);
  if (m) return { read: { upper: Math.max(num(m[1]), num(m[2])), lower: Math.min(num(m[1]), num(m[2])) }, used: m[0].length };
  m = new RegExp(String.raw`^\s?-\s?(${N})\s?[/\s]\s?-\s?(${N})`).exec(rest);
  if (m) return { read: { upper: -Math.min(num(m[1]), num(m[2])), lower: -Math.max(num(m[1]), num(m[2])) }, used: m[0].length };
  m = new RegExp(String.raw`^\s?${FIT}(?:\s?/\s?([a-z]{1,2}\d{1,2}))?(?![A-Za-z0-9])`).exec(rest);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 18) return { read: {}, used: m[0].length, fit: { letter: m[1], grade: Number(m[2]), ...(m[3] ? { mate: m[3] } : {}) } };
  return { read: {}, used: 0 };
}

function holeTail(rest: string): Partial<DimensionRead> {
  const out: Partial<DimensionRead> = {};
  if (/\b(?:THRU|THROUGH|DURCHGEHEND|DURCHGANG|DURCH)\b/i.test(rest)) { out.through = true; out.holeEvidence = 'THRU'; }
  const d = new RegExp(String.raw`(?:↧|\bDEEP|\bDP\.?|\bDEPTH|\bTIEFE?)\s?(${N})|(${N})\s?(?:mm\s?)?(?:DEEP|DP\b|TIEF)`, 'i').exec(rest);
  if (d) { out.depth = num(d[1] ?? d[2]); out.holeEvidence = 'depth'; }
  if (/\b(?:HOLES?|BOHRUNG(?:EN)?|DRILL|BORE|C'?BORE|REAM|GEBOHRT|GERIEBEN)\b/i.test(rest)) out.holeEvidence = out.holeEvidence ?? 'hole wording';
  if (/[⌴⌵]/.test(rest)) out.holeEvidence = out.holeEvidence ?? 'counterbore / countersink symbol';
  return out;
}

/** Read one line of text as a dimension, or undefined. `whole` = the line must be nothing but the dimension. */
export function parseDimension(textIn: string): { read: DimensionRead; fit?: { letter: string; grade: number; mate?: string } } | undefined {
  let t = textIn.trim();
  if (!t || t.length > 60) return undefined;
  // a date or a part / drawing number is not a dimension
  if (/^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/.test(t) || /^\d+(?:[-/ ]\d+){2,}$/.test(t)) return undefined;
  let reference = false;
  const paren = /^\((.+)\)$/.exec(t);
  if (paren) { reference = true; t = paren[1].trim(); }
  let count: number | undefined;
  // "2 x 45°" is a chamfer, not two of something
  const ch = new RegExp(String.raw`^(${N})\s?[xX]\s?(${N})\s?°$`).exec(t);
  if (ch) return { read: { type: 'chamfer', nominal: num(ch[1]), chamferAngle: num(ch[2]), ...(reference ? { reference: true } : {}) } };
  let m = /^(\d{1,3})\s?[xX]\s+(?=\S)|^(\d{1,3})\s?[xX](?=[ØRSM(]|\s)|^(\d{1,3})\s?(?:HOLES|PLACES|PLCS\.?|PL\.?)\s+/i.exec(t);
  if (m) { count = Number(m[1] ?? m[2] ?? m[3]); t = t.slice(m[0].length).trim(); }
  const base: Partial<DimensionRead> = { ...(count ? { count } : {}), ...(reference ? { reference: true } : {}) };
  const finish = (type: DimensionRead['type'], nominal: number, rest: string, extra: Partial<DimensionRead> = {}): { read: DimensionRead; fit?: { letter: string; grade: number; mate?: string } } | undefined => {
    if (!(nominal >= 0) || !Number.isFinite(nominal)) return undefined;
    // "1:2" is a scale and "1/2" a sheet or a fraction, not a dimension
    if (/^\s?:/.test(rest) || /^\s?\/\s?\d+\s*$/.test(rest) && !/[.,]/.test(rest)) return undefined;
    const tol = inlineTolerance(rest);
    let after = rest.slice(tol.used);
    // limits written as two values: "25.021/25.000"
    const lim = new RegExp(String.raw`^\s?[/-]\s?(${N})(?![\d.,])`).exec(tol.used ? '' : rest);
    const read: DimensionRead = { type, nominal, ...base, ...extra, ...tol.read };
    if (lim) {
      const b = num(lim[1]);
      if (b > 0 && Math.abs(b - nominal) <= Math.max(2, 0.05 * nominal) && b !== nominal) { read.max = Math.max(nominal, b); read.min = Math.min(nominal, b); after = rest.slice(lim[0].length); }
    }
    if (type === 'diameter') Object.assign(read, holeTail(after));
    const trailing = after.replace(/\b(?:THRU|THROUGH|DURCHGEHEND|DURCHGANG|DURCH|HOLES?|BOHRUNG(?:EN)?|DRILL|BORE|REAM|TYP\.?|MAX\.?|MIN\.?|REF\.?|EQ\.?\s?SP\.?|EQUALLY SPACED|mm|MM)\b|[↧⌴⌵Ø]|\d|[.,°xX/()+\-±\s]|DEEP|DP|TIEF|DEPTH/gi, '');
    // words that are not part of a dimension mean this line is prose, not a dimension
    if (trailing.length > 2) return undefined;
    // a signed figure left over is a tolerance that was not understood: better no reading than the nominal alone
    if (/[+±]\s?[\d.,]/.test(after) || /-\s?[.,]?\d/.test(after.replace(/^\s?[/-]\s?/, ''))) return undefined;
    if (/\bMAX\b/i.test(after)) read.note = 'MAX';
    else if (/\bMIN\b/i.test(after)) read.note = 'MIN';
    if (/\bREF\b/i.test(after)) read.reference = true;
    return { read, ...(tol.fit ? { fit: tol.fit } : {}) };
  };
  m = new RegExp(String.raw`^(S?)Ø\s?(${N})`).exec(t);
  if (m) return finish('diameter', num(m[2]), t.slice(m[0].length), m[1] ? { spherical: true } : {});
  m = new RegExp(String.raw`^(S?)R\s?(${N})(?![\d/]|\s?\/)`).exec(t);
  if (m && !/^R[a-z]/.test(t)) return finish('radius', num(m[2]), t.slice(m[0].length), m[1] ? { spherical: true } : {});
  m = new RegExp(String.raw`^(${N})\s?[xX]\s?(${N})\s?°`).exec(t);
  if (m) return finish('chamfer', num(m[1]), t.slice(m[0].length), { chamferAngle: num(m[2]) });
  m = new RegExp(String.raw`^(${N})\s?°(?:\s?(\d{1,2})\s?')?`).exec(t);
  if (m) return finish('angle', num(m[1]) + (m[2] ? Number(m[2]) / 60 : 0), t.slice(m[0].length));
  m = new RegExp(String.raw`^(${N})(?![\d.,])`).exec(t);
  if (m) {
    const rest = t.slice(m[0].length);
    // a bare number followed by letters is a label ("3 PLACES", "2 SURFACES", "12 TEETH") unless it is a fit
    if (/^\s?[A-Za-z]/.test(rest) && !inlineTolerance(rest).fit && !/^\s?(?:mm|MM|MAX|MIN|REF|TYP|THRU)\b/.test(rest)) return undefined;
    return finish('linear', num(m[1]), rest);
  }
  return undefined;
}

/** The whole of an OCR string must have this form to be taken as a dimension. */
const OCR_STRICT = new RegExp(String.raw`^\(?(?:\d{1,3}\s?[xX]\s?)?(?:S?Ø\s?|S?R\s?)?${N}(?:\s?±\s?${N}|\s?[A-Za-z]{1,2}\d{1,2}|\s?°|\s?[xX]\s?${N}\s?°)?(?:\s(?:THRU|THROUGH|DURCH))?\)?$`);

const SIGNED = new RegExp(String.raw`^([+\-±]?)\s?(${N})$`);

/** The drawing's unit of length: stated on the sheet, else read off how the numbers are written. */
export function drawingUnit(ctx: ExtractContext): { unit: 'mm' | 'in'; basis: string; stated: boolean; line?: TextLine } {
  for (const l of ctx.lines) {
    const t = normText(l.text, l.method).toUpperCase();
    if (/\b(?:UNITS?\s*[:=]?\s*(?:INCH(?:ES)?|IN\b)|DIMENSIONS?\s+(?:ARE\s+)?IN\s+INCH(?:ES)?|ALL\s+DIMENSIONS\s+(?:ARE\s+)?IN\s+INCH(?:ES)?|INCH(?:ES)?\s+UNLESS)\b/.test(t)) return { unit: 'in', basis: `stated on the drawing: "${l.text.trim()}"`, stated: true, line: l };
    if (/\b(?:UNITS?\s*[:=]?\s*(?:MM|MILLIMET(?:RE|ER)S?)|DIMENSIONS?\s+(?:ARE\s+)?IN\s+(?:MM|MILLIMET(?:RE|ER)S?)|ALL\s+DIMENSIONS\s+(?:ARE\s+)?IN\s+(?:MM|MILLIMET(?:RE|ER)S?)|MA(?:SS|ß)E\s+IN\s+MM|ALLE\s+MA(?:SS|ß)E\s+IN\s+MM|MASSEINHEIT\s*[:=]?\s*MM)\b/.test(t)) return { unit: 'mm', basis: `stated on the drawing: "${l.text.trim()}"`, stated: true, line: l };
  }
  for (const lay of ctx.layouts) {
    const f = lay.titleBlock?.fields.units;
    if (f) {
      if (/\b(?:INCH|INCHES|IN)\b/i.test(f.value)) return { unit: 'in', basis: `title block: "${f.value}"`, stated: true };
      if (/\b(?:MM|MILLIMET)/i.test(f.value)) return { unit: 'mm', basis: `title block: "${f.value}"`, stated: true };
    }
  }
  // ASME inch drawings write decimals with no leading zero (".250"); ISO metric drawings always write "0.25"
  let lead = 0, all = 0;
  for (const l of ctx.lines) {
    if (l.region === 'title-block' || l.region === 'notes') continue;
    const t = normText(l.text, l.method);
    const m = t.match(/(?:^|[\sØR±+\-(])([.,]\d{2,4}|\d+[.,]\d+)/g);
    if (!m) continue;
    for (const x of m) { all++; if (/(?:^|[\sØR±+\-(])[.,]\d/.test(x)) lead++; }
  }
  if (all >= 6 && lead / all >= 0.5) return { unit: 'in', basis: 'not stated; decimals are written without a leading zero (inch practice)', stated: false };
  return { unit: 'mm', basis: 'not stated; millimetres assumed (ISO practice)', stated: false };
}

function isBoxed(l: TextLine, sheet: SheetData | undefined): boolean {
  if (!sheet || l.rotation % 90 !== 0) return false;
  const [cx, cy] = centre(l.bbox);
  const c = cellAt(cx, cy, { hSegs: sheet.hSegs, vSegs: sheet.vSegs, width: sheet.info.widthPt, height: sheet.info.heightPt });
  if (!c.closed) return false;
  const w = c.bbox[2] - c.bbox[0], h = c.bbox[3] - c.bbox[1];
  const tw = l.bbox[2] - l.bbox[0], th = l.bbox[3] - l.bbox[1];
  return w <= tw + 2.6 * l.size && h <= th + 1.6 * l.size && w >= tw * 0.9 && h >= th * 0.8;
}

/** Is this line in a row of boxed cells (a feature-control frame, a table row)? Used on OCR sheets, where frames are not read. */
function inCellRow(l: TextLine, sheet: SheetData | undefined): boolean {
  if (!sheet || l.rotation % 90 !== 0) return false;
  const geo = { hSegs: sheet.hSegs, vSegs: sheet.vSegs, width: sheet.info.widthPt, height: sheet.info.heightPt };
  const [cx, cy] = centre(l.bbox);
  const c = cellAt(cx, cy, geo);
  if (!c.closed || c.bbox[3] - c.bbox[1] > 3.4 * l.size || c.bbox[2] - c.bbox[0] > 16 * l.size) return false;
  for (const x of [c.bbox[2] + 2.5, c.bbox[0] - 2.5]) {
    const n = cellAt(x, cy, geo);
    if (n.closed && Math.abs(n.bbox[1] - c.bbox[1]) < 2.5 && Math.abs(n.bbox[3] - c.bbox[3]) < 2.5 && n.bbox[2] - n.bbox[0] <= 16 * l.size) return true;
  }
  return false;
}

export interface DimensionOptions { skipLineIds?: Set<number> }

export function extractDimensions(ctx: ExtractContext, opts: DimensionOptions = {}): DraftParameter[] {
  const out: DraftParameter[] = [];
  const du = drawingUnit(ctx);
  const sheets = new Map(ctx.sheets.map(s => [s.info.sheet, s]));
  const borderOf = new Map(ctx.layouts.map(l => [l.sheet, l.border]));
  const cand = ctx.lines.filter(l => (l.region === 'view' || l.region === 'other') && !opts.skipLineIds?.has(l.id));
  const used = new Set<number>();
  const bySheet = new Map<number, TextLine[]>();
  for (const l of cand) { const g = bySheet.get(l.sheet); if (g) g.push(l); else bySheet.set(l.sheet, [l]); }
  interface Found { read: DimensionRead; line: TextLine; lines: TextLine[]; fit?: { letter: string; grade: number; mate?: string }; raw: string }
  const found: Found[] = [];

  for (const [sheetNo, lines] of bySheet) {
    const border = borderOf.get(sheetNo);
    // nominal values first (the larger text), so the small strings of a stacked tolerance are still free to claim
    const order = [...lines].sort((a, b) => b.size - a.size || a.id - b.id);
    for (const l of order) {
      if (used.has(l.id)) continue;
      const text = normText(l.text, l.method);
      // zone labels in the margin are not dimensions
      if (border) { const [cx, cy] = centre(l.bbox); if (cx < border[0] || cx > border[2] || cy < border[1] || cy > border[3]) continue; }
      if (findThreads(text).length) continue;
      // on a sheet read by OCR a boxed row is a feature-control frame or a table: its numbers are not dimensions
      if (l.method === 'ocr' && inCellRow(l, sheets.get(sheetNo))) continue;
      if (SIGNED.test(text) && /^[+\-±]/.test(text)) continue;        // a loose tolerance string: picked up by its nominal
      const p = parseDimension(text);
      if (!p) continue;
      // read by OCR: only a string that is a dimension from its first character to its last, read with confidence
      if (l.method === 'ocr' && (!OCR_STRICT.test(text) || (l.reliability ?? 0) < 0.8 || (/^\d{1,2}$/.test(text) && (l.reliability ?? 0) < 0.9))) continue;
      const s = l.size;
      const group: TextLine[] = [l];
      let raw = text;
      // stacked tolerance: two short signed strings right of the nominal, one above and one below its mid-height
      if (p.read.upper === undefined && p.read.max === undefined && !p.fit) {
        const near = lines.filter(o => o.id !== l.id && !used.has(o.id) && o.rotation === l.rotation && o.size <= s * 1.05
          && o.u0 >= l.u1 - 0.8 * s && o.u0 - l.u1 <= 1.4 * s && Math.abs(o.v - l.v) <= 1.25 * s && SIGNED.test(normText(o.text, o.method)));
        if (near.length === 2) {
          const [a, b] = near.sort((x, y) => x.v - y.v);
          const va = SIGNED.exec(normText(a.text, a.method))!, vb = SIGNED.exec(normText(b.text, b.method))!;
          const sign = (m: RegExpExecArray, dflt: number): number => (m[1] === '-' ? -1 : m[1] === '+' ? 1 : dflt) * num(m[2]) + 0;
          const up = sign(va, 1), lo = sign(vb, -1);
          if (up >= lo && b.v - a.v >= 0.35 * s) {
            p.read.upper = up; p.read.lower = lo;
            group.push(a, b); raw = `${text} ${a.text.trim()} / ${b.text.trim()}`;
          }
        }
      }
      // stacked limits: the same kind of value directly below, a little smaller
      if (p.read.upper === undefined && p.read.max === undefined && !p.fit && p.read.type !== 'angle') {
        const below = lines.find(o => o.id !== l.id && !used.has(o.id) && o.rotation === l.rotation && Math.abs(o.size - s) < 0.1 * s
          && Math.abs(o.u0 - l.u0) < 1.2 * s && o.v - l.v > 0.9 * s && o.v - l.v < 1.7 * s && new RegExp(String.raw`^${N}$`).test(normText(o.text, o.method)));
        if (below) {
          const b = num(normText(below.text, below.method));
          // two limits of one size differ by a little; two different dimensions written under each other do not
          if (b !== p.read.nominal && Math.abs(b - p.read.nominal) <= Math.min(du.unit === 'in' ? 0.08 : 2, 0.1 * p.read.nominal) && /[.,]/.test(below.text) && /[.,]/.test(text)) {
            p.read.max = Math.max(b, p.read.nominal); p.read.min = Math.min(b, p.read.nominal);
            group.push(below); raw = `${text} / ${below.text.trim()}`;
          }
        }
      }
      // a depth line under a hole callout ("↧ 16" below "4x Ø8.5")
      if (p.read.type === 'diameter') {
        const under = lines.find(o => o.id !== l.id && !used.has(o.id) && o.rotation === l.rotation && o.v - l.v > 0.6 * s && o.v - l.v < 2.0 * s
          && o.u0 >= l.u0 - 1.5 * s && o.u0 <= l.u1 && /^↧/.test(normText(o.text, o.method)));
        if (under) {
          // the depth may run on in the next run on the same baseline (symbol and value are separate strings)
          const row = lines.filter(o => o.rotation === l.rotation && Math.abs(o.v - under.v) < 0.4 * s && o.u0 >= under.u0 - 0.1 && o.u0 - under.u1 < 1.5 * s).sort((a, b) => a.u0 - b.u0);
          const dtext = normText(row.map(r => r.text).join(' '), under.method);
          const d = new RegExp(String.raw`^↧\s?(${N})`).exec(dtext);
          if (d) { p.read.depth = num(d[1]); p.read.holeEvidence = 'depth'; group.push(...row); raw = `${raw} ${dtext}`; }
        }
      }
      if (isBoxed(l, sheets.get(sheetNo)) && p.read.upper === undefined && !p.fit) p.read.basic = true;
      // a counterbore / countersink symbol written just before the diameter
      if (p.read.type === 'diameter') {
        const sym = lines.find(o => o.id !== l.id && o.rotation === l.rotation && Math.abs(o.v - l.v) < 0.5 * s && o.u1 <= l.u0 + 0.3 * s && l.u0 - o.u1 < 2 * s && /^[⌴⌵]$/.test(normText(o.text, o.method)));
        if (sym) { p.read.note = /⌴/.test(sym.text) ? 'counterbore' : 'countersink'; p.read.holeEvidence = p.read.note; group.push(sym); }
        else if (/^[⌴⌵]/.test(text)) { p.read.note = /^⌴/.test(text) ? 'counterbore' : 'countersink'; p.read.holeEvidence = p.read.note; }
      }
      group.forEach(g => used.add(g.id));
      found.push({ read: p.read, line: l, lines: group, ...(p.fit ? { fit: p.fit } : {}), raw });
    }
  }

  let holes = 0, repeated = 0; let firstHole: Found | undefined;
  const holeSigs = new Set<string>();
  let tightest: { band: number; f: Found } | undefined;
  for (const f of found) {
    const r = f.read;
    const unit = r.type === 'angle' ? 'deg' : du.unit;
    const u = unitOfLines(f.lines, 'free');
    const notes: string[] = [];
    let kind: 'extracted' | 'interpreted' = 'extracted';
    let status: 'needs-validation' | undefined;
    if (f.fit) {
      r.fit = `${f.fit.letter}${f.fit.grade}${f.fit.mate ? `/${f.fit.mate}` : ''}`;
      if (unit === 'mm') {
        const lim = fitLimits(r.nominal, f.fit.letter, f.fit.grade);
        if (lim) { r.upper = lim.upper; r.lower = lim.lower; r.fitBasis = lim.basis; kind = 'interpreted'; notes.push(`Limit deviations computed for ${r.fit.split('/')[0]}: ${lim.upper >= 0 ? '+' : ''}${lim.upper} / ${lim.lower >= 0 ? '+' : ''}${lim.lower} mm (${lim.basis}).`); }
        else { status = 'needs-validation'; notes.push(`Tolerance class ${f.fit.letter}${f.fit.grade} is outside the transcribed ISO 286 table: the fit is reported as written, without limits.`); }
      } else { status = 'needs-validation'; notes.push('An ISO fit on a drawing whose unit is not millimetres: limits not computed.'); }
    }
    if (r.type !== 'angle' && !du.stated) notes.push(`Unit ${du.unit}: ${du.basis}.`);
    if (r.type === 'linear' && r.upper === undefined && r.max === undefined && !r.fit && !r.basic && !r.reference && Number.isInteger(r.nominal) && r.nominal < 40 && f.raw.length <= 2) {
      status = 'needs-validation';
      notes.push('A bare small whole number beside a view: it may be an item balloon or a detail label, not a dimension.');
    }
    const { holeEvidence, fitBasis: _fb, note, ...value } = r;
    const sink = note === 'counterbore' || note === 'countersink';
    if (note && !sink) notes.push(`Marked ${note}.`);
    if (sink) (value as Record<string, unknown>).feature = note;
    const isHole = r.type === 'diameter' && (holeEvidence !== undefined || (f.fit !== undefined && f.fit.letter === f.fit.letter.toUpperCase()) || (r.count ?? 0) > 1);
    if (isHole) {
      const { type: _t, nominal, ...restV } = value;
      const why = holeEvidence ?? (f.fit && f.fit.letter === f.fit.letter.toUpperCase() ? 'upper-case fit letter (an internal feature)' : 'a count before the diameter');
      out.push(draft('hole.diameter', { diameter: nominal, ...restV } as Record<string, unknown>, u, {
        unit, raw: f.raw, kind, ...(status ? { status } : {}), bbox: u.bbox,
        note: [`Read as a hole: ${why}.`, ...notes].join(' '),
      }));
      // the same callout shown again in another view is the same holes
      const sig = `${r.nominal}|${r.count ?? 1}|${r.upper}|${r.lower}|${r.fit ?? ''}|${r.depth ?? ''}`;
      if (sink) { /* the counterbore of a hole already counted */ }
      else if (!holeSigs.has(`${f.line.sheet}|${sig}`) && [...holeSigs].some(k => k.endsWith(`|${sig}`))) repeated++;
      else holes += r.count ?? 1;
      holeSigs.add(`${f.line.sheet}|${sig}`);
      firstHole = firstHole ?? f;
    } else {
      out.push(draft('dimension', value as unknown as Record<string, unknown>, u, { unit, raw: f.raw, kind, ...(status ? { status } : {}), bbox: u.bbox, ...(notes.length ? { note: notes.join(' ') } : {}) }));
    }
    const band = r.upper !== undefined && r.lower !== undefined ? r.upper - r.lower : r.max !== undefined && r.min !== undefined ? r.max - r.min : undefined;
    if (band !== undefined && band > 0 && r.type !== 'angle' && (!tightest || band < tightest.band - 1e-9)) tightest = { band: Math.round(band * 1e5) / 1e5, f };
  }
  if (tightest) {
    const u = unitOfLines(tightest.f.lines, 'free');
    out.push(draft('tolerance.tightest', { band: tightest.band, nominal: tightest.f.read.nominal, type: tightest.f.read.type }, u, {
      unit: du.unit, raw: tightest.f.raw, kind: 'interpreted', bbox: u.bbox,
      note: 'The smallest tolerance band among the toleranced dimensions read as text on this drawing. Dimensions under the general tolerance and geometric tolerances are not in this comparison.',
    }));
  }
  if (firstHole) {
    const u = unitOfLines(firstHole.lines, 'free');
    out.push(draft('feature.count.holes', holes, u, {
      kind: 'interpreted', raw: `${out.filter(o => o.name === 'hole.diameter').length} hole callout(s)`, bbox: u.bbox, status: 'needs-validation',
      note: `Sum of the counts on the hole callouts read (a callout with no count is one${repeated ? `; ${repeated} callout(s) repeated on another sheet counted once` : ''}). A count from callouts is not a count of holes: a counterbore or an alternative tolerance has its own callout, and a hole dimensioned without one is not in it.`,
    }));
  }
  return out;
}
