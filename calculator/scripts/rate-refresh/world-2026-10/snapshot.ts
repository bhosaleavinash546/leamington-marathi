/**
 * Freeze each country's book as it stands BEFORE its world-round rate book (UK book × REGIONAL_DATA.<cc>), in the
 * country's currency, so the generator's "current" column never reports new-as-current.
 *
 *   npx tsx scripts/rate-refresh/world-2026-10/snapshot.ts FR IT ES …      # writes books/<cc>/current-book.json
 *
 * Run ONCE, before the first book of the round is written; a re-run after a book exists refuses (it would freeze the
 * new rates as "current").
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../../src/engine/rate-library.js';
import { REGIONAL_DATA, buildRegionalLibrary, type ManufacturingRegion } from '../../../src/engine/regional-rates.js';
import { COUNTRY_BOOKS } from '../../../src/engine/country-books.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const r2 = (n: number) => Math.round(n * 100) / 100;
const ukM = new Map(UK.machines.map(m => [m.id, m])), ukMat = new Map(UK.materials.map(m => [m.id, m]));

for (const region of process.argv.slice(2) as ManufacturingRegion[]) {
  const RD = REGIONAL_DATA[region];
  if (!RD) throw new Error(`no region ${region}`);
  if (COUNTRY_BOOKS[region]) throw new Error(`${region} already has a book — a snapshot now would freeze the new rates`);
  const out = resolve(HERE, 'books', region.toLowerCase(), 'current-book.json');
  if (existsSync(out)) { console.log(`${region}: snapshot exists, kept`); continue; }
  const lib = buildRegionalLibrary(UK, region);
  const FX = RD.fxToGBP, cur = RD.currency.toLowerCase();
  const snap = {
    fx: FX, note: `current ${RD.name} book (UK book × REGIONAL_DATA.${region}), 30 Oct 2026 — frozen before the world-round rate book`,
    regional: RD,
    labour: lib.labour.filter(l => l.id.startsWith('lab-uk-')).map(l => ({ id: l.id, role: l.skillLevel, [`${cur}PerHr`]: r2(l.fullyLoadedRatePerHr * FX), gbp: r2(l.fullyLoadedRatePerHr), source: l.sourceNote })),
    energy: lib.energy.map(e => ({ id: e.id, elec: r2(e.electricityPerKwh * FX), gas: r2(e.gasPerKwh * FX) })),
    machines: lib.machines.map(m => ({ id: m.id, class: m.machineClass, [`${cur}PerHr`]: r2(m.computedRatePerHr * FX), ukGbpPerHr: r2(ukM.get(m.id)!.computedRatePerHr),
      hours: m.buildup?.annualAvailableHours, util: m.buildup?.machineUtilization })),
    materials: lib.materials.map(m => ({ id: m.id, grade: m.grade, category: m.category, [`${cur}PerKg`]: r2(m.pricePerKg * FX), ukGbpPerKg: ukMat.get(m.id)!.pricePerKg,
      confidence: m.confidence, source: m.sourceNote.slice(0, 300) })),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snap, null, 1));
  console.log(`${region}: ${snap.materials.length} materials, ${snap.machines.length} machines, ${snap.labour.length} labour; FX ${FX} ${RD.currency}`);
}
