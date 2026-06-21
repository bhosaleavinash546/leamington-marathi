import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/pool';

interface CerRequestBody {
  process_type: string;
  country: string;
  part_weight_kg: number;
  material_name: string;
  cycle_time_sec: number;
  annual_volume: number;
  tooling_cost_total?: number;
  tooling_life_units?: number;
  notes?: string;
}

interface BreakdownLine {
  cost_element: string;
  category: 'material' | 'labour' | 'overhead' | 'tooling' | 'other';
  value: number;
  basis: string;
}

interface RateRow {
  labour_rate_hr: number;
  machine_rate_hr: number;
  overhead_pct: number;
  scrap_rate_pct: number;
}

interface CommodityPriceRow {
  id: number;
  material_name: string;
  price_per_unit: number;
  unit: string;
  currency: string;
  price_date: string;
}

// POST /api/cer/estimate
export async function estimateShouldCost(req: Request, res: Response): Promise<void> {
  const body = req.body as CerRequestBody;

  const {
    process_type,
    country,
    part_weight_kg,
    material_name,
    cycle_time_sec,
    annual_volume,
    tooling_cost_total,
    tooling_life_units,
    notes,
  } = body;

  if (!process_type || !country || part_weight_kg == null || !material_name || cycle_time_sec == null || annual_volume == null) {
    res.status(400).json({
      error: 'process_type, country, part_weight_kg, material_name, cycle_time_sec and annual_volume are required',
    });
    return;
  }

  // 1. Look up rate_reference
  const rateRes = await pool.query<RateRow>(
    'SELECT labour_rate_hr, machine_rate_hr, overhead_pct, scrap_rate_pct FROM rate_reference WHERE process_type = $1 AND country = $2',
    [process_type, country]
  );

  if (!rateRes.rowCount) {
    res.status(404).json({ error: `No rate found for process_type '${process_type}' in country '${country}'` });
    return;
  }

  const rate = rateRes.rows[0];

  // 2. Look up commodity_price (latest by price_date, LIKE match on material_name)
  const commodityRes = await pool.query<CommodityPriceRow>(
    `SELECT id, material_name, price_per_unit, unit, currency, price_date::text
     FROM commodity_price
     WHERE material_name ILIKE $1
     ORDER BY price_date DESC
     LIMIT 1`,
    [`%${material_name}%`]
  );

  const commodityPrice = commodityRes.rows[0] ?? null;

  // 3. Calculations
  const pricePerUnit = commodityPrice ? Number(commodityPrice.price_per_unit) : 0;

  const material_cost = part_weight_kg * pricePerUnit * 1.05; // 5% buy-to-fly factor
  const direct_labour = (cycle_time_sec / 3600) * Number(rate.labour_rate_hr);
  const machine_cost  = (cycle_time_sec / 3600) * Number(rate.machine_rate_hr);
  const overhead      = (direct_labour + machine_cost) * (Number(rate.overhead_pct) / 100);
  const scrap_allowance = material_cost * (Number(rate.scrap_rate_pct) / 100);
  const tooling_per_unit =
    tooling_cost_total != null && tooling_life_units != null && tooling_life_units > 0
      ? tooling_cost_total / tooling_life_units
      : 0;
  const packaging = (material_cost + direct_labour + machine_cost) * 0.02;

  const total = material_cost + direct_labour + machine_cost + overhead + scrap_allowance + tooling_per_unit + packaging;

  const breakdown: BreakdownLine[] = [
    {
      cost_element: 'Material Cost',
      category: 'material',
      value: material_cost,
      basis: `${part_weight_kg} kg × ${pricePerUnit.toFixed(4)} ${commodityPrice?.unit ?? 'per kg'} × 1.05 buy-to-fly`,
    },
    {
      cost_element: 'Direct Labour',
      category: 'labour',
      value: direct_labour,
      basis: `(${cycle_time_sec}s ÷ 3600) × ${Number(rate.labour_rate_hr).toFixed(2)} labour $/hr`,
    },
    {
      cost_element: 'Machine Cost',
      category: 'labour',
      value: machine_cost,
      basis: `(${cycle_time_sec}s ÷ 3600) × ${Number(rate.machine_rate_hr).toFixed(2)} machine $/hr`,
    },
    {
      cost_element: 'Overhead',
      category: 'overhead',
      value: overhead,
      basis: `(Labour + Machine) × ${Number(rate.overhead_pct)}% overhead`,
    },
    {
      cost_element: 'Scrap Allowance',
      category: 'material',
      value: scrap_allowance,
      basis: `Material cost × ${Number(rate.scrap_rate_pct)}% scrap rate`,
    },
    {
      cost_element: 'Tooling Amortisation',
      category: 'tooling',
      value: tooling_per_unit,
      basis: tooling_per_unit > 0
        ? `${tooling_cost_total} ÷ ${tooling_life_units} units`
        : 'No tooling data provided',
    },
    {
      cost_element: 'Packaging & Logistics',
      category: 'other',
      value: packaging,
      basis: '2% of material + labour + machine cost',
    },
  ];

  // 5. Benchmark data for enhanced AI insights
  const benchmarkRes = await pool.query(
    `SELECT country, labour_rate_hr, machine_rate_hr, overhead_pct, scrap_rate_pct
     FROM rate_reference WHERE process_type = $1 ORDER BY labour_rate_hr`,
    [process_type]
  );
  const benchmarks = benchmarkRes.rows;

  // Heuristic cycle time range for this weight class and process
  const ctHeuristics: Array<[string, number, number, number, number]> = [
    ['Stamping',                0,    0.5,   8,  20],
    ['Stamping',                0.5,  2,    18,  40],
    ['Stamping',                2,    10,   35,  90],
    ['Die Casting (Aluminium)', 0,    0.5,  25,  45],
    ['Die Casting (Aluminium)', 0.5,  2,    35,  70],
    ['Die Casting (Aluminium)', 2,    10,   60, 150],
    ['Machining (3-axis CNC)',  0,    0.5,  30,  90],
    ['Machining (3-axis CNC)',  0.5,  2,    60, 200],
    ['Machining (3-axis CNC)',  2,    10,  120, 480],
    ['Machining (5-axis CNC)',  0,    0.5,  45, 120],
    ['Machining (5-axis CNC)',  0.5,  2,    90, 300],
    ['Machining (5-axis CNC)',  2,    10,  180, 600],
    ['Injection Moulding',      0,    0.1,  15,  35],
    ['Injection Moulding',      0.1,  0.5,  25,  55],
    ['Injection Moulding',      0.5,  2,    40,  90],
    ['Forging',                 0,    1,    30,  70],
    ['Forging',                 1,    5,    50, 130],
    ['Forging',                 5,    20,  100, 250],
    ['Welding Assembly',        0,    1,    60, 180],
    ['Welding Assembly',        1,    5,   120, 360],
    ['Welding Assembly',        5,    20,  240, 720],
  ];
  const ctMatch = ctHeuristics.find(
    ([p, wMin, wMax]) => p === process_type && part_weight_kg >= wMin && part_weight_kg < wMax
  );
  const ctBenchmarkMin = ctMatch ? ctMatch[3] : null;
  const ctBenchmarkMax = ctMatch ? ctMatch[4] : null;

  // 6. Claude AI insights
  let insights: string | null = null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const labourMachinePct = total > 0 ? ((direct_labour + machine_cost) / total * 100).toFixed(1) : '0';
      const materialPct      = total > 0 ? (material_cost / total * 100).toFixed(1) : '0';

      const countryComparison = benchmarks
        .map((b) => `  ${b.country}: labour $${Number(b.labour_rate_hr).toFixed(0)}/hr, machine $${Number(b.machine_rate_hr).toFixed(0)}/hr`)
        .join('\n');

      const ctFlag = ctBenchmarkMin != null
        ? cycle_time_sec < ctBenchmarkMin
          ? `⚠️ Cycle time ${cycle_time_sec}s is BELOW benchmark range (${ctBenchmarkMin}–${ctBenchmarkMax}s) for ${process_type} at ${part_weight_kg}kg — verify this is achievable`
          : cycle_time_sec > ctBenchmarkMax!
          ? `⚠️ Cycle time ${cycle_time_sec}s is ABOVE benchmark range (${ctBenchmarkMin}–${ctBenchmarkMax}s) for ${process_type} at ${part_weight_kg}kg — challenge supplier or re-estimate`
          : `✅ Cycle time ${cycle_time_sec}s is within benchmark range (${ctBenchmarkMin}–${ctBenchmarkMax}s)`
        : '';

      const prompt = `You are a senior cost engineering expert with 20+ years in automotive manufacturing. Analyse this parametric should-cost estimate critically:

PART PARAMETERS:
- Process: ${process_type} | Country: ${country} | Weight: ${part_weight_kg} kg | Material: ${material_name}
- Cycle time: ${cycle_time_sec}s | Annual volume: ${annual_volume.toLocaleString()} units
${ctFlag}

COST BREAKDOWN:
- Material: $${material_cost.toFixed(4)} (${materialPct}% of total)${!commodityPrice ? ' ⚠️ NO COMMODITY PRICE FOUND — used $0, add price in Commodity Prices module' : ` — source price: $${pricePerUnit.toFixed(4)}/${commodityPrice.unit}`}
- Direct Labour: $${direct_labour.toFixed(4)} at $${Number(rate.labour_rate_hr)}/hr
- Machine Cost: $${machine_cost.toFixed(4)} at $${Number(rate.machine_rate_hr)}/hr
- Overhead: $${overhead.toFixed(4)} (${Number(rate.overhead_pct)}% of L+M)
- Scrap: $${scrap_allowance.toFixed(4)} (${Number(rate.scrap_rate_pct)}%)
- Tooling: $${tooling_per_unit.toFixed(4)}/unit${tooling_per_unit === 0 ? ' (not provided)' : ''}
- Packaging: $${packaging.toFixed(4)}
- **TOTAL: $${total.toFixed(4)}/unit** (Labour+Machine = ${labourMachinePct}% of total)

COUNTRY BENCHMARKS FOR ${process_type}:
${countryComparison}
${notes ? `\nENGINEER NOTES: ${notes}` : ''}

Provide exactly 3 bullet points (use • prefix), each a single direct sentence:
1. The dominant cost driver and whether the split looks right for this process/weight class
2. Whether the cycle time assumption is reasonable and what to challenge if not (reference the benchmark range if flagged above)
3. A specific negotiation insight: which country would be cheaper, by how much, and what the risk/quality trade-off is

Be specific with numbers. Do not be generic.`;

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = message.content.find((b) => b.type === 'text');
      insights = textBlock ? (textBlock as { type: 'text'; text: string }).text : null;
    } catch (err) {
      console.warn('[cerController] Anthropic call failed — returning insights as null:', err);
      insights = null;
    }
  }

  res.json({
    breakdown,
    total,
    rates_used: {
      labour_rate_hr: Number(rate.labour_rate_hr),
      machine_rate_hr: Number(rate.machine_rate_hr),
      overhead_pct: Number(rate.overhead_pct),
      scrap_rate_pct: Number(rate.scrap_rate_pct),
    },
    commodity_price_used: commodityPrice
      ? {
          id: commodityPrice.id,
          material_name: commodityPrice.material_name,
          price_per_unit: Number(commodityPrice.price_per_unit),
          unit: commodityPrice.unit,
          currency: commodityPrice.currency,
          price_date: commodityPrice.price_date,
        }
      : null,
    insights,
  });
}
