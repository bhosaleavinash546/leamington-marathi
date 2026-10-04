/**
 * Which PCB / EMS market prices a board for each manufacturing country.
 *
 * PCB costing is a MARKET-PRICE model: board fabrication £/dm², SMT placement,
 * joint and test prices as EMS suppliers in that market charge them. The tool
 * holds those prices for 14 markets (server/data/pcb-country-rates.ts). For the
 * other 25 countries there is no EMS price data, and inventing it would be
 * fabrication — so the board is priced in the nearest assessed market, and the
 * screen SAYS so. Before this the PCB pickers ignored the selected country
 * altogether and defaulted to China.
 *
 * The PCB fab form (modules/pcb-fab.ts) has five panel-price regions; its
 * mapping is below too.
 */
import type { ManufacturingRegion } from './regional-rates.js';

export interface PCBMarket {
  /** PCB country-rate id (cn, vn, in, th, my, tw, kr, mx, cz, pl, de, gb, us, jp). */
  id: string;
  /** True when the country has its own EMS market data. */
  own: boolean;
  /** Why this market prices the country, when it is not its own. */
  basis?: string;
}

const own = (id: string): PCBMarket => ({ id, own: true });
const near = (id: string, basis: string): PCBMarket => ({ id, own: false, basis });
const WEST_EU = 'Western European EMS market — Germany is the nearest assessed market';
const CEE = 'Central / Eastern European EMS market — Czech Republic is the nearest assessed market';
const EU_FACING = 'low-cost, Europe-facing EMS — Poland is the nearest assessed market';

export const PCB_MARKET_FOR_REGION: Record<ManufacturingRegion, PCBMarket> = {
  CN: own('cn'), VN: own('vn'), IN: own('in'), TH: own('th'), MY: own('my'), TW: own('tw'), KR: own('kr'),
  MX: own('mx'), CZ: own('cz'), PL: own('pl'), DE: own('de'), UK: own('gb'), US: own('us'), JP: own('jp'),
  FR: near('de', WEST_EU), IT: near('de', WEST_EU), ES: near('de', WEST_EU), NL: near('de', WEST_EU),
  BE: near('de', WEST_EU), AT: near('de', WEST_EU), SE: near('de', WEST_EU), PT: near('de', WEST_EU),
  SK: near('cz', CEE), SI: near('cz', CEE), HU: near('cz', CEE), RO: near('cz', CEE), BG: near('cz', CEE), RS: near('cz', CEE),
  LT: near('pl', 'Baltic EMS — Poland is the nearest assessed market'),
  TR: near('pl', EU_FACING), MA: near('pl', EU_FACING), TN: near('pl', EU_FACING), EG: near('pl', EU_FACING),
  ZA: near('pl', 'no assessed African EMS market — Poland (similar labour cost) is the nearest'),
  BR: near('mx', 'Latin American EMS — Mexico is the nearest assessed market'),
  CA: near('us', 'North American EMS — the USA is the nearest assessed market'),
  SG: near('my', 'Singapore EMS volume runs largely in Malaysia (Penang / Johor) — Malaysia is the assessed market'),
  ID: near('th', 'South-East Asian EMS — Thailand is the nearest assessed market'),
  PH: near('vn', 'South-East Asian EMS — Vietnam (similar labour cost) is the nearest assessed market'),
};

/** The PCB market a country's boards are priced in. */
export function pcbMarketFor(region: ManufacturingRegion): PCBMarket {
  return PCB_MARKET_FOR_REGION[region] ?? own('gb');
}

/** The five panel-price regions of the PCB fab form (modules/pcb-fab.ts). */
export type PCBFabRegion = 'uk' | 'eu' | 'china' | 'india' | 'na';

/** The PCB fab form's panel-price region for a country, with the basis when it is not exact. */
export function pcbFabRegionFor(region: ManufacturingRegion): { region: PCBFabRegion; basis?: string } {
  if (region === 'UK') return { region: 'uk' };
  if (region === 'IN') return { region: 'india' };
  if (region === 'CN') return { region: 'china' };
  if (region === 'US' || region === 'CA' || region === 'MX') return { region: 'na', ...(region === 'US' ? {} : { basis: 'North American panel price' }) };
  if (['TW', 'KR', 'JP', 'VN', 'TH', 'MY', 'ID', 'PH', 'SG'].includes(region)) return { region: 'china', basis: 'Asian panel price (China basis)' };
  if (region === 'BR') return { region: 'na', basis: 'Americas panel price (North American basis)' };
  const EU = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'SE', 'PT', 'PL', 'CZ', 'SK', 'SI', 'HU', 'RO', 'BG', 'LT'];
  if (EU.includes(region)) return { region: 'eu' };
  return { region: 'eu', basis: 'European panel price (nearest)' };
}
