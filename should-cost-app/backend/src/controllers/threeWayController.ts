import { Request, Response } from 'express';
import pool from '../db/pool';

// Category display order and labels
const CATEGORY_ORDER = ['RAW_MATERIAL', 'BOP', 'MANUFACTURING', 'OVERHEAD', 'LOGISTICS', 'TOOLING', 'PROFIT', 'UNCATEGORIZED'];
const CATEGORY_LABEL: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material',
  BOP: 'Bought-Out Parts',
  MANUFACTURING: 'Manufacturing',
  OVERHEAD: 'Overhead & SGA',
  LOGISTICS: 'Logistics',
  TOOLING: 'Tooling',
  PROFIT: 'Profit & Margin',
  material: 'Raw Material',
  labor: 'Manufacturing',
  overhead: 'Overhead & SGA',
  logistics: 'Logistics',
  profit: 'Profit & Margin',
  tooling: 'Tooling',
  UNCATEGORIZED: 'Other',
};

function normalizeCategory(cat: string | null): string {
  if (!cat) return 'UNCATEGORIZED';
  const map: Record<string, string> = {
    material: 'RAW_MATERIAL',
    labor: 'MANUFACTURING',
    overhead: 'OVERHEAD',
    logistics: 'LOGISTICS',
    profit: 'PROFIT',
    tooling: 'TOOLING',
  };
  return map[cat.toLowerCase()] ?? cat.toUpperCase();
}

interface ElementData {
  category: string;
  sc: number;
  cp: number;
  quotes: Map<string, number>;
}

// Category-specific negotiation guidance used by the AI brief
const CATEGORY_ACTION: Record<string, string> = {
  RAW_MATERIAL:  'Validate material grade, net weight and scrap recovery rate. Request mill certificates and index the price to LME/commodity rates with a quarterly adjustment clause.',
  BOP:           'Request sub-supplier quotes and open-book costing for purchased parts. Consider directed-buy or leveraging group volume agreements for these components.',
  MANUFACTURING: 'Challenge cycle times, machine hour rates and OEE assumptions against the should-cost model. Ask the supplier to walk through their process routing line by line.',
  OVERHEAD:      'Benchmark factory overhead and SG&A markup — best-in-class suppliers run SG&A at 6–8% of cost. Ask for the overhead allocation basis.',
  LOGISTICS:     'Re-tender freight separately, review packaging spec (returnable vs expendable), and check Incoterms — consider ex-works pricing with your own freight contract.',
  TOOLING:       'Verify tooling amortisation: remaining volume × rate should equal unamortised balance. If tooling is already paid off, this line should drop to zero.',
  PROFIT:        'Profit above 8% of total cost is a direct negotiation lever — trade margin for volume commitment or longer contract duration.',
};

function buildAnalysis(
  elementMap: Map<string, ElementData>,
  totalSC: number,
  totalCP: number,
  supplierTotals: { name: string; total: number }[],
  annualVolume: number,
) {
  const bestTotalEntry = supplierTotals.sort((a, b) => a.total - b.total)[0];
  const bestTotal = bestTotalEntry?.total ?? 0;

  // Top cost drivers by SC value
  const topCostDrivers = [...elementMap.entries()]
    .filter(([, d]) => d.sc > 0)
    .sort((a, b) => b[1].sc - a[1].sc)
    .slice(0, 5)
    .map(([el, d]) => ({
      cost_element: el,
      category: CATEGORY_LABEL[d.category] ?? d.category,
      sc_value: +d.sc.toFixed(4),
      pct_of_total: totalSC > 0 ? +((d.sc / totalSC) * 100).toFixed(1) : 0,
    }));

  // Biggest overpayments: current price >> should-cost
  const biggestOverpayments = [...elementMap.entries()]
    .filter(([, d]) => d.cp > d.sc && d.sc > 0)
    .map(([el, d]) => ({
      cost_element: el,
      category: CATEGORY_LABEL[d.category] ?? d.category,
      sc_value: +d.sc.toFixed(4),
      cp_value: +d.cp.toFixed(4),
      delta: +(d.cp - d.sc).toFixed(4),
      pct: +((d.cp - d.sc) / d.sc * 100).toFixed(1),
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  // Savings opportunities vs current price
  const savingsOpportunities = [...elementMap.entries()]
    .filter(([, d]) => d.quotes.size > 0 && d.cp > 0)
    .map(([el, d]) => {
      const sorted = [...d.quotes.entries()].sort((a, b) => a[1] - b[1]);
      const [bestSupName, bestVal] = sorted[0];
      return {
        cost_element: el,
        category: CATEGORY_LABEL[d.category] ?? d.category,
        best_supplier: bestSupName,
        current_value: +d.cp.toFixed(4),
        best_value: +bestVal.toFixed(4),
        savings: +(d.cp - bestVal).toFixed(4),
        savings_pct: +((d.cp - bestVal) / d.cp * 100).toFixed(1),
      };
    })
    .filter(r => r.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 5);

  // Category breakdown
  const catMap: Record<string, { sc: number; cp: number; best_quote: number }> = {};
  for (const [, d] of elementMap) {
    const cat = normalizeCategory(d.category);
    if (!catMap[cat]) catMap[cat] = { sc: 0, cp: 0, best_quote: 0 };
    catMap[cat].sc += d.sc;
    catMap[cat].cp += d.cp;
    if (d.quotes.size > 0) {
      catMap[cat].best_quote += Math.min(...d.quotes.values());
    }
  }

  const categoryBreakdown = CATEGORY_ORDER
    .filter(cat => catMap[cat])
    .map(cat => ({
      category: cat,
      label: CATEGORY_LABEL[cat] ?? cat,
      sc: +catMap[cat].sc.toFixed(2),
      cp: +catMap[cat].cp.toFixed(2),
      best_quote: +catMap[cat].best_quote.toFixed(2),
      sc_pct: totalSC > 0 ? +((catMap[cat].sc / totalSC) * 100).toFixed(1) : 0,
      cp_pct: totalCP > 0 ? +((catMap[cat].cp / totalCP) * 100).toFixed(1) : 0,
    }));

  // ── AI Negotiation Brief ─────────────────────────────────────
  // Level 1: which summary category drives the gap vs should-cost.
  // Level 2: the detail elements inside that category causing it,
  // each with a ready-to-use talking point and annual impact.
  const negotiationBrief = CATEGORY_ORDER
    .filter(cat => catMap[cat] && catMap[cat].cp > 0 && catMap[cat].sc > 0)
    .map(cat => {
      const c = catMap[cat];
      const gap = c.cp - c.sc;
      const gapPct = c.sc > 0 ? (gap / c.sc) * 100 : 0;
      const bestQ = c.best_quote > 0 ? c.best_quote : null;

      const detailPoints = [...elementMap.entries()]
        .filter(([, d]) => normalizeCategory(d.category) === cat && d.cp - d.sc > 0.005)
        .sort((a, b) => (b[1].cp - b[1].sc) - (a[1].cp - a[1].sc))
        .slice(0, 4)
        .map(([el, d]) => {
          const eGap = d.cp - d.sc;
          const eGapPct = d.sc > 0 ? (eGap / d.sc) * 100 : 0;
          const minQuote = d.quotes.size > 0 ? Math.min(...d.quotes.values()) : null;
          const quoteEvidence = minQuote !== null && minQuote < d.cp
            ? ` Market evidence: best new quote is £${minQuote.toFixed(2)} for this line.`
            : '';
          return {
            cost_element: el,
            sc: +d.sc.toFixed(4),
            cp: +d.cp.toFixed(4),
            gap: +eGap.toFixed(4),
            gap_pct: +eGapPct.toFixed(1),
            best_quote: minQuote !== null ? +minQuote.toFixed(4) : null,
            annual_impact: annualVolume > 0 ? +(eGap * annualVolume).toFixed(0) : null,
            talking_point:
              `"${el}": you pay £${d.cp.toFixed(2)} vs should-cost £${d.sc.toFixed(2)} ` +
              `(+${eGapPct.toFixed(0)}%).${quoteEvidence}`,
          };
        });

      return {
        category: cat,
        label: CATEGORY_LABEL[cat] ?? cat,
        sc: +c.sc.toFixed(2),
        cp: +c.cp.toFixed(2),
        best_quote: bestQ !== null ? +bestQ.toFixed(2) : null,
        gap: +gap.toFixed(2),
        gap_pct: +gapPct.toFixed(1),
        annual_impact: annualVolume > 0 ? +(gap * annualVolume).toFixed(0) : null,
        priority: gapPct > 25 ? 'high' : gapPct > 12 ? 'medium' : 'low',
        action: CATEGORY_ACTION[cat] ?? 'Review this cost block with the supplier.',
        detail_points: detailPoints,
      };
    })
    .filter(b => b.gap > 0.01)
    .sort((a, b) => b.gap - a.gap);

  const totalNegotiationValue = negotiationBrief.reduce((s, b) => s + b.gap, 0);

  // Risk flags
  const riskFlags: { element: string; reason: string; severity: 'high' | 'medium' | 'low' }[] = [];
  for (const [el, d] of elementMap) {
    if (d.sc > 0 && d.cp > 0) {
      const pct = (d.cp - d.sc) / d.sc * 100;
      if (pct > 30) riskFlags.push({ element: el, reason: `Current price ${pct.toFixed(1)}% above should-cost`, severity: 'high' });
      else if (pct > 15) riskFlags.push({ element: el, reason: `Current price ${pct.toFixed(1)}% above should-cost`, severity: 'medium' });
    }
    if (d.quotes.size > 0) {
      const minQ = Math.min(...d.quotes.values());
      if (d.sc > 0 && minQ > d.sc * 1.2) {
        riskFlags.push({ element: el, reason: `All supplier quotes >20% above should-cost`, severity: 'medium' });
      }
    }
  }

  // Recommendations
  const cpVsScPct = totalSC > 0 ? (totalCP - totalSC) / totalSC * 100 : 0;
  const bestVsCpPct = totalCP > 0 ? (bestTotal - totalCP) / totalCP * 100 : 0;
  const recommendations: string[] = [];

  if (cpVsScPct > 20) {
    recommendations.push(`Current pricing is ${cpVsScPct.toFixed(1)}% above should-cost model — strong case for immediate renegotiation or supplier switch.`);
  } else if (cpVsScPct > 10) {
    recommendations.push(`Current pricing is ${cpVsScPct.toFixed(1)}% above should-cost — schedule a structured negotiation with the incumbent.`);
  } else if (cpVsScPct < 0) {
    recommendations.push(`Current pricing is ${Math.abs(cpVsScPct).toFixed(1)}% below should-cost — validate should-cost model assumptions.`);
  }

  if (biggestOverpayments[0]) {
    const t = biggestOverpayments[0];
    recommendations.push(`"${t.cost_element}" (${t.category}) is the largest unit overpayment at +${t.pct}% vs should-cost ($${t.delta.toFixed(2)}). Target this element first in negotiations.`);
  }

  const totalSavings = savingsOpportunities.reduce((s, r) => s + r.savings, 0);
  if (totalSavings > 0 && bestTotalEntry) {
    recommendations.push(`Switching to ${bestTotalEntry.name} for the best-quoted elements could yield up to $${totalSavings.toFixed(2)}/unit in savings vs current price.`);
  }

  const highRaw = catMap['RAW_MATERIAL'];
  if (highRaw && totalSC > 0 && highRaw.sc / totalSC > 0.35) {
    recommendations.push(`Raw materials represent ${(highRaw.sc / totalSC * 100).toFixed(0)}% of should-cost — consider commodity hedging or material substitution.`);
  }

  const highMfg = catMap['MANUFACTURING'];
  if (highMfg && totalCP > 0 && highMfg.cp / totalCP > 0.30) {
    recommendations.push(`Manufacturing costs are ${(highMfg.cp / totalCP * 100).toFixed(0)}% of current price — review process efficiency and tooling amortisation.`);
  }

  return {
    totals: {
      sc: +totalSC.toFixed(2),
      cp: +totalCP.toFixed(2),
      best_quote: +bestTotal.toFixed(2),
      cp_vs_sc: {
        delta: +(totalCP - totalSC).toFixed(2),
        pct: +cpVsScPct.toFixed(1),
      },
      best_vs_sc: {
        delta: +(bestTotal - totalSC).toFixed(2),
        pct: totalSC > 0 ? +((bestTotal - totalSC) / totalSC * 100).toFixed(1) : 0,
      },
      best_vs_cp: {
        delta: +(bestTotal - totalCP).toFixed(2),
        pct: +bestVsCpPct.toFixed(1),
      },
    },
    topCostDrivers,
    biggestOverpayments,
    savingsOpportunities,
    categoryBreakdown,
    negotiationBrief,
    negotiationSummary: {
      annual_volume: annualVolume,
      total_gap_per_unit: +totalNegotiationValue.toFixed(2),
      total_annual_opportunity: annualVolume > 0 ? +(totalNegotiationValue * annualVolume).toFixed(0) : null,
      headline: totalNegotiationValue > 0
        ? `Closing the gap to should-cost is worth £${totalNegotiationValue.toFixed(2)}/part` +
          (annualVolume > 0 ? ` — £${Math.round(totalNegotiationValue * annualVolume).toLocaleString('en-GB')} per year at ${annualVolume.toLocaleString('en-GB')} units.` : '.')
        : 'Current pricing is at or below the should-cost model.',
    },
    riskFlags: riskFlags.slice(0, 8),
    recommendations,
  };
}

// GET /api/three-way/compare/:partId
export async function getThreeWayComparison(req: Request, res: Response) {
  const partId = Number(req.params.partId);
  if (isNaN(partId)) return res.status(400).json({ error: 'Invalid partId' });

  try {
    // Part info
    const { rows: partRows } = await pool.query(
      `SELECT pm.id, pm.part_number, pm.description, pm.commodity,
              vp.id AS program_id, vp.code AS program_code, vp.name AS program_name,
              vs.name AS system_name
       FROM   part_master pm
       LEFT JOIN vehicle_program  vp ON vp.id = pm.program_id
       LEFT JOIN vehicle_component vc ON vc.id = pm.component_id
       LEFT JOIN vehicle_subsystem vss ON vss.id = pm.subsystem_id
       LEFT JOIN vehicle_system    vs  ON vs.id  = pm.system_id
       WHERE  pm.id = $1`,
      [partId],
    );
    if (!partRows.length) return res.status(404).json({ error: 'Part not found' });
    const part = partRows[0];

    // Latest published SC
    const { rows: scHdrRows } = await pool.query(
      `SELECT DISTINCT ON (part_id) id, version, total_cost, currency, status, notes, annual_volume, created_at
       FROM   should_cost_header
       WHERE  part_id = $1 AND status = 'published'
       ORDER  BY part_id, version DESC`,
      [partId],
    );
    const scHdr = scHdrRows[0] ?? null;

    const scElements = scHdr ? (await pool.query(
      `SELECT cost_element, category, value, basis, sort_order
       FROM   should_cost_breakdown
       WHERE  should_cost_header_id = $1
       ORDER  BY sort_order, id`,
      [scHdr.id],
    )).rows : [];

    // Latest current price
    const { rows: cpHdrRows } = await pool.query(
      `SELECT DISTINCT ON (part_id) id, version, total_cost, currency, supplier_name, effective_date, notes, created_at
       FROM   current_price_header
       WHERE  part_id = $1
       ORDER  BY part_id, version DESC`,
      [partId],
    );
    const cpHdr = cpHdrRows[0] ?? null;

    const cpElements = cpHdr ? (await pool.query(
      `SELECT cost_element, category, value, basis, sort_order
       FROM   current_price_breakdown
       WHERE  current_price_header_id = $1
       ORDER  BY sort_order, id`,
      [cpHdr.id],
    )).rows : [];

    // Latest quotes per supplier
    const { rows: quoteHdrs } = await pool.query(
      `SELECT DISTINCT ON (sqh.supplier_id)
              sqh.id, sqh.supplier_id, s.name AS supplier_name,
              sqh.version, sqh.total_price, sqh.currency, sqh.submitted_at
       FROM   supplier_quote_header sqh
       JOIN   supplier s ON s.id = sqh.supplier_id
       WHERE  sqh.part_id = $1
       ORDER  BY sqh.supplier_id, sqh.version DESC`,
      [partId],
    );

    const supplierQuotes = await Promise.all(
      quoteHdrs.map(async (qh) => {
        const { rows: elems } = await pool.query(
          `SELECT cost_element, category, value, basis, sort_order
           FROM   supplier_quote_breakdown
           WHERE  supplier_quote_header_id = $1
           ORDER  BY sort_order, id`,
          [qh.id],
        );
        return { ...qh, elements: elems };
      }),
    );

    // Build unified element map
    const elementMap = new Map<string, ElementData>();

    for (const el of scElements) {
      const cat = normalizeCategory(el.category);
      elementMap.set(el.cost_element, { category: cat, sc: Number(el.value), cp: 0, quotes: new Map() });
    }

    for (const el of cpElements) {
      const cat = normalizeCategory(el.category);
      const existing = elementMap.get(el.cost_element);
      if (existing) {
        existing.cp = Number(el.value);
      } else {
        elementMap.set(el.cost_element, { category: cat, sc: 0, cp: Number(el.value), quotes: new Map() });
      }
    }

    for (const quote of supplierQuotes) {
      for (const el of quote.elements) {
        const cat = normalizeCategory(el.category);
        const existing = elementMap.get(el.cost_element);
        if (existing) {
          existing.quotes.set(quote.supplier_name, Number(el.value));
        } else {
          const m = new Map<string, number>();
          m.set(quote.supplier_name, Number(el.value));
          elementMap.set(el.cost_element, { category: cat, sc: 0, cp: 0, quotes: m });
        }
      }
    }

    // Sort elements: by sort_order from SC first, then CP, then alphabetically
    const scOrder = new Map(scElements.map((e, i) => [e.cost_element, e.sort_order ?? i]));
    const sortedElements = [...elementMap.entries()].sort((a, b) => {
      const oa = scOrder.get(a[0]) ?? 9999;
      const ob = scOrder.get(b[0]) ?? 9999;
      return oa !== ob ? oa - ob : a[0].localeCompare(b[0]);
    });

    // Build comparison rows
    const rows = sortedElements.map(([element, data]) => {
      const cpVsScDelta = data.cp - data.sc;
      const cpVsScPct   = data.sc > 0 ? (cpVsScDelta / data.sc) * 100 : 0;

      const quoteDetails = [...data.quotes.entries()].map(([supName, val]) => ({
        supplier_name: supName,
        value: +val.toFixed(4),
        vs_sc: {
          delta: +(val - data.sc).toFixed(4),
          pct: data.sc > 0 ? +((val - data.sc) / data.sc * 100).toFixed(1) : 0,
        },
        vs_cp: {
          delta: +(val - data.cp).toFixed(4),
          pct: data.cp > 0 ? +((val - data.cp) / data.cp * 100).toFixed(1) : 0,
        },
      }));

      const bestQuoteEntry = quoteDetails.sort((a, b) => a.value - b.value)[0];

      return {
        cost_element: element,
        category: data.category,
        category_label: CATEGORY_LABEL[data.category] ?? data.category,
        sc_value: +data.sc.toFixed(4),
        cp_value: +data.cp.toFixed(4),
        cp_vs_sc: {
          delta: +cpVsScDelta.toFixed(4),
          pct: +cpVsScPct.toFixed(1),
        },
        quotes: quoteDetails,
        best_quote_value: bestQuoteEntry?.value ?? 0,
        best_supplier: bestQuoteEntry?.supplier_name ?? '',
      };
    });

    // Totals
    const totalSC = scHdr ? Number(scHdr.total_cost) : scElements.reduce((s, e) => s + Number(e.value), 0);
    const totalCP = cpHdr ? Number(cpHdr.total_cost) : cpElements.reduce((s, e) => s + Number(e.value), 0);
    const supplierTotals = quoteHdrs.map(q => ({ name: q.supplier_name, total: Number(q.total_price) }));

    const annualVolume = scHdr?.annual_volume ? Number(scHdr.annual_volume) : 0;
    const analysis = buildAnalysis(elementMap, totalSC, totalCP, supplierTotals, annualVolume);

    res.json({
      part: {
        id: part.id,
        part_number: part.part_number,
        description: part.description,
        commodity: part.commodity,
        system_name: part.system_name,
        program: part.program_id
          ? { id: part.program_id, code: part.program_code, name: part.program_name }
          : null,
      },
      shouldCost: scHdr
        ? { ...scHdr, total: Number(scHdr.total_cost), elements: scElements }
        : null,
      currentPrice: cpHdr
        ? { ...cpHdr, total: Number(cpHdr.total_cost), elements: cpElements }
        : null,
      supplierQuotes,
      rows,
      analysis,
    });
  } catch (err) {
    console.error('getThreeWayComparison', err);
    res.status(500).json({ error: 'Failed to build three-way comparison' });
  }
}

// GET /api/three-way/parts  — list parts that have at least SC or CP data
export async function listPartsForThreeWay(req: Request, res: Response) {
  const { programId, search } = req.query;
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (programId) {
      params.push(programId);
      conditions.push(`pm.program_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(pm.part_number ILIKE $${params.length} OR pm.description ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT pm.id, pm.part_number, pm.description, pm.commodity,
              vp.code AS program_code, vp.name AS program_name,
              vs.name AS system_name,
              (SELECT COUNT(*) > 0 FROM should_cost_header    WHERE part_id = pm.id AND status = 'published') AS has_sc,
              (SELECT COUNT(*) > 0 FROM current_price_header  WHERE part_id = pm.id)                          AS has_cp,
              (SELECT COUNT(*)     FROM supplier_quote_header WHERE part_id = pm.id)                           AS quote_count
       FROM   part_master pm
       LEFT JOIN vehicle_program  vp  ON vp.id  = pm.program_id
       LEFT JOIN vehicle_component vc  ON vc.id  = pm.component_id
       LEFT JOIN vehicle_subsystem vss ON vss.id = pm.subsystem_id
       LEFT JOIN vehicle_system    vs  ON vs.id  = pm.system_id
       ${where}
       ORDER BY pm.part_number
       LIMIT 200`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error('listPartsForThreeWay', err);
    res.status(500).json({ error: 'Failed to list parts' });
  }
}
