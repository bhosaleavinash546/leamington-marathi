/**
 * Casting tooling, priced as a toolmaker quotes it (tooling deep-dive M8).
 *
 * The geometry kernel already prices HPDC dies, gravity moulds and sand
 * patterns parametrically from the B-rep, and those figures stay the primary
 * source on the CAD path. What was missing:
 *
 * 1. **A fallback when the kernel is absent** (STL fast path, manual form,
 *    degraded geometry) — those paths had to ask the engineer even for a
 *    routine die.
 * 2. **Investment-casting tooling had no model at all** — the honest gap the
 *    tooling slides state out loud. A wax-injection tool is a real thing with
 *    a real structure: an aluminium/P20 mould at low pressure plus soluble-core
 *    tooling — so it composes from the same shop as everything else.
 *
 * All estimators compose `toolmaking.ts` lines (hours × toolroom rate, steel by
 * the kilogram, bought-outs each, 22% shop overhead) and return the same
 * `detail` a dedicated tooling tool would print.
 */
import {
  TOOLROOM_RATES, EDM_FRACTION, FITTING_FRACTION,
  cavityCncHours, cavitySteelKg, toolBaseCost, composeTool, labourLine, materialLine,
  boughtOutLine, type ToolComplexity, type ToolCostDetail, type ToolCostLine,
} from './toolmaking.js';
import { estimateMouldCost } from './modules/injection-moulding.js';

export interface CastingToolInputs {
  /** projected area of ONE cavity at the parting plane, cm². */
  projectedAreaCm2: number;
  cavities?: number;
  complexity?: ToolComplexity;
}

export interface CastingToolEstimate {
  total: number;
  detail: ToolCostDetail;
}

const clampTotal = (detail: ToolCostDetail, lo: number, hi: number): CastingToolEstimate => ({
  total: Math.min(hi, Math.max(lo, detail.total)),
  detail,
});

/**
 * High-pressure die-casting die. Structurally an injection mould's harder
 * sibling: always H13-class steel, hard-machining premium, a shot-sleeve/
 * biscuit block, intensive cooling drilling, and stress-relief heat treatment
 * against heat checking. Floors/caps mirror the kernel parametric's bounds so
 * the two estimators disagree by evidence, not by domain.
 */
export function estimateHPDCDieCost(p: CastingToolInputs): CastingToolEstimate {
  const n = Math.max(1, Math.floor(p.cavities ?? 1));
  const area = Math.max(10, p.projectedAreaCm2);
  const complexity = p.complexity ?? 'moderate';
  const H = cavityCncHours(area) * 1.25;              // hard H13 + thermal management details
  const nEcon = Math.pow(n, 0.9);
  const lines: ToolCostLine[] = [
    labourLine('Die design & CAM', 'design', 35 + 0.2 * H, TOOLROOM_RATES.design, '35 h + 20% of the cavity programme'),
    toolBaseCost(area * n),
    materialLine(`Cavity + core H13 × ${n}`, cavitySteelKg(area) * 1.15 * nEcon, 'h13',
      'die blocks run thicker than mould plates against heat checking'),
    labourLine(`CNC die sinking × ${n}`, 'machining', H * nEcon, TOOLROOM_RATES.cnc, 'hard-machining premium ×1.25 on the mould-cavity law'),
    labourLine('EDM (ribs, fins, overflows)', 'edm', EDM_FRACTION[complexity] * H * nEcon, TOOLROOM_RATES.edm,
      `${complexity} die detail`),
    labourLine('Cooling-line drilling', 'machining', 0.10 * H * nEcon, TOOLROOM_RATES.cnc, 'intensive conformal-ish cooling, 10% of cavity hours'),
    labourLine('Bench fitting & spotting', 'fitting', FITTING_FRACTION * H * nEcon, TOOLROOM_RATES.fitting, '25% of cavity hours'),
    boughtOutLine('Shot sleeve + biscuit block', 1, 4500, 'wear set, catalogue'),
    { item: 'Stress-relief + nitride heat treat', kind: 'heatTreat', cost: Math.round(2500 + area * 4), basis: '£2,500 + £4/cm² against heat checking' },
    labourLine('Die tryout — 4 shots sessions', 'tryout', 32, TOOLROOM_RATES.tryoutPress, 'press time + first-offs'),
  ];
  return clampTotal(composeTool(lines), 35_000, 320_000);
}

/** Gravity/permanent mould: iron or steel mould, far simpler than HPDC. */
export function estimateGravityMouldCost(p: CastingToolInputs): CastingToolEstimate {
  const n = Math.max(1, Math.floor(p.cavities ?? 1));
  const area = Math.max(10, p.projectedAreaCm2);
  const H = cavityCncHours(area) * 0.55;
  const nEcon = Math.pow(n, 0.9);
  const lines: ToolCostLine[] = [
    labourLine('Mould design', 'design', 20 + 0.15 * H, TOOLROOM_RATES.design, 'gravity die, simple parting'),
    materialLine(`Cast-iron mould blocks × ${n}`, cavitySteelKg(area) * 1.3 * nEcon, 'cast-iron', 'thick-walled iron halves'),
    labourLine(`CNC cavity machining × ${n}`, 'machining', H * nEcon, TOOLROOM_RATES.cnc, '0.55× the mould-cavity law — no pressure, coarse finish'),
    labourLine('Fitting + coat prep', 'fitting', 0.2 * H * nEcon, TOOLROOM_RATES.fitting, 'bench + refractory coating preparation'),
    labourLine('Tryout pours', 'tryout', 16, TOOLROOM_RATES.tryoutPress, 'two pour sessions'),
  ];
  return clampTotal(composeTool(lines), 8_000, 90_000);
}

/** Sand pattern: pattern plate + coreboxes — aluminium, one-sided machining. */
export function estimateSandPatternCost(p: CastingToolInputs & { coreCount?: number }): CastingToolEstimate {
  const area = Math.max(10, p.projectedAreaCm2);
  const cores = Math.max(0, Math.floor(p.coreCount ?? 1));
  const H = cavityCncHours(area) * 0.30;
  const lines: ToolCostLine[] = [
    labourLine('Pattern design', 'design', 12 + 0.1 * H, TOOLROOM_RATES.design, 'match-plate layout + shrink allowance'),
    materialLine('Pattern plate aluminium', cavitySteelKg(area) * 0.35, 'al-7075', 'one-sided plate, half the block'),
    labourLine('Pattern machining', 'machining', H, TOOLROOM_RATES.cnc, '0.30× the cavity law — open one-sided cutting'),
    ...(cores > 0 ? [labourLine(`Corebox machining × ${cores}`, 'machining', cores * (10 + 0.08 * H), TOOLROOM_RATES.cnc, 'per corebox')] : []),
    labourLine('Fit + tryout moulds', 'tryout', 8, TOOLROOM_RATES.tryoutPress, 'sample moulds + gauge check'),
  ];
  return clampTotal(composeTool(lines), 1_500, 50_000);
}

/**
 * Investment-casting tooling — the gap, closed. A wax-injection tool is an
 * aluminium/P20 mould run at low pressure: the mould shop-model applies with a
 * 0.8 factor (soft alloy, low clamp, no ejection refinement), plus soluble-core
 * boxes. An engineer's toolmaker quotation still overrides this everywhere.
 */
export function estimateInvestmentToolCost(p: CastingToolInputs & { coreCount?: number }): CastingToolEstimate {
  const n = Math.max(1, Math.floor(p.cavities ?? 1));
  const area = Math.max(4, p.projectedAreaCm2);
  const cores = Math.max(0, Math.floor(p.coreCount ?? 0));
  const wax = estimateMouldCost({
    cavities: n, projectedAreaCm2: area * n, steelClass: 'standard',
    sideActionsLifters: 0, runnerSystem: 'cold', complexity: p.complexity ?? 'moderate',
  });
  const lines: ToolCostLine[] = [
    { item: 'Wax-injection tool (mould shop model × 0.8)', kind: 'machining',
      cost: Math.round(wax.total * 0.8),
      basis: `low-pressure aluminium/P20 wax tool — mould model £${wax.total.toLocaleString()} × 0.8` },
    ...(cores > 0
      ? [boughtOutLine(`Soluble-core boxes × ${cores}`, cores, 1200, 'per core box, catalogue-typical')]
      : []),
  ];
  // wax.total already carries the shop overhead — compose without doubling it.
  const subtotal = lines.reduce((s, l) => s + l.cost, 0);
  const detail: ToolCostDetail = { lines, labourHours: wax.detail.labourHours, total: subtotal };
  return clampTotal(detail, 4_000, 120_000);
}
