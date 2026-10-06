/**
 * Plastics by FAMILY → POLYMER → GRADE, for the injection-moulding, blow-moulding, thermoforming and
 * extrusion forms (material picker, Oct 2026).
 *
 * Plastics are not graded by a material standard the way metals are: a resin is its base polymer
 * (ISO 1043-1 code: PP, PA66, PC+ABS) plus a filler / modifier (ISO 1043-2: GF30 = 30% glass
 * fibre, T20 = 20% talc), marked on the part per ISO 11469 (`>PA66-GF30<`) and bought by trade
 * grade from a datasheet. So the middle step is the POLYMER, and the info line carries what changes
 * the process decision: morphology (shrinkage, warp, cooling share) and whether the polymer takes up
 * water (it must be dried before moulding or extrusion; a sheet may need pre-drying before forming).
 * Those are qualitative facts for the engineer — no cost reads them; the cooling factor and cavity
 * pressure stay in `autoCoolFactorForMaterial` / `cavityPressureMPaFor`.
 *
 * ONE polymer list and ONE family list serve all four forms; each form has its own grade table,
 * because each buys a different form of the polymer (pellets, blow grades, sheet, pipe and profile
 * compounds). Families follow chemistry, not the library's categories: PPA sits with the polyamides,
 * TPO (PP/EPDM) and EVA with the polyolefins, PVC in its own family (it is most of extrusion). A
 * marking is written only where unambiguous — none for FR grades (the ISO 1043-4 code depends on the
 * retardant), multilayer / co-extruded stock, foams or a polymer ISO 1043 does not code.
 * See docs/cad/moulding-material-picker-plan-2026-10.md; tests/polymer-material-taxonomy.test.ts.
 */
import { gradeInfoFrom, groupGrades, type GradeGroup, type MaterialTaxonomy } from './material-taxonomy.js';

export type PolymerFamily =
  | 'polyolefin' | 'polyamide' | 'styrenic' | 'polycarbonate' | 'polyester' | 'vinyl' | 'acetal'
  | 'high_performance' | 'tpe' | 'other';

export const POLYMER_FAMILIES: Array<{ id: PolymerFamily; label: string; processes: string }> = [
  { id: 'polyolefin', label: 'Polyolefins (PP, PE)', processes: '' },
  { id: 'polyamide', label: 'Polyamides (nylon)', processes: '' },
  { id: 'styrenic', label: 'Styrenics (ABS, ASA, PS)', processes: '' },
  { id: 'polycarbonate', label: 'Polycarbonate & blends', processes: '' },
  { id: 'polyester', label: 'Polyesters (PBT, PET)', processes: '' },
  { id: 'vinyl', label: 'PVC (vinyls)', processes: '' },
  { id: 'acetal', label: 'Acetal (POM)', processes: '' },
  { id: 'high_performance', label: 'High-performance', processes: '' },
  { id: 'tpe', label: 'Thermoplastic elastomers', processes: '' },
  { id: 'other', label: 'Other thermoplastics', processes: '' },
];

/** Base polymer: its label in the picker, morphology and whether it takes up water (null = depends on the grade). */
interface Polymer { label: string; morphology: string; dry: boolean | null }

const P = (label: string, morphology: string, dry: boolean | null): Polymer => ({ label, morphology, dry });
const SEMI = 'semi-crystalline', AMOR = 'amorphous', ELAST = 'elastomer';

export const POLYMERS: Record<string, Polymer> = {
  PP: P('PP — polypropylene', SEMI, false),
  PE: P('PE — polyethylene', SEMI, false),
  'PE-X': P('PE-X — crosslinked polyethylene', SEMI, false),
  EVA: P('EVA — ethylene vinyl acetate', SEMI, false),
  TPO: P('TPO — PP/EPDM olefin blend', SEMI, false),
  PA6: P('PA6 — polyamide 6', SEMI, true),
  PA66: P('PA66 — polyamide 66', SEMI, true),
  PA11: P('PA11 — polyamide 11', SEMI, true),
  PA12: P('PA12 — polyamide 12', SEMI, true),
  PA610: P('PA610 — polyamide 610', SEMI, true),
  PPA: P('PPA — polyphthalamide (high-temp PA)', SEMI, true),
  ABS: P('ABS', AMOR, true),
  ASA: P('ASA', AMOR, true),
  SAN: P('SAN', AMOR, true),
  PS: P('PS — polystyrene (GPPS, HIPS)', AMOR, false),
  COEX: P('Co-extruded ABS sheet (capped)', AMOR, true),
  PC: P('PC — polycarbonate', AMOR, true),
  'PC+ABS': P('PC+ABS', AMOR, true),
  'PC+PBT': P('PC+PBT', 'amorphous / semi-crystalline blend', true),
  PBT: P('PBT', SEMI, true),
  PET: P('PET', SEMI, true),
  PETG: P('PETG — glycol-modified PET', AMOR, true),
  COPE: P('Copolyester (Tritan-type)', AMOR, true),
  PVC: P('PVC', AMOR, false),
  POM: P('POM — acetal', SEMI, false),
  PPS: P('PPS', SEMI, true),
  PEEK: P('PEEK', SEMI, true),
  PEI: P('PEI', AMOR, true),
  LCP: P('LCP — liquid-crystal polymer', 'liquid-crystalline', true),
  PSU: P('PSU — polysulfone', AMOR, true),
  PPSU: P('PPSU', AMOR, true),
  PVDF: P('PVDF — fluoropolymer', SEMI, false),
  TPU: P('TPU', ELAST, true),
  TPV: P('TPV — PP/EPDM vulcanisate', ELAST, true),
  TPS: P('TPS — styrenic (SEBS)', ELAST, false),
  TPE: P('TPE — type per datasheet', ELAST, null),
  PMMA: P('PMMA — acrylic', AMOR, true),
  'PPE+PS': P('PPE+PS — modified PPE', AMOR, true),
  PLA: P('PLA', SEMI, true),
};

/** A grade: library id, family, polymer, ISO 11469 marking (null where not unambiguous), morphology when it differs from the polymer's. */
type Row = [id: string, family: PolymerFamily, polymer: string, marking: string | null, morphology?: string];

export type PolymerProcess = 'moulding' | 'blow' | 'forming' | 'extrusion';

const DRY_TEXT: Record<PolymerProcess, [string, string]> = {
  moulding: ['dry before moulding', 'no drying needed'],
  blow: ['dry before moulding', 'no drying needed'],
  extrusion: ['dry before extrusion', 'no drying needed'],
  forming: ['hygroscopic — sheet may need pre-drying', 'not hygroscopic'],
};

export interface PolymerTaxonomy extends MaterialTaxonomy {
  facts(id: string): { family: PolymerFamily; polymer: string; marking: string | null; morphology: string } | null;
}

function polymerTaxonomy(rows: Row[], process: PolymerProcess, defaults: Partial<Record<PolymerFamily, string>>): PolymerTaxonomy {
  const byId = new Map(rows.map(([id, family, polymer, marking, morph]) =>
    [id, { family, polymer, marking, morphology: morph ?? POLYMERS[polymer].morphology }]));
  // Polymers per family in the order the table first names them.
  const standards: Record<string, string[]> = {};
  for (const [, family, polymer] of rows) {
    const label = POLYMERS[polymer].label;
    if (!(standards[family] ??= []).includes(label)) standards[family].push(label);
  }
  const familyOfCategory = (category: string) => /elastomer/i.test(category) ? 'tpe' : /high-performance/i.test(category) ? 'high_performance' : 'other';
  return {
    families: POLYMER_FAMILIES,
    standards,
    levelLabel: 'Polymer',
    info: gradeInfoFrom(rows.map(([id, family, polymer]) => [id, family, POLYMERS[polymer].label]), familyOfCategory),
    facts: id => byId.get(id) ?? null,
    // A family with no listed default opens on its first grade (the picker's fallback).
    defaultGrade: f => defaults[f as PolymerFamily] ?? '',
    describe(id, densityKgPerM3) {
      const g = byId.get(id);
      if (!g) return null;
      const dry = POLYMERS[g.polymer].dry;
      const fam = POLYMER_FAMILIES.find(f => f.id === g.family)!.label;
      return [fam, g.polymer, g.morphology,
        dry == null ? 'drying per datasheet' : DRY_TEXT[process][dry ? 0 : 1],
        `${densityKgPerM3.toLocaleString('en-GB')} kg/m³`, g.marking ? `marking ${g.marking}` : null].filter(Boolean).join(' · ');
    },
  };
}

// ─── Injection moulding (pellets) ─────────────────────────────────────────────

const MOULDING_ROWS: Row[] = [
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
  ['mat-abs', 'styrenic', 'ABS', '>ABS<'],
  ['mat-abs-fr', 'styrenic', 'ABS', null],
  ['mat-asa', 'styrenic', 'ASA', '>ASA<'],
  ['mat-san', 'styrenic', 'SAN', '>SAN<'],
  ['mat-gpps', 'styrenic', 'PS', '>PS<'],
  ['mat-hips', 'styrenic', 'PS', null],
  ['mat-pc', 'polycarbonate', 'PC', '>PC<'],
  ['mat-pc-gf20', 'polycarbonate', 'PC', '>PC-GF20<'],
  ['mat-pc-fr', 'polycarbonate', 'PC', null],
  ['mat-pc-glazing', 'polycarbonate', 'PC', '>PC<'],
  ['mat-pc-abs', 'polycarbonate', 'PC+ABS', '>PC+ABS<'],
  ['mat-pc-pbt', 'polycarbonate', 'PC+PBT', '>PC+PBT<'],
  ['mat-pbt', 'polyester', 'PBT', '>PBT<'],
  ['mat-pbt-gf30', 'polyester', 'PBT', '>PBT-GF30<'],
  ['mat-pet-gf30', 'polyester', 'PET', '>PET-GF30<'],
  ['mat-pet-bg', 'polyester', 'PET', '>PET<'],
  ['mat-upvc', 'vinyl', 'PVC', '>PVC-U<'],
  ['mat-fpvc', 'vinyl', 'PVC', '>PVC-P<'],
  ['mat-pom', 'acetal', 'POM', '>POM<'],
  ['mat-pps-gf40', 'high_performance', 'PPS', '>PPS-GF40<'],
  ['mat-peek', 'high_performance', 'PEEK', '>PEEK<'],
  ['mat-peek-gf30', 'high_performance', 'PEEK', '>PEEK-GF30<'],
  ['mat-pei', 'high_performance', 'PEI', '>PEI<'],
  ['mat-pei-gf30', 'high_performance', 'PEI', '>PEI-GF30<'],
  ['mat-lcp-gf30', 'high_performance', 'LCP', '>LCP-GF30<'],
  ['mat-psu', 'high_performance', 'PSU', '>PSU<'],
  ['mat-ppsu', 'high_performance', 'PPSU', '>PPSU<'],
  ['mat-tpv', 'tpe', 'TPV', '>TPV<'],
  ['mat-tpu-shore85', 'tpe', 'TPU', '>TPU<'],
  ['mat-tpe-s-im', 'tpe', 'TPS', '>TPS<'],
  ['mat-pmma', 'other', 'PMMA', '>PMMA<'],
  ['mat-mppe', 'other', 'PPE+PS', '>PPE+PS<'],
  ['mat-pla', 'other', 'PLA', '>PLA<'],
];

/** The commonest automotive moulding grade of each family. */
const MOULDING_DEFAULTS: Record<PolymerFamily, string> = {
  polyolefin: 'mat-pp', polyamide: 'mat-pa66gf30', styrenic: 'mat-abs', polycarbonate: 'mat-pc-abs',
  polyester: 'mat-pbt-gf30', vinyl: 'mat-upvc', acetal: 'mat-pom', high_performance: 'mat-pps-gf40', tpe: 'mat-tpv', other: 'mat-pmma',
};

export const MOULDING_TAXONOMY = polymerTaxonomy(MOULDING_ROWS, 'moulding', MOULDING_DEFAULTS);

// ─── Blow moulding (blow grades; the form also offers the TPE pellets) ──────

const BLOW_ROWS: Row[] = [
  ['mat-hdpe-bm', 'polyolefin', 'PE', '>PE-HD<'],
  ['mat-hdpe-fuel-coex', 'polyolefin', 'PE', null],
  ['mat-rhdpe-bm', 'polyolefin', 'PE', '>PE-HD<'],
  ['mat-biope-bm', 'polyolefin', 'PE', '>PE-HD<'],
  ['mat-ldpe-bm', 'polyolefin', 'PE', '>PE-LD<'],
  ['mat-lldpe-bm', 'polyolefin', 'PE', '>PE-LLD<'],
  ['mat-pp-bm', 'polyolefin', 'PP', '>PP<'],
  ['mat-rpp-bm', 'polyolefin', 'PP', '>PP<'],
  ['mat-eva-bm', 'polyolefin', 'EVA', '>EVAC<'],
  ['mat-pa6-bm', 'polyamide', 'PA6', '>PA6<'],
  ['mat-pc-bm', 'polycarbonate', 'PC', '>PC<'],
  ['mat-pet-preform', 'polyester', 'PET', '>PET<'],
  ['mat-petg-bm', 'polyester', 'PETG', null],
  ['mat-tritan-bm', 'polyester', 'COPE', null],
  ['mat-pvc-bm', 'vinyl', 'PVC', '>PVC-U<'],
  ['mat-tpe-bm', 'tpe', 'TPE', null],
  ['mat-tpv', 'tpe', 'TPV', '>TPV<'],
  ['mat-tpu-shore85', 'tpe', 'TPU', '>TPU<'],
  ['mat-tpe-s-im', 'tpe', 'TPS', '>TPS<'],
];

/** HDPE for tanks and ducts, PA6 for charge-air ducts, TPV for blown boots. */
export const BLOW_TAXONOMY = polymerTaxonomy(BLOW_ROWS, 'blow', {
  polyolefin: 'mat-hdpe-bm', polyamide: 'mat-pa6-bm', polycarbonate: 'mat-pc-bm', polyester: 'mat-pet-preform',
  vinyl: 'mat-pvc-bm', tpe: 'mat-tpv',
});

// ─── Thermoforming (extruded sheet) ───────────────────────────────────────────

const FORMING_ROWS: Row[] = [
  ['mat-hdpe-tf', 'polyolefin', 'PE', '>PE-HD<'],
  ['mat-ldpe-tf', 'polyolefin', 'PE', '>PE-LD<'],
  ['mat-pp-tf', 'polyolefin', 'PP', '>PP<'],
  ['mat-pp-tpo-tf', 'polyolefin', 'TPO', null],
  ['mat-abs-tf', 'styrenic', 'ABS', '>ABS<'],
  ['mat-hips-tf', 'styrenic', 'PS', null],
  ['mat-ps-foam-tf', 'styrenic', 'PS', null],
  ['mat-abs-pmma-tf', 'styrenic', 'COEX', null],
  ['mat-abs-pc-tf', 'styrenic', 'COEX', null],
  ['mat-pc-tf', 'polycarbonate', 'PC', '>PC<'],
  ['mat-apet-tf', 'polyester', 'PET', '>PET<', AMOR],
  ['mat-cpet-tf', 'polyester', 'PET', '>PET<'],
  ['mat-petg-tf', 'polyester', 'PETG', null],
  ['mat-petg-barrier-tf', 'polyester', 'PETG', null],
  ['mat-rpvc-tf', 'vinyl', 'PVC', '>PVC-U<'],
  ['mat-pei-tf', 'high_performance', 'PEI', '>PEI<'],
  ['mat-pps-tf', 'high_performance', 'PPS', '>PPS<'],
  ['mat-pmma-tf', 'other', 'PMMA', '>PMMA<'],
];

/** ABS for covers and trim, HDPE for liners and trays, TPO for automotive skins. */
export const FORMING_TAXONOMY = polymerTaxonomy(FORMING_ROWS, 'forming', {
  polyolefin: 'mat-hdpe-tf', styrenic: 'mat-abs-tf', polycarbonate: 'mat-pc-tf', polyester: 'mat-petg-tf',
  vinyl: 'mat-rpvc-tf', high_performance: 'mat-pei-tf', other: 'mat-pmma-tf',
});

// ─── Polymer extrusion (pipe, profile, tube, sheet and cable compounds) ───────

const EXTRUSION_ROWS: Row[] = [
  ['mat-pe100-pipe', 'polyolefin', 'PE', '>PE-HD<'],
  ['mat-pe80-pipe', 'polyolefin', 'PE', null],
  ['mat-hdpe-profile', 'polyolefin', 'PE', '>PE-HD<'],
  ['mat-ldpe-tube', 'polyolefin', 'PE', '>PE-LD<'],
  ['mat-pex-pipe', 'polyolefin', 'PE-X', '>PE-X<'],
  ['mat-xlpe-cable', 'polyolefin', 'PE-X', '>PE-X<'],
  ['mat-ppr-pipe', 'polyolefin', 'PP', '>PP<'],
  ['mat-pp-ext-sheet', 'polyolefin', 'PP', '>PP<'],
  ['mat-pa12-ext-tube', 'polyamide', 'PA12', '>PA12<'],
  ['mat-pa11-tube', 'polyamide', 'PA11', '>PA11<'],
  ['mat-pa6-ext-tube', 'polyamide', 'PA6', '>PA6<'],
  ['mat-abs-ext-sheet', 'styrenic', 'ABS', '>ABS<'],
  ['mat-asa-capstock', 'styrenic', 'ASA', '>ASA<'],
  ['mat-gpps-ext', 'styrenic', 'PS', '>PS<'],
  ['mat-pc-ext-sheet', 'polycarbonate', 'PC', '>PC<'],
  ['mat-upvc-pipe', 'vinyl', 'PVC', '>PVC-U<'],
  ['mat-upvc-window-profile', 'vinyl', 'PVC', '>PVC-U<'],
  ['mat-pvc-foam', 'vinyl', 'PVC', null],
  ['mat-pvcp-profile', 'vinyl', 'PVC', '>PVC-P<'],
  ['mat-pvc-cable', 'vinyl', 'PVC', '>PVC-P<'],
  ['mat-pvc-medical-tube', 'vinyl', 'PVC', '>PVC-P<'],
  ['mat-pom-rod', 'acetal', 'POM', '>POM<'],
  ['mat-pvdf-ext', 'high_performance', 'PVDF', '>PVDF<'],
  ['mat-peek-ext', 'high_performance', 'PEEK', '>PEEK<'],
  ['mat-tpv-profile', 'tpe', 'TPV', '>TPV<'],
  ['mat-tpe-profile', 'tpe', 'TPS', '>TPS<'],
  ['mat-tpu-ext-hose', 'tpe', 'TPU', '>TPU<'],
  ['mat-tpu-medical-tube', 'tpe', 'TPU', '>TPU<'],
  ['mat-pmma-ext-sheet', 'other', 'PMMA', '>PMMA<'],
];

/** PE100 for pipe, PA12 for fuel / brake lines, PVC-U for window profile, TPV for weatherseal. */
export const EXTRUSION_TAXONOMY = polymerTaxonomy(EXTRUSION_ROWS, 'extrusion', {
  polyolefin: 'mat-pe100-pipe', polyamide: 'mat-pa12-ext-tube', styrenic: 'mat-abs-ext-sheet', polycarbonate: 'mat-pc-ext-sheet',
  vinyl: 'mat-upvc-window-profile', acetal: 'mat-pom-rod', high_performance: 'mat-pvdf-ext', tpe: 'mat-tpv-profile', other: 'mat-pmma-ext-sheet',
});

/** Every polymer picker, by commodity. */
export const POLYMER_TAXONOMIES: Record<string, PolymerTaxonomy> = {
  injection_moulding: MOULDING_TAXONOMY, blow_moulding: BLOW_TAXONOMY, thermoforming: FORMING_TAXONOMY, extrusion: EXTRUSION_TAXONOMY,
};

// ─── Moulding names kept for callers and tests ───────────────────────────────

export type MouldFamily = PolymerFamily;
export const MOULD_FAMILIES = POLYMER_FAMILIES;
export const MOULD_STANDARDS = MOULDING_TAXONOMY.standards as Record<PolymerFamily, string[]>;
export const mouldGradeInfo = MOULDING_TAXONOMY.info;
export const mouldGradeFacts = (id: string) => MOULDING_TAXONOMY.facts(id);
export const describeMouldGrade = (id: string, densityKgPerM3: number) => MOULDING_TAXONOMY.describe!(id, densityKgPerM3);
export const mouldFamilyDefaultGrade = (f: PolymerFamily): string => MOULDING_DEFAULTS[f];
export function groupMouldingGrades<M extends { id: string; category: string }>(materials: M[]): GradeGroup<M>[] {
  return groupGrades(MOULDING_TAXONOMY, materials);
}
