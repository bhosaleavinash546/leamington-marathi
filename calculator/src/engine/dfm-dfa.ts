/**
 * Rule-based DFM/DFA and Cost Optimisation engine.
 * Deterministic — no AI API required.
 * Follow the same pattern as insights.ts.
 */
import type { PartCostResult, UniversalStackInput, CommodityType } from './types.js';

export type DFMSeverity = 'critical' | 'major' | 'minor' | 'opportunity';
export type DFMCategory = 'geometry' | 'material' | 'process' | 'tolerance' | 'tooling' | 'assembly' | 'automation' | 'commercial';

export interface DFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  savingPct: number;
  risk: 'Low' | 'Medium' | 'High';
  recommendation: string;
}

export interface DFMAnalysis {
  score: number;  // 1–10, 10 = perfect manufacturability
  issues: DFMIssue[];
  summary: string;
  totalSavingPct: number;
}

export interface DFAAnalysis {
  score: number;  // 1–10
  issues: DFMIssue[];
  summary: string;
  totalSavingPct: number;
}

export interface CostOptimisation {
  title: string;
  description: string;
  expectedSavingPct: number;
  technicalJustification: string;
  risk: 'Low' | 'Medium' | 'High';
  timeframe: 'Quick Win' | 'Medium Term' | 'Long Term';
}

export interface DFMDFAResult {
  commodity: CommodityType;
  dfm: DFMAnalysis;
  dfa: DFAAnalysis;
  costOptimisations: CostOptimisation[];
  totalPotentialSavingPct: number;
  quickWins: string[];
  longTermChanges: string[];
}

// ─── Score calculation ────────────────────────────────────────────────────────

function calcScore(issues: DFMIssue[]): number {
  let score = 10;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 2;
    else if (issue.severity === 'major') score -= 1;
    else if (issue.severity === 'minor') score -= 0.5;
    // opportunity: no deduction
  }
  return Math.round(Math.max(1, Math.min(10, score)) * 10) / 10;
}

// ─── RSS saving ───────────────────────────────────────────────────────────────

function rssSavingTop3(issues: DFMIssue[]): number {
  const sorted = [...issues].sort((a, b) => b.savingPct - a.savingPct).slice(0, 3);
  const sumSq = sorted.reduce((s, i) => s + i.savingPct ** 2, 0);
  return Math.min(40, Math.sqrt(sumSq));
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateDFMDFA(
  result: PartCostResult,
  input: UniversalStackInput,
  commodity: CommodityType,
): DFMDFAResult {
  const tot = result.total || 1;
  const matPct  = (result.breakdown.rawMaterial / tot) * 100;
  const procPct = (result.breakdown.process / tot) * 100;
  const labPct  = (result.breakdown.labour / tot) * 100;
  const toolPct = (result.breakdown.tooling / tot) * 100;
  const oheadPct = (result.breakdown.overhead / tot) * 100;
  const mgnPct  = (result.breakdown.margin / tot) * 100;
  const opCount = (input.operations ?? []).length;
  const avgOEE  = opCount > 0 ? (input.operations.reduce((s, o) => s + (o.oee ?? 0.85), 0) / opCount) : 0.85;
  const matUtil = input.rawMaterial?.materialUtilization ?? 0.72;

  // ─── DFM Issues ──────────────────────────────────────────────────────────────

  const dfmIssues: DFMIssue[] = [];

  // All-commodity rules — material utilisation
  if (matUtil < 0.60) {
    dfmIssues.push({
      severity: 'critical',
      category: 'geometry',
      title: 'Low material utilisation (<60%)',
      description: `Material utilisation at ${(matUtil * 100).toFixed(0)}% is critically low. Over 40% of purchased material becomes waste.`,
      savingPct: 12,
      risk: 'Medium',
      recommendation: 'Improve nesting/billet size; consider near-net-shape process',
    });
  } else if (matUtil >= 0.60 && matUtil < 0.72) {
    dfmIssues.push({
      severity: 'major',
      category: 'geometry',
      title: 'Below-benchmark material utilisation',
      description: `Material utilisation at ${(matUtil * 100).toFixed(0)}% is below the typical 72% benchmark for this commodity.`,
      savingPct: 6,
      risk: 'Low',
      recommendation: 'Review blank/billet sizing; optimise nesting layout; explore near-net-shape pre-forms',
    });
  }

  // All-commodity rules — OEE
  if (avgOEE < 0.70) {
    dfmIssues.push({
      severity: 'critical',
      category: 'process',
      title: 'Low OEE (<70%)',
      description: `Average OEE at ${(avgOEE * 100).toFixed(0)}% is critically below the 70% threshold. Significant capacity and cost loss.`,
      savingPct: 15,
      risk: 'High',
      recommendation: 'Investigate root causes: downtime, changeover, micro-stops. Implement TPM.',
    });
  } else if (avgOEE >= 0.70 && avgOEE < 0.80) {
    dfmIssues.push({
      severity: 'major',
      category: 'process',
      title: 'Below-target OEE (70–80%)',
      description: `Average OEE at ${(avgOEE * 100).toFixed(0)}% is below the 80% target. Improvement opportunity exists.`,
      savingPct: 7,
      risk: 'Medium',
      recommendation: 'Apply OEE improvement toolkit: reduce minor stoppages, optimise changeover, improve quality rate',
    });
  }

  // All-commodity rules — tooling
  if (toolPct > 20) {
    dfmIssues.push({
      severity: 'major',
      category: 'tooling',
      title: 'High tooling amortisation (>20% of part cost)',
      description: `Tooling at ${toolPct.toFixed(1)}% of part cost is significantly above the 12% benchmark. Volume-sensitive lever.`,
      savingPct: 8,
      risk: 'Low',
      recommendation: 'Review tool life, increase annual volume, consider modular tooling',
    });
  } else if (toolPct > 12 && toolPct <= 20) {
    dfmIssues.push({
      severity: 'minor',
      category: 'tooling',
      title: 'Elevated tooling amortisation (12–20%)',
      description: `Tooling at ${toolPct.toFixed(1)}% of part cost is above the typical range. Consider volume increase or tooling cost reduction.`,
      savingPct: 4,
      risk: 'Low',
      recommendation: 'Evaluate family tooling or increase volume to reduce per-part tooling cost',
    });
  }

  // All-commodity rules — overhead
  if (oheadPct > 18) {
    dfmIssues.push({
      severity: 'major',
      category: 'commercial',
      title: 'Overhead burden >18%',
      description: `Overhead at ${oheadPct.toFixed(1)}% of part cost exceeds the 18% benchmark. Factory burden may be inflated.`,
      savingPct: 6,
      risk: 'Medium',
      recommendation: 'Request itemised overhead breakdown; compare tier-1 vs tier-2 structures; explore make-vs-buy',
    });
  }

  // All-commodity rules — margin
  if (mgnPct > 18) {
    dfmIssues.push({
      severity: 'major',
      category: 'commercial',
      title: 'Supplier margin >18%',
      description: `Supplier margin at ${mgnPct.toFixed(1)}% exceeds the competitive 18% ceiling. Open negotiation lever available.`,
      savingPct: 5,
      risk: 'Low',
      recommendation: 'Dual-source or RFQ rebalance',
    });
  }

  // ─── Commodity-specific DFM rules ────────────────────────────────────────────

  if (commodity === 'machining') {
    if (opCount > 4) {
      dfmIssues.push({
        severity: 'major',
        category: 'geometry',
        title: 'High operation count (>4)',
        description: `${opCount} machining operations detected. Each additional setup adds fixture cost, handling time, and process variation.`,
        savingPct: 10,
        risk: 'Medium',
        recommendation: 'Multi-axis consolidation, reduce setups',
      });
    }
    if (procPct > 40) {
      dfmIssues.push({
        severity: 'major',
        category: 'process',
        title: 'Process cost dominates (>40%)',
        description: `Process cost at ${procPct.toFixed(1)}% of total. Machining conversion cost is unusually high.`,
        savingPct: 8,
        risk: 'Medium',
        recommendation: 'Consider near-net-shape pre-form (casting/forging)',
      });
    }
  }

  if (commodity === 'casting') {
    if (toolPct > 18) {
      dfmIssues.push({
        severity: 'critical',
        category: 'tooling',
        title: 'Die cost very high (>18%)',
        description: `Die tooling at ${toolPct.toFixed(1)}% of part cost is critically high. Volume is insufficient to amortise die investment.`,
        savingPct: 12,
        risk: 'High',
        recommendation: 'Increase annual volume, consider family tooling or gravity die as interim solution',
      });
    }
    if (matPct < 35) {
      dfmIssues.push({
        severity: 'minor',
        category: 'material',
        title: 'Unusually low material content — verify alloy grade',
        description: `Material at ${matPct.toFixed(1)}% of part cost is below the 35% floor for castings. Verify alloy grade and net weight inputs.`,
        savingPct: 0,
        risk: 'Low',
        recommendation: 'Validate material weight and alloy price inputs against purchase orders',
      });
    }
  }

  if (commodity === 'forging') {
    if (matUtil < 0.75) {
      dfmIssues.push({
        severity: 'major',
        category: 'material',
        title: 'Low forging material utilisation (<75%)',
        description: `Material utilisation at ${(matUtil * 100).toFixed(0)}% is below the 75% forging benchmark. Flash and scale loss is excessive.`,
        savingPct: 8,
        risk: 'Medium',
        recommendation: 'Optimise preform design to reduce flash; consider closed-die forging with controlled flash land',
      });
    }
    if (toolPct > 15) {
      dfmIssues.push({
        severity: 'major',
        category: 'tooling',
        title: 'Die cost high (>15%)',
        description: `Forging die cost at ${toolPct.toFixed(1)}% of part cost. High tool investment relative to volume.`,
        savingPct: 7,
        risk: 'Medium',
        recommendation: 'Increase annual volume commitment; explore hot-trim tooling consolidation',
      });
    }
  }

  if (commodity === 'sheet_metal' || commodity === 'sheet_metal_fab') {
    if (matUtil < 0.65) {
      dfmIssues.push({
        severity: 'critical',
        category: 'geometry',
        title: 'Blank nesting <65%',
        description: `Material utilisation at ${(matUtil * 100).toFixed(0)}% implies poor blank nesting. Over 35% of sheet becomes scrap offcuts.`,
        savingPct: 15,
        risk: 'Medium',
        recommendation: 'Optimise nesting with CAD nesting software; consider part redesign to reduce scrap skeleton',
      });
    }
    if (opCount > 6) {
      dfmIssues.push({
        severity: 'major',
        category: 'process',
        title: 'Too many forming operations',
        description: `${opCount} operations detected. Excessive forming stages increase cycle time and die investment.`,
        savingPct: 8,
        risk: 'Medium',
        recommendation: 'Combine operations using progressive or transfer die; review form sequence for efficiency',
      });
    }
  }

  if (commodity === 'injection_moulding' || commodity === 'blow_moulding' || commodity === 'thermoforming') {
    if (toolPct > 30) {
      dfmIssues.push({
        severity: 'critical',
        category: 'tooling',
        title: 'Mould cost >30%',
        description: `Mould/tool cost at ${toolPct.toFixed(1)}% of part cost is critically high. Volume is insufficient to justify tooling investment.`,
        savingPct: 12,
        risk: 'High',
        recommendation: 'Increase annual volume; consider family/multi-cavity tooling; evaluate aluminium soft tooling for low volumes',
      });
    }
    if (matUtil < 0.75) {
      dfmIssues.push({
        severity: 'major',
        category: 'material',
        title: 'Runner/sprue waste >25%',
        description: `Material utilisation at ${(matUtil * 100).toFixed(0)}%. Significant runner and sprue waste. Hot runner system may eliminate waste entirely.`,
        savingPct: 6,
        risk: 'Medium',
        recommendation: 'Evaluate hot runner system to eliminate cold runner waste; increase cavity count',
      });
    }
  }

  if (commodity === 'pcb_fab') {
    if (procPct > 60) {
      dfmIssues.push({
        severity: 'major',
        category: 'process',
        title: 'Fab complexity driving high process cost',
        description: `PCB fabrication process cost at ${procPct.toFixed(1)}% of total. High layer count, fine pitch, or tight tolerances are driving cost.`,
        savingPct: 10,
        risk: 'Medium',
        recommendation: 'Review layer stack-up; relax minimum track/space where functional spec allows; consider standard via sizes',
      });
    }
    if (toolPct > 10) {
      dfmIssues.push({
        severity: 'major',
        category: 'tooling',
        title: 'NRE cost per board high — increase volume',
        description: `NRE/setup cost at ${toolPct.toFixed(1)}% per board. Volume is insufficient to amortise non-recurring costs.`,
        savingPct: 8,
        risk: 'Low',
        recommendation: 'Increase annual volume; evaluate panelisation to maximise boards per setup run',
      });
    }
  }

  if (commodity === 'pcba') {
    if (labPct > 35) {
      dfmIssues.push({
        severity: 'major',
        category: 'assembly',
        title: 'High labour content — automate SMT',
        description: `Labour at ${labPct.toFixed(1)}% of PCBA cost. High manual content indicates through-hole or manual rework operations.`,
        savingPct: 12,
        risk: 'Medium',
        recommendation: 'Convert through-hole components to SMT equivalents; automate selective soldering; reduce manual inspection',
      });
    }
    if (opCount > 6) {
      dfmIssues.push({
        severity: 'major',
        category: 'assembly',
        title: 'Many assembly operations',
        description: `${opCount} assembly operations detected. Complex PCBA with many process steps increases cycle time and defect risk.`,
        savingPct: 7,
        risk: 'Medium',
        recommendation: 'Consolidate assembly stages; review component placement for assembly efficiency',
      });
    }
  }

  if (commodity === 'rubber') {
    if (procPct > 45) {
      dfmIssues.push({
        severity: 'major',
        category: 'process',
        title: 'Cure process cost dominant',
        description: `Process cost at ${procPct.toFixed(1)}% of total. Moulding and cure cycle time is the primary cost driver.`,
        savingPct: 8,
        risk: 'Medium',
        recommendation: 'Optimise cure recipe (temperature/time); evaluate injection moulding vs compression; increase cavity count',
      });
    }
  }

  if (commodity === 'composites') {
    if (labPct > 40) {
      dfmIssues.push({
        severity: 'major',
        category: 'assembly',
        title: 'Labour-intensive layup',
        description: `Labour at ${labPct.toFixed(1)}% of composite part cost. Manual layup is the dominant cost driver.`,
        savingPct: 15,
        risk: 'High',
        recommendation: 'Evaluate ATL/AFP automated fibre placement; consider resin infusion over manual prepreg layup',
      });
    }
    if (procPct > 35) {
      dfmIssues.push({
        severity: 'major',
        category: 'process',
        title: 'Long cure cycle cost',
        description: `Process cost at ${procPct.toFixed(1)}%. Autoclave or oven cure cycle time driving high process cost.`,
        savingPct: 10,
        risk: 'High',
        recommendation: 'Evaluate out-of-autoclave (OOA) processes; consider press moulding for high volume; optimise cure schedule',
      });
    }
  }

  if (commodity === 'wiring_harness') {
    if (labPct > 50) {
      dfmIssues.push({
        severity: 'critical',
        category: 'automation',
        title: 'Labour >50% — automation critical',
        description: `Labour at ${labPct.toFixed(1)}% of harness cost. Manual termination and assembly is the dominant cost element.`,
        savingPct: 20,
        risk: 'High',
        recommendation: 'Automate wire cutting, stripping, and terminal crimping; evaluate connector standardisation for robotic assembly',
      });
    }
    if (opCount > 8) {
      dfmIssues.push({
        severity: 'major',
        category: 'assembly',
        title: 'High complexity harness',
        description: `${opCount} harness assembly operations. Complex routing and branching increases assembly time and defect risk.`,
        savingPct: 8,
        risk: 'Medium',
        recommendation: 'Standardise connector families; reduce branch points; evaluate sub-harness modularisation',
      });
    }
  }

  if (commodity === 'painting' || commodity === 'biw_assembly') {
    if (oheadPct > 20) {
      dfmIssues.push({
        severity: 'major',
        category: 'commercial',
        title: 'High facility overhead',
        description: `Overhead at ${oheadPct.toFixed(1)}% of part cost. Paint shop or BIW facility burden rate is elevated.`,
        savingPct: 6,
        risk: 'Medium',
        recommendation: 'Review facility utilisation; consolidate product mix to improve line efficiency; negotiate toll-painting rates',
      });
    }
  }

  // ─── DFA Issues ──────────────────────────────────────────────────────────────

  const dfaIssues: DFMIssue[] = [];

  if (opCount > 5) {
    dfaIssues.push({
      severity: 'major',
      category: 'assembly',
      title: 'High operation count implies multiple setups/transfers',
      description: `${opCount} operations require multiple machine setups or work transfers, increasing total assembly/process cycle time.`,
      savingPct: 8,
      risk: 'Medium',
      recommendation: 'Reduce operation count through multi-axis machining, combined tooling, or part consolidation',
    });
  }

  if (opCount > 3 && labPct > 30) {
    dfaIssues.push({
      severity: 'major',
      category: 'automation',
      title: 'High manual content — assess robot/automation feasibility',
      description: `${opCount} operations with ${labPct.toFixed(1)}% labour content indicates significant manual intervention in the process.`,
      savingPct: 12,
      risk: 'Medium',
      recommendation: 'Conduct automation feasibility study; evaluate cobot integration for repetitive assembly tasks',
    });
  }

  if (avgOEE < 0.75) {
    dfaIssues.push({
      severity: 'major',
      category: 'automation',
      title: 'Low OEE indicates manual pacing or frequent stoppages',
      description: `Average OEE at ${(avgOEE * 100).toFixed(0)}% suggests manual pacing, frequent micro-stops, or high changeover time between parts.`,
      savingPct: 8,
      risk: 'Medium',
      recommendation: 'Implement line balancing study; standardise operator work cycles; introduce poka-yoke to reduce defect-driven stoppages',
    });
  }

  if ((commodity === 'wiring_harness' || commodity === 'pcba') && labPct > 45) {
    dfaIssues.push({
      severity: 'critical',
      category: 'automation',
      title: 'Labour-dominated assembly — priority for fixture/automation',
      description: `Labour at ${labPct.toFixed(1)}% in a ${commodity.replace(/_/g, ' ')} context is critically high. Manual assembly dominates cost.`,
      savingPct: 18,
      risk: 'High',
      recommendation: 'Invest in dedicated assembly fixtures; evaluate automated soldering, crimping, and testing equipment',
    });
  }

  if ((commodity === 'machining' || commodity === 'forging') && opCount > 3) {
    dfaIssues.push({
      severity: 'minor',
      category: 'assembly',
      title: 'Multiple fixturing operations; consider pallet systems',
      description: `${opCount} operations in ${commodity.replace(/_/g, ' ')} imply multiple fixturing steps. Pallet systems can reduce handling time.`,
      savingPct: 5,
      risk: 'Low',
      recommendation: 'Evaluate tombstone/pallet machining systems for batch processing without re-fixturing',
    });
  }

  if (opCount > 4 && labPct > 20) {
    dfaIssues.push({
      severity: 'opportunity',
      category: 'assembly',
      title: 'Assess fastener standardisation',
      description: `Multiple operations with labour content suggest fastener variety may be adding assembly complexity and tool change time.`,
      savingPct: 4,
      risk: 'Low',
      recommendation: 'Standardise fastener type and drive; reduce fastener count through snap-fit or weld; evaluate fastener family rationalisation',
    });
  }

  // ─── Cost Optimisations ───────────────────────────────────────────────────────

  const costOptimisations: CostOptimisation[] = [];

  // Combine all issues to identify top drivers
  const allIssues = [...dfmIssues, ...dfaIssues];

  // Labour automation
  if (labPct > 30) {
    costOptimisations.push({
      title: 'Automate High-Labour Operations',
      description: `Labour represents ${labPct.toFixed(1)}% of total part cost. Automation of repetitive tasks can reduce this significantly.`,
      expectedSavingPct: Math.min(20, labPct * 0.4),
      technicalJustification: 'Cobot or hard automation for loading/unloading, assembly, and inspection can achieve 50–70% labour reduction with <18 month payback at current volumes.',
      risk: 'Medium',
      timeframe: 'Medium Term',
    });
  }

  // Material utilisation improvement
  if (matUtil < 0.75) {
    costOptimisations.push({
      title: 'Improve Material Utilisation via Near-Net-Shape',
      description: `Current utilisation at ${(matUtil * 100).toFixed(0)}%. Near-net-shape process or improved nesting targets 80–90%.`,
      expectedSavingPct: Math.min(15, (0.85 - matUtil) * 50),
      technicalJustification: 'Near-net-shape pre-forms (forging, casting, PM) reduce buy-to-fly ratio. CAD-optimised nesting can improve sheet/plate usage by 8–15%.',
      risk: 'Medium',
      timeframe: 'Medium Term',
    });
  }

  // OEE improvement
  if (avgOEE < 0.82) {
    costOptimisations.push({
      title: 'OEE Improvement Programme (TPM)',
      description: `OEE at ${(avgOEE * 100).toFixed(0)}% vs 85% world-class target. Each 5% OEE gain reduces effective machine cost by 5%.`,
      expectedSavingPct: Math.min(12, (0.85 - avgOEE) * 30),
      technicalJustification: 'Total Productive Maintenance (TPM) with SMED, planned maintenance, and autonomous maintenance typically achieves 5–12% OEE improvement in 12–18 months.',
      risk: 'Low',
      timeframe: 'Medium Term',
    });
  }

  // Tooling cost reduction
  if (toolPct > 12) {
    costOptimisations.push({
      title: 'Volume Increase to Dilute Tooling NRE',
      description: `Tooling at ${toolPct.toFixed(1)}% of part cost is volume-sensitive. Doubling volume halves per-part tooling cost.`,
      expectedSavingPct: Math.min(10, toolPct * 0.4),
      technicalJustification: 'Tooling is a fixed NRE amortised over volume. Annual volume increase through platform sharing or new platform adoption directly reduces tooling cost per part.',
      risk: 'Low',
      timeframe: 'Quick Win',
    });
  }

  // Overhead challenge
  if (oheadPct > 15) {
    costOptimisations.push({
      title: 'Overhead Rate Negotiation and Benchmarking',
      description: `Overhead at ${oheadPct.toFixed(1)}% of part cost. Open-book costing can expose inflated factory burden.`,
      expectedSavingPct: Math.min(6, (oheadPct - 12) * 0.4),
      technicalJustification: 'Tier-1 automotive suppliers typically operate 10–15% overhead rates. Challenging inflated rates via open-book costing and competitive benchmarking is a low-risk saving lever.',
      risk: 'Low',
      timeframe: 'Quick Win',
    });
  }

  // Supplier margin negotiation
  if (mgnPct > 12) {
    costOptimisations.push({
      title: 'Competitive RFQ to Reduce Supplier Margin',
      description: `Supplier margin at ${mgnPct.toFixed(1)}% is above the 10–12% competitive benchmark. Multi-source RFQ can recover 2–5%.`,
      expectedSavingPct: Math.min(5, mgnPct - 10),
      technicalJustification: 'Running a 3-way competitive RFQ using this should-cost model as the floor price creates commercial pressure. Offer longer-term volume commitment in exchange for margin reduction.',
      risk: 'Low',
      timeframe: 'Quick Win',
    });
  }

  // Process consolidation
  if (opCount > 4) {
    costOptimisations.push({
      title: 'Multi-Axis Machining to Consolidate Operations',
      description: `${opCount} operations can be reduced by 40–60% through 4/5-axis machining centre investment.`,
      expectedSavingPct: Math.min(12, opCount * 1.5),
      technicalJustification: '5-axis machining centres can combine 3–4 separate operations into a single setup, eliminating re-fixturing time, reducing WIP and improving dimensional accuracy through datum consistency.',
      risk: 'Medium',
      timeframe: 'Long Term',
    });
  }

  // Regional sourcing
  const convPct = procPct + labPct;
  if (convPct > 30) {
    costOptimisations.push({
      title: 'Regional Sourcing Study — Low-Cost Country Manufacturing',
      description: `Conversion cost (process + labour) at ${convPct.toFixed(1)}% creates significant regional arbitrage opportunity.`,
      expectedSavingPct: Math.min(18, convPct * 0.35),
      technicalJustification: 'Labour-intensive operations in India/Mexico/Poland offer 40–70% labour cost reduction. Dual-sourcing with LCC supplier for high-volume commodity parts is standard Tier-1 strategy.',
      risk: 'High',
      timeframe: 'Long Term',
    });
  }

  // Ensure we have 5–8 items — add generic ones if needed
  if (costOptimisations.length < 5) {
    costOptimisations.push({
      title: 'Design Review for DFM Compliance',
      description: 'Formal DFM review with manufacturing engineering to identify part features that increase cost without functional benefit.',
      expectedSavingPct: 5,
      technicalJustification: 'Industry studies show DFM reviews typically find 5–15% cost reduction through feature simplification, tolerance relaxation, and material substitution.',
      risk: 'Low',
      timeframe: 'Quick Win',
    });
  }

  if (costOptimisations.length < 6) {
    costOptimisations.push({
      title: 'Annual Volume Re-Commitment for Better Pricing',
      description: 'Provide 12-month rolling volume forecast to supplier to secure better unit pricing and tooling amortisation.',
      expectedSavingPct: 3,
      technicalJustification: 'Suppliers discount unit price 3–8% for firm annual volume commitments due to improved scheduling, reduced setup frequency, and inventory optimisation.',
      risk: 'Low',
      timeframe: 'Quick Win',
    });
  }

  // ─── Score computation ────────────────────────────────────────────────────────

  const dfmScore = calcScore(dfmIssues);
  const dfaScore = calcScore(dfaIssues);

  // ─── Summary strings ──────────────────────────────────────────────────────────

  const commodityLabel = commodity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const dfmCriticalTitles = dfmIssues.filter(i => i.severity === 'critical').map(i => i.title);
  const dfmMajorTitles = dfmIssues.filter(i => i.severity === 'major').map(i => i.title);
  const dfmTopConcerns = [...dfmCriticalTitles, ...dfmMajorTitles].slice(0, 3);
  const dfmSummary = dfmIssues.length === 0
    ? `${commodityLabel} part has good manufacturability. No significant DFM issues detected. Score: ${dfmScore}/10.`
    : `${commodityLabel} has ${dfmIssues.length} DFM issue(s). Major concerns: ${dfmTopConcerns.join('; ') || 'None'}. Manufacturability score: ${dfmScore}/10.`;

  const dfaTopConcerns = dfaIssues.filter(i => i.severity === 'critical' || i.severity === 'major').map(i => i.title).slice(0, 3);
  const dfaSummary = dfaIssues.length === 0
    ? `${commodityLabel} assembly process is well-structured. No significant DFA issues detected. Score: ${dfaScore}/10.`
    : `${commodityLabel} has ${dfaIssues.length} DFA issue(s). Assembly concerns: ${dfaTopConcerns.join('; ') || 'None'}. Assembly score: ${dfaScore}/10.`;

  // ─── RSS saving totals ────────────────────────────────────────────────────────

  const dfmTotalSavingPct = Math.round(rssSavingTop3(dfmIssues) * 10) / 10;
  const dfaTotalSavingPct = Math.round(rssSavingTop3(dfaIssues) * 10) / 10;

  // Total potential — RSS of top 3 across all issues
  const totalPotentialSavingPct = Math.round(rssSavingTop3(allIssues) * 10) / 10;

  // ─── Quick wins and long-term changes ────────────────────────────────────────

  const quickWins = costOptimisations
    .filter(o => o.risk === 'Low' && o.timeframe === 'Quick Win')
    .map(o => o.title);

  const longTermChanges = costOptimisations
    .filter(o => o.timeframe === 'Long Term')
    .map(o => o.title);

  return {
    commodity,
    dfm: {
      score: dfmScore,
      issues: dfmIssues,
      summary: dfmSummary,
      totalSavingPct: dfmTotalSavingPct,
    },
    dfa: {
      score: dfaScore,
      issues: dfaIssues,
      summary: dfaSummary,
      totalSavingPct: dfaTotalSavingPct,
    },
    costOptimisations,
    totalPotentialSavingPct,
    quickWins,
    longTermChanges,
  };
}
