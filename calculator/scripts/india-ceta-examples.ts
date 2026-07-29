/**
 * UK-India CETA — India → UK automotive sourcing.
 * Run:  npx tsx scripts/india-ceta-examples.ts
 */
import { assessOrigin } from '../src/engine/rules-of-origin.js';
import { computeLandedCost } from '../src/engine/landed-cost.js';

const AS_OF = '2026-07-29';
const m = (n: number) => `£${n.toFixed(2)}`;

console.log('═'.repeat(92));
console.log('UK-INDIA CETA — INDIA → UK AUTOMOTIVE PARTS · in force 15 July 2026');
console.log('═'.repeat(92));

console.log('\nSAME INDIAN SUPPLIER, THREE SUPPLY CHAINS — £41 machined aluminium housing');
console.log('─'.repeat(92));
const chains: [string, number][] = [
  ['Indian bauxite → billet → cast + machined', 8],
  ['Imported Al ingot, cast + machined in India', 22],
  ['Chinese rough casting, only machined in India', 30],
];
for (const [label, nom] of chains) {
  const r = computeLandedCost({
    exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'IN',
    partWeightKg: 2.8, annualVolume: 60000,
    nonOriginatingMaterialCost: nom, asOfDate: AS_OF,
  });
  const o = r.origin!;
  console.log(`  ${label.padEnd(46)} NOM ${o.nonOriginatingPct.toFixed(1).padStart(5)}% → ` +
    `${(o.qualifies ? 'QUALIFIES' : 'FAILS').padEnd(9)} duty ${String(r.dutyRatePctApplied).padStart(4)}% → landed ${m(r.totalLandedCost)}`);
}

console.log('\nWHEN THE VALUE TEST FAILS, THE TOOL DOES NOT SIMPLY REFUSE');
console.log('─'.repeat(92));
const fail = assessOrigin({
  agreement: 'UK-India CETA', exWorksPrice: 41, nonOriginatingMaterialCost: 30,
  mfnDutyPct: 4.5, customsValueCif: 41.8, asOfDate: AS_OF,
});
console.log(`  Verdict: value test FAILS at ${fail.nonOriginatingPct.toFixed(1)}% vs ${fail.thresholdPct}% limit ` +
  `· exposure ${m(fail.costOfFailureGbp)}/part`);
for (const n of fail.notes.filter(x => /Alternative|ACTION/.test(x))) console.log(`  • ${n}`);

console.log('\nTHE THREE CETA VALUE METHODS — the threshold depends on which you use');
console.log('─'.repeat(92));
const rule = fail.rule!;
console.log(`  Build-down (ex-works)  QVC 40%  → non-originating ≤ ${rule.maxNonOriginatingPct}%   [CostVision default — matches our data]`);
for (const alt of rule.alternativeRoutes ?? []) {
  const lim = alt.maxNonOriginatingPct !== undefined ? `→ non-originating ≤ ${alt.maxNonOriginatingPct}%` : '→ different formula';
  console.log(`  ${alt.label.padEnd(38)} ${lim}`);
}

console.log('\nINDIA vs OTHER ORIGINS — £41 housing landed into the UK');
console.log('─'.repeat(92));
for (const region of ['IN', 'CN', 'DE', 'UK']) {
  const r = computeLandedCost({
    exWorksCost: 41, commodity: 'cast_and_machine', originRegion: region,
    partWeightKg: 2.8, annualVolume: 60000,
    nonOriginatingMaterialCost: 8, asOfDate: AS_OF,
  });
  console.log(`  ${region.padEnd(4)} ${(r.preferenceApplied ?? 'MFN / domestic').padEnd(20)} ` +
    `duty ${String(r.dutyRatePctApplied).padStart(4)}%  landed ${m(r.totalLandedCost).padStart(8)}`);
}
console.log('\n' + '═'.repeat(92));
