/**
 * Arithmetic audit — the SPEC-DRIVEN commodities (30 Oct 2026; docs/review/arith-audit/spec-commodities.md).
 *
 * Wiring harness, painting, surface finishing (on real parts), BIW assembly, battery pack and e-motor have no CAD
 * route: each is costed from its form. This script costs (a) every form's default inputs and (b) every demo preset
 * the screen offers, through the screen's own path (the module's compute<X>Drivers → computeUniversalStack), and
 * recomputes every material line, operation, tooling figure and the 8 buckets INDEPENDENTLY — from the rate book,
 * the data tables (ev-data.ts, surface-treatment-data.ts, surface-finish-routes.ts FINISH_LINE_LOADING) and the
 * inputs — without calling the modules or the surface-treatment helpers it checks. Surface finishing is checked on
 * real parts (measured surface + costed mass from the arithmetic dump's geometry fixture).
 *
 *   npx tsx scripts/arith-audit/spec-commodities.ts [--verbose]
 *
 * Prints PASS / FAIL per check; exits non-zero on any FAIL. Tolerance: ½ p on money, 0.5 % on an input.
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import { computeUniversalStack } from '../../src/engine/core.js';
import type { CommodityDrivers, PartCostResult, UniversalStackInput, RateLibrary } from '../../src/engine/types.js';
// ── The modules under test: the screen path only. The shadow below never calls them. ──
import { computeWiringHarnessDrivers, type WiringHarnessInputs } from '../../src/engine/modules/wiring-harness.js';
import { computePaintingDrivers, type PaintingInputs, type CoatLayer } from '../../src/engine/modules/painting.js';
import { computeBIWDrivers, type BIWAssemblyInputs } from '../../src/engine/modules/biw-assembly.js';
import { computeBatteryPackDrivers, type BatteryPackInputs } from '../../src/engine/modules/battery-pack.js';
import { computeEMotorDrivers, type EMotorInputs } from '../../src/engine/modules/e-motor.js';
import { finishingForCommodity } from '../../src/engine/modules/surface-finishing.js';
import { finishLoading, finishSpec } from '../../src/engine/surface-finish-routes.js';
// ── Data only (sourced or labelled constants — read, never recomputed by the code under test) ──
import {
  CELL_PRICE_USD_PER_KWH, CELL_NOMINAL_V, CELL_FORMAT, PACK_PARTS, PACK_STRUCTURE, MAGNET_GRADES, TB_OXIDE_CNY_PER_KG,
  TB_IN_OXIDE, MAGNET_FINISHING_UPLIFT, MOTOR_PARTS, MOTOR_STRUCTURE, EV_TOOLING,
} from '../../src/engine/ev-data.js';
import {
  SURFACE_STAGES, SURFACE_METAL_PRICES, PLATING_DEPOSIT_UM_PER_MIN, REFERENCE_DEPOSIT_UM, DEFAULT_SURFACE_LINE,
  type SurfaceStage,
} from '../../src/engine/surface-treatment-data.js';
import { FINISH_LINE_LOADING, SURFACE_FINISH_ROUTES } from '../../src/engine/surface-finish-routes.js';
import { SURFACE_REGIONAL_FACTORS } from '../../src/engine/regional-rates.js';

process.env.AIR_GAPPED = '1';
const VERBOSE = process.argv.includes('--verbose');
const LIB: RateLibrary = DEFAULT_RATE_LIBRARY;

// ─── Library look-ups (the rate book is the source; nothing here is a module) ──────────────────────────────────
const mach = (id: string) => { const m = LIB.machines.find(x => x.id === id); if (!m) throw new Error(`machine ${id}`); return m.computedRatePerHr; };
const lab = (id: string) => { const l = LIB.labour.find(x => x.id === id); if (!l) throw new Error(`labour ${id}`); return l.fullyLoadedRatePerHr; };
const matl = (id: string) => { const m = LIB.materials.find(x => x.id === id); if (!m) throw new Error(`material ${id}`); return m; };
const fx = (id: string) => LIB.fx!.find(f => f.id === id)!.rate;

// ─── Check bookkeeping ───────────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const fails: string[] = [];
function check(caseId: string, what: string, got: number | string, want: number | string, kind: 'gbp' | 'rel' | 'eq' = 'gbp'): void {
  let ok: boolean;
  if (kind === 'eq' || typeof got === 'string' || typeof want === 'string') ok = got === want;
  else if (kind === 'gbp') ok = Math.abs(got - want) <= 0.005;
  else ok = want === 0 ? Math.abs(got) < 1e-9 : Math.abs(got / want - 1) <= 0.005;
  if (ok) pass++; else { fail++; fails.push(`${caseId} — ${what}: got ${got}, shadow ${want}`); }
  if (VERBOSE || !ok) console.log(`${ok ? 'PASS' : 'FAIL'}  ${caseId.padEnd(34)} ${what.padEnd(58)} ${fmt(got)}  ${ok ? '=' : '≠'} ${fmt(want)}`);
}
const fmt = (v: number | string) => typeof v === 'number' ? v.toFixed(6) : v;
/** A defect in a file this audit does not own (main.ts, a test): reported OPEN with its PROPOSED fix, never a FAIL. */
let open = 0;
const opens: string[] = [];
function openItem(caseId: string, what: string, got: number | string, want: number | string): void {
  const same = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) <= 0.005 : got === want;
  if (same) { pass++; return; }
  open++; opens.push(`${caseId} — ${what}: is ${fmt(got)}, should be ${fmt(want)}`);
  if (VERBOSE) console.log(`OPEN  ${caseId.padEnd(34)} ${what.padEnd(58)} ${fmt(got)}  → ${fmt(want)}`);
}

// ─── The shadow's own model of an operation and of the stack ────────────────────────────────────────────────────
interface ShadowOp { name: string; machineId: string; labourId: string; cycleHr: number; labourHr: number; ppc: number; oee: number; manning: number; le: number }
interface Shadow { material: number; boughtIn: number; handlingPct: number; ops: ShadowOp[]; toolingTotal: number; amort: number }
interface Tail { packagingPerPart: number; logisticsPerPart: number; overheadPct: number; marginPct: number }
/** The screen's UK shop defaults (index.html; regionalShopDefaults('UK')): packaging £0.15, logistics £0.25, 12 %, 8 %. */
const SCREEN_TAIL: Tail = { packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08 };

function opMoney(o: ShadowOp) {
  return {
    process: mach(o.machineId) * o.cycleHr / o.ppc / o.oee,
    labour: lab(o.labourId) * o.manning * o.labourHr / o.ppc / o.le,
  };
}
function shadowBuckets(s: Shadow, t: Tail) {
  let process = 0, labour = 0;
  for (const o of s.ops) { const m = opMoney(o); process += m.process; labour += m.labour; }
  const tooling = s.toolingTotal / s.amort;
  const factoryBase = s.material + process + labour + tooling;
  const overhead = t.overheadPct * (factoryBase - s.boughtIn) + s.boughtIn * s.handlingPct;
  const subtotal = factoryBase + t.packagingPerPart + t.logisticsPerPart + overhead;
  const margin = t.marginPct * (subtotal - s.boughtIn);
  return { rawMaterial: s.material, process, labour, tooling, packaging: t.packagingPerPart, logistics: t.logisticsPerPart, overhead, margin, total: subtotal + margin };
}

/** Compare a costed result with the shadow, op by op and bucket by bucket. */
function compare(caseId: string, d: CommodityDrivers, r: PartCostResult, s: Shadow, t: Tail): void {
  check(caseId, 'operation count', r.operationDetails.length, s.ops.length, 'eq');
  s.ops.forEach((o, i) => {
    const got = r.operationDetails[i];
    if (!got) return;
    const m = opMoney(o);
    const tag = `op${i + 1} ${o.name.slice(0, 26)}`;
    check(caseId, `${tag} machine`, got.machineId, o.machineId, 'eq');
    check(caseId, `${tag} cycle h`, got.cycleTimeHr, o.cycleHr, 'rel');
    check(caseId, `${tag} labour h`, got.labourTimeHr, o.labourHr, 'rel');
    check(caseId, `${tag} manning`, got.manning, o.manning, 'rel');
    check(caseId, `${tag} parts/cycle`, got.partsPerCycle, o.ppc, 'eq');
    check(caseId, `${tag} process £`, got.processCost, m.process);
    check(caseId, `${tag} labour £`, got.labourCost, m.labour);
  });
  check(caseId, 'tooling total £', d.tooling.totalToolingCost, s.toolingTotal);
  const b = shadowBuckets(s, t);
  for (const k of ['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'] as const)
    check(caseId, `bucket ${k}`, r.breakdown[k], b[k]);
  check(caseId, 'TOTAL', r.total, b.total);
  totals.push({ caseId, total: r.total, shadow: b.total });
}
const totals: Array<{ caseId: string; total: number; shadow: number }> = [];
const stack = (d: CommodityDrivers, t: Tail, name: string): PartCostResult =>
  computeUniversalStack({ partName: name, rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling, ...t } as UniversalStackInput, LIB);

// ═══ 1. WIRING HARNESS ═══════════════════════════════════════════════════════════════════════════════════════════
// Form defaults (main.ts renderWiringHarnessForm + collectWiringHarnessInput) and the three demo presets
// (main.ts demo loader, case 'wiring_harness'). Labour: the form selects semiskilled for assembly; the test labour
// select is left on the first role (lab-uk-skilled); the test machine on harness-test-sys.
interface HarnessCase { id: string; tail: Tail; inputs: WiringHarnessInputs }
const harnessBase = (o: Partial<WiringHarnessInputs>): WiringHarnessInputs => ({
  wires: [{ crossSectionMm2: 0.5, lengthM: 3.2, pricePerM: 0.10 }, { crossSectionMm2: 1.5, lengthM: 1.4, pricePerM: 0.18 }, { crossSectionMm2: 4, lengthM: 0.6, pricePerM: 0.40 }],
  connectors: [{ count: 4, costEach: 1.20, circuitsPerConnector: 6, terminationTimeSec: 10 }, { count: 2, costEach: 2.80, circuitsPerConnector: 12, terminationTimeSec: 10 }],
  spliceCount: 6, spliceCostEach: 0.08, conduitLengthM: 2, conduitCostPerM: 0.35, tapeMetres: 5, tapeCostPerM: 0.12,
  labourId: 'lab-uk-semiskilled', assemblyTimeHr: 0.45, oee: 0.85, manning: 1, labourEfficiency: 0.90,
  testMachineId: 'harness-test-sys', testLabourId: 'lab-uk-skilled', testTimeHr: 0.05, rejectRate: 0.02,
  boardingBoardCost: 800, boardingBoardLife: 20000, amortizationVolume: 10000, ...o,
});
const HARNESS: HarnessCase[] = [
  { id: 'harness / form default', tail: SCREEN_TAIL, inputs: harnessBase({}) },
  { id: 'harness / demo 1 RR Ghost door', tail: { packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08 }, inputs: harnessBase({
    wires: [{ crossSectionMm2: 0.5, lengthM: 3.2, pricePerM: 0.10 }, { crossSectionMm2: 1.5, lengthM: 1.8, pricePerM: 0.18 }, { crossSectionMm2: 2.5, lengthM: 0.6, pricePerM: 0.28 }],
    connectors: [{ count: 4, costEach: 1.20, circuitsPerConnector: 6, terminationTimeSec: 10 }, { count: 2, costEach: 2.80, circuitsPerConnector: 8, terminationTimeSec: 10 }],
    labourId: 'lab-uk-skilled', assemblyTimeHr: 0.45 }) },
  { id: 'harness / demo 2 Bentayga engine bay', tail: SCREEN_TAIL, inputs: harnessBase({
    wires: [{ crossSectionMm2: 0.5, lengthM: 6.5, pricePerM: 0.10 }, { crossSectionMm2: 1.5, lengthM: 4.2, pricePerM: 0.18 }, { crossSectionMm2: 4, lengthM: 1.3, pricePerM: 0.40 }],
    connectors: [{ count: 6, costEach: 1.80, circuitsPerConnector: 10, terminationTimeSec: 10 }, { count: 4, costEach: 3.50, circuitsPerConnector: 12, terminationTimeSec: 12 }],
    spliceCount: 12, conduitLengthM: 4.5, tapeMetres: 11, labourId: 'lab-uk-skilled', assemblyTimeHr: 0.90 }) },
  { id: 'harness / demo 3 LC300 engine bay', tail: { packagingPerPart: 0.30, logisticsPerPart: 0.70, overheadPct: 0.10, marginPct: 0.08 }, inputs: harnessBase({
    wires: [{ crossSectionMm2: 0.75, lengthM: 4.5, pricePerM: 0.12 }, { crossSectionMm2: 1.5, lengthM: 2.8, pricePerM: 0.20 }, { crossSectionMm2: 4, lengthM: 0.8, pricePerM: 0.42 }],
    connectors: [{ count: 5, costEach: 1.40, circuitsPerConnector: 8, terminationTimeSec: 10 }, { count: 3, costEach: 3.20, circuitsPerConnector: 10, terminationTimeSec: 12 }],
    spliceCount: 8, conduitLengthM: 2.8, tapeMetres: 7, labourId: 'lab-uk-skilled', assemblyTimeHr: 0.65,
    testLabourId: 'lab-uk-skilled', testTimeHr: 0.06, boardingBoardCost: 1000 }) },
];
function harnessShadow(i: WiringHarnessInputs): Shadow {
  const r = i.rejectRate && i.rejectRate > 0 ? 1 / (1 - i.rejectRate) : 1;
  const wire = i.wires.reduce((t, w) => t + w.lengthM * w.pricePerM, 0);
  const conn = i.connectors.reduce((t, c) => t + c.count * c.costEach, 0);
  const material = (wire + conn + i.spliceCount * i.spliceCostEach + i.conduitLengthM * i.conduitCostPerM + i.tapeMetres * i.tapeCostPerM) * r;
  const ops: ShadowOp[] = [
    { name: 'Harness assembly', machineId: 'bench-assembly', labourId: i.labourId, cycleHr: i.assemblyTimeHr * r, labourHr: i.assemblyTimeHr * r, ppc: 1, oee: i.oee, manning: i.manning, le: i.labourEfficiency },
    { name: 'Electrical test', machineId: i.testMachineId ?? 'bench-assembly', labourId: i.testLabourId, cycleHr: i.testTimeHr * r, labourHr: i.testTimeHr * r, ppc: 1, oee: i.oee, manning: 1, le: i.labourEfficiency },
  ];
  // One boarding board per board life — whole boards (the module's stated rule: ceil(volume ÷ life)).
  const boards = Math.ceil(i.amortizationVolume / i.boardingBoardLife);
  return { material, boughtIn: 0, handlingPct: 0, ops, toolingTotal: i.boardingBoardCost * boards, amort: i.amortizationVolume };
}
for (const c of HARNESS) {
  const d = computeWiringHarnessDrivers(c.inputs);
  const r = stack(d, c.tail, c.id);
  compare(c.id, d, r, harnessShadow(c.inputs), c.tail);
  // The material lines (A1): itemised, and they add up to the material bucket.
  const lines = d.rawMaterial.lines ?? [];
  check(c.id, 'material lines itemised (A1)', lines.length > 0 ? 'yes' : 'no', 'yes', 'eq');
  check(c.id, 'material lines add up to the bucket (A1)', lines.reduce((t, l) => t + l.qty * l.unitCost, 0), r.breakdown.rawMaterial);
  // A2: the per-terminal crimp time on the form must not exceed the assembly time it is part of (warning carried).
  const crimpHr = c.inputs.connectors.reduce((t, k) => t + k.count * k.circuitsPerConnector * (k.terminationTimeSec ?? 10), 0) / 3600;
  check(c.id, 'crimp time ≤ typed assembly time (A2)', crimpHr <= c.inputs.assemblyTimeHr ? 'yes' : 'no', 'yes', 'eq');
}

// ═══ 2. PAINTING ═════════════════════════════════════════════════════════════════════════════════════════════════
// Form defaults (renderPaintingForm + the two default coat rows) and the three demo presets. The demo sets
// "Line Rate (parts/hr)" but leaves the route on standard_paint and Parts per Rack on 6, so the screen costs the
// stage route at 6 × 20 = 120 parts/h — the shadow costs exactly what the screen does (finding P1 records the gap).
const STD_PAINT = ['degrease', 'rinse', 'phosphate', 'rinse', 'di_rinse', 'dry_off', 'flash_off', 'cure_oven'];
const COATS: CoatLayer[] = [
  // P2 applied by the lead: the form prices the default coats from the library grade they name (£/kg × kg/L).
  { coatType: 'e_coat', materialId: 'mat-paint-ecoat', dftMicrons: 20, solidsPct: 0.20, transferEfficiency: 0.95, paintDensityKgPerL: 1.3, pricePerL: Math.round(DEFAULT_RATE_LIBRARY.materials.find(m => m.id === 'mat-paint-ecoat')!.pricePerKg * 1.3 * 1000) / 1000 },
  { coatType: 'basecoat', materialId: 'mat-paint-basecoat', dftMicrons: 15, solidsPct: 0.35, transferEfficiency: 0.70, paintDensityKgPerL: 1.25, pricePerL: Math.round(DEFAULT_RATE_LIBRARY.materials.find(m => m.id === 'mat-paint-basecoat')!.pricePerKg * 1.25 * 1000) / 1000 },
];
const paintBase = (o: Partial<PaintingInputs>): PaintingInputs => ({
  surfaceAreaM2: 0.8, coats: COATS, lineId: 'paint-line-std', labourId: 'lab-uk-skilled', lineRatePartsPerHr: 60, oee: 0.85,
  manning: 4, labourEfficiency: 0.95, rejectReworkPct: 0.03, toolingCost: 5000, amortizationVolume: 100000,
  stages: STD_PAINT, partsPerRack: 6, racksPerHour: 20, region: 'UK', ...o,
});
const PAINT: Array<{ id: string; tail: Tail; inputs: PaintingInputs }> = [
  { id: 'painting / form default', tail: SCREEN_TAIL, inputs: paintBase({}) },
  { id: 'painting / demo 1 Urus body panel', tail: { packagingPerPart: 1.5, logisticsPerPart: 3.0, overheadPct: 0.08, marginPct: 0.06 },
    inputs: paintBase({ surfaceAreaM2: 8.5, lineRatePartsPerHr: 15, oee: 0.85, manning: 6, labourEfficiency: 0.92, rejectReworkPct: 0.05, toolingCost: 12000, amortizationVolume: 50000 }) },
  { id: 'painting / demo 2 DBX instrument panel', tail: { packagingPerPart: 0.4, logisticsPerPart: 0.8, overheadPct: 0.08, marginPct: 0.06 },
    inputs: paintBase({ surfaceAreaM2: 0.65, lineRatePartsPerHr: 60, oee: 0.88, manning: 4, labourEfficiency: 0.95, rejectReworkPct: 0.03, toolingCost: 5000, amortizationVolume: 30000 }) },
  { id: 'painting / demo 3 LC300 tailgate', tail: { packagingPerPart: 0.8, logisticsPerPart: 1.8, overheadPct: 0.09, marginPct: 0.07 },
    inputs: paintBase({ surfaceAreaM2: 2.8, lineRatePartsPerHr: 18, oee: 0.85, manning: 5, labourEfficiency: 0.92, rejectReworkPct: 0.04, toolingCost: 8000, amortizationVolume: 40000 }) },
  { id: 'painting / masked route', tail: SCREEN_TAIL, inputs: paintBase({ stages: ['degrease', 'rinse', 'phosphate', 'rinse', 'di_rinse', 'masking', 'dry_off', 'flash_off', 'cure_oven', 'demask'] }) },
  { id: 'painting / zinc plate 12 µm', tail: SCREEN_TAIL, inputs: paintBase({ coats: [], lineId: 'plating-line-barrel', stages: ['degrease', 'rinse', 'zinc_plate', 'rinse', 'passivate', 'dry_off'], depositThicknessUm: 12, partsPerRack: 40, racksPerHour: 6 }) },
  { id: 'painting / legacy line rate', tail: SCREEN_TAIL, inputs: paintBase({ stages: undefined, partsPerRack: undefined, racksPerHour: undefined }) },
];

/** The shadow's surface-treatment arithmetic: dwell, throughput cap, chemistry, effluent, deposited metal, masking. */
interface ShadowSurface { takt: number; consumables: number; maskingSec: number; perStageDwell: Array<{ s: SurfaceStage; dwell: number }>; racks: number }
function stageOf(key: string): SurfaceStage {
  const s = SURFACE_STAGES[key] ?? Object.values(SURFACE_STAGES).find(x => x.id === key);
  if (!s) throw new Error(`stage ${key}`);
  return s;
}
function shadowSurface(o: { stages: string[]; areaM2: number; massKg?: number; partsPerRack?: number; racksPerHour?: number; depositUm?: number; maskedFeatures?: number; region?: string; colourChangeGBP?: number; partsPerColourRun?: number }): ShadowSurface {
  const sf = SURFACE_REGIONAL_FACTORS[(o.region ?? 'UK') as 'UK'] ?? SURFACE_REGIONAL_FACTORS.UK;
  const stages = o.stages.map(stageOf);
  const dwellOf = (s: SurfaceStage) => {
    if (s.kind !== 'plating' || !o.depositUm || o.depositUm <= 0) return s.dwellMinutes.value;
    const key = Object.keys(PLATING_DEPOSIT_UM_PER_MIN).find(k => SURFACE_STAGES[k] === s);
    return key ? o.depositUm / PLATING_DEPOSIT_UM_PER_MIN[key].value : s.dwellMinutes.value * o.depositUm / REFERENCE_DEPOSIT_UM;
  };
  const n = Math.max(1, o.partsPerRack ?? 1);
  let racks = Math.max(0.01, o.racksPerHour ?? 1);
  for (const s of stages) if (s.throughputLimiting) racks = Math.min(racks, 60 / dwellOf(s));
  const masked = Math.max(1, o.maskedFeatures ?? 1);
  let consumables = 0, maskingSec = 0;
  for (const s of stages) {
    const units = s.basis === 'area' ? o.areaM2 : s.basis === 'mass' ? (o.massKg ?? 0) : masked;
    consumables += s.chemistryGBPPerUnit.value * units * sf.chemical + s.effluentGBPPerUnit.value * units * sf.effluent;
    if (s.deposit) {
      const t = s.kind === 'plating' && o.depositUm && o.depositUm > 0 ? o.depositUm : s.deposit.thicknessUm.value;
      const kg = o.areaM2 * t * 1e-6 * s.deposit.densityKgPerM3.value;
      consumables += kg / Math.max(0.01, s.deposit.efficiency.value) * SURFACE_METAL_PRICES[s.deposit.metal].value;
    }
    maskingSec += s.manualSecPerPart.value * (s.basis === 'piece' ? masked : 1);
  }
  if (o.colourChangeGBP && o.partsPerColourRun) consumables += o.colourChangeGBP / Math.max(1, o.partsPerColourRun);
  return { takt: 1 / (n * racks), consumables, maskingSec, perStageDwell: stages.map(s => ({ s, dwell: dwellOf(s) })), racks };
}

function paintShadow(i: PaintingInputs): Shadow {
  const rw = 1 + i.rejectReworkPct;
  // Wet litres = area × DFT ÷ (volume solids × transfer efficiency); £ = litres × £/L.
  const film = i.coats.reduce((t, c) => t + i.surfaceAreaM2 * c.dftMicrons * 1e-6 / (c.solidsPct * c.transferEfficiency) * 1000 * c.pricePerL, 0);
  const ops: ShadowOp[] = [];
  let consumables = 0;
  let takt = 1 / i.lineRatePartsPerHr;
  let maskingSec = 0;
  if (i.stages && i.stages.length) {
    const s = shadowSurface({ stages: i.stages, areaM2: i.surfaceAreaM2, partsPerRack: i.partsPerRack, racksPerHour: i.racksPerHour, depositUm: i.depositThicknessUm, region: i.region, colourChangeGBP: i.colourChangeCostGBP, partsPerColourRun: i.partsPerColourRun });
    takt = s.takt; consumables = s.consumables; maskingSec = s.maskingSec;
  }
  ops.push({ name: 'Line', machineId: i.lineId, labourId: i.labourId, cycleHr: takt * rw, labourHr: takt * rw, ppc: 1, oee: i.oee, manning: i.manning, le: i.labourEfficiency });
  if (maskingSec > 0) ops.push({ name: 'Masking', machineId: i.lineId, labourId: i.labourId, cycleHr: 0, labourHr: maskingSec / 3600 * rw, ppc: 1, oee: 1, manning: 1, le: i.labourEfficiency });
  return { material: (film + consumables) * rw, boughtIn: 0, handlingPct: 0, ops, toolingTotal: i.toolingCost, amort: i.amortizationVolume };
}
for (const c of PAINT) {
  const d = computePaintingDrivers(c.inputs);
  const r = stack(d, c.tail, c.id);
  compare(c.id, d, r, paintShadow(c.inputs), c.tail);
  if (c.inputs.coats.length) {
    // P2: the coat row names a library paint; the price it is costed at should be that grade's £/kg × density.
    for (const coat of c.inputs.coats) {
      const m = matl(coat.materialId);
      openItem(c.id, `coat ${coat.coatType} £/L = library £/kg × kg/L (P2, main.ts)`, coat.pricePerL, m.pricePerKg * coat.paintDensityKgPerL);
    }
  }
  const lines = d.rawMaterial.lines ?? [];
  check(c.id, 'material lines add up to the bucket (P3)', lines.reduce((t, l) => t + l.qty * l.unitCost, 0), r.breakdown.rawMaterial);
}

// ═══ 3. BIW ASSEMBLY ═════════════════════════════════════════════════════════════════════════════════════════════
// Form default (two joining rows, one framing station) and the three demos — which clear the stations but keep the
// form's joining rows (120 spot welds at £0.05, 0.8 m adhesive at £1.20).
const JOINS: BIWAssemblyInputs['joining'] = [{ type: 'spot_weld', count: 120, costPerJoint: 0.05 }, { type: 'adhesive_m', count: 0.8, costPerJoint: 1.20 }];
const st = (stationName: string, machineId: string, labourId: string, cycleTimeHr: number, oee: number, manning: number, labourEfficiency: number) =>
  ({ stationName, machineId, labourId, cycleTimeHr, oee, manning, labourEfficiency });
const BIW: Array<{ id: string; tail: Tail; inputs: BIWAssemblyInputs }> = [
  { id: 'biw / form default', tail: SCREEN_TAIL, inputs: { subPartTotalCost: 45, joining: JOINS, fixturingToolingCost: 200000, amortizationVolume: 50000,
    stations: [st('Framing Station', 'robot-weld-station', 'lab-uk-skilled', 1 / 60, 0.85, 1, 0.92)] } },
  { id: 'biw / demo 1 GLS door inner', tail: { packagingPerPart: 2.5, logisticsPerPart: 5, overheadPct: 0.10, marginPct: 0.07 }, inputs: { subPartTotalCost: 85, joining: JOINS, fixturingToolingCost: 350000, amortizationVolume: 80000,
    stations: [st('Robot Framing Station', 'robot-weld-station', 'lab-uk-skilled', 1 / 60, 0.85, 1, 0.92), st('Robot Spot Weld (Inner)', 'robot-weld-station', 'lab-uk-skilled', 1.5 / 60, 0.85, 1, 0.92), st('MIG Weld — Seam', 'mig-welder-manual', 'lab-uk-skilled', 2 / 60, 0.80, 1, 0.90)] } },
  { id: 'biw / demo 2 Cayenne side frame', tail: { packagingPerPart: 4, logisticsPerPart: 8, overheadPct: 0.10, marginPct: 0.07 }, inputs: { subPartTotalCost: 145, joining: JOINS, fixturingToolingCost: 600000, amortizationVolume: 50000,
    stations: [st('Robot Framing Station', 'robot-weld-station', 'lab-uk-skilled', 1.5 / 60, 0.85, 1, 0.92), st('Robot Spot Weld Array', 'robot-weld-station', 'lab-uk-skilled', 2 / 60, 0.85, 1, 0.92), st('Hemming Station', 'bench-assembly', 'lab-uk-skilled', 1 / 60, 0.80, 2, 0.90), st('Quality Inspection', 'bench-assembly', 'lab-uk-inspector', 0.5 / 60, 0.90, 1, 0.95)] } },
  { id: 'biw / demo 3 Touareg door inner', tail: { packagingPerPart: 1.8, logisticsPerPart: 3.5, overheadPct: 0.10, marginPct: 0.07 }, inputs: { subPartTotalCost: 62, joining: JOINS, fixturingToolingCost: 280000, amortizationVolume: 60000,
    stations: [st('Robot Framing Jig', 'robot-weld-station', 'lab-uk-skilled', 1 / 60, 0.85, 1, 0.92), st('Robot Spot Weld Array (28 welds)', 'robot-weld-station', 'lab-uk-skilled', 1.8 / 60, 0.85, 1, 0.92), st('MIG Seam Weld — Inner Frame', 'mig-welder-manual', 'lab-uk-skilled', 1.5 / 60, 0.80, 1, 0.90), st('Quality Inspection Station', 'bench-assembly', 'lab-uk-inspector', 0.5 / 60, 0.90, 1, 0.95)] } },
];
function biwShadow(i: BIWAssemblyInputs): Shadow {
  const joining = i.joining.reduce((t, j) => t + j.count * j.costPerJoint, 0);
  return {
    material: joining + i.subPartTotalCost, boughtIn: i.subPartTotalCost, handlingPct: i.subPartHandlingPct ?? 0.03,
    ops: i.stations.map(s => ({ name: s.stationName, machineId: s.machineId, labourId: s.labourId, cycleHr: s.cycleTimeHr, labourHr: s.cycleTimeHr, ppc: 1, oee: s.oee, manning: s.manning, le: s.labourEfficiency })),
    toolingTotal: i.fixturingToolingCost, amort: i.amortizationVolume,
  };
}
for (const c of BIW) {
  const d = computeBIWDrivers(c.inputs);
  const r = stack(d, c.tail, c.id);
  compare(c.id, d, r, biwShadow(c.inputs), c.tail);
  const lines = d.rawMaterial.lines ?? [];
  check(c.id, 'material lines add up to the bucket (B1)', lines.reduce((t, l) => t + l.qty * l.unitCost, 0), r.breakdown.rawMaterial);
}

// ═══ 4. BATTERY PACK ═════════════════════════════════════════════════════════════════════════════════════════════
// Form defaults (ev-forms.ts renderBatteryPackForm / batteryInputs). No demo preset exists for this commodity.
const PACK: BatteryPackInputs = { chemistry: 'NMC', cellFormat: 'prismatic', cellCapacityAh: 140, seriesCount: 192, parallelCount: 1,
  architecture: 'module', cellsPerModule: 24, cellHandlingPct: 0.03, packLengthMm: 2000, packWidthMm: 1400, enclosure: 'aluminium',
  cmuChannels: 16, mainContactors: 2, pyrofuse: true, labourId: 'lab-uk-semiskilled', testLabourId: 'lab-uk-technician',
  oee: 0.85, labourEfficiency: 0.9, rejectRate: 0.01, amortizationVolume: 300000 };
function packShadow(i: BatteryPackInputs): { s: Shadow; lines: Record<string, number> } {
  const r = i.rejectRate && i.rejectRate > 0 ? 1 / (1 - i.rejectRate) : 1;
  const cells = i.seriesCount * i.parallelCount;
  const v = i.cellNominalV ?? CELL_NOMINAL_V[i.chemistry];
  const kwh = cells * i.cellCapacityAh * v / 1000;
  const modules = i.architecture === 'module' ? Math.ceil(cells / (i.cellsPerModule ?? 24)) : 0;
  const cellGbpPerKwh = i.cellPriceGbpPerKwh ?? CELL_PRICE_USD_PER_KWH[i.chemistry].usd / fx('fx-gbp-usd');
  const joints = cells * 2;
  const fp = i.packLengthMm / 1000 * i.packWidthMm / 1000;
  const fmtC = CELL_FORMAT[i.cellFormat];
  const enc = PACK_STRUCTURE[i.enclosure], cp = PACK_STRUCTURE.coldPlate;
  const L: Record<string, number> = {
    'BB-AL': joints * fmtC.busbarGPerJoint / 1000 * (matl(PACK_STRUCTURE.busbarMaterialId).pricePerKg + PACK_STRUCTURE.busbarConversionGbpPerKg),
    ...(modules > 1 ? { 'BB-CU': modules * PACK_STRUCTURE.interModuleCopperKgPerModule * (matl(PACK_STRUCTURE.copperMaterialId).pricePerKg + PACK_STRUCTURE.busbarConversionGbpPerKg) } : {}),
    CCS: i.seriesCount * PACK_PARTS.sensingPerChannel.gbp,
    'BMS-M': PACK_PARTS.bmsMaster.gbp,
    'BMS-C': Math.ceil(i.seriesCount / (i.cmuChannels ?? 16)) * PACK_PARTS.cmuBoard.gbp,
    'K-MAIN': (i.mainContactors ?? 2) * PACK_PARTS.mainContactor.gbp,
    'K-PRE': PACK_PARTS.prechargeCircuit.gbp,
    ...(i.pyrofuse !== false ? { PYRO: PACK_PARTS.pyrofuse.gbp } : {}),
    FUSE: PACK_PARTS.mainFuse.gbp, ISENS: PACK_PARTS.currentSensor.gbp, MSD: PACK_PARTS.serviceDisconnect.gbp,
    HVC: PACK_PARTS.hvConnectors.gbp, LVC: PACK_PARTS.lvConnector.gbp,
    ENC: enc.kgPerM2 * fp * (matl(enc.materialId).pricePerKg + enc.conversionGbpPerKg),
    CP: cp.kgPerM2 * fp * (matl(cp.materialId).pricePerKg + cp.conversionGbpPerKg),
    TIM: PACK_PARTS.gapFillerKgPerM2 * fp * PACK_PARTS.gapFillerGbpPerKg,
    MICA: 2 * fp * PACK_PARTS.micaGbpPerM2,
    ...(i.architecture === 'cell_to_pack' ? { ADH: PACK_PARTS.ctpAdhesiveKgPerKwh * kwh * PACK_PARTS.adhesiveGbpPerKg } : { 'MOD-HW': modules * PACK_PARTS.moduleHardware.gbp }),
    VENT: PACK_PARTS.ventValve.gbp, 'COOL-C': PACK_PARTS.coolantConnectors.gbp, SEAL: PACK_PARTS.sealsFasteners.gbp,
  };
  const integration = Object.values(L).reduce((a, b) => a + b, 0);
  const cellsCost = cellGbpPerKwh * kwh;
  L.CELLS = cellsCost;
  const op = (name: string, machineId: string, sec: number, manning: number, labourId = i.labourId): ShadowOp =>
    ({ name, machineId, labourId, cycleHr: sec / 3600 * r, labourHr: sec / 3600 * r, ppc: 1, oee: i.oee, manning, le: i.labourEfficiency });
  const ops: ShadowOp[] = [
    op('Cell OCV/IR', 'bat-cell-ocv-tester', cells * 2, 0.2, i.testLabourId),
    op('Stacking', 'bat-module-stacking', cells * fmtC.stackSecPerCell, 0.5),
    op('Laser weld', 'bat-laser-weld', joints * fmtC.weldSecPerJoint, 0.25),
    ...(modules > 0 ? [op('Module EOL', 'bat-module-eol', modules * 60, 0.25, i.testLabourId)] : []),
    op('Dispense', 'bat-dispense', fp * 90, 0.25),
    op('Pack assembly', 'bat-pack-assembly', 2400 + modules * 45, 2),
    op('Leak test', 'bat-leak-test', 300, 0.5, i.testLabourId),
    op('Pack EOL', 'bat-pack-eol', 1200, 0.5, i.testLabourId),
  ];
  return { lines: L, s: { material: (integration + cellsCost) * r, boughtIn: cellsCost * r, handlingPct: i.cellHandlingPct ?? 0.03, ops, toolingTotal: EV_TOOLING.packFixturesGbp, amort: i.amortizationVolume } };
}
for (const [id, inputs] of [['battery / form default', PACK], ['battery / cell-to-pack, LFP 4680', { ...PACK, chemistry: 'LFP', cellFormat: 'cylindrical_4680', architecture: 'cell_to_pack', cellCapacityAh: 26, seriesCount: 110, parallelCount: 32 }]] as const) {
  const d = computeBatteryPackDrivers(inputs as BatteryPackInputs);
  const r = stack(d, SCREEN_TAIL, id);
  const { s, lines } = packShadow(inputs as BatteryPackInputs);
  for (const l of d.rawMaterial.lines ?? []) if (lines[l.ref] !== undefined) check(id, `line ${l.ref} £`, l.qty * l.unitCost, lines[l.ref]);
  compare(id, d, r, s, SCREEN_TAIL);
  check(id, 'cells bought in once (boughtIn, not in directCost)', d.rawMaterial.directCost! + d.rawMaterial.boughtIn!.cost, r.breakdown.rawMaterial);
  check(id, 'material lines add up to the bucket (E1)', (d.rawMaterial.lines ?? []).reduce((t, l) => t + l.qty * l.unitCost, 0), r.breakdown.rawMaterial);
}

// ═══ 5. E-MOTOR ══════════════════════════════════════════════════════════════════════════════════════════════════
// Form defaults (ev-forms.ts renderEMotorForm / motorInputs). No demo preset exists for this commodity.
const MOTOR: EMotorInputs = { motorType: 'pmsm', statorOdMm: 220, statorIdMm: 150, stackLengthMm: 150, slots: 48, airgapMm: 0.8, shaftDiaMm: 45,
  laminationThicknessMm: 0.27, laminationMaterialId: 'mat-no27-27a', statorSteelFraction: 0.6, winding: 'hairpin', conductorMaterialId: 'mat-cu-hairpin',
  hairpinLayers: 6, magnetGrade: '45UH_GBD', magnetMassKg: 1.5, labourId: 'lab-uk-semiskilled', testLabourId: 'lab-uk-technician',
  oee: 0.85, labourEfficiency: 0.9, rejectRate: 0.01, amortizationVolume: 300000 };
function motorShadow(i: EMotorInputs): { s: Shadow; lines: Record<string, number> } {
  const r = i.rejectRate && i.rejectRate > 0 ? 1 / (1 - i.rejectRate) : 1;
  const steel = matl(i.laminationMaterialId), cond = matl(i.conductorMaterialId);
  const sf = i.stackingFactor ?? 0.96, steelFrac = i.statorSteelFraction ?? 0.6;
  const Lm = i.stackLengthMm / 1000;
  const annulus = Math.PI / 4 * ((i.statorOdMm / 1000) ** 2 - (i.statorIdMm / 1000) ** 2);
  const rotorOd = (i.statorIdMm - 2 * i.airgapMm) / 1000;
  const rotorDisc = Math.PI / 4 * (rotorOd ** 2 - (i.shaftDiaMm / 1000) ** 2);
  const lams = Math.ceil(i.stackLengthMm / i.laminationThicknessMm * sf);
  const stator = annulus * steelFrac * Lm * sf * steel.densityKgPerM3;
  const rotor = rotorDisc * (i.motorType === 'pmsm' ? 0.92 : 0.80) * Lm * sf * steel.densityKgPerM3;
  const pitch = (i.statorOdMm + 6) / 1000;
  const gross = lams * pitch * pitch * i.laminationThicknessMm / 1000 * steel.densityKgPerM3;
  const fill = i.slotFill ?? (i.winding === 'hairpin' ? 0.65 : 0.45), endTurn = i.endTurnFactor ?? (i.winding === 'hairpin' ? 0.5 : 0.9);
  const cu = annulus * (1 - steelFrac) * fill * Lm * (1 + endTurn) * cond.densityKgPerM3;
  const g = MAGNET_GRADES[i.magnetGrade ?? '45UH_GBD'];
  const magGbp = (g.blankCnyPerKg + g.tbMassFraction * TB_OXIDE_CNY_PER_KG / TB_IN_OXIDE) * (1 + MAGNET_FINISHING_UPLIFT) / fx('fx-gbp-cny');
  const housing = Math.PI * (i.statorOdMm + MOTOR_STRUCTURE.housingWallMm) / 1000 * (Lm * (1 + endTurn) + 0.08) * MOTOR_STRUCTURE.housingWallMm / 1000
    * matl(MOTOR_STRUCTURE.housingAlloyId).densityKgPerM3 * MOTOR_STRUCTURE.housingFeatureFactor;
  const shaft = Math.PI / 4 * (i.shaftDiaMm / 1000) ** 2 * (Lm + 0.2) * matl(MOTOR_STRUCTURE.shaftSteelId).densityKgPerM3;
  const welds = i.winding === 'hairpin' ? Math.round(i.slots * (i.hairpinLayers ?? 4) / 2) : 0;
  const L: Record<string, number> = {
    LAM: gross * steel.pricePerKg,
    'LAM-SCR': -(gross - stator - rotor) * steel.scrapRecoveryPricePerKg,
    CU: cu * cond.pricePerKg,
    ...(i.motorType === 'pmsm' ? { MAG: (i.magnetMassKg ?? 1.5) * magGbp } : {}),
    ...(i.motorType === 'induction' ? { CAGE: rotor * MOTOR_PARTS.cageMassFractionOfRotor * (matl(MOTOR_STRUCTURE.housingAlloyId).pricePerKg + MOTOR_PARTS.cageConversionGbpPerKg) } : {}),
    ...(i.motorType === 'eesm' ? { 'CU-ROT': cu * MOTOR_PARTS.eesmRotorCopperFraction * cond.pricePerKg, SLIP: MOTOR_PARTS.slipRingGbp } : {}),
    RESIN: cu * MOTOR_PARTS.resinKgPerKgCopper * MOTOR_PARTS.resinGbpPerKg,
    LINER: i.slots * MOTOR_PARTS.slotLinerPerSlot.gbp,
    HSG: housing * (matl(MOTOR_STRUCTURE.housingAlloyId).pricePerKg / MOTOR_STRUCTURE.housingCastYield + MOTOR_STRUCTURE.housingConversionGbpPerKg),
    SHAFT: shaft * (matl(MOTOR_STRUCTURE.shaftSteelId).pricePerKg + MOTOR_STRUCTURE.shaftConversionGbpPerKg),
    BRG: 2 * MOTOR_PARTS.bearing.gbp, RES: MOTOR_PARTS.resolver.gbp, NTC: 2 * MOTOR_PARTS.tempSensor.gbp,
    HVT: MOTOR_PARTS.hvTerminal.gbp, SEAL: MOTOR_PARTS.sealsFasteners.gbp,
  };
  const material = Object.values(L).reduce((a, b) => a + b, 0);
  const op = (name: string, machineId: string, sec: number, manning: number, labourId = i.labourId): ShadowOp =>
    ({ name, machineId, labourId, cycleHr: sec / 3600 * r, labourHr: sec / 3600 * r, ppc: 1, oee: i.oee, manning, le: i.labourEfficiency });
  const ops: ShadowOp[] = [
    op('Lamination stamping', 'emot-lamination-press', lams / 300 * 60, 0.2),
    ...(i.winding === 'hairpin'
      ? [op('Hairpin forming', 'emot-hairpin-line', 90, 0.5), op('Hairpin weld', 'emot-hairpin-weld', welds * 0.6 + 30, 0.25)]
      : [op('Round wire', 'emot-winding-machine', 240, 0.5)]),
    op('Impregnation', 'emot-impregnation', 120, 0.25),
    op('Rotor', 'emot-rotor-line', 60, 0.5),
    op('Balancing', 'emot-balancing', 90, 0.5),
    op('Final assembly', 'emot-assembly-line', 360, 2),
    op('EOL', 'emot-eol', 300, 0.5, i.testLabourId),
  ];
  const dies = Math.max(1, lams * i.amortizationVolume / EV_TOOLING.laminationDieLifeStrokes);
  const tools = dies * EV_TOOLING.laminationDieGbp + (i.winding === 'hairpin' ? EV_TOOLING.hairpinToolsGbp : 0) + EV_TOOLING.motorFixturesGbp;
  return { lines: L, s: { material: material * r, boughtIn: 0, handlingPct: 0, ops, toolingTotal: tools, amort: i.amortizationVolume } };
}
for (const [id, inputs] of [['e-motor / form default', MOTOR], ['e-motor / induction, round wire', { ...MOTOR, motorType: 'induction', winding: 'round_wire' }], ['e-motor / EESM hairpin', { ...MOTOR, motorType: 'eesm' }]] as const) {
  const d = computeEMotorDrivers(inputs as EMotorInputs);
  const r = stack(d, SCREEN_TAIL, id);
  const { s, lines } = motorShadow(inputs as EMotorInputs);
  for (const l of d.rawMaterial.lines ?? []) if (lines[l.ref] !== undefined) check(id, `line ${l.ref} £`, l.qty * l.unitCost, lines[l.ref]);
  compare(id, d, r, s, SCREEN_TAIL);
  check(id, 'material lines add up to the bucket (E1)', (d.rawMaterial.lines ?? []).reduce((t, l) => t + l.qty * l.unitCost, 0), r.breakdown.rawMaterial);
}

// ═══ 6. SURFACE FINISHING on real parts ══════════════════════════════════════════════════════════════════════════
// The CAD finish question's path: finishLoading (published line capacities) → finishSpec → computeSurfaceFinishing,
// on the measured surface (geometry fixture) and the costed mass (the arithmetic dump's params). The finishing ops
// and consumables are costed alone (no part) so the increment is what is checked.
const BASE = JSON.parse(readFileSync(new URL('../../tests/fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as Array<{ part: string; geometry: { surfaceArea?: { cm2?: number } } }>;
const areaOf = (part: string) => Number(((BASE.find(p => p.part.startsWith(part))!.geometry.surfaceArea!.cm2!) / 10_000).toFixed(4));
const FINISH: Array<{ id: string; part: string; commodity: string; route: string; massKg: number; masked?: number; form?: { ppr: number; racks: number } }> = [
  { id: 'finish / Seat_Locking_Bracket e_coat', part: 'Seat_Locking_Bracket', commodity: 'sheet_metal', route: 'e_coat', massKg: 0.558 },
  { id: 'finish / Seat_Locking_Bracket zinc_plate', part: 'Seat_Locking_Bracket', commodity: 'sheet_metal', route: 'zinc_plate', massKg: 0.558 },
  { id: 'finish / Seat_Locking_Bracket powder', part: 'Seat_Locking_Bracket', commodity: 'sheet_metal', route: 'powder_coat', massKg: 0.558 },
  { id: 'finish / Seat_Locking_Bracket galvanise', part: 'Seat_Locking_Bracket', commodity: 'sheet_metal', route: 'galvanise', massKg: 0.558 },
  { id: 'finish / BIW_Reinf_Channel zinc_flake', part: 'BIW_Reinf_Channel', commodity: 'sheet_metal', route: 'zinc_flake', massKg: 0.497 },
  { id: 'finish / Casting_Braket e_coat masked 2', part: 'Casting_Braket', commodity: 'cast_and_machine', route: 'e_coat', massKg: 2.512, masked: 2 },
  { id: 'finish / FORGE_Hub_Flange zinc_plate', part: 'FORGE_Hub_Flange', commodity: 'forging', route: 'zinc_plate', massKg: 2.842 },
  // Hand-filled form routes (rack defaults 6 × 20): the multi-machine routes.
  { id: 'finish / form cast_ecoat (Casting_Braket)', part: 'Casting_Braket', commodity: 'casting', route: 'cast_ecoat', massKg: 2.512, form: { ppr: 6, racks: 20 } },
  { id: 'finish / form e_coat (Casting_Braket)', part: 'Casting_Braket', commodity: 'casting', route: 'e_coat', massKg: 2.512, form: { ppr: 6, racks: 20 } },
  { id: 'finish / form blast_zinc (Hub_Flange)', part: 'FORGE_Hub_Flange', commodity: 'forging', route: 'blast_zinc', massKg: 2.842, form: { ppr: 6, racks: 20 } },
];
/** Which machine a stage runs on (the shadow's own reading of the rate book's machine classes). */
function shadowMachine(s: SurfaceStage, route: SurfaceStage[]): string {
  if (s.id === 'SF-08') return 'blast-machine';
  if (s.id === 'SF-09') return 'mass-finish-bowl';
  if (s.id === 'SF-24') return 'impregnation-plant';
  if (s.id === 'SF-21') return 'galvanising-kettle';
  // The galvanising plant's rate includes its "flux and pickle tanks" (rate-library sourceNote): a galvanise route's
  // wet pre-treatment runs there, not on a paint line.
  if (route.some(x => x.id === 'SF-21') && s.kind === 'bath') return 'galvanising-kettle';
  const plating = route.find(x => x.kind === 'plating');
  if (!plating) return 'paint-line-std';
  return /anodis/i.test(plating.label) ? 'plating-line-rack' : 'plating-line-barrel';
}
const machineOrder: Record<string, number> = {};
for (const c of FINISH) {
  const area = areaOf(c.part);
  const load = c.form ? { partsPerRack: c.form.ppr, racksPerHour: c.form.racks } : finishLoading(c.route, area, c.massKg)!;
  // Shadow loading — from the published capacities only.
  const barrel = c.route === 'zinc_plate' || c.route === 'zinc_nickel' || c.route === 'blast_zinc';
  const sl = c.form ? { n: c.form.ppr, r: c.form.racks } : barrel
    ? { n: Math.max(1, Math.floor(FINISH_LINE_LOADING.barrel.loadKg / c.massKg)), r: FINISH_LINE_LOADING.barrel.loadsPerHour }
    : { n: Math.max(1, Math.min(Math.floor(FINISH_LINE_LOADING.conveyor.areaPerLoadM2 / area), Math.floor(FINISH_LINE_LOADING.conveyor.maxLoadKg / c.massKg))), r: FINISH_LINE_LOADING.conveyor.loadsPerHour };
  check(c.id, 'parts a load', load.partsPerRack, sl.n, 'eq');
  check(c.id, 'loads an hour', load.racksPerHour, sl.r, 'eq');
  const spec = finishSpec({ route: c.route, productForm: c.commodity === 'forging' ? 'forge_standard' : c.commodity.startsWith('sheet') ? 'sheet_standard' : 'cast_hpdc',
    measuredAreaM2: area, partsPerRack: load.partsPerRack, racksPerHour: load.racksPerHour, maskedFeatures: c.masked, annualVolume: 50_000, region: 'UK' })!;
  const fin = finishingForCommodity(spec, { massKg: c.massKg, labourId: 'lab-uk-semiskilled' })!;
  // Masking goes on at load and comes off at unload: the shadow's stage list (F3).
  const base = SURFACE_FINISH_ROUTES[c.route]!;
  const stages = c.masked ? ['masking', ...base, 'demask'] : base;
  openItem(c.id, 'stage order: masking at load, de-mask at unload (F3)', spec.stages.join(','), stages.join(','));
  const ss = shadowSurface({ stages: spec.stages, areaM2: area, massKg: c.massKg, partsPerRack: sl.n, racksPerHour: sl.r, maskedFeatures: c.masked, region: 'UK' });
  // F1: the route's LINE (coating / plating line; or the only machine) is occupied one line takt a part; a batch cell
  // in front of it (blast, bowl, impregnation vessel) holds one load of the line's parts for its own dwell.
  const routeStages = spec.stages.map(stageOf);
  const machines = [...new Set(routeStages.filter(s => s.kind !== 'manual').map(s => shadowMachine(s, routeStages)))];
  const BATCH = new Set(['blast-machine', 'mass-finish-bowl', 'impregnation-plant']);
  const lineMachine = machines.find(m => !BATCH.has(m)) ?? machines[machines.length - 1];
  const dwellOn = (m: string) => ss.perStageDwell.filter(x => x.s.kind !== 'manual' && shadowMachine(x.s, routeStages) === m).reduce((t, x) => t + x.dwell, 0);
  const ops: ShadowOp[] = machines.map(m => {
    const h = m === lineMachine ? ss.takt : dwellOn(m) / 60 / sl.n;
    return { name: m, machineId: m, labourId: 'lab-uk-semiskilled', cycleHr: h, labourHr: h, ppc: 1, oee: 0.85, manning: DEFAULT_SURFACE_LINE.lineManning.value, le: 0.95 };
  });
  if (ss.maskingSec > 0) ops.push({ name: 'Masking', machineId: lineMachine, labourId: 'lab-uk-semiskilled', cycleHr: 0, labourHr: ss.maskingSec / 3600, ppc: 1, oee: 1, manning: 1, le: 0.95 });
  // Order the costed ops as the shadow lists them (by machine), masking last.
  const costedOps = [...fin.operations].sort((a, b) => (a.benchOperation ? 1 : 0) - (b.benchOperation ? 1 : 0) || machines.indexOf(a.machineId) - machines.indexOf(b.machineId));
  const d: CommodityDrivers = { rawMaterial: { materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1, directCost: 0, consumablesCostPerPart: fin.consumablesPerPart }, operations: costedOps, tooling: { totalToolingCost: 0, amortizationVolume: 1, mode: 'amortized' } };
  const zero: Tail = { packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0, marginPct: 0 };
  const r = stack(d, zero, c.id);
  compare(c.id, d, r, { material: ss.consumables, boughtIn: 0, handlingPct: 0, ops, toolingTotal: 0, amort: 1 }, zero);
  machineOrder[c.id] = r.total;
}
// F1 in one line: the coating line's charge must not fall because a blast and an impregnation stage were added in
// front of it on OTHER machines.
{
  const coatingOf = (id: string) => {
    const c = FINISH.find(x => x.id === id)!; const area = areaOf(c.part);
    const spec = finishSpec({ route: c.route, productForm: 'cast_hpdc', measuredAreaM2: area, partsPerRack: 6, racksPerHour: 20, annualVolume: 50_000, region: 'UK' })!;
    const fin = finishingForCommodity(spec, { massKg: c.massKg, labourId: 'lab-uk-semiskilled' })!;
    return fin.operations.find(o => o.machineId === 'paint-line-std')!.cycleTimeHr;
  };
  check('finish / monotonic (F1)', 'paint-line hours a part: cast_ecoat = e_coat', coatingOf('finish / form cast_ecoat (Casting_Braket)'), coatingOf('finish / form e_coat (Casting_Braket)'), 'rel');
}

// ─── Summary ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nCase totals (screen path v shadow):');
for (const t of totals) console.log(`  ${t.caseId.padEnd(44)} £${t.total.toFixed(4).padStart(12)}   shadow £${t.shadow.toFixed(4).padStart(12)}`);
console.log(`\n${pass} PASS, ${fail} FAIL, ${open} OPEN (proposed fixes outside the audited files)`);
if (open) console.log('\nOPEN:\n  ' + opens.join('\n  '));
if (fail) { console.log('\nFAILS:\n  ' + fails.join('\n  ')); process.exit(1); }
