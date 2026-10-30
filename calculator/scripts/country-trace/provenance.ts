/**
 * Country rate provenance — CLI over `provenance-lib.ts` (see its header for the classes).
 *   npx tsx scripts/country-trace/provenance.ts [out.json] [CN,IN,PL,HU]
 */
import { writeFileSync } from 'node:fs';
import { provenanceFor } from './provenance-lib.js';
import type { ManufacturingRegion } from '../../src/engine/regional-rates.js';

const OUT = process.argv[2] ?? 'country-provenance.json';
const REGIONS = (process.argv[3] ?? 'CN,IN,PL,HU').split(',') as ManufacturingRegion[];
const out: Record<string, unknown> = {};
for (const region of REGIONS) {
  const x = await provenanceFor(region);
  out[region] = x;
  const p = x.sharePct;
  console.log(`${region}: ${x.parts} parts £${x.totalGbp.toFixed(2)} — median part ${x.medianPartOwnPct}% own, ${x.medianPartSourcedPct}% sourced (own + at par on a sourced price); `
    + `basket: own ${p.own}% · at par sourced ${p.parSourced}% · held machine capital ${p.heldCap}% · material ×factor ${p.matFactor}% · derived ${p.derived}% · held multipliers ${p.heldMult}% · margin ${p.margin}%`
    + `${x.perPart.every(q => q.reconciles) ? '' : ' (SOME PARTS DO NOT RECONCILE)'}`);
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
