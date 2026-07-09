/**
 * Optional live component pricing integration.
 * Three providers: Octopart/Nexar (GraphQL), RS Components, Farnell/element14.
 * All functions return a consistent LivePriceResult[] shape.
 * Failures are isolated — a provider error returns empty array, not a server crash.
 */

export type LivePricingProvider = 'octopart' | 'rs' | 'farnell';

export interface LivePriceResult {
  /** Manufacturer part number queried */
  mpn: string;
  /** Description from distributor */
  description: string;
  /** Manufacturer name */
  manufacturer: string;
  /** Unit price at requested quantity in GBP */
  unitPriceGBP: number;
  /** Quantity used for price break */
  priceBreakQty: number;
  /** Availability (stock on hand) */
  stockQty: number;
  /** Lead time in weeks if out of stock */
  leadTimeWeeks: number | null;
  /** Data source */
  provider: LivePricingProvider;
  /** Whether this is an automotive/AEC-Q grade part */
  automotiveGrade: boolean;
  /** Distributor part number / order code */
  distPartNumber: string;
  /** Raw currency from provider (before GBP conversion) */
  rawCurrency: string;
  /** Raw unit price before conversion */
  rawUnitPrice: number;
}

// ─── FX rates for conversion (mid-market Jan 2026) ───────────────────────────
const FX_TO_GBP: Record<string, number> = {
  GBP: 1.0, USD: 0.787, EUR: 0.855, JPY: 0.00518, CNY: 0.109,
};

function toGBP(amount: number, currency: string): number {
  return amount * (FX_TO_GBP[currency.toUpperCase()] ?? 1.0);
}

function isAutomotiveGrade(...texts: string[]): boolean {
  const joined = texts.join(' ').toUpperCase();
  // Tightened (audit fix): the old pattern included bare /GRADE/ which
  // false-positived on "Industrial Grade", and bare Q100 matched inside
  // unrelated part numbers. Require an explicit AEC-Qxxx qualifier or the
  // word AUTOMOTIVE.
  return /\bAEC[-\s]?Q(?:100|101|102|103|104|200)?\b|\bAUTOMOTIVE\b/.test(joined);
}

// ─── Octopart / Nexar GraphQL ─────────────────────────────────────────────────

const NEXAR_ENDPOINT = 'https://api.nexar.com/graphql';
const NEXAR_TOKEN_ENDPOINT = 'https://identity.nexar.com/connect/token';

/**
 * Nexar (Octopart) uses OAuth2 client-credentials — a raw API key sent as a
 * Bearer is rejected. If OCTOPART_CLIENT_ID / OCTOPART_CLIENT_SECRET are set,
 * exchange them for an access token (cached until ~80% of its lifetime).
 * Fallback: treat OCTOPART_API_KEY as a ready-made access token (covers users
 * who mint a token themselves).
 */
let _nexarToken: { token: string; expiresAt: number } | null = null;

export async function resolveNexarAccessToken(): Promise<string> {
  const id = process.env.OCTOPART_CLIENT_ID ?? '';
  const secret = process.env.OCTOPART_CLIENT_SECRET ?? '';
  if (!id || !secret) return process.env.OCTOPART_API_KEY ?? '';

  if (_nexarToken && Date.now() < _nexarToken.expiresAt) return _nexarToken.token;

  try {
    const resp = await fetch(NEXAR_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
        scope: 'supply.domain',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      console.warn(`[LivePricing/Nexar] Token exchange failed: HTTP ${resp.status}`);
      return process.env.OCTOPART_API_KEY ?? '';
    }
    const data = await resp.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return process.env.OCTOPART_API_KEY ?? '';
    _nexarToken = {
      token: data.access_token,
      // refresh at 80% of lifetime (Nexar default 86400 s)
      expiresAt: Date.now() + (data.expires_in ?? 86_400) * 0.8 * 1000,
    };
    return _nexarToken.token;
  } catch (err) {
    console.warn('[LivePricing/Nexar] Token exchange error:', (err as Error).message);
    return process.env.OCTOPART_API_KEY ?? '';
  }
}

// NOTE: $qty is intentionally NOT declared here. GraphQL rejects an operation
// that declares a variable it never uses ("$qty is never used"), which was
// silently failing every Nexar call. Quantity is applied client-side when
// picking the applicable price break below.
const NEXAR_QUERY = `query GetPrices($mpns: [String!]!) {
  supSearch(q: "", filters: { mpn: $mpns }, limit: 20) {
    results {
      part {
        mpn
        shortDescription
        manufacturer { name }
        sellers(includeBrokers: false) {
          company { name }
          offers {
            sku
            inventoryLevel
            prices { quantity currency price }
          }
        }
      }
    }
  }
}`;

interface NexarPart {
  mpn: string;
  shortDescription?: string;
  manufacturer?: { name: string };
  sellers?: Array<{
    company?: { name: string };
    offers?: Array<{
      sku?: string;
      inventoryLevel?: number;
      prices?: Array<{ quantity: number; currency: string; price: number }>;
    }>;
  }>;
}

export async function fetchOctopartPrices(
  partNumbers: string[],
  apiKey: string,
  qty = 100,
): Promise<LivePriceResult[]> {
  if (!partNumbers.length || !apiKey) return [];

  try {
    const resp = await fetch(NEXAR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: NEXAR_QUERY,
        variables: { mpns: partNumbers.slice(0, 20) },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      console.warn(`[LivePricing/Octopart] HTTP ${resp.status}: ${resp.statusText}`);
      // Auth failures are actionable — surface them instead of returning an empty
      // list that looks like "no matches". Octopart/Nexar needs a valid OAuth token.
      if (resp.status === 401 || resp.status === 403) {
        throw new Error(`Octopart/Nexar authentication failed (HTTP ${resp.status}) — the access token is missing, invalid or expired.`);
      }
      return [];
    }

    const data = await resp.json() as {
      data?: { supSearch?: { results?: Array<{ part?: NexarPart }> } };
      errors?: Array<{ message: string }>;
    };
    if (data.errors?.length) {
      console.warn('[LivePricing/Octopart] GraphQL errors:', data.errors.map(e => e.message).join('; '));
    }

    const results: LivePriceResult[] = [];
    const seen = new Set<string>();
    for (const { part } of data.data?.supSearch?.results ?? []) {
      if (!part || !part.mpn) continue;
      const key = part.mpn.toUpperCase();
      if (seen.has(key)) continue;

      // Find lowest unit price among offers where a price-break qty <= requested qty exists.
      let best: { price: number; currency: string; qty: number; stock: number; sku: string } | null = null;
      for (const seller of part.sellers ?? []) {
        for (const offer of seller.offers ?? []) {
          const eligible = (offer.prices ?? []).filter(p => p.quantity <= qty);
          if (!eligible.length) continue;
          // highest break qty that is still <= requested qty = best applicable price
          const pick = eligible.sort((a, b) => b.quantity - a.quantity)[0];
          if (!best || pick.price < best.price) {
            best = { price: pick.price, currency: pick.currency, qty: pick.quantity, stock: offer.inventoryLevel ?? 0, sku: offer.sku ?? '' };
          }
        }
      }
      if (!best) continue;
      seen.add(key);
      results.push({
        mpn: part.mpn,
        description: part.shortDescription ?? '',
        manufacturer: part.manufacturer?.name ?? '',
        unitPriceGBP: toGBP(best.price, best.currency),
        priceBreakQty: best.qty,
        stockQty: best.stock,
        leadTimeWeeks: null,
        provider: 'octopart',
        automotiveGrade: isAutomotiveGrade(part.mpn, part.shortDescription ?? ''),
        distPartNumber: best.sku,
        rawCurrency: best.currency,
        rawUnitPrice: best.price,
      });
    }
    return results;
  } catch (err) {
    console.warn('[LivePricing/Octopart] Fetch error:', (err as Error).message);
    return [];
  }
}

// ─── RS Components REST API ───────────────────────────────────────────────────

const RS_ENDPOINT = 'https://api.rs-online.com/searchProducts/v3/products/search';

interface RSProduct {
  title?: string;
  description?: string;
  brandName?: string;
  unitPrice?: number;
  stockQuantity?: number;
}
interface RSResponse {
  stockProducts?: RSProduct[];
}

export async function fetchRSPrices(
  partNumbers: string[],
  apiKey: string,
  qty = 100,
): Promise<LivePriceResult[]> {
  if (!partNumbers.length || !apiKey) return [];
  // RS search API exposes only a single qty-1 unitPrice (no price breaks) —
  // RS-sourced prices are qty-1 and will OVERSTATE cost at volume; the
  // priceBreakQty:1 field below flags this to consumers.
  void qty;
  const results: LivePriceResult[] = [];

  for (const mpn of partNumbers.slice(0, 20)) {
    try {
      const url = new URL(RS_ENDPOINT);
      url.searchParams.set('searchTerm', mpn);
      url.searchParams.set('stockMustBeAvailable', 'true');
      url.searchParams.set('pageSize', '5');

      const resp = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'clientId': apiKey },
        signal: AbortSignal.timeout(8_000),
      });
      if (!resp.ok) {
        console.warn(`[LivePricing/RS] ${mpn}: HTTP ${resp.status}`);
        continue;
      }

      const data = await resp.json() as RSResponse;
      const product = data.stockProducts?.[0];
      if (!product || typeof product.unitPrice !== 'number') continue;

      results.push({
        mpn,
        description: product.title ?? product.description ?? '',
        manufacturer: product.brandName ?? '',
        unitPriceGBP: product.unitPrice, // GBP for UK endpoint
        priceBreakQty: 1,
        stockQty: product.stockQuantity ?? 0,
        leadTimeWeeks: null,
        provider: 'rs',
        automotiveGrade: isAutomotiveGrade(mpn, product.title ?? '', product.description ?? ''),
        distPartNumber: '',
        rawCurrency: 'GBP',
        rawUnitPrice: product.unitPrice,
      });
    } catch (err) {
      console.warn(`[LivePricing/RS] ${mpn}:`, (err as Error).message);
    }
  }
  return results;
}

// ─── Farnell / element14 REST API ────────────────────────────────────────────

const FARNELL_ENDPOINT = 'https://api.element14.com/catalog/products';

interface FarnellPrice { from?: number; to?: number; cost: number }
interface FarnellProduct {
  displayName?: string;
  brandName?: string;
  translatedManufacturerPartNumber?: string;
  manufacturerPartNumber?: string;
  prices?: FarnellPrice[];
  inv?: number;
  stock?: { level?: number };
}
interface FarnellResponse {
  manufacturerPartNumberSearchReturn?: { products?: FarnellProduct[] };
  premierFarnellPartNumberReturn?: { products?: FarnellProduct[] };
  keywordSearchReturn?: { products?: FarnellProduct[] };
}

export async function fetchFarnellPrices(
  partNumbers: string[],
  apiKey: string,
  qty = 100,
): Promise<LivePriceResult[]> {
  if (!partNumbers.length || !apiKey) return [];
  const results: LivePriceResult[] = [];

  for (const mpn of partNumbers.slice(0, 20)) {
    try {
      // element14's REST API only accepts the key as the callInfo.apiKey query
      // parameter (no header auth exists). Mitigation (audit): never log the
      // assembled URL — error paths below log the MPN only — and keep the key
      // out of thrown messages so it cannot leak into server/proxy logs.
      const url = new URL(FARNELL_ENDPOINT);
      url.searchParams.set('callInfo.responseDataFormat', 'JSON');
      url.searchParams.set('term', `manuPartNum:${mpn}`);
      url.searchParams.set('callInfo.apiKey', apiKey);
      url.searchParams.set('storeInfo.id', 'uk.farnell.com');
      url.searchParams.set('resultsSettings.responseGroup', 'prices,inventory,descriptions');
      url.searchParams.set('resultsSettings.offset', '0');
      url.searchParams.set('resultsSettings.numberOfResults', '5');

      const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) {
        console.warn(`[LivePricing/Farnell] ${mpn}: HTTP ${resp.status}`);
        continue;
      }

      const data = await resp.json() as FarnellResponse;
      const product =
        data.manufacturerPartNumberSearchReturn?.products?.[0] ??
        data.premierFarnellPartNumberReturn?.products?.[0] ??
        data.keywordSearchReturn?.products?.[0];
      if (!product) continue;

      const prices = product.prices ?? [];
      if (!prices.length) continue;
      // Audit fix: pick the price break APPLICABLE to the requested quantity
      // (largest `from` <= qty), not blindly the deepest break — the old
      // behaviour understated cost at prototype/low quantities.
      const applicable = prices
        .filter(pb => typeof pb.cost === 'number' && (pb.from ?? 1) <= qty)
        .sort((x, y) => (y.from ?? 1) - (x.from ?? 1))[0]
        ?? prices.find(pb => typeof pb.cost === 'number');
      if (!applicable) continue;
      const priceBreak = applicable;
      const cost = priceBreak.cost;
      if (typeof cost !== 'number') continue;

      results.push({
        mpn,
        description: product.displayName ?? '',
        manufacturer: product.brandName ?? '',
        unitPriceGBP: cost, // GBP for uk.farnell.com
        priceBreakQty: priceBreak.from ?? 1,
        stockQty: product.inv ?? product.stock?.level ?? 0,
        leadTimeWeeks: null,
        provider: 'farnell',
        automotiveGrade: isAutomotiveGrade(mpn, product.displayName ?? '', product.translatedManufacturerPartNumber ?? ''),
        distPartNumber: product.translatedManufacturerPartNumber ?? product.manufacturerPartNumber ?? '',
        rawCurrency: 'GBP',
        rawUnitPrice: cost,
      });
    } catch (err) {
      console.warn(`[LivePricing/Farnell] ${mpn}:`, (err as Error).message);
    }
  }
  return results;
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

export async function fetchLivePrices(
  partNumbers: string[],
  provider: LivePricingProvider,
  apiKey: string,
  qty = 100,
): Promise<LivePriceResult[]> {
  const cleaned = partNumbers.map(p => p.trim()).filter(Boolean);
  if (!cleaned.length || !apiKey) return [];

  switch (provider) {
    case 'octopart': return fetchOctopartPrices(cleaned, apiKey, qty);
    case 'rs':       return fetchRSPrices(cleaned, apiKey, qty);
    case 'farnell':  return fetchFarnellPrices(cleaned, apiKey, qty);
    default:         return [];
  }
}

// ─── AEC-Q automotive variant search ─────────────────────────────────────────
/** Build automotive grade variant MPN list: adds common AEC-Q suffixes like -Q1, /Q, etc. */
export function buildAutomotiveSearchVariants(partNumbers: string[]): string[] {
  // Audit fix: TR / CT / -T1 are tape-reel PACKAGING suffixes, not automotive
  // qualifiers — matching them mislabelled reel variants as AEC-Q parts.
  const suffixes = ['-Q1', 'Q', '/Q'];
  const variants: Set<string> = new Set();
  for (const pn of partNumbers) {
    variants.add(pn);
    const upper = pn.toUpperCase();
    for (const s of suffixes) {
      if (!upper.endsWith(s.toUpperCase())) variants.add(pn + s);
    }
  }
  return [...variants].slice(0, 20);
}

/** Fetch live prices, for automotive domains also tries AEC-Q variant MPNs.
 *  Prefers automotiveGrade=true results when both standard and AEC-Q are returned. */
export async function fetchLivePricesWithAECQ(
  partNumbers: string[],
  provider: LivePricingProvider,
  apiKey: string,
  qty: number,
  preferAutomotive: boolean,
): Promise<LivePriceResult[]> {
  if (!preferAutomotive) return fetchLivePrices(partNumbers, provider, apiKey, qty);
  const variants = buildAutomotiveSearchVariants(partNumbers);
  const results = await fetchLivePrices(variants, provider, apiKey, qty);
  // For each original MPN, if we have both an automotive and non-automotive hit prefer automotive
  const bestPerMPN = new Map<string, LivePriceResult>();
  for (const r of results) {
    const key = r.mpn.toUpperCase().replace(/[-\/]?(Q1|Q)$/i, '');
    const existing = bestPerMPN.get(key);
    if (!existing || (r.automotiveGrade && !existing.automotiveGrade)) {
      bestPerMPN.set(key, r);
    }
  }
  // Map back to original MPNs
  const out: LivePriceResult[] = [];
  for (const orig of partNumbers) {
    const key = orig.toUpperCase().replace(/[-\/]?(Q1|Q)$/i, '');
    const hit = bestPerMPN.get(key);
    if (hit) out.push({ ...hit, mpn: orig });
  }
  return out;
}
