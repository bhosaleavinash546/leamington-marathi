/**
 * PCB country-rate refresh — the 14-country fab/assembly table in
 * server/data/pcb-country-rates.ts, moved with the same config as the main library.
 *
 *   npx tsx scripts/pcb-rate-refresh.ts scripts/rate-refresh/2026-09.json [--write]
 *
 * Rules (the config's `pcb` block holds every number and its source):
 *  - every £ price in a country block moves by that country's market FX change
 *    (config fxJan → fxNow; the table says it was calibrated to Jan 2026 FX);
 *  - the assembly labour rate also moves by local wage growth over `months`;
 *  - freight, duty, lead times, quality and risk scores are not prices and are held;
 *  - the UK electricity tariff is set to the library's, so the two cannot disagree;
 *  - the stored fxToGBP label is set to today's rate. Run twice and it refuses,
 *    because the stored label no longer matches the config's January basis.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cfg = JSON.parse(readFileSync(resolve(process.cwd(), process.argv[2]), 'utf8'));
const P = cfg.pcb;
const FILE = resolve(import.meta.dirname, '..', 'server/data/pcb-country-rates.ts');
let src = readFileSync(FILE, 'utf8');
const log: string[] = [];
const sig = (n: number) => Number(n.toPrecision(4));

const PRICE_FIELDS = ['baseCostPerDm2_2L', 'layerAdderPerDm2', 'setupCostGBP', 'viaAdderPer100Through', 'viaAdderPer10Blind',
  'viaAdderPer10Micro', 'smtLineRatePerHr', 'thRatePerJoint', 'manualSolderPerJoint', 'aoiPerBoard', 'xrayPerBoard',
  'ictPerBoard', 'conformalCoatPerCm2', 'batchSetupGBP'];

const start = src.indexOf('export const PCB_COUNTRY_RATES');
for (const id of Object.keys(P.fxJan)) {
  const at = src.indexOf(`\n  ${id}: {\n    id: '${id}'`, start);
  if (at < 0) throw new Error(`country ${id} not found`);
  const end = src.indexOf('\n  },\n', at);
  let block = src.slice(at, end);
  const fxF = P.fxJan[id] / P.fxNow[id];
  const wage = Math.pow(1 + P.wages[id].annual, P.months / 12);
  for (const f of PRICE_FIELDS) {
    block = block.replace(new RegExp(`(\\b${f}: )([0-9.]+)`), (_m, p, v) => { const nv = sig(Number(v) * fxF); log.push(`${id}.${f}: ${v} → ${nv}`); return `${p}${nv}`; });
  }
  block = block.replace(/(\blabourRatePerHr: )([0-9.]+)/, (_m, p, v) => { const nv = Number((Number(v) * fxF * wage).toFixed(2)); log.push(`${id}.labourRatePerHr: ${v} → ${nv} (FX ×${fxF.toFixed(4)}, wages ×${wage.toFixed(4)})`); return `${p}${nv}`; });
  block = block.replace(/(fxToGBP: )([0-9.]+)/, (_m, p, v) => {
    if (id !== 'gb' && Number(v) === P.fxNow[id]) throw new Error(`${id}: fxToGBP already ${v} — this table has been refreshed; restore it before re-running`);
    return `${p}${P.fxNow[id]}`;
  });
  block = block.replace(/dataYear: 2026,/, `dataYear: 2026, ratesAsOf: '${cfg.asOf}',`);
  src = src.slice(0, at) + block + src.slice(end);
}

// NRE (mkNRE(ppap, fmea, dvpr, fai, audit) — all £) and energy/packaging per country.
src = src.replace(/^(  (\w\w): mkNRE\()([^)]*)\)/gm, (_m, head, id, args: string) => {
  if (!P.fxJan[id]) return _m;
  const fxF = P.fxJan[id] / P.fxNow[id];
  return head + args.split(',').map(a => String(Math.round(Number(a) * fxF))).join(', ') + ')';
});
src = src.replace(/^(  (\w\w): \{ kwh: )([0-9.]+)(, pack: )([0-9.]+)( \})/gm, (_m, h, id, kwh, mid, pack, tail) => {
  if (!P.fxJan[id]) return _m;
  const fxF = P.fxJan[id] / P.fxNow[id];
  const k = id === 'gb' ? P.ukElectricity : Number((Number(kwh) * fxF).toFixed(3));
  const pk = Number((Number(pack) * fxF).toFixed(3));
  log.push(`${id}.energy £/kWh: ${kwh} → ${k}; packaging £/board: ${pack} → ${pk}`);
  return `${h}${k}${mid}${pk}${tail}`;
});
src = src.replace(/calibrated to Jan 2026 FX mid-rates\./, `calibrated to Jan 2026 FX mid-rates; re-based to ${cfg.asOf} FX and wages by scripts/pcb-rate-refresh.ts (${P.fxSource}).`);

console.log(log.join('\n'));
if (process.argv.includes('--write')) { writeFileSync(FILE, src); console.log('written.'); } else console.log('dry run — pass --write');
