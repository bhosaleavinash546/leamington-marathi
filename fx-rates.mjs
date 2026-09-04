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
// Four currencies covered nine regions, so a quote could not be entered in the
// native currency of Mexico, India, Korea or the Czech Republic — precisely the
// lanes where teaching the engine a real quote is most valuable (Sept 2026
// review, R-33). The list now covers every region in the cost engine.
export const FX_FALLBACK = {
  EUR: 1, GBP: 0.85, USD: 1.08, CNY: 7.85,
  CZK: 25.2, MXN: 19.8, INR: 90.5, KRW: 1460, PLN: 4.30, RON: 4.97,
  TRY: 38.5, MAD: 10.8, VND: 27400, THB: 38.9, JPY: 165, BRL: 5.95,
};
export const FX_SYMBOLS = {
  EUR: '€', GBP: '£', USD: '$', CNY: '¥',
  CZK: 'Kč', MXN: 'MX$', INR: '₹', KRW: '₩', PLN: 'zł', RON: 'lei',
  TRY: '₺', MAD: 'DH', VND: '₫', THB: '฿', JPY: '¥', BRL: 'R$',
};
// The vintage of the fallback table, so "how old is this rate" has an answer
// even when the feed has never been reached. Update both together.
export const FX_FALLBACK_AS_OF = '2026-09-01';
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
  // A fallback rate is ALWAYS stale — that is what fallback means. The old
  // expression short-circuited on `live`, so a deployment that had never
  // reached the feed reported stale:false forever, which is the one case where
  // the flag matters most (Sept 2026 review, R-33).
  const stale = snapshot.live
    ? (Date.now() - snapshot.fetchedAt > FX_TTL_MS)
    : true;
  return {
    rates: snapshot.rates,
    live: snapshot.live,
    date: snapshot.date ?? (snapshot.live ? null : FX_FALLBACK_AS_OF),
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
