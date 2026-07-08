import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

export type VolumeCategory = 'low' | 'medium' | 'high';
export type ComplexityLevel = 'low' | 'medium' | 'high';
export type HoleDensityLevel = 'low' | 'high';

export interface ProcessAdvisorInputs {
  annualVolume: number;
  thicknessMm: number;
  complexity: ComplexityLevel;
  holeDensity: HoleDensityLevel;
  materialFamily: 'steel' | 'stainless' | 'aluminium' | 'galvanised';
}

export interface SheetMetalProcessRecommendation {
  primaryProcess: string;
  formingProcess: string;
  processRoute: string[];
  suggestedMachineIds: string[];
  toolingBand: string;
  toleranceCapability: string;
  reason: string;
  volumeCategory: VolumeCategory;
}

export function classifyVolume(annualVolume: number): VolumeCategory {
  if (annualVolume < 1000) return 'low';
  if (annualVolume < 50000) return 'medium';
  return 'high';
}

export function adviseSheetMetalProcess(inputs: ProcessAdvisorInputs): SheetMetalProcessRecommendation {
  const volumeCategory = classifyVolume(inputs.annualVolume);

  if (volumeCategory === 'high' && inputs.thicknessMm <= 3) {
    const complexDie = inputs.complexity === 'high';
    return {
      primaryProcess: complexDie ? 'Progressive / Transfer Stamping' : 'Progressive Stamping',
      formingProcess: complexDie ? 'Transfer Stamping' : 'Progressive Stamping',
      processRoute: ['Coil Feeding', complexDie ? 'Transfer Stamping' : 'Progressive Stamping', 'Inline Inspection'],
      suggestedMachineIds: ['press-schuler-400t', 'press-aida-200t'],
      // High geometric complexity drives more stations / a transfer die → higher NRE band.
      toolingBand: complexDie ? '£120k–£450k (multi-station transfer die)' : '£50k–£250k (progressive die)',
      toleranceCapability: '±0.05–0.15 mm',
      reason: complexDie
        ? 'High volume favours stamping, but high geometric complexity needs a multi-station transfer die — higher tooling NRE; verify die budget before committing'
        : 'High volume favours progressive stamping — lowest piece cost once tooling amortized',
      volumeCategory,
    };
  }

  if (volumeCategory === 'medium' && inputs.holeDensity === 'high') {
    return {
      primaryProcess: 'Turret Punching',
      formingProcess: 'Press Brake Bending',
      processRoute: ['Turret Punching', 'Press Brake Bending', 'Deburring'],
      suggestedMachineIds: ['punch-amada-emz3610', 'brake-amada-hfe100'],
      toolingBand: '£2k–£10k (standard punch tooling)',
      toleranceCapability: '±0.1–0.2 mm',
      reason: 'High hole density favours punching over laser (lower cost per hit at medium volume)',
      volumeCategory,
    };
  }

  const isSpecialMaterial =
    inputs.materialFamily === 'stainless' || inputs.materialFamily === 'aluminium';

  let reason: string;
  if (volumeCategory === 'low') {
    reason = isSpecialMaterial
      ? 'laser produces clean dross-free edge on stainless/aluminium; no hard tooling needed at low volume'
      : 'low volume — no hard tooling needed; laser cutting minimises NRE';
  } else if (isSpecialMaterial) {
    reason = 'laser produces clean dross-free edge on stainless/aluminium';
  } else {
    reason = 'high complexity or medium volume without high hole density — laser offers flexibility with low tooling cost';
  }

  return {
    primaryProcess: 'Laser Cutting',
    formingProcess: 'Press Brake Bending',
    processRoute: ['Laser Cutting', 'Press Brake Bending', 'Deburring'],
    suggestedMachineIds: ['laser-trumpf-3030', 'brake-trumpf-5230'],
    toolingBand: '£500–£3k (nest programming only)',
    toleranceCapability: '±0.1–0.2 mm',
    reason,
    volumeCategory,
  };
}

// ─── DFM rules (parity with casting/forging analysers) ────────────────────────

export type SMMaterialFamily = 'steel' | 'stainless' | 'aluminium' | 'galvanised';

export interface SheetMetalDFMInputs {
  thicknessMm: number;
  materialFamily: SMMaterialFamily;
  /** Smallest inside bend radius on the part, mm. */
  minBendRadiusMm?: number;
  /** Smallest punched/laser hole diameter, mm. */
  minHoleDiameterMm?: number;
  /** Smallest feature/hole-to-edge or hole-to-bend distance, mm. */
  minFeatureToEdgeMm?: number;
  /** Number of bends on the part. */
  bendCount?: number;
  /** Tightest tolerance called up, mm. */
  toleranceMm?: number;
  /** Total weld length per part, m (distortion risk). */
  weldLengthM?: number;
  /** Blank nesting utilisation 0–1. */
  materialUtilization?: number;
  /** High-strength steel (AHSS/UHSS/press-hardened) — worse formability. */
  highStrength?: boolean;
}

export interface SheetMetalDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface SheetMetalDFMResult {
  score: number;   // 1–10, 10 = clean
  issues: SheetMetalDFMIssue[];
  summary: string;
}

/** Minimum sensible inside bend radius as a multiple of thickness, by material. */
function minBendRadiusFactor(family: SMMaterialFamily, highStrength: boolean): number {
  if (highStrength) return 3.0;                 // AHSS/UHSS crack easily
  if (family === 'aluminium') return 1.5;       // work-hardens, cracks
  if (family === 'stainless') return 1.0;
  return 0.8;                                    // mild/galvanised steel
}

/** Minimum punchable hole diameter as a multiple of thickness, by material. */
function minHoleFactor(family: SMMaterialFamily): number {
  return family === 'stainless' || family === 'aluminium' ? 1.3 : 1.0;
}

export function analyseSheetMetalDFM(inputs: SheetMetalDFMInputs): SheetMetalDFMResult {
  const t = inputs.thicknessMm;
  const issues: SheetMetalDFMIssue[] = [];

  // 1. Bend radius vs thickness — cracking / fracture.
  if (inputs.minBendRadiusMm !== undefined && t > 0) {
    const factor = minBendRadiusFactor(inputs.materialFamily, !!inputs.highStrength);
    const minR = factor * t;
    if (inputs.minBendRadiusMm < minR) {
      issues.push({
        severity: inputs.highStrength ? 'critical' : 'major',
        category: 'geometry',
        title: `Bend radius ${inputs.minBendRadiusMm} mm below minimum ${minR.toFixed(1)} mm (${factor}×t)`,
        description: 'Bending tighter than the material minimum cracks the outer fibre and raises springback.',
        recommendation: `Open the inside radius to ≥ ${minR.toFixed(1)} mm, orient the bend across the grain, or specify a more formable temper/grade.`,
      });
    }
  }

  // 2. Hole diameter vs thickness — punch breakage.
  if (inputs.minHoleDiameterMm !== undefined && t > 0) {
    const minD = minHoleFactor(inputs.materialFamily) * t;
    if (inputs.minHoleDiameterMm < minD) {
      issues.push({
        severity: 'major',
        category: 'geometry',
        title: `Hole Ø${inputs.minHoleDiameterMm} mm below minimum ${minD.toFixed(1)} mm`,
        description: 'Punching a hole smaller than material thickness breaks punches and burrs the edge; laser is slow/pierce-heavy at that size.',
        recommendation: `Increase hole diameter to ≥ ${minD.toFixed(1)} mm, or drill as a secondary op.`,
      });
    }
  }

  // 3. Feature-to-edge / hole-to-bend distance — tear-out & distortion.
  if (inputs.minFeatureToEdgeMm !== undefined && t > 0 && inputs.minFeatureToEdgeMm < 2 * t) {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: `Feature-to-edge ${inputs.minFeatureToEdgeMm} mm below 2×t (${(2 * t).toFixed(1)} mm)`,
      description: 'Holes/slots too close to an edge or bend tear out or distort during forming.',
      recommendation: 'Keep holes ≥ 2×t from edges and ≥ 2.5×t + radius from a bend line.',
    });
  }

  // 4. Tight tolerance for sheet.
  if (inputs.toleranceMm !== undefined && inputs.toleranceMm < 0.10) {
    issues.push({
      severity: inputs.toleranceMm < 0.05 ? 'major' : 'minor',
      category: 'tolerance',
      title: `Tolerance ±${inputs.toleranceMm} mm is tight for sheet metal`,
      description: 'Sub-0.1 mm tolerances on formed features fight springback and fixturing variation — driving inspection and scrap.',
      recommendation: 'Relax to ±0.1–0.2 mm where function allows, or add a coining/restrike/machining step only on the critical feature.',
    });
  }

  // 5. Weld length — distortion.
  if (inputs.weldLengthM !== undefined && inputs.weldLengthM > 0.5) {
    issues.push({
      severity: 'minor',
      category: 'process',
      title: `Weld length ${inputs.weldLengthM} m per part — distortion risk`,
      description: 'Continuous welding on thin sheet induces heat distortion and residual stress.',
      recommendation: 'Use stitch/skip welds, balanced weld sequence and fixturing; consider spot welding or clinching/SPR instead of seam welds.',
    });
  }

  // 6. High bend count — handling / setup.
  if (inputs.bendCount !== undefined && inputs.bendCount > 8) {
    issues.push({
      severity: 'minor',
      category: 'process',
      title: `${inputs.bendCount} bends per part`,
      description: 'Many bends multiply press-brake handling, tool changes and cumulative angle tolerance.',
      recommendation: 'Reduce bend count, group same-tool bends, or move to a stamping die if volume supports it.',
    });
  }

  // 7. Nesting utilisation.
  if (inputs.materialUtilization !== undefined && inputs.materialUtilization < 0.65) {
    issues.push({
      severity: 'major',
      category: 'material',
      title: `Blank nesting ${(inputs.materialUtilization * 100).toFixed(0)}% — high skeleton scrap`,
      description: 'Over a third of the sheet becomes offcut/skeleton scrap recovered only at scrap value.',
      recommendation: 'Optimise nesting (common-line cutting, part rotation), right-size the blank, or negotiate scrap buy-back.',
    });
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No sheet-metal DFM issues flagged; geometry is within reference guidelines.'
    : `${issues.length} sheet-metal DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { score, issues, summary };
}

// ─── Stamping die-cost estimator + die-life predictor (SM1) ───────────────────

export type StampingDieType = 'single_stage' | 'progressive' | 'transfer' | 'fine_blanking';

export interface StampingDieCostInputs {
  dieType: StampingDieType;
  /** Number of die stations / operations (blank/pierce/form/trim…). */
  stations: number;
  /** Developed blank footprint in cm² — drives die block size. */
  blankAreaCm2: number;
  /** Material shear strength MPa — a proxy for hardness/abrasiveness (UHSS/boron ≫ mild). */
  shearStrengthMPa: number;
}

export interface StampingDieCostBreakdown {
  base: number;
  stations: number;   // station machining cost (all stations)
  total: number;
}

/** Die-construction base + per-station cost by die type. */
function stampingDieRates(type: StampingDieType): { base: number; perStation: number } {
  switch (type) {
    case 'single_stage':  return { base: 6000, perStation: 2500 };
    case 'transfer':      return { base: 20000, perStation: 9000 };
    case 'fine_blanking': return { base: 30000, perStation: 12000 };  // triple-action FB tools are dear
    case 'progressive':
    default:              return { base: 12000, perStation: 6000 };
  }
}

/** Tool-steel/coating hardness factor from workpiece shear strength (mild ~280 → 1.0, boron ~900 → ~1.8). */
export function stampingHardnessFactor(shearStrengthMPa: number): number {
  return Math.min(2.0, 1 + Math.max(0, (shearStrengthMPa - 300)) / 300 * 0.4);
}

/**
 * Estimate a stamping die-set cost (£) from die type, station count, blank size
 * and material hardness, instead of a bare manual number. Progressive/transfer
 * dies scale with stations; harder materials (UHSS/boron) need premium tool
 * steel + coatings.
 */
export function estimateStampingDieCost(inputs: StampingDieCostInputs): StampingDieCostBreakdown {
  const stations = Math.max(1, Math.floor(inputs.stations || 1));
  const rates = stampingDieRates(inputs.dieType);
  const sizeFactor = 0.5 + Math.max(0, inputs.blankAreaCm2) / 500;   // 300 cm² → 1.1×
  const hardnessFactor = stampingHardnessFactor(inputs.shearStrengthMPa);

  const base = rates.base * sizeFactor * hardnessFactor;
  const stationCost = stations * rates.perStation * sizeFactor * hardnessFactor;
  const total = Math.round(base + stationCost);
  return { base: Math.round(base), stations: Math.round(stationCost), total };
}

export interface StampingDieLifeInputs {
  shearStrengthMPa: number;
  thicknessMm: number;
  dieType: StampingDieType;
}

/**
 * Predict die life (parts/strokes per die set). Abrasive high-strength steel and
 * thick stock wear tools fast; fine-blanking tools wear faster than blanking.
 * Clamped to a sane 50k–3M window.
 */
export function estimateStampingDieLife(inputs: StampingDieLifeInputs): number {
  const shear = Math.max(150, inputs.shearStrengthMPa);
  const lifeFromShear = 1_000_000 * Math.pow(300 / shear, 1.3);
  const thicknessFactor = inputs.thicknessMm <= 1.5 ? 1.0 : Math.max(0.5, 1.5 / inputs.thicknessMm);
  const fineBlankFactor = inputs.dieType === 'fine_blanking' ? 0.6 : 1.0;
  const life = lifeFromShear * thicknessFactor * fineBlankFactor;
  const clamped = Math.min(3_000_000, Math.max(50_000, life));
  return Math.round(clamped / 10_000) * 10_000;   // round to nearest 10k
}
