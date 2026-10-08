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
  shouldCostPerPart?: number;    // the cost engine's figure for this line — the ONLY should-cost source
  targetPricePerPart?: number;   // buyer target or supplier quote
  supplierCount?: number;
  toleranceClass?: 'loose' | 'standard' | 'tight';
}

export interface RfqLineAnalysis {
  partName: string;
  commodity: string;
  quantity: number;
  /** False when no engine costing came with the line: shouldCostPerPart is 0 and the line is in no total. */
  costed: boolean;
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

/**
 * A line's should-cost is the cost engine's figure, supplied with the line (`shouldCostPerPart`). There is no fallback:
 * this used to multiply weight × material price by a fixed "conversion" factor per commodity (2.6 for machining …),
 * a rule-of-thumb printed as a should-cost (AI-path audit, Oct 2026). A line without an engine costing is reported
 * as NOT COSTED, kept out of every total, and its material content is shown for what it is.
 */
function engineShouldCost(l: RfqLineItem): number | null {
  return l.shouldCostPerPart && l.shouldCostPerPart > 0 ? l.shouldCostPerPart : null;
}

export function analyzeRfq(items: RfqLineItem[]): RfqAnalysis {
  const lines: RfqLineAnalysis[] = items.map(l => {
    const costed = engineShouldCost(l);
    const sc = costed ?? 0;
    const ext = Math.round(sc * Math.max(1, l.quantity) * 100) / 100;
    const risks: string[] = [];
    if (costed === null) {
      const mat = (l.netWeightKg ?? 0) * (l.materialPricePerKg ?? 0);
      risks.push('Not should-costed: no engine costing for this line — cost it in its commodity form.'
        + (mat > 0 ? ` Material content alone: £${mat.toFixed(2)} (${l.netWeightKg} kg × £${l.materialPricePerKg}/kg).` : ''));
    }
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

    return { partName: l.partName, commodity: l.commodity, quantity: l.quantity, costed: costed !== null, shouldCostPerPart: sc, extendedShouldCost: ext, targetPricePerPart: l.targetPricePerPart, gapVsTargetPct: gap, risks, lever: costed === null ? 'Cost this line first — no should-cost to negotiate from.' : lever };
  });

  const totalShouldCost = round2(lines.reduce((s, l) => s + l.extendedShouldCost, 0));
  const withTarget = lines.filter(l => l.costed && l.targetPricePerPart && l.targetPricePerPart > 0);
  const totalTarget = withTarget.length ? round2(withTarget.reduce((s, l) => s + l.targetPricePerPart! * Math.max(1, l.quantity), 0)) : null;
  const headroomOpportunity = round2(lines.reduce((s, l) => {
    if (l.targetPricePerPart && l.targetPricePerPart > l.shouldCostPerPart) return s + (l.targetPricePerPart - l.shouldCostPerPart) * Math.max(1, l.quantity);
    return s;
  }, 0));
  const aggressiveExposure = round2(lines.reduce((s, l) => {
    if (l.costed && l.targetPricePerPart && l.targetPricePerPart < l.shouldCostPerPart) return s + (l.shouldCostPerPart - l.targetPricePerPart) * Math.max(1, l.quantity);
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
  const uncosted = lines.filter(l => !l.costed);
  if (uncosted.length) brief.push(`${uncosted.length} line(s) have no should-cost yet (${uncosted.slice(0, 3).map(l => l.partName).join(', ')}) — cost them before negotiating; they are in no total above.`);
  brief.push(`Focus effort on the Pareto set (${highValueLines.length} of ${lines.length} parts ≈ 80% of spend); request cost breakdowns and benchmark each against should-cost.`);

  return { lines, totalShouldCost, totalTarget, headroomOpportunity, aggressiveExposure, highValueLines, topRisks, negotiationBrief: brief };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
