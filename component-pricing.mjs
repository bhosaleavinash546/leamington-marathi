/**
 * BrainSpark — live component pricing (DigiKey / Octopart-Nexar)
 * ------------------------------------------------------------------
 * Looks up REAL distributor pricing for a manufacturer part number (or a
 * part-family query read off the board by vision) and returns a normalized
 * GBP unit price at the requested quantity's best published price break.
 *
 * Configuration (org-level, via environment / the launcher-managed .env):
 *   DIGIKEY_CLIENT_ID + DIGIKEY_CLIENT_SECRET   → DigiKey Product Search v4
 *   NEXAR_TOKEN (or OCTOPART_TOKEN)             → Octopart via Nexar GraphQL
 *
 * Honesty rules baked in:
 *   - Never extrapolate beyond the largest published break — return it with
 *     atRequestedQty:false so the UI can say "negotiated volume pricing is
 *     typically lower".
 *   - Fail-graceful: unconfigured providers report status, lookups return
 *     null on any error; nothing is invented.
 *
 * Dependency-injected ({ fetchImpl, env, db, fxRates, now }) for unit tests.
 */
import { getFxRates, FX_FALLBACK } from './fx-rates.mjs';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;   // distributor prices move slowly
const DIGIKEY_TOKEN_URL = 'https://api.digikey.com/v1/oauth2/token';
const DIGIKEY_SEARCH_URL = 'https://api.digikey.com/products/v4/search/keyword';
const NEXAR_URL = 'https://api.nexar.com/graphql';

let _tokenCache = { token: null, expiresAt: 0 };   // DigiKey OAuth token (per-process)

function deps(overrides = {}) {
  return {
    fetchImpl: overrides.fetchImpl || fetch,
    env: overrides.env || process.env,
    db: overrides.db || null,
    fxRates: overrides.fxRates || null,   // { GBP, USD } EUR-based; null → live/fallback
    now: overrides.now || (() => Date.now()),
  };
}

/** Which providers are configured (presence of credentials only — no calls). */
export function providerStatus(overrides = {}) {
  const { env } = deps(overrides);
  return {
    digikey: !!(env.DIGIKEY_CLIENT_ID && env.DIGIKEY_CLIENT_SECRET),
    octopart: !!(env.NEXAR_TOKEN || env.OCTOPART_TOKEN),
  };
}

// GBP per USD from the EUR-based rate table (live when available, fallback else).
async function gbpPerUsd(d) {
  let rates = d.fxRates;
  if (!rates) {
    try { rates = (await getFxRates()).rates; } catch { rates = FX_FALLBACK; }
  }
  const gbp = Number(rates?.GBP) > 0 ? rates.GBP : FX_FALLBACK.GBP;
  const usd = Number(rates?.USD) > 0 ? rates.USD : FX_FALLBACK.USD;
  return gbp / usd;
}

function toGbp(price, currency, fxGbpPerUsd) {
  if (!(Number(price) > 0)) return null;
  const cur = String(currency || 'USD').toUpperCase();
  if (cur === 'GBP') return price;
  if (cur === 'USD') return price * fxGbpPerUsd;
  if (cur === 'EUR') return price * FX_FALLBACK.GBP;   // EUR→GBP via base rate
  return null;   // refuse unknown currencies rather than mislabel
}

/** Pick the largest published break ≤ qty; above the table → max break, flagged. */
export function selectBreak(priceBreaks, qty) {
  const breaks = (priceBreaks || [])
    .filter(b => Number(b.qty) > 0 && Number(b.price) > 0)
    .sort((a, b) => a.qty - b.qty);
  if (breaks.length === 0) return null;
  let chosen = breaks[0];
  for (const b of breaks) { if (b.qty <= qty) chosen = b; else break; }
  const maxBreak = breaks[breaks.length - 1];
  // atRequestedQty=false means the buyer's qty exceeds the published table —
  // the price shown is the best PUBLISHED break, not negotiated volume pricing.
  return { ...chosen, atRequestedQty: qty <= maxBreak.qty };
}

// ── DigiKey ──────────────────────────────────────────────────────────────────
async function digikeyToken(d, timeoutMs) {
  if (_tokenCache.token && d.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.token;
  const body = new URLSearchParams({
    client_id: d.env.DIGIKEY_CLIENT_ID,
    client_secret: d.env.DIGIKEY_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  const r = await d.fetchImpl(DIGIKEY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`DigiKey auth ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error('DigiKey auth: no token');
  _tokenCache = { token: j.access_token, expiresAt: d.now() + (Number(j.expires_in) || 600) * 1000 };
  return _tokenCache.token;
}

async function digikeyLookup(query, qty, d, timeoutMs) {
  const token = await digikeyToken(d, timeoutMs);
  const r = await d.fetchImpl(DIGIKEY_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-DIGIKEY-Client-Id': d.env.DIGIKEY_CLIENT_ID,
      'X-DIGIKEY-Locale-Currency': 'USD',
      'X-DIGIKEY-Locale-Site': 'US',
    },
    body: JSON.stringify({ Keywords: query, Limit: 3, Offset: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`DigiKey search ${r.status}`);
  const j = await r.json();
  const p = (j.Products || [])[0];
  if (!p) return null;
  const pricing = [];
  for (const v of p.ProductVariations || []) {
    for (const s of v.StandardPricing || []) {
      pricing.push({ qty: Number(s.BreakQuantity), price: Number(s.UnitPrice), currency: 'USD' });
    }
  }
  // Dedupe by qty keeping the CHEAPEST offer at each break (variations overlap).
  const byQty = new Map();
  for (const b of pricing) {
    if (!byQty.has(b.qty) || byQty.get(b.qty).price > b.price) byQty.set(b.qty, b);
  }
  return {
    mpn: p.ManufacturerProductNumber || p.ManufacturerPartNumber || query,
    manufacturer: p.Manufacturer?.Name || p.Manufacturer?.Value || '',
    description: p.Description?.ProductDescription || p.ProductDescription || '',
    priceBreaks: [...byQty.values()].sort((a, b) => a.qty - b.qty),
    source: 'digikey',
  };
}

// ── Octopart via Nexar ───────────────────────────────────────────────────────
const NEXAR_QUERY = `query($q: String!) {
  supSearchMpn(q: $q, limit: 3) {
    results { part {
      mpn
      manufacturer { name }
      shortDescription
      sellers { company { name } offers { prices { quantity price currency } } }
    } }
  }
}`;

async function octopartLookup(query, qty, d, timeoutMs) {
  const token = d.env.NEXAR_TOKEN || d.env.OCTOPART_TOKEN;
  const r = await d.fetchImpl(NEXAR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: NEXAR_QUERY, variables: { q: query } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`Nexar ${r.status}`);
  const j = await r.json();
  const part = j?.data?.supSearchMpn?.results?.[0]?.part;
  if (!part) return null;
  const pricing = [];
  for (const seller of part.sellers || []) {
    for (const offer of seller.offers || []) {
      for (const pr of offer.prices || []) {
        const cur = String(pr.currency || '').toUpperCase();
        if (cur === 'USD' || cur === 'GBP' || cur === 'EUR') {
          pricing.push({ qty: Number(pr.quantity), price: Number(pr.price), currency: cur });
        }
      }
    }
  }
  const byQty = new Map();
  for (const b of pricing) {
    if (!byQty.has(b.qty) || byQty.get(b.qty).price > b.price) byQty.set(b.qty, b);
  }
  return {
    mpn: part.mpn || query,
    manufacturer: part.manufacturer?.name || '',
    description: part.shortDescription || '',
    priceBreaks: [...byQty.values()].sort((a, b) => a.qty - b.qty),
    source: 'octopart',
  };
}

// ── Cache (SQLite, lazily created) ───────────────────────────────────────────
function cacheGet(d, key) {
  if (!d.db) return null;
  try {
    d.db.prepare('CREATE TABLE IF NOT EXISTS part_price_cache (key TEXT PRIMARY KEY, json TEXT, fetchedAt INTEGER)').run();
    const row = d.db.prepare('SELECT json, fetchedAt FROM part_price_cache WHERE key = ?').get(key);
    if (row && d.now() - row.fetchedAt < CACHE_TTL_MS) return JSON.parse(row.json);
  } catch { /* cache is best-effort */ }
  return null;
}
function cachePut(d, key, value) {
  if (!d.db) return;
  try {
    d.db.prepare('INSERT INTO part_price_cache (key, json, fetchedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetchedAt=excluded.fetchedAt')
      .run(key, JSON.stringify(value), d.now());
  } catch { /* best-effort */ }
}

const qtyBucket = (q) => (q <= 100 ? 100 : q <= 1000 ? 1000 : q <= 10000 ? 10000 : 100000);

/**
 * Look up a part and return its GBP unit price at the requested quantity.
 * Tries DigiKey first (richer automotive coverage), then Octopart. Returns
 * null when nothing is configured, nothing matches, or providers error.
 */
export async function lookupPart(query, opts = {}, overrides = {}) {
  const d = deps(overrides);
  const q = String(query || '').trim();
  if (q.length < 3) return null;
  const qty = Math.max(1, Math.round(Number(opts.qty) || 1000));
  const timeoutMs = Number(opts.timeoutMs) || 8000;
  const status = providerStatus(overrides);
  const order = [
    status.digikey ? ['digikey', digikeyLookup] : null,
    status.octopart ? ['octopart', octopartLookup] : null,
  ].filter(Boolean);
  if (order.length === 0) return null;

  for (const [name, fn] of order) {
    const key = `${name}|${q.toLowerCase()}|${qtyBucket(qty)}`;
    let norm = cacheGet(d, key);
    if (!norm) {
      try { norm = await fn(q, qty, d, timeoutMs); } catch { norm = null; }
      if (norm) cachePut(d, key, norm);
    }
    if (!norm || !norm.priceBreaks?.length) continue;
    const brk = selectBreak(norm.priceBreaks, qty);
    if (!brk) continue;
    const fx = await gbpPerUsd(d);
    const unitGbp = toGbp(brk.price, brk.currency, fx);
    if (!(unitGbp > 0)) continue;
    return {
      match: { mpn: norm.mpn, manufacturer: norm.manufacturer, description: String(norm.description || '').slice(0, 120) },
      unitPrice: Number(unitGbp.toFixed(4)),
      currency: 'GBP',
      breakQty: brk.qty,
      atRequestedQty: brk.atRequestedQty,
      source: norm.source,
      priceBreaks: norm.priceBreaks.slice(0, 8),
    };
  }
  return null;
}

/** Batch lookup with bounded concurrency; per-line isolation (never throws). */
export async function lookupParts(lines, opts = {}, overrides = {}) {
  const items = (Array.isArray(lines) ? lines : []).slice(0, 40);
  const concurrency = 4;
  const results = new Array(items.length).fill(null);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      try {
        const found = await lookupPart(item.query, { qty: item.qty ?? opts.qty, timeoutMs: opts.timeoutMs }, overrides);
        results[idx] = { index: item.index ?? idx, found: !!found, ...(found || {}) };
      } catch {
        results[idx] = { index: item.index ?? idx, found: false };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** Test hook: reset the process-level DigiKey token cache. */
export function __resetPricingCachesForTest() { _tokenCache = { token: null, expiresAt: 0 }; }
