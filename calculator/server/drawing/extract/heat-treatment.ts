/**
 * Heat treatment, hardness and case depth. Processes by keyword (English and German) and aluminium tempers by their
 * ISO 2107 / EN 515 form; hardness and case depth by the grammar of ISO 6508 / 6506 / 6507 and ISO 18203 symbols.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, clauses, draft, num, type TextUnit } from './common.js';

export const HEAT_TREAT_KEYWORDS: Array<{ process: string; re: RegExp }> = [
  { process: 'carbonitride', re: /\b(?:CARBO\s?-?\s?NITRID\w*|CARBONITRIER\w*)\b/i },
  { process: 'nitrocarburise', re: /\b(?:NITRO\s?-?\s?CARBURI[SZ]\w*|NITROCARBURIER\w*|TENIFER|TUFFTRIDE|QPQ)\b/i },
  { process: 'case-harden', re: /\b(?:CASE\s?-?\s?HARDEN\w*|CARBURI[SZ]\w*|EINSATZH[ÄA]RT\w*|EINSATZGEH[ÄA]RTET|AUFKOHL\w*)\b/i },
  { process: 'induction-harden', re: /\b(?:INDUCTION\s?-?\s?HARDEN\w*|INDUKTIV\w*\s?-?\s?(?:GE)?H[ÄA]RT\w*|INDUKTIONSH[ÄA]RT\w*|INDUCTION\s+HARDENED)\b/i },
  { process: 'flame-harden', re: /\b(?:FLAME\s?-?\s?HARDEN\w*|FLAMMH[ÄA]RT\w*)\b/i },
  { process: 'nitride', re: /\b(?:(?:GAS|PLASMA|ION)\s?-?\s?NITRID\w*|NITRID\w*|NITRIER\w*)\b/i },
  { process: 'austemper', re: /\b(?:AUSTEMPER\w*|BAINITISIER\w*|ZWISCHENSTUFENVERG[ÜU]T\w*)\b/i },
  { process: 'quench-and-temper', re: /\b(?:QUENCH\w*\s*(?:&|AND|\+)\s*TEMPER\w*|Q\s?&\s?T\b|Q\s?\+\s?T\b|(?<!CASE\s?-?\s?)(?<!INDUCTION\s?-?\s?)(?<!THROUGH\s?-?\s?)(?<!FLAME\s?-?\s?)HARDEN\w*\s*(?:&|AND|\+)\s*TEMPER\w*|VERG[ÜU]T\w*)\b/i },
  { process: 'through-harden', re: /\b(?:THROUGH\s?-?\s?HARDEN\w*|DURCHH[ÄA]RT\w*|DURCHGEH[ÄA]RTET)\b/i },
  { process: 'stress-relieve', re: /\b(?:STRESS\s?-?\s?RELIE[VF]\w*|SPANNUNGSARM\s?GL[ÜU]H\w*|SPANNUNGSARMGEGL[ÜU]HT)\b/i },
  { process: 'normalise', re: /\b(?:NORMALI[SZ]\w*|NORMALGL[ÜU]H\w*|NORMALGEGL[ÜU]HT)\b/i },
  { process: 'solution-treat', re: /\b(?:SOLUTION\s?-?\s?(?:HEAT\s?-?\s?)?TREAT\w*|L[ÖO]SUNGSGL[ÜU]H\w*|L[ÖO]SUNGSGEGL[ÜU]HT)\b/i },
  { process: 'age-harden', re: /\b(?:(?:ARTIFICIAL(?:LY)?\s+)?AGE\s?-?\s?HARDEN\w*|ARTIFICIAL(?:LY)?\s+AGE\w*|PRECIPITATION\s?-?\s?HARDEN\w*|WARMAUSGELAGERT|WARMAUSLAGER\w*|AUSSCHEIDUNGSH[ÄA]RT\w*)\b/i },
  { process: 'anneal', re: /\b(?:(?:SOFT\s?-?\s?)?ANNEAL\w*|WEICHGL[ÜU]H\w*|WEICHGEGL[ÜU]HT|GEGL[ÜU]HT)\b/i },
  { process: 'temper', re: /\b(?:TEMPERED|ANGELASSEN|ANLASSEN)\b/i },
  { process: 'harden', re: /\b(?:HARDEN(?:ED)?|GEH[ÄA]RTET|H[ÄA]RTEN)\b/i },
];

/** Aluminium tempers that are a heat treatment (EN 515): T4, T5, T6, T64, T7, T73 … — written as a treatment, not inside a grade. */
const TEMPER_AS_TREATMENT = /\b(?:HEAT\s?-?\s?TREAT\w*|W[ÄA]RMEBEHAND\w*|TEMPER|CONDITION|ZUSTAND)\b[^.;]{0,24}?\b(T[4-7]\d{0,3})\b/i;

export interface HardnessRead { min?: number; max?: number; scale: string; raw: string; index: number }

const SCALE = String.raw`(HRC|HRB|HRA|HR\s?15N|HR\s?30N|HBW?(?:\s?\d{1,2}(?:[.,]\d)?\/\d{2,4})?|HV\s?\d{0,3}(?:[.,]\d+)?|HK\s?\d*(?:[.,]\d+)?)`;
const N = String.raw`\d{2,4}(?:[.,]\d)?`;

/** Hardness statements: "58-62 HRC", "HRC 58–62", "180…220 HBW", "≥ 550 HV10", "min. 58 HRC", "60 ±2 HRC", "58+4 HRC". */
export function findHardness(text: string): HardnessRead[] {
  const out: HardnessRead[] = [];
  const push = (r: HardnessRead): void => {
    if (out.some(o => r.index < o.index + o.raw.length && o.index < r.index + r.raw.length)) return;
    if ((r.min !== undefined && !(r.min > 0)) || (r.max !== undefined && r.min !== undefined && r.max < r.min)) return;
    out.push({ ...r, scale: r.scale.replace(/\s+/g, '').toUpperCase() });
  };
  let m: RegExpExecArray | null;
  const range = new RegExp(String.raw`\(?(${N})\s?(?:-|–|to|bis|\.\.\.?|…|/)\s?(${N})\)?\s?${SCALE}(?![A-Za-z])`, 'gi');
  while ((m = range.exec(text))) push({ min: num(m[1]), max: num(m[2]), scale: m[3], raw: m[0], index: m.index });
  const scaleFirst = new RegExp(String.raw`\b${SCALE}\s?[:=]?\s?(${N})\s?(?:-|–|to|bis|\.\.\.?|…|/)\s?(${N})(?![\d.,])`, 'gi');
  while ((m = scaleFirst.exec(text))) push({ min: num(m[2]), max: num(m[3]), scale: m[1], raw: m[0], index: m.index });
  const pm = new RegExp(String.raw`(${N})\s?±\s?(\d{1,2}(?:[.,]\d)?)\s?${SCALE}(?![A-Za-z])`, 'gi');
  while ((m = pm.exec(text))) push({ min: num(m[1]) - num(m[2]), max: num(m[1]) + num(m[2]), scale: m[3], raw: m[0], index: m.index });
  const plus = new RegExp(String.raw`(${N})\s?\+\s?(\d{1,2})\s?${SCALE}(?![A-Za-z])`, 'gi');
  while ((m = plus.exec(text))) push({ min: num(m[1]), max: num(m[1]) + num(m[2]), scale: m[3], raw: m[0], index: m.index });
  const minF = new RegExp(String.raw`(?:MIN(?:IMUM|D(?:ESTENS)?)?\.?|≥|>=|>)\s?(${N})\s?${SCALE}(?![A-Za-z])`, 'gi');
  while ((m = minF.exec(text))) push({ min: num(m[1]), scale: m[2], raw: m[0], index: m.index });
  const minB = new RegExp(String.raw`(${N})\s?${SCALE}\s?MIN(?:IMUM)?\b\.?`, 'gi');
  while ((m = minB.exec(text))) push({ min: num(m[1]), scale: m[2], raw: m[0], index: m.index });
  const maxF = new RegExp(String.raw`(?:MAX(?:IMUM)?\.?|≤|<=|<)\s?(${N})\s?${SCALE}(?![A-Za-z])`, 'gi');
  while ((m = maxF.exec(text))) push({ max: num(m[1]), scale: m[2], raw: m[0], index: m.index });
  const maxB = new RegExp(String.raw`(${N})\s?${SCALE}\s?MAX(?:IMUM)?\b\.?`, 'gi');
  while ((m = maxB.exec(text))) push({ max: num(m[1]), scale: m[2], raw: m[0], index: m.index });
  const single = new RegExp(String.raw`(?<![\d.,])(${N})\s?${SCALE}(?![A-Za-z])`, 'gi');
  while ((m = single.exec(text))) push({ min: num(m[1]), max: num(m[1]), scale: m[2], raw: m[0], index: m.index });
  const singleScaleFirst = new RegExp(String.raw`\b${SCALE}\s?[:=]?\s?(${N})(?![\d.,])`, 'gi');
  while ((m = singleScaleFirst.exec(text))) push({ min: num(m[2]), max: num(m[2]), scale: m[1], raw: m[0], index: m.index });
  return out.sort((a, b) => a.index - b.index);
}

export interface CaseDepthRead { type: string; min?: number; max?: number; limitHardness?: string; raw: string; index: number }

/** Case depth: "CHD 0.6-0.9", "CHD 550 HV1 0,6–0,9 mm", "Eht 0,8+0,4", "NHD 0.3 min", "CASE DEPTH 0.8-1.2 mm", "SHD 400 = 2-3". */
export function findCaseDepth(text: string): CaseDepthRead[] {
  const out: CaseDepthRead[] = [];
  const T = String.raw`(CHD|EHT|Eht|NHD|Nht|NHT|SHD|Rht|RHT|DS|ECD|(?:EFFECTIVE\s+)?CASE\s?-?\s?(?:HARDENING\s+)?DEPTH|EINSATZH[ÄA]RTUNGSTIEFE|EINH[ÄA]RTUNGSTIEFE|NITRIERH[ÄA]RTETIEFE|HARDENING\s+DEPTH|H[ÄA]RTETIEFE|NITRIDING\s+DEPTH|HARDENED\s+DEPTH)`;
  const D = String.raw`\d(?:[.,]\d{1,2})?`;
  const re = new RegExp(String.raw`\b${T}\b\s?(?:(\d{3})\s?(?:HV\s?\d*(?:[.,]\d)?)?\s?)?[:=]?\s?(?:(MIN\.?|≥|MAX\.?|≤)\s?)?(${D})(?:\s?(?:(-|–|to|bis|\.\.\.?|…)\s?(${D})|\+\s?(${D})))?\s?(?:mm)?(?:\s?(MIN|MAX)\b)?`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const a = num(m[4]);
    const type = /^(CHD|EHT|ECD|EINSATZ|.*CASE)/i.test(m[1]) ? 'CHD' : /^(NHD|NHT|NITRI)/i.test(m[1]) ? 'NHD' : /^(SHD|RHT|DS|EINH|HARDEN|H[ÄA]RTE)/i.test(m[1]) ? 'SHD' : m[1].toUpperCase();
    const r: CaseDepthRead = { type, raw: m[0].trim(), index: m.index };
    if (m[6]) { r.min = a; r.max = num(m[6]); }
    else if (m[7]) { r.min = a; r.max = Math.round((a + num(m[7])) * 1000) / 1000; }
    else if ((m[3] && /MAX|≤/i.test(m[3])) || (m[8] && /MAX/i.test(m[8]))) r.max = a;
    else if ((m[3] && /MIN|≥/i.test(m[3])) || (m[8] && /MIN/i.test(m[8]))) r.min = a;
    else { r.min = a; }
    if (m[2]) r.limitHardness = `${m[2]} HV`;
    if ((r.min ?? 0) > 9 || (r.max ?? 0) > 12) continue;       // not a depth in mm
    out.push(r);
  }
  return out;
}

export function extractHeatTreatment(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  const seenProc = new Set<string>(), seenHard = new Set<string>();
  let caseDepth: { c: CaseDepthRead; u: TextUnit } | undefined;
  const relevant = (u: TextUnit): boolean => !u.context.startsWith('title:') || /title:(heatTreatment|material|finish)/.test(u.context);
  for (const u of units) {
    if (!relevant(u)) continue;
    for (const clause of clauses(u.text)) {
      const found: string[] = [];
      for (const kw of HEAT_TREAT_KEYWORDS) {
        if (!kw.re.test(clause)) continue;
        // the generic words give way to the specific process named in the same clause
        if (kw.process === 'harden' && found.some(f => /harden|temper|nitr|carb|austemper/.test(f))) continue;
        if (kw.process === 'temper' && found.some(f => /temper/.test(f))) continue;
        if (kw.process === 'nitride' && found.some(f => /nitr/.test(f))) continue;
        if (kw.process === 'anneal' && found.some(f => /stress|normal|solution/.test(f))) continue;
        found.push(kw.process);
      }
      const t = TEMPER_AS_TREATMENT.exec(clause);
      if (t) found.push(t[1].toUpperCase());
      for (const p of found) {
        const k = `${p}`;
        if (seenProc.has(k)) continue;
        seenProc.add(k);
        out.push(draft('heatTreat.process', p, u, { raw: clause, at: clause.slice(0, 24), kind: 'interpreted', note: 'Named from the process words on the drawing.' }));
      }
      const depths = findCaseDepth(clause);
      for (const h of findHardness(clause)) {
        // the limit hardness inside a case-depth statement ("CHD 550 HV1 0.6-0.9") is part of the depth, not a hardness
        if (depths.some(d => h.index >= d.index && h.index < d.index + d.raw.length)) continue;
        const k = `${h.scale}|${h.min}|${h.max}`;
        if (seenHard.has(k)) continue;
        seenHard.add(k);
        const v: Record<string, unknown> = { scale: h.scale };
        if (h.min !== undefined) v.min = h.min;
        if (h.max !== undefined) v.max = h.max;
        const where = /\b(?:SURFACE|OBERFL[ÄA]CHE|RAND)\w*\b/i.test(clause) ? 'surface' : /\b(?:CORE|KERN)\w*\b/i.test(clause) ? 'core' : undefined;
        out.push(draft('heatTreat.hardness', v, u, { unit: h.scale, raw: h.raw, at: h.raw, ...(where ? { appliesTo: { description: where } } : {}) }));
      }
      if (!caseDepth && depths[0]) caseDepth = { c: depths[0], u };
    }
  }
  // a temper written in the material designation is a heat treatment too (T6 = solution treated and artificially aged)
  if (caseDepth) {
    const { c, u } = caseDepth;
    const v: Record<string, unknown> = { type: c.type };
    if (c.min !== undefined) v.min = c.min;
    if (c.max !== undefined) v.max = c.max;
    if (c.limitHardness) v.limitHardness = c.limitHardness;
    out.push(draft('heatTreat.caseDepth', v, u, { unit: 'mm', raw: c.raw, at: c.raw }));
  }
  return out;
}
