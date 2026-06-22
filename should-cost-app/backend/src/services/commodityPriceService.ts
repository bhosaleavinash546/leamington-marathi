import cron from 'node-cron';
import pool from '../db/pool';

// Per-material market simulation parameters
const MATERIALS = [
  {
    code: 'STL-HRC',
    name: 'Hot Rolled Steel (HR3)',
    volatility: 0.003,   // daily ±0.3%
    meanReversionSpeed: 0.05,
    longTermMean: 0.700,  // GBP/kg long-run anchor
    source: 'LME / Industry Index (simulated)',
  },
  {
    code: 'STL-CRC',
    name: 'Cold Rolled Steel (CR4)',
    volatility: 0.003,
    meanReversionSpeed: 0.05,
    longTermMean: 0.850,
    source: 'LME / Industry Index (simulated)',
  },
  {
    code: 'ALU-ADC12',
    name: 'Aluminium ADC12 Alloy',
    volatility: 0.005,
    meanReversionSpeed: 0.04,
    longTermMean: 2.100,
    source: 'LME / Industry Index (simulated)',
  },
  {
    code: 'ALU-6082',
    name: 'Aluminium 6082 T6',
    volatility: 0.005,
    meanReversionSpeed: 0.04,
    longTermMean: 2.250,
    source: 'LME / Industry Index (simulated)',
  },
  {
    code: 'COP-ETP',
    name: 'Copper ETP',
    volatility: 0.010,   // Copper most volatile
    meanReversionSpeed: 0.03,
    longTermMean: 8.000,
    source: 'LME / Industry Index (simulated)',
  },
  {
    code: 'PPL-GF20',
    name: 'Polypropylene PP-GF20',
    volatility: 0.002,
    meanReversionSpeed: 0.06,
    longTermMean: 1.680,
    source: 'ICIS / Market data (simulated)',
  },
  {
    code: 'PA66-GF30',
    name: 'Nylon PA66-GF30',
    volatility: 0.002,
    meanReversionSpeed: 0.06,
    longTermMean: 2.980,
    source: 'ICIS / Market data (simulated)',
  },
  {
    code: 'STL-SS409',
    name: 'Stainless Steel SS409',
    volatility: 0.004,
    meanReversionSpeed: 0.05,
    longTermMean: 1.620,
    source: 'LME / Industry Index (simulated)',
  },
];

// Ornstein-Uhlenbeck mean-reverting random walk — realistic for commodities
function nextPrice(
  current: number,
  params: { volatility: number; meanReversionSpeed: number; longTermMean: number }
): number {
  const drift = params.meanReversionSpeed * (params.longTermMean - current);
  const shock = params.volatility * current * (Math.random() * 2 - 1);
  const next = current + drift + shock;
  // Hard floor at 50% of long-run mean so prices can't go absurdly low
  return Math.max(next, params.longTermMean * 0.5);
}

export async function updateTodaysPrices(): Promise<{ inserted: number; skipped: number }> {
  const today = new Date().toISOString().slice(0, 10);
  let inserted = 0;
  let skipped = 0;

  // Get system user (created_by)
  const userRes = await pool.query(
    `SELECT id FROM "user" WHERE email = 'avinash.bhosale@costlens.io' LIMIT 1`
  );
  const createdBy: string | null = userRes.rows[0]?.id ?? null;

  for (const mat of MATERIALS) {
    try {
      // Check if today's price already exists
      const existing = await pool.query(
        `SELECT id FROM commodity_price WHERE material_code = $1 AND price_date = $2 LIMIT 1`,
        [mat.code, today]
      );
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      // Get the most recent price
      const lastRes = await pool.query(
        `SELECT price_per_unit FROM commodity_price
         WHERE material_code = $1
         ORDER BY price_date DESC, id DESC
         LIMIT 1`,
        [mat.code]
      );

      const lastPrice: number = lastRes.rows[0]
        ? Number(lastRes.rows[0].price_per_unit)
        : mat.longTermMean;

      const newPrice = nextPrice(lastPrice, mat);
      const changePct = ((newPrice - lastPrice) / lastPrice) * 100;
      const notes = `Daily auto-update. Change: ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;

      await pool.query(
        `INSERT INTO commodity_price
           (material_name, material_code, price_per_unit, unit, currency, price_date, source, notes, created_by)
         VALUES ($1, $2, $3, 'per kg', 'GBP', $4, $5, $6, $7)`,
        [mat.name, mat.code, newPrice.toFixed(4), today, mat.source, notes, createdBy]
      );
      inserted++;
    } catch (err) {
      console.error(`[commodityPriceService] Failed to update ${mat.code}:`, err);
    }
  }

  console.log(`[commodityPriceService] ${today}: inserted=${inserted}, skipped=${skipped}`);
  return { inserted, skipped };
}

export function startCommodityPriceScheduler(): void {
  // Run at 07:00 UTC every day (before markets open in UK)
  cron.schedule('0 7 * * *', async () => {
    console.log('[commodityPriceService] Running scheduled daily price update...');
    try {
      const result = await updateTodaysPrices();
      console.log(`[commodityPriceService] Scheduled update complete:`, result);
    } catch (err) {
      console.error('[commodityPriceService] Scheduled update error:', err);
    }
  });
  console.log('[server] Commodity price scheduler started — runs daily at 07:00 UTC.');
}
