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
  GBP: 1.0, USD: 0.787, EUR: 0.862, JPY: 0.00518, CNY: 0.109,
};

function toGBP(amount: number, currency: string): number {
  return amount * (FX_TO_GBP[currency.toUpperCase()] ?? 1.0);
}

// ─── Octopart / Nexar GraphQL ─────────────────────────────────────────────────

const OCTOPART_ENDPOINT = 'https://octopart.com/api/v4/endpoint';

export async function fetchOctopartPrices(
  partNumbers: string[],
  apiKey: string,
  qty: number = 100,
): Promise<LivePriceResult[]> {
  if (!partNumbers.length || !apiKey) return [];

  const query = `
    query MultiSearch($queries: [PartSearchQuery!]!) {
      multi_match(queries: $queries) {
        hits
        results {
          part {
            mpn
            manufacturer { name }
            short_description
            sellers(include_brokers: false) {
              company { name }
              offers(quantity: ${qty}) {
                sku
                inventory_level
                moq
                lead_time_days
                prices {
                  quantity
                  price
                  currency
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    queries: partNumbers.slice(0, 20).map((mpn, i) => ({ mpn, reference: String(i) })),
  };

  try {
    const resp = await fetch(OCTOPART_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      console.warn(`[LivePricing/Octopart] HTTP ${resp.status}: ${resp.statusText}`);
      return [];
    }

    const data = await resp.json() as {
      data?: { multi_match: Array<{ results: Array<{ part: OctopartPart }> }> };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      console.warn('[LivePricing/Octopart] GraphQL errors:', data.errors.map(e => e.message).join('; '));
    }

    const results: LivePriceResult[] = [];
    for (const match of data.data?.multi_match ?? []) {
      for (const { part } of match.results ?? []) {
        if (!part) continue;
        const best = pickBestOffer(part.sellers ?? [], qty);
        if (!best) continue;
        const autoGrade = /AEC|AEC-Q|automotive|grade[- ]?[12]/i.test(
          part.mpn + ' ' + (part.short_description ?? ''));
        results.push({
          mpn: part.mpn,
          description: part.short_description ?? '',
          manufacturer: part.manufacturer?.name ?? '',
          unitPriceGBP: toGBP(best.price, best.currency),
          priceBreakQty: best.qty,
          stockQty: best.stock,
          leadTimeWeeks: best.leadDays ? Math.ceil(best.leadDays / 7) : null,
          provider: 'octopart',
          automotiveGrade: autoGrade,
          distPartNumber: best.sku,
          rawCurrency: best.currency,
          rawUnitPrice: best.price,
        });
        break; // first result per query only
      }
    }
    return results;
  } catch (err) {
    console.warn('[LivePricing/Octopart] Fetch error:', (err as Error).message);
    return [];
  }
}

interface OctopartPart {
  mpn: string;
  short_description?: string;
  manufacturer?: { name: string };
  sellers?: Array<{
    company: { name: string };
    offers: Array<{
      sku: string;
      inventory_level: number;
      moq: number;
      lead_time_days?: number;
      prices: Array<{ quantity: number; price: number; currency: string }>;
    }>;
  }>;
}

function pickBestOffer(
  sellers: OctopartPart['sellers'] = [],
  qty: number,
): { price: number; currency: string; qty: number; stock: number; sku: string; leadDays?: number } | null {
  // Prefer sellers with stock, then lowest price at requested qty
  const candidates: typeof pickBestOffer extends (...a: any) => infer R ? Exclude<R, null>[] : never[] = [];
  for (const seller of sellers) {
    for (const offer of seller.offers ?? []) {
      const prices = (offer.prices ?? []).filter(p => p.quantity <= qty);
      if (!prices.length) continue;
      const bestPrice = prices.sort((a, b) => b.quantity - a.quantity)[0];
      candidates.push({
        price: bestPrice.price,
        currency: bestPrice.currency,
        qty: bestPrice.quantity,
        stock: offer.inventory_level ?? 0,
        sku: offer.sku,
        leadDays: offer.lead_time_days,
      });
    }
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0) || a.price - b.price)[0];
}

// ─── RS Components REST API ───────────────────────────────────────────────────

const RS_ENDPOINT = 'https://api.rs-online.com/searchprod/v1/products/keywordsearch';

export async function fetchRSPrices(
  partNumbers: string[],
  apiKey: string,
  qty: number = 100,
): Promise<LivePriceResult[]> {
  if (!partNumbers.length || !apiKey) return [];

  const results: LivePriceResult[] = [];

  for (const mpn of partNumbers.slice(0, 15)) {
    try {
      const url = new URL(RS_ENDPOINT);
      url.searchParams.set('term', mpn);
      url.searchParams.set('storeInfo.id', 'uk.rs-online.com');
      url.searchParams.set('lang', 'en');

      const resp = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'client_id': apiKey,
        },
        signal: AbortSignal.timeout(8_000),
      });

      if (!resp.ok) {
        console.warn(`[LivePricing/RS] ${mpn}: HTTP ${resp.status}`);
        continue;
      }

      const data = await resp.json() as RSSearchResponse;
      const product = data.products?.[0];
      if (!product) continue;

      const priceBreak = pickRSPriceBreak(product.prices?.priceSortedList ?? [], qty);
      if (!priceBreak) continue;

      const autoGrade = /AEC|AEC-Q|automotive|automotive grade/i.test(
        `${product.title} ${product.description ?? ''}`);

      results.push({
        mpn,
        description: product.title ?? product.description ?? '',
        manufacturer: product.brandName ?? '',
        unitPriceGBP: toGBP(priceBreak.price, product.prices?.currencySymbol === '£' ? 'GBP' : 'GBP'),
        priceBreakQty: priceBreak.minQty,
        stockQty: product.stockData?.actualStockQty ?? 0,
        leadTimeWeeks: product.stockData?.deliveryLeadTimeWeeks ?? null,
        provider: 'rs',
        automotiveGrade: autoGrade,
        distPartNumber: product.id ?? '',
        rawCurrency: 'GBP',
        rawUnitPrice: priceBreak.price,
      });
    } catch (err) {
      console.warn(`[LivePricing/RS] ${mpn}:`, (err as Error).message);
    }
  }
  return results;
}

interface RSSearchResponse {
  products?: Array<{
    id?: string;
    title?: string;
    description?: string;
    brandName?: string;
    prices?: {
      currencySymbol?: string;
      priceSortedList?: Array<{ minQty: number; price: number }>;
    };
    stockData?: { actualStockQty?: number; deliveryLeadTimeWeeks?: number };
  }>;
}

function pickRSPriceBreak(
  list: Array<{ minQty: number; price: number }>,
  qty: number,
): { minQty: number; price: number } | null {
  const eligible = list.filter(p => p.minQty <= qty).sort((a, b) => b.minQty - a.minQty);
  return eligible[0] ?? list[0] ?? null;
}

// ─── Farnell / element14 REST API ────────────────────────────────────────────

const FARNELL_ENDPOINT = 'https://api.element14.com/catalog/products';

export async function fetchFarnellPrices(
  partNumbers: string[],
  apiKey: string,
  qty: number = 100,
): Promise<LivePriceResult[]> {
  if (!partNumbers.length || !apiKey) return [];

  const results: LivePriceResult[] = [];

  for (const mpn of partNumbers.slice(0, 15)) {
    try {
      const url = new URL(FARNELL_ENDPOINT);
      url.searchParams.set('callInfo.responseDataFormat', 'JSON');
      url.searchParams.set('callInfo.apiKey', apiKey);
      url.searchParams.set('callInfo.storeInfo.id', 'uk.farnell.com');
      url.searchParams.set('term', `manuPartNum:${mpn}`);
      url.searchParams.set('callInfo.numberOfResults', '3');
      url.searchParams.set('resultsSettings.responseGroup', 'prices,inventory,descriptions');

      const resp = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8_000),
      });

      if (!resp.ok) {
        console.warn(`[LivePricing/Farnell] ${mpn}: HTTP ${resp.status}`);
        continue;
      }

      const data = await resp.json() as FarnellSearchResponse;
      const product = data.manufacturerPartNumberSearchReturn?.products?.[0];
      if (!product) continue;

      const priceBreak = pickFarnellPriceBreak(product.prices ?? [], qty);
      if (!priceBreak) continue;

      const autoGrade = /AEC|AEC-Q|automotive/i.test(`${product.displayName} ${product.translatedManufacturerPartNumber ?? ''}`);

      results.push({
        mpn,
        description: product.displayName ?? '',
        manufacturer: product.brandName ?? '',
        unitPriceGBP: toGBP(priceBreak.cost, 'GBP'),
        priceBreakQty: priceBreak.from,
        stockQty: product.inv ?? 0,
        leadTimeWeeks: product.leadTime ? Math.ceil(product.leadTime / 7) : null,
        provider: 'farnell',
        automotiveGrade: autoGrade,
        distPartNumber: product.sku ?? '',
        rawCurrency: 'GBP',
        rawUnitPrice: priceBreak.cost,
      });
    } catch (err) {
      console.warn(`[LivePricing/Farnell] ${mpn}:`, (err as Error).message);
    }
  }
  return results;
}

interface FarnellSearchResponse {
  manufacturerPartNumberSearchReturn?: {
    products?: Array<{
      sku?: string;
      displayName?: string;
      brandName?: string;
      translatedManufacturerPartNumber?: string;
      prices?: Array<{ from: number; to: number; cost: number }>;
      inv?: number;
      leadTime?: number;
    }>;
  };
}

function pickFarnellPriceBreak(
  prices: Array<{ from: number; to: number; cost: number }>,
  qty: number,
): { from: number; cost: number } | null {
  const eligible = prices.filter(p => p.from <= qty).sort((a, b) => b.from - a.from);
  return eligible[0] ?? prices[0] ?? null;
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

export async function fetchLivePrices(
  partNumbers: string[],
  provider: LivePricingProvider,
  apiKey: string,
  qty: number = 100,
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
