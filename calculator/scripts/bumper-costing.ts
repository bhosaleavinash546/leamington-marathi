/* One-off: Manual vs CAD-to-Cost should-cost for the BUMPER.stp front bumper.
   Injection moulding, China (CN), 100k/yr, 5-year program (amort 500k). */
import { computeInjectionMouldingDrivers, estimateClampingTonnage, pickIMMPressId, estimateMouldCost } from '../src/engine/modules/injection-moulding.js';
import { analyseInjectionDFM } from '../src/engine/modules/injection-advisor.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';

const CN = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN');
const AMORT = 500_000;                       // 100k/yr × 5-year program
const tail = { packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08 };

// ── Measured geometry (OCCT / cadquery) ─────────────────────────────────────
const GEO = { volumeCm3: 2059.9, bbox: { x: 1690.94, y: 647.38, z: 528.1 }, surfaceCm2: 16261.69,
  rayCastWallMm: 27.1, imMouldCostGBP: 200000 };
const projAreaBBoxCm2 = (GEO.bbox.x * GEO.bbox.y) / 100;              // tool's formula
const trueWallMm = GEO.volumeCm3 / (GEO.surfaceCm2 / 2) * 10;         // vol ÷ one-side area → mm
const ppDensity = 900;                                                // mat-pp kg/m³
const cadWeightKg = GEO.volumeCm3 * (ppDensity / 1e6);               // cm³ → kg at PP density

function run(label: string, i: Parameters<typeof computeInjectionMouldingDrivers>[0], lib = CN) {
  const drivers = computeInjectionMouldingDrivers(i);
  const stack = computeUniversalStack({ partName: 'Front Bumper', ...drivers, ...tail }, lib);
  const b = stack.breakdown;
  const coolSec = i.coolTimeFactorSPerMm2 * i.wallThicknessMm ** 2;
  const cycleSec = i.fillTimeSec + i.packTimeSec + coolSec + i.ejectTimeSec;
  console.log(`\n=== ${label} ===`);
  console.log(`  weight ${i.partWeightKg}kg  wall ${i.wallThicknessMm}mm  projArea ${i.projectedAreaCm2}cm²  cav ${i.cavities}  press ${i.machineId}`);
  console.log(`  cool ${coolSec.toFixed(0)}s → cycle ${cycleSec.toFixed(0)}s (${(cycleSec/60).toFixed(1)}min)  mouldCost £${(i.mouldCost??0).toLocaleString()}`);
  console.log(`  Material £${b.rawMaterial.toFixed(3)}  Process £${b.process.toFixed(3)}  Labour £${b.labour.toFixed(3)}  Tooling £${b.tooling.toFixed(3)}`);
  console.log(`  Pkg £${b.packaging.toFixed(3)}  Logi £${b.logistics.toFixed(3)}  OH £${b.overhead.toFixed(3)}  Margin £${b.margin.toFixed(3)}`);
  console.log(`  >>> TOTAL £${stack.total.toFixed(2)} / part`);
  return { ...b, total: stack.total, cycleSec, input: i };
}

const common = {
  materialId: 'mat-pp', runnerSystem: 'cold' as const, regrindFraction: 0.2,
  cavityPressureMPa: 35, coolTimeFactorSPerMm2: 3.16,
  labourId: 'lab-cn-semiskilled', oee: 0.82, manning: 0.5, labourEfficiency: 0.95,
  mouldLife: 1_000_000, amortizationVolume: AMORT, toleranceMm: 0.3,
  surfaceFinishGrade: 'textured' as const,
};

// 1) MANUAL — estimator's hand inputs (no CAD): over-weights, round tooling, judgement press.
const manual = run('MANUAL (hand-entered)', {
  ...common, partWeightKg: 3.2, runnerWeightKg: 0.20,
  cavities: 1, projectedAreaCm2: 5000, wallThicknessMm: 3.0,
  fillTimeSec: 3, packTimeSec: 8, ejectTimeSec: 5,
  machineId: 'imm-2000t', mouldCost: 250000,
});

// 2) CAD-to-Cost (geometry-grounded, wall CORRECTED from vol/area) — the intended result.
const tonnes = estimateClampingTonnage({ projectedAreaCm2: projAreaBBoxCm2, cavityPressureMPa: 35 });
const pressId = pickIMMPressId(tonnes);
const cad = run(`CAD-to-Cost (geometry-grounded, wall≈${trueWallMm.toFixed(1)}mm)`, {
  ...common, partWeightKg: +cadWeightKg.toFixed(3), runnerWeightKg: 0.18,
  cavities: 1, projectedAreaCm2: +projAreaBBoxCm2.toFixed(0), wallThicknessMm: +trueWallMm.toFixed(1),
  fillTimeSec: Math.max(1.5, +(trueWallMm*0.5).toFixed(1)), packTimeSec: Math.max(2, +(trueWallMm*0.8).toFixed(1)), ejectTimeSec: 3,
  machineId: pressId, mouldCost: GEO.imMouldCostGBP,
});

// 3) CAD RAW (uses ray-cast wall 27.1mm verbatim) — the failure mode a sanity check must catch.
const cadRaw = run('CAD RAW (ray-cast wall 27.1mm, UNCORRECTED)', {
  ...common, partWeightKg: +cadWeightKg.toFixed(3), runnerWeightKg: 0.18,
  cavities: 1, projectedAreaCm2: +projAreaBBoxCm2.toFixed(0), wallThicknessMm: GEO.rayCastWallMm,
  fillTimeSec: 3, packTimeSec: 3, ejectTimeSec: 3,
  machineId: pressId, mouldCost: GEO.imMouldCostGBP,
});

// DFM (corrected geometry)
const dfm = analyseInjectionDFM({ wallThicknessMm: +trueWallMm.toFixed(1), resinType: 'semi_crystalline',
  minWallMm: 2.0, maxWallMm: 3.5, draftAngleDeg: 1.5, undercutCount: 4, flowLengthMm: 900, weldLineOnCriticalFace: false, toleranceMm: 0.3 });

console.log('\n=== DERIVED / PROVENANCE ===');
console.log(`  measured volume ${GEO.volumeCm3} cm³ → CAD weight ${cadWeightKg.toFixed(3)} kg @ PP 900kg/m³`);
console.log(`  bbox projected area (x·y) ${projAreaBBoxCm2.toFixed(0)} cm² → clamp ${tonnes.toFixed(0)}T → press ${pressId}`);
console.log(`  true wall (vol÷½area) ${trueWallMm.toFixed(2)} mm  vs ray-cast ${GEO.rayCastWallMm} mm`);
console.log(`  DFM score ${dfm.score}/10 — ${dfm.summary}`);
for (const is of dfm.issues) console.log(`    [${is.severity}] ${is.title}`);

console.log('\n=== COMPARISON (China, per part) ===');
const d = (a:number,b:number)=>`${a>b?'+':''}${(((a-b)/b)*100).toFixed(0)}%`;
console.log(`  Manual total   £${manual.total.toFixed(2)}`);
console.log(`  CAD total      £${cad.total.toFixed(2)}   (${d(cad.total,manual.total)} vs manual)`);
console.log(`  CAD RAW total  £${cadRaw.total.toFixed(2)}  (${d(cadRaw.total,manual.total)} vs manual — cycle ${(cadRaw.cycleSec/60).toFixed(0)}min, implausible)`);
console.log(`  Annualised @100k: Manual £${(manual.total*100000).toLocaleString()}  CAD £${(cad.total*100000).toLocaleString()}`);

// emit JSON for the PDF builder
import { writeFileSync } from 'fs';
writeFileSync(process.env.OUT || '/tmp/bumper.json', JSON.stringify({ GEO, projAreaBBoxCm2, trueWallMm, cadWeightKg, tonnes, pressId, manual, cad, cadRaw, dfm, AMORT }, null, 2));
