/**
 * prices.ts — /api/prices
 *
 * Endpoints:
 *   GET  /api/prices/status      — last update time + source
 *   POST /api/prices/refresh     — trigger a manual price refresh (admin)
 *   GET  /api/prices/materials   — all material prices with live vs baseline flag
 *   PATCH /api/prices/override   — manually override a single material price
 */

import { Router } from 'express';
import db from '../db.js';
import { fetchAndCachePrices, getLastPriceUpdate } from '../services/price-fetcher.js';

const router = Router();

// ─── GET /api/prices/status ────────────────────────────────────────────────

router.get('/status', (_req, res) => {
  const lastUpdate = getLastPriceUpdate(db);

  const recentLogs = db
    .prepare(
      `SELECT fetched_at, source, updated_count, error
       FROM price_fetch_log
       ORDER BY id DESC
       LIMIT 5`,
    )
    .all() as {
      fetched_at: string;
      source: string;
      updated_count: number;
      error: string | null;
    }[];

  const overrideCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM material_price_overrides')
      .get() as { cnt: number }
  ).cnt;

  res.json({
    lastUpdated: lastUpdate.timestamp,
    source: lastUpdate.source,
    overrideCount,
    recentFetchLog: recentLogs,
    apiKeyConfigured: !!process.env.METAL_PRICE_API_KEY,
  });
});

// ─── POST /api/prices/refresh ──────────────────────────────────────────────

router.post('/refresh', async (_req, res) => {
  try {
    const result = await fetchAndCachePrices(db);
    const lastUpdate = getLastPriceUpdate(db);
    res.json({
      ok: true,
      lastUpdated: lastUpdate.timestamp,
      source: lastUpdate.source,
      ...result,
    });
  } catch (err) {
    console.error('[prices] Manual refresh failed', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error during price refresh',
    });
  }
});

// ─── GET /api/prices/materials ─────────────────────────────────────────────

router.get('/materials', (_req, res) => {
  const overrides = db
    .prepare(
      `SELECT material_id, price_per_kg, source, fetched_at, confidence
       FROM material_price_overrides
       ORDER BY material_id`,
    )
    .all() as {
      material_id: string;
      price_per_kg: number;
      source: string;
      fetched_at: string;
      confidence: string;
    }[];

  const lastUpdate = getLastPriceUpdate(db);

  const materials = overrides.map(row => ({
    materialId: row.material_id,
    pricePerKg: row.price_per_kg,
    source: row.source,
    isLive: row.source === 'metalpriceapi',
    fetchedAt: row.fetched_at,
    confidence: row.confidence,
  }));

  res.json({
    materials,
    lastUpdated: lastUpdate.timestamp,
    source: lastUpdate.source,
    count: materials.length,
  });
});

// ─── PATCH /api/prices/override ────────────────────────────────────────────

interface OverrideBody {
  materialId?: unknown;
  pricePerKg?: unknown;
  confidence?: unknown;
}

router.patch('/override', (req, res) => {
  const body = req.body as OverrideBody;
  const { materialId, pricePerKg, confidence } = body;

  if (typeof materialId !== 'string' || !materialId.trim()) {
    res.status(400).json({ error: 'materialId must be a non-empty string' });
    return;
  }

  if (typeof pricePerKg !== 'number' || pricePerKg <= 0) {
    res.status(400).json({ error: 'pricePerKg must be a positive number' });
    return;
  }

  const validConfidence = ['Low', 'Medium', 'High'];
  const conf = typeof confidence === 'string' && validConfidence.includes(confidence)
    ? confidence
    : 'Medium';

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO material_price_overrides (material_id, price_per_kg, source, fetched_at, confidence)
    VALUES (@material_id, @price_per_kg, @source, @fetched_at, @confidence)
    ON CONFLICT(material_id) DO UPDATE SET
      price_per_kg = excluded.price_per_kg,
      source       = excluded.source,
      fetched_at   = excluded.fetched_at,
      confidence   = excluded.confidence
  `).run({
    material_id: materialId,
    price_per_kg: pricePerKg,
    source: 'manual',
    fetched_at: now,
    confidence: conf,
  });

  // Log the manual override
  db.prepare(`
    INSERT INTO price_fetch_log (fetched_at, source, updated_count, error)
    VALUES (@fetched_at, @source, @updated_count, @error)
  `).run({
    fetched_at: now,
    source: 'manual',
    updated_count: 1,
    error: null,
  });

  res.json({
    ok: true,
    materialId,
    pricePerKg,
    confidence: conf,
    updatedAt: now,
  });
});

export default router;
