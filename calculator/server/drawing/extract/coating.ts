/**
 * Coating, plating and paint: the process named on the drawing (by keyword, English and German, and by the
 * designation systems of ISO 2081 / ISO 19598 / ISO 4042 / ISO 10683), the designation as written, the thickness
 * and any masking instruction. Reads words; never chooses a coating route for the costing.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, clauses, draft, num, type TextUnit } from './common.js';

/**
 * Process keywords. `route` is a plain name for the family; order matters (zinc-nickel before zinc, hard anodise before anodise).
 * A trade name that is the start of an ordinary word ends at a word boundary: "GEOMET" is in "GEOMETRIC TOLERANCES" and
 * "GEOMETRY" (independent validation, 10 Nov 2026: a NIST sheet's tolerance notes read as zinc flake).
 */
export const COATING_KEYWORDS: Array<{ route: string; re: RegExp }> = [
  { route: 'zinc-nickel', re: /\b(?:ZN\s?-?\s?NI|ZINC\s?-?\s?NICKEL|ZINK\s?-?\s?NICKEL|Fe\s?\/\/?\s?ZnNi\s?\d*[^\s,;]*)/i },
  { route: 'zinc-flake', re: /\b(?:DACROMET(?![A-Za-z])|GEOMET(?![A-Za-z])(?:\s?\d{3})?|DELTA\s?-?\s?PROTEKT(?:\s?K[LV]\s?\d{3})?|DELTA\s?-?\s?TONE|ZINC\s?-?\s?FLAKE|ZINKLAMELLEN?(?:ÜBERZUG|BESCHICHTUNG)?|MAGNI\s?\d{3}|fl\s?Zn(?:nc|yc|ncl)?\s?-?\s?\d*h?[^\s,;]*)/i },
  { route: 'hot-dip-galvanise', re: /\b(?:HOT\s?-?\s?DIP(?:PED)?\s?GALVANI[SZ]\w*|FEUERVERZINK\w*|GALVANI[SZ]ED\s+TO\s+ISO\s?1461|t\s?Zn\s?[ok]?\b)/i },
  { route: 'zinc-plate', re: /\b(?:ZINC\s?-?\s?PLAT\w*|ZINC\s+ELECTROPLAT\w*|ELECTRO\s?-?\s?(?:ZINC|GALVANI[SZ]\w*)|GALVANISCH\s+VERZINK\w*|GALV\.?\s+VERZINK\w*|VERZINKT|Fe\s?\/\/?\s?Zn\s?\d+[^\s,;]*|ZINC\s+COAT\w*|A[23][A-Z]\b(?=.*ISO\s?4042)|ISO\s?4042\s?[-/]?\s?A\d[A-Z])/i },
  { route: 'e-coat', re: /\b(?:E\s?-?\s?COAT\w*|ELECTRO\s?-?\s?COAT\w*|KTL(?:\s?-?\s?BESCHICHT\w*)?|CATHODIC\s+(?:DIP|ELECTRO\w*)(?:\s+(?:COAT\w*|PAINT\w*|PRIM\w*))?|KATAPHORE\w*|CATAPHOR\w*|CDP|CED\s+(?:COAT\w*|PRIMER))\b/i },
  { route: 'powder-coat', re: /\b(?:POWDER\s?-?\s?COAT\w*|POWDER\s+PAINT\w*|PULVERBESCHICHT\w*|PULVERLACK\w*|EPOXY\s+POWDER|POLYESTER\s+POWDER)\b/i },
  { route: 'hard-anodise', re: /\b(?:HARD\s?-?\s?(?:COAT\s+)?ANODI[SZ]\w*|HARTELOX\w*|HARTANODI\w*|HART\s?-?\s?COAT\w*|MIL-A-8625\s?\w*\s?TYPE\s?III)\b/i },
  { route: 'anodise', re: /\b(?:ANODI[SZ]\w*|ELOXIER\w*|ELOXAL\w*|ELOX\b|E6\s?\/?\s?EV\s?\d|MIL-A-8625\s?\w*\s?TYPE\s?II\b)/i },
  { route: 'phosphate', re: /\b(?:(?:ZINC|MANGANESE|IRON|ZN|MN)\s?-?\s?PHOSPHAT\w*|PHOSPHAT\w*|ZINKPHOSPHAT\w*|MANGANPHOSPHAT\w*|BONDERI[SZ]\w*|PARKERI[SZ]\w*)\b/i },
  { route: 'electroless-nickel', re: /\b(?:ELECTROLESS\s+NICKEL(?:\s+PLAT\w*)?|CHEM(?:ISCH)?\.?\s+(?:VER)?NICKEL\w*|ENP|Ni\s?-?\s?P\s?\d*)\b/i },
  { route: 'chrome', re: /\b(?:HARD\s?-?\s?CHROM\w*|CHROM\w*\s+PLAT\w*|HARTVERCHROM\w*|VERCHROM\w*|HARTCHROM)\b/i },
  { route: 'nickel', re: /\b(?:NICKEL\s+PLAT\w*|VERNICKEL\w*|BRIGHT\s+NICKEL)\b/i },
  { route: 'tin', re: /\b(?:TIN\s+PLAT\w*|VERZINN\w*)\b/i },
  { route: 'black-oxide', re: /\b(?:BLACK\s+OXID\w*|BRÜNIER\w*|BRUENIER\w*|BLACKEN\w*)\b/i },
  { route: 'conversion-coat', re: /\b(?:(?:CHROMATE|CHEMICAL)\s+CONVERSION(?:\s+COAT\w*)?|ALODINE\s?\d*|SURTEC\s?\d{3}|CHROMATIER\w*|TCP\s+COAT\w*)\b/i },
  { route: 'passivate', re: /\b(?:PASSIVAT\w*|PASSIVIER\w*)\b/i },
  { route: 'paint', re: /\b(?:WET\s+PAINT\w*|PAINT(?:ED)?\s+(?:TO|PER|ACC\w*|RAL|BLACK|GREY|GRAY|WHITE|COLOU?R)\b[^.;]*|PRIMER\s*\+\s*TOP\s?COAT|TOP\s?COAT|LACKIER\w*|NASSLACK\w*|GRUNDIER\w*|PRIME(?:D|R)\b)/i },
];

/** Words that turn a coating keyword into its opposite. */
const NEGATED = /\b(?:NO|NOT|WITHOUT|FREE\s+OF|FREE\s+FROM|KEIN\w*|OHNE|FREI\s+VON|UNBESCHICHTET|UNCOATED|DO\s+NOT)\b/i;
export const MASKING = /\b(?:MASK(?:ED|ING)?\b|FREE\s+(?:OF|FROM)\s+(?:PAINT|COATING|PLATING|E-?COAT|ZINC|POWDER|ANODI[SZ]\w*|PHOSPHAT\w*|LACQUER|PRIMER)|NO\s+(?:PAINT|COATING|PLATING|E-?COAT)\s+(?:ON|IN|ALLOWED)|PAINT\s?-?\s?FREE|(?:LACK|BESCHICHTUNGS|FARB)\s?-?\s?FREI|FREI\s+VON\s+(?:LACK|BESCHICHTUNG|FARBE)|ABDECKEN|ABGEDECKT|MASKIER\w*|KEEP\s+FREE\s+(?:OF|FROM)|UNCOATED\s+(?:SURFACES?|AREAS?|THREADS?))/i;

export interface ThicknessRead { min?: number; max?: number; nominal?: number; raw: string; derived?: string }

/** A coating thickness in a clause: "8 µm", "8-12 µm", "min. 8 µm", "≥ 8 µm", "0.008 mm", "Fe/Zn8/A" → 8. */
export function findThickness(clause: string): ThicknessRead | undefined {
  const U = String.raw`(µm|um|μm|MICRONS?|MIKROMETER|MIC\b)`;
  let m = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s?(?:-|–|to|bis|\.\.\.?|…|/)\s?(\d+(?:[.,]\d+)?)\s?${U}`, 'i').exec(clause);
  if (m) return { min: num(m[1]), max: num(m[2]), raw: m[0] };
  m = new RegExp(String.raw`(?:MIN(?:IMUM|D(?:ESTENS)?)?\.?|≥|>=|AT\s+LEAST)\s?(\d+(?:[.,]\d+)?)\s?${U}`, 'i').exec(clause);
  if (m) return { min: num(m[1]), raw: m[0] };
  m = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s?${U}\s?(?:MIN(?:IMUM)?\.?)`, 'i').exec(clause);
  if (m) return { min: num(m[1]), raw: m[0] };
  m = new RegExp(String.raw`(?:MAX(?:IMUM)?\.?|≤|<=)\s?(\d+(?:[.,]\d+)?)\s?${U}`, 'i').exec(clause);
  if (m) return { max: num(m[1]), raw: m[0] };
  m = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s?(?:±\s?(\d+(?:[.,]\d+)?)\s?)?${U}`, 'i').exec(clause);
  if (m) return m[2] ? { min: num(m[1]) - num(m[2]), max: num(m[1]) + num(m[2]), nominal: num(m[1]), raw: m[0] } : { nominal: num(m[1]), raw: m[0] };
  // ISO 2081 / ISO 19598 designation: Fe/Zn8/A, Fe//ZnNi8//Cn//T2 — the number after the metal is µm
  m = /Fe\s?\/\/?\s?Zn(?:Ni|Fe)?\s?(\d{1,2})\b/.exec(clause);
  if (m) return { min: num(m[1]), raw: m[0], derived: 'ISO 2081 / ISO 19598 designation: the figure after the coating metal is the minimum local thickness in µm' };
  m = /\bZn\s?Ni\s?(\d{1,2})\b|\bZn\s?(\d{1,2})\s?(?:[A-Z]{1,2}\b|\/)/.exec(clause);
  if (m) return { min: num(m[1] ?? m[2]), raw: m[0], derived: 'designation: the figure after the coating metal is the thickness in µm' };
  return undefined;
}

export function extractCoating(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  const routes: Array<{ route: string; u: TextUnit; clause: string }> = [];
  const seen = new Set<string>();
  let thickness: { t: ThicknessRead; u: TextUnit } | undefined;
  let maskCount = 0, maskCounted = false;
  for (const u of units) {
    if (u.context.startsWith('title:') && !/title:(finish|material|heatTreatment)/.test(u.context)) continue;
    if (u.region === 'view' && u.context === 'free' && u.text.length < 6) continue;
    for (const clause of clauses(u.text)) {
      if (MASKING.test(clause)) {
        const k = `${u.sheet}|mask|${clause}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(draft('finish.masking', clause, u, { raw: clause, at: clause.slice(0, 24) }));
          const c = /\b(\d{1,2})\s?[xX×]\b|\b(\d{1,2})\s+(?:HOLES|THREADS|PLACES|POSITIONS|SURFACES|BOHRUNGEN|GEWINDE|STELLEN|FLÄCHEN)\b/.exec(clause);
          if (c) { maskCount += Number(c[1] ?? c[2]); maskCounted = true; }
        }
        continue;                                            // a masking clause names a coating only to exclude it
      }
      const found: string[] = [];
      for (const kw of COATING_KEYWORDS) {
        const m = kw.re.exec(clause);
        if (!m) continue;
        if (NEGATED.test(clause.slice(Math.max(0, m.index - 22), m.index))) continue;
        // "zinc-nickel" also matches nothing else; "anodise" must not fire inside "hard anodise"
        if (kw.route === 'anodise' && found.includes('hard-anodise')) continue;
        if (kw.route === 'zinc-plate' && found.includes('zinc-nickel')) continue;
        if (kw.route === 'nickel' && (found.includes('electroless-nickel') || found.includes('zinc-nickel'))) continue;
        if (kw.route === 'chrome' && /CHROMAT/i.test(m[0])) continue;
        found.push(kw.route);
      }
      if (!found.length) continue;
      const k = `${u.sheet}|${clause}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(draft('finish.coating', clause, u, { raw: clause, at: clause.slice(0, 24), note: `Process words recognised: ${found.join(' + ')}.` }));
      for (const r of found) routes.push({ route: r, u, clause });
      if (!thickness) { const t = findThickness(clause); if (t) thickness = { t, u }; }
    }
  }
  if (routes.length) {
    const first = routes[0];
    const list = [...new Set(routes.map(r => r.route))];
    out.push(draft('finish.coatingRoute', list.join(' + '), first.u, {
      raw: first.clause, at: first.clause.slice(0, 24), kind: 'interpreted',
      ...(list.length > 1 ? { status: 'needs-validation' as const } : {}),
      note: list.length > 1
        ? 'Several coating processes are named: whether they are one system (duplex) or alternatives is the engineer\'s reading.'
        : 'Named from the process words on the drawing.',
    }));
  }
  if (thickness) {
    const { t, u } = thickness;
    const v: Record<string, unknown> = {};
    if (t.min !== undefined) v.min = t.min;
    if (t.max !== undefined) v.max = t.max;
    if (t.nominal !== undefined) v.nominal = t.nominal;
    out.push(draft('finish.coatingThickness', v, u, { unit: 'µm', raw: t.raw, at: t.raw, ...(t.derived ? { kind: 'interpreted' as const, note: t.derived } : {}) }));
  }
  if (maskCounted) {
    const u = units.find(x => MASKING.test(x.text))!;
    out.push(draft('finish.maskedFeatures', maskCount, u, { kind: 'interpreted', note: 'Sum of the counts written in the masking notes.' }));
  }
  return out;
}
