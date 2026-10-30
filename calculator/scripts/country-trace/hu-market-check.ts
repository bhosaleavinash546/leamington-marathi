/**
 * Hungary: the tool's scaled figures against Hungarian market prices found in the research (Oct 2026) — the
 * "if it uses a multiplier, is it at market" check. Prints tool v market for each service with a Hungarian price.
 *   npx tsx scripts/country-trace/hu-market-check.ts
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, REGIONAL_DATA, toolroomFactorFor } from '../../src/engine/regional-rates.js';
import { computeHeatTreatRate } from '../../src/engine/gear-heat-treat-rate.js';
import { withRates } from '../../src/engine/rate-context.js';
import { heatTreatServiceFactor, processServiceFactor, ndtServiceFactor, engineerFactor } from '../../src/engine/regional-services.js';

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const HU = buildRegionalLibrary(UK, 'HU');
const FX = REGIONAL_DATA.HU.fxToGBP;
const R = Object.fromEntries((JSON.parse(readFileSync('scripts/rate-refresh/hungary-2026-10/research/overhead-logistics-services.json', 'utf8')).items as Array<{ key: string; value: unknown }>).map(i => [i.key, i.value]));
const ft = (gbp: number) => Math.round(gbp * FX);
const m = (id: string) => HU.machines.find(x => x.id === id)!.computedRatePerHr;
const l = (id: string) => HU.labour.find(x => x.id === id)!.fullyLoadedRatePerHr;
const oh = 1 + Math.round(12 * REGIONAL_DATA.HU.overheadMultiplier) / 100, mg = 1.08;
const rows: Array<[string, number, number, string]> = [];
// CNC job-shop hour: the tool's machine + operator, with its overhead and margin
const cnc3 = (m('mach-vmc3') + l('lab-uk-skilled')) * oh * mg;
rows.push(['CNC 3-axis job-shop hour (machine + operator + overhead + margin)', ft(cnc3), Number(R['services.cncJobShopPerHr.3axis']), 'Ft/h']);
const cnc5 = (m('mach-vmc5') + l('lab-uk-skilled')) * oh * mg;
rows.push(['CNC 5-axis job-shop hour', ft(cnc5), Number(R['services.cncJobShopPerHr.5axis']), 'Ft/h']);
// heat treatment: the tool's quench & temper service rate in Hungary
const qt = withRates(HU, () => computeHeatTreatRate('quench_temper', 'HU').ratePerKg);
rows.push(['Quench & temper service', ft(qt), Number(R['services.heatTreat.quenchTemperPerKg']), 'Ft/kg']);
console.log('Hungary — the tool v Hungarian market prices (research, Oct 2026; market figures read from search extracts)');
for (const [what, tool, market, unit] of rows) console.log(`  ${what}: tool ${tool.toLocaleString()} ${unit} v market ${market.toLocaleString()} ${unit} → ${((tool / market - 1) * 100).toFixed(0)}%`);
console.log(`  factors: toolroom ${toolroomFactorFor('HU')}, heat treat ${heatTreatServiceFactor('HU')}, process ${processServiceFactor('HU')}, NDT ${ndtServiceFactor('HU')}, engineer ${engineerFactor('HU')}`);
