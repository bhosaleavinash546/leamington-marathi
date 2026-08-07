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
type L = BOMLine & { basis: 'published' | 'catalogue' | 'captive' | 'class' };

// Every price now states the QUANTITY it came from. The engine extrapolates
// each line from that quantity to the 200,000 build volume, so the annual
// volume finally moves the 70% of this part that is components.
const bom: L[] = [
  // --- Merchant silicon, priced from published distributor breaks -----------
  { refDes:'U-MCU', componentType:'ic_bga', description:'Renesas R7F702300B RH850/U2A 292-BGA 28nm 400MHz 16MB [BGA-292]',
    qty:1, unitPriceGBP:25.20, priceRefQty:1_000, moq:1, basis:'catalogue' },      // DigiKey $49.47@1; ~$32@1k
  { refDes:'U-SBC', componentType:'ic_tqfp', description:'ST L9369 dual H-bridge EPB pre-driver [LQFP-64]',
    qty:1, unitPriceGBP:4.33, priceRefQty:1_000, moq:1, basis:'catalogue' },        // LCSC $6.74 / ABR $4.11
  { refDes:'U-CAN', componentType:'ic_soic', description:'NXP TJA1463A CAN-FD SIC transceiver [SO-14]',
    qty:2, unitPriceGBP:0.83, priceRefQty:1_000, moq:1, basis:'published' },        // LCSC $1.0575
  { refDes:'U-NCV', componentType:'ic_soic', description:'onsemi NCV8461 protected high-side switch [SOIC-8]',
    qty:2, unitPriceGBP:0.52, priceRefQty:1_000, moq:1, basis:'published' },        // $0.6610 @1k
  { refDes:'U-ST77', componentType:'ic_soic', description:'ST 7724A-series analog [TSSOP]',
    qty:1, unitPriceGBP:0.90, priceRefQty:1_000, moq:1, basis:'class' },
  { refDes:'Y1', componentType:'crystal_osc', description:'Crystal / oscillator [SMD 3225]',
    qty:1, unitPriceGBP:0.55, priceRefQty:1_000, moq:1, basis:'class' },

  // --- Bosch captive silicon: no market price exists. Stated at internal cost
  //     AT PROGRAMME VOLUME, so priceRefQty = the build volume and the curve
  //     leaves them alone. Scaling them too would double-discount.
  { refDes:'U-40342', componentType:'ic_tqfp', description:'Bosch 40342/01 motor-control ASIC [QFP-144]', qty:1, unitPriceGBP:3.50, priceRefQty:200_000, moq:1, basis:'captive' },
  { refDes:'U-40341', componentType:'ic_tqfp', description:'Bosch 40341/01 ASIC [QFP-100]',              qty:1, unitPriceGBP:2.50, priceRefQty:200_000, moq:1, basis:'captive' },
  { refDes:'U-23027', componentType:'ic_tqfp', description:'Bosch 2302701 ASIC [QFP-64]',                qty:1, unitPriceGBP:1.80, priceRefQty:200_000, moq:1, basis:'captive' },
  { refDes:'Q1-6',   componentType:'power_module', description:'Bosch Q142E power stage / dual half-bridge [PowerSO-8]', qty:6, unitPriceGBP:1.20, priceRefQty:200_000, moq:1, basis:'captive' },
  { refDes:'U-71H',  componentType:'ic_soic', description:'Bosch 71H740 driver / power-path [SOIC-8]',   qty:3, unitPriceGBP:0.65, priceRefQty:200_000, moq:1, basis:'captive' },
  { refDes:'U-76E2', componentType:'ic_soic', description:'Bosch 76E240 device [SOIC-8]',                qty:3, unitPriceGBP:0.70, priceRefQty:200_000, moq:1, basis:'captive' },
  { refDes:'U-76E8', componentType:'ic_soic', description:'Bosch 76E840 device [SOIC-8]',                qty:1, unitPriceGBP:0.70, priceRefQty:200_000, moq:1, basis:'captive' },
  { refDes:'U-7S1R', componentType:'ic_soic', description:'Bosch 7S1R540H power device [SOIC-8]',        qty:2, unitPriceGBP:0.80, priceRefQty:200_000, moq:1, basis:'captive' },

  // --- Passives, magnetics, connectors, thermal: class prices at a 1k break --
  { refDes:'C-BULK', componentType:'passive_0805', description:'Polymer alu capacitor 150uF 35V (351 150 EJV)', qty:6, unitPriceGBP:0.52, priceRefQty:1_000, moq:1, basis:'class' },
  { refDes:'L-PWR',  componentType:'power_module', description:'Shielded power inductors 0.47-22uH',            qty:8, unitPriceGBP:0.68, priceRefQty:1_000, moq:1, basis:'class' },
  { refDes:'R/C',    componentType:'passive_0402', description:'MLCC + thick-film resistors, AEC-Q200 [0402/0603]', qty:600, unitPriceGBP:0.011, priceRefQty:1_000, moq:1, basis:'class' },
  { refDes:'D/Q',    componentType:'ic_soic',  description:'Small-signal semis + BRL-series diodes [SOT/SOD]',  qty:80, unitPriceGBP:0.07, priceRefQty:1_000, moq:1, basis:'class' },
  { refDes:'J1-2',   componentType:'through_hole', description:'Automotive press-fit headers (main + motor)',   qty:2, unitPriceGBP:3.20, priceRefQty:1_000, moq:1, basis:'class' },
  { refDes:'TIM',    componentType:'through_hole', description:'Thermal interface pads (power stages, both sides)', qty:8, unitPriceGBP:0.15, priceRefQty:1_000, moq:1, basis:'class' },
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
