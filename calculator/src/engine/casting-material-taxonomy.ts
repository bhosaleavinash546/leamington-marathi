/**
 * Casting grades by FAMILY → STANDARD → GRADE, so a cost engineer picks "Cast iron", then
 * "Ductile (SG) — EN 1563", then "EN-GJS-500-7" instead of scrolling 59 grades in library order
 * (casting material picker, Oct 2026).
 *
 * Data only — no prices. The grade text is the library's own (`material.grade`); this table adds
 * where the grade belongs. A grade is filed under the standard of the FIRST designation its library
 * name gives (LM25 / A356 → BS 1490); equivalents stay in the grade text. A grade the table does not
 * know (a company rate book's own) is filed by its category under "Other / company grades", never
 * dropped. `tests/casting-material-taxonomy.test.ts` requires every library casting grade be listed.
 */

import { OTHER_STANDARD, gradeInfoFrom, groupGrades, type GradeGroup, type GradeInfo, type MaterialTaxonomy } from './material-taxonomy.js';

export { OTHER_STANDARD };

export type CastFamily =
  | 'aluminium' | 'cast_iron' | 'steel' | 'stainless' | 'magnesium' | 'zinc' | 'copper' | 'nickel';

export const CAST_FAMILIES: Array<{ id: CastFamily; label: string; processes: string }> = [
  { id: 'aluminium', label: 'Aluminium', processes: 'HPDC, gravity, sand, low-pressure' },
  { id: 'cast_iron', label: 'Cast iron', processes: 'sand (green sand, shell, lost foam)' },
  { id: 'steel', label: 'Steel', processes: 'sand, investment' },
  { id: 'stainless', label: 'Stainless steel', processes: 'sand, investment' },
  { id: 'magnesium', label: 'Magnesium', processes: 'HPDC' },
  { id: 'zinc', label: 'Zinc', processes: 'HPDC (hot chamber)' },
  { id: 'copper', label: 'Copper alloys', processes: 'sand, gravity' },
  { id: 'nickel', label: 'Nickel superalloy', processes: 'investment' },
];

/** Standards in the order they are listed within their family (common first). */
export const CAST_STANDARDS: Record<CastFamily, string[]> = {
  aluminium: [
    'EN 1706 (EN AC-)', 'BS 1490 (LM)', 'AA / ASTM (US)', 'JIS H 5302 (ADC)', 'Proprietary structural HPDC',
  ],
  cast_iron: [
    'Grey — EN 1561 (EN-GJL)', 'Ductile (SG) — EN 1563 (EN-GJS)', 'Compacted graphite — EN 16079 (EN-GJV)',
    'Austempered ductile (ADI) — EN 1564', 'High-temperature SiMo ductile — EN 16124', 'Malleable — EN 1562 (EN-GJMB)',
    'Austenitic (Ni-Resist) — EN 13835', 'Abrasion-resistant white — EN 12513 / ASTM A532',
  ],
  steel: ['EN 10293 (general engineering)', 'DIN legacy (GS-)', 'Manganese wear steel — EN 10349'],
  stainless: ['ASTM A743 / EN 10283 (corrosion-resistant)', 'ASTM A890 (duplex)', 'ASTM A747 (precipitation-hardening)'],
  magnesium: ['ASTM B94 / EN 1753'],
  zinc: ['EN 12844 / ASTM B86'],
  copper: ['EN 1982 (CC-)', 'UNS / ASTM (US)'],
  nickel: ['Proprietary superalloy (Inconel)'],
};

/**
 * The grade a family opens on when the engineer picks the family (they then refine it). The common
 * automotive grade of each family; aluminium follows the casting route — a die-cast alloy for HPDC,
 * a sand / gravity alloy otherwise. Cast iron opens on grey EN-GJL-250, the representative grade the
 * rules cost (`castIronDefaultGrade`); a safety-critical part is moved to ductile by the rules.
 */
export function familyDefaultGrade(family: CastFamily, subtype?: string): string {
  switch (family) {
    case 'aluminium': return subtype === 'hpdc' ? 'mat-adc12' : 'mat-lm25';
    case 'cast_iron': return 'mat-gjl250';
    case 'steel': return 'mat-g20mn5';
    case 'stainless': return 'mat-cf8m-cast';
    case 'magnesium': return 'mat-mag-az91';
    case 'zinc': return 'mat-zamak3';
    case 'copper': return 'mat-lg2-gunmetal';
    case 'nickel': return 'mat-inconel718-cast';
  }
}

/** Families that can be high-pressure die cast. */
export const HPDC_FAMILIES: CastFamily[] = ['aluminium', 'magnesium', 'zinc'];

/** Library id → [family, standard]. Order within a standard = order here. */
const GRADES: Array<[string, CastFamily, string]> = [
  // Aluminium
  ['mat-almg5-cast', 'aluminium', 'EN 1706 (EN AC-)'],
  ['mat-alsi10mg', 'aluminium', 'EN 1706 (EN AC-)'],
  ['mat-a365', 'aluminium', 'EN 1706 (EN AC-)'],
  ['mat-lm25', 'aluminium', 'BS 1490 (LM)'],
  ['mat-lm6', 'aluminium', 'BS 1490 (LM)'],
  ['mat-lm4', 'aluminium', 'BS 1490 (LM)'],
  ['mat-a380', 'aluminium', 'AA / ASTM (US)'],
  ['mat-a413', 'aluminium', 'AA / ASTM (US)'],
  ['mat-a319', 'aluminium', 'AA / ASTM (US)'],
  ['mat-a390', 'aluminium', 'AA / ASTM (US)'],
  ['mat-a357', 'aluminium', 'AA / ASTM (US)'],
  ['mat-a206', 'aluminium', 'AA / ASTM (US)'],
  ['mat-adc12', 'aluminium', 'JIS H 5302 (ADC)'],
  ['mat-adc12-secondary', 'aluminium', 'JIS H 5302 (ADC)'],
  ['mat-silafont36', 'aluminium', 'Proprietary structural HPDC'],
  ['mat-aural5', 'aluminium', 'Proprietary structural HPDC'],
  ['mat-castasil37', 'aluminium', 'Proprietary structural HPDC'],
  ['mat-magsimal59', 'aluminium', 'Proprietary structural HPDC'],
  ['mat-al-hpdc-lowco2', 'aluminium', 'Proprietary structural HPDC'],
  ['mat-htf-gigacast', 'aluminium', 'Proprietary structural HPDC'],
  // Cast iron
  ['mat-gjl200', 'cast_iron', 'Grey — EN 1561 (EN-GJL)'],
  ['mat-gjl250', 'cast_iron', 'Grey — EN 1561 (EN-GJL)'],
  ['mat-gjl300', 'cast_iron', 'Grey — EN 1561 (EN-GJL)'],
  ['mat-gjl350', 'cast_iron', 'Grey — EN 1561 (EN-GJL)'],
  ['mat-gjs400', 'cast_iron', 'Ductile (SG) — EN 1563 (EN-GJS)'],
  ['mat-gjs450-ssf', 'cast_iron', 'Ductile (SG) — EN 1563 (EN-GJS)'],
  ['mat-gjs500', 'cast_iron', 'Ductile (SG) — EN 1563 (EN-GJS)'],
  ['mat-gjs600', 'cast_iron', 'Ductile (SG) — EN 1563 (EN-GJS)'],
  ['mat-gjs700', 'cast_iron', 'Ductile (SG) — EN 1563 (EN-GJS)'],
  ['mat-gjv450', 'cast_iron', 'Compacted graphite — EN 16079 (EN-GJV)'],
  ['mat-adi', 'cast_iron', 'Austempered ductile (ADI) — EN 1564'],
  ['mat-simo', 'cast_iron', 'High-temperature SiMo ductile — EN 16124'],
  ['mat-gjmb350', 'cast_iron', 'Malleable — EN 1562 (EN-GJMB)'],
  ['mat-ni-resist-d2', 'cast_iron', 'Austenitic (Ni-Resist) — EN 13835'],
  ['mat-hicr-white', 'cast_iron', 'Abrasion-resistant white — EN 12513 / ASTM A532'],
  // Steel
  ['mat-g20mn5', 'steel', 'EN 10293 (general engineering)'],
  ['mat-g42crmo4', 'steel', 'EN 10293 (general engineering)'],
  ['mat-gs-c25', 'steel', 'DIN legacy (GS-)'],
  ['mat-hadfield', 'steel', 'Manganese wear steel — EN 10349'],
  // Stainless
  ['mat-ss304-cast', 'stainless', 'ASTM A743 / EN 10283 (corrosion-resistant)'],
  ['mat-cf8m-cast', 'stainless', 'ASTM A743 / EN 10283 (corrosion-resistant)'],
  ['mat-ca6nm-cast', 'stainless', 'ASTM A743 / EN 10283 (corrosion-resistant)'],
  ['mat-cd4mcun-cast', 'stainless', 'ASTM A890 (duplex)'],
  ['mat-17-4ph-cast', 'stainless', 'ASTM A747 (precipitation-hardening)'],
  // Magnesium
  ['mat-mag-az91', 'magnesium', 'ASTM B94 / EN 1753'],
  ['mat-mag-am60', 'magnesium', 'ASTM B94 / EN 1753'],
  ['mat-mag-am50', 'magnesium', 'ASTM B94 / EN 1753'],
  ['mat-mag-ae44', 'magnesium', 'ASTM B94 / EN 1753'],
  // Zinc
  ['mat-zamak3', 'zinc', 'EN 12844 / ASTM B86'],
  ['mat-zamak5', 'zinc', 'EN 12844 / ASTM B86'],
  ['mat-zamak2', 'zinc', 'EN 12844 / ASTM B86'],
  ['mat-za8', 'zinc', 'EN 12844 / ASTM B86'],
  ['mat-za27', 'zinc', 'EN 12844 / ASTM B86'],
  // Copper
  ['mat-lg2-gunmetal', 'copper', 'EN 1982 (CC-)'],
  ['mat-ab2-cast', 'copper', 'EN 1982 (CC-)'],
  ['mat-brass-cast-cb754', 'copper', 'EN 1982 (CC-)'],
  ['mat-bronze-c905', 'copper', 'UNS / ASTM (US)'],
  // Nickel
  ['mat-inconel718-cast', 'nickel', 'Proprietary superalloy (Inconel)'],
  ['mat-in713c-cast', 'nickel', 'Proprietary superalloy (Inconel)'],
];

/** A grade the table does not list is filed by its library category. */
function familyOfCategory(category: string): CastFamily {
  const c = category.toLowerCase();
  if (/alumin/.test(c)) return 'aluminium';
  if (/iron/.test(c)) return 'cast_iron';
  if (/stainless/.test(c)) return 'stainless';
  if (/steel/.test(c)) return 'steel';
  if (/magnesium/.test(c)) return 'magnesium';
  if (/zinc/.test(c)) return 'zinc';
  if (/copper|bronze|brass/.test(c)) return 'copper';
  return 'nickel';
}

/** Short process / use note shown beside an aluminium grade (its library category). */
const AL_USE: Record<string, string> = {
  'die cast aluminium': 'die-cast', 'structural hpdc aluminium': 'structural HPDC', 'gravity/sand aluminium': 'sand / gravity',
};

export type CastGradeInfo = GradeInfo & { family: CastFamily };

export const castGradeInfo = gradeInfoFrom(GRADES, familyOfCategory, c => AL_USE[c.toLowerCase()]) as (m: { id: string; category: string }) => CastGradeInfo;

export const CASTING_TAXONOMY: MaterialTaxonomy = {
  families: CAST_FAMILIES,
  standards: CAST_STANDARDS,
  info: castGradeInfo,
  defaultGrade: (f, subtype) => familyDefaultGrade(f as CastFamily, subtype),
  routeWarning: (f, subtype) => subtype === 'hpdc' && !HPDC_FAMILIES.includes(f as CastFamily)
    ? `${CAST_FAMILIES.find(x => x.id === f)?.label ?? f} cannot be high-pressure die cast — HPDC is for aluminium, magnesium or zinc. Set the subtype to sand or investment.`
    : null,
};

export const familyLabel = (f: CastFamily): string => CAST_FAMILIES.find(x => x.id === f)!.label;

export type CastGroup<M> = GradeGroup<M> & { family: CastFamily };

/** The grades grouped family → standard, in display order (families and standards with no grade are left out). */
export function groupCastingGrades<M extends { id: string; category: string }>(materials: M[]): CastGroup<M>[] {
  return groupGrades(CASTING_TAXONOMY, materials) as CastGroup<M>[];
}
