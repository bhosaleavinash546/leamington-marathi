import {
  TOOLROOM_RATES, composeTool, labourLine, materialLine, type ToolCostDetail, type ToolCostLine, type ToolMaterialId,
} from '../toolmaking.js';
import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

/**
 * Blow-moulding advisor — parametric mould-cost estimator + DFM analyser,
 * parity with the other commodity advisers. Covers EBM / IBM / SBM.
 */

export type BlowProcess = 'ebm' | 'ibm' | 'sbm';
export type BlowMouldMaterial = 'aluminium' | 'steel-p20' | 'steel-h13';

// ─── Parametric mould-cost estimator (BR4) ────────────────────────────────────

export interface BlowMouldCostInputs {
  process?: BlowProcess;
  cavities: number;
  /** Part swept volume in litres — drives cavity/tool size. */
  partVolumeL?: number;
  mouldMaterial?: BlowMouldMaterial;
  /** Extra cooling-channel / conformal cooling complexity. */
  highCooling?: boolean;
}

export interface BlowMouldCostBreakdown {
  /** toolmaker's-quotation view — hours × rate, metal by kg; sums to total. */
  detail: ToolCostDetail;
  base: number;
  cavityBlock: number;
  cooling: number;
  total: number;
}

/** Blow-mould material multiplier (Al is standard for EBM; steel for IBM/SBM & high cavitation). */
export function blowMouldMaterialFactor(m: BlowMouldMaterial | undefined): number {
  switch (m) {
    case 'steel-h13': return 1.8;   // hardened, high-cavity SBM/IBM
    case 'steel-p20': return 1.4;
    case 'aluminium':
    default:          return 1.0;   // cast/CNC aluminium — EBM workhorse
  }
}

/**
 * Estimate a blow-mould set cost (£) from process, cavitation and part size
 * instead of a bare manual number. EBM Al tools are cheap; IBM/SBM add a core
 * rod / preform mould and steel, so they cost more per cavity.
 */
export function estimateBlowMouldCost(inputs: BlowMouldCostInputs): BlowMouldCostBreakdown {
  const cavities = Math.max(1, Math.floor(inputs.cavities || 1));
  const volL = Math.max(0.02, inputs.partVolumeL ?? 1);
  const process = inputs.process ?? 'ebm';
  const mouldMaterial = inputs.mouldMaterial ?? (process === 'ebm' ? 'aluminium' : 'steel-p20');
  const nEcon = Math.pow(cavities, 0.9);
  const mat: ToolMaterialId = mouldMaterial === 'aluminium' ? 'al-7075'
    : mouldMaterial === 'steel-h13' ? 'h13' : 'p20';
  const hourF = mouldMaterial === 'aluminium' ? 1.0 : mouldMaterial === 'steel-h13' ? 1.6 : 1.4;

  // Machining grows near-linearly with the litres the cavity holds — the
  // cavity is a container's whole inner surface, not a projected shadow.
  const H = (30 + 9.5 * volL) * hourF;
  const steelKg = 14 * Math.pow(volL, 0.75) * (mouldMaterial === 'aluminium' ? 1.0 : 1.15);
  const coolFrac = inputs.highCooling ? 0.20 : 0.08;

  const lines: ToolCostLine[] = [
    labourLine('Mould design', 'design', 15 + 0.12 * H, TOOLROOM_RATES.design, 'split-line + pinch-off layout'),
    { item: 'Mould frame & clamp interface', kind: 'boughtOut',
      cost: Math.round((process === 'ebm' ? 2500 : 4500) + 80 * Math.pow(volL, 0.8)),
      basis: `${process.toUpperCase()} frame, scaled to capacity` },
    materialLine(`Cavity halves × ${cavities}`, steelKg * nEcon, mat, `14 × litres^0.75 kg per cavity set`),
    labourLine(`CNC cavity machining × ${cavities}`, 'machining', H * nEcon, TOOLROOM_RATES.cnc,
      `(30 + 9.5 × litres) h × ${mouldMaterial} ×${hourF}`),
    labourLine('Cooling-line drilling', 'machining', coolFrac * H * nEcon, TOOLROOM_RATES.cnc,
      inputs.highCooling ? 'high-cooling spec: 20% of cavity hours' : '8% of cavity hours'),
    labourLine('Bench fitting & venting', 'fitting', 0.2 * H * nEcon, TOOLROOM_RATES.fitting, '20% of cavity hours'),
    { item: 'Pinch-off / neck insert steel', kind: 'boughtOut',
      cost: Math.round((925 + 25 * volL) * cavities), basis: 'hardened inserts at the pinch lines, per cavity' },
    labourLine('Mould tryout', 'tryout', volL > 10 ? 32 : 12, TOOLROOM_RATES.tryoutPress, 'blow trials + wall-thickness check'),
  ];
  if (process === 'ibm' || process === 'sbm') {
    lines.push({ item: `${process.toUpperCase()} core-rod / preform tooling × ${cavities}`, kind: 'boughtOut',
      cost: (process === 'ibm' ? 2600 : 2000) * cavities, basis: 'per cavity, catalogue-typical' });
  }
  const detail = composeTool(lines);
  const raw = (pred: (l: ToolCostLine) => boolean) => lines.filter(pred).reduce((sum, l) => sum + l.cost, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.cost, 0);
  const scale = subtotal > 0 ? detail.total / subtotal : 1;
  const cooling = Math.round(raw(l => /Cooling/.test(l.item)) * scale);
  const cavityBlock = Math.round(raw(l => /Cavity|core-rod|Pinch/.test(l.item)) * scale);
  return { base: detail.total - cavityBlock - cooling, cavityBlock, cooling, total: detail.total, detail };
}

// ─── DFM analyser (BR4) ───────────────────────────────────────────────────────

export interface BlowDFMInputs {
  process?: BlowProcess;
  /** Nominal/average wall thickness, mm. */
  wallThicknessMm: number;
  /** Blow-up ratio = max body diameter / parison (die) diameter. */
  blowUpRatio?: number;
  /** Length-to-diameter ratio of the parison (sag risk on long EBM parts). */
  parisonLtoD?: number;
  /** Smallest external corner/edge radius, mm (corner thinning). */
  minCornerRadiusMm?: number;
  /** Handle or offset neck that creates a weld/pinch line (EBM). */
  handleOrWeldLine?: boolean;
  /** Tightest tolerance called up, mm. */
  toleranceMm?: number;
}

export interface BlowDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface BlowDFMResult {
  score: number;
  issues: BlowDFMIssue[];
  summary: string;
}

export function analyseBlowDFM(inputs: BlowDFMInputs): BlowDFMResult {
  const issues: BlowDFMIssue[] = [];
  const process = inputs.process ?? 'ebm';
  const t = inputs.wallThicknessMm;

  // 1. Blow-up ratio too high → thin, weak walls / blow-out.
  if (inputs.blowUpRatio !== undefined && inputs.blowUpRatio > 3.5) {
    issues.push({
      severity: inputs.blowUpRatio > 4.5 ? 'major' : 'minor', category: 'process',
      title: `Blow-up ratio ${inputs.blowUpRatio.toFixed(1)} exceeds ~3.5`,
      description: 'A high BUR over-stretches the parison — walls thin unevenly, corners run weak and blow-out risk rises.',
      recommendation: 'Keep BUR ≤ 3:1 (≤3.5 max); use a larger parison/die head or parison programming to redistribute wall.',
    });
  }

  // 2. Thin wall.
  if (t > 0 && t < 0.5) {
    issues.push({
      severity: 'major', category: 'geometry',
      title: `Wall ${t} mm is very thin for blow moulding`,
      description: 'Sub-0.5 mm blown walls tear, pinhole and fail top-load; wall control across the part is poor.',
      recommendation: 'Increase nominal wall to ≥ 0.6–0.8 mm, or add parison wall-thickness programming (axial) to thicken load-bearing zones.',
    });
  }

  // 3. Corner thinning.
  if (inputs.minCornerRadiusMm !== undefined && t > 0 && inputs.minCornerRadiusMm < 2 * t) {
    issues.push({
      severity: 'major', category: 'geometry',
      title: `Corner radius ${inputs.minCornerRadiusMm} mm below 2×wall (${(2 * t).toFixed(1)} mm)`,
      description: 'Sharp corners are where the parison stretches most — they thin to a fraction of nominal wall and crack.',
      recommendation: 'Radius external corners to ≥ 2–3×wall; sharp detail should be on the least-stretched face.',
    });
  }

  // 4. Parison sag on long EBM parts.
  if (process === 'ebm' && inputs.parisonLtoD !== undefined && inputs.parisonLtoD > 8) {
    issues.push({
      severity: 'minor', category: 'process',
      title: `Parison L/D ${inputs.parisonLtoD.toFixed(0)} — sag / weight drift`,
      description: 'Long parisons sag and thin under their own weight before clamp, drifting wall distribution shot-to-shot.',
      recommendation: 'Use an accumulator head, faster extrusion, or parison programming; consider splitting into shorter parts.',
    });
  }

  // 5. Weld/pinch line on a handled part.
  if (inputs.handleOrWeldLine) {
    issues.push({
      severity: 'minor', category: 'process',
      title: 'Handle / weld line in a load path',
      description: 'The pinch weld behind a handle or offset neck is the weakest line on an EBM part and a common failure origin.',
      recommendation: 'Thicken and radius the pinch-off, keep the weld out of the top-load path, and validate drop/burst on the weld.',
    });
  }

  // 6. Tight tolerance — process capability by type.
  if (inputs.toleranceMm !== undefined && inputs.toleranceMm > 0) {
    const cap = process === 'ibm' || process === 'sbm' ? 0.1 : 0.3;   // IBM/SBM tighter than EBM
    if (inputs.toleranceMm < cap) {
      issues.push({
        severity: 'minor', category: 'tolerance',
        title: `Tolerance ±${inputs.toleranceMm} mm tight for ${process.toUpperCase()} (~±${cap} mm)`,
        description: 'Blown walls are not dimensionally tight; only tool-formed features (neck/finish) hold close tolerance.',
        recommendation: process === 'ebm'
          ? 'Move critical dimensions to the calibrated neck, or switch to IBM/SBM for ±0.05–0.1 mm neck accuracy.'
          : 'Hold tight tolerances only on the injection-formed neck/preform, not the blown body.',
      });
    }
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No blow-moulding DFM issues flagged; geometry is within reference guidelines.'
    : `${issues.length} blow DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { score, issues, summary };
}
