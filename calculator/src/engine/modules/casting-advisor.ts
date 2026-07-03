/**
 * Casting process/technology advisor + DFM rules + secondary-process adders.
 * Deterministic — no AI API required. Reference data is engineering-typical
 * and index-anchored to the 2026-07 rate-library basis; treat cost bands as
 * indicative and override with real quotes via the admin Rate Library.
 */
import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';
import type { CastingSubtype } from './casting.js';

// Advisor recognises megacasting as a distinct technology (giant vacuum HPDC),
// even though the cost engine models it through the `hpdc` subtype.
export type CastingProcess = CastingSubtype | 'megacasting';

export type AlloyFamily =
  | 'aluminium' | 'magnesium' | 'zinc' | 'grey-iron' | 'ductile-iron'
  | 'carbon-steel' | 'stainless-steel' | 'superalloy' | 'copper';

export type ComplexityLevel = 'low' | 'medium' | 'high';
export type ToleranceClass = 'loose' | 'standard' | 'tight';

// ─── Process reference table (engineering-typical) ────────────────────────────

export interface CastingProcessReference {
  process: CastingProcess;
  yieldBand: [number, number];        // part weight / pour weight
  cycleBand: string;                  // human-readable cycle time band
  toolingBand: string;                // £ band for hard tooling
  toleranceMm: string;                // general dimensional capability
  weightRangeKg: [number, number];    // practical casting weight window
  minWallMm: number;                  // minimum reliably-fillable wall
  draftDegMin: number;                // minimum recommended draft
  surfaceFinishRaUm: string;          // as-cast surface finish
}

export const CASTING_PROCESS_REFERENCE: Record<CastingProcess, CastingProcessReference> = {
  hpdc: {
    process: 'hpdc',
    yieldBand: [0.55, 0.75],
    cycleBand: '30–90 s/shot',
    toolingBand: '£40k–£500k (hardened die)',
    toleranceMm: '±0.1–0.4 mm',
    weightRangeKg: [0.02, 15],
    minWallMm: 1.0,
    draftDegMin: 0.5,
    surfaceFinishRaUm: 'Ra 0.8–3.2 µm',
  },
  megacasting: {
    process: 'megacasting',
    yieldBand: [0.45, 0.60],
    cycleBand: '80–180 s/shot (giant vacuum HPDC)',
    toolingBand: '£2M–£8M (single/twin giga-die)',
    toleranceMm: '±0.5–1.5 mm over >1 m',
    weightRangeKg: [15, 120],
    minWallMm: 2.5,
    draftDegMin: 1.0,
    surfaceFinishRaUm: 'Ra 3.2–12.5 µm',
  },
  gravity: {
    process: 'gravity',
    yieldBand: [0.60, 0.80],
    cycleBand: '2–10 min/casting',
    toolingBand: '£15k–£60k (permanent mould)',
    toleranceMm: '±0.3–0.8 mm',
    weightRangeKg: [0.5, 50],
    minWallMm: 3.0,
    draftDegMin: 1.0,
    surfaceFinishRaUm: 'Ra 3.2–12.5 µm',
  },
  sand: {
    process: 'sand',
    yieldBand: [0.55, 0.75],
    cycleBand: '5–30 min/mould (line-dependent)',
    toolingBand: '£2k–£30k (pattern + core boxes)',
    toleranceMm: '±0.8–3.0 mm',
    weightRangeKg: [0.5, 5000],
    minWallMm: 3.5,
    draftDegMin: 1.0,
    surfaceFinishRaUm: 'Ra 12.5–25 µm',
  },
  investment: {
    process: 'investment',
    yieldBand: [0.35, 0.55],
    cycleBand: 'per-part (shell build 5–7 days lead)',
    toolingBand: '£3k–£30k (wax die)',
    toleranceMm: '±0.1–0.5 mm',
    weightRangeKg: [0.01, 50],
    minWallMm: 0.7,
    draftDegMin: 0.0,
    surfaceFinishRaUm: 'Ra 1.6–3.2 µm',
  },
};

// ─── Process advisor ──────────────────────────────────────────────────────────

export interface CastingAdvisorInputs {
  annualVolume: number;
  partWeightKg: number;
  minWallThicknessMm: number;
  complexity: ComplexityLevel;
  alloyFamily: AlloyFamily;
  /** Part must be leak-tight / pressure-rated (e.g. hydraulic, coolant, fuel). */
  pressureTight?: boolean;
  toleranceClass?: ToleranceClass;
  /** Safety-critical / fatigue-loaded (aerospace, chassis) — drives NDT + HIP. */
  safetyCritical?: boolean;
}

export interface CastingProcessRecommendation {
  process: CastingProcess;
  processLabel: string;
  reference: CastingProcessReference;
  processRoute: string[];
  reason: string;
  suggestedSecondary: string[];
}

const ALLOY_LABEL: Record<AlloyFamily, string> = {
  aluminium: 'aluminium', magnesium: 'magnesium', zinc: 'zinc',
  'grey-iron': 'grey iron', 'ductile-iron': 'ductile iron',
  'carbon-steel': 'carbon steel', 'stainless-steel': 'stainless steel',
  superalloy: 'nickel superalloy', copper: 'copper alloy',
};

const DIE_CASTABLE: AlloyFamily[] = ['aluminium', 'magnesium', 'zinc'];
const FERROUS: AlloyFamily[] = ['grey-iron', 'ductile-iron', 'carbon-steel', 'stainless-steel'];

export function adviseCastingProcess(inputs: CastingAdvisorInputs): CastingProcessRecommendation {
  const alloy = ALLOY_LABEL[inputs.alloyFamily];
  const tol = inputs.toleranceClass ?? 'standard';
  const dieCastable = DIE_CASTABLE.includes(inputs.alloyFamily);
  const ferrous = FERROUS.includes(inputs.alloyFamily);

  const build = (
    process: CastingProcess,
    reason: string,
    route: string[],
    secondary: string[],
  ): CastingProcessRecommendation => ({
    process,
    processLabel: process === 'megacasting'
      ? 'Megacasting (giant vacuum HPDC)'
      : process === 'hpdc' ? 'High-Pressure Die Casting'
      : process === 'gravity' ? 'Gravity Die Casting'
      : process === 'sand' ? 'Sand Casting'
      : 'Investment Casting',
    reference: CASTING_PROCESS_REFERENCE[process],
    processRoute: route,
    reason,
    suggestedSecondary: secondary,
  });

  // 1. Nickel superalloy → investment (only viable route for turbine/hot-section).
  if (inputs.alloyFamily === 'superalloy') {
    return build('investment',
      `${alloy} is cast almost exclusively by investment casting — high melting point, tight tolerance and thin near-net walls; HIP + full NDT are standard for hot-section integrity`,
      ['Wax injection', 'Shell build', 'Dewax + burnout', 'Vacuum pour', 'Knockout', 'HIP', 'CT / X-ray NDT'],
      ['HIP', 'X-ray/CT NDT', 'Solution + age heat treat']);
  }

  // 2. Small, precise, high-value steel/stainless → investment.
  if ((inputs.alloyFamily === 'stainless-steel' || inputs.alloyFamily === 'carbon-steel')
      && inputs.partWeightKg <= 10 && tol === 'tight') {
    return build('investment',
      `tight-tolerance ${alloy} under 10 kg — investment casting gives near-net thin walls and ±0.1–0.5 mm without hard tooling on ferrous alloys`,
      ['Wax injection', 'Shell build', 'Dewax', 'Pour', 'Knockout', 'Finish'],
      inputs.safetyCritical ? ['X-ray NDT', 'Heat treat'] : ['Heat treat']);
  }

  // 3. Large structural aluminium at high volume → megacasting.
  if (inputs.alloyFamily === 'aluminium' && inputs.partWeightKg >= 15 && inputs.annualVolume >= 50000) {
    return build('megacasting',
      `large structural aluminium (${inputs.partWeightKg} kg) at ${inputs.annualVolume.toLocaleString()}/yr — a single giga-die replaces dozens of stamped/joined parts; needs vacuum, ductile alloy (Silafont/Castasil) and post-cast T7`,
      ['Vacuum giga-HPDC', 'Solution + T7 age', 'Laser trim', 'CMM datum-align', 'Leak test'],
      ['T7 heat treat', 'CMM inspection', 'Leak test', ...(inputs.safetyCritical ? ['CT NDT'] : [])]);
  }

  // 4. Thin-wall, high-volume die-castable alloy → HPDC.
  if (dieCastable && inputs.annualVolume >= 20000 && inputs.minWallThicknessMm <= 4 && inputs.partWeightKg <= 15) {
    const secondary = ['Deburr/trim', 'Shot blast'];
    if (inputs.pressureTight) secondary.push('Vacuum-assist or impregnation');
    if (inputs.safetyCritical) secondary.push('X-ray NDT');
    return build('hpdc',
      `thin-wall ${alloy} at ${inputs.annualVolume.toLocaleString()}/yr — HPDC gives the lowest piece cost and best surface finish once the die is amortised${inputs.pressureTight ? '; specify vacuum-assist for leak-tight parts' : ''}`,
      ['HPDC shot', 'Trim/deburr', 'Shot blast', ...(inputs.pressureTight ? ['Impregnation'] : [])],
      secondary);
  }

  // 5. Medium-volume die-castable alloy needing good mechanicals → gravity.
  if (dieCastable && inputs.annualVolume >= 2000 && inputs.partWeightKg <= 50) {
    return build('gravity',
      `medium-volume ${alloy} — gravity die casting gives denser, heat-treatable (T6) structure than HPDC for wheels/knuckles/pistons, with cheaper tooling than a pressure die`,
      ['Gravity/tilt pour', 'Knockout', 'T6 heat treat', 'Machining datums'],
      ['T6 heat treat', ...(inputs.safetyCritical ? ['X-ray NDT'] : [])]);
  }

  // 6. Ferrous, large, or low-volume → sand.
  if (ferrous || inputs.partWeightKg > 50 || inputs.annualVolume < 2000) {
    return build('sand',
      `${alloy}${inputs.partWeightKg > 50 ? `, large casting (${inputs.partWeightKg} kg)` : ''}${inputs.annualVolume < 2000 ? `, low volume (${inputs.annualVolume.toLocaleString()}/yr)` : ''} — sand casting has the lowest tooling NRE and no upper size limit; ductile-iron/steel castings finish by fettling + machining`,
      ['Pattern/core prep', 'Mould + pour', 'Shakeout', 'Fettle', 'Heat treat', 'Machining'],
      [...(ferrous ? ['Stress-relieve / normalise'] : ['Heat treat']), ...(inputs.safetyCritical ? ['X-ray NDT'] : [])]);
  }

  // 7. Fallback: gravity for remaining die-castable, else sand.
  return dieCastable
    ? build('gravity', `${alloy} — gravity die casting balances tooling cost and quality for this volume`, ['Gravity pour', 'Knockout', 'Heat treat', 'Machining'], ['Heat treat'])
    : build('sand', `${alloy} — sand casting is the default low-NRE route`, ['Mould + pour', 'Shakeout', 'Fettle', 'Machining'], ['Heat treat']);
}

// ─── DFM rules (porosity / draft / wall / section / near-net) ──────────────────

export interface CastingDFMInputs {
  process: CastingProcess;
  minWallThicknessMm: number;
  maxWallThicknessMm: number;
  draftAngleDeg: number;
  /** Largest ratio of heavy to thin section — proxy for hot-spot/shrinkage risk. */
  maxSectionRatio?: number;
  pressureTight?: boolean;
  /** True if the design uses vacuum-assist HPDC or is impregnated after cast. */
  porosityMitigated?: boolean;
  /** Single-side machining stock allowance in mm. */
  machiningStockMm?: number;
  hasSharpInternalCorners?: boolean;
  hasIsolatedHeavySections?: boolean;
}

export interface CastingDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface CastingDFMResult {
  process: CastingProcess;
  score: number;         // 1–10, 10 = clean
  issues: CastingDFMIssue[];
  summary: string;
}

export function analyseCastingDFM(inputs: CastingDFMInputs): CastingDFMResult {
  const ref = CASTING_PROCESS_REFERENCE[inputs.process];
  const issues: CastingDFMIssue[] = [];

  // Wall thickness below process minimum → non-fill / cold shut / misrun.
  if (inputs.minWallThicknessMm < ref.minWallMm) {
    issues.push({
      severity: 'critical',
      category: 'geometry',
      title: `Wall ${inputs.minWallThicknessMm} mm below ${ref.process} minimum ${ref.minWallMm} mm`,
      description: 'Thin sections freeze before the cavity fills — cold shuts, misruns and non-fill scrap.',
      recommendation: `Thicken to ≥ ${ref.minWallMm} mm, add flow ribs, raise metal/die temperature, or move to a process with lower min wall (investment ${CASTING_PROCESS_REFERENCE.investment.minWallMm} mm).`,
    });
  }

  // Section ratio → shrinkage porosity at hot spots.
  const ratio = inputs.maxSectionRatio
    ?? (inputs.minWallThicknessMm > 0 ? inputs.maxWallThicknessMm / inputs.minWallThicknessMm : 1);
  if (ratio > 3) {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: `Non-uniform sections (heavy:thin ≈ ${ratio.toFixed(1)}:1)`,
      description: 'Heavy sections solidify last and shrink, drawing porosity/sink at the hot spot.',
      recommendation: 'Even out wall thickness, core out heavy bosses, add fillets to taper transitions, or feed the hot spot with a riser/chill.',
    });
  }

  // Draft below process minimum → ejection / die wear / pattern draw.
  if (inputs.draftAngleDeg < ref.draftDegMin) {
    issues.push({
      severity: ref.draftDegMin > 0 ? 'major' : 'minor',
      category: 'tooling',
      title: `Draft ${inputs.draftAngleDeg}° below recommended ${ref.draftDegMin}°`,
      description: 'Insufficient draft galls the die/pattern, raises ejection force and accelerates tool wear (or breaks the sand mould).',
      recommendation: `Add ≥ ${ref.draftDegMin}° draft on all as-cast vertical walls; deep pockets need more. Investment casting can run near-zero draft if this is fixed.`,
    });
  }

  // Isolated heavy sections → shrinkage porosity needing feed.
  if (inputs.hasIsolatedHeavySections) {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: 'Isolated heavy section / boss',
      description: 'A thick mass with no feed path shrinks internally — subsurface porosity that only shows after machining.',
      recommendation: 'Connect the heavy section to a feeder, add a chill to reverse the freeze direction, or hollow/core the mass.',
    });
  }

  // Pressure-tight parts without porosity mitigation.
  if (inputs.pressureTight && (inputs.process === 'hpdc' || inputs.process === 'megacasting') && !inputs.porosityMitigated) {
    issues.push({
      severity: 'major',
      category: 'process',
      title: 'Leak-tight HPDC without gas-porosity mitigation',
      description: 'Conventional HPDC entraps air — gas porosity fails leak tests and cannot be welded/heat-treated to full spec.',
      recommendation: 'Specify vacuum-assist HPDC, or add a resin impregnation step; both carry a cost adder (see secondary-process estimator).',
    });
  }

  // Sharp internal corners → hot tears / stress raisers.
  if (inputs.hasSharpInternalCorners) {
    issues.push({
      severity: 'minor',
      category: 'geometry',
      title: 'Sharp internal corners',
      description: 'Sharp re-entrant corners concentrate stress and are hot-tear initiation sites during solidification.',
      recommendation: 'Add generous fillets (radius ≥ adjoining wall thickness) at all internal corners.',
    });
  }

  // Excess machining stock → material + cycle waste (near-net opportunity).
  if (inputs.machiningStockMm !== undefined && inputs.machiningStockMm > 2) {
    issues.push({
      severity: 'opportunity',
      category: 'process',
      title: `Machining stock ${inputs.machiningStockMm} mm exceeds near-net target`,
      description: 'Every mm of all-over stock adds pour weight, machining time and swarf that is only worth scrap value.',
      recommendation: 'Tighten as-cast tolerance and cut stock toward 0.5–1.0 mm on functional faces only; leave non-functional faces as-cast.',
    });
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? `No casting DFM issues flagged for ${ref.process}; geometry is within reference guidelines.`
    : `${issues.length} casting DFM issue${issues.length === 1 ? '' : 's'} for ${ref.process} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { process: inputs.process, score, issues, summary };
}

// ─── Secondary-process cost adders (HIP / heat-treat / NDT / finishing) ────────

export interface CastingSecondaryInputs {
  alloyFamily: AlloyFamily;
  partWeightKg: number;
  /** Full T6 (solution + quench + age) vs lighter T5 age-only, or none. */
  heatTreat?: 'none' | 't5' | 't6' | 'stress-relieve';
  /** Hot isostatic pressing to close internal porosity (aero/safety-critical). */
  hip?: boolean;
  /** Resin impregnation for leak-tight castings. */
  impregnation?: boolean;
  shotBlast?: boolean;
  /** NDT level: none, X-ray (2D), or CT (full 3D, safety-critical). */
  ndt?: 'none' | 'xray' | 'ct';
  /** Fettling/deburring intensity. */
  fettling?: 'light' | 'medium' | 'heavy';
}

export interface CastingSecondaryAdder {
  label: string;
  basis: 'per-kg' | 'per-part';
  unitCostGbp: number;      // £/kg or £/part
  costPerPartGbp: number;   // resolved £/part
  note: string;
}

export interface CastingSecondaryResult {
  adders: CastingSecondaryAdder[];
  totalPerPartGbp: number;
}

// HIP is dominated by furnace/vessel time and alloy; superalloy/steel need
// higher temperature + pressure than light alloys.
const HIP_COST_PER_KG: Record<AlloyFamily, number> = {
  aluminium: 3.0, magnesium: 3.5, zinc: 3.0, copper: 3.5,
  'grey-iron': 3.5, 'ductile-iron': 3.5, 'carbon-steel': 4.0,
  'stainless-steel': 4.5, superalloy: 9.0,
};

const HEAT_TREAT_COST_PER_KG: Record<'t5' | 't6' | 'stress-relieve', number> = {
  t5: 0.55,             // age only
  t6: 1.10,             // solution + quench + age
  'stress-relieve': 0.35,
};

const NDT_COST_PER_PART: Record<'xray' | 'ct', number> = {
  xray: 5.0,            // 2D radiography, sampling/100%
  ct: 32.0,            // industrial CT, safety-critical
};

const FETTLING_COST_PER_PART: Record<'light' | 'medium' | 'heavy', number> = {
  light: 0.60, medium: 1.80, heavy: 4.50,
};

export function estimateCastingSecondaryAdders(inputs: CastingSecondaryInputs): CastingSecondaryResult {
  const adders: CastingSecondaryAdder[] = [];
  const wt = Math.max(inputs.partWeightKg, 0);

  if (inputs.heatTreat && inputs.heatTreat !== 'none') {
    const unit = HEAT_TREAT_COST_PER_KG[inputs.heatTreat];
    adders.push({
      label: `Heat treat (${inputs.heatTreat.toUpperCase()})`,
      basis: 'per-kg', unitCostGbp: unit, costPerPartGbp: unit * wt,
      note: inputs.heatTreat === 't6'
        ? 'Solution + quench + artificial age — full strength/ductility for structural castings.'
        : inputs.heatTreat === 't5' ? 'Artificial age only — dimensional stability, partial strength.'
        : 'Stress-relieve/normalise for ferrous castings.',
    });
  }

  if (inputs.hip) {
    const unit = HIP_COST_PER_KG[inputs.alloyFamily];
    adders.push({
      label: 'HIP (hot isostatic pressing)',
      basis: 'per-kg', unitCostGbp: unit, costPerPartGbp: unit * wt,
      note: 'Closes internal micro-porosity — standard for aerospace/safety-critical castings; batch furnace, priced per kg of charge.',
    });
  }

  if (inputs.impregnation) {
    adders.push({
      label: 'Vacuum resin impregnation',
      basis: 'per-part', unitCostGbp: 0.90, costPerPartGbp: 0.90,
      note: 'Seals interconnected porosity for leak-tight/pressure parts; ~£0.3–1.2/part depending on size.',
    });
  }

  if (inputs.shotBlast) {
    adders.push({
      label: 'Shot blast / surface prep',
      basis: 'per-part', unitCostGbp: 0.35, costPerPartGbp: 0.35,
      note: 'Removes scale/oxide and keys the surface for coating.',
    });
  }

  if (inputs.fettling) {
    const unit = FETTLING_COST_PER_PART[inputs.fettling];
    adders.push({
      label: `Fettling/deburring (${inputs.fettling})`,
      basis: 'per-part', unitCostGbp: unit, costPerPartGbp: unit,
      note: 'Runner/gate removal, grind flash, deburr — sand/gravity castings run heavier than HPDC.',
    });
  }

  if (inputs.ndt && inputs.ndt !== 'none') {
    const unit = NDT_COST_PER_PART[inputs.ndt];
    adders.push({
      label: `NDT (${inputs.ndt.toUpperCase()})`,
      basis: 'per-part', unitCostGbp: unit, costPerPartGbp: unit,
      note: inputs.ndt === 'ct'
        ? 'Industrial CT — full internal 3D porosity/inclusion map for safety-critical parts.'
        : '2D X-ray radiography — porosity/shrinkage screening, sampling or 100%.',
    });
  }

  const totalPerPartGbp = adders.reduce((s, a) => s + a.costPerPartGbp, 0);
  return { adders, totalPerPartGbp };
}
