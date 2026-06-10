// ============================================================
// Opportunity Controller — aggregated cost intelligence
// Powers the Opportunity Interactive Dynamic Dashboard
// ============================================================
import { Request, Response } from 'express';
import pool from '../db/pool';

// ── CTEs reused across queries ────────────────────────────────
const LATEST_SC_CTE = `
  latest_sc AS (
    SELECT DISTINCT ON (part_id)
      id, part_id, total_cost, version, currency, created_at
    FROM should_cost_header
    WHERE status = 'published' AND total_cost IS NOT NULL
    ORDER BY part_id, version DESC
  )`;

const LATEST_QUOTES_CTE = `
  latest_quotes AS (
    SELECT DISTINCT ON (part_id, supplier_id)
      id, part_id, supplier_id, total_price, version, currency, submitted_at
    FROM supplier_quote_header
    WHERE total_price IS NOT NULL
    ORDER BY part_id, supplier_id, version DESC
  )`;

const BEST_QUOTES_CTE = `
  best_quotes AS (
    SELECT
      lq.part_id,
      MIN(lq.total_price)               AS best_price,
      MAX(lq.total_price)               AS worst_price,
      AVG(lq.total_price)               AS avg_price,
      COUNT(DISTINCT lq.supplier_id)    AS supplier_count,
      MIN(lq.id)                        AS best_quote_id
    FROM latest_quotes lq
    GROUP BY lq.part_id
  )`;

// ── GET /api/opportunity/summary ──────────────────────────────
// Top-level KPIs for the dashboard hero strip
export async function getOpportunitySummary(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(`
    WITH ${LATEST_SC_CTE},
         ${LATEST_QUOTES_CTE},
         ${BEST_QUOTES_CTE}
    SELECT
      COALESCE(COUNT(DISTINCT ls.part_id), 0)                   AS parts_with_sc,
      COALESCE(COUNT(DISTINCT bq.part_id), 0)                   AS parts_quoted,
      COALESCE(SUM(ls.total_cost), 0)                           AS total_should_cost,
      COALESCE(SUM(bq.best_price), 0)                           AS total_best_quote,
      COALESCE(SUM(bq.avg_price),  0)                           AS total_avg_quote,
      COALESCE(SUM(bq.best_price - ls.total_cost), 0)           AS total_opportunity,
      CASE WHEN SUM(ls.total_cost) > 0
        THEN ROUND((SUM(bq.best_price - ls.total_cost) / SUM(ls.total_cost)) * 100, 2)
        ELSE 0 END                                              AS avg_variance_pct,
      COUNT(*) FILTER (WHERE bq.best_price > ls.total_cost * 1.10)  AS parts_over_10pct,
      COUNT(*) FILTER (WHERE bq.best_price > ls.total_cost * 1.20)  AS parts_over_20pct,
      COUNT(*) FILTER (WHERE bq.best_price < ls.total_cost)          AS parts_below_target
    FROM latest_sc ls
    LEFT JOIN best_quotes bq ON bq.part_id = ls.part_id
  `);
  res.json(rows[0]);
}

// ── GET /api/opportunity/by-system ────────────────────────────
// System-level aggregation for treemap + bar chart
export async function getOpportunityBySystem(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(`
    WITH ${LATEST_SC_CTE},
         ${LATEST_QUOTES_CTE},
         ${BEST_QUOTES_CTE}
    SELECT
      vs.id                                                       AS system_id,
      vs.name                                                     AS system_name,
      vs.code                                                     AS system_code,
      vs.sort_order,
      COUNT(DISTINCT pm.id)                                       AS part_count,
      COALESCE(COUNT(DISTINCT ls.part_id), 0)                    AS parts_with_sc,
      COALESCE(COUNT(DISTINCT bq.part_id), 0)                    AS parts_quoted,
      COALESCE(SUM(ls.total_cost),  0)::FLOAT                    AS total_should_cost,
      COALESCE(SUM(bq.best_price),  0)::FLOAT                    AS total_best_quote,
      COALESCE(SUM(bq.avg_price),   0)::FLOAT                    AS total_avg_quote,
      COALESCE(SUM(bq.worst_price), 0)::FLOAT                    AS total_worst_quote,
      COALESCE(SUM(bq.best_price - ls.total_cost), 0)::FLOAT     AS total_opportunity,
      CASE WHEN SUM(ls.total_cost) > 0
        THEN ROUND((SUM(bq.best_price - ls.total_cost) / SUM(ls.total_cost))::NUMERIC * 100, 2)::FLOAT
        ELSE 0 END                                               AS variance_pct,
      COALESCE(SUM(bq.supplier_count), 0)                        AS total_quotes,
      COUNT(*) FILTER (WHERE bq.best_price > ls.total_cost * 1.10) AS parts_flagged
    FROM vehicle_system vs
    LEFT JOIN part_master pm    ON pm.system_id = vs.id
    LEFT JOIN latest_sc   ls    ON ls.part_id   = pm.id
    LEFT JOIN best_quotes bq    ON bq.part_id   = pm.id
    GROUP BY vs.id, vs.name, vs.code, vs.sort_order
    ORDER BY total_opportunity DESC NULLS LAST
  `);
  res.json(rows);
}

// ── GET /api/opportunity/top-parts?limit=15&systemId= ────────
// Parts ranked by savings opportunity
export async function getTopOpportunityParts(req: Request, res: Response): Promise<void> {
  const limit    = Math.min(Number(req.query.limit ?? 15), 50);
  const systemId = req.query.systemId;

  const systemFilter = systemId ? `AND pm.system_id = ${parseInt(systemId as string)}` : '';

  const { rows } = await pool.query(`
    WITH ${LATEST_SC_CTE},
         ${LATEST_QUOTES_CTE},
         ${BEST_QUOTES_CTE}
    SELECT
      pm.id                                                     AS part_id,
      pm.part_number,
      pm.description,
      vs.name                                                   AS system_name,
      vsub.name                                                 AS subsystem_name,
      ls.total_cost                                             AS should_cost,
      bq.best_price,
      bq.avg_price,
      bq.worst_price,
      bq.supplier_count,
      (bq.best_price - ls.total_cost)::FLOAT                   AS opportunity,
      CASE WHEN ls.total_cost > 0
        THEN ROUND(((bq.best_price - ls.total_cost) / ls.total_cost)::NUMERIC * 100, 2)::FLOAT
        ELSE 0 END                                             AS variance_pct,
      CASE WHEN bq.best_price > ls.total_cost * 1.2  THEN 'critical'
           WHEN bq.best_price > ls.total_cost * 1.1  THEN 'high'
           WHEN bq.best_price > ls.total_cost * 1.05 THEN 'medium'
           WHEN bq.best_price < ls.total_cost        THEN 'below'
           ELSE 'low' END                                      AS risk_level
    FROM part_master pm
    JOIN latest_sc ls    ON ls.part_id  = pm.id
    JOIN best_quotes bq  ON bq.part_id  = pm.id
    LEFT JOIN vehicle_system vs     ON vs.id   = pm.system_id
    LEFT JOIN vehicle_subsystem vsub ON vsub.id = pm.subsystem_id
    WHERE bq.best_price IS NOT NULL ${systemFilter}
    ORDER BY opportunity DESC
    LIMIT $1
  `, [limit]);
  res.json(rows);
}

// ── GET /api/opportunity/version-trend?partId=&supplierId= ───
// Quote price across versions — for the trend sparkline
export async function getVersionTrend(req: Request, res: Response): Promise<void> {
  const { partId, supplierId } = req.query;
  if (!partId) { res.status(400).json({ error: 'partId required' }); return; }

  const supplierFilter = supplierId ? `AND sqh.supplier_id = ${parseInt(supplierId as string)}` : '';

  const { rows } = await pool.query(`
    SELECT
      sqh.version,
      sqh.total_price::FLOAT                AS quote_price,
      sqh.currency,
      sqh.submitted_at,
      s.name                                AS supplier_name,
      s.id                                  AS supplier_id,
      sch.total_cost::FLOAT                 AS should_cost,
      sch.version                           AS sc_version
    FROM supplier_quote_header sqh
    JOIN supplier s ON s.id = sqh.supplier_id
    LEFT JOIN (
      SELECT DISTINCT ON (part_id)
        id, part_id, total_cost, version
      FROM should_cost_header
      WHERE status = 'published' AND total_cost IS NOT NULL
      ORDER BY part_id, version DESC
    ) sch ON sch.part_id = sqh.part_id
    WHERE sqh.part_id = $1 AND sqh.total_price IS NOT NULL ${supplierFilter}
    ORDER BY s.name, sqh.version
  `, [partId]);
  res.json(rows);
}

// ── GET /api/opportunity/element-heatmap?systemId= ───────────
// Cost-element breakdown across all parts in a system (for heatmap)
export async function getElementHeatmap(req: Request, res: Response): Promise<void> {
  const { systemId } = req.query;

  const systemFilter = systemId
    ? `AND pm.system_id = ${parseInt(systemId as string)}`
    : '';

  const { rows } = await pool.query(`
    SELECT
      cd.cost_element,
      cd.category,
      AVG(cd.should_cost_value)::FLOAT          AS avg_should_cost,
      AVG(cd.quote_value)::FLOAT                AS avg_quote,
      AVG(cd.variance)::FLOAT                   AS avg_variance,
      AVG(cd.variance_pct)::FLOAT               AS avg_variance_pct,
      COUNT(*)                                  AS sample_count,
      SUM(cd.variance)::FLOAT                   AS total_variance
    FROM comparison_detail cd
    JOIN comparison_snapshot cs ON cs.id = cd.comparison_snapshot_id
    JOIN part_master pm ON pm.id = cs.part_id
    WHERE cd.should_cost_value > 0 ${systemFilter}
    GROUP BY cd.cost_element, cd.category
    ORDER BY ABS(AVG(cd.variance_pct)) DESC NULLS LAST
    LIMIT 20
  `);
  res.json(rows);
}

// ── GET /api/opportunity/supplier-scoreboard ─────────────────
// Which suppliers are consistently cheapest / most expensive
export async function getSupplierScoreboard(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(`
    WITH ${LATEST_SC_CTE},
         ${LATEST_QUOTES_CTE}
    SELECT
      s.id                                                    AS supplier_id,
      s.name                                                  AS supplier_name,
      s.country,
      COUNT(lq.id)                                            AS quote_count,
      COALESCE(AVG((lq.total_price - ls.total_cost)
        / NULLIF(ls.total_cost, 0) * 100), 0)::FLOAT         AS avg_variance_pct,
      COALESCE(SUM(lq.total_price - ls.total_cost), 0)::FLOAT AS total_variance,
      COUNT(*) FILTER (WHERE lq.total_price <= ls.total_cost) AS parts_at_or_below_target,
      COUNT(*) FILTER (WHERE lq.total_price > ls.total_cost * 1.1) AS parts_over_10pct
    FROM latest_quotes lq
    JOIN supplier s ON s.id = lq.supplier_id
    LEFT JOIN latest_sc ls ON ls.part_id = lq.part_id
    WHERE ls.total_cost IS NOT NULL
    GROUP BY s.id, s.name, s.country
    ORDER BY avg_variance_pct ASC
  `);
  res.json(rows);
}
