/**
 * Forging grades by FAMILY → STANDARD → GRADE (forging material picker, Oct 2026) — the forging
 * form listed 45 billets in library order. Data only, no prices; see material-taxonomy.ts.
 *
 * A grade is filed under the standard of the FIRST designation its library name gives
 * (4130 / 25CrMo4 → AISI / SAE); equivalents stay in the grade text. Stainless is split by type
 * (austenitic, martensitic, PH, duplex), aluminium by series. `tests/forging-material-taxonomy.test.ts`
 * requires every library forging grade be listed.
 */
import { gradeInfoFrom, groupGrades, type GradeGroup, type MaterialTaxonomy } from './material-taxonomy.js';

export type ForgeFamily =
  | 'carbon_steel' | 'alloy_steel' | 'stainless' | 'aluminium' | 'titanium' | 'nickel' | 'magnesium' | 'copper';

export const FORGE_FAMILIES: Array<{ id: ForgeFamily; label: string; processes: string }> = [
  { id: 'carbon_steel', label: 'Carbon steel', processes: 'hot closed-die (hammer, press, upsetter)' },
  { id: 'alloy_steel', label: 'Alloy steel', processes: 'hot closed-die (hammer, press, upsetter)' },
  { id: 'stainless', label: 'Stainless steel', processes: 'hot closed-die (press, hammer)' },
  { id: 'aluminium', label: 'Aluminium', processes: 'hot closed-die (press)' },
  { id: 'titanium', label: 'Titanium', processes: 'hot closed-die (press)' },
  { id: 'nickel', label: 'Nickel alloys', processes: 'hot closed-die (press)' },
  { id: 'magnesium', label: 'Magnesium', processes: 'hot closed-die (press)' },
  { id: 'copper', label: 'Copper alloys', processes: 'hot stamping (press)' },
];

export const FORGE_STANDARDS: Record<ForgeFamily, string[]> = {
  carbon_steel: [
    'EN 10083 (non-alloy QT)', 'EN 10267 (microalloyed, controlled-cooled)', 'AISI / SAE (US)', 'ASTM A105 (flanges, valve bodies)',
  ],
  alloy_steel: [
    'EN 10083-3 (alloy QT)', 'EN 10084 (case-hardening)', 'AISI / SAE (US)', 'ASTM A182 (pressure forgings)',
  ],
  stainless: [
    'Austenitic — AISI / EN 10088', 'Martensitic — AISI / EN 10088', 'Precipitation-hardening — ASTM A564',
    'Duplex — EN 10088 / ASTM A182 F51',
  ],
  aluminium: ['6xxx Al-Mg-Si — EN 573 / AA', '2xxx Al-Cu — EN 573 / AA', '7xxx Al-Zn — EN 573 / AA'],
  titanium: ['ASTM B381 / B348 (grades)', 'AMS (aerospace)'],
  nickel: ['Proprietary (Inconel, Waspaloy, Hastelloy, Monel)'],
  magnesium: ['ASTM B91 (forgings)'],
  copper: ['EN 12420 (CW-)', 'BS legacy (CZ)'],
};

/** Library id → [family, standard]. Order within a standard = order here (common first). */
const GRADES: Array<[string, ForgeFamily, string]> = [
  // Carbon & microalloyed steel
  ['mat-steel-c45', 'carbon_steel', 'EN 10083 (non-alloy QT)'],
  ['mat-steel-c35', 'carbon_steel', 'EN 10083 (non-alloy QT)'],
  ['mat-steel-38mnvs6', 'carbon_steel', 'EN 10267 (microalloyed, controlled-cooled)'],
  ['mat-steel-30mnvs6', 'carbon_steel', 'EN 10267 (microalloyed, controlled-cooled)'],
  ['mat-steel-c70s6', 'carbon_steel', 'EN 10267 (microalloyed, controlled-cooled)'],
  ['mat-steel1020', 'carbon_steel', 'AISI / SAE (US)'],
  ['mat-steel1141', 'carbon_steel', 'AISI / SAE (US)'],
  ['mat-steel-a105', 'carbon_steel', 'ASTM A105 (flanges, valve bodies)'],
  // Alloy steel
  ['mat-steel-42crmo4', 'alloy_steel', 'EN 10083-3 (alloy QT)'],
  ['mat-steel-41cr4', 'alloy_steel', 'EN 10083-3 (alloy QT)'],
  ['mat-steel-34crnimo6', 'alloy_steel', 'EN 10083-3 (alloy QT)'],
  ['mat-steel-20mncr5', 'alloy_steel', 'EN 10084 (case-hardening)'],
  ['mat-steel-16mncr5', 'alloy_steel', 'EN 10084 (case-hardening)'],
  ['mat-steel-18crnimo7-6', 'alloy_steel', 'EN 10084 (case-hardening)'],
  ['mat-steel4130', 'alloy_steel', 'AISI / SAE (US)'],
  ['mat-steel4340', 'alloy_steel', 'AISI / SAE (US)'],
  ['mat-steel8620', 'alloy_steel', 'AISI / SAE (US)'],
  ['mat-steel-52100', 'alloy_steel', 'AISI / SAE (US)'],
  ['mat-steel-300m', 'alloy_steel', 'AISI / SAE (US)'],
  ['mat-steel-f22', 'alloy_steel', 'ASTM A182 (pressure forgings)'],
  // Stainless
  ['mat-ss304l-bar', 'stainless', 'Austenitic — AISI / EN 10088'],
  ['mat-ss316l-bar', 'stainless', 'Austenitic — AISI / EN 10088'],
  ['mat-ss410-bar', 'stainless', 'Martensitic — AISI / EN 10088'],
  ['mat-ss420-bar', 'stainless', 'Martensitic — AISI / EN 10088'],
  ['mat-ss431-bar', 'stainless', 'Martensitic — AISI / EN 10088'],
  ['mat-ss17-4ph-bar', 'stainless', 'Precipitation-hardening — ASTM A564'],
  ['mat-ss15-5ph-bar', 'stainless', 'Precipitation-hardening — ASTM A564'],
  ['mat-ss2205-bar', 'stainless', 'Duplex — EN 10088 / ASTM A182 F51'],
  // Aluminium
  ['mat-al6082-forge', 'aluminium', '6xxx Al-Mg-Si — EN 573 / AA'],
  ['mat-al6061-forge', 'aluminium', '6xxx Al-Mg-Si — EN 573 / AA'],
  ['mat-al2014-forge', 'aluminium', '2xxx Al-Cu — EN 573 / AA'],
  ['mat-al2618-forge', 'aluminium', '2xxx Al-Cu — EN 573 / AA'],
  ['mat-al7075-forge', 'aluminium', '7xxx Al-Zn — EN 573 / AA'],
  ['mat-al7050-forge', 'aluminium', '7xxx Al-Zn — EN 573 / AA'],
  // Titanium
  ['mat-ti-6al4v-forge', 'titanium', 'ASTM B381 / B348 (grades)'],
  ['mat-ti-cp-gr2', 'titanium', 'ASTM B381 / B348 (grades)'],
  ['mat-ti-6242-forge', 'titanium', 'AMS (aerospace)'],
  // Nickel
  ['mat-inconel718-forge', 'nickel', 'Proprietary (Inconel, Waspaloy, Hastelloy, Monel)'],
  ['mat-inconel625-forge', 'nickel', 'Proprietary (Inconel, Waspaloy, Hastelloy, Monel)'],
  ['mat-waspaloy-forge', 'nickel', 'Proprietary (Inconel, Waspaloy, Hastelloy, Monel)'],
  ['mat-hastelloy-c276-forge', 'nickel', 'Proprietary (Inconel, Waspaloy, Hastelloy, Monel)'],
  ['mat-monel400-forge', 'nickel', 'Proprietary (Inconel, Waspaloy, Hastelloy, Monel)'],
  // Magnesium
  ['mat-mg-az31-forge', 'magnesium', 'ASTM B91 (forgings)'],
  // Copper
  ['mat-ab2-forge', 'copper', 'EN 12420 (CW-)'],
  ['mat-brass-cz122-forge', 'copper', 'BS legacy (CZ)'],
];

function familyOfCategory(category: string): ForgeFamily {
  const c = category.toLowerCase();
  if (/stainless/.test(c)) return 'stainless';
  if (/^(alloy) steel/.test(c)) return 'alloy_steel';
  if (/steel/.test(c)) return 'carbon_steel';
  if (/alumin/.test(c)) return 'aluminium';
  if (/titanium/.test(c)) return 'titanium';
  if (/magnesium/.test(c)) return 'magnesium';
  if (/copper|bronze|brass/.test(c)) return 'copper';
  return 'nickel';
}

/**
 * The grade a family opens on: the common automotive forging grade of each family (C45 for
 * crankshafts and hubs, 42CrMo4 for QT parts, 6082 for suspension arms).
 */
export function forgeFamilyDefaultGrade(family: ForgeFamily): string {
  switch (family) {
    case 'carbon_steel': return 'mat-steel-c45';
    case 'alloy_steel': return 'mat-steel-42crmo4';
    case 'stainless': return 'mat-ss304l-bar';
    case 'aluminium': return 'mat-al6082-forge';
    case 'titanium': return 'mat-ti-6al4v-forge';
    case 'nickel': return 'mat-inconel718-forge';
    case 'magnesium': return 'mat-mg-az31-forge';
    case 'copper': return 'mat-brass-cz122-forge';
  }
}

export const forgeGradeInfo = gradeInfoFrom(GRADES, familyOfCategory);

export const FORGING_TAXONOMY: MaterialTaxonomy = {
  families: FORGE_FAMILIES,
  standards: FORGE_STANDARDS,
  info: forgeGradeInfo,
  defaultGrade: f => forgeFamilyDefaultGrade(f as ForgeFamily),
};

export function groupForgingGrades<M extends { id: string; category: string }>(materials: M[]): GradeGroup<M>[] {
  return groupGrades(FORGING_TAXONOMY, materials);
}
