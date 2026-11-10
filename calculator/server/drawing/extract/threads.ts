/**
 * Thread callouts by grammar: ISO metric (ISO 261 / 262 / 965), unified (ASME B1.1), pipe (ISO 228 G, ISO 7 R / Rp /
 * Rc, NPT) and trapezoidal (ISO 2904), with the count, depth, tolerance class, hand and any thread insert named
 * beside it. A coarse metric thread written without its pitch gets the ISO 261 coarse pitch, marked as looked up.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, clauses, draft, num, type TextUnit } from './common.js';
import { MASKING } from './coating.js';

/** ISO 261 coarse pitch by nominal diameter, mm. */
export const METRIC_COARSE: Record<string, number> = {
  '1': 0.25, '1.2': 0.25, '1.4': 0.3, '1.6': 0.35, '1.8': 0.35, '2': 0.4, '2.5': 0.45, '3': 0.5, '3.5': 0.6, '4': 0.7, '5': 0.8, '6': 1, '7': 1,
  '8': 1.25, '10': 1.5, '12': 1.75, '14': 2, '16': 2, '18': 2.5, '20': 2.5, '22': 2.5, '24': 3, '27': 3, '30': 3.5, '33': 3.5, '36': 4, '39': 4,
  '42': 4.5, '45': 4.5, '48': 5, '52': 5, '56': 5.5, '60': 5.5, '64': 6,
};
/** Pitches ISO 261 uses (coarse and fine). */
const METRIC_PITCHES = new Set([0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.75, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]);
/** Fine-series nominal diameters beyond the coarse list. */
const METRIC_FINE_ONLY = new Set([9, 11, 15, 17, 25, 26, 28, 32, 35, 38, 40, 50, 55, 58, 62, 65, 68, 70, 72, 75, 76, 80, 85, 90, 95, 100]);

export interface ThreadRead {
  designation: string; system: 'ISO metric' | 'unified' | 'pipe' | 'trapezoidal';
  nominal?: number; pitch?: number; pitchSource?: 'written' | 'ISO 261 coarse series'; toleranceClass?: string;
  count?: number; depth?: number; through?: boolean; hand?: 'LH' | 'RH'; insert?: string;
  raw: string; index: number; note?: string;
}

const INSERT = /\b(HELI-?\s?COIL(?:\s+INSERTS?)?|THREAD(?:ED)?\s+INSERTS?|GEWINDEEINS[AÄ]TZ\w*|KEENSERT\w*|ENSAT\w*|RIV\s?-?\s?NUT\w*|(?:BLIND\s?)?RIVET\s?NUTS?|EINPRESSMUTTER\w*|PRESS\s?-?\s?IN\s+NUTS?|WELD\s?NUTS?|SCHWEISSMUTTER\w*|CLINCH\s?NUTS?|TIME-?SERT\w*)\b/i;

function tail(text: string, from: number): { depth?: number; through?: boolean; count?: number; ambiguousLength?: number } {
  const t = text.slice(from, from + 46);
  const out: { depth?: number; through?: boolean; count?: number; ambiguousLength?: number } = {};
  let m = /^[\s,;-]*(?:[xX]\s?)?(?:↧|↧|DEEP|DP\.?|DEPTH|TIEFE?|T\s?=)\s?(\d+(?:[.,]\d+)?)/i.exec(t)
    ?? /^[\s,;-]*(?:[xX]\s?)?(\d+(?:[.,]\d+)?)\s?(?:mm\s?)?(?:DEEP|DP\b|TIEF|MIN\.?\s+(?:FULL\s+)?THREAD|FULL\s+THREAD)/i.exec(t);
  if (m) out.depth = num(m[1]);
  else if (/^[\s,;-]*(?:THRU|THROUGH|DURCHGEHEND|DURCHGANG|DURCH)\b/i.test(t)) out.through = true;
  else { m = /^\s?[xX]\s?(\d+(?:[.,]\d+)?)(?![\d.,]|\s?°)/.exec(t); if (m) out.ambiguousLength = num(m[1]); }
  m = /\b(\d{1,3})\s?(?:HOLES|PLACES|PLCS\.?|PL\.?|POS(?:ITIONS?)?\.?|STÜCK|STK\.?|BOHRUNGEN|STELLEN)\b/i.exec(t) ?? /^[\s,;-]*\(?(\d{1,3})\s?[xX]\)?(?!\s?\d)/.exec(t);
  if (m) out.count = Number(m[1]);
  return out;
}

/** Every thread callout in a piece of normalised text. */
export function findThreads(text: string): ThreadRead[] {
  const out: ThreadRead[] = [];
  let m: RegExpExecArray | null;
  const metric = /(?<![A-Za-z0-9.,/-])(?:\(?(\d{1,3})\s?[xX]\)?\s?)?M\s?(\d{1,3}(?:[.,]\d)?)(?:\s?[xX]\s?(\d(?:[.,]\d{1,2})?)(?![\d.,]))?(?:\s?-\s?(\d[A-Ha-h](?:\d[A-Ha-h])?)(?![A-Za-z0-9]))?(?:\s?-?\s?(LH|RH)\b)?/g;
  while ((m = metric.exec(text))) {
    const nominal = num(m[2]);
    const keyN = String(nominal);
    // "ISO 3302-1 M2", "Klasse M2", "CLASS M3" are tolerance classes, not threads
    if (/(?:\b(?:CLASS|KLASSE|GRADE|GÜTE)\s|ISO\s?3302(?:-\d)?\s?[-:]?\s?)$/i.test(text.slice(Math.max(0, m.index - 24), m.index))) continue;
    if (!(keyN in METRIC_COARSE) && !METRIC_FINE_ONLY.has(nominal)) continue;
    let pitch: number | undefined, pitchSource: ThreadRead['pitchSource'];
    let matched = m[0];
    if (m[3] !== undefined) {
      const p = num(m[3]);
      if (METRIC_PITCHES.has(p) && p <= (METRIC_COARSE[keyN] ?? 6) && p < nominal / 2) { pitch = p; pitchSource = 'written'; }
      else {
        // "M8x16": the second figure is not a pitch — stop the callout at the size and let the tail decide
        const cut = m[0].search(/\s?[xX]\s?\d/);
        matched = cut > 0 ? m[0].slice(0, cut) : m[0];
        m[4] = undefined as unknown as string; m[5] = undefined as unknown as string;
      }
    }
    if (pitch === undefined && keyN in METRIC_COARSE) { pitch = METRIC_COARSE[keyN]; pitchSource = 'ISO 261 coarse series'; }
    const after = tail(text, m.index + matched.length);
    const before = text.slice(Math.max(0, m.index - 22), m.index);
    const cb = /(\d{1,3})\s?(?:HOLES|PLACES|PLCS\.?|x)\s*$/i.exec(before);
    const count = m[1] ? Number(m[1]) : cb ? Number(cb[1]) : after.count;
    const designation = matched.replace(/^\(?\d{1,3}\s?[xX]\)?\s?/, '').replace(/\s+/g, '').replace(/[xX]/, 'x');
    out.push({
      designation, system: 'ISO metric', nominal, ...(pitch !== undefined ? { pitch, pitchSource } : {}),
      ...(m[4] ? { toleranceClass: m[4] } : {}), ...(count ? { count } : {}), ...(after.depth !== undefined ? { depth: after.depth } : {}),
      ...(after.through ? { through: true } : {}), ...(m[5] ? { hand: m[5] as 'LH' | 'RH' } : {}),
      raw: text.slice(m.index, Math.min(text.length, m.index + matched.length + 30)).trim(), index: m.index,
      ...(after.ambiguousLength !== undefined ? { note: `"x ${after.ambiguousLength}" follows the size and is not a standard pitch: it may be a depth or a screw length.` } : {}),
    });
  }
  const unified = /(?<![\w.])(?:(\d{1,3})\s?[xX]\s?)?(#\d{1,2}|\d{1,2}\/\d{1,2}|\d\s?-\s?\d{1,2}\/\d{1,2}|\.\d{3,4})\s?-\s?(\d{1,2})\s?(UNJ?[CF]|UNEF|UNS|UN)\b(?:\s?-\s?([123][AB]))?(?:\s?-?\s?(LH)\b)?/g;
  while ((m = unified.exec(text))) {
    const after = tail(text, m.index + m[0].length);
    const count = m[1] ? Number(m[1]) : after.count;
    out.push({
      designation: m[0].replace(/^\d{1,3}\s?[xX]\s?/, '').replace(/\s+/g, ''), system: 'unified', ...(m[5] ? { toleranceClass: m[5] } : {}),
      ...(count ? { count } : {}), ...(after.depth !== undefined ? { depth: after.depth } : {}), ...(after.through ? { through: true } : {}),
      ...(m[6] ? { hand: 'LH' as const } : {}), raw: text.slice(m.index, Math.min(text.length, m.index + m[0].length + 30)).trim(), index: m.index,
    });
  }
  const pipe = /(?<![\w./])(?:(\d{1,3})\s?[xX]\s?)?(?:(G|Rp|Rc|R)\s?(\d{1,2}\/\d{1,2}|\d\s\d\/\d|\d(?="))"?(?:\s?([AB])\b)?|(\d{1,2}\/\d{1,2}|\d(?:[.,]\d+)?)\s?"?\s?-?\s?(?:(\d{1,2}(?:[.,]\d)?)\s?)?(NPTF?|NPSM?|BSPP|BSPT|BSP)\b|(NPTF?|BSPP|BSPT)\s?(\d{1,2}\/\d{1,2}|\d)"?)/g;
  while ((m = pipe.exec(text))) {
    const after = tail(text, m.index + m[0].length);
    const count = m[1] ? Number(m[1]) : after.count;
    out.push({
      designation: m[0].replace(/^\d{1,3}\s?[xX]\s?/, '').replace(/\s+/g, ' ').trim(), system: 'pipe',
      ...(count ? { count } : {}), ...(after.depth !== undefined ? { depth: after.depth } : {}), ...(after.through ? { through: true } : {}),
      raw: text.slice(m.index, Math.min(text.length, m.index + m[0].length + 30)).trim(), index: m.index,
    });
  }
  const trap = /(?<![\w.])(?:(\d{1,3})\s?[xX]\s?)?Tr\s?(\d{1,3})\s?[xX]\s?(\d{1,2}(?:[.,]\d)?)(?:\s?-\s?(\d[A-Ha-h]))?/g;
  while ((m = trap.exec(text))) {
    out.push({
      designation: m[0].replace(/^\d{1,3}\s?[xX]\s?/, '').replace(/\s+/g, ''), system: 'trapezoidal', nominal: num(m[2]), pitch: num(m[3]), pitchSource: 'written',
      ...(m[4] ? { toleranceClass: m[4] } : {}), ...(m[1] ? { count: Number(m[1]) } : {}), raw: m[0], index: m.index,
    });
  }
  const ins = INSERT.exec(text);
  if (ins) for (const t of out) t.insert = ins[1].replace(/\s+/g, ' ');
  return out.sort((a, b) => a.index - b.index);
}

export function extractThreads(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  let total = 0;
  const first: TextUnit[] = [];
  for (const u of units) {
    // identity cells (part number, drawing number, material …) hold codes that look like threads
    if (u.context.startsWith('title:') || u.region === 'title-block' || u.region === 'revision-table') continue;
    // a masking instruction names a thread to keep it free of coating; it is not a thread callout
    const text = clauses(u.text).filter(c => !MASKING.test(c)).join(' ');
    for (const t of findThreads(text)) {
      const { raw, index: _index, note, ...value } = t;
      out.push(draft('thread', value as unknown as Record<string, unknown>, u, {
        raw, at: t.designation.slice(0, 6), ...(t.system === 'ISO metric' ? { unit: 'mm' } : {}),
        ...(t.pitchSource && t.pitchSource !== 'written' ? { kind: 'interpreted' as const } : {}),
        ...(note ? { status: 'needs-validation' as const } : {}),
        note: [t.pitchSource && t.pitchSource !== 'written' ? `Pitch ${t.pitch} mm is the ISO 261 coarse pitch for M${t.nominal}; the drawing writes no pitch.` : '', note ?? ''].filter(Boolean).join(' ') || undefined,
      }));
      total += t.count ?? 1;
      first.push(u);
    }
  }
  if (out.length) {
    out.push(draft('feature.count.threads', total, first[0], {
      kind: 'interpreted', status: 'needs-validation', raw: `${out.length} thread callout${out.length === 1 ? '' : 's'}`,
      note: 'Sum of the counts on the thread callouts read (a callout with no count is one). A callout repeated in a second view is counted twice.',
    }));
  }
  return out;
}
