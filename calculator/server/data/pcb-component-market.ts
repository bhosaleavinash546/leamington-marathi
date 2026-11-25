/**
 * The build country's component market (EDU v6, Nov 2026): what an EMS in that country pays for a part, from sourced
 * page reads — server/data/pcb-component-market.json, written by scripts/pcb-market-rows.mts (never by hand).
 *
 * China: szlcsc (立创商城) own-stock whole-reel prices ex-VAT, 379 automotive parts in 26 classes, read 25 Nov 2026.
 * On the same kind of part they are 0.3–0.8 × the catalogue's franchised-distributor prices. The country index removed
 * in Oct 2026 (pipeline review F13) was ONE unsourced multiplier on every part; this is a sourced price table per class
 * and per part, used only for a board built in that country and only when the engineer sets "Component prices" to the
 * build country's market (boardSpec.componentMarket = 'local'). The DEFAULT stays global: on the one board with a price
 * paid (camera, £17.00 delivered) the China market moved the tool from −4.8 % to −13.1 % — so it is the engineer's
 * choice (an EMS that buys locally), not the tool's. Other build countries in the comparison keep the global prices.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export interface MarketRow { lo: number; hi: number; p50: number; n: number; makers: string[] }
export interface MarketPart { part: string; gbp: number; reelQty: number; url: string; date: string }
interface MarketFile { asOf: string; source: string; markets: Record<string, { rows: Record<string, MarketRow>; parts: Record<string, MarketPart> }> }

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), 'pcb-component-market.json');
const DATA: MarketFile | null = (() => { try { return JSON.parse(readFileSync(FILE, 'utf8')) as MarketFile; } catch { return null; } })();

export const COMPONENT_MARKET_SOURCE = DATA ? `${DATA.source}, read ${DATA.asOf}` : '';

/** The class row of a market for a class key without its '.automotive' suffix ("passive_0603.cap"), or null. */
export function marketRow(market: string | undefined, key: string): MarketRow | null {
  if (!market || !DATA) return null;
  return DATA.markets[market]?.rows[key] ?? null;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** A named part's own market price (whole reel), or null. */
export function marketPart(market: string | undefined, mpn: string): MarketPart | null {
  if (!market || !DATA || !mpn) return null;
  const parts = DATA.markets[market]?.parts;
  if (!parts) return null;
  const k = norm(mpn);
  return parts[k] ?? null;
}

/** The market a board's components are priced in: the build country's when the engineer chose it ('local') and the
 *  country has one; otherwise undefined = the global (franchised-distributor) prices, the default. */
export function componentMarketFor(boardSpec: Record<string, unknown>, country: string): string | undefined {
  if (String(boardSpec.componentMarket ?? '').toLowerCase() !== 'local') return undefined;
  return DATA?.markets[country] ? country : undefined;
}
export const hasComponentMarket = (country: string) => Boolean(DATA?.markets[country]);
