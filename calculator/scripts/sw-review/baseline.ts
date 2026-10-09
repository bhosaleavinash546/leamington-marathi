/**
 * Software costing — outputs snapshot for before / after comparison (review step 7).
 *
 *   npx tsx scripts/sw-review/baseline.ts <out.json>
 *
 * Records, for the default programme, every vehicle demo (incl. the ICE / MHEV / PHEV / BEV study variants) and the
 * validation back-test: total, NRE, lifecycle, £/vehicle, person-months, Monte Carlo P10/P50/P90 and the per-category
 * split. Built only from the app's own code (engine + the screen's demo builder), so the same script runs on any commit.
 */
import { writeFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs } from '../../src/engine/sw-should-cost.js';
import { runValidation } from '../../src/engine/sw-validation.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../../src/ui/panels/sw-should-cost-ui.js';
import type { SWProgramInputs } from '../../src/engine/sw-should-cost.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
function snap(p: SWProgramInputs) {
  const r = computeSWProgram(p);
  const s = r.summary;
  return {
    modules: r.modules.length,
    total: r2(s.grandTotal), nre: r2(s.nreTotal), lifecycle: r2(s.totalMaintenance + s.totalCloud + s.totalLicensing),
    perVehicle: r2(s.perVehicle), personMonths: r2(s.totalPersonMonths),
    // Added with the P2 fixes (#9); absent on older commits.
    effortPersonMonths: (s as { totalEffortPersonMonths?: number }).totalEffortPersonMonths ?? null,
    licensing: r2(s.totalLicensing),
    development: r2(s.totalDevelopment), testing: r2(s.totalTesting), cybersecurity: r2(s.totalCybersecurity),
    p10: r2(r.monteCarlo.p10), p50: r2(r.monteCarlo.p50), p90: r2(r.monteCarlo.p90),
    byCategory: Object.fromEntries(Object.entries(s.byCategory).map(([k, v]) => [k, r2(v)])),
  };
}
const out = {
  generated: new Date().toISOString(),
  default: snap(defaultSWProgramInputs()),
  demos: Object.fromEntries(SW_VEHICLE_DEMOS.map(d => [d.id, { label: d.label, ...snap(buildVehicleInputs(d)) }])),
  validation: runValidation().cases.map(c => ({ programme: c.programme, modelled: r2(c.modelledTotalGBP), published: c.publishedTotalGBP, variancePct: r2(c.totalVariancePct), perVehicle: r2(c.modelledPerVehicle) })),
};
const file = process.argv[2] ?? 'sw-baseline.json';
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`wrote ${file}: default £${(out.default.total / 1e6).toFixed(1)}M, ${Object.keys(out.demos).length} demos, ${out.validation.length} validation cases`);
