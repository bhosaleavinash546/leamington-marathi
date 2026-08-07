import { computePCBFabDrivers } from '../src/engine/modules/pcb-fab.js';
import { computePCBADrivers, bomVolumePriceFactor, type BOMLine,
  estimatePCBAPackagingPerPart, estimatePCBALogisticsPerPart,
  estimatePCBFabPackagingPerPart, estimatePCBFabLogisticsPerPart } from '../src/engine/modules/pcba.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const VOL = 200_000, W = 170, H = 110, AREA = (W*H)/100;
const lib = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN');

const fab = computePCBFabDrivers({
  layers: 6, boardWidthMm: W, boardHeightMm: H, panelWidthMm: 508, panelHeightMm: 610,
  panelUtilization: 0.78, technology: 'FR4_HTg', baseMaterialTg: 150, copperWeightOz: 1,
  outerCopperWeightOz: 2, viaType: 'through_blind', throughViaCount: 2400, blindViaCount: 300,
  buriedViaCount: 0, microViaCount: 0, hdiStructure: 'none', minTraceSpaceMm: 0.10,
  impedanceControlled: true, hasFinePitchBGA: true, solderMaskColor: 'green', silkscreenSides: 2,
  surfaceFinish: 'enig', testMethod: 'flying_probe', qualityGrade: 'auto_grade2', region: 'china',
  nreCost: 9_500, amortizationVolume: VOL,
});
const stack = (d: any, name: string, pkg: number, log: number) => {
  const i: UniversalStackInput = { partName: name, rawMaterial: d.rawMaterial, operations: d.operations,
    tooling: d.tooling, packagingPerPart: pkg, logisticsPerPart: log, overheadPct: 0.09, marginPct: 0.08, annualVolume: VOL };
  return computeUniversalStack(i, lib);
};
const board = stack(fab, 'bare', estimatePCBFabPackagingPerPart(AREA), estimatePCBFabLogisticsPerPart(AREA)).total;

// REVISED BOM. Split by who owns the silicon, because that is what sets the basis.
type Conf = 'marking-legible' | 'marking-partial' | 'inferred';
type L = BOMLine & { basis: 'published' | 'catalogue' | 'captive' | 'class'; conf: Conf; note: string };

// Each line records WHAT IS ACTUALLY READABLE in the photographs, separately
// from what was inferred. The previous version mixed the two, which let a part
// number I could not read (an "ST 7724A") sit in the BOM as if it were on the
// board.
const bom: L[] = [
  // --- Merchant silicon ------------------------------------------------------
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

  // --- Bosch captive silicon: internal cost, no market price, not scaled -----
  { refDes:'U-40342', componentType:'ic_tqfp', description:'Bosch 40342/01 motor-control ASIC [QFP-144]',
    qty:1, unitPriceGBP:3.50, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-legible',
    note:'"40342 /01 2324 VC252NVN" + Bosch logo.' },
  { refDes:'U-40341', componentType:'ic_tqfp', description:'Bosch 40341/01 ASIC [QFP-100]',
    qty:1, unitPriceGBP:2.50, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-legible',
    note:'"40341 /01 2240 A2I92F4A" + Bosch logo.' },
  { refDes:'U-23027', componentType:'ic_tqfp', description:'Bosch 2302701 ASIC [QFP-64]',
    qty:1, unitPriceGBP:1.80, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-partial',
    note:'"2302701" + Bosch logo legible; the line above it ("SSEAC"?) is not resolved.' },
  { refDes:'Q1-6', componentType:'power_module', description:'Bosch Q142E / 0142E power stage [PowerSO-8]',
    qty:6, unitPriceGBP:1.20, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-partial',
    note:'AMBIGUOUS: leading character reads Q in some views and 0 in others. Suffix "BABA .W31C". Qty 6 counted from one close-up; more may sit outside frame.' },
  { refDes:'U-71H', componentType:'ic_soic', description:'Bosch 71H740 driver / power-path [SOIC-8]',
    qty:3, unitPriceGBP:0.65, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-legible',
    note:'"71H740 Prm 2321 C3 5371" legible. Qty 3 is a count across overlapping views - may double-count.' },
  { refDes:'U-76E2', componentType:'ic_soic', description:'Bosch 76E240 device [SOIC-8]',
    qty:3, unitPriceGBP:0.70, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-legible',
    note:'"76E240 PNW 2328 B6 0125" legible. Qty 3 same caveat as 71H740.' },
  { refDes:'U-76E8', componentType:'ic_soic', description:'Bosch 76E840 device [SOIC-8]',
    qty:1, unitPriceGBP:0.70, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-legible',
    note:'"76E840 PEm 2319 A2 1431" legible.' },
  { refDes:'U-7S1R', componentType:'ic_soic', description:'Bosch 7S1R540H power device [SOIC-8]',
    qty:2, unitPriceGBP:0.80, priceRefQty:200_000, moq:1, basis:'captive', conf:'marking-legible',
    note:'"7S1R540H Prt" x2, lot codes 2313D6 and 026200.' },

  // --- Passives, magnetics, connectors --------------------------------------
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

  // REMOVED: "ST 7724A-series analog". That part number was NOT readable on any
  // photograph - it was my reconstruction of a partial marking near the board
  // edge, and it should never have entered the BOM as an identified part.
];

const scaled = (l: L) => l.qty * l.unitPriceGBP * bomVolumePriceFactor(l.priceRefQty ?? VOL, VOL);
const totRef = (f:(l:L)=>boolean) => bom.filter(f).reduce((a,l)=>a+l.qty*l.unitPriceGBP,0);
const tot    = (f:(l:L)=>boolean) => bom.filter(f).reduce((a,l)=>a+scaled(l),0);
const bomTotal = tot(()=>true);
const placements = bom.filter(l=>!['through_hole','manual_solder'].includes(l.componentType)).reduce((a,l)=>a+l.qty,0);

const pcba = computePCBADrivers({
  pcbCostPerBoard: board, bom, smtMachineId:'smt-high-speed-line', smtLabourId:'lab-cn-electronics',
  smtLines:1, smtLineRatePerHr:0, smtOee:0.82, throughHoleCount:2, manualSolderCount:0,
  thLabourId:'lab-cn-electronics', thLabourTimeSecPerJoint:12, manualLabourTimeSecPerJoint:20,
  smtSides:2, conformalCoatAreaCm2:AREA, conformalCoatPricePerCm2:0.0035,
  assemblyYield:0.985, reworkCostPerFailure:18, amortizationVolume:VOL,
  assemblyComplexity:'high', qualityGrade:'auto_grade1', bgaCount:1, bomPriceRefQty:1_000,
  xrayMachineId:'xray-bga-inspection', xrayLabourId:'lab-cn-electronics',
  xrayMode:'inline_axi', inlineAxiCycleTimeSec:45,
  ictMachineId:'ict-automotive', ictLabourId:'lab-cn-electronics', ictCycleTimeSec:150,
  nreCost:46_000, nreAmortizationVolume:VOL,
});
const r = stack(pcba, 'IPB2.0 ECU PCBA', estimatePCBAPackagingPerPart(AREA,'auto_grade1'), estimatePCBALogisticsPerPart(AREA));
const b = r.breakdown, conv = b.process + b.labour;
const f = (n:number)=>`£${n.toFixed(2)}`;

console.log(`\n=== IPB2.0 ECU PCBA — ${VOL.toLocaleString()}/yr, China ===`);
console.log(`Bare 6L board            ${f(board)}`);
console.log(`BOM total                ${f(bomTotal)}   (${bom.length} lines, ${placements} placements)`);
console.log(`   at the 1k quoted break  ${f(totRef(()=>true))}`);
console.log(`   extrapolated to ${VOL.toLocaleString()}  ${f(bomTotal)}   (volume factor ${(bomVolumePriceFactor(1000,VOL)).toFixed(3)} on merchant lines)`);
console.log(`     published-price parts ${f(tot(l=>l.basis==='published'))}`);
console.log(`     catalogue-price parts ${f(tot(l=>l.basis==='catalogue'))}`);
console.log(`     Bosch captive         ${f(tot(l=>l.basis==='captive'))}   (no market price; not scaled)`);
console.log(`     class-median parts    ${f(tot(l=>l.basis==='class'))}`);
console.log(`\n  BY EVIDENCE:`);
for (const c of ['marking-legible','marking-partial','inferred'] as const) {
  const v = tot(l=>l.conf===c), n = bom.filter(l=>l.conf===c).length;
  console.log(`     ${c.padEnd(16)} ${f(v).padStart(8)}  ${((v/bomTotal)*100).toFixed(0).padStart(3)}% of BOM   ${n} lines`);
}
console.log('\n  per-line extrapolation:');
for (const l of bom) {
  const fac = bomVolumePriceFactor(l.priceRefQty ?? VOL, VOL);
  console.log(`    ${l.refDes.padEnd(8)} x${String(l.qty).padStart(3)}  £${l.unitPriceGBP.toFixed(3)} @${(l.priceRefQty??VOL).toLocaleString().padStart(7)}  -> £${(l.unitPriceGBP*fac).toFixed(3)}  ext ${f(scaled(l))}`);
}
console.log(`\n8-BUCKET`);
for (const [k,v] of Object.entries(b)) console.log(`  ${k.padEnd(13)} ${f(v).padStart(9)}  ${((v/r.total)*100).toFixed(1)}%`);
console.log(`  ${'FACTORY'.padEnd(13)} ${f(r.factoryCost).padStart(9)}`);
console.log(`  ${'TOTAL'.padEnd(13)} ${f(r.total).padStart(9)}`);
console.log(`\nconversion (4 ops)       ${f(conv)}`);
console.log(`\n--- vs supplier quote £35.00 ---`);
console.log(`turnkey should-cost      ${f(r.total)}   quote is ${((35-r.total)/r.total*100).toFixed(0)}%`);
const consigned = (board + conv + b.tooling + b.packaging + b.logistics) * 1.09 * 1.08;
const convOnly  = (conv + b.tooling + b.packaging + b.logistics) * 1.09 * 1.08;
console.log(`board+assembly, parts consigned  ${f(consigned)}   quote is ${((35-consigned)/consigned*100).toFixed(0)}%`);
console.log(`assembly only (all free-issued)  ${f(convOnly)}   quote is ${((35-convOnly)/convOnly*100).toFixed(0)}%`);
