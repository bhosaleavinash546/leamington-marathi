/**
 * Sheet grades by FAMILY → STANDARD → GRADE, for the sheet-metal (stamping) and sheet-metal fab forms
 * (material picker, Oct 2026) — both listed 82 grades in library order. Data only, no prices; see
 * material-taxonomy.ts.
 *
 * Sheet steel IS graded by standards (unlike plastics), so the middle step is the standard:
 * EN 10130 cold-rolled DC grades, EN 10346 hot-dip coated, EN 10268 cold-rolled high-strength,
 * EN 10149-2 hot-rolled structural, EN 10338 multiphase (AHSS), EN 10106 / 10107 electrical steel.
 * Where a library grade is a generic or proprietary name ("HSLA 340", Usibor, NO27 traction steel,
 * Q&P), its standard says so rather than inventing a designation. Families follow how a body or
 * e-machine engineer chooses: mild and deep-drawing, coated, high-strength, AHSS, press-hardening,
 * stainless, aluminium by series, electrical, copper, spring strip.
 * `tests/sheet-material-taxonomy.test.ts` requires every library sheet grade be listed.
 */
import { gradeInfoFrom, groupGrades, type GradeGroup, type MaterialTaxonomy } from './material-taxonomy.js';

export type SheetFamily =
  | 'mild' | 'coated' | 'hss' | 'ahss' | 'phs' | 'stainless' | 'aluminium' | 'electrical' | 'copper' | 'spring';

export const SHEET_FAMILIES: Array<{ id: SheetFamily; label: string; processes: string }> = [
  { id: 'mild', label: 'Mild & deep-drawing', processes: 'stamping, deep drawing, laser + press brake' },
  { id: 'coated', label: 'Coated steel', processes: 'stamping, laser + press brake' },
  { id: 'hss', label: 'High-strength (HSLA, BH)', processes: 'stamping, laser + press brake' },
  { id: 'ahss', label: 'AHSS', processes: 'cold stamping (springback compensation)' },
  { id: 'phs', label: 'Press-hardening (PHS)', processes: 'hot stamping (furnace + die quench), laser trim' },
  { id: 'stainless', label: 'Stainless steel', processes: 'stamping, deep drawing, laser + press brake' },
  { id: 'aluminium', label: 'Aluminium', processes: 'stamping, laser + press brake' },
  { id: 'electrical', label: 'Electrical steel', processes: 'lamination stamping (progressive die), laser' },
  { id: 'copper', label: 'Copper & brass', processes: 'stamping, laser + press brake' },
  { id: 'spring', label: 'Spring strip', processes: 'progressive stamping, then heat treatment' },
];

export const SHEET_STANDARDS: Record<SheetFamily, string[]> = {
  mild: ['EN 10130 cold-rolled (DC)', 'EN 10346 hot-dip coated (DX)', 'Hot-rolled pickled & oiled (HRPO)'],
  coated: ['EN 10346 hot-dip (GI, GA, ZM)', 'EN 10152 electrogalvanised (ZE)', 'Zn-Ni electrogalvanised (OEM spec)', 'EN 10202 tinplate'],
  hss: ['HSLA by minimum yield (MPa)', 'EN 10268 cold-rolled (BH, IF-HS)', 'EN 10149-2 hot-rolled (S…MC)'],
  ahss: ['Dual-phase (DP) — EN 10338', 'TRIP / complex-phase — EN 10338', 'Martensitic (MS) — EN 10338', '3rd generation (Q&P, medium-Mn) — supplier spec'],
  phs: ['Uncoated boron steel (22MnB5)', 'AlSi-coated PHS (Usibor — proprietary)'],
  stainless: ['Austenitic — EN 10088-2 / AISI', 'Ferritic — EN 10088-2 / AISI'],
  aluminium: [
    '5xxx Al-Mg — EN 485 / AA', '6xxx Al-Mg-Si (heat-treatable) — EN 485 / AA', '1xxx / 3xxx — EN 485 / AA',
    '7xxx Al-Zn — EN 485 / AA', 'Busbar (alloy per spec)',
  ],
  electrical: [
    'Non-oriented — EN 10106 (M…A)', 'Semi-processed non-oriented — EN 10126', 'Thin-gauge NO for EV traction (supplier spec)',
    'Grain-oriented — EN 10107 (M…P / S)', 'Soft-magnetic alloys (CoFe, NiFe, amorphous)',
  ],
  copper: ['UNS (US)', 'BS legacy (CZ)'],
  spring: ['EN 10132 carbon spring strip', 'EN 10151 stainless spring strip'],
};

/** Library id → [family, standard]. Order within a standard = order here (common first). */
const GRADES: Array<[string, SheetFamily, string]> = [
  // Mild & deep-drawing
  ['mat-dc01', 'mild', 'EN 10130 cold-rolled (DC)'],
  ['mat-dc04', 'mild', 'EN 10130 cold-rolled (DC)'],
  ['mat-dc05', 'mild', 'EN 10130 cold-rolled (DC)'],
  ['mat-dc06', 'mild', 'EN 10130 cold-rolled (DC)'],
  ['mat-greensteel-dc01', 'mild', 'EN 10130 cold-rolled (DC)'],
  ['mat-if-dx56', 'mild', 'EN 10346 hot-dip coated (DX)'],
  ['mat-hrpo', 'mild', 'Hot-rolled pickled & oiled (HRPO)'],
  // Coated
  ['mat-dc01-gi', 'coated', 'EN 10346 hot-dip (GI, GA, ZM)'],
  ['mat-dc03-ga', 'coated', 'EN 10346 hot-dip (GI, GA, ZM)'],
  ['mat-zm-coated', 'coated', 'EN 10346 hot-dip (GI, GA, ZM)'],
  ['mat-dc01-ze', 'coated', 'EN 10152 electrogalvanised (ZE)'],
  ['mat-znni-eg', 'coated', 'Zn-Ni electrogalvanised (OEM spec)'],
  ['mat-tinplate-etp', 'coated', 'EN 10202 tinplate'],
  // High-strength
  ['mat-hsla340', 'hss', 'HSLA by minimum yield (MPa)'],
  ['mat-hsla420', 'hss', 'HSLA by minimum yield (MPa)'],
  ['mat-hsla550', 'hss', 'HSLA by minimum yield (MPa)'],
  ['mat-bh260', 'hss', 'EN 10268 cold-rolled (BH, IF-HS)'],
  ['mat-if-hs260', 'hss', 'EN 10268 cold-rolled (BH, IF-HS)'],
  ['mat-s355mc', 'hss', 'EN 10149-2 hot-rolled (S…MC)'],
  ['mat-s420mc', 'hss', 'EN 10149-2 hot-rolled (S…MC)'],
  // AHSS
  ['mat-dp600', 'ahss', 'Dual-phase (DP) — EN 10338'],
  ['mat-dp780', 'ahss', 'Dual-phase (DP) — EN 10338'],
  ['mat-dp980', 'ahss', 'Dual-phase (DP) — EN 10338'],
  ['mat-dp1000', 'ahss', 'Dual-phase (DP) — EN 10338'],
  ['mat-trip780', 'ahss', 'TRIP / complex-phase — EN 10338'],
  ['mat-cp800', 'ahss', 'TRIP / complex-phase — EN 10338'],
  ['mat-ms1200', 'ahss', 'Martensitic (MS) — EN 10338'],
  ['mat-ms1300', 'ahss', 'Martensitic (MS) — EN 10338'],
  ['mat-ms1500', 'ahss', 'Martensitic (MS) — EN 10338'],
  ['mat-qp980', 'ahss', '3rd generation (Q&P, medium-Mn) — supplier spec'],
  ['mat-medmn1180', 'ahss', '3rd generation (Q&P, medium-Mn) — supplier spec'],
  // Press-hardening
  ['mat-22mnb5', 'phs', 'Uncoated boron steel (22MnB5)'],
  ['mat-usibor1500', 'phs', 'AlSi-coated PHS (Usibor — proprietary)'],
  ['mat-usibor2000', 'phs', 'AlSi-coated PHS (Usibor — proprietary)'],
  // Stainless
  ['mat-ss304-sheet', 'stainless', 'Austenitic — EN 10088-2 / AISI'],
  ['mat-ss316-sheet', 'stainless', 'Austenitic — EN 10088-2 / AISI'],
  ['mat-aisi430', 'stainless', 'Ferritic — EN 10088-2 / AISI'],
  ['mat-ss409l-sheet', 'stainless', 'Ferritic — EN 10088-2 / AISI'],
  ['mat-ss441-sheet', 'stainless', 'Ferritic — EN 10088-2 / AISI'],
  // Aluminium
  ['mat-aa5754-sheet', 'aluminium', '5xxx Al-Mg — EN 485 / AA'],
  ['mat-aa5182', 'aluminium', '5xxx Al-Mg — EN 485 / AA'],
  ['mat-aa5052', 'aluminium', '5xxx Al-Mg — EN 485 / AA'],
  ['mat-aa5083', 'aluminium', '5xxx Al-Mg — EN 485 / AA'],
  ['mat-al-recycled-5xxx', 'aluminium', '5xxx Al-Mg — EN 485 / AA'],
  ['mat-aa6016-t4', 'aluminium', '6xxx Al-Mg-Si (heat-treatable) — EN 485 / AA'],
  ['mat-aa6111-t4', 'aluminium', '6xxx Al-Mg-Si (heat-treatable) — EN 485 / AA'],
  ['mat-aa6082-sheet', 'aluminium', '6xxx Al-Mg-Si (heat-treatable) — EN 485 / AA'],
  ['mat-aa6061-sheet', 'aluminium', '6xxx Al-Mg-Si (heat-treatable) — EN 485 / AA'],
  ['mat-aa6063-sheet', 'aluminium', '6xxx Al-Mg-Si (heat-treatable) — EN 485 / AA'],
  ['mat-aa1050-sheet', 'aluminium', '1xxx / 3xxx — EN 485 / AA'],
  ['mat-aa3003-sheet', 'aluminium', '1xxx / 3xxx — EN 485 / AA'],
  ['mat-aa7075-t6', 'aluminium', '7xxx Al-Zn — EN 485 / AA'],
  ['mat-al-busbar', 'aluminium', 'Busbar (alloy per spec)'],
  // Electrical steel & soft-magnetic
  ['mat-nogo-m270-35a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-m235-35a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-m330-35a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-m250-50a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-nogo-m400-50a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-m470-50a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-m600-50a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-m700-65a', 'electrical', 'Non-oriented — EN 10106 (M…A)'],
  ['mat-no-semiproc-50', 'electrical', 'Semi-processed non-oriented — EN 10126'],
  ['mat-no27-27a', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-no25-25a', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-no20-20a', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-no15-15a', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-no10-10a', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-hsno-rotor-700', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-hsno-rotor-960', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-uhsno-1100', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-si65-jnex-10', 'electrical', 'Thin-gauge NO for EV traction (supplier spec)'],
  ['mat-go-m105-30p', 'electrical', 'Grain-oriented — EN 10107 (M…P / S)'],
  ['mat-cgo-m120-27', 'electrical', 'Grain-oriented — EN 10107 (M…P / S)'],
  ['mat-hgo-m090-23', 'electrical', 'Grain-oriented — EN 10107 (M…P / S)'],
  ['mat-cofe-hiperco50', 'electrical', 'Soft-magnetic alloys (CoFe, NiFe, amorphous)'],
  ['mat-cofe-thin-010', 'electrical', 'Soft-magnetic alloys (CoFe, NiFe, amorphous)'],
  ['mat-nife-permalloy80', 'electrical', 'Soft-magnetic alloys (CoFe, NiFe, amorphous)'],
  ['mat-amorphous-2605sa1', 'electrical', 'Soft-magnetic alloys (CoFe, NiFe, amorphous)'],
  // Copper & brass
  ['mat-c110-copper', 'copper', 'UNS (US)'],
  ['mat-cz108-brass', 'copper', 'BS legacy (CZ)'],
  // Spring strip
  ['mat-c67s-spring', 'spring', 'EN 10132 carbon spring strip'],
  ['mat-ss301-spring', 'spring', 'EN 10151 stainless spring strip'],
];

function familyOfCategory(category: string): SheetFamily {
  const c = category.toLowerCase();
  if (/electrical/.test(c)) return 'electrical';
  if (/stainless/.test(c)) return 'stainless';
  if (/spring/.test(c)) return 'spring';
  if (/press-hardening/.test(c)) return 'phs';
  if (/ahss|ultra-high/.test(c)) return 'ahss';
  if (/high strength|bake|^if /.test(c)) return 'hss';
  if (/galvanised|coated/.test(c)) return 'coated';
  if (/alumin/.test(c)) return 'aluminium';
  if (/copper|brass/.test(c)) return 'copper';
  return 'mild';
}

/** The grade a family opens on: the common automotive grade (DP600 for AHSS, 5754 for aluminium structure). */
export function sheetFamilyDefaultGrade(family: SheetFamily): string {
  switch (family) {
    case 'mild': return 'mat-dc01';
    case 'coated': return 'mat-dc01-gi';
    case 'hss': return 'mat-hsla340';
    case 'ahss': return 'mat-dp600';
    case 'phs': return 'mat-usibor1500';
    case 'stainless': return 'mat-ss304-sheet';
    case 'aluminium': return 'mat-aa5754-sheet';
    case 'electrical': return 'mat-nogo-m270-35a';
    case 'copper': return 'mat-c110-copper';
    case 'spring': return 'mat-c67s-spring';
  }
}

export const sheetGradeInfo = gradeInfoFrom(GRADES, familyOfCategory);

export const SHEET_TAXONOMY: MaterialTaxonomy = {
  families: SHEET_FAMILIES,
  standards: SHEET_STANDARDS,
  info: sheetGradeInfo,
  defaultGrade: f => sheetFamilyDefaultGrade(f as SheetFamily),
};

export function groupSheetGrades<M extends { id: string; category: string }>(materials: M[]): GradeGroup<M>[] {
  return groupGrades(SHEET_TAXONOMY, materials);
}
