/**
 * Arithmetic audit, SHEET METAL (30 Oct 2026) — an independent shadow model of every real sheet part.
 *
 *   npx tsx scripts/arith-audit/sheet-metal.ts            # PASS / FAIL per check, exit 1 on any FAIL
 *   npx tsx scripts/arith-audit/sheet-metal.ts --verbose  # also print every PASS
 *
 * The product side is the product's own headless chain (`costMeasuredPart`: rules → toCostParams → module →
 * computeUniversalStack, UK book, 5-year programme, the baseline's answers). The shadow side recomputes every
 * rule-derived input, operation, material line, tool and bucket from the MEASURED geometry
 * (tests/fixtures/real-parts-baseline.json), the RATE BOOK and the stated constants — without calling the
 * sheet-metal rules, the stamping / fabrication modules, the die estimator or the press ladder it checks. Those
 * constants are restated here as data (each with the file it must match); the rate book, the toolroom rates and
 * the outline-offset geometry helper are imported. Packaging and logistics come from geometry-sanity.ts (not a
 * sheet-metal file) and are taken from the product's stack input.
 *
 * Cases: the four sheet parts at 50,000 a year (stamping; the drawn BIW panels on a tandem line), the seat
 * bracket at 5,000 a year (soft tooling; the laser + brake route is refused — the bracket is stretch-formed), and
 * the reinforcement channel at 5,000 a year chosen as sheet_metal_fab — the laser + press-brake route costed.
 */
import { readFileSync } from 'node:fs';
import { costMeasuredPart, type BulkPartResult } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { TOOLROOM_RATES_UK, TOOL_MATERIAL_GBP_PER_KG, SHOP_OVERHEAD_PROFIT } from '../../src/engine/toolmaking.js';
import { offsetOutline, polygonArea, type Pt } from '../../src/engine/nesting.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import { withRates } from '../../src/engine/rate-context.js';
import { routeChoice } from '../../src/engine/cost-input-rules/commodities/sheet-metal.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';
import type { RuleContext } from '../../src/engine/cost-input-rules/types.js';

process.env.AIR_GAPPED = '1';

// ── Stated constants, restated as data (each must equal the file named) ───────────────────────────────────────
const C = {
  shearSteel: 280, utsPerShear: 1 / 0.8,              // rules SHEAR_MPA, UTS_PER_SHEAR
  nPerT: 9807, safety: 1.25,                          // machine-sizing N_PER_TONNE_FORCE, STAMPING_PRESS_SAFETY
  dieEnd: 400, singleDie: 600,                        // machine-sizing DIE_END_ALLOWANCE_MM, SINGLE_DIE_ALLOWANCE_MM
  bendK: 0.166, stripper: 1.1, binderMPa: 2.5,        // rules (V-bend 1.33/8, +10% stripper, BINDER_PRESSURE_MPA)
  bendsPerStation: 3, maxStations: 12,                // rules BENDS_PER_STATION
  tandemCm2: 1500, laserBelow: 30_000, laserBpm: 20, dieBpm: 45, largeBlank: 600,
  tandemSpm: 10, transferSpm: 20, feedMmMin: 18_000, derate: 0.8,
  reject: 0.015, maint: 0.05, soft: { factor: 0.35, life: 25_000, maxParts: 25_000 },
  oee: 0.85, labEff: 0.95,                            // to-cost-params FORM_EFFICIENCY_DEFAULTS.sheet_metal
  shopOee: 0.80, shopLabEff: 0.92,                    // to-cost-params SHOP_DEFAULTS (the fab route)
  overhead: 0.12, margin: 0.08,
  fab: { bendSec: 12, handlingSec: 10, toolChanges: 2, toolChangeSec: 900, toolingGBP: 1500, gasO2: 1.8, laserLoad: 8 },
};
// machine-sizing.ts STAMPING_PRESSES (tonnes, bolster mm, max SPM — engineering-typical)
const PRESSES = [
  { id: 'press-100t', t: 100, bolster: 1300, spm: 80 }, { id: 'press-200t', t: 200, bolster: 1800, spm: 60 },
  { id: 'press-400t', t: 400, bolster: 2500, spm: 40 }, { id: 'press-630t', t: 630, bolster: 3000, spm: 30 },
  { id: 'press-800t', t: 800, bolster: 3600, spm: 25 }, { id: 'press-1000t', t: 1000, bolster: 4200, spm: 20 },
  { id: 'press-1250t', t: 1250, bolster: 4800, spm: 18 },
];
const pickPress = (tonnes: number, bolster: number) =>
  PRESSES.find(p => p.t >= tonnes * C.safety && p.bolster >= bolster) ?? PRESSES[PRESSES.length - 1];

const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const mRate = (id: string) => book.machines.find(m => m.id === id)!.computedRatePerHr;
const lRate = (id: string) => book.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
const mat = (id: string) => book.materials.find(m => m.id === id)!;
const r0 = (v: number) => Math.round(v);
const batchOf = (annual: number) => Math.round(Math.min(5000, Math.max(50, annual / 20)));

/** The die build-up, from first principles (sheet-metal-advisor.ts estimateStampingDieCost, UK toolroom). */
function dieCost(type: 'single_stage' | 'progressive' | 'transfer', stations: number, blankCm2: number, shear: number): number {
  const blank = Math.max(20, blankCm2);
  const hard = Math.min(2, 1 + Math.max(0, shear - 300) / 300 * 0.4);
  const typeF = type === 'single_stage' ? 0.6 : type === 'transfer' ? 1.25 : 1.0;
  const nre = type === 'single_stage' ? 1200 + 300 * stations : type === 'transfer' ? 4500 + 900 * stations : 3200 + 800 * stations;
  const steelKg = blank * 0.85 * 5 * 2 * 1.2 * 7.85e-3 * stations;
  const stH = (70 + 0.11 * blank) * hard * typeF;
  const R = TOOLROOM_RATES_UK;
  const lines = [
    r0(nre / R.design * R.design), r0(2900 + 3.2 * blank), r0((25 + 0.02 * blank) * R.cnc),
    r0(steelKg * TOOL_MATERIAL_GBP_PER_KG.h13), r0(0.35 * stH * stations * R.edm),
    r0(0.45 * stH * stations * R.cnc), r0(0.20 * stH * stations * R.fitting), r0(32 * R.tryoutPress),
  ];
  const sub = lines.reduce((a, b) => a + b, 0);
  return r0(sub + r0(sub * SHOP_OVERHEAD_PROFIT));
}
function dieLife(shear: number, t: number): number {
  const life = 1_000_000 * Math.pow(300 / Math.max(150, shear), 1.3) * (t <= 1.5 ? 1 : Math.max(0.5, 1.5 / t));
  return Math.round(Math.min(3_000_000, Math.max(50_000, life)) / 10_000) * 10_000;
}

interface Op { name: string; machineId: string; labourId: string; cycleHr: number; ppc: number; oee: number; manning: number; labourHr: number; le: number }
interface Shadow {
  params: Record<string, number | string>;
  ops: Op[];
  rm: { netKg: number; util: number; consumables: number };
  toolingTotal: number; amort: number;
}

function shadowStamping(g: OCCTGeometry, annual: number): Record<string, any> {
  const sm = g.sheetMetal!; const dev = g.blank!; const bb = g.boundingBox!;
  const t = Math.round(sm.thicknessMm! * 100) / 100;
  const strain = dev.maxStrainPct ?? 0;
  const kind = dev.developedFrom === 'solid' && dev.developable === false ? (strain > 15 ? 'drawn' : 'stretch') : 'bent';
  const drawDepth = Math.max(0, Math.min(bb.xMm, bb.yMm, bb.zMm) - (sm.thicknessMm ?? 0));
  const add = kind === 'drawn' ? Math.round(Math.min(80, Math.max(20, 0.5 * drawDepth))) : kind === 'stretch' ? 10 : 0;
  const L = Math.round(dev.boundingRectMm.lengthMm + 2 * add), W = Math.round(dev.boundingRectMm.widthMm + 2 * add);
  const netKg = Math.round(g.volume!.cm3! * mat('mat-dc04').densityKgPerM3 / 1e6 * 1000) / 1000;
  const cut = dev.outerPerimeterMm + (dev.holePerimeterMm ?? 0);
  const tableHoles = ((g.featureTable ?? []) as Array<{ kind: string; count: number; through?: boolean }>)
    .filter(r => r.kind === 'hole' && r.through !== false).reduce((n, r) => n + r.count, 0);
  const holes = Math.max(tableHoles, dev.holeCount ?? 0);
  const bends = sm.bendCount ?? 0, bendLen = sm.totalBendLengthMm ?? 0;
  const shortSide = Math.min(dev.boundingRectMm.lengthMm, dev.boundingRectMm.widthMm);
  const pressLine = kind === 'drawn' ? (dev.grossAreaMm2 / 100 >= C.tandemCm2 ? 'tandem' : 'transfer')
    : kind === 'bent' && shortSide > C.largeBlank ? 'transfer' : 'coil-fed';
  const blanking = pressLine === 'coil-fed' ? 'none' : annual < C.laserBelow ? 'laser' : 'die';
  const bpm = blanking === 'none' ? 0 : blanking === 'laser' ? C.laserBpm : C.dieBpm;
  const st = kind === 'drawn' ? 5 : pressLine === 'transfer'
    ? Math.min(12, Math.max(2, 1 + Math.ceil(bends / C.bendsPerStation) + (holes > 0 ? 1 : 0)))
    : Math.min(C.maxStations, Math.max(1, (holes > 0 ? 1 : 0) + Math.ceil(bends / C.bendsPerStation) + 1 + (kind === 'stretch' ? 1 : 0)));
  const presses = pressLine === 'tandem' ? 5 : 1;
  const dieType = pressLine === 'tandem' ? 'single_stage' : pressLine === 'transfer' ? 'transfer' : st <= 2 ? 'single_stage' : 'progressive';
  const shear = C.shearSteel, uts = Math.round(shear * C.utsPerShear);
  const cutT = cut * t * shear / C.nPerT, bendT = C.bendK * bendLen * t * uts / C.nPerT;
  const foot = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a);
  const drawT = kind === 'drawn' ? 2 * (foot[0] + foot[1]) * t * uts / C.nPerT + C.binderMPa * Math.max(0, L * W - foot[0] * foot[1]) / C.nPerT : 0;
  const tonnes = pressLine === 'tandem' ? Math.max(drawT, cutT) : kind === 'drawn' ? drawT + cutT + bendT
    : pressLine === 'transfer' ? cutT + bendT : C.stripper * (cutT + bendT);
  // pitch / strip are the nest's (geometry, checked separately); the bolster and the SPM read them.
  return { kind, t, add, L, W, netKg, cut, holes, bends, pressLine, blanking, bpm, st, presses, dieType, shear, tonnes, foot };
}

// ── The full shadow, once the strip cell is known ────────────────────────────────────────────────────────────
function shadow(g: OCCTGeometry, annual: number, years: number, pitch: number, strip: number): Shadow {
  const pre = shadowStamping(g, annual);
  const { t, L, W, netKg, presses, dieType, pressLine, blanking, bpm, st, shear, tonnes, bends } = pre;
  const longSide = Math.max(L, W);
  const bolster = pressLine === 'tandem' ? Math.round(longSide + C.singleDie)
    : pressLine === 'transfer' ? Math.round(st * (longSide + 100) + C.dieEnd) : Math.round(st * pitch + C.dieEnd);
  const press = pickPress(tonnes, bolster);
  const pressById = press;
  const steps = [4, 8, 14].filter(n => bends >= n).length;
  const spm = pressLine === 'tandem' ? C.tandemSpm : pressLine === 'transfer' ? Math.min(pressById.spm, C.transferSpm)
    : Math.max(5, Math.round(Math.min(C.feedMmMin / pitch, pressById.spm) * Math.pow(C.derate, steps)));
  const manning = pressLine === 'coil-fed' && pressById.t <= 400 ? 0.5 : 1;
  const setupH = pressLine === 'tandem' ? 0.5 : pressLine === 'transfer' ? 1.5 : pressById.t > 400 ? 1.5 : 1;
  const batch = batchOf(annual);
  const amort = annual * years;
  const soft = annual * years <= C.soft.maxParts;
  const blankCm2 = L * W / 100;
  const lineDie = pressLine === 'tandem' ? presses * dieCost('single_stage', 1, blankCm2, shear) : dieCost(dieType, st, blankCm2, shear);
  const blankDie = blanking === 'die' ? dieCost('single_stage', 1, blankCm2, shear) : 0;
  const die = Math.round((lineDie + blankDie) * (soft ? C.soft.factor : 1));
  const life = soft ? C.soft.life : dieLife(shear, t);
  const maint = soft ? 0 : C.maint;
  const toolingTotal = die * Math.ceil(amort / life) * (1 + maint * Math.max(1, amort / annual));
  const u = 1 / (1 - C.reject);
  const kgStroke = pitch * strip * t * mat('mat-dc04').densityKgPerM3 / 1e9;
  const util = Math.min(netKg / kgStroke, 1);
  const ops: Op[] = [];
  const blankPress = blanking === 'die'
    ? pickPress(2 * (L + W) * t * shear / C.nPerT, Math.round(longSide + C.singleDie)).id : 'laser-trumpf-5030';
  if (blanking !== 'none') {
    const hr = 1 / (bpm * 60) * u;
    ops.push({ name: blanking === 'laser' ? 'Laser blanking line' : 'Blanking press (coil → blanks)', machineId: blankPress, labourId: 'lab-uk-semiskilled',
      cycleHr: hr, ppc: 1, oee: C.oee, manning, labourHr: hr, le: C.labEff });
  }
  const floor = dieType === 'transfer' ? 3.0 : dieType === 'progressive' ? 0.75 : 1.5;
  const cyc = Math.max(1 / (spm * 60), floor / 3600) * u * presses;
  ops.push({ name: pressLine === 'tandem' ? `Tandem press line (${presses} presses)` : pressLine === 'transfer' ? 'Transfer press' : `Press (${dieType.replace('_', ' ')})`,
    machineId: press.id, labourId: 'lab-uk-semiskilled', cycleHr: cyc, ppc: 1, oee: C.oee, manning, labourHr: cyc, le: C.labEff });
  const ch = setupH / batch;
  ops.push({ name: 'Die change (amortised over the batch)', machineId: press.id, labourId: 'lab-uk-technician', cycleHr: ch * presses, ppc: 1, oee: 1, manning: 1, labourHr: ch * presses, le: 1 });
  if (blanking === 'die') ops.push({ name: 'Blanking die change (amortised over the batch)', machineId: blankPress, labourId: 'lab-uk-technician', cycleHr: ch, ppc: 1, oee: 1, manning: 1, labourHr: ch, le: 1 });
  return {
    params: { thicknessMm: t, blankLengthMm: L, blankWidthMm: W, perimeterMm: Math.round(pre.cut), netWeightKg: netKg, shearStrengthMPa: shear,
      pressId: press.id, strokesPerMin: spm, numOperations: st, dieType, pressLine, manning, dieCostEstimate: die, dieLife: life,
      rejectRate: C.reject, oee: C.oee, labourEfficiency: C.labEff, amortizationVolume: amort, 'setup.hoursPerChange': setupH, 'setup.batchSize': batch },
    ops, rm: { netKg: netKg * u, util, consumables: 0 }, toolingTotal, amort,
  };
}

function shadowFab(g: OCCTGeometry, annual: number, years: number, pitch: number, strip: number): Shadow {
  const sm = g.sheetMetal!; const dev = g.blank!;
  const t = Math.round(sm.thicknessMm! * 100) / 100;
  const netKg = Math.round(g.volume!.cm3! * mat('mat-dc04').densityKgPerM3 / 1e6 * 1000) / 1000;
  const cut = dev.outerPerimeterMm + (dev.holePerimeterMm ?? 0);
  const tableHoles = ((g.featureTable ?? []) as Array<{ kind: string; count: number; through?: boolean }>)
    .filter(r => r.kind === 'hole' && r.through !== false).reduce((n, r) => n + r.count, 0);
  const holes = Math.max(tableHoles, dev.holeCount ?? 0);
  const bends = sm.bendCount ?? 0;
  const feed = 8500 / Math.pow(Math.max(0.3, t), 1.05);                  // mild steel, sheet-metal-fab.ts
  const laserSec = Math.round((cut / feed * 60 + (holes + 1) * (0.3 + 0.15 * t) + C.fab.laserLoad) * 10) / 10;
  const bendSec = Math.round((C.fab.bendSec + C.fab.handlingSec / bends) * 10) / 10;
  const batch = batchOf(annual);
  const util = Math.min(0.95, Math.round(dev.netAreaMm2 / (pitch * strip) * 100) / 100);
  const u = 1 / (1 - C.reject);
  const L = Math.max(dev.boundingRectMm.lengthMm, dev.boundingRectMm.widthMm);
  const brake = L > 1500 ? 'brake-trumpf-5230' : 'brake-trumpf-trubend3100';
  const ops: Op[] = [
    { name: 'Laser Cutting', machineId: 'laser-trumpf-3030', labourId: 'lab-uk-semiskilled', cycleHr: laserSec / 3600 * u, ppc: 1, oee: C.shopOee, manning: 1, labourHr: laserSec / 3600 * u, le: C.shopLabEff },
    { name: 'Press Brake Bending', machineId: brake, labourId: 'lab-uk-skilled', cycleHr: bends * bendSec / 3600 * u, ppc: 1, oee: C.shopOee, manning: 1, labourHr: bends * bendSec / 3600 * u, le: C.shopLabEff },
    { name: 'Press brake set-up (amortised over the batch)', machineId: brake, labourId: 'lab-uk-skilled', cycleHr: C.fab.toolChanges * C.fab.toolChangeSec / batch / 3600, ppc: 1, oee: 1, manning: 1, labourHr: C.fab.toolChanges * C.fab.toolChangeSec / batch / 3600, le: 1 },
  ];
  return {
    params: { blankingCycleTimeSec: laserSec, timePerBendSec: bendSec, bendCount: bends, batchSize: batch, materialUtilization: util, partWeightKg: netKg, toolingCost: C.fab.toolingGBP },
    ops, rm: { netKg: netKg * u, util, consumables: C.fab.gasO2 * laserSec / 3600 * u }, toolingTotal: C.fab.toolingGBP, amort: annual * years,
  };
}

function buckets(s: Shadow, pack: number, logi: number, matId: string) {
  const m = mat(matId);
  const gross = s.rm.netKg / s.rm.util;
  const rawMaterial = gross * m.pricePerKg - (gross - s.rm.netKg) * m.scrapRecoveryPricePerKg + s.rm.consumables;
  let process = 0, labour = 0;
  const opCost = s.ops.map(o => {
    const p = mRate(o.machineId) * o.cycleHr / o.ppc / o.oee;
    const l = lRate(o.labourId) * o.manning * o.labourHr / o.ppc / o.le;
    process += p; labour += l;
    return { name: o.name, p, l };
  });
  const tooling = s.toolingTotal / s.amort;
  const base = rawMaterial + process + labour + tooling;
  const overhead = C.overhead * base;
  const subtotal = base + pack + logi + overhead;
  const margin = C.margin * subtotal;
  return { rawMaterial, process, labour, tooling, packaging: pack, logistics: logi, overhead, margin, total: subtotal + margin, opCost };
}

// ── Compare ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface Check { part: string; what: string; product: number | string; shadow: number | string; pass: boolean }
const near = (a: number, b: number, abs: number, rel = 0) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));

export async function runSheetMetalAudit(): Promise<Check[]> {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
  const checks: Check[] = [];
  const cases: Array<{ part: string; annual: number; commodity?: string; label: string }> = [
    { part: 'Seat_Locking_Bracket.stp', annual: 50_000, label: 'Seat_Locking_Bracket @50k' },
    { part: 'BIW_Floor_Reinforcement.stp', annual: 50_000, label: 'BIW_Floor_Reinforcement @50k' },
    { part: 'BIW_Inner_Panel.stp', annual: 50_000, label: 'BIW_Inner_Panel @50k' },
    { part: 'BIW_Reinf_Channel.stp', annual: 50_000, label: 'BIW_Reinf_Channel @50k' },
    { part: 'Seat_Locking_Bracket.stp', annual: 5_000, label: 'Seat_Locking_Bracket @5k' },
    { part: 'BIW_Reinf_Channel.stp', annual: 5_000, commodity: 'sheet_metal_fab', label: 'BIW_Reinf_Channel @5k fab' },
  ];
  const years = 5;
  for (const c of cases) {
    const p = base.find(b => b.part === c.part)!;
    const spec = ANSWERS[c.part];
    const commodity = c.commodity ?? spec.commodity;
    const r = await costMeasuredPart(p.geometry, c.part,
      { partNumber: c.part, file: c.part, annualVolume: c.annual, ...(commodity ? { commodity } : {}) },
      spec.answers, 'UK', { annualVolume: c.annual, programmeYears: years }, book, { partNumber: c.part, file: c.part, status: 'error' } as BulkPartResult);
    const add = (what: string, product: number | string | undefined, sh: number | string, tol = 0.005, rel = 0) => {
      const pass = typeof sh === 'number' && typeof product === 'number' ? near(product, sh, tol, rel) : product === sh;
      checks.push({ part: c.label, what, product: product ?? 'missing', shadow: sh, pass });
    };
    const params = r.params as Record<string, any>;
    const tr = r.trace as any;
    const fab = r.commodity === 'sheet_metal_fab';
    const pitch = Number(r.provenance?.['sm-pitch']?.value), strip = Number(r.provenance?.['sm-strip-w']?.value);
    // The nest is geometry: the strip width is the outline's extent across the coil + 2 edge margins at the printed
    // angle, and the printed utilisation is the grown outline's area ÷ the strip cell.
    const dev = p.geometry.blank!;
    if (dev.outline?.length) {
      const pre = shadowStamping(p.geometry, c.annual);
      const grown = pre.add > 0 ? offsetOutline(dev.outline as Pt[], pre.add) : dev.outline as Pt[];
      const area = polygonArea(grown);
      const printed = /= (\d+)% utilisation/.exec(String(r.provenance?.['sm-pitch']?.basis ?? ''))?.[1];
      if (printed) add('nest: printed utilisation = grown outline ÷ (pitch × strip), %', Number(printed), Math.round(area / (pitch * strip) * 100), 0.5);
      const ang = Number(/1-up at (\d+)°/.exec(String(r.provenance?.['sm-pitch']?.basis ?? ''))?.[1] ?? 0);
      const edge = Math.max(3, 2 * pre.t);
      let best = Infinity;
      for (let d = -1; d <= 1; d += 0.25) {
        const a = (ang + d) * Math.PI / 180;
        const ys = grown.map(([x, y]) => x * Math.sin(a) + y * Math.cos(a));
        best = Math.min(best, Math.abs(Math.max(...ys) - Math.min(...ys) + 2 * edge - strip));
      }
      add('nest: strip = extent across the coil + 2 × edge (mm, at the printed angle ±1°)', best, 0, 2.5);
      add('nest: pitch × strip ≥ the grown outline (no overlap)', pitch * strip >= area ? 1 : 0, 1);
    }
    const sh = fab ? shadowFab(p.geometry, c.annual, years, pitch, strip) : shadow(p.geometry, c.annual, years, pitch, strip);
    for (const [k, v] of Object.entries(sh.params)) {
      const pv = k.startsWith('setup.') ? params.setup?.[k.slice(6)] : params[k];
      add(`param ${k}`, pv, v as number | string, 0.0005, 0.005);
    }
    if (!fab) add('param maintenanceYears', params.maintenanceYears ?? 1, sh.toolingTotal ? (c.annual * years <= C.soft.maxParts ? 1 : years) : 1, 0);
    add('rawMaterial.netWeightKg (net × 1/(1−reject))', tr.drivers.rawMaterial.netWeightKg, sh.rm.netKg, 1e-6);
    add('rawMaterial.materialUtilization', tr.drivers.rawMaterial.materialUtilization, sh.rm.util, 1e-4);
    add('rawMaterial consumables £', tr.drivers.rawMaterial.consumablesCostPerPart ?? 0, sh.rm.consumables, 1e-5);
    add('tooling.totalToolingCost £', tr.drivers.tooling.totalToolingCost, sh.toolingTotal, 0.5);
    add('tooling.amortizationVolume', tr.drivers.tooling.amortizationVolume, sh.amort, 0);
    const b = buckets(sh, tr.stackInput.packagingPerPart, tr.stackInput.logisticsPerPart, params.materialId);
    add('operation sequence', tr.operations.map((o: any) => o.operationName).join(' → '), sh.ops.map(o => o.name).join(' → '));
    tr.operations.forEach((o: any, i: number) => {
      const s = sh.ops[i]; if (!s) return;
      add(`op ${i + 1} ${o.operationName}: machine`, o.machineId, s.machineId);
      add(`op ${i + 1} ${o.operationName}: cycle s`, o.cycleTimeHr * 3600, s.cycleHr * 3600, 1e-4);
      add(`op ${i + 1} ${o.operationName}: crew × labour s`, o.manning * o.labourTimeHr * 3600, s.manning * s.labourHr * 3600, 1e-4);
      add(`op ${i + 1} ${o.operationName}: OEE`, o.oee, s.oee, 0);
      add(`op ${i + 1} ${o.operationName}: machine £`, o.processCost, b.opCost[i].p, 0.005);
      add(`op ${i + 1} ${o.operationName}: labour £`, o.labourCost, b.opCost[i].l, 0.005);
    });
    for (const k of ['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'] as const) {
      add(`bucket ${k} £`, (r.breakdown as any)[k], b[k], 0.005);
    }
    add('total £', r.total, b.total, 0.005);
    // The route basis prints a stamping and a fab £/part: each must be what its route's costing carries (machine +
    // labour + tooling, and the fab's assist gas). The printed figure is read; the shadow is the arithmetic.
    const ctx = { geo: p.geometry, geometryQuality: 'occt', commodity: commodity ?? 'sheet_metal', commoditySource: 'engineer', annualVolume: c.annual,
      filename: c.part, answers: spec.answers, rates: book, programmeYears: years } as unknown as RuleContext;
    const rc = withRates(book, () => routeChoice(ctx));
    const routeGBP = b.process + b.labour + b.tooling + (fab ? sh.rm.consumables : 0);
    if (rc) {
      const printed = fab ? rc.fab!.perPartGBP : rc.stampGBP!;
      add(`route basis: ${fab ? 'laser + brake' : 'stamping'} £/part = the costing's machine + labour + tooling${fab ? ' + gas' : ''}`, printed, routeGBP, 0.0006);
    }
  }
  return checks;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sheet-metal.ts')) {
  const verbose = process.argv.includes('--verbose');
  const checks = await runSheetMetalAudit();
  let fails = 0;
  for (const c of checks) {
    if (!c.pass) fails++;
    if (verbose || !c.pass) {
      const fmt = (v: number | string) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toFixed(5)) : v;
      console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.part.padEnd(30)} ${c.what.padEnd(70)} product ${fmt(c.product)}  shadow ${fmt(c.shadow)}`);
    }
  }
  const parts = [...new Set(checks.map(c => c.part))];
  for (const p of parts) {
    const cs = checks.filter(c => c.part === p);
    console.log(`${p.padEnd(32)} ${cs.filter(c => c.pass).length}/${cs.length} PASS`);
  }
  console.log(`${checks.length} checks, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
}
