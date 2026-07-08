import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

/**
 * E-motor / transformer lamination advisor — the finishing steps that sit on top
 * of the base stamping (blank/notch) cost: stack joining, stress-relief anneal
 * and insulation coating, plus a lamination DFM check. Deterministic; reference
 * figures are engineering-typical, index-anchored to the 2026-07 rate basis.
 */

export type StackMethod = 'interlock' | 'laser-weld' | 'backlack' | 'cleat-rivet' | 'loose-endplate';

// ─── Stack-joining cost (BR/EM3) ──────────────────────────────────────────────

export interface LaminationJoinInputs {
  stackMethod: StackMethod;
  /** Number of laminations in the finished stack. */
  laminationCount: number;
  /** Stack height, mm (used for weld/bond length scaling). */
  stackHeightMm?: number;
}

/**
 * Per-STACK joining cost (£). Interlock is formed in the progressive die → nearly
 * free per part; laser welding and backlack bonding add real processing cost that
 * scales with stack height / lamination count.
 */
export function estimateLaminationJoinCostPerStack(inputs: LaminationJoinInputs): number {
  const n = Math.max(1, Math.floor(inputs.laminationCount || 1));
  const h = Math.max(1, inputs.stackHeightMm ?? n * 0.35);
  switch (inputs.stackMethod) {
    case 'interlock':      return 0.02 + n * 0.0008;          // in-die cleats — marginal handling only
    case 'cleat-rivet':    return 0.15 + n * 0.004;           // mechanical cleats / rivets
    case 'loose-endplate': return 0.25 + h * 0.010;           // end-plates + through-bolts, more assembly
    case 'laser-weld':     return 0.40 + h * 0.030;           // OD stack welds, ~£/mm of weld
    case 'backlack':       return 0.60 + n * 0.006;           // self-bonding varnish cure (oven time + varnish)
    default:               return 0.20;
  }
}

// ─── Anneal + coating reference ───────────────────────────────────────────────

/** Stress-relief/decarb anneal energy per kg of laminations (~800°C continuous). */
export const LAMINATION_ANNEAL_KWH_PER_KG = 0.45;
/** Insulation re-coat (C5/C6) cost per kg when applied after anneal. */
export const LAMINATION_COATING_GBP_PER_KG = 0.30;

export interface LaminationFinishingInputs {
  stackMethod: StackMethod;
  laminationCount: number;
  stackHeightMm?: number;
  partWeightKg: number;               // finished single-lamination (or stack) weight for anneal/coating
  stressReliefAnneal?: boolean;
  annealEnergyPricePerKwh?: number;   // default 0.23
  reCoat?: boolean;                   // insulation re-coat after anneal
}

export interface LaminationFinishingBreakdown {
  joinPerStack: number;
  annealEnergyPerPart: number;
  coatingPerPart: number;
  /** Total per-part finishing consumable to feed extraConsumablesPerPart. */
  totalPerPart: number;
}

/**
 * Resolve the per-part lamination finishing cost (join + stress-relief anneal
 * energy + optional re-coat). Join cost is per stack; when the costed part is a
 * single lamination, divide by laminationCount to get the per-part share.
 */
export function estimateLaminationFinishing(inputs: LaminationFinishingInputs): LaminationFinishingBreakdown {
  const n = Math.max(1, Math.floor(inputs.laminationCount || 1));
  const joinPerStack = estimateLaminationJoinCostPerStack(inputs);
  const joinPerPart = joinPerStack / n;                 // per single lamination
  const annealEnergyPerPart = inputs.stressReliefAnneal
    ? LAMINATION_ANNEAL_KWH_PER_KG * Math.max(0, inputs.partWeightKg) * (inputs.annealEnergyPricePerKwh ?? 0.23)
    : 0;
  const coatingPerPart = inputs.reCoat ? LAMINATION_COATING_GBP_PER_KG * Math.max(0, inputs.partWeightKg) : 0;
  const totalPerPart = joinPerPart + annealEnergyPerPart + coatingPerPart;
  return {
    joinPerStack: Math.round(joinPerStack * 1000) / 1000,
    annealEnergyPerPart: Math.round(annealEnergyPerPart * 1000) / 1000,
    coatingPerPart: Math.round(coatingPerPart * 1000) / 1000,
    totalPerPart: Math.round(totalPerPart * 1000) / 1000,
  };
}

// ─── Lamination DFM ───────────────────────────────────────────────────────────

export interface LaminationDFMInputs {
  thicknessMm: number;
  /** Narrowest slot / tooth width, mm — thin features vs punch strength. */
  minToothWidthMm?: number;
  /** Narrowest back-iron / bridge width, mm. */
  minBridgeWidthMm?: number;
  /** Air-gap surface tolerance on rotor/stator bore, mm. */
  airGapToleranceMm?: number;
  stackMethod?: StackMethod;
  /** True if a stress-relief anneal is planned (recovers blanking-degraded loss). */
  stressReliefAnneal?: boolean;
  /** Grade is thin-gauge (≤0.27mm) — burr/handling & tool-wear sensitive. */
  thinGauge?: boolean;
}

export interface LaminationDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface LaminationDFMResult {
  score: number;
  issues: LaminationDFMIssue[];
  summary: string;
}

export function analyseLaminationDFM(inputs: LaminationDFMInputs): LaminationDFMResult {
  const issues: LaminationDFMIssue[] = [];
  const t = inputs.thicknessMm;

  // 1. Tooth / slot width vs thickness — punch breakage on narrow features.
  if (inputs.minToothWidthMm !== undefined && t > 0 && inputs.minToothWidthMm < t) {
    issues.push({
      severity: 'major', category: 'geometry',
      title: `Tooth/slot width ${inputs.minToothWidthMm} mm below material thickness ${t} mm`,
      description: 'Punching a feature narrower than the strip thickness breaks slender punches and burrs the lamination edge.',
      recommendation: 'Keep tooth/slot widths ≥ 1–1.5×thickness, or notch (rather than progressive-blank) the finest features.',
    });
  }

  // 2. Back-iron bridge width.
  if (inputs.minBridgeWidthMm !== undefined && t > 0 && inputs.minBridgeWidthMm < 1.5 * t) {
    issues.push({
      severity: 'minor', category: 'geometry',
      title: `Bridge/back-iron ${inputs.minBridgeWidthMm} mm below 1.5×thickness`,
      description: 'Very thin bridges distort during blanking and stacking and saturate magnetically.',
      recommendation: 'Widen bridges to ≥ 1.5–2×thickness; check magnetic saturation of the narrow flux path.',
    });
  }

  // 3. Air-gap / bore tolerance.
  if (inputs.airGapToleranceMm !== undefined && inputs.airGapToleranceMm > 0 && inputs.airGapToleranceMm < 0.02) {
    issues.push({
      severity: 'major', category: 'tolerance',
      title: `Air-gap tolerance ±${inputs.airGapToleranceMm} mm is very tight`,
      description: 'Sub-20µm bore/air-gap control fights die wear and stack build-up variation; drives scrap and cogging-torque spread.',
      recommendation: 'Hold ±0.02–0.03 mm from the progressive die; for tighter, add a final bore grind/hone or bond+machine the stack.',
    });
  }

  // 4. Stress-relief anneal recommendation (loss recovery).
  if (inputs.stressReliefAnneal === false) {
    issues.push({
      severity: 'opportunity', category: 'process',
      title: 'No stress-relief anneal planned',
      description: 'Blanking work-hardens the cut edge and raises core loss 5–20%; skipping the anneal leaves efficiency on the table.',
      recommendation: 'Add a stress-relief anneal (~800°C, N₂/H₂) for efficiency-critical motors; semi-processed grades require it.',
    });
  }

  // 5. Laser weld magnetic short.
  if (inputs.stackMethod === 'laser-weld') {
    issues.push({
      severity: 'minor', category: 'process',
      title: 'Laser stack welding shorts edge laminations',
      description: 'OD welds electrically bridge a few laminations, adding local eddy-current loss — usually acceptable, but not for the lowest-loss designs.',
      recommendation: 'For high-efficiency EV traction prefer interlock or backlack bonding; keep welds short and off high-flux regions.',
    });
  }

  // 6. Thin-gauge handling / burr.
  if (inputs.thinGauge) {
    issues.push({
      severity: 'minor', category: 'process',
      title: 'Thin-gauge (≤0.27 mm) handling & burr control',
      description: 'Thin electrical steel burrs and warps easily and wears notch tooling fast, degrading stacking factor and loss.',
      recommendation: 'Maintain tight punch-die clearance (~5–8% of thickness), regrind tooling frequently, and monitor burr < 8% of thickness.',
    });
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No lamination DFM issues flagged; geometry and process are within reference guidelines.'
    : `${issues.length} lamination DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { score, issues, summary };
}
