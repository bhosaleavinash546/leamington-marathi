/**
 * 360° idea-generation levers — the deterministic answer to "what would a
 * VAVE workshop propose on this part?".
 *
 * Every lever reads only what the costing itself established: the 8-bucket
 * breakdown, the operation list (names, cycle times, manning, efficiency,
 * parts-per-cycle, per-op costs), the tooling NRE and amortisation volume,
 * packaging/logistics per part, and the SuggestionContext flags that record
 * what a person actually told the tool (region, volume, quoted pack rates).
 * No AI, no randomness: same part in, same ideas out.
 *
 * Categories span the whole 360°: material, design, process, tooling,
 * packaging & logistics, commercial, quality, sustainability. Levers that
 * would otherwise re-recommend a decision the tool already took, or instruct
 * on an assumed (not entered) value, are gated the same way §11–§15 of the
 * report are — see SuggestionContext in insights.ts.
 */
import type { PartCostResult, UniversalStackInput, CommodityType } from './types.js';
import type { SuggestionContext } from './insights.js';
import type { CostOptimisation } from './dfm-dfa.js';

/** Bucket shares and op stats already derived by generateDFMDFA — passed in so
 *  both layers read the identical numbers. */
export interface LeverSignals {
  matPct: number; procPct: number; labPct: number; toolPct: number;
  oheadPct: number; mgnPct: number; opCount: number; avgOEE: number; matUtil: number;
}

// ─── Op-name signal regexes (same style as the sheet-metal weld rule) ────────
export const RX_INSPECT = /inspect|cmm|gauge|\btest\b|testing|verification/i;
export const RX_REWORK  = /deburr|fettl|polish|buff|dress|linish|flash removal|rework|touch.?up/i;
const RX_TIGHT    = /grind|lapp?ing|hone|honing|ream|superfinish/i;
const RX_HEAT     = /heat treat|anneal|temper|normalis|carburis|nitrid|stress relie|solution|ag(e|ing) harden/i;

const METAL_FORM: CommodityType[] = ['machining', 'cast_and_machine', 'casting', 'forging', 'sheet_metal', 'sheet_metal_fab', 'extrusion'];
const MOULD_FAMILY: CommodityType[] = ['injection_moulding', 'blow_moulding', 'thermoforming'];
const CAVITY_PROCESSES: CommodityType[] = ['injection_moulding', 'blow_moulding', 'thermoforming', 'rubber', 'casting'];
const ENERGY_INTENSE: CommodityType[] = ['casting', 'forging', 'painting', 'rubber', 'composites', 'rotational_moulding'];

const LOW_COST_REGIONS = new Set(['cn', 'china', 'in', 'india', 'mx', 'mexico', 'pl', 'poland',
  'cz', 'czechia', 'czech republic', 'tr', 'turkey', 'th', 'thailand', 'vn', 'vietnam']);

/**
 * The extended lever catalogue. Returns only levers whose trigger fired —
 * each with the saving computed from this part's own numbers and capped.
 */
export function generateIdeaLevers(
  result: PartCostResult,
  input: UniversalStackInput,
  commodity: CommodityType,
  ctx: SuggestionContext | undefined,
  sig: LeverSignals,
): CostOptimisation[] {
  const out: CostOptimisation[] = [];
  const { matPct, procPct, labPct, toolPct, oheadPct, mgnPct, opCount, avgOEE, matUtil } = sig;
  const tot = result.total || 1;
  const ops = input.operations ?? [];
  const opDetails = result.operationDetails ?? [];

  const pkgPct = (result.breakdown.packaging / tot) * 100;
  const logPct = (result.breakdown.logistics / tot) * 100;
  const pkgLogEstimated = ctx?.pkgLogisticsEstimated === true;
  const volumeAssumed = ctx?.volumeProvided === false;
  const alreadyLowCost = LOW_COST_REGIONS.has((ctx?.region ?? '').trim().toLowerCase());

  const consumables = input.rawMaterial?.consumablesCostPerPart ?? 0;
  const materialBucket = result.breakdown.rawMaterial || 0;
  const consumShare = materialBucket > 0 ? consumables / materialBucket : 0;

  const amortVol = input.tooling?.amortizationVolume ?? 0;
  const toolingNRE = input.tooling?.totalToolingCost ?? 0;

  // Per-operation Pareto — which single operation carries the conversion cost.
  const opConv = opDetails.map(o => ({ name: o.operationName, conv: o.processCost + o.labourCost }));
  const convTotal = opConv.reduce((s, o) => s + o.conv, 0);
  const topOp = opConv.length > 0 ? opConv.reduce((a, b) => (b.conv > a.conv ? b : a)) : null;
  const topOpShare = topOp && convTotal > 0 ? topOp.conv / convTotal : 0;

  const maxManning = ops.reduce((m, o) => Math.max(m, o.manning ?? 0), 0);
  const hasOp = (rx: RegExp) => ops.some(o => rx.test(o.operationName ?? ''));
  const opShareOfTotal = (rx: RegExp) => opDetails
    .filter(o => rx.test(o.operationName ?? ''))
    .reduce((s, o) => s + o.processCost + o.labourCost, 0) / tot;

  // ═══ MATERIAL ═══════════════════════════════════════════════════════════════

  if (METAL_FORM.includes(commodity) && matPct > 40) {
    out.push({
      category: 'material', lever: 'design',
      title: 'Alternate Material Grade Study',
      description: `Material is ${matPct.toFixed(1)}% of part cost — the largest lever on this part is the metal itself. An equivalent lower-cost grade (or secondary/remelt alloy where the spec allows) attacks it directly.`,
      expectedSavingPct: Math.min(8, 3 + (matPct - 40) * 0.15),
      technicalJustification: 'Grade substitution within the same family (e.g. 6082→6060 where strength allows, primary→secondary casting alloy, DP600→HSLA where CAE confirms) typically saves 5–15% of the material line with no process change. Requires engineering sign-off against the load case.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (MOULD_FAMILY.includes(commodity) && matUtil < 0.92) {
    out.push({
      category: 'material', lever: 'supplier',
      title: 'Closed-Loop Regrind of Runners and Trim',
      description: `${((1 - matUtil) * 100).toFixed(0)}% of the resin bought does not ship in the part. Reprocessing runners, sprues and trim as a controlled regrind blend recovers most of that value.`,
      expectedSavingPct: Math.min(5, (0.95 - matUtil) * 40),
      technicalJustification: 'A 10–20% regrind blend is standard practice for non-optical, non-safety mouldings and is invisible in the part when dried and dosed correctly. The saving is the resin price times the recovered fraction.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (['machining', 'cast_and_machine', 'sheet_metal', 'sheet_metal_fab', 'forging'].includes(commodity) && matUtil < 0.80) {
    out.push({
      category: 'material', lever: 'sourcing',
      title: 'Scrap Revenue Recovery at Index Prices',
      description: `${((1 - matUtil) * 100).toFixed(0)}% of the bought material leaves as chips, offcuts or skeleton. That scrap has an index price — the credit belongs in the piece price, not in the supplier's margin.`,
      expectedSavingPct: Math.min(4, 1 + (0.80 - matUtil) * 15),
      technicalJustification: 'Clean segregated scrap (Al swarf, steel skeleton, electrical-steel stamping web) trades at 20–60% of prime price. An open-book scrap credit clause at LME/index-linked prices is a standard automotive term.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (MOULD_FAMILY.includes(commodity) && matPct > 35) {
    out.push({
      category: 'sustainability', lever: 'design',
      title: 'Recycled-Content (PCR) Resin Blend',
      description: `Resin is ${matPct.toFixed(1)}% of the part. A 10–30% post-consumer-recycled blend cuts both cost and the part's carbon footprint where colour and mechanicals allow.`,
      expectedSavingPct: Math.min(4, matPct * 0.08),
      technicalJustification: 'PCR PP/ABS trades 15–30% below prime. Non-appearance and black parts are the natural first candidates; many OEM sustainability targets now require declared recycled content anyway.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (consumShare > 0.20) {
    out.push({
      category: 'material', lever: 'design',
      title: 'Consumables Rationalisation (Cores, Patterns, Shell)',
      description: `Per-part consumables are ${(consumShare * 100).toFixed(0)}% of the material line. Core count, pattern life and shell recipe are all design-controllable.`,
      expectedSavingPct: Math.min(6, consumShare * 20),
      technicalJustification: 'Core consolidation (one complex core replacing two simple ones), longer-life wax/pattern tooling, and shell-sand reclaim each cut the recurring consumable line 10–30% in foundry practice.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (matPct > 40) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Raw-Material Price Indexation Clause',
      description: `With material at ${matPct.toFixed(1)}% of cost, the quote embeds the supplier's hedge against metal/resin volatility. An index-linked clause removes that risk premium from the piece price.`,
      expectedSavingPct: Math.min(3, matPct * 0.05),
      technicalJustification: 'Indexing the material content to LME/CRU/resin indices with quarterly true-up removes the 2–5% volatility contingency suppliers price in, and makes future raw-material moves transparent in both directions.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  // ═══ DESIGN ═════════════════════════════════════════════════════════════════

  const tightShare = opShareOfTotal(RX_TIGHT);
  if (tightShare > 0.03 || (['machining', 'cast_and_machine'].includes(commodity) && procPct > 35)) {
    out.push({
      category: 'design', lever: 'design',
      title: 'Tolerance and Surface-Finish Relaxation',
      description: tightShare > 0.03
        ? `Grinding/honing/reaming content is ${(tightShare * 100).toFixed(1)}% of the part cost. Each of those operations exists to hit a callout — challenge the callouts before paying for them.`
        : `Machining is ${procPct.toFixed(1)}% of the part. The tightest tolerance and finish callouts set the machine, the cycle and the inspection burden — reviewing them is the cheapest cost lever that exists.`,
      expectedSavingPct: tightShare > 0.03 ? Math.min(6, tightShare * 100 * 0.8) : 4,
      technicalJustification: 'Industry DFM studies attribute 20–40% of precision-machining cost to the tightest decile of callouts. Opening a ±0.01 to ±0.05 where function allows can delete a grinding operation outright.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (opCount >= 5 && ['machining', 'cast_and_machine', 'sheet_metal', 'sheet_metal_fab', 'biw_assembly', 'pcba', 'wiring_harness'].includes(commodity)) {
    out.push({
      category: 'design', lever: 'design',
      title: 'Part-Count / Feature Integration Review (Boothroyd)',
      description: `${opCount} operations suggest features or joined parts that may not need to exist separately. The Boothroyd minimum-part-count test asks of each: does it move, must it be a different material, must it be separate for assembly?`,
      expectedSavingPct: 6,
      technicalJustification: 'Boothroyd–Dewhurst DFA practice: any part failing all three criteria is a candidate to integrate into its neighbour. Integrating a bracket into a casting or forming a feature instead of fastening it removes its entire operation chain.',
      risk: 'Medium', timeframe: 'Long Term',
    });
  }

  if ((commodity === 'casting' || commodity === 'rotational_moulding' || MOULD_FAMILY.includes(commodity)) && matPct > 42) {
    out.push({
      category: 'design', lever: 'design',
      title: 'Lightweighting / Wall Optimisation',
      description: `Material is ${matPct.toFixed(1)}% of cost and this is a wall-driven process — every 10% of wall thickness removed is roughly 10% off the material line and a shorter cooling/solidification cycle on top.`,
      expectedSavingPct: Math.min(6, 3 + (matPct - 42) * 0.15),
      technicalJustification: 'Topology/wall studies against the measured geometry (the kernel already knows the wall map) routinely find 8–15% mass with no load-path compromise. Cycle time falls with the square of wall on cooling-limited parts.',
      risk: 'Medium', timeframe: 'Long Term',
    });
  }

  // ═══ PROCESS ════════════════════════════════════════════════════════════════

  if (topOp && topOpShare > 0.5 && opCount >= 2 && convTotal / tot > 0.2) {
    out.push({
      category: 'process', lever: 'supplier',
      title: `Attack the Bottleneck: "${topOp.name}"`,
      description: `One operation — ${topOp.name} — carries ${(topOpShare * 100).toFixed(0)}% of the conversion cost. Improving anything else first is working on the wrong problem.`,
      expectedSavingPct: Math.min(8, topOpShare * (procPct + labPct) * 0.2),
      technicalJustification: 'Focused cycle-time engineering on the governing operation (feeds/speeds, tooling upgrade, cooling optimisation, SMED on its changeover) moves the whole part cost; a 20% gain on the bottleneck is a realistic first-pass target.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (CAVITY_PROCESSES.includes(commodity) && ops.length > 0 && ops.every(o => (o.partsPerCycle ?? 1) <= 1) && (procPct + labPct) > 25) {
    out.push({
      category: 'process', lever: 'supplier',
      title: volumeAssumed
        ? 'Multi-Cavity Tooling — Confirm the Annual Volume First'
        : 'Multi-Cavity / Multi-Up Tooling',
      description: `Every cycle currently makes one part. A 2-cavity (or family) tool halves the machine and labour minutes per part against roughly 60–80% more tooling NRE.`
        + (volumeAssumed ? ' The volume in this cost is a tool assumption — confirm the real programme volume before committing cavity investment.' : ''),
      expectedSavingPct: Math.min(12, (procPct + labPct) * 0.3),
      technicalJustification: 'Cavitation is the standard volume lever in moulding and die casting: machine time per part scales with 1/cavities while the tool price scales far slower (~1.6–1.8× for 2 cavities). The tool already cost-ranks cavity options in the derivation trace.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (['machining', 'cast_and_machine'].includes(commodity) && labPct > 12 && avgOEE >= 0.75) {
    out.push({
      category: 'process', lever: 'supplier',
      title: 'Unmanned / Lights-Out Running',
      description: `Labour is ${labPct.toFixed(1)}% of cost on a machine-paced part with healthy OEE (${(avgOEE * 100).toFixed(0)}%) — the classic profile for bar-feed or pallet-pool unattended running.`,
      expectedSavingPct: Math.min(6, labPct * 0.3),
      technicalJustification: 'Bar feeders, pallet pools and probing let a stable machining process run a third shift with no operator. Suppliers typically pass through 30–50% of the attended-labour saving on committed volumes.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (maxManning >= 1 && labPct > 15 && !['wiring_harness', 'composites', 'biw_assembly'].includes(commodity) && ops.some(o => (o.manning ?? 0) >= 1 && o.cycleTimeHr > (o.labourTimeHr ?? 0) * 0.8)) {
    out.push({
      category: 'process', lever: 'supplier',
      title: 'Multi-Machine Manning',
      description: `Operations are manned at up to ${maxManning.toFixed(1)} operators per machine while the machine paces the cycle. One operator tending two machines is the textbook correction.`,
      expectedSavingPct: Math.min(5, labPct * 0.25),
      technicalJustification: 'Where the operator loads, starts and walks away, 1:2 or 1:3 manning halves or thirds the charged labour minutes. Requires cell layout and staggered cycles — a supplier kaizen, not an investment.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (ENERGY_INTENSE.includes(commodity) || hasOp(RX_HEAT)) {
    out.push({
      category: 'sustainability', lever: 'supplier',
      title: 'Energy Productivity Programme',
      description: 'This process is energy-intensive (melt, cure, oven or heat-treat content). Energy sits inside the machine rate and overhead — and it is the fastest-moving input cost of the decade.',
      expectedSavingPct: 3,
      technicalJustification: 'Melt/furnace scheduling to off-peak tariffs, regenerative burners, cure-recipe optimisation and compressed-air leak programmes typically cut process energy 10–20%, of which 2–4% of part cost reaches the piece price — and the carbon line falls with it.',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  // ═══ TOOLING ════════════════════════════════════════════════════════════════

  if (toolingNRE > 0 && toolPct > 10) {
    out.push({
      category: 'tooling', lever: 'sourcing',
      title: 'Tooling Ownership and End-of-Life Terms',
      description: `£${toolingNRE.toLocaleString()} of tooling sits behind this part. Who owns it, who maintains it, and what happens at end of programme are worth points of piece price — and all of it is negotiable before the tool is cut.`,
      expectedSavingPct: Math.min(4, toolPct * 0.2),
      technicalJustification: 'A separate tooling PO with customer ownership prevents the tool being re-amortised inside future piece prices, secures the asset for resourcing leverage, and makes tool maintenance an explicit (auditable) line instead of a hidden uplift.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (amortVol > 0 && amortVol < 25000 && toolPct > 25) {
    out.push({
      category: 'tooling', lever: 'supplier',
      title: 'Soft / Bridge Tooling for This Volume',
      description: `Tooling is ${toolPct.toFixed(1)}% of part cost over only ${amortVol.toLocaleString()} parts. Below ~25k parts, aluminium tools, printed inserts or master-frame systems beat hard steel tooling.`,
      expectedSavingPct: Math.min(8, toolPct * 0.3),
      technicalJustification: 'Aluminium production tools cost 40–60% of P20 steel and comfortably survive 10–100k shots in polyolefins; modular master frames share the base across a family. The right answer flips back to steel only when volume grows.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (['casting', 'forging', 'sheet_metal', 'sheet_metal_fab'].includes(commodity) && toolPct > 15) {
    out.push({
      category: 'tooling', lever: 'supplier',
      title: 'Tool-Life Extension Programme',
      description: `Tooling at ${toolPct.toFixed(1)}% of part cost means every extra thousand shots of die life is money. Surface treatment and disciplined maintenance are the cheapest capacity there is.`,
      expectedSavingPct: Math.min(4, toolPct * 0.15),
      technicalJustification: 'Nitriding/PVD on wear surfaces, weld-repair schedules and hot-die lubrication programmes extend die life 30–100% in HPDC and forging practice — directly diluting the NRE per part.',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  // ═══ PACKAGING & LOGISTICS ══════════════════════════════════════════════════

  if (pkgPct > 4) {
    out.push({
      category: 'logistics', lever: pkgLogEstimated ? 'assumption' : 'sourcing',
      title: pkgLogEstimated ? 'Packaging Cost — Confirm, Then Make It Returnable' : 'Returnable Packaging Loop',
      description: `Packaging is ${pkgPct.toFixed(1)}% of part cost.`
        + (pkgLogEstimated
          ? ' This figure is tool-estimated from size and weight — confirm the quoted packaging spec first, then evaluate a returnable loop.'
          : ' A returnable tote/dunnage loop typically pays back inside a year against expendable packaging at this share.'),
      expectedSavingPct: Math.min(4, pkgPct * 0.5),
      technicalJustification: 'Returnables convert a per-part consumable into an amortised asset: typical automotive experience is 40–70% packaging cost reduction on stable volume routes, plus damage-rate and waste-stream benefits.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if ((pkgPct + logPct) > 8) {
    out.push({
      category: 'logistics', lever: pkgLogEstimated ? 'assumption' : 'sourcing',
      title: 'Pack Density / Cube Utilisation Review',
      description: `Packaging plus logistics is ${(pkgPct + logPct).toFixed(1)}% of part cost. Freight is bought by the cubic metre — parts that nest, stack or ship in denser dunnage cut it directly.`,
      expectedSavingPct: Math.min(4, (pkgPct + logPct) * 0.3),
      technicalJustification: 'Nesting orientation studies and custom dunnage regularly lift parts-per-container 20–50%. On intercontinental routes this is often worth more than any process improvement on the part.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (logPct > 6 && !alreadyLowCost) {
    out.push({
      category: 'logistics', lever: pkgLogEstimated ? 'assumption' : 'sourcing',
      title: 'Freight Mode and Consolidation Review',
      description: `Logistics is ${logPct.toFixed(1)}% of part cost. Mode (sea vs air), consolidation (milk runs, full containers) and incoterm are all buyer-controlled levers.`,
      expectedSavingPct: Math.min(5, logPct * 0.5),
      technicalJustification: 'Air-to-sea conversion cuts freight 70–85% where lead time allows; consolidated FCL versus LCL saves 20–40%. The landed-cost module prices these scenarios per country on request.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (alreadyLowCost && logPct > 9) {
    out.push({
      category: 'logistics', lever: 'sourcing',
      title: 'Total Landed Cost — Near-Shore Check',
      description: `This part is costed in a low-cost region but logistics is ${logPct.toFixed(1)}% of its cost. At that freight share, a nearer supplier at a higher piece price can win on landed cost — the 20-country comparison quantifies it.`,
      expectedSavingPct: Math.min(6, logPct * 0.5),
      technicalJustification: 'Freight, duty, inventory-in-transit and expedite risk offset ex-works savings on heavy or bulky parts. Run the regional comparison on landed (not ex-works) cost before renewing the source.',
      risk: 'Medium', timeframe: 'Long Term',
    });
  }

  // ═══ QUALITY ════════════════════════════════════════════════════════════════

  const inspShare = opShareOfTotal(RX_INSPECT);
  if (hasOp(RX_INSPECT) && inspShare > 0.05) {
    out.push({
      category: 'quality', lever: 'supplier',
      title: 'Right-Size Inspection and Test',
      description: `Inspection/test operations carry ${(inspShare * 100).toFixed(1)}% of part cost as separate steps. Capable processes earn reduced inspection — that is what capability data is for.`,
      expectedSavingPct: Math.min(4, inspShare * 100 * 0.6),
      technicalJustification: 'SPC-based skip-lot inspection, in-line gauging on the machine, and poka-yoke at the source typically cut standalone inspection cost 40–70% once Cpk ≥ 1.33 is demonstrated — without raising escape risk.',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  const reworkShare = opShareOfTotal(RX_REWORK);
  if (hasOp(RX_REWORK) && reworkShare > 0.02) {
    out.push({
      category: 'quality', lever: 'supplier',
      title: 'Eliminate Manual Finishing at Source',
      description: `Deburring/fettling/rework operations carry ${(reworkShare * 100).toFixed(1)}% of part cost. Manual finishing is a symptom — the cause is upstream (tool wear, gating, die condition) and cheaper to fix there.`,
      expectedSavingPct: Math.min(4, 1 + reworkShare * 100 * 0.5),
      technicalJustification: 'Sharp tooling discipline, gate/overflow redesign and die maintenance remove the burr instead of removing it by hand. Where finishing must remain, tumbling/vibratory processes beat manual labour 3:1.',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  // ═══ COMMERCIAL & STRATEGY ══════════════════════════════════════════════════

  if (mgnPct > 10) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Payment Terms / Early-Settlement Discount',
      description: `A supplier pricing ${mgnPct.toFixed(1)}% margin values cash. Early settlement (e.g. 14 days vs 60) is routinely worth 1–2% off the piece price and costs the buyer only working capital.`,
      expectedSavingPct: 2,
      technicalJustification: 'Standard dynamic-discounting maths: 2%/46 days ≈ 16% annualised — attractive to any supplier financing at SME rates. A pure win where the buyer’s cost of capital is lower than the supplier’s.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (oheadPct > 18 && (procPct + labPct) > 35) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Make-vs-Buy Assessment',
      description: `Overhead at ${oheadPct.toFixed(1)}% on top of ${(procPct + labPct).toFixed(1)}% conversion means a large share of this price is another factory's burden. If volumes justify a cell, in-housing removes overhead and margin together.`,
      expectedSavingPct: Math.min(6, oheadPct * 0.2),
      technicalJustification: 'Make-vs-buy on this should-cost basis: in-house cost = material + conversion at own rates + own burden. Parts with high supplier burden and mature process technology are the standard insourcing candidates.',
      risk: 'High', timeframe: 'Long Term',
    });
  }

  if (!input.learningCurve?.enabled && labPct > 20 && ctx?.volumeProvided === true) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Learning-Curve Price-Down Agreement',
      description: `Labour is ${labPct.toFixed(1)}% of cost and no learning curve is priced in. On a multi-year programme, labour productivity improves whether or not the contract captures it — the contract should.`,
      expectedSavingPct: 3,
      technicalJustification: 'Wright’s-law experience curves (85–95% typical in assembly-heavy work) imply 5–15% labour-cost reduction per volume doubling. An agreed annual price-down of 2–3% simply shares an improvement that will happen anyway.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  return out;
}
