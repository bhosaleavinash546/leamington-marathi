import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

/**
 * Rubber / elastomer advisor — cure-time (t90) predictor, parametric mould-cost
 * estimator, compound-cost recipe helper and a DFM analyser. Parity with the
 * casting/forging/injection/roto/lamination advisers. Deterministic; reference
 * figures are engineering-typical, index-anchored to the 2026-07 rate basis.
 */

export type RubberCompoundFamily =
  | 'nr' | 'sbr' | 'br' | 'epdm-sulphur' | 'epdm-peroxide' | 'nbr' | 'hnbr'
  | 'cr' | 'iir' | 'halobutyl' | 'fkm' | 'ffkm' | 'silicone-hcr' | 'silicone-lsr'
  | 'acm' | 'aem' | 'eco' | 'csm' | 'pu';

export type RubberProc =
  | 'compression_mould' | 'transfer_mould' | 'injection_mould_lsr'
  | 'extrusion_vulcanise' | 'calendering' | 'die_cut';

export type RubberMouldSteel = 'aluminium' | 'p20' | 'h13';
export type RubberComplexity = 'simple' | 'moderate' | 'complex';

// ─── Cure-time (t90) predictor (RB1) ──────────────────────────────────────────

/**
 * Intrinsic cure time (s) at the 170°C reference for a fully-heated thin section,
 * by compound family. Fast peroxide/LSR systems cure in seconds; sulphur diene
 * rubbers in minutes; FKM/FFKM need long cures (+ separate post-cure).
 */
export const RUBBER_CURE_BASE_SEC: Record<RubberCompoundFamily, number> = {
  'silicone-lsr': 25,
  'silicone-hcr': 90,
  'epdm-peroxide': 240,
  nr: 100, sbr: 120, br: 120,
  'epdm-sulphur': 180,
  nbr: 150, cr: 160, eco: 180, acm: 300, aem: 300, csm: 200, pu: 150,
  hnbr: 300,
  iir: 300, halobutyl: 260,
  fkm: 360, ffkm: 720,
};

/** Default cure/mould temperature (°C) by family — LSR/peroxide run hotter, thick sulphur cooler. */
function defaultCureTempC(f: RubberCompoundFamily): number {
  if (f === 'silicone-lsr') return 180;
  if (f === 'silicone-hcr') return 175;
  if (f === 'fkm' || f === 'ffkm') return 180;
  return 170;
}

export interface RubberCureInputs {
  compoundFamily: RubberCompoundFamily;
  thicknessMm: number;          // section thickness driving heat penetration
  moldTempC?: number;           // actual cure temperature (default per family)
  process?: RubberProc;
}

/**
 * Predict full cycle time (s) = temperature-adjusted intrinsic cure + heat-
 * penetration term (∝ thickness²) + process handling overhead. Arrhenius-style
 * rule of thumb: cure rate roughly doubles per +10°C.
 */
export function estimateRubberCureTimeSec(inputs: RubberCureInputs): number {
  const base = RUBBER_CURE_BASE_SEC[inputs.compoundFamily];
  const refT = 170;
  const T = inputs.moldTempC ?? defaultCureTempC(inputs.compoundFamily);
  const tempFactor = Math.pow(2, (refT - T) / 10);            // hotter → faster
  const thickness = Math.max(0.3, inputs.thicknessMm);
  const heatPenetrationSec = 4 * thickness * thickness;        // ~4 s/mm² to fully cure the centre
  const cureSec = base * tempFactor + heatPenetrationSec;

  // Handling overhead (load/close/open/eject) by process.
  const handling =
    inputs.process === 'injection_mould_lsr' ? 12 :
    inputs.process === 'transfer_mould' ? 25 :
    inputs.process === 'die_cut' ? 4 :
    inputs.process === 'extrusion_vulcanise' ? 0 :
    inputs.process === 'calendering' ? 0 :
    30; // compression
  return Math.round(cureSec + handling);
}

// ─── Compound-cost recipe helper (RB1 / Part 1.2) ─────────────────────────────

export interface CompoundRecipeInputs {
  basePolymerPricePerKg: number;
  /** Carbon-black / filler loading in phr (parts per hundred rubber). */
  fillerPhr?: number;
  fillerPricePerKg?: number;      // default carbon black ~£1.10/kg
  /** Process/plasticiser oil loading in phr. */
  oilPhr?: number;
  oilPricePerKg?: number;         // default ~£0.90/kg
  /** Cure system + activators + antidegradants loading in phr. */
  curativesPhr?: number;
  curativesPricePerKg?: number;   // default (S/accel/ZnO/6PPD blend) ~£3.50/kg
}

/**
 * Build a compound £/kg from a base-polymer price + filler/oil/curative loadings
 * (phr), instead of a single opaque compound price. Weighted by mass fraction:
 * mass basis = 100 (rubber) + Σphr.
 */
export function estimateCompoundCostPerKg(r: CompoundRecipeInputs): number {
  const filler = Math.max(0, r.fillerPhr ?? 0);
  const oil = Math.max(0, r.oilPhr ?? 0);
  const cur = Math.max(0, r.curativesPhr ?? 0);
  const totalPhr = 100 + filler + oil + cur;
  const cost =
    100 * r.basePolymerPricePerKg +
    filler * (r.fillerPricePerKg ?? 1.10) +
    oil * (r.oilPricePerKg ?? 0.90) +
    cur * (r.curativesPricePerKg ?? 3.50);
  return Math.round((cost / totalPhr) * 1000) / 1000;
}

// ─── Parametric mould-cost estimator (RB1) ────────────────────────────────────

export interface RubberMouldCostInputs {
  process: RubberProc;
  cavities: number;
  projectedAreaCm2?: number;      // per-cavity or total footprint — drives block size
  moldSteel?: RubberMouldSteel;
  complexity?: RubberComplexity;  // undercuts / inserts / complex parting line
  metalInserts?: number;          // insert-moulding nests add loading/positioning cost
}

export interface RubberMouldCostBreakdown {
  base: number;
  cavityBlock: number;
  inserts: number;
  total: number;
}

/** Steel factor: rubber tools are often aluminium/P20 (low pressure vs plastics). */
export function rubberMouldSteelFactor(s: RubberMouldSteel | undefined): number {
  return s === 'h13' ? 1.3 : s === 'aluminium' ? 0.7 : 1.0;
}

function rubberMouldBase(process: RubberProc): number {
  switch (process) {
    case 'injection_mould_lsr': return 12000;   // hardened, precision, cold-runner
    case 'transfer_mould':      return 6000;
    case 'die_cut':             return 2000;
    case 'extrusion_vulcanise': return 2500;     // extrusion die
    case 'calendering':         return 1200;
    case 'compression_mould':
    default:                    return 3000;
  }
}

/**
 * Estimate a rubber mould / die cost (£) from process, cavitation, part size,
 * steel and complexity — instead of a bare manual number.
 */
export function estimateRubberMouldCost(inputs: RubberMouldCostInputs): RubberMouldCostBreakdown {
  const cavities = Math.max(1, Math.floor(inputs.cavities || 1));
  const areaCm2 = Math.max(0, inputs.projectedAreaCm2 ?? 0);
  const steel = rubberMouldSteelFactor(inputs.moldSteel);
  const cplx = (inputs.complexity ?? 'moderate') === 'complex' ? 1.5
    : (inputs.complexity ?? 'moderate') === 'simple' ? 0.8 : 1.0;

  const base = rubberMouldBase(inputs.process) * steel;
  const perCavity = (900 + areaCm2 * 35) * steel * cplx;
  const cavityBlock = perCavity * Math.pow(cavities, 0.9);   // mild multi-cavity economy
  const inserts = Math.max(0, Math.floor(inputs.metalInserts ?? 0)) * 1200;

  const total = Math.round(base + cavityBlock + inserts);
  return { base: Math.round(base), cavityBlock: Math.round(cavityBlock), inserts, total };
}

// ─── DFM analyser (RB1) ───────────────────────────────────────────────────────

export interface RubberDFMInputs {
  compoundFamily?: RubberCompoundFamily;
  thicknessMm: number;
  minWallMm?: number;
  maxWallMm?: number;
  draftAngleDeg?: number;
  flashLineOnSealingFace?: boolean;
  undercutCount?: number;
  metalInsert?: boolean;
  toleranceMm?: number;
}

export interface RubberDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface RubberDFMResult {
  score: number;
  issues: RubberDFMIssue[];
  summary: string;
}

export function analyseRubberDFM(inputs: RubberDFMInputs): RubberDFMResult {
  const issues: RubberDFMIssue[] = [];
  const t = inputs.thicknessMm;

  // 1. Thin wall — incomplete fill / backrind.
  if (t > 0 && t < 1.0) {
    issues.push({
      severity: 'major', category: 'geometry',
      title: `Wall ${t} mm is very thin for moulded rubber`,
      description: 'Sub-1 mm sections are hard to fill before scorch and tear on demould; flash-to-part ratio rises.',
      recommendation: 'Increase wall to ≥ 1–1.5 mm, or move to LSR injection (fills thin sections) / die-cut sheet.',
    });
  }

  // 2. Thick section — long cure + undercure/porosity risk.
  if (t > 12) {
    issues.push({
      severity: 'major', category: 'process',
      title: `Thick section ${t} mm — long cure & undercure risk`,
      description: 'Cure time scales with thickness²; thick rubber undercures at the centre (reversion/porosity) and stretches cycle time.',
      recommendation: 'Core out heavy sections, use a peroxide/efficient cure system, step-cure, or add a post-cure.',
    });
  }

  // 3. Wall variation — non-uniform cure/shrink.
  if (inputs.minWallMm !== undefined && inputs.maxWallMm !== undefined && inputs.minWallMm > 0) {
    const ratio = inputs.maxWallMm / inputs.minWallMm;
    if (ratio > 3) {
      issues.push({
        severity: 'minor', category: 'geometry',
        title: `Wall varies ${ratio.toFixed(1)}× — uneven cure/shrink`,
        description: 'Thick and thin sections in one part cure at different rates — thin over-cures while thick under-cures.',
        recommendation: 'Even the wall out (≤2–3× variation); blend transitions; place the gate to balance fill.',
      });
    }
  }

  // 4. Draft — demould drag (rubber flexes, so lower severity).
  if (inputs.draftAngleDeg !== undefined && inputs.draftAngleDeg < 0.5) {
    issues.push({
      severity: 'minor', category: 'tooling',
      title: `Draft ${inputs.draftAngleDeg}° is minimal`,
      description: 'Low draft slows demould and risks tearing on deep or high-durometer parts.',
      recommendation: 'Add ≥ 0.5–1° draft on deep walls; harder compounds (>70 ShA) need more.',
    });
  }

  // 5. Flash line on a sealing/functional face.
  if (inputs.flashLineOnSealingFace) {
    issues.push({
      severity: 'major', category: 'tooling',
      title: 'Parting/flash line on a sealing face',
      description: 'Flash and parting-line mismatch on a dynamic/static sealing surface cause leaks and inspection rejects.',
      recommendation: 'Move the parting line off the seal bead; use a flashless/insert-trim tool or post-mould deflash on that face.',
    });
  }

  // 6. Undercuts — bump-off vs tooling.
  if (inputs.undercutCount !== undefined && inputs.undercutCount > 0) {
    issues.push({
      severity: inputs.undercutCount > 2 ? 'minor' : 'opportunity', category: 'tooling',
      title: `${inputs.undercutCount} undercut${inputs.undercutCount === 1 ? '' : 's'}`,
      description: 'Rubber can bump/strip off modest undercuts, but deep ones need split/collapsible tooling — more cost and cycle.',
      recommendation: 'Keep undercuts shallow enough to strip (elastic), or accept split-tool cost for deep features.',
    });
  }

  // 7. Insert moulding.
  if (inputs.metalInsert) {
    issues.push({
      severity: 'opportunity', category: 'assembly',
      title: 'Metal/fabric insert moulding',
      description: 'Inserts need pre-treatment (grit-blast + adhesive primer), accurate positioning and add load/unload time.',
      recommendation: 'Design robust insert location, spec the bonding system (Chemlok-type), and add primer + handling cost.',
    });
  }

  // 8. Tight tolerance vs rubber elasticity.
  if (inputs.toleranceMm !== undefined && inputs.toleranceMm > 0 && inputs.toleranceMm < 0.10) {
    issues.push({
      severity: inputs.toleranceMm < 0.05 ? 'major' : 'minor', category: 'tolerance',
      title: `Tolerance ±${inputs.toleranceMm} mm is tight for rubber`,
      description: 'Elastomers shrink on cure and creep/compression-set in service — sub-0.1 mm tolerances fight the material, not just the tool.',
      recommendation: 'Use RMA/ISO 3302 rubber tolerance classes; reserve tight tolerances for bonded metal features, not the rubber itself.',
    });
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No rubber DFM issues flagged; geometry and cure are within reference guidelines.'
    : `${issues.length} rubber DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { score, issues, summary };
}
