/**
 * Injection-moulding resins by FAMILY → POLYMER → GRADE (moulding material picker, Oct 2026).
 *
 * Plastics are not graded by a material standard the way metals are: a resin is its base polymer
 * (ISO 1043-1 code: PP, PA66, PC+ABS) plus a filler / modifier (ISO 1043-2: GF30 = 30% glass
 * fibre, T20 = 20% talc), marked on the part per ISO 11469 (`>PA66-GF30<`) and bought by trade
 * grade from a datasheet. So the middle step is the POLYMER, and the info line carries what changes
 * the moulding decision: morphology (shrinkage, warp, cooling share) and whether the resin must be
 * dried. Those are qualitative facts for the engineer — no cost reads them; the cooling factor and
 * cavity pressure stay in `autoCoolFactorForMaterial` / `cavityPressureMPaFor`.
 *
 * Families follow chemistry, not the library's three categories: PPA sits with the polyamides and
 * TPO (PP/EPDM) with the polyolefins. A marking is written only where unambiguous (none for FR
 * grades, whose ISO 1043-4 code depends on the retardant). See
 * docs/cad/moulding-material-picker-plan-2026-10.md; `tests/moulding-material-taxonomy.test.ts`.
 */
import { gradeInfoFrom, groupGrades, type GradeGroup, type MaterialTaxonomy } from './material-taxonomy.js';

export type MouldFamily =
  | 'polyolefin' | 'polyamide' | 'styrenic' | 'polycarbonate' | 'polyester' | 'acetal' | 'high_performance' | 'tpe' | 'other';

export const MOULD_FAMILIES: Array<{ id: MouldFamily; label: string; processes: string }> = [
  { id: 'polyolefin', label: 'Polyolefins (PP, PE)', processes: 'injection moulding' },
  { id: 'polyamide', label: 'Polyamides (nylon)', processes: 'injection moulding' },
  { id: 'styrenic', label: 'Styrenics (ABS, ASA, PS)', processes: 'injection moulding' },
  { id: 'polycarbonate', label: 'Polycarbonate & blends', processes: 'injection moulding' },
  { id: 'polyester', label: 'Polyesters (PBT, PET)', processes: 'injection moulding' },
  { id: 'acetal', label: 'Acetal (POM)', processes: 'injection moulding' },
  { id: 'high_performance', label: 'High-performance', processes: 'injection moulding' },
  { id: 'tpe', label: 'Thermoplastic elastomers', processes: 'injection moulding, overmoulding' },
  { id: 'other', label: 'Other thermoplastics', processes: 'injection moulding' },
];

/** Base polymer: its label in the picker, morphology and whether it must be dried before moulding. */
interface Polymer { label: string; morphology: string; dry: boolean }

const P = (label: string, morphology: string, dry: boolean): Polymer => ({ label, morphology, dry });
const SEMI = 'semi-crystalline', AMOR = 'amorphous', ELAST = 'elastomer';

export const POLYMERS: Record<string, Polymer> = {
  PP: P('PP — polypropylene', SEMI, false),
  PE: P('PE — polyethylene', SEMI, false),
  TPO: P('TPO — PP/EPDM olefin blend', SEMI, false),
  PA6: P('PA6 — polyamide 6', SEMI, true),
  PA66: P('PA66 — polyamide 66', SEMI, true),
  PA12: P('PA12 — polyamide 12', SEMI, true),
  PA610: P('PA610 — polyamide 610', SEMI, true),
  PPA: P('PPA — polyphthalamide (high-temp PA)', SEMI, true),
  ABS: P('ABS', AMOR, true),
  ASA: P('ASA', AMOR, true),
  SAN: P('SAN', AMOR, true),
  PS: P('PS — polystyrene (GPPS, HIPS)', AMOR, false),
  PC: P('PC — polycarbonate', AMOR, true),
  'PC+ABS': P('PC+ABS', AMOR, true),
  'PC+PBT': P('PC+PBT', 'amorphous / semi-crystalline blend', true),
  PBT: P('PBT', SEMI, true),
  PET: P('PET', SEMI, true),
  POM: P('POM — acetal', SEMI, false),
  PPS: P('PPS', SEMI, true),
  PEEK: P('PEEK', SEMI, true),
  PEI: P('PEI', AMOR, true),
  LCP: P('LCP — liquid-crystal polymer', 'liquid-crystalline', true),
  PSU: P('PSU — polysulfone', AMOR, true),
  PPSU: P('PPSU', AMOR, true),
  TPU: P('TPU', ELAST, true),
  TPV: P('TPV — PP/EPDM vulcanisate', ELAST, true),
  TPS: P('TPS — styrenic (SEBS)', ELAST, false),
  PMMA: P('PMMA — acrylic', AMOR, true),
  'PPE+PS': P('PPE+PS — modified PPE', AMOR, true),
  PVC: P('PVC', AMOR, false),
  PLA: P('PLA', SEMI, true),
};

/** Polymers per family, in display order. The picker's middle step shows `POLYMERS[k].label`. */
const FAMILY_POLYMERS: Record<MouldFamily, string[]> = {
  polyolefin: ['PP', 'PE', 'TPO'],
  polyamide: ['PA66', 'PA6', 'PA12', 'PA610', 'PPA'],
  styrenic: ['ABS', 'ASA', 'SAN', 'PS'],
  polycarbonate: ['PC', 'PC+ABS', 'PC+PBT'],
  polyester: ['PBT', 'PET'],
  acetal: ['POM'],
  high_performance: ['PPS', 'PEEK', 'PEI', 'LCP', 'PSU', 'PPSU'],
  tpe: ['TPV', 'TPU', 'TPS'],
  other: ['PMMA', 'PPE+PS', 'PVC', 'PLA'],
};

export const MOULD_STANDARDS: Record<MouldFamily, string[]> = Object.fromEntries(
  Object.entries(FAMILY_POLYMERS).map(([f, ps]) => [f, ps.map(p => POLYMERS[p].label)]),
) as Record<MouldFamily, string[]>;

/** Library id → family, polymer, ISO 11469 marking (null where it is not unambiguous). Order = display order. */
const GRADES: Array<[string, MouldFamily, string, string | null]> = [
  // Polyolefins
  ['mat-pp', 'polyolefin', 'PP', '>PP<'],
  ['mat-pp-homo', 'polyolefin', 'PP', '>PP<'],
  ['mat-pp-impact', 'polyolefin', 'PP', '>PP<'],
  ['mat-pp-t20', 'polyolefin', 'PP', '>PP-T20<'],
  ['mat-pp-t30', 'polyolefin', 'PP', '>PP-T30<'],
  ['mat-pp-gf30', 'polyolefin', 'PP', '>PP-GF30<'],
  ['mat-pp-lgf30', 'polyolefin', 'PP', '>PP-GF30<'],
  ['mat-pcr-pp', 'polyolefin', 'PP', '>PP<'],
  ['mat-hdpe', 'polyolefin', 'PE', '>PE-HD<'],
  ['mat-ldpe', 'polyolefin', 'PE', '>PE-LD<'],
  ['mat-lldpe', 'polyolefin', 'PE', '>PE-LLD<'],
  ['mat-tpo', 'polyolefin', 'TPO', '>TPO<'],
  // Polyamides
  ['mat-pa66', 'polyamide', 'PA66', '>PA66<'],
  ['mat-pa66gf30', 'polyamide', 'PA66', '>PA66-GF30<'],
  ['mat-pa66-gf35', 'polyamide', 'PA66', '>PA66-GF35<'],
  ['mat-pa66-gf50', 'polyamide', 'PA66', '>PA66-GF50<'],
  ['mat-pa66-min', 'polyamide', 'PA66', null],
  ['mat-pa66-gf25-fr', 'polyamide', 'PA66', null],
  ['mat-pa6', 'polyamide', 'PA6', '>PA6<'],
  ['mat-pa6-gf30', 'polyamide', 'PA6', '>PA6-GF30<'],
  ['mat-pa12', 'polyamide', 'PA12', '>PA12<'],
  ['mat-bio-pa610', 'polyamide', 'PA610', '>PA610<'],
  ['mat-ppa-gf35', 'polyamide', 'PPA', '>PPA-GF35<'],
  // Styrenics
  ['mat-abs', 'styrenic', 'ABS', '>ABS<'],
  ['mat-abs-fr', 'styrenic', 'ABS', null],
  ['mat-asa', 'styrenic', 'ASA', '>ASA<'],
  ['mat-san', 'styrenic', 'SAN', '>SAN<'],
  ['mat-gpps', 'styrenic', 'PS', '>PS<'],
  ['mat-hips', 'styrenic', 'PS', null],
  // Polycarbonate & blends
  ['mat-pc', 'polycarbonate', 'PC', '>PC<'],
  ['mat-pc-gf20', 'polycarbonate', 'PC', '>PC-GF20<'],
  ['mat-pc-fr', 'polycarbonate', 'PC', null],
  ['mat-pc-glazing', 'polycarbonate', 'PC', '>PC<'],
  ['mat-pc-abs', 'polycarbonate', 'PC+ABS', '>PC+ABS<'],
  ['mat-pc-pbt', 'polycarbonate', 'PC+PBT', '>PC+PBT<'],
  // Polyesters
  ['mat-pbt', 'polyester', 'PBT', '>PBT<'],
  ['mat-pbt-gf30', 'polyester', 'PBT', '>PBT-GF30<'],
  ['mat-pet-gf30', 'polyester', 'PET', '>PET-GF30<'],
  ['mat-pet-bg', 'polyester', 'PET', '>PET<'],
  // Acetal
  ['mat-pom', 'acetal', 'POM', '>POM<'],
  // High-performance
  ['mat-pps-gf40', 'high_performance', 'PPS', '>PPS-GF40<'],
  ['mat-peek', 'high_performance', 'PEEK', '>PEEK<'],
  ['mat-peek-gf30', 'high_performance', 'PEEK', '>PEEK-GF30<'],
  ['mat-pei', 'high_performance', 'PEI', '>PEI<'],
  ['mat-pei-gf30', 'high_performance', 'PEI', '>PEI-GF30<'],
  ['mat-lcp-gf30', 'high_performance', 'LCP', '>LCP-GF30<'],
  ['mat-psu', 'high_performance', 'PSU', '>PSU<'],
  ['mat-ppsu', 'high_performance', 'PPSU', '>PPSU<'],
  // Thermoplastic elastomers
  ['mat-tpv', 'tpe', 'TPV', '>TPV<'],
  ['mat-tpu-shore85', 'tpe', 'TPU', '>TPU<'],
  ['mat-tpe-s-im', 'tpe', 'TPS', '>TPS<'],
  // Other
  ['mat-pmma', 'other', 'PMMA', '>PMMA<'],
  ['mat-mppe', 'other', 'PPE+PS', '>PPE+PS<'],
  ['mat-upvc', 'other', 'PVC', '>PVC-U<'],
  ['mat-fpvc', 'other', 'PVC', '>PVC-P<'],
  ['mat-pla', 'other', 'PLA', '>PLA<'],
];

const BY_ID = new Map(GRADES.map(([id, family, polymer, marking]) => [id, { family, polymer, marking }]));

/** The base polymer and ISO marking of a moulding grade, or null for a grade the table does not know. */
export function mouldGradeFacts(id: string): { family: MouldFamily; polymer: string; marking: string | null } | null {
  return BY_ID.get(id) ?? null;
}

function familyOfCategory(category: string): MouldFamily {
  const c = category.toLowerCase();
  if (/elastomer/.test(c)) return 'tpe';
  if (/high-performance/.test(c)) return 'high_performance';
  return 'other';
}

export const mouldGradeInfo = gradeInfoFrom(
  GRADES.map(([id, family, polymer]) => [id, family, POLYMERS[polymer].label] as [string, string, string]),
  familyOfCategory,
);

/** The grade a family opens on: the commonest automotive moulding grade of each family. */
export function mouldFamilyDefaultGrade(family: MouldFamily): string {
  switch (family) {
    case 'polyolefin': return 'mat-pp';
    case 'polyamide': return 'mat-pa66gf30';
    case 'styrenic': return 'mat-abs';
    case 'polycarbonate': return 'mat-pc-abs';
    case 'polyester': return 'mat-pbt-gf30';
    case 'acetal': return 'mat-pom';
    case 'high_performance': return 'mat-pps-gf40';
    case 'tpe': return 'mat-tpv';
    case 'other': return 'mat-pmma';
  }
}

/** "Polyamides (nylon) · PA66 · semi-crystalline · dry before moulding · 1,300 kg/m³ · marking >PA66-GF30<" */
export function describeMouldGrade(id: string, densityKgPerM3: number): string | null {
  const g = BY_ID.get(id);
  if (!g) return null;
  const p = POLYMERS[g.polymer];
  const fam = MOULD_FAMILIES.find(f => f.id === g.family)!.label;
  return [fam, g.polymer, p.morphology, p.dry ? 'dry before moulding' : 'no drying needed',
    `${densityKgPerM3.toLocaleString('en-GB')} kg/m³`, g.marking ? `marking ${g.marking}` : null].filter(Boolean).join(' · ');
}

export const MOULDING_TAXONOMY: MaterialTaxonomy = {
  families: MOULD_FAMILIES,
  standards: MOULD_STANDARDS,
  levelLabel: 'Polymer',
  info: mouldGradeInfo,
  describe: describeMouldGrade,
  defaultGrade: f => mouldFamilyDefaultGrade(f as MouldFamily),
};

export function groupMouldingGrades<M extends { id: string; category: string }>(materials: M[]): GradeGroup<M>[] {
  return groupGrades(MOULDING_TAXONOMY, materials);
}
