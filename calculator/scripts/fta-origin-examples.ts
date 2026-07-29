/**
 * UK FTA / rules-of-origin impact on automotive parts.
 * Run:  npx tsx scripts/fta-origin-examples.ts
 */
import { computeLandedCost } from '../src/engine/landed-cost.js';
import { assessOrigin, originSummary } from '../src/engine/rules-of-origin.js';

const AS_OF = '2026-07-29';
const m = (n: number) => `£${n.toFixed(2)}`;

console.log('═'.repeat(94));
console.log(`UK FTA & RULES OF ORIGIN — EFFECT ON AUTOMOTIVE PARTS · as of ${AS_OF}`);
console.log('═'.repeat(94));

// ── 1. Same part, same supplier country — origin decides the duty ────────────
console.log('\n1. THE PREFERENCE IS NOT AUTOMATIC — same German supplier, two supply chains');
console.log('─'.repeat(94));
const scenarios = [
  ['EU-melted aluminium', 8.00],
  ['Chinese ingot, cast+machined in DE', 22.00],
  ['Chinese rough casting, only machined in DE', 30.00],
];
for (const [label, nonOrig] of scenarios as [string, number][]) {
  const r = computeLandedCost({
    exWorksCost: 41, commodity: 'cast_and_machine', originRegion: 'DE',
    partWeightKg: 2.8, annualVolume: 60000,
    nonOriginatingMaterialCost: nonOrig, asOfDate: AS_OF,
  });
  const o = r.origin!;
  console.log(`  ${label.padEnd(42)} NOM ${o.nonOriginatingPct.toFixed(1).padStart(5)}% ` +
    `→ ${(o.qualifies ? 'QUALIFIES' : 'FAILS').padEnd(9)} duty ${String(r.dutyRatePctApplied).padStart(4)}% ` +
    `→ landed ${m(r.totalLandedCost)}`);
}

// ── 2. The 1 January 2027 double cliff-edge ─────────────────────────────────
console.log('\n2. THE 1 JANUARY 2027 CLIFF EDGE — EV/battery rules of origin tighten');
console.log('─'.repeat(94));
const battery = assessOrigin({
  agreement: 'UK-EU TCA', productType: 'battery_pack',
  exWorksPrice: 4000, nonOriginatingMaterialCost: 2200,
  mfnDutyPct: 4.5, customsValueCif: 4100, asOfDate: AS_OF,
});
console.log(`  Battery pack, £4,000 ex-works, 55% non-originating content`);
console.log(`    Today  : ${originSummary(battery)}`);
console.log(`    From ${battery.future!.rule.from} (${battery.future!.daysUntil} days): ` +
  `limit tightens to ${battery.future!.rule.maxNonOriginatingPct}% → ` +
  `${battery.future!.qualifies ? 'still qualifies' : 'FAILS'}`);
console.log(`    Exposure if unmitigated: ${m(battery.costOfFailureGbp)}/pack`);

for (const t of ['vehicle', 'battery_pack', 'battery_cell'] as const) {
  const now = assessOrigin({
    agreement: 'UK-EU TCA', productType: t, exWorksPrice: 100,
    nonOriginatingMaterialCost: 50, mfnDutyPct: 4.5, asOfDate: AS_OF,
  });
  console.log(`    ${t.padEnd(14)} local content required: ` +
    `${now.rule!.minLocalContentPct}% today → ${now.future!.rule.minLocalContentPct}% from 2027`);
}
console.log(`\n    NOTE: UK CBAM also starts 2027-01-01. Two cost step-changes land on the SAME DAY.`);

// ── 3. Origin comparison across UK trade agreements ─────────────────────────
console.log('\n3. WHERE YOU SOURCE CHANGES THE DUTY — £41 machined aluminium housing');
console.log('─'.repeat(94));
console.log(`  ${'Origin'.padEnd(10)} ${'Agreement'.padEnd(24)} ${'Duty'.padStart(6)}  ${'Landed'.padStart(9)}   Basis`);
for (const region of ['CN', 'DE', 'IN', 'MX', 'TR', 'UK']) {
  const r = computeLandedCost({
    exWorksCost: 41, commodity: 'cast_and_machine', originRegion: region,
    partWeightKg: 2.8, annualVolume: 60000, asOfDate: AS_OF,
  });
  const basis = region === 'UK' ? 'domestic — no import'
    : r.preferenceApplied ? `${r.preferenceApplied} (origin ASSUMED)`
    : 'MFN — no preference';
  console.log(`  ${region.padEnd(10)} ${(r.preferenceApplied ?? '—').padEnd(24)} ` +
    `${String(r.dutyRatePctApplied).padStart(5)}%  ${m(r.totalLandedCost).padStart(9)}   ${basis}`);
}

console.log('\n' + '═'.repeat(94));
console.log('Every preference above is CONDITIONAL on rules of origin. Supply non-originating');
console.log('material cost to convert the assumption into a tested qualification.');
console.log('═'.repeat(94));
