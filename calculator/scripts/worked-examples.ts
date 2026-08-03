/**
 * Worked examples CLI — regenerate the two end-to-end examples used in the
 * "How CostVision Actually Works" explainer deck, straight from the engine.
 *
 *   npm run examples            # print both, check them against the deck
 *   npm run examples -- --json  # machine-readable, for diffing between runs
 *
 * Why this exists: the deck quotes ~40 specific figures. They must be the
 * engine's output, not a hand-worked example that drifts away from the code.
 * The EXPECTED block below pins what the deck currently claims; when the rate
 * library or a commodity module moves, this exits non-zero and names every
 * figure that changed, so the deck gets corrected instead of quietly going stale.
 *
 * Deliberately NOT a unit test: the numbers are allowed to change (rates move
 * every quarter). What must not happen is them changing without anyone noticing.
 */
import { computeCastAndMachineDrivers } from '../src/engine/modules/cast-and-machine.js';
import { computeInjectionMouldingDrivers, pickIMMPressId, estimateClampingTonnage }
  from '../src/engine/modules/injection-moulding.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { computeCostUncertainty } from '../src/engine/uncertainty.js';
import { pickHPDCMachineId } from '../src/engine/machine-sizing.js';
import type { MachiningOperation } from '../src/engine/modules/machining.js';
import type { PartCostResult, UniversalStackInput } from '../src/engine/types.js';

const json = process.argv.includes('--json');
const VOLUME = 60_000;
const REGIONS = ['CN', 'IN', 'MX', 'UK'] as const;
/** Fixed seed — the Monte-Carlo band must be reproducible run to run. */
const SEED = 20260803;

const L = DEFAULT_RATE_LIBRARY;
const machineRate = (id: string) => L.machines.find(m => m.id === id)!.computedRatePerHr;
const labourRate = (id: string) => L.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
const materialPrice = (id: string) => L.materials.find(m => m.id === id)!.pricePerKg;

/** Commercial policy applied to both examples so the two are comparable. */
const POLICY = { overheadPct: 0.12, marginPct: 0.09 };

// ─── Example 1 · high-pressure die-cast aluminium housing ────────────────────

function dieCastHousing() {
  // 1,250 t of clamp force required from the projected area; the ladder in
  // machine-sizing.ts picks the press, we never hard-code one.
  const pressId = pickHPDCMachineId(1250);

  const op = (operationName: string, machineId: string, labourId: string, cycleTimeHr: number) => ({
    operationName, machineId, labourId, cycleTimeHr, partsPerCycle: 1,
    oee: 0.85, manning: 0.5, labourTimeHr: cycleTimeHr, labourEfficiency: 0.9,
  });

  const drivers = computeCastAndMachineDrivers({
    castingSubtype: 'hpdc',
    materialId: 'mat-adc12',
    castPartWeightKg: 2.8,      // finished weight; the module grosses it up by the yield
    finishedWeightKg: 2.8,
    castingYield: 0.58,         // → 4.83 kg poured
    rejectRate: 0.02,
    castingLabourId: 'lab-uk-foundry',
    castingOee: 0.85, castingManning: 0.5, castingLabourEfficiency: 0.9,
    hpdc: { machineId: pressId, cycleTimeSec: 55, cavities: 1, dieCost: 120_000, dieLife: 150_000 },
    geometryComplexity: 3,
    machiningOps: [
      op('Mill 2 faces flat', 'mach-vmc5', 'lab-uk-skilled', 0.110),
      op('Bore + ream 2 bores', 'mach-vmc5', 'lab-uk-skilled', 0.085),
      op('Drill + tap 16 holes', 'mach-drill', 'lab-uk-semiskilled', 0.070),
      op('Leak test, deburr, wash', 'mach-grind', 'lab-uk-inspector', 0.050),
    ] as unknown as MachiningOperation[],
    machiningSetup: { setupTimeHr: 1.5, batchSize: 500, machineId: 'mach-vmc5', labourId: 'lab-uk-skilled' },
    machiningToolingCost: 8_000,
    machiningProgrammingNRE: 2_500,
    amortizationVolume: VOLUME,
  });

  const input: UniversalStackInput = {
    partName: 'Die-cast aluminium housing', ...drivers,
    packagingPerPart: 0.60, logisticsPerPart: 1.10, ...POLICY,
  };
  return { name: 'Die-cast aluminium housing', headlineRegion: 'CN' as const, pressId, input };
}

// ─── Example 2 · injection-moulded front bumper fascia ───────────────────────

function bumperFascia() {
  const projectedAreaCm2 = 9_900;   // ~1,800 x 550 mm shadow in the draw direction
  const cavityPressureMPa = 25;     // large thin-wall PP
  const clampTonnes = estimateClampingTonnage({ projectedAreaCm2, cavityPressureMPa });
  const pressId = pickIMMPressId(clampTonnes);

  const drivers = computeInjectionMouldingDrivers({
    materialId: 'mat-pp-t20',
    partWeightKg: 4.2, runnerWeightKg: 0, regrindFraction: 0,
    runnerSystem: 'hot',            // hot runner → shot weight IS the part weight
    cavities: 1, projectedAreaCm2, cavityPressureMPa,
    wallThicknessMm: 3.0, coolTimeFactorSPerMm2: 3.16,
    fillTimeSec: 4.5, packTimeSec: 12, ejectTimeSec: 9,
    machineId: pressId, labourId: 'lab-uk-semiskilled',
    oee: 0.85, manning: 0.5, labourEfficiency: 0.9,
    // A quoted tool, not a parametric guess. The module applies the Class-A
    // finish uplift on top (x1.6), which is what takes it to £672k.
    mouldCost: 420_000, mouldLife: 1_000_000, amortizationVolume: VOLUME,
    toleranceMm: 0.5, surfaceFinishGrade: 'painted', rejectRate: 0.02,
    steelClass: 'production', sideActionsLifters: 6, hotRunnerDrops: 6,
  });

  const input: UniversalStackInput = {
    partName: 'Front bumper fascia', ...drivers,
    packagingPerPart: 1.20, logisticsPerPart: 2.40, ...POLICY,
  };
  return { name: 'Front bumper fascia (unpainted, ex-works)', headlineRegion: 'CN' as const, clampTonnes, pressId, input };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

const gbp = (n: number) => `£${n.toFixed(2)}`;
const BUCKETS = ['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'] as const;

function regionTotals(input: UniversalStackInput) {
  const out: Record<string, PartCostResult> = {};
  for (const r of REGIONS) out[r] = computeUniversalStack(input, buildRegionalLibrary(L, r));
  return out;
}

function printExample(label: string, input: UniversalStackInput, headlineRegion: typeof REGIONS[number]) {
  const uk = computeUniversalStack(input, L);
  console.log(`\n${'═'.repeat(78)}\n  ${label}\n${'═'.repeat(78)}`);

  console.log('\n  Operations (UK rates) — machine £ = £/hr x cycle time / OEE');
  console.log(`  ${'operation'.padEnd(26)} ${'machine'.padEnd(12)} ${'£/hr'.padStart(8)} ${'cycle'.padStart(8)} ${'charged'.padStart(8)} ${'mach'.padStart(7)} ${'lab'.padStart(6)} ${'cost'.padStart(8)}`);
  let chargedHr = 0, makingCost = 0;
  for (const o of uk.operationDetails) {
    const charged = o.cycleTimeHr / o.oee;
    const cost = o.processCost + o.labourCost;
    chargedHr += charged; makingCost += cost;
    console.log(`  ${(o.operationName || '(op)').slice(0, 26).padEnd(26)} ${o.machineId.padEnd(12)} ${o.machineRateUsed.toFixed(2).padStart(8)} ${o.cycleTimeHr.toFixed(4).padStart(8)} ${charged.toFixed(4).padStart(8)} ${o.processCost.toFixed(2).padStart(7)} ${o.labourCost.toFixed(2).padStart(6)} ${gbp(cost).padStart(8)}`);
  }
  console.log(`  ${'MACHINE + LABOUR'.padEnd(26)} ${''.padEnd(12)} ${''.padStart(8)} ${''.padStart(8)} ${chargedHr.toFixed(4).padStart(8)} ${''.padStart(7)} ${''.padStart(6)} ${gbp(makingCost).padStart(8)}`);

  const regions = regionTotals(input);
  const head = regions[headlineRegion];
  console.log(`\n  Eight buckets — ${headlineRegion}`);
  for (const b of BUCKETS) console.log(`    ${b.padEnd(14)} ${gbp(head.breakdown[b]).padStart(9)}`);
  const sum = BUCKETS.reduce((s, b) => s + head.breakdown[b], 0);
  console.log(`    ${'TOTAL'.padEnd(14)} ${gbp(head.total).padStart(9)}   (buckets sum to ${gbp(sum)})`);

  console.log('\n  Same part, priced elsewhere');
  for (const r of REGIONS) console.log(`    ${r}  ${gbp(regions[r].total).padStart(9)}`);

  const u = computeCostUncertainty(head, input, { seed: SEED });
  console.log(`\n  Confidence band (${headlineRegion}, ${SEED} seed):  P10 ${gbp(u.p10)}   point ${gbp(head.total)}   P90 ${gbp(u.p90)}   ±${u.plusMinusPct.toFixed(1)}%`);

  return {
    makingCost, chargedHr,
    buckets: Object.fromEntries(BUCKETS.map(b => [b, head.breakdown[b]])),
    totals: Object.fromEntries(REGIONS.map(r => [r, regions[r].total])),
    band: { p10: u.p10, p90: u.p90, plusMinusPct: u.plusMinusPct },
  };
}

// ─── What the deck currently says ────────────────────────────────────────────
// Update these when the deck is updated — never the other way round.

const EXPECTED: Record<string, Record<string, number>> = {
  housing: {
    makingCost: 32.57, tooling: 2.17,
    CN: 38.55, IN: 37.17, MX: 40.44, UK: 59.60,
    p10: 32.31, p90: 45.38,
  },
  bumper: {
    // £5.5063 machine + £0.1682 labour. Adding the deck's 2dp components gives
    // £5.68; the engine's own total is £5.67 — the deck footnotes the penny.
    makingCost: 5.67, tooling: 11.20,
    CN: 26.08, IN: 26.13, MX: 27.04, UK: 31.06,
    p10: 19.83, p90: 33.16,
  },
};

function checkAgainstDeck(key: string, actual: Record<string, number>): string[] {
  const drift: string[] = [];
  for (const [field, want] of Object.entries(EXPECTED[key])) {
    const got = actual[field];
    if (got === undefined) continue;
    // 1p tolerance: the deck quotes 2dp, so anything larger is a real change.
    if (Math.abs(got - want) > 0.005) drift.push(`  ${key}.${field}: deck says ${gbp(want)}, engine now says ${gbp(got)}`);
  }
  return drift;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const housing = dieCastHousing();
const bumper = bumperFascia();

if (!json) {
  console.log('\nRate-library anchors used by both examples');
  console.log(`  HPDC press (sized from the ladder) : ${housing.pressId}  ${gbp(machineRate(housing.pressId))}/hr`);
  console.log(`  IM press: ${bumper.clampTonnes.toFixed(0)} t needed     : ${bumper.pressId}  ${gbp(machineRate(bumper.pressId))}/hr`);
  console.log(`  5-axis CNC / drill-tap / finish    : ${gbp(machineRate('mach-vmc5'))} / ${gbp(machineRate('mach-drill'))} / ${gbp(machineRate('mach-grind'))} per hr`);
  console.log(`  ADC12 / PP-T20                     : ${gbp(materialPrice('mat-adc12'))} / ${gbp(materialPrice('mat-pp-t20'))} per kg`);
  console.log(`  Labour skilled / semi / foundry    : ${gbp(labourRate('lab-uk-skilled'))} / ${gbp(labourRate('lab-uk-semiskilled'))} / ${gbp(labourRate('lab-uk-foundry'))} per hr`);
  console.log(`  Rate library ${L.version}, last modified ${L.lastModified}`);
}

const h = printExampleQuiet(housing.name, housing.input, housing.headlineRegion);
const b = printExampleQuiet(bumper.name, bumper.input, bumper.headlineRegion);

function printExampleQuiet(label: string, input: UniversalStackInput, region: typeof REGIONS[number]) {
  if (json) {
    const uk = computeUniversalStack(input, L);
    const regions = regionTotals(input);
    const head = regions[region];
    const u = computeCostUncertainty(head, input, { seed: SEED });
    let makingCost = 0;
    for (const o of uk.operationDetails) makingCost += o.processCost + o.labourCost;
    return {
      makingCost,
      buckets: Object.fromEntries(BUCKETS.map(k => [k, head.breakdown[k]])),
      totals: Object.fromEntries(REGIONS.map(r => [r, regions[r].total])),
      band: { p10: u.p10, p90: u.p90, plusMinusPct: u.plusMinusPct },
    };
  }
  return printExample(label, input, region);
}

const flat = (x: ReturnType<typeof printExampleQuiet>) => ({
  makingCost: x.makingCost, tooling: x.buckets.tooling,
  ...x.totals, p10: x.band.p10, p90: x.band.p90,
});

if (json) {
  console.log(JSON.stringify({ housing: h, bumper: b }, null, 2));
} else {
  const drift = [...checkAgainstDeck('housing', flat(h)), ...checkAgainstDeck('bumper', flat(b))];
  console.log(`\n${'─'.repeat(78)}`);
  if (drift.length === 0) {
    console.log('  Deck check: OK — every pinned figure still matches the explainer deck.');
  } else {
    console.log(`  Deck check: ${drift.length} figure(s) have MOVED since the deck was written:\n`);
    console.log(drift.join('\n'));
    console.log('\n  Update the deck (and the EXPECTED block in this file) before presenting it.');
    process.exitCode = 1;
  }
  console.log(`${'─'.repeat(78)}\n`);
}
