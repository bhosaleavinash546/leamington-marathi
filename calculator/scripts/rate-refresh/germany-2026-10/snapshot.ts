/**
 * Freeze the Germany book as it stands BEFORE the Germany rate book (UK book × REGIONAL_DATA.DE), in EUR, so the
 * generator's "current" column never reports new-as-current.  npx tsx scripts/rate-refresh/germany-2026-10/snapshot.ts
 */
import { writeFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../../src/engine/rate-library.js';
import { REGIONAL_DATA, buildRegionalLibrary } from '../../../src/engine/regional-rates.js';

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const DE = buildRegionalLibrary(UK, 'DE');
const FX = REGIONAL_DATA.DE.fxToGBP;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ukM = new Map(UK.machines.map(m => [m.id, m])), ukMat = new Map(UK.materials.map(m => [m.id, m]));
const out = {
  fx: FX, note: 'current Germany book (UK book 2026-10 × REGIONAL_DATA.DE), Oct 2026 — frozen before the Germany rate book',
  regional: REGIONAL_DATA.DE,
  labour: DE.labour.filter(l => l.id.startsWith('lab-uk-')).map(l => ({ id: l.id, role: l.skillLevel, eurPerHr: r2(l.fullyLoadedRatePerHr * FX), gbp: r2(l.fullyLoadedRatePerHr), source: l.sourceNote })),
  energy: DE.energy.map(e => ({ id: e.id, eurElec: r2(e.electricityPerKwh * FX), eurGas: r2(e.gasPerKwh * FX) })),
  machines: DE.machines.map(m => ({ id: m.id, class: m.machineClass, eurPerHr: r2(m.computedRatePerHr * FX), ukGbpPerHr: r2(ukM.get(m.id)!.computedRatePerHr),
    hours: m.buildup?.annualAvailableHours, util: m.buildup?.machineUtilization, buildupEur: m.buildup ? Object.fromEntries(Object.entries(m.buildup).map(([k, v]) => [k, k.startsWith('annual') && k !== 'annualDepreciation' || k === 'machineUtilization' ? v : r2((v as number) * FX)])) : null })),
  materials: DE.materials.map(m => ({ id: m.id, grade: m.grade, category: m.category, eurPerKg: r2(m.pricePerKg * FX), ukGbpPerKg: ukMat.get(m.id)!.pricePerKg,
    scrapEurPerKg: r2(m.scrapRecoveryPricePerKg * FX), confidence: m.confidence, source: m.sourceNote.slice(0, 300) })),
};
writeFileSync(new URL('./current-germany-book.json', import.meta.url), JSON.stringify(out, null, 1));
const tsv = (filter: (c: string) => boolean, name: string) => writeFileSync(new URL(`./materials-${name}.tsv`, import.meta.url),
  'id\tgrade\tcategory\tcurrent_EUR_per_kg\n' + out.materials.filter(m => filter(m.category)).map(m => `${m.id}\t${m.grade}\t${m.category}\t${m.eurPerKg}`).join('\n') + '\n');
const FERR = /steel|iron|stainless|electrical|sheet|billet|bar|coil|forging/i, NONF = /alumin|copper|brass|bronze|zinc|magnes|titan|nickel|gunmetal|lead|tin|superalloy|winding|die cast/i;
tsv(c => FERR.test(c) && !NONF.test(c), 'ferrous');
tsv(c => NONF.test(c), 'nonferrous');
tsv(c => !FERR.test(c) && !NONF.test(c), 'polymer');
writeFileSync(new URL('./machines-list.txt', import.meta.url), out.machines.map(m => `${m.id} | ${m.class} | €${m.eurPerHr}/h | ${m.hours} h × ${m.util}`).join('\n') + '\n');
console.log(`Germany snapshot: ${out.materials.length} materials, ${out.machines.length} machines, ${out.labour.length} labour; FX ${FX}`);
