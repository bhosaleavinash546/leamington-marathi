/**
 * CostVision — Live FX rates (EUR base)
 * ------------------------------------------------------------------
 * Pulled from the ECB reference feed via Frankfurter (no API key). Cached in
 * process and refreshed lazily; on any failure we keep the last good rates and
 * ultimately fall back to a static table so costing never breaks offline.
 *
 * Extracted from server.mjs so the FX policy (cache TTL, retry back-off,
 * concurrent-refresh dedup, per-currency fallback, staleness) lives in one
 * testable place.
 *
 *   FX_FALLBACK, FX_SYMBOLS, FX_CURRENCIES  — supported currencies + symbols
 *   getFxRates() -> { rates, live, date, stale, source }
 */
export const FX_FALLBACK = { EUR: 1, GBP: 0.85, USD: 1.08, CNY: 7.85 };
export const FX_SYMBOLS = { EUR: '€', GBP: '£', USD: '$', CNY: '¥' };
export const FX_CURRENCIES = Object.keys(FX_FALLBACK);   // the single supported-currency list
const FX_TARGETS = FX_CURRENCIES.filter(c => c !== 'EUR');

const FX_TTL_MS = 6 * 60 * 60 * 1000;   // serve cached live rates for 6 h
const FX_RETRY_MS = 5 * 60 * 1000;      // after a failed fetch, wait 5 min before retrying
// Feed must return { rates: { GBP, USD, CNY, ... } } with an EUR base. Override
// via FX_API_URL if frankfurter.app is unreachable from the deployment network.
const FX_API_URL = process.env.FX_API_URL || `https://api.frankfurter.app/latest?from=EUR&to=${FX_TARGETS.join(',')}`;

let fxCache = { rates: { ...FX_FALLBACK }, fetchedAt: 0, lastAttempt: 0, live: false, date: null };
let fxInflight = null;   // single shared refresh promise — dedups concurrent callers

// Annotate a cache snapshot with derived fields (never mutates the cache).
function view(snapshot) {
  const stale = snapshot.live && (Date.now() - snapshot.fetchedAt > FX_TTL_MS);
  return {
    rates: snapshot.rates,
    live: snapshot.live,
    date: snapshot.date,
    stale,                                                   // live data older than the TTL (refreshes failing)
    source: snapshot.live ? 'ECB (frankfurter.app)' : 'static reference',
  };
}

export async function getFxRates() {
  const now = Date.now();
  if (fxCache.live && now - fxCache.fetchedAt < FX_TTL_MS) return view(fxCache); // fresh live data
  if (now - fxCache.lastAttempt < FX_RETRY_MS) return view(fxCache);             // recent attempt — back off
  if (fxInflight) return fxInflight;   // a refresh is already running — join it, don't start another
  fxCache = { ...fxCache, lastAttempt: now };
  fxInflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      let j;
      try {
        const r = await fetch(FX_API_URL, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`FX HTTP ${r.status}`);
        j = await r.json();
      } finally { clearTimeout(timer); }
      // Accept whatever valid rates came back; fall back per-currency for any missing
      // one rather than discarding the whole (good) response.
      const rates = { ...FX_FALLBACK };
      let any = false;
      for (const k of FX_TARGETS) {
        const v = Number(j?.rates?.[k]);
        if (Number.isFinite(v) && v > 0) { rates[k] = v; any = true; }
      }
      if (any) fxCache = { rates, fetchedAt: now, lastAttempt: now, live: true, date: j.date || null };
    } catch {
      // network/parse failure — keep the last good (or fallback) rates.
    }
    return view(fxCache);
  })();
  try { return await fxInflight; } finally { fxInflight = null; }
}

// Test-only: reset in-process cache so unit tests are deterministic.
export function __resetFxCacheForTest() {
  fxCache = { rates: { ...FX_FALLBACK }, fetchedAt: 0, lastAttempt: 0, live: false, date: null };
  fxInflight = null;
}
