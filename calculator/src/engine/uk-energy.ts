/**
 * The UK industrial tariffs the base rate library is expressed in. Every UK machine build-up's `energy` line is
 * annual kWh × this electricity price, so a regional library backs the kWh out with it and re-tariffs at the
 * country's own price (regional-rates.ts, country-books.ts). Written by `scripts/uk-book.ts` together with
 * REGIONAL_DATA.UK.energy, the `energy-uk` library entry and the PCB `gb` tariff — one figure, five places, never
 * edited by hand.
 */
export const UK_ELECTRICITY_GBP_PER_KWH = 0.182;
export const UK_GAS_GBP_PER_KWH = 0.046;
