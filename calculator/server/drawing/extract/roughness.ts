/**
 * Surface roughness written as text: "Ra 3.2", "Rz 16", "Rmax 25", ISO 1302 N-grades, micro-inch values. A value in
 * the title block or a note, or beside "all over / unless otherwise / allseitig", is the general roughness; a value
 * beside a view is one surface's, and is flagged because text alone does not say which surface.
 * The roughness SYMBOL (the tick) is a graphic: it is not read here.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, draft, num, type TextUnit } from './common.js';

/** ISO 1302:1992 Table: roughness grade number → Ra in µm. */
export const N_GRADE_RA: Record<string, number> = { N1: 0.025, N2: 0.05, N3: 0.1, N4: 0.2, N5: 0.4, N6: 0.8, N7: 1.6, N8: 3.2, N9: 6.3, N10: 12.5, N11: 25, N12: 50 };

export interface RoughnessRead { parameter: string; value: number; unit: 'µm'; raw: string; index: number; limit?: 'max' | 'min'; converted?: string }

export function findRoughness(text: string): RoughnessRead[] {
  const out: RoughnessRead[] = [];
  let m: RegExpExecArray | null;
  const metric = /\b(R(?:a|z|max|t|q|p|v|z1max|zmax|pk|k|vk|sm|mr)|Rz\s?DIN|Rz\s?ISO)\s?(max\.?|min\.?|≤|<|≥|>)?\s?=?\s?(\d+(?:[.,]\d+)?)\s?(µm|um|µin|uin|microns?)?/g;
  while ((m = metric.exec(text))) {
    let v = num(m[3]);
    let converted: string | undefined;
    if (m[4] && /in/i.test(m[4])) { converted = `${m[3]} µin × 0.0254`; v = Math.round(v * 0.0254 * 1000) / 1000; }
    if (!(v > 0) || v > 800) continue;
    const lim = m[2] ? (/min|≥|>/.test(m[2]) ? 'min' as const : 'max' as const) : undefined;
    out.push({ parameter: m[1].replace(/\s+/g, ' '), value: v, unit: 'µm', raw: m[0].trim(), index: m.index, ...(lim ? { limit: lim } : {}), ...(converted ? { converted } : {}) });
  }
  const ngrade = /\bN(1[0-2]|[1-9])\b(?!\s?[x×.:\d/])/g;
  while ((m = ngrade.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 28), m.index);
    // an N-grade is a roughness only where the text is about finish (a zone "N7" or a part mark is not)
    if (!/(?:ROUGHNESS|FINISH|RAUHEIT|RAUTIEFE|OBERFL|SURFACE|ISO\s?1302|√)/i.test(before + text.slice(m.index, m.index + 30))) continue;
    out.push({ parameter: 'Ra', value: N_GRADE_RA[`N${m[1]}`], unit: 'µm', raw: m[0], index: m.index, converted: `ISO 1302 grade N${m[1]}` });
  }
  const inch = /\b(\d{1,3})\s?(?:µin|uin|MICRO\s?-?INCH(?:ES)?|RMS|AA)\b/gi;
  while ((m = inch.exec(text))) {
    if (out.some(o => m!.index >= o.index && m!.index < o.index + o.raw.length)) continue;
    const v = Math.round(num(m[1]) * 0.0254 * 1000) / 1000;
    out.push({ parameter: 'Ra', value: v, unit: 'µm', raw: m[0].trim(), index: m.index, converted: `${m[1]} µin × 0.0254` });
  }
  return out.sort((a, b) => a.index - b.index);
}

const GENERAL_WORDS = /\b(?:ALL\s?OVER|ALL\s+(?:MACHINED\s+)?SURFACES|UNLESS\s+OTHERWISE|GENERAL|EXCEPT\s+(?:AS|WHERE)|ALLSEITIG|ALLE\s+(?:BEARBEITETEN\s+)?FLÄCHEN|SONST|WENN\s+NICHT\s+ANDERS|ÜBRIGE\s+FLÄCHEN|UNSPECIFIED|NOT\s+SPECIFIED|MACHINED\s+SURFACES)\b/i;

/**
 * Preferred roughness values (ISO 1302 / ISO 4287 series and the Rz values in everyday use). Exact text is reported
 * whatever it says; a value read by OCR that is not in the series ("Ra 32" for "Ra 3.2") is a misreading and is dropped.
 */
export const PREFERRED_ROUGHNESS = new Set([0.006, 0.012, 0.0125, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.3, 12.5, 25, 50, 100, 200, 400,
  0.16, 0.25, 0.63, 1, 2.5, 4, 10, 16, 40, 63, 160]);

export function extractRoughness(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  const reads: Array<{ r: RoughnessRead; u: TextUnit; general: boolean; rank: number }> = [];
  for (const u of units) {
    for (const r of findRoughness(u.text)) {
      if (u.method === 'ocr' && !r.converted && !PREFERRED_ROUGHNESS.has(r.value)) continue;
      const inSpec = u.context === 'title:roughness' || u.context === 'title:finish' || u.context === 'note' || u.region === 'title-block';
      const general = inSpec || GENERAL_WORDS.test(u.text);
      const rank = u.context === 'title:roughness' ? 0 : u.context.startsWith('title:') || u.region === 'title-block' ? 1 : GENERAL_WORDS.test(u.text) ? 2 : u.context === 'note' ? 3 : 4;
      reads.push({ r, u, general, rank });
    }
  }
  const val = (r: RoughnessRead): Record<string, unknown> => ({ parameter: r.parameter, value: r.value, ...(r.limit ? { limit: r.limit } : {}) });
  const generals = reads.filter(x => x.general).sort((a, b) => a.rank - b.rank || a.u.sheet - b.u.sheet || a.u.bbox[1] - b.u.bbox[1] || a.r.index - b.r.index);
  const g = generals[0];
  if (g) {
    const rivals = [...new Set(generals.filter(x => x.rank === g.rank && (x.r.parameter !== g.r.parameter || x.r.value !== g.r.value)).map(x => x.r.raw))];
    out.push(draft('finish.roughnessGeneral', val(g.r), g.u, {
      unit: 'µm', raw: g.u.text, at: g.r.raw, ...(g.r.converted ? { kind: 'interpreted' as const } : {}),
      ...(rivals.length ? { status: 'needs-validation' as const } : {}),
      note: [g.r.converted ? `Converted: ${g.r.converted}.` : '', rivals.length ? `Other general values written: ${rivals.slice(0, 5).join('; ')}.` : ''].filter(Boolean).join(' ') || undefined,
    }));
  }
  for (const x of reads) {
    if (x === g) continue;
    if (x.general && g && x.r.parameter === g.r.parameter && x.r.value === g.r.value) continue;   // the same general value repeated
    const inView = !x.general;
    out.push(draft('finish.roughness', val(x.r), x.u, {
      unit: 'µm', raw: x.u.text, at: x.r.raw, ...(x.r.converted ? { kind: 'interpreted' as const } : {}),
      ...(inView ? { status: 'needs-validation' as const } : {}),
      note: [x.r.converted ? `Converted: ${x.r.converted}.` : '', inView ? 'Written beside a view: the surface it applies to is not identified from text.' : ''].filter(Boolean).join(' ') || undefined,
    }));
  }
  return out;
}
