/**
 * price-fetcher.ts
 * Fetches live commodity prices from metalpriceapi.com and persists them to
 * the material_price_overrides table.  Falls back gracefully to baseline
 * hardcoded values if the API key is absent or the call fails.
 *
 * metalpriceapi.com free tier: 100 req / month.
 * We call this at most once per week (startup + scheduled refresh) so we stay
 * well within quota.
 */

import type Database from 'better-sqlite3';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceMapEntry {
  /** LME / metalpriceapi currency code */
  symbol: string;
  materialIds: string[];
  /** GBP baseline price per kg — used when API is unavailable */
  baseKgPrice: number;
  /** Multiplier applied to LME spot to derive finished-material price */
  premium: number;
}

interface MetalPriceApiResponse {
  success: boolean;
  base: string;
  timestamp: number;
  rates: Record<string, number>;
}

// ─── Metal → material mapping ─────────────────────────────────────────────────

/**
 * Maps metalpriceapi currency codes to our material IDs.
 *
 * Note: metalpriceapi returns prices as "how many of the currency per 1 base
 * unit", so when base=GBP the rate for ALU is GBP per troy-ounce (for
 * precious) or USD per metric tonne (for base metals expressed in XAU-like
 * codes).  For ALU/COP/ZNC the API delivers price in USD per troy-oz, so we
 * convert: price_usd_per_troy_oz × 32150.7 oz/tonne ÷ 1000 kg/tonne gives
 * USD/kg.  We then convert USD→GBP using the GBPUSD rate returned in the
 * same payload.
 */
const PRICE_MAP: PriceMapEntry[] = [
  {
    symbol: 'ALU',
    materialIds: ['mat-al6061', 'mat-al7075', 'mat-aa5182', 'mat-aa5052', 'mat-aa5083', 'mat-aa6082-sheet'],
    baseKgPrice: 3.62,
    premium: 1.0,
  },
  {
    symbol: 'COP',
    materialIds: ['mat-bronze-c905'],
    baseKgPrice: 8.20,
    premium: 1.1,
  },
  {
    symbol: 'ZNC',
    materialIds: ['mat-zamak3', 'mat-zamak5'],
    baseKgPrice: 3.10,
    premium: 1.05,
  },
  // Steel uses CRU index (no free API).  Prices are updated via manual admin
  // override through PATCH /api/prices/override.
];

// ─── Unit conversion helpers ──────────────────────────────────────────────────

/**
 * metalpriceapi returns base-metal rates (ALU, COP, ZNC) in troy-oz relative
 * to the base currency.  When base=GBP the rate value means:
 *   1 GBP = rate troy-oz of the metal   (i.e. 1/rate GBP per troy-oz)
 *
 * Convert to GBP per kg:
 *   GBP/kg = (1 / rate_oz_per_GBP) × (1000 g/kg / 31.1035 g/troy-oz)
 *           = (1 / rate) × 32.1507
 */
function troyOzRateToGbpPerKg(rate: number): number {
  if (rate <= 0) return 0;
  // rate = troy-oz per 1 GBP
  const gbpPerTroyOz = 1 / rate;
  const troyOzPerKg = 32.1507;
  return gbpPerTroyOz * troyOzPerKg;
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function fetchAndCachePrices(
  db: Database.Database,
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const apiKey = process.env.METAL_PRICE_API_KEY;
  const now = new Date().toISOString();
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  // ── Step 1: try to fetch live prices ──────────────────────────────────────
  const symbols = PRICE_MAP.map(e => e.symbol).join(',');
  const url = `https://api.metalpriceapi.com/v1/latest?api_key=${apiKey}&base=GBP&currencies=${symbols}`;

  let liveRates: Record<string, number> | null = null;

  if (!apiKey) {
    const warning = 'METAL_PRICE_API_KEY not set — using baseline hardcoded prices';
    console.warn(`[price-fetcher] ${warning}`);
    errors.push(warning);
  } else {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000), // 10 s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as MetalPriceApiResponse;

      if (!json.success) {
        throw new Error(`API returned success=false: ${JSON.stringify(json)}`);
      }

      liveRates = json.rates;
      console.log(`[price-fetcher] Live rates received for symbols: ${Object.keys(liveRates).join(', ')}`);
    } catch (err) {
      const msg = `Live price fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[price-fetcher] ${msg}`);
      errors.push(msg);
    }
  }

  // ── Step 2: upsert material prices ────────────────────────────────────────
  const upsert = db.prepare(`
    INSERT INTO material_price_overrides (material_id, price_per_kg, source, fetched_at, confidence)
    VALUES (@material_id, @price_per_kg, @source, @fetched_at, @confidence)
    ON CONFLICT(material_id) DO UPDATE SET
      price_per_kg = excluded.price_per_kg,
      source       = excluded.source,
      fetched_at   = excluded.fetched_at,
      confidence   = excluded.confidence
  `);

  const upsertMany = db.transaction((rows: Parameters<typeof upsert['run']>[0][]) => {
    for (const row of rows) upsert.run(row);
  });

  const rows: {
    material_id: string;
    price_per_kg: number;
    source: string;
    fetched_at: string;
    confidence: string;
  }[] = [];

  for (const entry of PRICE_MAP) {
    let priceGbpPerKg: number | null = null;
    let source = 'baseline';
    let confidence = 'Low';

    if (liveRates) {
      const rate = liveRates[entry.symbol];
      if (typeof rate === 'number' && rate > 0) {
        priceGbpPerKg = troyOzRateToGbpPerKg(rate) * entry.premium;
        source = 'metalpriceapi';
        confidence = 'High';
      } else {
        const warn = `No rate for ${entry.symbol} in API response — using baseline`;
        console.warn(`[price-fetcher] ${warn}`);
        errors.push(warn);
      }
    }

    // Fall back to baseline if live price unavailable
    if (priceGbpPerKg === null || priceGbpPerKg <= 0) {
      priceGbpPerKg = entry.baseKgPrice * entry.premium;
      source = 'baseline';
      confidence = 'Low';
    }

    const roundedPrice = Math.round(priceGbpPerKg * 10000) / 10000;

    for (const materialId of entry.materialIds) {
      rows.push({
        material_id: materialId,
        price_per_kg: roundedPrice,
        source,
        fetched_at: now,
        confidence,
      });
      updated++;
    }
  }

  if (rows.length > 0) {
    upsertMany(rows);
  }

  // ── Step 3: log the fetch attempt ─────────────────────────────────────────
  db.prepare(`
    INSERT INTO price_fetch_log (fetched_at, source, updated_count, error)
    VALUES (@fetched_at, @source, @updated_count, @error)
  `).run({
    fetched_at: now,
    source: liveRates ? 'metalpriceapi' : 'baseline',
    updated_count: updated,
    error: errors.length > 0 ? errors.join('; ') : null,
  });

  console.log(`[price-fetcher] Done — updated: ${updated}, skipped: ${skipped}, errors: ${errors.length}`);
  return { updated, skipped, errors };
}

// ─── Status helper ────────────────────────────────────────────────────────────

export function getLastPriceUpdate(
  db: Database.Database,
): { timestamp: string | null; source: string } {
  const row = db
    .prepare(`
      SELECT fetched_at, source
      FROM price_fetch_log
      ORDER BY id DESC
      LIMIT 1
    `)
    .get() as { fetched_at: string; source: string } | undefined;

  return {
    timestamp: row?.fetched_at ?? null,
    source: row?.source ?? 'none',
  };
}

// ─── Staleness check ──────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function arePricesStale(db: Database.Database): boolean {
  const { timestamp } = getLastPriceUpdate(db);
  if (!timestamp) return true;
  const age = Date.now() - new Date(timestamp).getTime();
  return age > SEVEN_DAYS_MS;
}
