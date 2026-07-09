import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

/**
 * Extrusion advisor — process-physics estimators (line-rate from screw output +
 * cooling-limited speed, specific-energy, die-swell) plus a parametric die /
 * calibration-tooling estimator and a DFM analyser. Brings extrusion to parity
 * with the injection / blow / roto / rubber advisers. Deterministic; reference
 * data is engineering-typical and index-anchored to the 2026-07 rate library.
 */

export type ExtrusionFamily =
  | 'pe' | 'pp' | 'rigid-pvc' | 'flex-pvc' | 'ps' | 'abs'
  | 'pa' | 'pc' | 'pet' | 'tpe' | 'filled';
export type ExtrusionProcess =
  | 'pipe' | 'profile' | 'profile-complex' | 'sheet' | 'cable' | 'tube-medical' | 'coex';
export type ScrewType = 'single' | 'twin';
export type ExtrusionCooling = 'water-bath' | 'vacuum-tank' | 'air' | 'water-spray';

/** Map a rate-library material id / grade to an extrusion family. */
export function extrusionFamilyOf(idOrGrade: string): ExtrusionFamily {
  const s = idOrGrade.toLowerCase();
  if (s.includes('pvc') && (s.includes('flex') || s.includes('fpvc') || s.includes('cable') || s.includes('plasticis'))) return 'flex-pvc';
  if (s.includes('pvc') || s.includes('upvc')) return 'rigid-pvc';
  if (s.includes('gf') || s.includes('glass') || s.includes('talc') || s.includes('mineral') || s.includes('lgf')) return 'filled';
  if (s.includes('hips') || s.includes('gpps') || s.includes(' ps') || s.startsWith('ps')) return 'ps';
  if (s.includes('abs')) return 'abs';
  if (s.includes('nylon') || s.includes('ppa') || /\bpa\s?\d/.test(s)) return 'pa';  // PA6/PA66/PA12/PA11…
  if (s.includes('pc') || s.includes('lexan')) return 'pc';
  if (s.includes('pet') || s.includes('petg')) return 'pet';
  if (s.includes('tpe') || s.includes('tpu') || s.includes('tpv')) return 'tpe';
  if (s.includes('pp')) return 'pp';
  return 'pe';
}

// ─── Line-rate estimator: screw output vs cooling-limited speed ────────────────

/** Single-screw output coefficient — kg/hr ≈ COEF · D(mm)² · materialFactor. Tuned so 75 mm PE ≈ 300 kg/hr. */
const OUTPUT_COEF = 0.0533;
/** Output relative to PE — heat-sensitive / high-viscosity polymers run slower. */
const OUTPUT_FACTOR: Record<ExtrusionFamily, number> = {
  pe: 1.00, pp: 0.95, 'rigid-pvc': 0.52, 'flex-pvc': 0.62, ps: 0.90, abs: 0.85,
  pa: 0.85, pc: 0.78, pet: 0.85, tpe: 0.72, filled: 0.80,
};
/** Co-rotating twin-screw compounding lines push far more mass than a single screw of the same Ø. */
const SCREW_TYPE_FACTOR: Record<ScrewType, number> = { single: 1.0, twin: 2.6 };

/** Cooling-limited haul-off speed (m/min) ≈ COOL_SPEED_COEF / wall^1.4, by cooling method. */
const COOL_SPEED_COEF: Record<ExtrusionCooling, number> = {
  'water-bath': 25, 'vacuum-tank': 28, 'water-spray': 22, air: 12,
};

export interface LineRateInputs {
  screwDiameterMm: number;
  family: ExtrusionFamily;
  screwType?: ScrewType;
  wallThicknessMm?: number;      // governs the cooling limit
  profileKgPerM?: number;        // needed to convert cooling speed → mass rate
  cooling?: ExtrusionCooling;
}

export interface LineRatePrediction {
  outputLimitedKgHr: number;     // what the screw can melt
  coolingLimitedKgHr: number | null; // what cooling/haul-off allows (null if geometry unknown)
  lineRateKgHr: number;          // the binding minimum
  lineSpeedMPerMin: number | null;
  limitedBy: 'screw-output' | 'cooling';
}

/**
 * Estimate the achievable extrusion line rate — the single biggest cost driver,
 * previously a blind manual input. Takes the *minimum* of screw melting capacity
 * and cooling-limited haul-off, so thick-wall pipe is correctly cooling-limited.
 */
export function estimateExtrusionLineRate(inp: LineRateInputs): LineRatePrediction {
  const D = Math.max(20, inp.screwDiameterMm);
  const outputKgHr = OUTPUT_COEF * D * D * OUTPUT_FACTOR[inp.family] * SCREW_TYPE_FACTOR[inp.screwType ?? 'single'];

  let coolingLimitedKgHr: number | null = null;
  let lineSpeedMPerMin: number | null = null;
  if (inp.wallThicknessMm && inp.wallThicknessMm > 0 && inp.profileKgPerM && inp.profileKgPerM > 0) {
    const wall = Math.max(0.2, inp.wallThicknessMm);
    lineSpeedMPerMin = COOL_SPEED_COEF[inp.cooling ?? 'water-bath'] / Math.pow(wall, 1.4);
    coolingLimitedKgHr = lineSpeedMPerMin * 60 * inp.profileKgPerM;
  }

  const lineRateKgHr = coolingLimitedKgHr != null ? Math.min(outputKgHr, coolingLimitedKgHr) : outputKgHr;
  return {
    outputLimitedKgHr: Math.round(outputKgHr),
    coolingLimitedKgHr: coolingLimitedKgHr != null ? Math.round(coolingLimitedKgHr) : null,
    lineRateKgHr: Math.round(lineRateKgHr),
    lineSpeedMPerMin: lineSpeedMPerMin != null ? Math.round(lineSpeedMPerMin * 10) / 10 : null,
    limitedBy: coolingLimitedKgHr != null && coolingLimitedKgHr < outputKgHr ? 'cooling' : 'screw-output',
  };
}

// ─── Specific-energy model (kWh/kg) ───────────────────────────────────────────

/** Melt + drive specific energy by family; higher melt-temp polymers cost more. */
const SPECIFIC_ENERGY_KWH_KG: Record<ExtrusionFamily, number> = {
  pe: 0.34, pp: 0.36, 'rigid-pvc': 0.30, 'flex-pvc': 0.32, ps: 0.33, abs: 0.40,
  pa: 0.48, pc: 0.50, pet: 0.45, tpe: 0.40, filled: 0.42,
};
const CHILL_ENERGY_KWH_KG = 0.08;   // downstream water chilling / vacuum
const TWIN_ENERGY_ADDER = 0.15;     // extra shear/venting on compounding lines

/** Process specific energy (kWh per kg extruded), melt + drive + chilling. */
export function estimateExtrusionSpecificEnergy(family: ExtrusionFamily, screwType: ScrewType = 'single'): number {
  const base = SPECIFIC_ENERGY_KWH_KG[family] + CHILL_ENERGY_KWH_KG + (screwType === 'twin' ? TWIN_ENERGY_ADDER : 0);
  return Math.round(base * 1000) / 1000;
}

// ─── Die swell ────────────────────────────────────────────────────────────────

/** Extrudate swell (% increase over die-gap) — viscoelastic PE/PP high, amorphous/filled low. */
const DIE_SWELL_PCT: Record<ExtrusionFamily, number> = {
  pe: 15, pp: 12, 'rigid-pvc': 5, 'flex-pvc': 8, ps: 6, abs: 7,
  pa: 5, pc: 4, pet: 4, tpe: 10, filled: 3,
};
export function estimateDieSwellPct(family: ExtrusionFamily): number {
  return DIE_SWELL_PCT[family];
}

// ─── Parametric die + calibration/sizing tooling ──────────────────────────────

export type DieComplexity = 'simple' | 'moderate' | 'complex';

export interface ExtrusionDieInputs {
  process: ExtrusionProcess;
  sizeMm?: number;          // characteristic dimension (dia / width), drives die + sizing size
  layers?: number;          // co-extrusion layers (1 = mono)
  complexity?: DieComplexity;
}
export interface ExtrusionDieBreakdown {
  die: number;
  calibration: number;      // sizing sleeves / vacuum tank / calibrators
  layers: number;           // co-ex manifold adders
  total: number;
}

/** Base die cost + per-mm size rate + calibration tooling by process. */
function dieRates(p: ExtrusionProcess): { base: number; perMm: number; calBase: number; calPerMm: number } {
  switch (p) {
    case 'pipe':           return { base: 4000,  perMm: 22,  calBase: 3000, calPerMm: 30 };
    case 'profile':        return { base: 5500,  perMm: 30,  calBase: 2500, calPerMm: 20 };
    case 'profile-complex':return { base: 9000,  perMm: 55,  calBase: 4000, calPerMm: 35 }; // EDM slots, multi-chamber
    case 'sheet':          return { base: 12000, perMm: 12,  calBase: 6000, calPerMm: 8  }; // coat-hanger die + roll stack
    case 'cable':          return { base: 3500,  perMm: 10,  calBase: 800,  calPerMm: 4  }; // crosshead, minimal downstream
    case 'tube-medical':   return { base: 6000,  perMm: 40,  calBase: 3500, calPerMm: 25 }; // tight-tol micro sizing
    case 'coex':           return { base: 8000,  perMm: 35,  calBase: 4000, calPerMm: 30 };
    default:               return { base: 5000,  perMm: 25,  calBase: 2500, calPerMm: 20 };
  }
}

/** Estimate an extrusion die + calibration/sizing tool set (£) from process, size and layers. */
export function estimateExtrusionDieCost(inp: ExtrusionDieInputs): ExtrusionDieBreakdown {
  const size = Math.max(2, inp.sizeMm ?? 50);
  const r = dieRates(inp.process);
  const cx = (inp.complexity ?? 'moderate') === 'complex' ? 1.5 : (inp.complexity ?? 'moderate') === 'simple' ? 0.75 : 1.0;
  const layers = Math.max(1, Math.floor(inp.layers ?? 1));

  const die = (r.base + size * r.perMm) * cx;
  const calibration = r.calBase + size * r.calPerMm;
  const layerAdder = (layers - 1) * 3500;  // each extra co-ex layer = feed manifold + extruder tooling

  const total = Math.round(die + calibration + layerAdder);
  return { die: Math.round(die), calibration: Math.round(calibration), layers: Math.round(layerAdder), total };
}

// ─── DFM analyser ─────────────────────────────────────────────────────────────

export interface ExtrusionDFMInputs {
  process: ExtrusionProcess;
  family?: ExtrusionFamily;
  wallThicknessMm?: number;
  minWallMm?: number;               // thinnest section
  maxWallMm?: number;               // thickest section (uniformity)
  minInternalRadiusMm?: number;
  toleranceMm?: number;             // tightest dimensional tolerance requested
  hollowChambers?: number;          // multi-lumen / hollow chambers
  layers?: number;
  unsupportedProjectionMm?: number; // long thin fin/leg on a profile
}
export interface ExtrusionDFMIssue { severity: DFMSeverity; category: DFMCategory; title: string; description: string; recommendation: string; }
export interface ExtrusionDFMResult { score: number; issues: ExtrusionDFMIssue[]; summary: string; }

export function analyseExtrusionDFM(inp: ExtrusionDFMInputs): ExtrusionDFMResult {
  const issues: ExtrusionDFMIssue[] = [];
  const fam = inp.family ?? 'pe';

  // 1. Minimum wall — dies cannot hold very thin extruded sections cleanly.
  const floor = inp.process === 'tube-medical' ? 0.15 : inp.process === 'cable' ? 0.3 : 0.6;
  if (inp.minWallMm !== undefined && inp.minWallMm > 0 && inp.minWallMm < floor) {
    issues.push({ severity: 'major', category: 'geometry',
      title: `Min wall ${inp.minWallMm} mm below ~${floor} mm for ${inp.process}`,
      description: 'Very thin sections draw-down unpredictably and tear; die lands cannot be finished thin enough.',
      recommendation: `Raise the thinnest section to ≥ ${floor} mm, or split into two co-extruded layers.` });
  }

  // 2. Wall-thickness uniformity — uneven walls cool at different rates → warp/bow.
  if (inp.minWallMm && inp.maxWallMm && inp.minWallMm > 0 && inp.maxWallMm / inp.minWallMm > 3) {
    issues.push({ severity: 'major', category: 'geometry',
      title: `Wall ratio ${(inp.maxWallMm / inp.minWallMm).toFixed(1)}:1 (>3:1) — differential cooling`,
      description: 'Thick and thin sections in the same profile cool at different rates, causing bow, twist and sink marks.',
      recommendation: 'Even out wall thickness (target <3:1); core out thick sections or add internal ribs instead of solid mass.' });
  }

  // 3. Sharp internal corners — flow hesitation + stress raiser.
  if (inp.minInternalRadiusMm !== undefined && inp.wallThicknessMm && inp.minInternalRadiusMm < 0.5 * inp.wallThicknessMm) {
    issues.push({ severity: 'minor', category: 'geometry',
      title: `Internal radius ${inp.minInternalRadiusMm} mm sharp vs wall`,
      description: 'Sharp internal corners cause flow hesitation and become fatigue/stress concentrators in the profile.',
      recommendation: 'Radius internal corners to ≥ 0.5×wall; generous radii improve flow balance and part strength at no tooling penalty.' });
  }

  // 4. Tolerance realism — extrusion is a loose-tolerance process.
  if (inp.toleranceMm !== undefined && inp.wallThicknessMm) {
    const achievable = inp.process === 'tube-medical' ? 0.05 : Math.max(0.1, 0.05 * inp.wallThicknessMm + 0.1);
    if (inp.toleranceMm < achievable) {
      issues.push({ severity: 'major', category: 'tolerance',
        title: `Tolerance ±${inp.toleranceMm} mm tighter than extrudable ±${achievable.toFixed(2)} mm`,
        description: 'Extrusion drifts with melt temperature, line speed and die swell; sub-process tolerances drive scrap and 100% gauging.',
        recommendation: 'Relax the tolerance to the extrusion band, add downstream calibration/sizing, or post-machine the critical feature.' });
    }
  }

  // 5. Hollow / multi-lumen chambers — cooling & sizing complexity.
  if (inp.hollowChambers !== undefined && inp.hollowChambers >= 2) {
    issues.push({ severity: 'minor', category: 'process',
      title: `${inp.hollowChambers} hollow chambers — sizing complexity`,
      description: 'Multi-chamber hollow profiles need internal cooling/vacuum and precise mandrel support; each chamber adds die and calibration cost.',
      recommendation: 'Minimise chamber count; ensure each hollow has vacuum access and balanced wall for even cooling.' });
  }

  // 6. Co-extrusion layer count.
  if (inp.layers !== undefined && inp.layers >= 4) {
    issues.push({ severity: 'minor', category: 'tooling',
      title: `${inp.layers}-layer co-extrusion`,
      description: 'Each layer adds an extruder, a feed manifold and interfacial-instability risk; >5 layers rarely justified outside barrier packaging.',
      recommendation: 'Confirm each layer earns its function (barrier, tie, cap); collapse tie/cap layers where properties allow.' });
  }

  // 7. Long unsupported thin projection — droops off the die.
  if (inp.unsupportedProjectionMm !== undefined && inp.wallThicknessMm && inp.unsupportedProjectionMm > 15 * inp.wallThicknessMm) {
    issues.push({ severity: 'minor', category: 'geometry',
      title: `Unsupported projection ${inp.unsupportedProjectionMm} mm (>15×wall)`,
      description: 'Long thin legs/fins sag under their own weight before the calibrator captures them, going out of position.',
      recommendation: 'Thicken the projection, shorten it, or add a tie-in web so the calibrator can hold its position.' });
  }

  // 8. Die-swell advisory for high-swell families on tight profiles.
  if ((fam === 'pe' || fam === 'pp' || fam === 'tpe') && (inp.process === 'profile' || inp.process === 'profile-complex')) {
    issues.push({ severity: 'opportunity', category: 'process',
      title: `${fam.toUpperCase()} die swell ~${estimateDieSwellPct(fam)}% — allow die-tuning trials`,
      description: 'High-swell polymers need the die profile shrunk vs the target section and several tuning trials at first-off.',
      recommendation: 'Budget die-swell tuning scrap; consider a lower-swell grade or a filled compound for dimensionally critical profiles.' });
  }

  let score = 10;
  for (const i of issues) score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No extrusion DFM issues flagged; geometry is within reference guidelines.'
    : `${issues.length} extrusion DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;
  return { score, issues, summary };
}
