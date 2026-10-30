/**
 * World rate round summary (30 Oct 2026) — one row per country, read from the books and configs (never retyped):
 * where each input comes from, the key rates in £, and the median part's share on sourced rates (the provenance
 * ratchet, 15 real parts). Writes world-2026-10/summary.json and prints a markdown table.
 *   npx tsx scripts/rate-refresh/world-2026-10/summary.ts
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { REGIONAL_DATA, REGION_NAMES, type ManufacturingRegion } from '../../../src/engine/regional-rates.js';
import { COUNTRY_BOOKS } from '../../../src/engine/country-books.js';

const RR = 'scripts/rate-refresh';
const ratchet = JSON.parse(readFileSync('tests/fixtures/country-provenance-ratchet.json', 'utf8')) as Record<string, { medianSourcedPct: number; heldPct: number }>;
const cfgOf = (cc: string): Record<string, any> | null => {
  const world = `${RR}/2026-10-world-${cc.toLowerCase()}.json`;
  if (existsSync(world)) return JSON.parse(readFileSync(world, 'utf8'));
  const named = { DE: 'germany', CN: 'china', IN: 'india', PL: 'poland', HU: 'hungary', UK: 'uk' }[cc];
  return named ? JSON.parse(readFileSync(`${RR}/2026-10-${named}.json`, 'utf8')) : null;
};
const short = (s: string | undefined, n = 90) => (s ?? '').replace(/\s+/g, ' ').slice(0, n);
const rows = [];
for (const cc of Object.keys(REGION_NAMES) as ManufacturingRegion[]) {
  const R = REGIONAL_DATA[cc], book = COUNTRY_BOOKS[cc], cfg = cfgOf(cc);
  const L = cfg?.labour?.categories ?? {};
  const labourSrc = cc === 'UK' ? 'UK book (ASHE)' : /ILOSTAT ISCO/.test(L.skilled?.basis ?? '') && /Eurostat/.test(L.skilled?.basis ?? '') ? 'Eurostat LC × LCI × ILO ratios' : /Eurostat/.test(L.skilled?.basis ?? '') ? 'Eurostat LC × LCI × SES' : /JETRO/.test(L.semiskilled?.basis ?? '') ? 'JETRO burden + ILO ratios'
    : /ECEC/.test(L.skilled?.basis ?? '') ? 'BLS OEWS × ECEC' : /ILOSTAT|ILO/.test(JSON.stringify(L)) ? 'national / ILO earnings + statutory on-costs' : short(cfg?.labour?.short, 60);
  rows.push({
    region: cc, name: R.name, book: cc === 'UK' ? 'UK base book' : book ? `${book.region} ${book.asOf}` : 'none', currency: R.currency, fxToGBP: R.fxToGBP,
    fxBasis: short(cfg?.fxBasis, 120),
    skilledGbpH: R.labour.skilled, engineerGbpH: R.labour.engineer, labourSource: labourSrc,
    electricityGbpKwh: R.energy.electricityPerKwh, gasGbpKwh: R.energy.gasPerKwh, energySource: short(cfg?.energy?.basis, 110),
    hoursPerYear: book?.machines.hoursPerYear ?? null, lifeYears: book?.machines.lifeYears ?? null, financeRate: book?.machines.financeRate ?? null,
    rentGbpM2Yr: book?.machines.rentGbpPerM2Yr ?? null, capexGroups: book?.machines.groups.map(g => g.id) ?? [], capitalHeldFactor: book?.machines.capitalHeldFactor ?? null,
    materialsPriced: book ? Object.keys(book.materials).length : null,
    medianSourcedPct: ratchet[cc]?.medianSourcedPct ?? null, heldPct: ratchet[cc]?.heldPct ?? null,
  });
}
writeFileSync(`${RR}/world-2026-10/summary.json`, JSON.stringify(rows, null, 1));
console.log('| Country | Book | £1 = | Skilled £/h | Engineer £/h | Labour source | Power £/kWh | Gas £/kWh | Life yr | Finance | Capex groups | Materials priced | Median part on sourced rates |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.book} | ${r.fxToGBP} ${r.currency} | ${r.skilledGbpH.toFixed(2)} | ${r.engineerGbpH.toFixed(2)} | ${r.labourSource} | ${r.electricityGbpKwh.toFixed(3)} | ${r.gasGbpKwh.toFixed(3)} | ${r.lifeYears ?? '—'} | ${r.financeRate != null ? (r.financeRate * 100).toFixed(1) + '%' : '—'} | ${r.capexGroups.length} | ${r.materialsPriced ?? '—'} | ${r.medianSourcedPct ?? '—'}% |`);
void readdirSync;
