import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

/**
 * Thermoforming advisor — process-physics estimators that turn the module from a
 * stopwatch (type in seconds) into a should-cost model:
 *   • material + thickness driven heating time and part-level oven energy (m·cp·ΔT)
 *   • sag prediction (self-weight plate deflection ∝ span⁴ / t², melt-modulus scaled)
 *   • cooling time (∝ t², diffusivity + tool-cooling scaled)
 *   • forming pressure + method-driven energy/tool effects (vacuum/pressure/twin-sheet)
 *   • parametric mould + trim tooling estimator with mould-life / maintenance
 *   • draw-ratio → wall-thinning predictor and a DFM analyser
 * Brings thermoforming to parity with the injection / extrusion / blow / roto / rubber
 * advisers. Deterministic; reference data is engineering-typical, index-anchored to
 * the 2026-07 rate library.
 */

export type ThermoformFamily =
  | 'hips' | 'abs' | 'pp' | 'pe' | 'rigid-pvc' | 'petg'
  | 'pet-cryst' | 'pmma' | 'pc' | 'pei' | 'pps' | 'tpo';
export type ThermoformMethod = 'vacuum' | 'pressure' | 'twin_sheet';
export type MouldMaterial = 'epoxy' | 'cast-al' | 'cnc-al' | 'steel';
export type ToolCooling = 'ambient' | 'air' | 'water';
export type FormComplexity = 'simple' | 'moderate' | 'complex';

/** Map a rate-library material id / grade string to a thermoforming family. */
export function thermoformFamilyOf(idOrGrade: string): ThermoformFamily {
  const s = idOrGrade.toLowerCase();
  if (s.includes('cpet') || (s.includes('pet') && (s.includes('cryst') || s.includes('c-pet')))) return 'pet-cryst';
  if (s.includes('petg') || s.includes('apet') || s.includes('pet')) return 'petg';
  if (s.includes('tpo') || s.includes('pp/tpo')) return 'tpo';
  if (s.includes('pmma') || s.includes('acrylic')) return 'pmma';
  if (s.includes('pei') || s.includes('ultem')) return 'pei';
  if (s.includes('pps')) return 'pps';
  if (s.includes('pc') || s.includes('lexan') || s.includes('polycarb')) return 'pc';
  if (s.includes('pvc')) return 'rigid-pvc';
  if (s.includes('hips') || s.includes(' ps') || s.includes('gpps') || s.includes('polystyr')) return 'hips';
  if (s.includes('abs')) return 'abs';
  if (s.includes('hdpe') || s.includes('ldpe') || s.includes('pe ')) return 'pe';
  if (s.includes('pp')) return 'pp';
  return 'hips';
}

/**
 * Per-family thermoforming reference data.
 *   formTempC   — mid-point sheet forming temperature (°C)
 *   cpKJ        — effective specific heat through the softening range (kJ/kg·K)
 *   heatCoef    — radiant heat-time coefficient: t_heat ≈ heatCoef · thickness^1.6 (s)
 *   coolCoef    — tool-contact cooling: t_cool ≈ coolCoef · thickness² (s)
 *   sagCoef     — inverse melt-modulus; higher = sags more under self weight
 */
interface FamilyData { formTempC: number; cpKJ: number; heatCoef: number; coolCoef: number; sagCoef: number; }
const FAMILY: Record<ThermoformFamily, FamilyData> = {
  hips:        { formTempC: 145, cpKJ: 1.90, heatCoef: 9.9,  coolCoef: 3.5, sagCoef: 1.00 },
  abs:         { formTempC: 150, cpKJ: 2.05, heatCoef: 10.6, coolCoef: 3.8, sagCoef: 1.10 },
  pp:          { formTempC: 155, cpKJ: 2.80, heatCoef: 12.5, coolCoef: 4.2, sagCoef: 2.20 },
  pe:          { formTempC: 135, cpKJ: 2.75, heatCoef: 12.0, coolCoef: 4.5, sagCoef: 2.50 },
  'rigid-pvc': { formTempC: 140, cpKJ: 1.55, heatCoef: 10.2, coolCoef: 3.6, sagCoef: 0.85 },
  petg:        { formTempC: 145, cpKJ: 1.75, heatCoef: 10.0, coolCoef: 4.0, sagCoef: 1.20 },
  'pet-cryst': { formTempC: 165, cpKJ: 1.90, heatCoef: 11.5, coolCoef: 6.0, sagCoef: 1.40 },
  pmma:        { formTempC: 165, cpKJ: 1.90, heatCoef: 11.8, coolCoef: 4.5, sagCoef: 0.50 },
  pc:          { formTempC: 190, cpKJ: 1.60, heatCoef: 13.5, coolCoef: 5.5, sagCoef: 0.70 },
  pei:         { formTempC: 250, cpKJ: 1.55, heatCoef: 15.5, coolCoef: 5.0, sagCoef: 0.90 },
  pps:         { formTempC: 285, cpKJ: 1.30, heatCoef: 15.0, coolCoef: 5.0, sagCoef: 1.60 },
  tpo:         { formTempC: 150, cpKJ: 2.30, heatCoef: 11.5, coolCoef: 4.2, sagCoef: 2.00 },
};

const AMBIENT_C = 23;
const OVEN_EFFICIENCY = 0.40;   // radiant ovens couple ~40% of input into the sheet

// ─── Heating: time + part-level oven energy ───────────────────────────────────

/** Radiant heat-soak time (s) from thickness and material. Thicker sheet ∝ t^1.6. */
export function estimateHeatTimeSec(family: ThermoformFamily, thicknessMm: number): number {
  const t = Math.max(0.2, thicknessMm);
  return Math.round(FAMILY[family].heatCoef * Math.pow(t, 1.6));
}

/**
 * Specific heating energy (kWh per kg of sheet) = cp·ΔT / 3600 / oven-efficiency,
 * plus the forming-air work. This is the biggest thermoforming process-energy term
 * and was previously invisible (buried in a flat machine £/hr, thickness-blind).
 */
export function estimateThermoformSpecificEnergy(family: ThermoformFamily, method: ThermoformMethod = 'vacuum'): number {
  const d = FAMILY[family];
  const heat = (d.cpKJ * (d.formTempC - AMBIENT_C)) / 3600 / OVEN_EFFICIENCY;   // kWh/kg
  const formingAir = method === 'pressure' ? 0.05 : method === 'twin_sheet' ? 0.03 : 0.02; // compressor/vacuum work
  const twinHeat = method === 'twin_sheet' ? heat : 0;   // twin-sheet heats two webs
  return Math.round((heat + twinHeat + formingAir) * 1000) / 1000;
}

// ─── Sag prediction: self-weight plate deflection ─────────────────────────────

export type SagRisk = 'low' | 'moderate' | 'high';
export interface SagPrediction { sagIndex: number; risk: SagRisk; note: string; }

/**
 * Predict sheet sag in the oven. Self-weight plate deflection δ ∝ ρ·g·L⁴ /(E·t²):
 * span dominates (⁴), thicker sheet sags LESS (t²), low melt-modulus resins (PP/PE/TPO)
 * sag most. A high index means the sheet needs sag bands, a heat profile or plug assist.
 */
export function estimateSagRisk(family: ThermoformFamily, thicknessMm: number, unsupportedSpanMm: number): SagPrediction {
  const spanM = Math.max(0.05, unsupportedSpanMm / 1000);
  const t = Math.max(0.2, thicknessMm);
  const sagIndex = Math.round((FAMILY[family].sagCoef * Math.pow(spanM, 4) / (t * t)) * 1000) / 1000;
  const risk: SagRisk = sagIndex > 1.5 ? 'high' : sagIndex > 0.3 ? 'moderate' : 'low';
  const note = risk === 'high'
    ? 'Heavy sag expected — use plug assist / sag bands / zoned heating, or a heavier-gauge or higher-melt-strength grade.'
    : risk === 'moderate'
      ? 'Moderate sag — profile the oven and consider a plug assist for even wall distribution.'
      : 'Sag within normal control for radiant heating.';
  return { sagIndex, risk, note };
}

// ─── Cooling: tool-contact cooling time ───────────────────────────────────────

/** Tool-contact cooling time (s) ≈ coolCoef · t², scaled by how the tool is cooled. */
export function estimateCoolTimeSec(family: ThermoformFamily, thicknessMm: number, toolCooling: ToolCooling = 'water'): number {
  const t = Math.max(0.2, thicknessMm);
  const coolMult = toolCooling === 'water' ? 0.65 : toolCooling === 'air' ? 1.0 : 1.35; // ambient tool holds heat
  return Math.round(FAMILY[family].coolCoef * t * t * coolMult);
}

// ─── Forming pressure (method) ────────────────────────────────────────────────

/** Typical forming pressure (bar) applied to the sheet by the method. */
export function formingPressureBar(method: ThermoformMethod): number {
  return method === 'pressure' ? 4.0 : method === 'twin_sheet' ? 3.0 : 0.9; // vacuum ≈ 1 atm
}

// ─── Draw ratio → wall thinning ───────────────────────────────────────────────

export interface WallThinningInputs {
  sheetThicknessMm: number;
  depthMm: number;            // draw depth
  minOpeningMm: number;       // smallest mouth dimension (dia / width)
  method?: ThermoformMethod;
  plugAssist?: boolean;
}
export interface WallThinningPrediction {
  drawRatio: number;          // H:D depth-to-opening
  avgWallMm: number;          // mass-conservation average
  minWallMm: number;          // thinnest corner estimate
  drawLimit: number;          // achievable H:D for the method
  withinLimit: boolean;
}

/**
 * Predict wall thinning from the draw ratio (depth ÷ min opening). Vacuum-only female
 * tools manage ~1:1 without assist; plug assist / pressure push to ~3–4:1. Average wall
 * ≈ sheet / (1 + areal draw); corners thin worse (× 0.55 without assist, × 0.75 with).
 */
export function estimateWallThinning(inp: WallThinningInputs): WallThinningPrediction {
  const method = inp.method ?? 'vacuum';
  const opening = Math.max(1, inp.minOpeningMm);
  const drawRatio = Math.round((inp.depthMm / opening) * 100) / 100;
  // Areal draw grows with depth; average wall shrinks by mass conservation.
  const arealDraw = 1 + 2 * (inp.depthMm / opening);
  const avgWallMm = Math.round((inp.sheetThicknessMm / arealDraw) * 1000) / 1000;
  const cornerFactor = inp.plugAssist ? 0.75 : method === 'pressure' ? 0.65 : 0.55;
  const minWallMm = Math.round(avgWallMm * cornerFactor * 1000) / 1000;
  const drawLimit = method === 'pressure' ? 4.0 : inp.plugAssist ? 3.0 : method === 'twin_sheet' ? 2.5 : 1.5;
  return { drawRatio, avgWallMm, minWallMm, drawLimit, withinLimit: drawRatio <= drawLimit };
}

// ─── Parametric mould + trim tooling, with life & maintenance ─────────────────

export interface ThermoformToolInputs {
  projectedAreaCm2?: number;   // footprint of the formed part
  mouldMaterial?: MouldMaterial;
  method?: ThermoformMethod;
  complexity?: FormComplexity;
  cavities?: number;           // parts formed per cycle (multi-up)
  trim?: 'cnc-router' | 'steel-rule' | 'in-machine';  // trim tooling type
}
export interface ThermoformToolBreakdown {
  mould: number;
  vacuumHoles: number;
  trim: number;
  total: number;
  lifeCycles: number;          // expected mould life
  maintenancePerCycle: number; // £/cycle upkeep
}

interface MouldRate { base: number; perCm2: number; life: number; maint: number; }
const MOULD_RATE: Record<MouldMaterial, MouldRate> = {
  epoxy:    { base: 1500,  perCm2: 0.8, life: 5000,     maint: 0.010 }, // prototype / low-vol
  'cast-al':{ base: 3500,  perCm2: 1.2, life: 250000,   maint: 0.004 },
  'cnc-al': { base: 6000,  perCm2: 2.2, life: 1000000,  maint: 0.003 }, // production standard
  steel:    { base: 15000, perCm2: 4.5, life: 3000000,  maint: 0.002 }, // pressure forming / very high vol
};

/** Estimate a thermoforming mould + trim tool set (£) with expected life and upkeep. */
export function estimateThermoformToolCost(inp: ThermoformToolInputs): ThermoformToolBreakdown {
  const area = Math.max(10, inp.projectedAreaCm2 ?? 400);
  const method = inp.method ?? 'vacuum';
  const mat: MouldMaterial = inp.mouldMaterial ?? (method === 'pressure' ? 'cnc-al' : 'cast-al');
  const cavities = Math.max(1, Math.floor(inp.cavities ?? 1));
  const r = MOULD_RATE[mat];

  const cx = (inp.complexity ?? 'moderate') === 'complex' ? 1.6 : (inp.complexity ?? 'moderate') === 'simple' ? 0.7 : 1.0;
  const methodMult = method === 'pressure' ? 1.6 : method === 'twin_sheet' ? 2.2 : 1.0; // pressure box / two-half tool
  // Multi-cavity: each extra cavity adds ~70% of a single (shared base plate).
  const cavityMult = 1 + (cavities - 1) * 0.7;

  const mould = (r.base + area * r.perCm2) * cx * methodMult * cavityMult;
  const vacuumHoles = method === 'pressure' ? 0 : Math.round(area * 0.25 * cavities); // drill/EDM vac holes (not needed for +pressure vent)
  const trimType = inp.trim ?? 'cnc-router';
  const trim = trimType === 'steel-rule' ? Math.round(800 + area * 0.4 * cavities)
    : trimType === 'in-machine' ? Math.round(1200 + area * 0.6 * cavities) // matched trim-in-place tooling
    : 0; // CNC router / robot needs no part-specific trim die

  const total = Math.round(mould + vacuumHoles + trim);
  return {
    mould: Math.round(mould), vacuumHoles, trim, total,
    lifeCycles: r.life, maintenancePerCycle: r.maint,
  };
}

// ─── DFM analyser ─────────────────────────────────────────────────────────────

export interface ThermoformDFMInputs {
  family?: ThermoformFamily;
  method?: ThermoformMethod;
  sheetThicknessMm?: number;
  depthMm?: number;
  minOpeningMm?: number;       // smallest mouth dimension → draw ratio
  unsupportedSpanMm?: number;  // largest unsupported sheet span → sag
  minInternalRadiusMm?: number;
  draftAngleDeg?: number;
  hasUndercut?: boolean;
  textured?: boolean;
  functionalMinWallMm?: number; // thinnest wall the part must retain
  toleranceMm?: number;
  plugAssist?: boolean;
}
export interface ThermoformDFMIssue { severity: DFMSeverity; category: DFMCategory; title: string; description: string; recommendation: string; }
export interface ThermoformDFMResult { score: number; issues: ThermoformDFMIssue[]; summary: string; }

export function analyseThermoformingDFM(inp: ThermoformDFMInputs): ThermoformDFMResult {
  const issues: ThermoformDFMIssue[] = [];
  const fam = inp.family ?? 'hips';
  const method = inp.method ?? 'vacuum';

  // 1. Draw ratio vs the method's forming limit → webbing / excessive thinning.
  let thinning: WallThinningPrediction | null = null;
  if (inp.depthMm && inp.minOpeningMm && inp.sheetThicknessMm) {
    thinning = estimateWallThinning({
      sheetThicknessMm: inp.sheetThicknessMm, depthMm: inp.depthMm,
      minOpeningMm: inp.minOpeningMm, method, plugAssist: inp.plugAssist,
    });
    if (!thinning.withinLimit) {
      issues.push({ severity: 'critical', category: 'geometry',
        title: `Draw ratio ${thinning.drawRatio}:1 exceeds ${thinning.drawLimit}:1 for ${method}${inp.plugAssist ? ' + plug' : ''}`,
        description: 'Beyond the draw limit the sheet thins excessively at corners, webs between features and may not form fully.',
        recommendation: inp.plugAssist
          ? 'Reduce draw depth, add pressure forming, or split into shallower features.'
          : 'Add a plug assist (or switch to pressure forming), reduce depth, or increase the opening.' });
    }
    // 2. Predicted thinnest wall below the functional minimum.
    const need = inp.functionalMinWallMm ?? 0.3;
    if (thinning.minWallMm < need) {
      issues.push({ severity: 'major', category: 'geometry',
        title: `Predicted min wall ${thinning.minWallMm.toFixed(2)} mm < required ${need} mm`,
        description: 'Corner/base walls thin below the functional minimum, risking pinholes, weak walls and poor rigidity.',
        recommendation: 'Start from a thicker gauge, add plug assist for even distribution, or reduce local draw depth.' });
    }
  }

  // 3. Sag on large unsupported spans.
  if (inp.unsupportedSpanMm && inp.sheetThicknessMm) {
    const sag = estimateSagRisk(fam, inp.sheetThicknessMm, inp.unsupportedSpanMm);
    if (sag.risk === 'high') {
      issues.push({ severity: 'major', category: 'process',
        title: `High sag risk (index ${sag.sagIndex}) for ${fam.toUpperCase()} at ${inp.unsupportedSpanMm} mm span`,
        description: 'The hot sheet sags under its own weight before forming, giving uneven wall thickness and possible tool contact.',
        recommendation: sag.note });
    } else if (sag.risk === 'moderate') {
      issues.push({ severity: 'minor', category: 'process',
        title: `Moderate sag (index ${sag.sagIndex}) at ${inp.unsupportedSpanMm} mm span`,
        description: 'Some sag likely; wall distribution may drift across the sheet.',
        recommendation: sag.note });
    }
  }

  // 4. Internal radius — sharp corners thin worst and won't form crisply.
  if (inp.minInternalRadiusMm !== undefined && inp.sheetThicknessMm && inp.minInternalRadiusMm < inp.sheetThicknessMm) {
    issues.push({ severity: 'major', category: 'geometry',
      title: `Internal radius ${inp.minInternalRadiusMm} mm < sheet thickness ${inp.sheetThicknessMm} mm`,
      description: 'Thermoforming cannot fill radii tighter than roughly the sheet gauge; corners thin severely and lose definition.',
      recommendation: 'Open internal radii to ≥ 1× (ideally 2×) sheet thickness.' });
  }

  // 5. Draft angle — thermoformed parts need generous draft to release off the tool.
  const draftFloor = method === 'pressure' ? 2 : 3; // female cavities need more
  if (inp.draftAngleDeg !== undefined && inp.draftAngleDeg < draftFloor) {
    issues.push({ severity: 'major', category: 'geometry',
      title: `Draft ${inp.draftAngleDeg}° below ~${draftFloor}° for thermoforming`,
      description: 'As the part cools it grips the tool; insufficient draft causes scuffing, distortion and ejection problems.',
      recommendation: `Increase draft to ≥ ${draftFloor}° on drawn walls (texture needs +1°/0.025 mm depth).` });
  }

  // 6. Undercuts — need moving cores / stripper plates, or must be trimmed/snapped.
  if (inp.hasUndercut) {
    issues.push({ severity: 'major', category: 'tooling',
      title: 'Undercut present — needs moving core or secondary operation',
      description: 'Thermoform tools are largely fixed; undercuts require moving sections, stripper rings or post-form snap steps, raising tool and cycle cost.',
      recommendation: 'Design the undercut out, relocate it to the trim line, or budget a moving-core tool + slower cycle.' });
  }

  // 7. Texture over a deep draw → texture washes out on thinned walls.
  if (inp.textured && thinning && thinning.drawRatio > 1.5) {
    issues.push({ severity: 'minor', category: 'process',
      title: `Texture over a ${thinning.drawRatio}:1 draw may wash out`,
      description: 'On deeply drawn, thinned walls the tool texture stretches and loses depth, giving an inconsistent finish.',
      recommendation: 'Apply a deeper master texture on drawn zones, or accept reduced texture depth on side walls.' });
  }

  // 8. Tolerance realism — thermoforming is a loose-tolerance process (~±0.5% of dimension).
  if (inp.toleranceMm !== undefined && inp.minOpeningMm) {
    const achievable = Math.max(0.25, 0.005 * inp.minOpeningMm);
    if (inp.toleranceMm < achievable) {
      issues.push({ severity: 'major', category: 'tolerance',
        title: `Tolerance ±${inp.toleranceMm} mm tighter than thermoformable ±${achievable.toFixed(2)} mm`,
        description: 'Formed dimensions drift with sheet temperature, shrinkage and trimming; sub-process tolerances drive scrap and gauging.',
        recommendation: 'Relax the tolerance, control the trim datum, or post-machine the critical feature.' });
    }
  }

  // 9. Formability advisory for poor-melt-strength families.
  if ((fam === 'pp' || fam === 'pe' || fam === 'tpo') && (inp.depthMm ?? 0) > 0) {
    issues.push({ severity: 'opportunity', category: 'material',
      title: `${fam.toUpperCase()} has a narrow forming window`,
      description: 'Low melt strength gives a narrow temperature window and heavy sag; forming is less forgiving than styrenics.',
      recommendation: 'Use tight oven-zone control and plug assist; consider high-melt-strength (HMS) PP or a styrenic where finish allows.' });
  }

  let score = 10;
  for (const i of issues) score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No thermoforming DFM issues flagged; geometry is within reference guidelines.'
    : `${issues.length} thermoforming DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;
  return { score, issues, summary };
}
