// AI CAD-to-Cost commodity + material option lists (pure data).

export const CAD_COMMODITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '— Auto-detect (AI selects) —' },
  { value: 'machining', label: 'Machining (CNC)' },
  { value: 'gear', label: 'Gear Cutting (hands off to the Gear form)' },
  { value: 'casting', label: 'Casting (HPDC / Sand / Gravity)' },
  { value: 'cast_and_machine', label: 'Cast + Machine' },
  { value: 'forging', label: 'Forging (Closed-die)' },
  { value: 'sheet_metal', label: 'Sheet Metal (Stamping)' },
  { value: 'sheet_metal_fab', label: 'Sheet Metal Fabrication (Laser/Bend/Weld)' },
  { value: 'injection_moulding', label: 'Injection Moulding' },
  { value: 'blow_moulding', label: 'Blow Moulding' },
  { value: 'thermoforming', label: 'Thermoforming' },
  { value: 'rotational_moulding', label: 'Rotational Moulding' },
  { value: 'extrusion', label: 'Extrusion (polymer)' },
  { value: 'aluminium_extrusion', label: 'Aluminium Extrusion' },
  { value: 'composites', label: 'Composites (CFRP / GFRP)' },
  { value: 'rubber', label: 'Rubber Moulding' },
  { value: 'wiring_harness', label: 'Wiring Harness' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'painting', label: 'Painting / Coating' },
  { value: 'pcb_fab', label: 'PCB Fabrication' },
  { value: 'pcba', label: 'PCBA (Electronics Assembly)' },
  { value: 'biw_assembly', label: 'BIW Assembly' },
];

import { DEFAULT_RATE_LIBRARY } from '../../engine/rate-library.js';
import { MATERIAL_SCOPE_BY_SELECT } from '../material-scope.js';

/**
 * Casting, cast + machine and forging list the library's own grades in their form's
 * scope (casting & forging materials review, Oct 2026). The hand-written lists
 * pointed "LM25 / A356 (Gravity/Sand)" at wrought 6061 bar, "ADC12 (HPDC)" at 5052
 * sheet and every forging at machining bar — ids the casting and forging forms
 * cannot show, so a pinned grade left the form on its first option.
 */
function gradesInScope(selectId: string): Array<{ id: string; label: string }> {
  const scope = MATERIAL_SCOPE_BY_SELECT[selectId];
  return DEFAULT_RATE_LIBRARY.materials
    .filter(m => scope.test(m.category))
    .sort((a, b) => a.category.localeCompare(b.category) || a.pricePerKg - b.pricePerKg)
    .map(m => ({ id: m.id, label: `${m.grade} — ${m.category}` }));
}

export const CAD_MATERIALS_BY_COMMODITY: Record<string, Array<{ id: string; label: string }>> = {
  '': [],
  machining: [
    { id: 'mat-al6061', label: 'Aluminium 6061-T6' },
    { id: 'mat-steel1045', label: 'Carbon Steel 1045' },
    { id: 'mat-steel4140', label: 'Alloy Steel 4140 / 4340' },
    { id: 'mat-ss316l', label: 'Stainless Steel 316L' },
    { id: 'mat-ti6al4v', label: 'Titanium Ti-6Al-4V' },
  ],
  casting: gradesInScope('cast-mat'),
  cast_and_machine: gradesInScope('cam-mat'),
  forging: gradesInScope('forge-mat'),
  sheet_metal: [
    { id: 'mat-dc01', label: 'Mild Steel DC01' },
    { id: 'mat-dp600', label: 'DP600 (Advanced High Strength)' },
    { id: 'mat-hsla340', label: 'HSLA 340' },
    { id: 'mat-22mnb5', label: '22MnB5 Boron Steel (Hot Stamp)' },
    { id: 'mat-dc01-gi', label: 'DC01 GI (Galvanised)' },
    { id: 'mat-aa5182', label: 'AA5182 Aluminium' },
    { id: 'mat-aa5754-sheet', label: 'AA5754-H22 Aluminium' },
    { id: 'mat-ss304-sheet', label: 'Stainless Steel 304L' },
    { id: 'mat-ss316-sheet', label: 'Stainless Steel 316L' },
  ],
  sheet_metal_fab: [
    { id: 'mat-dc01', label: 'Mild Steel DC01' },
    { id: 'mat-hrpo', label: 'HRPO (Hot Rolled P&O)' },
    { id: 'mat-aa5052', label: 'Aluminium AA5052-H32' },
    { id: 'mat-aa6082-sheet', label: 'Aluminium AA6082-T6' },
    { id: 'mat-ss304-sheet', label: 'Stainless Steel 304L' },
    { id: 'mat-ss316-sheet', label: 'Stainless Steel 316L' },
  ],
  injection_moulding: [
    { id: 'mat-pp', label: 'PP Copolymer' },
    { id: 'mat-pp-homo', label: 'PP Homopolymer' },
    { id: 'mat-abs', label: 'ABS' },
    { id: 'mat-pc', label: 'PC (Polycarbonate)' },
    { id: 'mat-pc-abs', label: 'PC/ABS Blend' },
    { id: 'mat-pa6', label: 'PA6 Nylon' },
    { id: 'mat-pa6-gf30', label: 'PA6 GF30 (Glass-filled)' },
    { id: 'mat-pa66gf30', label: 'PA66 GF30' },
    { id: 'mat-pom', label: 'POM / Acetal (Delrin)' },
    { id: 'mat-hdpe', label: 'HDPE' },
    { id: 'mat-pbt-gf30', label: 'PBT GF30' },
    { id: 'mat-pet-gf30', label: 'PET GF30' },
    { id: 'mat-tpu-shore85', label: 'TPU Shore 85A' },
  ],
  blow_moulding: [
    { id: 'mat-hdpe', label: 'HDPE (EBM bottles/tanks)' },
    { id: 'mat-pp', label: 'PP (EBM ducts/containers)' },
    { id: 'mat-pet-bg', label: 'PET Bottle Grade (SBM)' },
    { id: 'mat-ldpe', label: 'LDPE (Film/bags)' },
    { id: 'mat-pc', label: 'PC (IBM precision)' },
  ],
  thermoforming: [
    { id: 'mat-hips', label: 'HIPS Sheet' },
    { id: 'mat-gpps', label: 'GPPS (Crystal PS)' },
    { id: 'mat-abs', label: 'ABS Sheet' },
    { id: 'mat-pet-bg', label: 'PET Sheet' },
    { id: 'mat-hdpe', label: 'HDPE Sheet' },
    { id: 'mat-pc', label: 'PC Sheet' },
    { id: 'mat-pp', label: 'PP Sheet' },
  ],
  rotational_moulding: [
    { id: 'mat-lldpe', label: 'LLDPE C6 Powder (most common)' },
    { id: 'mat-hdpe', label: 'HDPE Powder' },
    { id: 'mat-pp', label: 'PP Powder' },
  ],
  extrusion: [
    { id: 'mat-al6061', label: 'Aluminium 6061 Extrusion' },
    { id: 'mat-upvc', label: 'Rigid PVC (uPVC) Profile' },
    { id: 'mat-fpvc', label: 'Flexible PVC (fPVC) Profile' },
    { id: 'mat-pp', label: 'PP Profile' },
    { id: 'mat-hdpe', label: 'HDPE Pipe/Profile' },
  ],
  // Real library grades (materials review, Oct 2026): these pointed at 6061 bar,
  // a missing 5052 id, PP labelled EPDM and HDPE labelled silicone.
  composites: [
    { id: 'mat-cfrp-prepreg-t700', label: 'CFRP — T700 carbon / epoxy prepreg' },
    { id: 'mat-gfrp-prepreg-e', label: 'GFRP — E-glass / epoxy prepreg' },
    { id: 'mat-smc-gf', label: 'SMC — glass sheet moulding compound' },
  ],
  rubber: [
    { id: 'mat-epdm', label: 'EPDM 70 Shore A' },
    { id: 'mat-nbr', label: 'NBR 70 Shore A' },
    { id: 'mat-silicone-hcr', label: 'HCR Silicone 60 Shore A' },
    { id: 'mat-lsr', label: 'LSR 40 Shore A' },
    { id: 'mat-viton-fkm', label: 'FKM Viton 75 Shore A' },
    { id: 'mat-tpu-shore85', label: 'TPU Shore 85A' },
  ],
};
