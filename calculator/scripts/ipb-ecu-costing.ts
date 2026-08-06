/**
 * Bosch IPB 2.0 ECU PCBA — corrected should-cost.
 *
 * The uploaded tool report costed this board as commodity `pcb_fab` with a
 * single `directCost` pass-through and ZERO operations: no placement, no
 * reflow, no inspection, no test, and the 150k annual volume never applied
 * (tooling was amortised over 5,000). This script re-costs the same board the
 * way the engine is designed to: the bare board through the PCB-fab module,
 * then the populated assembly through the PCBA module, both at China rates.
 *
 * BOM is read from the eight board photographs. Every line carries a
 * confidence flag: `confirmed` = package marking legible in a photo,
 * `estimated` = count or price inferred from board density / class median.
 *
 *   npx tsx scripts/ipb-ecu-costing.ts
 */
import { computePCBFabDrivers } from '../src/engine/modules/pcb-fab.js';
import { computePCBADrivers, type BOMLine } from '../src/engine/modules/pcba.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const ANNUAL_VOLUME = 150_000;
// ESD tray + desiccant carton, and China-domestic outbound freight per board.
const PKG = 0.35;
const LOG = 0.55;
const REGION = 'CN' as const;

// ─── Board specification ─────────────────────────────────────────────────────
// Dimensions scaled off the electrolytic-cap diameter (8 mm datum) in photo 2.
// Layer count inferred from BGA escape density + power-stage current: 6L with
// heavy outer copper is the lightest stack-up that routes this board.
const BOARD_W_MM = 170;
const BOARD_H_MM = 110;

const fabDrivers = computePCBFabDrivers({
  layers: 6,
  boardWidthMm: BOARD_W_MM,
  boardHeightMm: BOARD_H_MM,
  panelWidthMm: 508,
  panelHeightMm: 610,
  panelUtilization: 0.78,
  technology: 'FR4_HTg',
  baseMaterialTg: 150,
  copperWeightOz: 1,
  outerCopperWeightOz: 2,          // power stages + 6 half-bridges
  viaType: 'through_blind',
  throughViaCount: 2400,
  blindViaCount: 300,
  buriedViaCount: 0,
  microViaCount: 0,
  hdiStructure: 'none',
  minTraceSpaceMm: 0.10,
  impedanceControlled: true,
  hasFinePitchBGA: true,
  solderMaskColor: 'green',
  silkscreenSides: 2,
  surfaceFinish: 'enig',
  testMethod: 'flying_probe',
  qualityGrade: 'auto_grade2',      // board spec: AEC-Q2 / PPAP / IATF 16949
  region: 'china',
  nreCost: 9_500,                   // tooling, films, e-test fixture
  amortizationVolume: ANNUAL_VOLUME,
});

const library = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, REGION);

function stack(drivers: ReturnType<typeof computePCBFabDrivers>, name: string) {
  const input: UniversalStackInput = {
    partName: name,
    rawMaterial: drivers.rawMaterial,
    operations: drivers.operations,
    tooling: drivers.tooling,
    packagingPerPart: drivers.packagingPerPart ?? PKG,
    logisticsPerPart: drivers.logisticsPerPart ?? LOG,
    overheadPct: drivers.overheadPct ?? 0.09,
    marginPct: drivers.marginPct ?? 0.08,
    annualVolume: ANNUAL_VOLUME,
  };
  return { input, result: computeUniversalStack(input, library) };
}

const fab = stack(fabDrivers, 'IPB2.0 bare PCB');
const pcbCostPerBoard = fab.result.total;

// ─── BOM ─────────────────────────────────────────────────────────────────────
// c = confirmed from a legible package marking; e = estimated.
const bom: Array<BOMLine & { conf: 'confirmed' | 'estimated'; note: string }> = [
  { refDes: 'U-MCU',   componentType: 'ic_bga',       description: 'Renesas R7F702300B RH850 automotive MCU',        qty: 1,   unitPriceGBP: 15.00, moq: 1, conf: 'confirmed', note: 'marking R7F702300B FABA-C 2308 JAPAN' },
  { refDes: 'U-ASIC1', componentType: 'ic_tqfp',      description: 'Bosch 40342/01 motor-control ASIC',              qty: 1,   unitPriceGBP: 10.00, moq: 1, conf: 'confirmed', note: 'marking 40342 /01 2324 VC252NVN' },
  { refDes: 'U-ASIC2', componentType: 'ic_tqfp',      description: 'Bosch 40341/01 ASIC',                            qty: 1,   unitPriceGBP:  7.00, moq: 1, conf: 'confirmed', note: 'marking 40341 /01 A2192F4A' },
  { refDes: 'U-ASIC3', componentType: 'ic_tqfp',      description: 'Bosch 2302701 ASIC',                             qty: 1,   unitPriceGBP:  4.00, moq: 1, conf: 'confirmed', note: 'marking 2302701' },
  { refDes: 'U-SBC',   componentType: 'ic_tqfp',      description: 'ST L9369 multi-channel driver / SBC',            qty: 1,   unitPriceGBP:  5.00, moq: 1, conf: 'confirmed', note: 'marking L9369 VC DTE' },
  { refDes: 'U-BGA2',  componentType: 'ic_bga',       description: 'Secondary safety MCU / ASIC (BGA)',              qty: 1,   unitPriceGBP:  8.00, moq: 1, conf: 'estimated', note: 'package visible, marking not legible' },
  { refDes: 'U-MEM',   componentType: 'ic_bga',       description: 'External memory (BGA)',                          qty: 1,   unitPriceGBP:  3.00, moq: 1, conf: 'estimated', note: 'package visible, marking not legible' },
  { refDes: 'Q1-6',    componentType: 'power_module', description: 'Q142E power stage / dual half-bridge',           qty: 6,   unitPriceGBP:  3.00, moq: 1, conf: 'confirmed', note: 'marking Q142E BABA W31C ×6' },
  { refDes: 'U-CAN',   componentType: 'ic_soic',      description: 'NXP TJA1463A CAN-FD SIC transceiver',            qty: 2,   unitPriceGBP:  1.20, moq: 1, conf: 'confirmed', note: 'marking TJA1463A' },
  { refDes: 'U-71H',   componentType: 'ic_soic',      description: 'Bosch 71H740 driver / power-path',               qty: 3,   unitPriceGBP:  1.50, moq: 1, conf: 'confirmed', note: 'marking 71H740 Prm 2321 C3' },
  { refDes: 'U-76E2',  componentType: 'ic_soic',      description: 'Bosch 76E240 device',                            qty: 1,   unitPriceGBP:  1.80, moq: 1, conf: 'confirmed', note: 'marking 76E240 PNW 2328 B6' },
  { refDes: 'U-76E8',  componentType: 'ic_soic',      description: 'Bosch 76E840 device',                            qty: 1,   unitPriceGBP:  1.80, moq: 1, conf: 'confirmed', note: 'marking 76E840 PEm 2319 A2' },
  { refDes: 'U-7S1R',  componentType: 'ic_soic',      description: 'Bosch 7S1R540H power device',                    qty: 2,   unitPriceGBP:  1.60, moq: 1, conf: 'confirmed', note: 'marking 7S1R540H Prt 2313D6' },
  { refDes: 'C-BULK',  componentType: 'passive_0805', description: 'Polymer alu cap 150 µF 35 V (351 150 EJV)',      qty: 6,   unitPriceGBP:  0.40, moq: 1, conf: 'confirmed', note: 'marking 351 150 EJV ×6' },
  { refDes: 'L-PWR',   componentType: 'power_module', description: 'Shielded power inductor 0.47–10 µH',             qty: 8,   unitPriceGBP:  0.60, moq: 1, conf: 'estimated', note: '0.47µH/10µH legible; count from both sides' },
  { refDes: 'R/C-SMD', componentType: 'passive_0402', description: 'MLCC + thick-film resistors, AEC-Q200',          qty: 620, unitPriceGBP:  0.009, moq: 1, conf: 'estimated', note: 'density count across both populated sides' },
  { refDes: 'D/Q-SML', componentType: 'ic_soic',      description: 'Small-signal semis (SOT/SOD/QFN)',               qty: 90,  unitPriceGBP:  0.09, moq: 1, conf: 'estimated', note: 'density count; individual markings not legible' },
  { refDes: 'Y1',      componentType: 'crystal_osc',  description: 'Crystal / oscillator',                           qty: 1,   unitPriceGBP:  0.45, moq: 1, conf: 'estimated', note: 'package visible near MCU' },
  { refDes: 'J1-2',    componentType: 'through_hole', description: 'Automotive press-fit header (main + motor)',     qty: 2,   unitPriceGBP:  2.50, moq: 1, conf: 'estimated', note: 'through-hole field, bottom-left' },
  { refDes: 'TIM',     componentType: 'passive_0805', description: 'Thermal interface pad (power stages)',           qty: 8,   unitPriceGBP:  0.12, moq: 1, conf: 'confirmed', note: 'pink pads visible on underside' },
];

const bomTotal = bom.reduce((s, b) => s + b.qty * b.unitPriceGBP, 0);
const placements = bom.filter(b => b.componentType !== 'through_hole' && b.componentType !== 'manual_solder')
  .reduce((s, b) => s + b.qty, 0);
const bgaCount = bom.filter(b => b.componentType === 'ic_bga').reduce((s, b) => s + b.qty, 0);

// ─── PCBA ────────────────────────────────────────────────────────────────────
const pcbaDrivers = computePCBADrivers({
  pcbCostPerBoard,
  bom,
  smtMachineId: 'smt-high-speed-line',
  smtLabourId: 'lab-cn-electronics',
  smtLines: 1,
  smtLineRatePerHr: 0,
  smtOee: 0.82,
  throughHoleCount: 2,
  manualSolderCount: 0,
  thLabourId: 'lab-cn-electronics',
  thLabourTimeSecPerJoint: 12,
  manualLabourTimeSecPerJoint: 20,
  smtSides: 1,                              // see note: 'high' complexity already encodes double-sided
  conformalCoatAreaCm2: (BOARD_W_MM * BOARD_H_MM) / 100,
  conformalCoatPricePerCm2: 0.0035,
  assemblyYield: 0.985,
  reworkCostPerFailure: 18,
  amortizationVolume: ANNUAL_VOLUME,
  assemblyComplexity: 'high',               // module's own definition: >300 parts, BGAs, double-sided
  qualityGrade: 'auto_grade1',              // brake-by-wire
  bgaCount,
  xrayMachineId: 'xray-bga-inspection',
  xrayLabourId: 'lab-cn-electronics',
  ictMachineId: 'ict-automotive',
  ictLabourId: 'lab-cn-electronics',
  ictCycleTimeSec: 150,                     // ICT + EOL functional for a brake ECU
  nreCost: 46_000,                          // stencils, ICT fixture, EOL rig, programming
  nreAmortizationVolume: ANNUAL_VOLUME,
});

const pcba = stack(pcbaDrivers, 'Bosch IPB2.0 ECU PCBA');
const r = pcba.result;

// ─── Report ──────────────────────────────────────────────────────────────────
const f = (n: number) => `£${n.toFixed(2)}`;
console.log('\n════ BOARD ════');
console.log(`Size ${BOARD_W_MM}×${BOARD_H_MM} mm · 6L FR4-HTg · 2oz outer · ENIG · AEC-Q Grade 1 · China · ${ANNUAL_VOLUME.toLocaleString()}/yr`);
console.log(`Placements ${placements} · BGAs ${bgaCount} · through-hole ${2} · BOM lines ${bom.length}`);

console.log('\n════ BARE PCB (pcb_fab module) ════');
console.log(`Bare board cost/each: ${f(pcbCostPerBoard)}`);
for (const [k, v] of Object.entries(fab.result.breakdown)) if (v > 0.001) console.log(`  ${k.padEnd(14)} ${f(v)}`);

console.log('\n════ BOM ════');
for (const b of bom) console.log(`  ${b.conf === 'confirmed' ? '✓' : '~'} ${b.refDes.padEnd(8)} ×${String(b.qty).padStart(3)}  ${f(b.qty * b.unitPriceGBP).padStart(8)}  ${b.description}`);
console.log(`  BOM TOTAL: ${f(bomTotal)}`);
console.log(`  confirmed lines: ${bom.filter(b => b.conf === 'confirmed').length}/${bom.length}  ` +
  `(${((bom.filter(b => b.conf === 'confirmed').reduce((s, b) => s + b.qty * b.unitPriceGBP, 0) / bomTotal) * 100).toFixed(0)}% of BOM value)`);

console.log('\n════ OPERATIONS ════');
for (const o of r.operationDetails) {
  console.log(`  ${o.operationName.padEnd(34)} ${(o.cycleTimeHr * 3600).toFixed(1).padStart(7)}s  mach ${f(o.processCost).padStart(7)}  lab ${f(o.labourCost).padStart(7)}`);
}

console.log('\n════ 8-BUCKET (GBP) ════');
const b8 = r.breakdown;
for (const [k, v] of Object.entries(b8)) console.log(`  ${k.padEnd(14)} ${f(v).padStart(9)}  ${((v / r.total) * 100).toFixed(1)}%`);
console.log(`  ${'FACTORY'.padEnd(14)} ${f(r.factoryCost).padStart(9)}`);
console.log(`  ${'SUBTOTAL'.padEnd(14)} ${f(r.subtotal).padStart(9)}`);
console.log(`  ${'TOTAL'.padEnd(14)} ${f(r.total).padStart(9)}`);

console.log('\n════ vs TOOL REPORT ════');
const toolGBP = 887.42 / 9.0498;
console.log(`  Tool report : ${f(toolGBP)}  (¥887.42 @ 9.0498)  — 0 operations, volume not applied`);
console.log(`  Corrected   : ${f(r.total)}`);
console.log(`  Delta       : ${f(r.total - toolGBP)}  (${(((r.total - toolGBP) / toolGBP) * 100).toFixed(1)}%)`);

// ─── Sensitivity: the engine's X-ray formula is an OFFLINE 100%-inspection
//     model. At 150k/yr the industry norm is inline AXI, so show the delta. ───
const xray = r.operationDetails.find(o => o.operationName.includes('X-Ray'));
const xrayCost = xray ? xray.processCost + xray.labourCost : 0;
const inlineAxiSec = 45;
const xrayScale = xray ? inlineAxiSec / (xray.cycleTimeHr * 3600) : 0;
const xraySaving = xrayCost * (1 - xrayScale);
const totalInlineAxi = r.total - xraySaving * (1 + 0.09) * (1 + 0.08);

// ─── Emit JSON for the PDF generator ─────────────────────────────────────────
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/ipb-costing.json', JSON.stringify({
  partName: 'Bosch IPB2.0 ECU PCBA',
  region: 'China', annualVolume: ANNUAL_VOLUME, currency: 'GBP',
  board: { w: BOARD_W_MM, h: BOARD_H_MM, areaCm2: (BOARD_W_MM * BOARD_H_MM) / 100,
           layers: 6, finish: 'ENIG', tech: 'FR4 High-Tg 150C', outerCu: 2, innerCu: 1,
           grade: 'AEC-Q Grade 2 / PPAP', pcbCost: pcbCostPerBoard },
  fabBreakdown: fab.result.breakdown,
  bom: bom.map(b => ({ ...b, ext: b.qty * b.unitPriceGBP })),
  bomTotal, placements, bgaCount,
  operations: r.operationDetails.map(o => ({
    name: o.operationName, sec: o.cycleTimeHr * 3600, machineId: o.machineId,
    machineRate: o.machineRateUsed, labourRate: o.labourRateUsed,
    oee: o.oee, process: o.processCost, labour: o.labourCost })),
  breakdown: r.breakdown, factoryCost: r.factoryCost, subtotal: r.subtotal, total: r.total,
  traceability: r.traceability,
  toolTotalGBP: 887.42 / 9.0498, toolTotalCNY: 887.42, fx: 9.0498,
  sensitivity: { xrayCost, inlineAxiSec, totalInlineAxi },
}, null, 2));
console.log(`\nJSON written. Inline-AXI variant total: ${f(totalInlineAxi)} (X-ray 100% offline saves ${f(r.total - totalInlineAxi)})`);
