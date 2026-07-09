/**
 * Agentic RFQ analysis — the "autonomous cost engineer".
 *
 * Given the line items decomposed from an RFQ package (by the AI or a BOM import),
 * this deterministically should-costs each line, flags commercial/technical risk,
 * ranks the cost drivers (Pareto), and drafts a prioritised negotiation brief.
 * The LLM does the messy document→lines extraction; this engine does the rigorous,
 * reproducible analysis and the talking points — so the output is defensible.
 */

export interface RfqLineItem {
  partName: string;
  commodity: string;
  quantity: number;
  netWeightKg?: number;
  materialPricePerKg?: number;
  shouldCostPerPart?: number;    // pre-computed by the cost engine, if available
  targetPricePerPart?: number;   // buyer target or supplier quote
  supplierCount?: number;
  toleranceClass?: 'loose' | 'standard' | 'tight';
}

export interface RfqLineAnalysis {
  partName: string;
  commodity: string;
  quantity: number;
  shouldCostPerPart: number;
  extendedShouldCost: number;
  targetPricePerPart?: number;
  gapVsTargetPct?: number;       // (target − shouldCost)/shouldCost × 100 (+ = headroom, − = aggressive)
  risks: string[];
  lever: string;
}

export interface RfqAnalysis {
  lines: RfqLineAnalysis[];
  totalShouldCost: number;
  totalTarget: number | null;
  headroomOpportunity: number;   // Σ where target > should-cost (negotiate supplier down)
  aggressiveExposure: number;    // Σ where target < should-cost (unrealistic — risk of quality/margin cuts)
  highValueLines: string[];      // Pareto ~80% of cost
  topRisks: string[];
  negotiationBrief: string[];
}

// Material → total conversion multiplier (total ≈ material ÷ material-fraction) when
// no engine should-cost is supplied. Representative; only a fallback estimate.
const CONVERSION: Record<string, number> = {
  machining: 2.6, casting: 1.9, cast_and_machine: 2.8, forging: 2.1, sheet_metal: 2.2, sheet_metal_fab: 2.6,
  injection_moulding: 2.3, blow_moulding: 2.2, extrusion: 1.7, thermoforming: 2.4, rotational_moulding: 2.2,
  rubber: 2.5, composites: 3.2, painting: 3.0, biw_assembly: 2.0, wiring_harness: 1.8,
};

function estimateShouldCost(l: RfqLineItem): number {
  if (l.shouldCostPerPart && l.shouldCostPerPart > 0) return l.shouldCostPerPart;
  const matCost = (l.netWeightKg ?? 0) * (l.materialPricePerKg ?? 0);
  const conv = CONVERSION[l.commodity] ?? 2.3;
  return Math.round(matCost * conv * 100) / 100;
}

export function analyzeRfq(items: RfqLineItem[]): RfqAnalysis {
  const lines: RfqLineAnalysis[] = items.map(l => {
    const sc = estimateShouldCost(l);
    const ext = Math.round(sc * Math.max(1, l.quantity) * 100) / 100;
    const risks: string[] = [];
    let gap: number | undefined;
    if (l.targetPricePerPart && l.targetPricePerPart > 0 && sc > 0) {
      gap = Math.round(((l.targetPricePerPart - sc) / sc) * 1000) / 10;
      if (gap <= -5) risks.push(`Target ${gap}% below should-cost — aggressive; expect quality/margin pressure or verify scope.`);
      else if (gap >= 12) risks.push(`Quote ${gap}% above should-cost — clear negotiation headroom.`);
    }
    if ((l.supplierCount ?? 2) <= 1) risks.push('Single-source — supply-continuity risk; qualify a second source.');
    if (l.toleranceClass === 'tight') risks.push('Tight tolerance — scrap/inspection cost; confirm it is functionally required.');

    // Negotiation lever — the single most useful move for this line.
    const lever = gap !== undefined && gap >= 12 ? `Push price toward should-cost (£${sc.toFixed(2)}) — ${gap}% headroom.`
      : (l.supplierCount ?? 2) <= 1 ? 'Dual-source to unlock competitive tension.'
      : l.toleranceClass === 'tight' ? 'Relax non-critical tolerances to cut scrap/inspection.'
      : gap !== undefined && gap <= -5 ? 'Stress-test the low target — confirm scope/quality before award.'
      : 'Benchmark against should-cost; request cost breakdown.';

    return { partName: l.partName, commodity: l.commodity, quantity: l.quantity, shouldCostPerPart: sc, extendedShouldCost: ext, targetPricePerPart: l.targetPricePerPart, gapVsTargetPct: gap, risks, lever };
  });

  const totalShouldCost = round2(lines.reduce((s, l) => s + l.extendedShouldCost, 0));
  const withTarget = lines.filter(l => l.targetPricePerPart && l.targetPricePerPart > 0);
  const totalTarget = withTarget.length ? round2(withTarget.reduce((s, l) => s + l.targetPricePerPart! * Math.max(1, l.quantity), 0)) : null;
  const headroomOpportunity = round2(lines.reduce((s, l) => {
    if (l.targetPricePerPart && l.targetPricePerPart > l.shouldCostPerPart) return s + (l.targetPricePerPart - l.shouldCostPerPart) * Math.max(1, l.quantity);
    return s;
  }, 0));
  const aggressiveExposure = round2(lines.reduce((s, l) => {
    if (l.targetPricePerPart && l.targetPricePerPart < l.shouldCostPerPart) return s + (l.shouldCostPerPart - l.targetPricePerPart) * Math.max(1, l.quantity);
    return s;
  }, 0));

  // Pareto: lines that together make ~80% of extended cost.
  const ranked = [...lines].sort((a, b) => b.extendedShouldCost - a.extendedShouldCost);
  const highValueLines: string[] = [];
  let cum = 0;
  for (const l of ranked) { highValueLines.push(l.partName); cum += l.extendedShouldCost; if (totalShouldCost > 0 && cum / totalShouldCost >= 0.8) break; }

  const topRisks = [...new Set(lines.flatMap(l => l.risks))].slice(0, 6);

  // Negotiation brief — prioritised, £-weighted.
  const brief: string[] = [];
  if (headroomOpportunity > 0) brief.push(`£${headroomOpportunity.toFixed(0)} of negotiation headroom where quotes exceed should-cost — target the biggest lines first: ${ranked.filter(l => (l.gapVsTargetPct ?? 0) >= 12).slice(0, 3).map(l => l.partName).join(', ') || 'see line detail'}.`);
  if (aggressiveExposure > 0) brief.push(`£${aggressiveExposure.toFixed(0)} of "too-good" targets below should-cost — validate scope/quality before award to avoid change-order surprises.`);
  const singleSource = lines.filter(l => l.risks.some(r => r.startsWith('Single-source')));
  if (singleSource.length) brief.push(`Dual-source ${singleSource.length} single-sourced line(s) (${singleSource.slice(0, 3).map(l => l.partName).join(', ')}) to create competitive tension.`);
  const tight = lines.filter(l => l.risks.some(r => r.toLowerCase().includes('tolerance')));
  if (tight.length) brief.push(`Review tolerances on ${tight.length} line(s) — relaxing non-critical GD&T cuts scrap and inspection cost.`);
  brief.push(`Focus effort on the Pareto set (${highValueLines.length} of ${lines.length} parts ≈ 80% of spend); request cost breakdowns and benchmark each against should-cost.`);

  return { lines, totalShouldCost, totalTarget, headroomOpportunity, aggressiveExposure, highValueLines, topRisks, negotiationBrief: brief };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
