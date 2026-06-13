/**
 * Rule-based cost intelligence engine.
 * Inspired by aPriori / Siemens cost-engineering benchmarks.
 * All logic is deterministic and testable — no AI API required.
 */
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType } from './types.js';

export type InsightType = 'critical' | 'warning' | 'opportunity' | 'benchmark' | 'info';
export type InsightCategory = 'material' | 'process' | 'labour' | 'tooling' | 'commercial' | 'regional' | 'design';

export interface BenchmarkRange {
  label: string;
  yourValue: number;
  unit: string;
  industryLow: number;
  industryHigh: number;
  status: 'good' | 'watch' | 'concern';
}

export interface CostInsight {
  type: InsightType;
  category: InsightCategory;
  title: string;
  finding: string;
  impact: 'High' | 'Medium' | 'Low';
  potentialSavingPct: number;
  actions: string[];
  benchmark?: BenchmarkRange;
}

// ─── Industry Benchmarks (aPriori-calibrated) ────────────────────────────────

interface CommodityBenchmarks {
  materialPct: [number, number];
  processPct: [number, number];
  labourPct: [number, number];
  toolingPct: [number, number];
  overheadPct: [number, number];
  marginPct: [number, number];
  typicalMatUtil: number;
  oeeBenchmark: number;
}

const COMMODITY_BENCHMARKS: Record<string, CommodityBenchmarks> = {
  machining: {
    materialPct: [30, 55], processPct: [18, 35], labourPct: [8, 20],
    toolingPct: [1, 8], overheadPct: [8, 15], marginPct: [5, 12],
    typicalMatUtil: 0.72, oeeBenchmark: 0.85,
  },
  cast_and_machine: {
    materialPct: [35, 60], processPct: [8, 18], labourPct: [4, 12],
    toolingPct: [4, 15], overheadPct: [8, 14], marginPct: [5, 10],
    typicalMatUtil: 0.82, oeeBenchmark: 0.82,
  },
  casting: {
    materialPct: [40, 65], processPct: [8, 16], labourPct: [3, 10],
    toolingPct: [5, 18], overheadPct: [8, 14], marginPct: [5, 10],
    typicalMatUtil: 0.80, oeeBenchmark: 0.80,
  },
  forging: {
    materialPct: [38, 62], processPct: [10, 20], labourPct: [5, 14],
    toolingPct: [4, 14], overheadPct: [8, 14], marginPct: [6, 11],
    typicalMatUtil: 0.75, oeeBenchmark: 0.80,
  },
  sheet_metal: {
    materialPct: [30, 52], processPct: [18, 35], labourPct: [10, 22],
    toolingPct: [2, 10], overheadPct: [8, 14], marginPct: [5, 12],
    typicalMatUtil: 0.70, oeeBenchmark: 0.85,
  },
  injection_moulding: {
    materialPct: [25, 48], processPct: [15, 30], labourPct: [4, 12],
    toolingPct: [5, 25], overheadPct: [8, 15], marginPct: [5, 12],
    typicalMatUtil: 0.92, oeeBenchmark: 0.88,
  },
  painting: {
    materialPct: [20, 40], processPct: [20, 40], labourPct: [10, 25],
    toolingPct: [0, 5], overheadPct: [10, 18], marginPct: [6, 14],
    typicalMatUtil: 0.65, oeeBenchmark: 0.80,
  },
  biw_assembly: {
    materialPct: [40, 65], processPct: [10, 22], labourPct: [8, 20],
    toolingPct: [3, 12], overheadPct: [8, 16], marginPct: [5, 12],
    typicalMatUtil: 0.85, oeeBenchmark: 0.82,
  },
  pcb_fab: {
    materialPct: [20, 40], processPct: [25, 45], labourPct: [5, 15],
    toolingPct: [2, 8], overheadPct: [10, 18], marginPct: [6, 14],
    typicalMatUtil: 0.90, oeeBenchmark: 0.88,
  },
  pcba: {
    materialPct: [45, 70], processPct: [10, 22], labourPct: [5, 15],
    toolingPct: [1, 6], overheadPct: [8, 16], marginPct: [5, 12],
    typicalMatUtil: 0.95, oeeBenchmark: 0.90,
  },
  rubber: {
    materialPct: [30, 55], processPct: [15, 30], labourPct: [6, 18],
    toolingPct: [2, 12], overheadPct: [8, 16], marginPct: [5, 12],
    typicalMatUtil: 0.83, oeeBenchmark: 0.80,
  },
};

const DEFAULT_BENCHMARK = COMMODITY_BENCHMARKS['machining'];

// ─── Regional cost indices relative to UK base (100) ─────────────────────────

export const REGIONAL_COST_INDEX: Record<string, { label: string; index: number; currency: string; labourFactor: number }> = {
  UK:      { label: 'UK',            index: 100, currency: 'GBP', labourFactor: 1.00 },
  Germany: { label: 'Germany',       index: 108, currency: 'EUR', labourFactor: 1.15 },
  USA:     { label: 'USA (Midwest)', index: 102, currency: 'USD', labourFactor: 1.05 },
  China:   { label: 'China (tier 1)',index:  38, currency: 'CNY', labourFactor: 0.18 },
  India:   { label: 'India',         index:  28, currency: 'INR', labourFactor: 0.12 },
  Mexico:  { label: 'Mexico',        index:  45, currency: 'MXN', labourFactor: 0.22 },
  Poland:  { label: 'Poland (EU)',   index:  58, currency: 'EUR', labourFactor: 0.45 },
  Czechia: { label: 'Czech Republic',index:  55, currency: 'EUR', labourFactor: 0.42 },
};

// ─── FX rates to GBP ─────────────────────────────────────────────────────────

export const FX_TO_GBP: Record<string, number> = {
  GBP: 1.00, EUR: 1.18, USD: 1.28, CNY: 0.109, INR: 0.0094, MXN: 0.043,
  THB: 0.0227, VND: 0.0000308, BRL: 0.154, KRW: 0.000581,
};

// ─── Insight generation ───────────────────────────────────────────────────────

export function generateInsights(
  result: PartCostResult,
  input: UniversalStackInput,
  _library: RateLibrary,
  commodity: CommodityType = 'machining'
): CostInsight[] {
  const insights: CostInsight[] = [];
  const bm = COMMODITY_BENCHMARKS[commodity] ?? DEFAULT_BENCHMARK;
  const total = result.total > 0 ? result.total : 1;

  const pcts = {
    mat: (result.breakdown.rawMaterial / total) * 100,
    proc: (result.breakdown.process / total) * 100,
    lab: (result.breakdown.labour / total) * 100,
    tool: (result.breakdown.tooling / total) * 100,
    pkg: ((result.breakdown.packaging + result.breakdown.logistics) / total) * 100,
    oh: (result.breakdown.overhead / total) * 100,
    margin: (result.breakdown.margin / total) * 100,
  };

  // ── Material dominance ────────────────────────────────────────────────────
  if (pcts.mat > bm.materialPct[1]) {
    const excess = pcts.mat - bm.materialPct[1];
    insights.push({
      type: 'critical',
      category: 'material',
      title: 'Material is the dominant cost driver',
      finding: `Raw material at ${pcts.mat.toFixed(1)}% of total exceeds the ${commodity.replace(/_/g, ' ')} benchmark ceiling of ${bm.materialPct[1]}%. Material is controlling this part's economics.`,
      impact: 'High',
      potentialSavingPct: Math.min(excess * 0.4, 12),
      actions: [
        'Evaluate near-net-shape alternatives (HPDC → lost foam; forging → closed-die) to improve buy-to-fly ratio',
        `Material utilisation at ${(input.rawMaterial.materialUtilization * 100).toFixed(0)}% — every +5% saves ~£${(result.breakdown.rawMaterial * 0.05).toFixed(2)}/part`,
        'Explore secondary/recycled alloy grades that meet functional spec (e.g. Al secondary ingot for non-structural castings)',
        'Negotiate LTA (long-term agreement) with metal distributor for price ceiling protection',
        `Regional sourcing study: low-cost regions (India, China) can reduce material landed cost by 20-40%`,
      ],
      benchmark: {
        label: 'Material %',
        yourValue: pcts.mat,
        unit: '%',
        industryLow: bm.materialPct[0],
        industryHigh: bm.materialPct[1],
        status: 'concern',
      },
    });
  } else if (pcts.mat < bm.materialPct[0]) {
    insights.push({
      type: 'info',
      category: 'material',
      title: 'Material cost is below benchmark range',
      finding: `Material at ${pcts.mat.toFixed(1)}% is below the typical ${bm.materialPct[0]}–${bm.materialPct[1]}% range. Conversion cost is the dominant driver.`,
      impact: 'Low',
      potentialSavingPct: 0,
      actions: ['Focus optimisation efforts on process and labour efficiency'],
      benchmark: {
        label: 'Material %', yourValue: pcts.mat, unit: '%',
        industryLow: bm.materialPct[0], industryHigh: bm.materialPct[1], status: 'good',
      },
    });
  }

  // ── Material utilisation ──────────────────────────────────────────────────
  if (input.rawMaterial.directCost === undefined && input.rawMaterial.materialUtilization < 0.70) {
    const util = input.rawMaterial.materialUtilization * 100;

    insights.push({
      type: 'warning',
      category: 'material',
      title: 'Low material utilisation — high scrap rate',
      finding: `Material utilisation at ${util.toFixed(0)}% is below the ${commodity.replace(/_/g,'  ')} benchmark of ${(bm.typicalMatUtil * 100).toFixed(0)}%. You are paying for ${((1 - input.rawMaterial.materialUtilization) / input.rawMaterial.materialUtilization * 100).toFixed(0)}% more raw material than ends up in the part.`,
      impact: 'Medium',
      potentialSavingPct: Math.min(8, (bm.typicalMatUtil - input.rawMaterial.materialUtilization) * 20),
      actions: [
        'Redesign blank/preform geometry to minimise offcuts',
        'Optimise nesting/layout for sheet or profile stock',
        'Consider near-net-shape processes (forging, casting) to start closer to final form',
        'Negotiate scrap buy-back at higher than standard recovery price',
      ],
    });
  }

  // ── Process cost vs benchmark ─────────────────────────────────────────────
  if (pcts.proc > bm.processPct[1]) {

    insights.push({
      type: 'warning',
      category: 'process',
      title: 'Machining / process cost above benchmark',
      finding: `Process cost at ${pcts.proc.toFixed(1)}% of total is above the benchmark range of ${bm.processPct[0]}–${bm.processPct[1]}%. Cycle time or machine rate is elevated.`,
      impact: 'High',
      potentialSavingPct: Math.min(15, (pcts.proc - bm.processPct[1]) * 0.5),
      actions: [
        'Reduce cycle time via feeds/speeds optimisation and toolpath strategy review',
        'Combine multiple operations into one setup to eliminate re-fixture time',
        'Evaluate lower-rate machine types for non-critical features (VMC vs HMC)',
        `Increase batch size — amortise setup cost over more parts`,
        'Offshore high-volume machining to lower-cost region (China/India rates 3–5× lower)',
      ],
      benchmark: {
        label: 'Process %', yourValue: pcts.proc, unit: '%',
        industryLow: bm.processPct[0], industryHigh: bm.processPct[1], status: 'concern',
      },
    });
  }

  // ── OEE below benchmark ───────────────────────────────────────────────────
  const lowOEEOps = result.operationDetails.filter(op => op.oee < bm.oeeBenchmark - 0.05);
  if (lowOEEOps.length > 0) {
    const worstOp = lowOEEOps.sort((a, b) => a.oee - b.oee)[0];

    insights.push({
      type: 'warning',
      category: 'process',
      title: `Low OEE on "${worstOp.operationName}"`,
      finding: `OEE of ${(worstOp.oee * 100).toFixed(0)}% is below the ${(bm.oeeBenchmark * 100).toFixed(0)}% benchmark. Every 5% OEE improvement on this operation saves ~£${(result.breakdown.process * 0.05).toFixed(3)}/part.`,
      impact: 'Medium',
      potentialSavingPct: Math.min(8, (bm.oeeBenchmark - worstOp.oee) * 15),
      actions: [
        'Implement SMED (Single-Minute Exchange of Die) to reduce changeover losses',
        'Schedule preventive maintenance to reduce unplanned downtime',
        'Address quality rejects at source — rework contributes to low OEE quality rate',
        'Consider dedicated fixture/tombstone for multi-part setup to boost availability',
      ],
    });
  }

  // ── Tooling dominance ─────────────────────────────────────────────────────
  if (pcts.tool > bm.toolingPct[1]) {
    const toolCostPerPart = result.breakdown.tooling;
    const volumeToHalve = input.tooling.amortizationVolume * 2;
    insights.push({
      type: 'warning',
      category: 'tooling',
      title: 'Tooling amortisation is a significant cost driver',
      finding: `Tooling at ${pcts.tool.toFixed(1)}% (£${toolCostPerPart.toFixed(2)}/part) exceeds the benchmark of ${bm.toolingPct[1]}%. This is volume-sensitive.`,
      impact: 'High',
      potentialSavingPct: Math.min(10, (pcts.tool - bm.toolingPct[1]) * 0.4),
      actions: [
        `Doubling volume to ${volumeToHalve.toLocaleString()} parts halves tooling cost to £${(toolCostPerPart / 2).toFixed(2)}/part`,
        'Evaluate family tooling (multiple parts per die) to spread NRE across higher volumes',
        'Negotiate supplier tooling ownership with amortisation in piece price',
        'Consider soft tooling (aluminium die) for prototyping at 70-80% lower tooling cost',
        'Review tooling design for longevity — poor draft/radii accelerate wear and increase replacement frequency',
      ],
    });
  }

  // ── Overhead above benchmark ──────────────────────────────────────────────
  if (input.overheadPct * 100 > bm.overheadPct[1] + 3) {
    insights.push({
      type: 'opportunity',
      category: 'commercial',
      title: 'Overhead rate above industry benchmark',
      finding: `Overhead at ${(input.overheadPct * 100).toFixed(0)}% vs benchmark range ${bm.overheadPct[0]}–${bm.overheadPct[1]}%. This may reflect inflated factory burden rates.`,
      impact: 'Medium',
      potentialSavingPct: Math.min(6, (input.overheadPct * 100 - bm.overheadPct[1]) * 0.5),
      actions: [
        'Request itemised overhead breakdown from supplier — challenge unproductive burden',
        'Compare with tier-1 vs tier-2 supplier overhead structures',
        'Explore make-vs-buy with a leaner supplier network',
      ],
    });
  }

  // ── Margin above benchmark ────────────────────────────────────────────────
  if (input.marginPct * 100 > bm.marginPct[1] + 2) {
    insights.push({
      type: 'opportunity',
      category: 'commercial',
      title: 'Supplier margin is above competitive benchmark',
      finding: `Supplier margin at ${(input.marginPct * 100).toFixed(0)}% vs benchmark ${bm.marginPct[0]}–${bm.marginPct[1]}%. This is an open negotiation lever.`,
      impact: 'Medium',
      potentialSavingPct: Math.min(5, (input.marginPct * 100 - bm.marginPct[1])),
      actions: [
        'Open book costing negotiation — use this model as the baseline',
        'Offer longer-term volume commitment in exchange for reduced margin',
        'Run 3-way competitive RFQ to establish market pricing',
      ],
    });
  }

  // ── Regional arbitrage opportunity ───────────────────────────────────────
  const labourIntensity = pcts.lab + pcts.proc; // Combined conversion cost
  if (labourIntensity > 25) {
    const chinaIdx = REGIONAL_COST_INDEX['China'];
    const indiaIdx = REGIONAL_COST_INDEX['India'];
    const ukIdx = REGIONAL_COST_INDEX['UK'];
    const potentialSavingChina = (1 - chinaIdx.index / ukIdx.index) * (labourIntensity / 100) * 100;
    insights.push({
      type: 'opportunity',
      category: 'regional',
      title: 'Regional sourcing opportunity — high conversion cost',
      finding: `Conversion (process + labour) represents ${labourIntensity.toFixed(0)}% of total cost. Low-cost manufacturing regions offer significant savings on this component.`,
      impact: 'High',
      potentialSavingPct: Math.min(20, potentialSavingChina * 0.7),
      actions: [
        `China (tier-1): ~${Math.round((1 - chinaIdx.index / ukIdx.index) * 100)}% lower labour rates — estimated total part saving ${Math.round(potentialSavingChina * 0.6)}%`,
        `India: ~${Math.round((1 - indiaIdx.index / ukIdx.index) * 100)}% lower labour rates — strong for machined aluminium components`,
        'Poland/Czech Republic: ~40-45% labour cost reduction with EU supply chain proximity',
        'Mexico: nearshore to North America with 50-55% labour cost advantage',
        'Offset: logistics, quality risk, IP protection, lead time, and working capital',
        'Recommend pilot batch from 2 alternative regions before full transition',
      ],
    });
  }

  // ── High packaging/logistics ──────────────────────────────────────────────
  if (pcts.pkg > 5) {
    insights.push({
      type: 'opportunity',
      category: 'commercial',
      title: 'Packaging & logistics cost is above average',
      finding: `Packaging + logistics at ${pcts.pkg.toFixed(1)}% of total cost. For high-volume parts this should be under 2%.`,
      impact: 'Low',
      potentialSavingPct: Math.min(3, (pcts.pkg - 2) * 0.3),
      actions: [
        'Evaluate returnable/reusable packaging (racks, dunnage trays) vs expendable packaging',
        'Consolidate shipment frequency — larger drops reduce per-unit logistics cost',
        'Co-locate production closer to assembly plant to reduce logistics spend',
      ],
    });
  }

  // ── Casting-specific: Low casting yield (runner/gating waste) ─────────────
  if ((commodity === 'casting' || commodity === 'cast_and_machine') &&
      input.rawMaterial.directCost === undefined &&
      input.rawMaterial.materialUtilization < 0.68) {
    const util = input.rawMaterial.materialUtilization * 100;
    const benchmarkUtil = commodity === 'casting' ? 75 : 78;
    insights.push({
      type: 'warning',
      category: 'material',
      title: 'Low casting yield — excess runner/gating material',
      finding: `Casting yield of ${util.toFixed(0)}% means ${((1/input.rawMaterial.materialUtilization - 1)*100).toFixed(0)}% of poured metal is returned as runner/gate scrap. HPDC benchmark is 65–75%; sand/gravity 75–85%. Scrap recovery credits are partial — you are paying for metal that doesn't end up in the part.`,
      impact: 'Medium',
      potentialSavingPct: Math.min(6, (benchmarkUtil/100 - input.rawMaterial.materialUtilization) * 15),
      actions: [
        'Work with die designer to optimise runner/gate geometry and reduce pour weight',
        'Consider vacuum-assisted HPDC (vacural) to allow thinner gates and reduce gating volume',
        'Evaluate multi-cavity tooling — more parts per shot reduces gate-to-part ratio',
        'Review scrap alloy buy-back rate — negotiate higher recovery price for clean alloy returns',
        `Improving yield to ${benchmarkUtil}% saves ~£${(result.breakdown.rawMaterial * (benchmarkUtil/100 - input.rawMaterial.materialUtilization) / input.rawMaterial.materialUtilization).toFixed(2)}/part`,
      ],
      benchmark: {
        label: 'Casting Yield',
        yourValue: util,
        unit: '%',
        industryLow: 65,
        industryHigh: 85,
        status: 'watch',
      },
    });
  }

  // ── Casting-specific: Missing post-casting operations ─────────────────────
  if ((commodity === 'casting' || commodity === 'cast_and_machine') &&
      input.operations.length <= 2) {
    insights.push({
      type: 'info',
      category: 'process',
      title: 'Post-casting operations may be missing from cost model',
      finding: `Only ${input.operations.length} operation(s) detected for a casting process. Structural aluminium castings (especially HPDC) typically require: T5/T6 heat treatment (£1.20–2.80/kg), shot blasting (£0.15–0.40/part), impregnation for pressure-critical parts (£0.80–1.80/part), and deburring/fettling (£0.10–0.60/part). These are often omitted from initial estimates and can add 8–18% to part cost.`,
      impact: 'High',
      potentialSavingPct: 0,
      actions: [
        'Add heat treatment (T5 ageing or T6 solution + ageing) to Cast+Machine module if not already included',
        'Include shot blast / vibratory finishing — mandatory for most OEM castings',
        'Check if impregnation is required by the pressure/leak specification',
        'Include CMM/gauging cost for first-article and in-process inspection',
        'Validate with foundry quotation template that all secondary ops are captured',
      ],
    });
  }

  // ── Casting-specific: High reject rate ────────────────────────────────────
  // Infer reject rate from the ratio of effective process time to base cycle time.
  // High process cost relative to material suggests reject uplift is significant.
  // We detect this via OEE-adjusted vs non-adjusted comparison — proxy: if worst OEE op
  // has rejectUplift baked in AND total process cost is above benchmark high.
  // Simpler proxy: material utilization is fine (>0.70) but process% is still very high.
  if ((commodity === 'casting' || commodity === 'cast_and_machine') &&
      pcts.proc > bm.processPct[1] * 1.2 &&
      input.rawMaterial.materialUtilization >= 0.65) {
    insights.push({
      type: 'warning',
      category: 'process',
      title: 'Elevated process cost — possible high reject/scrap rate',
      finding: `Process cost is ${pcts.proc.toFixed(1)}% vs benchmark max of ${bm.processPct[1]}%. For castings, this may indicate a high reject rate (>5%) inflating effective machine time, poor OEE on the casting cell, or cycle time above industry benchmark for this alloy/weight range.`,
      impact: 'Medium',
      potentialSavingPct: Math.min(8, (pcts.proc - bm.processPct[1]) * 0.4),
      actions: [
        'Audit actual first-pass yield (FPY) data from the foundry — target >96% for HPDC Al',
        'Root-cause the dominant reject type: porosity, dimensional, surface, or cold shut',
        'Optimise shot profile: slow/fast transition velocity and intensification pressure',
        'Increase die temperature uniformity — thermal imaging of die face recommended',
        'Review die lubrication frequency and release agent concentration',
      ],
    });
  }

  // ── Design for manufacturability ─────────────────────────────────────────
  if (input.operations.length > 4) {
    insights.push({
      type: 'info',
      category: 'design',
      title: 'High operation count — DFM review recommended',
      finding: `${input.operations.length} machining operations detected. Each additional setup adds fixture cost, handling time, and process variation risk.`,
      impact: 'Medium',
      potentialSavingPct: Math.min(8, (input.operations.length - 3) * 1.5),
      actions: [
        'Consolidate operations using multi-axis machining (4/5-axis) to reduce setups',
        'Redesign features (deep pockets, undercuts) that force additional setups',
        'Evaluate whether all features are functionally necessary',
        'Use Group Technology — batch with similar parts to maximise machine utilisation',
      ],
    });
  }

  // Sort: critical → warning → opportunity → benchmark → info
  const order: Record<InsightType, number> = { critical: 0, warning: 1, opportunity: 2, benchmark: 3, info: 4 };
  insights.sort((a, b) => {
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
    return b.potentialSavingPct - a.potentialSavingPct;
  });

  return insights;
}

export function totalPotentialSaving(insights: CostInsight[]): number {
  if (insights.length === 0) return 0;
  // Use RSS (root-sum-of-squares) to avoid double-counting — insights are partially correlated
  const sumSq = insights.reduce((s, i) => s + i.potentialSavingPct ** 2, 0);
  return Math.min(35, Math.sqrt(sumSq));
}
