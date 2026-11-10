/**
 * Welding as text: notes, the standard and quality level (ISO 5817, ISO 13920, ISO 2553, ISO 3834, AWS D1.x), and
 * ISO 4063 process numbers. Weld SYMBOLS are graphics; they are not recognised. Throat / leg sizes written beside a
 * view ("a4", "z6") are counted as symbol candidates and flagged for manual review — never reported as a weld.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, clauses, draft } from './common.js';

const WELD_WORDS = /\b(?:WELD(?:ED|ING|S)?|SCHWEI[Sß]\w*|GESCHWEI[Sß]T|MIG\b|MAG\b|TIG\b|WIG\b|SPOT\s?-?\s?WELD\w*|PUNKTSCHWEI[Sß]\w*|PROJECTION\s+WELD\w*|LASER\s?-?\s?WELD\w*|SEAM\s+WELD\w*|FILLET\s+WELD\w*|KEHLNAHT\w*|BUTT\s+WELD\w*|STUMPFNAHT\w*|BRAZ(?:E|ED|ING)|L[ÖO]T(?:EN|UNG)|HARTGEL[ÖO]TET)\b/i;
const WELD_STANDARD = /\b((?:DIN\s?)?(?:EN\s?)?ISO\s?5817\s?[-–:\s]?\s?[BCD]\b|(?:DIN\s?)?(?:EN\s?)?ISO\s?10042\s?[-–:\s]?\s?[BCD]\b|(?:DIN\s?)?(?:EN\s?)?ISO\s?13919(?:-[12])?\s?[-–:\s]?\s?[BCD]\b|(?:DIN\s?)?(?:EN\s?)?ISO\s?(?:2553|3834(?:-[234])?|15614(?:-\d{1,2})?|14554(?:-[12])?|9606(?:-\d)?)\b|AWS\s?D\d{1,2}\.\d{1,2}M?\b|DIN\s?(?:18800-7|1090-2)\b|EN\s?1090-[23]\b)/gi;
/** ISO 4063 process numbers in everyday use. */
const ISO4063 = new Set(['111', '114', '121', '131', '135', '136', '138', '141', '15', '21', '22', '23', '24', '311', '42', '52', '521', '522', '783', '912', '921']);

export function extractWelds(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  const seen = new Set<string>();
  let standardDone = false;
  for (const u of units) {
    if (u.context.startsWith('title:')) continue;
    const text = u.text;
    // throat / leg sizes beside a view: "a4", "a 3,5", "z6", possibly with a triangle that is geometry
    if (u.context === 'free' && u.region === 'view' && /^(?:\d{1,2}\s?[xX]\s?)?[az]\s?\d{1,2}(?:[.,]\d)?(?:\s?[x×]\s?\d{1,4})?$/.test(text)) {
      out.push(draft('weld.symbol', { written: text }, u, {
        status: 'needs-validation',
        note: 'A weld size written beside a view (throat "a" / leg "z"). The weld symbol itself is a graphic and is not recognised: confirm the weld type, side and length from the drawing.',
      }));
      continue;
    }
    for (const clause of clauses(text)) {
      const hasWord = WELD_WORDS.test(clause);
      WELD_STANDARD.lastIndex = 0;
      const stds = clause.match(WELD_STANDARD) ?? [];
      const proc = [...clause.matchAll(/\b(?:(?:EN\s?)?ISO\s?4063\s?[-–:\s]?\s?|PROCESS\s?(?:NO\.?)?\s?|PROZESS\s?|VERFAHREN\s?)(\d{2,3})\b/gi)].map(m => m[1]).filter(p => ISO4063.has(p));
      if (!hasWord && !stds.length && !proc.length) continue;
      const k = `${u.sheet}|${clause}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const all = /\b(?:ALL\s?-?\s?ROUND|ALL\s?-?\s?AROUND|UMLAUFEND|RINGSUM)\b/i.test(clause);
      out.push(draft('weld.note', clause, u, {
        raw: clause, at: clause.slice(0, 24),
        note: [proc.length ? `ISO 4063 process ${[...new Set(proc)].join(', ')}.` : '', all ? 'Weld all round.' : ''].filter(Boolean).join(' ') || undefined,
      }));
      if (stds.length && !standardDone) {
        standardDone = true;
        const std = stds[0] ?? '';
        out.push(draft('weld.standard', std.replace(/\s+/g, ' ').trim(), u, { raw: clause, at: std }));
      }
    }
  }
  return out;
}
