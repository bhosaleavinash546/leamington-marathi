/**
 * Cost every recorded real part (tests/fixtures/real-parts-baseline.json — measured geometry + stated answers) in a
 * set of countries through the product's own headless chain, and print JSON. Run it on two checkouts to get a
 * before / after table for a rate-book change:
 *
 *   npx tsx scripts/rate-refresh/uk-2026-10/compare.ts <fixture.json> > after.json
 */
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../../src/engine/rate-library.js';

const fixture = JSON.parse(readFileSync(process.argv[2] ?? 'tests/fixtures/real-parts-baseline.json', 'utf8')) as
  Array<{ part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }>;
const REGIONS = ['UK', 'IN', 'DE', 'PL', 'CN', 'MX', 'US'];
const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const out: Record<string, Record<string, { total: number | null; breakdown?: Record<string, number> }>> = {};
const log = console.log; console.log = () => {}; console.warn = () => {};
for (const p of fixture) {
  out[p.part] = {};
  for (const region of REGIONS) {
    const r = await costMeasuredPart(structuredClone(p.geometry), p.part,
      { partNumber: p.part, file: p.part, annualVolume: 50_000, ...(p.outcome.commodity ? { commodity: p.outcome.commodity } : {}) } as never,
      p.answers, region as never, { annualVolume: 50_000 } as never, lib, { partNumber: p.part, file: p.part, status: 'error' } as never) as
      { total?: number; breakdown?: Record<string, number> };
    out[p.part][region] = { total: r.total != null ? Math.round(r.total * 100) / 100 : null,
      ...(r.breakdown ? { breakdown: Object.fromEntries(Object.entries(r.breakdown).map(([k, v]) => [k, Math.round(v * 100) / 100])) } : {}) };
  }
}
log(JSON.stringify(out));
process.exit(0);
