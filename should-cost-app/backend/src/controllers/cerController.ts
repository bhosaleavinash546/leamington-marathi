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

  // 5. Claude AI insights
  let insights: string | null = null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const prompt = `You are a cost engineering expert. Here is a parametric should-cost estimate:
- Process: ${process_type} in ${country}
- Part weight: ${part_weight_kg} kg, Material: ${material_name}
- Cycle time: ${cycle_time_sec} s, Annual volume: ${annual_volume.toLocaleString()} units
- Labour rate: $${Number(rate.labour_rate_hr)}/hr, Machine rate: $${Number(rate.machine_rate_hr)}/hr
- Overhead: ${Number(rate.overhead_pct)}%, Scrap: ${Number(rate.scrap_rate_pct)}%
- Total should-cost: $${total.toFixed(4)} per unit
- Breakdown: Material $${material_cost.toFixed(4)}, Labour $${direct_labour.toFixed(4)}, Machine $${machine_cost.toFixed(4)}, Overhead $${overhead.toFixed(4)}, Scrap $${scrap_allowance.toFixed(4)}, Tooling $${tooling_per_unit.toFixed(4)}, Packaging $${packaging.toFixed(4)}
${notes ? `- Notes: ${notes}` : ''}

Provide 2-3 concise sentences of key cost engineering observations about this estimate. Focus on the dominant cost driver, whether the country/process combination is cost-competitive, and any risk factors.`;

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
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
