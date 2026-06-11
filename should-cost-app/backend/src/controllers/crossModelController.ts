import { Request, Response } from 'express';
import pool from '../db/pool';

const CAT_LABEL: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material',
  BOP: 'Bought-Out Parts',
  MANUFACTURING: 'Manufacturing / Process',
  OVERHEAD: 'Overhead',
  LOGISTICS: 'Logistics',
  TOOLING: 'Tooling',
  PROFIT: 'Profit',
};

interface Member {
  part_id: number;
  part_number: string;
  program_code: string;
  program_name: string;
  segment: string | null;
  model_year: number | null;
  annual_volume: number;
  should_cost: number;
  current_price: number;
  best_quote: number | null;
  categories: Record<string, number>;
}

// GET /api/cross-model/families — families with 2+ members
export async function listFamilies(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT family_code, MAX(family_name) AS family_name, COUNT(*)::int AS members
     FROM part_master
     WHERE family_code IS NOT NULL
     GROUP BY family_code
     HAVING COUNT(*) >= 2
     ORDER BY MAX(family_name)`
  );
  res.json(rows);
}

// GET /api/cross-model/family/:code — members + AI gap analysis
export async function getFamily(req: Request, res: Response): Promise<void> {
  const code = req.params.code;

  const memberRes = await pool.query(
    `SELECT pm.id AS part_id, pm.part_number,
            COALESCE(vp.code, '—') AS program_code,
            COALESCE(vp.name, 'Unassigned') AS program_name,
            vp.segment, vp.model_year
     FROM part_master pm
     LEFT JOIN vehicle_program vp ON vp.id = pm.program_id
     WHERE pm.family_code = $1
     ORDER BY vp.model_year, vp.code`,
    [code]
  );
  if (memberRes.rowCount === 0) {
    res.status(404).json({ error: 'Family not found' });
    return;
  }
  const partIds = memberRes.rows.map((m) => m.part_id);

  // Latest published should-cost per part (+ category breakdown)
  const scHdr = await pool.query(
    `SELECT DISTINCT ON (part_id) id, part_id, total_cost, annual_volume, currency
     FROM should_cost_header
     WHERE part_id = ANY($1) AND status = 'published'
     ORDER BY part_id, version DESC`,
    [partIds]
  );
  const scByPart = new Map<number, { id: number; total: number; volume: number }>();
  for (const h of scHdr.rows) scByPart.set(h.part_id, { id: h.id, total: Number(h.total_cost), volume: Number(h.annual_volume) || 0 });
  const scIds = scHdr.rows.map((h) => h.id);

  const catRes = scIds.length
    ? await pool.query(
        `SELECT h.part_id, b.category, SUM(b.value) AS val
         FROM should_cost_breakdown b
         JOIN should_cost_header h ON h.id = b.should_cost_header_id
         WHERE h.id = ANY($1)
         GROUP BY h.part_id, b.category`,
        [scIds]
      )
    : { rows: [] as Array<{ part_id: number; category: string; val: string }> };
  const catByPart = new Map<number, Record<string, number>>();
  for (const r of catRes.rows) {
    if (!catByPart.has(r.part_id)) catByPart.set(r.part_id, {});
    catByPart.get(r.part_id)![r.category] = Number(r.val);
  }

  // Latest current price per part
  const cpRes = await pool.query(
    `SELECT DISTINCT ON (part_id) part_id, total_cost
     FROM current_price_header
     WHERE part_id = ANY($1)
     ORDER BY part_id, version DESC`,
    [partIds]
  );
  const cpByPart = new Map<number, number>();
  for (const r of cpRes.rows) cpByPart.set(r.part_id, Number(r.total_cost));

  // Best (lowest) latest quote per part
  const qRes = await pool.query(
    `SELECT part_id, MIN(total_price) AS best FROM (
       SELECT DISTINCT ON (part_id, supplier_id) part_id, supplier_id, total_price
       FROM supplier_quote_header
       WHERE part_id = ANY($1)
       ORDER BY part_id, supplier_id, version DESC
     ) latest
     GROUP BY part_id`,
    [partIds]
  );
  const qByPart = new Map<number, number>();
  for (const r of qRes.rows) qByPart.set(r.part_id, Number(r.best));

  const members: Member[] = memberRes.rows.map((m) => {
    const sc = scByPart.get(m.part_id);
    return {
      part_id: m.part_id,
      part_number: m.part_number,
      program_code: m.program_code,
      program_name: m.program_name,
      segment: m.segment,
      model_year: m.model_year,
      annual_volume: sc?.volume ?? 0,
      should_cost: sc?.total ?? 0,
      current_price: cpByPart.get(m.part_id) ?? 0,
      best_quote: qByPart.has(m.part_id) ? qByPart.get(m.part_id)! : null,
      categories: catByPart.get(m.part_id) ?? {},
    };
  });

  const analysis = buildAnalysis(members);

  res.json({
    family_code: code,
    family_name: memberRes.rows[0] ? (await familyName(code)) : code,
    currency: scHdr.rows[0]?.currency ?? 'GBP',
    members,
    analysis,
  });
}

async function familyName(code: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT family_name FROM part_master WHERE family_code = $1 AND family_name IS NOT NULL LIMIT 1`,
    [code]
  );
  return rows[0]?.family_name ?? code;
}

function buildAnalysis(members: Member[]) {
  const withSc = members.filter((m) => m.should_cost > 0);
  if (withSc.length < 2) {
    return {
      headline: 'Not enough costed members to compare across models.',
      cheapest: null, costliest: null, spreadPct: 0,
      driver: null, overpayers: [], savings: [], recommendations: [],
    };
  }

  const sorted = [...withSc].sort((a, b) => a.should_cost - b.should_cost);
  const cheapest = sorted[0];
  const costliest = sorted[sorted.length - 1];
  const spreadPct = cheapest.should_cost > 0
    ? ((costliest.should_cost - cheapest.should_cost) / cheapest.should_cost) * 100
    : 0;

  // Which cost category drives the spread across models?
  const cats = new Set<string>();
  withSc.forEach((m) => Object.keys(m.categories).forEach((c) => cats.add(c)));
  let driver: { category: string; label: string; min: number; max: number; spread: number } | null = null;
  for (const c of cats) {
    const vals = withSc.map((m) => m.categories[c] ?? 0);
    const min = Math.min(...vals), max = Math.max(...vals);
    const spread = max - min;
    if (!driver || spread > driver.spread) {
      driver = { category: c, label: CAT_LABEL[c] ?? c, min, max, spread };
    }
  }

  // Programs overpaying vs their own should-cost
  const overpayers = members
    .filter((m) => m.should_cost > 0 && m.current_price > 0)
    .map((m) => {
      const amount = m.current_price - m.should_cost;
      const pct = (amount / m.should_cost) * 100;
      const annual = amount * (m.annual_volume || 0);
      return { program: m.program_name, program_code: m.program_code, overpayPct: pct, amount, annual };
    })
    .filter((o) => o.overpayPct > 0)
    .sort((a, b) => b.overpayPct - a.overpayPct);

  // Savings available vs current price (best external quote)
  const savings = members
    .filter((m) => m.best_quote != null && m.current_price > 0)
    .map((m) => {
      const save = m.current_price - (m.best_quote as number);
      const pct = (save / m.current_price) * 100;
      const annual = save * (m.annual_volume || 0);
      return { program: m.program_name, program_code: m.program_code, vsCurrentPct: pct, bestQuote: m.best_quote as number, annual };
    })
    .filter((s) => s.vsCurrentPct > 0)
    .sort((a, b) => b.annual - a.annual);

  const recommendations: string[] = [];
  recommendations.push(
    `Across ${withSc.length} programs, the should-cost spread is ${spreadPct.toFixed(0)}% — ` +
    `${costliest.program_name} (${costliest.should_cost.toFixed(2)}) vs ${cheapest.program_name} (${cheapest.should_cost.toFixed(2)}).`
  );
  if (driver && driver.spread > 0) {
    recommendations.push(
      `The biggest cross-model gap sits in ${driver.label}: ${driver.min.toFixed(2)} to ${driver.max.toFixed(2)} per part. ` +
      `Align the higher programs to the leanest design/process to close it.`
    );
  }
  if (overpayers.length) {
    const top = overpayers[0];
    recommendations.push(
      `${top.program} pays ${top.overpayPct.toFixed(0)}% above its should-cost today` +
      (top.annual ? ` (~£${Math.round(top.annual).toLocaleString()}/yr)` : '') + ' — priority for renegotiation.'
    );
  }
  if (savings.length) {
    const totalAnnual = savings.reduce((s, x) => s + x.annual, 0);
    recommendations.push(
      `Switching to the best external quote on each program unlocks ~£${Math.round(totalAnnual).toLocaleString()}/yr; ` +
      `start with ${savings[0].program} (${savings[0].vsCurrentPct.toFixed(0)}% below current price).`
    );
  }

  const headline = driver
    ? `${costliest.program_name} costs ${spreadPct.toFixed(0)}% more than ${cheapest.program_name}, mainly in ${driver.label}.`
    : `${costliest.program_name} costs ${spreadPct.toFixed(0)}% more than ${cheapest.program_name}.`;

  return {
    headline,
    cheapest: { program: cheapest.program_name, total: cheapest.should_cost },
    costliest: { program: costliest.program_name, total: costliest.should_cost },
    spreadPct,
    driver,
    overpayers,
    savings,
    recommendations,
  };
}
