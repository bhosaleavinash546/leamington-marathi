/**
 * Live landed-cost run — one real part per commodity, from the published
 * CostVision workbook, priced China → UK.
 *
 * Run:  npx tsx scripts/landed-cost-examples.ts
 */
import { computeLandedCost, landedCostSummary } from '../src/engine/landed-cost.js';
import type { CarbonEstimate } from '../src/engine/carbon.js';

const AS_OF = '2026-07-29';

const carbon = (materialKgCO2e: number, materialClass: string): CarbonEstimate => ({
  materialKgCO2e, processKgCO2e: 0, logisticsKgCO2e: 0,
  totalKgCO2e: materialKgCO2e, perNetKgCO2e: 0, gridKgPerKwh: 0.2,
  processKwh: 0, materialFactorKgPerKg: 0, materialClass, notes: [],
});

interface Example {
  name: string;
  commodity: string;
  exWorksCN: number;
  exWorksUK: number;
  weightKg: number;
  volume: number;
  carbon?: CarbonEstimate;
  steelMillProduct?: boolean;
  /** Chargeable volumetric weight where the part is bulk-limited. */
  volumetricWeightKg?: number;
}

// Ex-works figures are the published workbook results (China ex-works),
// with the UK base where the workbook reported one.
const EXAMPLES: Example[] = [
  {
    name: '1. Simple stamped bracket (1.2 mm CR steel, 4 bends, 6 holes)',
    commodity: 'sheet_metal', exWorksCN: 1.02, exWorksUK: 1.08,
    weightKg: 0.28, volume: 100000,
    carbon: carbon(0.28 / 0.717 * 2.1, 'Steel'),   // gross mass × steel factor
  },
  {
    name: '2. Formed + machined bracket (4 mm HR steel, CNC faces, 8× M8)',
    commodity: 'machining', exWorksCN: 10.74, exWorksUK: 15.56,
    weightKg: 2.15, volume: 80000,
    carbon: carbon(2.15 / 0.472 * 2.1, 'Steel'),
  },
  {
    name: '3. PC/ABS moulded housing (textured, 2-cavity, side-actions)',
    commodity: 'injection_moulding', exWorksCN: 2.08, exWorksUK: 2.24,
    weightKg: 0.28, volume: 250000,
    // A moulded housing is bulk-limited, not weight-limited: ~4 L of shipping
    // space at the 1000 kg/m3 sea-freight divisor ≈ 4 kg chargeable.
    volumetricWeightKg: 4.0,
    carbon: carbon(0.28 * 3.4, 'Thermoplastic'),
  },
  {
    name: '4. HPDC aluminium housing (A380, cast + 5-axis CNC)',
    commodity: 'cast_and_machine', exWorksCN: 40.99, exWorksUK: 62.42,
    weightKg: 2.8, volume: 60000,
    carbon: carbon(4.83 * 8.6, 'Aluminium (primary mix)'),  // poured mass × Al factor
  },
  {
    name: '5. 77 GHz radar board (8-layer HDI, ASIL-B, populated)',
    commodity: 'pcba', exWorksCN: 42.36, exWorksUK: 116.00,
    weightKg: 0.15, volume: 100000,
    carbon: carbon(0.15 * 12, 'Mixed electronics'),
  },
];

const money = (n: number) => `£${n.toFixed(2)}`;

console.log('═'.repeat(96));
console.log(`LANDED COST — CHINA → UK · one real part per commodity · as of ${AS_OF}`);
console.log('═'.repeat(96));

let allWarnings = 0;
for (const ex of EXAMPLES) {
  const cn = computeLandedCost({
    exWorksCost: ex.exWorksCN, commodity: ex.commodity, originRegion: 'CN',
    partWeightKg: ex.weightKg, annualVolume: ex.volume,
    carbon: ex.carbon, asOfDate: AS_OF, cbamScheme: 'UK',
    steelMillProduct: ex.steelMillProduct,
    volumetricWeightKg: ex.volumetricWeightKg,
  });
  const uk = computeLandedCost({
    exWorksCost: ex.exWorksUK, commodity: ex.commodity, originRegion: 'UK',
    partWeightKg: ex.weightKg, annualVolume: ex.volume,
    carbon: ex.carbon, asOfDate: AS_OF,
  });

  console.log(`\n${ex.name}`);
  console.log('─'.repeat(96));
  console.log(`  Commodity code : ${cn.hsCode} — ${cn.hsDescription}`);
  console.log(`  Duty applied   : ${cn.dutyRatePctApplied}%  (customs value CIF ${money(cn.customsValueCif)})`);
  console.log('');
  console.log(`  (a) EX-WORKS (China)                       ${money(cn.exWorksCost).padStart(10)}`);
  console.log(`  (b) LANDED ADDERS TO UK`);
  for (const a of cn.adders) {
    const tag = a.status === 'verified' ? ' ' : a.status === 'corroborated' ? '~' : '?';
    console.log(`        ${tag} ${a.label.padEnd(46)} ${money(a.amountGbp).padStart(9)}   ${a.basis}`);
  }
  console.log(`        ${''.padEnd(48)} ${('—'.repeat(9)).padStart(9)}`);
  console.log(`        ${'Total adders'.padEnd(48)} ${money(cn.addersTotal).padStart(9)}`);
  console.log('');
  console.log(`  (c) TOTAL LANDED COST — UK                 ${money(cn.totalLandedCost).padStart(10)}   (+${cn.upliftPct.toFixed(1)}% on ex-works)`);
  console.log('');
  console.log(`      UK-made comparison: ex-works ${money(uk.exWorksCost)} → landed ${money(uk.totalLandedCost)}`);
  const exwGap = ex.exWorksUK - ex.exWorksCN;
  const landedGap = uk.totalLandedCost - cn.totalLandedCost;
  if (landedGap < 0) {
    console.log(`      China advantage: ${money(exwGap)} ex-works → ADVANTAGE REVERSED once landed — ` +
      `UK is now cheaper by ${money(-landedGap)}`);
  } else if (exwGap > 0) {
    const eaten = ((exwGap - landedGap) / exwGap) * 100;
    console.log(`      China advantage: ${money(exwGap)} ex-works → ${money(landedGap)} landed ` +
      `(${eaten.toFixed(0)}% of the advantage consumed by landing)`);
  } else {
    console.log(`      China advantage: none ex-works (${money(exwGap)}); landed gap ${money(landedGap)}`);
  }
  console.log(`      Import VAT ${money(cn.recoverable.importVatGbp)} — RECOVERABLE, excluded from cost`);

  if (cn.futureLines.length) {
    console.log('');
    for (const f of cn.futureLines) {
      console.log(`      FUTURE: ${f.label} → ${money(f.amountGbp)}/part (not in today's cost)`);
    }
  }
  if (cn.warnings.length) {
    console.log('');
    for (const w of cn.warnings) { console.log(`      ! ${w}`); allWarnings++; }
  }
}

console.log('\n' + '═'.repeat(96));
console.log(`Legend:  (blank)=verified  ~=corroborated  ?=estimate (must be confirmed before commercial use)`);
console.log(`${allWarnings} warnings raised across ${EXAMPLES.length} examples.`);
console.log('═'.repeat(96));
