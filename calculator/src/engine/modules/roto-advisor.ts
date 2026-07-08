import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

/**
 * Rotational-moulding advisor — cycle-time predictor, parametric mould-cost
 * estimator and a DFM analyser, parity with the casting/forging/injection
 * advisers. Deterministic; reference data is engineering-typical and
 * index-anchored to the 2026-07 rate-library basis.
 */

export type RotoMaterialFamily = 'pe' | 'xlpe' | 'pp' | 'pa12';
export type RotoCoolingMethod = 'ambient' | 'forced-air' | 'water-spray';
export type RotoMouldType = 'cast-al' | 'cnc-al' | 'fabricated';
export type RotoComplexity = 'simple' | 'moderate' | 'complex';

// ─── Cycle-time predictor (BR3) ───────────────────────────────────────────────

/**
 * Oven heating time per mm of wall (s/mm) by material — roto heats by conduction
 * through the mould, so time rises with wall thickness and with melt temperature
 * (PA12 ≫ PE). Includes a base soak for the mould mass.
 */
const ROTO_HEAT_S_PER_MM: Record<RotoMaterialFamily, number> = {
  pe: 210,
  xlpe: 230,   // cross-link needs a longer bake to complete
  pp: 230,
  pa12: 300,   // higher melt/PIAT
};
const ROTO_HEAT_BASE_SEC = 240;

/** Cooling multiplier on heating time by method. */
const ROTO_COOL_FACTOR: Record<RotoCoolingMethod, number> = {
  ambient: 1.9,
  'forced-air': 1.35,
  'water-spray': 0.85,
};

export interface RotoCycleInputs {
  wallThicknessMm: number;
  material?: RotoMaterialFamily;
  coolingMethod?: RotoCoolingMethod;
}

export interface RotoCyclePrediction {
  heatingSec: number;
  coolingSec: number;
}

/**
 * Predict roto oven + cooling time from wall thickness, material and cooling
 * method — the two dominant roto cost drivers, previously left as manual guesses.
 */
export function estimateRotoCycle(inputs: RotoCycleInputs): RotoCyclePrediction {
  const wall = Math.max(0.5, inputs.wallThicknessMm);
  const perMm = ROTO_HEAT_S_PER_MM[inputs.material ?? 'pe'];
  const heatingSec = Math.round(ROTO_HEAT_BASE_SEC + wall * perMm);
  const coolingSec = Math.round(heatingSec * ROTO_COOL_FACTOR[inputs.coolingMethod ?? 'forced-air']);
  return { heatingSec, coolingSec };
}

// ─── Parametric mould-cost estimator (BR3) ────────────────────────────────────

export interface RotoMouldCostInputs {
  projectedAreaCm2: number;    // part footprint — drives tool size
  mouldType?: RotoMouldType;
  complexity?: RotoComplexity;
  ventsAndInserts?: number;    // vents + threaded inserts + kiss-off details
}

export interface RotoMouldCostBreakdown {
  base: number;
  size: number;
  details: number;   // vents, inserts, insulation
  total: number;
}

/** Mould-type base + per-cm² rate. Cast-Al cheapest, CNC-Al precision, fabricated for large simple tanks. */
function rotoMouldRates(type: RotoMouldType): { base: number; perCm2: number } {
  switch (type) {
    case 'cnc-al':     return { base: 6000, perCm2: 18 };  // machined from billet — precision, tight tol
    case 'fabricated': return { base: 4000, perCm2: 6 };   // welded sheet steel — big simple tanks
    case 'cast-al':
    default:           return { base: 3000, perCm2: 9 };   // cast aluminium — complex shapes, most common
  }
}

/**
 * Estimate a roto mould cost (£) from part footprint and construction instead of
 * a bare manual figure. Roto tools are far cheaper than injection/blow moulds.
 */
export function estimateRotoMouldCost(inputs: RotoMouldCostInputs): RotoMouldCostBreakdown {
  const area = Math.max(0, inputs.projectedAreaCm2);
  const rates = rotoMouldRates(inputs.mouldType ?? 'cast-al');
  const complexityFactor = (inputs.complexity ?? 'moderate') === 'complex' ? 1.5
    : (inputs.complexity ?? 'moderate') === 'simple' ? 0.75 : 1.0;

  const base = rates.base;
  const size = area * rates.perCm2 * complexityFactor;
  const details = Math.max(0, Math.floor(inputs.ventsAndInserts ?? 0)) * 250 + 500; // insulation + vents

  const total = Math.round(base + size + details);
  return { base, size: Math.round(size), details: Math.round(details), total };
}

// ─── DFM analyser (BR3) ───────────────────────────────────────────────────────

export interface RotoDFMInputs {
  wallThicknessMm: number;
  material?: RotoMaterialFamily;
  /** Smallest internal corner radius, mm — small radii bridge with powder. */
  minInternalRadiusMm?: number;
  /** Minimum draft angle on side walls, degrees. */
  draftAngleDeg?: number;
  /** Large flat unsupported span (mm) prone to warpage/sink. */
  flatUnsupportedSpanMm?: number;
  /** Enclosed hollow with no vent — will balloon/collapse. */
  enclosedNoVent?: boolean;
  /** Double-wall / kiss-off feature requested. */
  doubleWallKissOff?: boolean;
}

export interface RotoDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface RotoDFMResult {
  score: number;
  issues: RotoDFMIssue[];
  summary: string;
}

export function analyseRotoDFM(inputs: RotoDFMInputs): RotoDFMResult {
  const issues: RotoDFMIssue[] = [];
  const t = inputs.wallThicknessMm;
  const minWall = inputs.material === 'pa12' ? 2.0 : 1.5;

  // 1. Wall too thin to control in roto.
  if (t > 0 && t < minWall) {
    issues.push({
      severity: 'major', category: 'geometry',
      title: `Wall ${t} mm below roto minimum ~${minWall} mm`,
      description: 'Roto has no pressure to pack thin walls; below ~1.5–2 mm you get pinholes, incomplete sintering and blow-holes.',
      recommendation: `Increase nominal wall to ≥ ${minWall} mm; roto naturally holds a uniform wall so add thickness globally rather than locally.`,
    });
  }

  // 2. Sharp internal corners → powder bridging / thinning.
  if (inputs.minInternalRadiusMm !== undefined && t > 0 && inputs.minInternalRadiusMm < 3 * t) {
    issues.push({
      severity: 'major', category: 'geometry',
      title: `Internal radius ${inputs.minInternalRadiusMm} mm below ~3×wall (${(3 * t).toFixed(1)} mm)`,
      description: 'Powder bridges sharp internal corners and starves them — the outside corner runs thin and weak.',
      recommendation: 'Open internal radii to ≥ 3×wall (ideally 4–5×); generous radii are essentially free in roto tooling.',
    });
  }

  // 3. Draft for demould.
  if (inputs.draftAngleDeg !== undefined && inputs.draftAngleDeg < 1) {
    issues.push({
      severity: inputs.draftAngleDeg <= 0 ? 'major' : 'minor', category: 'tooling',
      title: `Draft ${inputs.draftAngleDeg}° below 1° minimum`,
      description: 'Parts shrink onto male tool features; too little draft makes demoulding slow and risks tearing.',
      recommendation: 'Add ≥ 1–2° draft on side walls (more on textured surfaces); consider ejection aids on deep draws.',
    });
  }

  // 4. Large flat unsupported span → warpage.
  if (inputs.flatUnsupportedSpanMm !== undefined && inputs.flatUnsupportedSpanMm > 300) {
    issues.push({
      severity: 'major', category: 'geometry',
      title: `Flat unsupported span ${inputs.flatUnsupportedSpanMm} mm — warpage risk`,
      description: 'Large flat panels warp and sink on cooling because roto walls cool unevenly with no packing pressure.',
      recommendation: 'Add ribs, domes, kiss-offs or a slight crown (≥ 1.5% of span) to stiffen large flats.',
    });
  }

  // 5. Enclosed volume with no vent.
  if (inputs.enclosedNoVent) {
    issues.push({
      severity: 'critical', category: 'process',
      title: 'Enclosed hollow with no vent',
      description: 'Trapped air expands in the oven and contracts on cooling — the part balloons then collapses/dimples without a vent.',
      recommendation: 'Add a PTFE-lined vent tube sized to the enclosed volume at the highest point; every closed roto cavity needs venting.',
    });
  }

  // 6. Double-wall / kiss-off feasibility note.
  if (inputs.doubleWallKissOff) {
    issues.push({
      severity: 'minor', category: 'geometry',
      title: 'Double-wall / kiss-off feature',
      description: 'Kiss-offs need controlled tool gap (~3–4×wall) to fuse both walls; too large and they do not knit, too small and they thin.',
      recommendation: 'Target a kiss-off gap of ~3.5×nominal wall and validate weld strength; add a draft so the mating faces release.',
    });
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No roto DFM issues flagged; geometry is within reference guidelines.'
    : `${issues.length} roto DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { score, issues, summary };
}
