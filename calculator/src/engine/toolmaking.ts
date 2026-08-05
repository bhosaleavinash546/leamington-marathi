/**
 * The toolmaking shop — one model of how tools are actually quoted.
 *
 * A dedicated tooling should-cost does not price a mould as `base + area × rate`.
 * It prices it the way a toolmaker's quotation reads: DESIGN hours, STEEL by the
 * kilogram, CNC and EDM hours on the cavity and core, POLISHING hours to the
 * finish grade, FITTING and spotting on the bench, BOUGHT-OUT components each
 * (hot-runner drops, core-pull cylinders, guide sets), TRYOUT on a press — and
 * the shop's overhead and profit as its own line. This module is that shop:
 * the rates, the materials, the bought-outs, and the line/breakdown types every
 * commodity's tooling estimator composes from.
 *
 * Calibration: rates are UK toolroom benchmarks (Jun 2026); the composed models
 * are anchored to the one real quotation in the evidence set — the £420k bumper
 * fascia mould — and to the kernel's independent B-rep parametric (£412k on the
 * same tool). Constants here change only with a source and a code review.
 */

export type ToolLineKind =
  | 'design' | 'material' | 'machining' | 'edm' | 'polish' | 'fitting'
  | 'boughtOut' | 'heatTreat' | 'tryout' | 'overheadProfit';

export interface ToolCostLine {
  item: string;
  kind: ToolLineKind;
  /** labour lines carry hours × rate; material lines kg × £/kg; bought-outs qty × each. */
  hours?: number;
  ratePerHr?: number;
  kg?: number;
  qty?: number;
  cost: number;
  basis: string;
}

export interface ToolCostDetail {
  lines: ToolCostLine[];
  /** total toolroom labour hours across all labour lines. */
  labourHours: number;
  total: number;
}

/** UK toolroom fully-loaded rates, £/hr (Jun 2026 benchmarks). */
export const TOOLROOM_RATES = {
  design: 58,
  cnc: 52,
  edm: 58,
  fitting: 48,
  polish: 45,
  tryoutPress: 85,
} as const;

/** Tool materials, £/kg delivered (Jun 2026). */
export const TOOL_MATERIAL_GBP_PER_KG = {
  'p20': 6.8,
  'p20-hard': 8.2,      // pre-hard/H13-class production steel
  'h13': 9.5,
  'hammer-1.2714': 5.8,
  'premium-pm': 14.0,
  'al-7075': 7.5,
  'cast-iron': 2.8,
  'plate-steel': 1.9,
} as const;
export type ToolMaterialId = keyof typeof TOOL_MATERIAL_GBP_PER_KG;

/** Bought-out components, £ each (catalogue-typical, Jun 2026). */
export const BOUGHT_OUT_GBP = {
  hotRunnerPerDrop: 3800,
  hotRunnerController: 5500,
  corePullCylinder: 1450,
  guideAndEjectionSetSmall: 650,
  guideAndEjectionSetLarge: 2400,
  texturingPerTool: 3500,
} as const;

/** Toolmaker overhead + profit applied once on the built-up subtotal. */
export const SHOP_OVERHEAD_PROFIT = 0.22;

const r0 = (v: number) => Math.round(v);

export function labourLine(item: string, kind: ToolLineKind & ('design' | 'machining' | 'edm' | 'polish' | 'fitting' | 'tryout'), hours: number, ratePerHr: number, basis: string): ToolCostLine {
  return { item, kind, hours: Math.round(hours * 10) / 10, ratePerHr, cost: r0(hours * ratePerHr), basis };
}

export function materialLine(item: string, kg: number, material: ToolMaterialId, basis: string): ToolCostLine {
  const rate = TOOL_MATERIAL_GBP_PER_KG[material];
  return { item, kind: 'material', kg: r0(kg), cost: r0(kg * rate), basis: `${basis} — ${r0(kg)} kg × £${rate}/kg (${material})` };
}

export function boughtOutLine(item: string, qty: number, each: number, basis: string): ToolCostLine {
  return { item, kind: 'boughtOut', qty, cost: r0(qty * each), basis };
}

/** Compose a detail: lines + the shop's overhead/profit line + total. */
export function composeTool(lines: ToolCostLine[]): ToolCostDetail {
  const subtotal = lines.reduce((s, l) => s + l.cost, 0);
  const ohp: ToolCostLine = {
    item: 'Toolmaker overhead + profit', kind: 'overheadProfit',
    cost: r0(subtotal * SHOP_OVERHEAD_PROFIT),
    basis: `${(SHOP_OVERHEAD_PROFIT * 100).toFixed(0)}% on the built-up £${r0(subtotal).toLocaleString()}`,
  };
  const all = [...lines, ohp];
  return {
    lines: all,
    labourHours: Math.round(all.reduce((s, l) => s + (l.hours ?? 0), 0)),
    total: r0(subtotal + ohp.cost),
  };
}

/**
 * Mould/die base (bolster, plates, guides, ejection) from the tool's footprint.
 * Catalogue-shaped: a 92 cm² 2-cavity tool's base prices ≈£2k; a 9,000 cm²
 * fascia bolster ≈£23k of plate, machining and guide work.
 */
export function toolBaseCost(totalProjectedAreaCm2: number): ToolCostLine {
  const a = Math.max(10, totalProjectedAreaCm2);
  const cost = 1200 + 9.5 * Math.pow(a, 0.85);
  return {
    item: 'Mould/die base, guides & ejection', kind: 'boughtOut', cost: r0(cost),
    basis: `£1,200 + 9.5 × ${r0(a).toLocaleString()} cm²^0.85 — plates, guide pillars, ejection housing`,
  };
}

/**
 * Cavity/core CNC hours for ONE cavity set — the workhorse driver every
 * commodity scales from. `12 + 3.4 × area^0.72`, depth-corrected: a deep draw
 * carries more wall to cut than its shadow shows.
 */
export function cavityCncHours(areaPerCavityCm2: number, depthCm?: number): number {
  const a = Math.max(4, areaPerCavityCm2);
  const d = depthCm ?? Math.min(45, Math.max(3, 0.4 * Math.sqrt(a)));
  const depthFactor = 1 + Math.max(0, d - 0.4 * Math.sqrt(a)) / 60;
  return (12 + 3.4 * Math.pow(a, 0.72)) * depthFactor;
}

/** Cavity/core steel mass, kg, for ONE cavity set (block, both halves). */
export function cavitySteelKg(areaPerCavityCm2: number, depthCm?: number): number {
  const a = Math.max(4, areaPerCavityCm2);
  const d = depthCm ?? Math.min(45, Math.max(3, 0.4 * Math.sqrt(a)));
  return a * (d + 10) * 2 * 1.25 * 7.85e-3;
}

export type ToolComplexity = 'simple' | 'moderate' | 'complex';
/** EDM as a fraction of CNC hours — ribs, deep slots, sharp internal corners. */
export const EDM_FRACTION: Record<ToolComplexity, number> = { simple: 0.05, moderate: 0.125, complex: 0.30 };
/** Bench fitting/spotting as a fraction of CNC hours. */
export const FITTING_FRACTION = 0.25;
/** Polishing fractions of CNC hours by finish grade. */
export const POLISH_FRACTION: Record<'standard' | 'textured' | 'high_gloss', number> = {
  standard: 0.10, textured: 0.08, high_gloss: 0.30,
};
