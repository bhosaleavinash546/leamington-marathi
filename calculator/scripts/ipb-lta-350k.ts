/**
 * IPB2.0 ECU PCBA — 5-year LTA at 350,000/yr, Made in China.
 *
 * The award is now 350k/yr for 5 years = 1,750,000 lifetime. Those are two
 * different volumes driving two different things, and conflating them is the
 * whole point of this run:
 *
 *   piece price   <- ANNUAL rate (350,000).  It is the buy rate that reserves
 *                    capacity and wafer starts. Nobody quotes year one at the
 *                    five-year price.
 *   NRE / tooling <- PROGRAMME lifetime (1,750,000). The award is contractual,
 *                    so recovery over the whole life is the correct base.
 *
 * BOM is the audited one from ipb-deep-200k.ts, unchanged: same part numbers,
 * same evidence tags, same quantities. Only the volume basis moves, so any
 * delta against the 200k report is attributable to volume and nothing else.
 */
import { computePCBFabDrivers } from '../src/engine/modules/pcb-fab.js';
import { computePCBADrivers, bomVolumePriceFactor, PRICE_SATURATION_QTY, type BOMLine,
  estimatePCBAPackagingPerPart, estimatePCBALogisticsPerPart,
  estimatePCBFabPackagingPerPart, estimatePCBFabLogisticsPerPart } from '../src/engine/modules/pcba.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { computeLearningCurveAdjustment } from '../src/engine/learning-curve.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { writeFileSync } from 'node:fs';

const ANNUAL = 350_000;
const YEARS = 5;
const LIFETIME = ANNUAL * YEARS;
const PREV = 200_000;                       // the volume the last report was built at
const W = 170, H = 110, AREA = (W * H) / 100;
const lib = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN');
const f = (n: number) => `£${n.toFixed(2)}`;

// ─── Bare board ───────────────────────────────────────────────────────────────
// Fab NRE (phototools, drill programs, e-test fixture) recovers over the
// programme; the board itself is panel arithmetic and does not move with volume.
const fabAt = (nreVol: number) => computePCBFabDrivers({
  layers: 6, boardWidthMm: W, boardHeightMm: H, panelWidthMm: 508, panelHeightMm: 610,
  panelUtilization: 0.78, technology: 'FR4_HTg', baseMaterialTg: 150, copperWeightOz: 1,
  outerCopperWeightOz: 2, viaType: 'through_blind', throughViaCount: 2400, blindViaCount: 300,
  buriedViaCount: 0, microViaCount: 0, hdiStructure: 'none', minTraceSpaceMm: 0.10,
  impedanceControlled: true, hasFinePitchBGA: true, solderMaskColor: 'green', silkscreenSides: 2,
  surfaceFinish: 'enig', testMethod: 'flying_probe', qualityGrade: 'auto_grade2', region: 'china',
  nreCost: 9_500, amortizationVolume: nreVol,
});

const stack = (d: any, name: string, pkg: number, log: number) => computeUniversalStack({
  partName: name, rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
  packagingPerPart: pkg, logisticsPerPart: log, overheadPct: 0.09, marginPct: 0.08,
  annualVolume: ANNUAL, programmeYears: YEARS,
} as UniversalStackInput, lib);

const board = stack(fabAt(LIFETIME), 'bare', estimatePCBFabPackagingPerPart(AREA),
                    estimatePCBFabLogisticsPerPart(AREA)).total;
const boardPrev = stack(fabAt(PREV), 'bare', estimatePCBFabPackagingPerPart(AREA),
                        estimatePCBFabLogisticsPerPart(AREA)).total;

// ─── BOM — identical to the audited 200k list ────────────────────────────────
type Conf = 'marking-legible' | 'marking-partial' | 'inferred';
type L = BOMLine & { basis: 'published' | 'catalogue' | 'captive' | 'class'; conf: Conf; note: string };

const bom: L[] = [
  { refDes:'U-MCU', componentType:'ic_bga', description:'Renesas R7F702300B RH850/U2A 292-BGA [BGA-292]',
    qty:1, unitPriceGBP:25.20, priceRefQty:1_000, moq:1, basis:'catalogue', conf:'marking-legible',
    note:'"R7F702300B FABA-C BB05253 2308 JAPAN" fully legible. DigiKey $49.47@1.' },
  { refDes:'U-SBC', componentType:'ic_tqfp', description:'ST L9369 dual H-bridge EPB pre-driver [LQFP-64]',
    qty:1, unitPriceGBP:4.33, priceRefQty:1_000, moq:1, basis:'catalogue', conf:'marking-legible',
    note:'"L9369 VC DTE" + ST logo, LQFP-64. Confirms this is an EPB/brake ECU.' },
  { refDes:'U-CAN', componentType:'ic_soic', description:'NXP TJA1463AT CAN-FD SIC transceiver [SO-14]',
    qty:2, unitPriceGBP:1.05, priceRefQty:1_000, moq:1, basis:'catalogue', conf:'marking-partial',
    note:'CORRECTED: board shows SO-14 gull-wing = TJA1463AT. Previously priced from TJA1463ATK, which is HVSON-14 - wrong package. Qty 2 is an assumption; only one is clearly visible.' },
  { refDes:'U-NCV', componentType:'ic_soic', description:'onsemi NCV8461 protected high-side switch [SOIC-8]',
    qty:1, unitPriceGBP:0.52, priceRefQty:1_000, moq:1, basis:'published', conf:'marking-legible',
    note:'"NCV8461 PR17" legible. Qty CUT 2 -> 1: only one instance is visible.' },
  { refDes:'U-UNK1', componentType:'ic_soic', description:'UNIDENTIFIED 8-pin, marking "T698 / 1000T / 2809h"',
    qty:2, unitPriceGBP:0.60, priceRefQty:1_000, moq:1, basis:'class', conf:'marking-partial',
    note:'Marking visible but not resolvable to a manufacturer. Appears at least twice. Class median.' },
  { refDes:'U-UNK2', componentType:'ic_soic', description:'UNIDENTIFIED small package, marking "CH40 3095 / 9096"',
    qty:2, unitPriceGBP:0.30, priceRefQty:1_000, moq:1, basis:'class', conf:'marking-partial',
    note:'Two similar parts, marking legible, part not identifiable.' },
  { refDes:'U-40342', componentType:'ic_tqfp', description:'Bosch 40342/01 motor-control ASIC [QFP-144]',
    qty:1, unitPriceGBP:3.50, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-legible',
    note:'"40342 /01 2324 VC252NVN" + Bosch logo.' },
  { refDes:'U-40341', componentType:'ic_tqfp', description:'Bosch 40341/01 ASIC [QFP-100]',
    qty:1, unitPriceGBP:2.50, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-legible',
    note:'"40341 /01 2240 A2I92F4A" + Bosch logo.' },
  { refDes:'U-23027', componentType:'ic_tqfp', description:'Bosch 2302701 ASIC [QFP-64]',
    qty:1, unitPriceGBP:1.80, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-partial',
    note:'"2302701" + Bosch logo legible; the line above it ("SSEAC"?) is not resolved.' },
  { refDes:'Q1-6', componentType:'power_module', description:'Bosch Q142E / 0142E power stage [PowerSO-8]',
    qty:6, unitPriceGBP:1.20, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-partial',
    note:'AMBIGUOUS: leading character reads Q in some views and 0 in others. Suffix "BABA .W31C". Qty 6 counted from one close-up; more may sit outside frame.' },
  { refDes:'U-71H', componentType:'ic_soic', description:'Bosch 71H740 driver / power-path [SOIC-8]',
    qty:3, unitPriceGBP:0.65, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-legible',
    note:'"71H740 Prm 2321 C3 5371" legible. Qty 3 is a count across overlapping views - may double-count.' },
  { refDes:'U-76E2', componentType:'ic_soic', description:'Bosch 76E240 device [SOIC-8]',
    qty:3, unitPriceGBP:0.70, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-legible',
    note:'"76E240 PNW 2328 B6 0125" legible. Qty 3 same caveat as 71H740.' },
  { refDes:'U-76E8', componentType:'ic_soic', description:'Bosch 76E840 device [SOIC-8]',
    qty:1, unitPriceGBP:0.70, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-legible',
    note:'"76E840 PEm 2319 A2 1431" legible.' },
  { refDes:'U-7S1R', componentType:'ic_soic', description:'Bosch 7S1R540H power device [SOIC-8]',
    qty:2, unitPriceGBP:0.80, priceRefQty:PREV, moq:1, basis:'captive', conf:'marking-legible',
    note:'"7S1R540H Prt" x2, lot codes 2313D6 and 026200.' },
  { refDes:'C-BULK', componentType:'passive_0805', description:'Polymer alu capacitor, marking "351 150 EJV"',
    qty:6, unitPriceGBP:0.52, priceRefQty:1_000, moq:1, basis:'class', conf:'marking-partial',
    note:'Marking legible; 150uF/35V is an INTERPRETATION of it, not a datasheet reading.' },
  { refDes:'L-PWR', componentType:'power_module', description:'Shielded power inductors 0.47uH / 10uH / 22uH / 220H',
    qty:8, unitPriceGBP:0.68, priceRefQty:1_000, moq:1, basis:'class', conf:'marking-partial',
    note:'Four DISTINCT values readable (0.47uH 23220J, 10uH, 22uH 2316NJ, 220H 374A) - previously lumped as one line at one price.' },
  { refDes:'R/C', componentType:'passive_0402', description:'MLCC + thick-film resistors (1201, 1001, 7501, 000, 30.9, 120E, 4021, 100E, 10DE)',
    qty:600, unitPriceGBP:0.011, priceRefQty:1_000, moq:1, basis:'class', conf:'inferred',
    note:'Individual values readable in close-ups; the COUNT of 600 is a density estimate over both sides, not a count.' },
  { refDes:'D/Q', componentType:'ic_soic', description:'Small-signal semis + BRL-23/BRL-97 diodes [SOT/SOD]',
    qty:80, unitPriceGBP:0.07, priceRefQty:1_000, moq:1, basis:'class', conf:'inferred',
    note:'"BRL 23 M", "BRL 97 M", "WJY", "52s", "Y7A A00A 110", "CXR 42AA" all visible. Count estimated.' },
  { refDes:'J1-2', componentType:'through_hole', description:'Automotive press-fit headers (main + motor)',
    qty:2, unitPriceGBP:3.20, priceRefQty:1_000, moq:1, basis:'class', conf:'inferred',
    note:'Press-fit hole fields visible along two board edges; connectors themselves not in frame.' },
  { refDes:'TIM', componentType:'through_hole', description:'Thermal interface pads (both sides)',
    qty:8, unitPriceGBP:0.15, priceRefQty:1_000, moq:1, basis:'class', conf:'marking-legible',
    note:'Pink pads clearly visible bottom side, grey/graphite pads top side.' },
];

// Bosch captive lines are internal transfer cost, not a distributor break. They
// carry no volume curve — a captive fab's cost does not fall because the ECU
// programme grew. Anchoring them at PREV and asking for the factor to PREV is
// how that is expressed (factor 1), and it is why the captive block is flat
// across every volume in this study.
const at = (l: L, vol: number) => l.qty * l.unitPriceGBP * bomVolumePriceFactor(l.priceRefQty ?? vol, vol);
const bomAt = (vol: number) => bom.reduce((a, l) => a + at(l, vol), 0);
const totBy = (p: (l: L) => boolean, vol = ANNUAL) => bom.filter(p).reduce((a, l) => a + at(l, vol), 0);

const bomTotal = bomAt(ANNUAL);
const placements = bom.filter(l => !['through_hole', 'manual_solder'].includes(l.componentType))
                      .reduce((a, l) => a + l.qty, 0);

// ─── PCBA ─────────────────────────────────────────────────────────────────────
const pcbaAt = (pcb: number, annual: number, nreVol: number) => computePCBADrivers({
  pcbCostPerBoard: pcb, bom, smtMachineId: 'smt-high-speed-line', smtLabourId: 'lab-cn-electronics',
  smtLines: 1, smtLineRatePerHr: 0, smtOee: 0.82, throughHoleCount: 2, manualSolderCount: 0,
  thLabourId: 'lab-cn-electronics', thLabourTimeSecPerJoint: 12, manualLabourTimeSecPerJoint: 20,
  smtSides: 2, conformalCoatAreaCm2: AREA, conformalCoatPricePerCm2: 0.0035,
  assemblyYield: 0.985, reworkCostPerFailure: 18,
  amortizationVolume: annual, annualBuildVolume: annual,
  assemblyComplexity: 'high', qualityGrade: 'auto_grade1', bgaCount: 1, bomPriceRefQty: 1_000,
  xrayMachineId: 'xray-bga-inspection', xrayLabourId: 'lab-cn-electronics',
  xrayMode: 'inline_axi', inlineAxiCycleTimeSec: 45,
  ictMachineId: 'ict-automotive', ictLabourId: 'lab-cn-electronics', ictCycleTimeSec: 150,
  nreCost: 46_000, nreAmortizationVolume: nreVol,
});

const PKG = estimatePCBAPackagingPerPart(AREA, 'auto_grade1');
const LOG = estimatePCBALogisticsPerPart(AREA);
const drivers = pcbaAt(board, ANNUAL, LIFETIME);
const r = stack(drivers, 'IPB2.0 ECU PCBA', PKG, LOG);
const b = r.breakdown, conv = b.process + b.labour;

// Prior basis, for an attributable walk: 200k/yr, NRE over one year.
const rPrev = stack(pcbaAt(boardPrev, PREV, PREV), 'prev', PKG, LOG);

console.log(`\n${'='.repeat(72)}`);
console.log(`IPB2.0 ECU PCBA — ${ANNUAL.toLocaleString()}/yr x ${YEARS} years = ${LIFETIME.toLocaleString()} lifetime, China`);
console.log('='.repeat(72));

console.log(`\nA. VOLUME BASIS`);
console.log(`   annual build rate      ${ANNUAL.toLocaleString()}/yr    -> prices every component line`);
console.log(`   programme life         ${YEARS} years`);
console.log(`   lifetime volume        ${LIFETIME.toLocaleString()}      -> amortises all NRE`);
console.log(`   merchant volume factor ${bomVolumePriceFactor(1_000, ANNUAL).toFixed(4)} from the 1,000 break`);
console.log(`   saturation quantity    ${PRICE_SATURATION_QTY.toLocaleString()} — ${ANNUAL.toLocaleString()} is still on the live curve`);

console.log(`\nB. COST`);
console.log(`   bare 6L HDI board      ${f(board)}`);
console.log(`   BOM (${bom.length} lines, ${placements} pieces)  ${f(bomTotal)}`);
console.log(`     published-price        ${f(totBy(l => l.basis === 'published'))}`);
console.log(`     catalogue-price        ${f(totBy(l => l.basis === 'catalogue'))}`);
console.log(`     Bosch captive          ${f(totBy(l => l.basis === 'captive'))}   (transfer cost — no volume curve)`);
console.log(`     class-median           ${f(totBy(l => l.basis === 'class'))}`);
console.log(`   conversion (4 ops)     ${f(conv)}`);
console.log(`\n   8-BUCKET`);
for (const [k, v] of Object.entries(b)) console.log(`     ${k.padEnd(12)} ${f(v).padStart(9)}  ${((v / r.total) * 100).toFixed(1)}%`);
console.log(`     ${'FACTORY'.padEnd(12)} ${f(r.factoryCost).padStart(9)}`);
console.log(`     ${'TOTAL'.padEnd(12)} ${f(r.total).padStart(9)}`);

console.log(`\nC. WALK FROM THE ${PREV.toLocaleString()}/yr SINGLE-YEAR BASIS`);
const dBom = bomAt(ANNUAL) - bomAt(PREV);
const dNre = (b.tooling - rPrev.breakdown.tooling);
const dBoard = board - boardPrev;
console.log(`   ${PREV.toLocaleString()}/yr, NRE over 1 year        ${f(rPrev.total)}`);
console.log(`     components ${PREV.toLocaleString()} -> ${ANNUAL.toLocaleString()}    ${f(dBom)}`);
console.log(`     PCBA NRE over ${LIFETIME.toLocaleString()}        ${f(dNre)}`);
console.log(`     fab NRE over ${LIFETIME.toLocaleString()}         ${f(dBoard)}`);
const explained = dBom + dNre + dBoard;
console.log(`     overhead + margin on the above  ${f((r.total - rPrev.total) - explained)}`);
console.log(`   ${ANNUAL.toLocaleString()}/yr x ${YEARS}yr                 ${f(r.total)}   (${(((r.total - rPrev.total) / rPrev.total) * 100).toFixed(1)}%)`);

// ─── The commitment lever, bounded by the fitted curve ───────────────────────
// A 5-year LTA is normally paid for with an annual price-down clause. Its RATE
// is a negotiated commercial term, not a should-cost output, so it is not in
// the headline. What CAN be derived is the ceiling: the most the curve will
// ever concede is the price at saturation. That is the size of the prize.
console.log(`\nD. WHAT THE ${YEARS}-YEAR COMMITMENT IS WORTH (derived ceiling, not a forecast)`);
const bomSat = bomAt(PRICE_SATURATION_QTY);
const rSat = stack(pcbaAt(board, PRICE_SATURATION_QTY, LIFETIME), 'sat', PKG, LOG);
console.log(`   priced at the annual rate ${ANNUAL.toLocaleString()}      BOM ${f(bomTotal)}   total ${f(r.total)}`);
console.log(`   priced at the curve floor ${PRICE_SATURATION_QTY.toLocaleString()}      BOM ${f(bomSat)}   total ${f(rSat.total)}`);
console.log(`   maximum commitment value            ${f(r.total - rSat.total)}/part  (${(((r.total - rSat.total) / r.total) * 100).toFixed(1)}%)`);
console.log(`   over the programme                  £${((r.total - rSat.total) * LIFETIME / 1e6).toFixed(2)}m`);
console.log(`   NOTE: the curve saturates at ${PRICE_SATURATION_QTY.toLocaleString()}, so committing 1,750,000 buys nothing`);
console.log(`         beyond that point. Ask for the step to the floor, not for a 5x discount.`);

// ─── Year-by-year, from the two mechanisms that ARE derivable ────────────────
console.log(`\nE. YEAR-BY-YEAR (labour learning + yield maturation only)`);
console.log(`   Neither moves the answer much, and that is the finding: on a board that`);
console.log(`   is ${((b.rawMaterial / r.total) * 100).toFixed(0)}% purchased material, there is almost no internal cost left to learn out.`);
const CURVE = 92;      // shallow: SMT is machine-paced, learning lands on test/rework/manual only
const YIELD = [0.985, 0.988, 0.991, 0.992, 0.992];
const years: any[] = [];
for (let y = 1; y <= YEARS; y++) {
  const cum = ANNUAL * y;
  const lc = computeLearningCurveAdjustment(b.labour, { annualVolume: cum, referenceVolume: ANNUAL, curvePct: CURVE });
  const reworkY1 = (1 - YIELD[0]) * 18, reworkY = (1 - YIELD[y - 1]) * 18;
  const delta = (lc.adjustedLabourCost - b.labour) + (reworkY - reworkY1);
  const total = r.total + delta * 1.09 * 1.08;
  years.push({ year: y, cumulative: cum, labour: lc.adjustedLabourCost, yield: YIELD[y - 1], total });
  console.log(`   Y${y}  cum ${cum.toLocaleString().padStart(9)}   labour ${f(lc.adjustedLabourCost)}   yield ${(YIELD[y - 1] * 100).toFixed(1)}%   total ${f(total)}`);
}
const wavg = years.reduce((a, y) => a + y.total, 0) / YEARS;
console.log(`   ${YEARS}-year average (flat ${ANNUAL.toLocaleString()}/yr)          ${f(wavg)}`);
console.log(`   Y1 -> Y5 movement                        ${f(years[4].total - years[0].total)}`);

// ─── Capacity ────────────────────────────────────────────────────────────────
console.log(`\nF. CAPACITY AT ${ANNUAL.toLocaleString()}/yr`);
const smt = drivers.operations.find(o => /smt/i.test(o.operationName));
let capacityNote = '';
if (smt) {
  const rawSec = smt.cycleTimeHr * 3600;
  const effSec = rawSec / smt.oee;                        // OEE is carried on the op, not in the cycle
  const availSec = 250 * 2 * 7.5 * 3600;                  // 250 days, 2 shifts, 7.5 productive hr
  const capacity = availSec / effSec;
  const lines = Math.ceil(ANNUAL / capacity);
  console.log(`   SMT cycle              ${rawSec.toFixed(0)} s/board raw, ${effSec.toFixed(0)} s/board at ${(smt.oee * 100).toFixed(0)}% OEE`);
  console.log(`   takt required          ${(availSec / ANNUAL).toFixed(1)} s/board`);
  console.log(`   one line delivers      ${Math.round(capacity).toLocaleString()}/yr`);
  console.log(`   verdict                ${capacity >= ANNUAL ? 'one line is sufficient' : `needs ~${lines} parallel lines`}`);
  // This is the largest unvalidated assumption in the conversion cost, so it is
  // stated as a sensitivity rather than a verdict. CPH_BY_TYPE holds effective
  // rates for a mid-range line (25,000 CPH on 0402). A modern high-speed
  // automotive placer runs 2-3x that, which cuts the cycle, the line count AND
  // the process bucket in the same proportion.
  for (const mult of [1, 2, 3]) {
    const c = capacity * mult;
    const proc = b.process / mult;
    console.log(`     at ${mult}x library placement rate: ${Math.round(c).toLocaleString()}/yr per line, `
      + `${Math.ceil(ANNUAL / c)} line(s), process bucket ${f(proc)} (${f(proc - b.process)} vs base)`);
  }
  capacityNote = `${lines} lines at library rates; process cost scales inversely with real CPH`;
  console.log(`   -> Validate the placement rate with the supplier before treating ${f(b.process)} of`);
  console.log(`      process cost as firm. It is a bigger lever than the entire 200k -> 350k volume step.`);
}

console.log(`\nG. vs SUPPLIER QUOTE £35.00`);
console.log(`   turnkey should-cost                ${f(r.total)}`);
const consigned = (board + conv + b.tooling + b.packaging + b.logistics) * 1.09 * 1.08;
const convOnly = (conv + b.tooling + b.packaging + b.logistics) * 1.09 * 1.08;
console.log(`   board + assembly, parts consigned  ${f(consigned)}`);
console.log(`   assembly only, all free-issued     ${f(convOnly)}`);
console.log(`   -> £35 still sits between the consigned and turnkey scopes, unchanged by volume.`);

writeFileSync('/tmp/ipb-lta-350k.json', JSON.stringify({
  annualVolume: ANNUAL, programmeYears: YEARS, lifetimeVolume: LIFETIME, region: 'CN',
  boardCost: board, bomTotal, placements, pkg: PKG, log: LOG,
  total: r.total, breakdown: b, conversion: conv,
  prev: { annualVolume: PREV, total: rPrev.total, bomTotal: bomAt(PREV), boardCost: boardPrev },
  commitmentCeiling: { atFloorTotal: rSat.total, perPart: r.total - rSat.total, floorQty: PRICE_SATURATION_QTY },
  years, fiveYearAverage: wavg, capacityNote,
  lines: bom.map(l => ({
    ref: l.refDes, description: l.description, qty: l.qty,
    unitAtRef: l.unitPriceGBP, refQty: l.priceRefQty ?? ANNUAL,
    unitAtVolume: l.unitPriceGBP * bomVolumePriceFactor(l.priceRefQty ?? ANNUAL, ANNUAL),
    unitAtPrev: l.unitPriceGBP * bomVolumePriceFactor(l.priceRefQty ?? PREV, PREV),
    ext: at(l, ANNUAL), basis: l.basis, conf: l.conf, note: l.note, componentType: l.componentType,
  })),
}, null, 2));
console.log('\nwritten to /tmp/ipb-lta-350k.json\n');
