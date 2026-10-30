/**
 * Arithmetic audit — GEARS (30 Oct 2026). An independent shadow of the gear costing.
 *
 * For the real spur gear (test-gear-m3-z38.step) it re-costs the part through the product's own headless chain
 * (`costMeasuredPart`, UK, 50,000 a year, 5-year programme, the baseline's answers) at ISO 1328 class 8 (the baseline),
 * class 6 and class 7 (the ground branches; 7 is what the drawing governs) and class 9 (as-hobbed), and then
 * recomputes every figure WITHOUT calling the gear rules, the gear module, the advisor, the cycle model or the
 * heat-treat rate engine: only the measured geometry, the rate book, the shop-data / heat-treat DATA tables and
 * REGIONAL_DATA are read, and the arithmetic is written out here. Every rule value, every operation's time and £,
 * the material line, the heat-treat package, tooling and the 8 buckets are compared with the live result.
 *
 *   npx tsx scripts/arith-audit/gear.ts            # PASS / FAIL per check; exit 1 on any FAIL
 *
 * Tolerance: ½ p on money, 0.5 % on an input / time.
 */
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { REGIONAL_DATA } from '../../src/engine/regional-rates.js';
import { CUTTING_DATA } from '../../src/engine/machining-time.js';
import { DEFAULT_GEAR_SHOP_DATA } from '../../src/engine/gear-shop-data.js';
import { GEAR_HEAT_TREAT_PROCESSES, DEFAULT_HT_SHOP } from '../../src/engine/gear-heat-treat-data.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';

const PART = 'test-gear-m3-z38.step';
const V = 50_000;
const YEARS = 5;

let pass = 0, fail = 0;
const failures: string[] = [];
function check(label: string, mine: number, live: number | undefined, kind: 'money' | 'rel' = 'money'): void {
  const l = Number(live);
  const ok = Number.isFinite(l) && (kind === 'money'
    ? Math.abs(mine - l) <= 0.005
    : Math.abs(mine - l) <= 0.005 * Math.max(Math.abs(mine), 1e-9));
  if (ok) pass++; else { fail++; failures.push(label); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} shadow ${mine.toFixed(5).padStart(13)}  live ${Number.isFinite(l) ? l.toFixed(5).padStart(13) : String(live)}`);
}
function checkText(label: string, ok: boolean, detail = ''): void {
  if (ok) pass++; else { fail++; failures.push(label); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const geo = base.find(p => p.part === PART)!.geometry;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const machineRate = (id: string): number => book.machines.find(m => m.id === id)!.computedRatePerHr;
const labourRate = (id: string): number => book.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;

// ── The heat-treat rate, written out (gear-heat-treat-rate.ts's chain, NOT called) ────────────────────────────────
// throughput = load / cycle × hours × OEE; energy + labour + capital annuity + maintenance + consumables + fixtures
// + overhead + QC = conversion; + scrap × quality = in-house; sub-contract (the default) adds SG&A, margin, freight.
const UK = REGIONAL_DATA.UK;
function htRatePerKg(key: string, ecdMm = 0.7): number {
  const p = GEAR_HEAT_TREAT_PROCESSES[key];
  const s = DEFAULT_HT_SHOP;
  const load = p.netLoadKg.value;
  const cyc = p.cycleHours.value * (p.scalesWithCaseDepth ? (ecdMm / 0.7) ** 2 : 1);
  const thr = load / cyc * s.operatingHoursPerYear.value * s.oee.value;
  const energy = p.secElectricKwhPerKg.value * UK.energy.electricityPerKwh + p.secGasKwhPerKg.value * UK.energy.gasPerKwh;
  const labour = cyc * p.attendanceOpHPerFurnaceH.value * UK.labour.semiskilled / load;
  const cap = p.capitalGBP.value * UK.machineRateMultiplier;
  const i = s.wacc.value, n = s.depreciationLifeYears.value;
  const crf = i / (1 - (1 + i) ** -n);
  const capital = cap * crf / thr;
  const maint = cap * s.maintenancePctOfCapital.value / thr;
  const cons = p.consumablesGBPPerKg.value * UK.materialMultiplier;
  const fix = p.fixturesGBPPerKg.value * UK.materialMultiplier;
  const ovh = s.overheadPerFurnacePerYearGBP.value * UK.overheadMultiplier / thr;
  const qcMult = 0.5 * UK.labour.inspector / UK.labour.inspector + 0.5 * UK.machineRateMultiplier;
  const qc = p.qcGBPPerLoad.value * qcMult / load;
  const conv = energy + labour + capital + maint + cons + fix + ovh + qc;
  const inHouse = conv * (1 + p.scrapFraction.value * s.qualityMultiplier.value);
  const sga = inHouse * s.subcontractSgaPct.value;
  const margin = (inHouse + sga) * s.subcontractMarginPct.value;
  const freightMult = 0.5 * 1 + 0.5 * UK.machineRateMultiplier;
  return inHouse + sga + margin + s.subcontractLogisticsGBPPerKg.value * freightMult;
}
/** Sub-contract round-trip freight, £/kg (UK: semi-skilled ratio 1, capital multiplier 1). */
function htFreightPerKg(): number {
  return DEFAULT_HT_SHOP.subcontractLogisticsGBPPerKg.value * (0.5 * 1 + 0.5 * UK.machineRateMultiplier);
}

interface ShadowOp { name: string; machine: string; labour: string; crew: number; sec: number }

async function runCase(q: number): Promise<void> {
  const answers = { ...ANSWERS[PART].answers, 'gear.qualityClass': String(q) };
  const live = await costMeasuredPart(geo, PART, { partNumber: PART, file: PART, annualVolume: V },
    answers, 'UK', { annualVolume: V, programmeYears: YEARS }, book, { partNumber: PART, file: PART, status: 'error' } as never);
  console.log(`\n=== ${PART} — ISO 1328 class ${q} — live total £${live.total?.toFixed(4)} (${live.status}) ===`);
  if (live.status !== 'costed') { checkText(`class ${q} costed`, false, String(live.status)); return; }
  const prov = (live.provenance ?? {}) as Record<string, { value: unknown; basis: string }>;
  const tr = live.trace as unknown as {
    operations: Array<{ operationName: string; machineId: string; labourId: string; cycleTimeHr: number; manning: number;
      oee: number; labourEfficiency: number; processCost: number; labourCost: number }>;
    drivers: { rawMaterial: { directCost: number; consumablesCostPerPart: number; consumablesItems?: Array<{ label: string; gbp: number }> };
      tooling: { totalToolingCost: number; amortizationVolume: number; items?: Array<{ label: string; gbp: number }> } };
    stackInput: { packagingPerPart: number; logisticsPerPart: number; overheadPct: number; marginPct: number };
  };
  const bd = live.breakdown as Record<string, number>;

  // ── 1. Measured geometry and the rule inputs ──
  const g = geo.gear as { teeth: number; tipDiameterMm: number; faceWidthMm: number; boreDiameterMm: number };
  const z = g.teeth, da = g.tipDiameterMm, b = g.faceWidthMm, bore = g.boreDiameterMm;
  const m = Math.round(da / (z + 2) * 100) / 100;                         // spur: mn = da / (z + 2)
  const mat = book.materials.find(x => x.id === 'mat-steel-20mncr5')!;   // case-hardening class → 20MnCr5
  const rho = mat.densityKgPerM3;
  const vol = geo.volume!.cm3;
  const netKg = Math.round(vol * rho / 1e6 * 1000) / 1000;
  const stockOd = da + 4, stockLen = b + 6;                               // GEAR_BLANK allowances (stated)
  const stockCm3 = Math.PI / 4 * stockOd ** 2 * stockLen / 1000;
  const stockKg = stockCm3 * rho / 1e6;
  const blankCm3 = Math.PI / 4 * (da ** 2 - bore ** 2) * b / 1000;
  const removal = stockCm3 - blankCm3;
  const chipKg = stockKg - vol * rho / 1e6;
  const blankCost = Math.round((stockKg * mat.pricePerKg - chipKg * (mat.scrapRecoveryPricePerKg ?? 0)) * 100) / 100;
  const mrr = CUTTING_DATA.steel.turnRoughCm3PerMin;
  const prepSec = Math.round((1.5 + removal / mrr) * 60);
  const batch = Math.max(50, Math.round(V / 12 / 10) * 10);
  const setupHr = 0.75, reject = 0.02, U = 1 / (1 - reject);
  const amort = V * YEARS;

  check('rule: teeth (measured)', z, Number(prov['gear-teeth']?.value), 'rel');
  check('rule: normal module = da / (z + 2)', m, Number(prov['gear-module']?.value), 'rel');
  check('rule: face width (measured)', b, Number(prov['gear-face']?.value), 'rel');
  check('rule: net weight kg = V × ρ', netKg, Number(prov['gear-net-wt']?.value), 'rel');
  check('rule: blank material £ (bar slice − chips)', blankCost, Number(prov['gear-blank-cost']?.value));
  check('rule: blank turning s = (1.5 + removal / MRR) × 60', prepSec, Number(prov['gear-prep-ct']?.value), 'rel');
  check('rule: batch = monthly, to 10', batch, Number(prov['gear-batch']?.value), 'rel');
  check('rule: set-up h / operation', setupHr, Number(prov['gear-setup']?.value), 'rel');
  check('rule: reject', reject, Number(prov['gear-reject']?.value), 'rel');
  check('rule: case depth (library reference)', 0.7, Number(prov['gear-ecd']?.value), 'rel');
  check('module input: amortisation volume = annual × years', amort, Number(live.params?.amortizationVolume), 'rel');
  // The printed blank basis must re-add to its value.
  const bb = prov['gear-blank-cost']?.basis ?? '';
  checkText('blank basis prints chips kg and the result', bb.includes(`${chipKg.toFixed(3)} kg`) && bb.includes(`→ £${blankCost.toFixed(2)}`), bb.slice(0, 90));
  const pb = prov['gear-prep-ct']?.basis ?? '';
  checkText('prep basis prints removal and the seconds', pb.includes(`${removal.toFixed(1)} cm³`) && pb.includes(`${prepSec} s`), pb.slice(0, 90));

  // ── 2. The route and each operation's seconds ──
  const D = DEFAULT_GEAR_SHOP_DATA;
  const band = D.cutting.find(r => r.materialClass === 'case_hardening_steel' && m >= r.moduleFromMm && m <= r.moduleToMm)!;
  const load = D.ancillary.loadUnloadSec.value;
  // Hobbing: Ø max(70, 12m), 2 starts; approach = √(h(D − h)), h = 2.25 m; travel = b + approach + 2 overrun;
  // n_hob = 1000 v / (π D); n_work = n_hob × starts / z; t = travel / (f × n_work) × 60 × cuts.
  const h = 2.25 * m;
  const Dh = Math.max(70, 12 * m);
  const approach = Math.sqrt(h * (Dh - h));
  const travel = b + approach + 2;
  const nHob = 1000 * band.hobSpeedMPerMin.value / (Math.PI * Dh);
  const nWork = nHob * 2 / z;
  const hobSec = travel / (band.hobFeedMmPerRev.value * nWork) * 60 * band.hobCuts.value + load;
  // Carburised: hobbing holds 7, carburising loses 2 → class 9 as hardened; grind when q < 9.
  const grind = q < 9;
  const F = D.finishing;
  const passKey = [3, 4, 5, 6, 7, 8].find(k => k >= q) ?? 8;
  const passes = F.grindSparkOutPassesByClass[passKey]?.value ?? 0;
  const grindVol = 2 * z * (h * b) * F.grindingStockPerFlankMm.value;
  const grindSec = grindVol / (F.gearGrindSpecificRateMm3PerMmSec.value * F.gearGrindWheelWidthMm.value)
    + passes * F.grindSparkOutSecPerPass.value + F.gearGrindDressingSecPerPart.value + load;
  const ops: ShadowOp[] = [
    { name: 'Blank turning (face, OD, bore)', machine: 'mach-lathe-cnc', labour: 'lab-uk-skilled', crew: 0.5, sec: prepSec },
    { name: 'Gear hobbing', machine: 'gear-hob-small', labour: 'lab-uk-skilled', crew: 0.5, sec: hobSec },
    { name: 'Chamfer and deburr', machine: 'gear-deburr', labour: 'lab-uk-semiskilled', crew: 1, sec: D.ancillary.deburrSecPerPart.value },
    ...(grind ? [{ name: 'Gear grinding', machine: 'gear-grind-generating', labour: 'lab-uk-skilled', crew: 0.5, sec: grindSec }] : []),
    { name: 'Gear inspection', machine: 'gear-checker', labour: 'lab-uk-inspector', crew: 1, sec: D.ancillary.inspectionSecPerPart.value },
  ];
  checkText('operation list and order', JSON.stringify(ops.map(o => o.name)) === JSON.stringify(tr.operations.map(o => o.operationName)),
    tr.operations.map(o => o.operationName).join(' → '));
  let process = 0, labour = 0;
  ops.forEach((o, k) => {
    const L = tr.operations[k];
    if (!L) return;
    const cyc = (o.sec / 3600 + setupHr / batch) * U;
    const p = cyc * machineRate(o.machine) / 0.8;
    const l = cyc * labourRate(o.labour) * o.crew / 0.92;
    process += p; labour += l;
    checkText(`${o.name}: machine / labour / crew`, L.machineId === o.machine && L.labourId === o.labour && L.manning === o.crew
      && L.oee === 0.8 && L.labourEfficiency === 0.92, `${L.machineId} · ${L.labourId} · crew ${L.manning}`);
    check(`${o.name}: cycle h = (s/3600 + 0.75/batch) ÷ 0.98`, cyc, L.cycleTimeHr, 'rel');
    check(`${o.name}: process £ = h × machine £/h ÷ OEE`, p, L.processCost);
    check(`${o.name}: labour £ = h × £/h × crew ÷ eff`, l, L.labourCost);
  });

  // ── 3. Material and the heat-treat package ──
  const steps = ['wash', 'gas_carburise', 'wash', 'temper_standalone'];   // HARDENING_ROUTE_SPEC case_hardening
  // One round trip to the heat-treater per gear: freight on the first step only.
  const htPerKg = steps.reduce((s, k) => s + htRatePerKg(k), 0) - (steps.length - 1) * htFreightPerKg();
  const ht = htPerKg * netKg;
  check('raw: blank £ ÷ (1 − reject)', blankCost * U, tr.drivers.rawMaterial.directCost);
  check('raw: heat treat = Σ £/kg × kg ÷ (1 − reject)', ht * U, tr.drivers.rawMaterial.consumablesCostPerPart);
  const items = tr.drivers.rawMaterial.consumablesItems ?? [];
  checkText('heat-treat package itemised (4 steps, sums to the consumable)', items.length === 4
    && Math.abs(items.reduce((s, i) => s + i.gbp, 0) - tr.drivers.rawMaterial.consumablesCostPerPart) < 1e-9,
    items.map(i => i.label.split(' — ')[0]).join(' + '));

  // ── 4. Tooling: perishable wear ÷ (1 − reject) × programme + NRE ──
  const T = D.tools;
  const hobPer = (T.hobCostGBP.value + T.hobRegrindsBeforeScrap.value * T.hobRegrindCostGBP.value)
    / (T.hobPartsBetweenRegrinds.value * (1 + T.hobRegrindsBeforeScrap.value));
  const wheelPer = grind ? T.grindingWheelCostGBP.value / T.grindingWheelPartsPerWheel.value : 0;
  const nre = D.nre.fixtureCostGBP.value + D.nre.programmingAndPPAPGBP.value + D.nre.inspectionMasterGBP.value;  // UK: factors 1
  const toolTotal = (hobPer + wheelPer) * U * amort + nre;
  check('tooling total £ = wear × U × programme + NRE', toolTotal, tr.drivers.tooling.totalToolingCost);
  const titems = tr.drivers.tooling.items ?? [];
  checkText('tooling itemised, items sum to the total', titems.length === (grind ? 5 : 4)
    && Math.abs(titems.reduce((s, i) => s + i.gbp, 0) - tr.drivers.tooling.totalToolingCost) < 1e-6,
    titems.map(i => i.label.split(':')[0]).join(' + '));

  // ── 5. The 8 buckets ──
  const raw = (blankCost + ht) * U;
  const tooling = toolTotal / amort;
  const pack = tr.stackInput.packagingPerPart, logi = tr.stackInput.logisticsPerPart;   // shared estimators, not gear's
  const ohBase = raw + process + labour + tooling;
  const overhead = 0.12 * ohBase;
  const subtotal = ohBase + pack + logi + overhead;
  const margin = 0.08 * subtotal;
  check('bucket: raw material', raw, bd.rawMaterial);
  check('bucket: process', process, bd.process);
  check('bucket: labour', labour, bd.labour);
  check('bucket: tooling', tooling, bd.tooling);
  check('bucket: overhead = 12 % × (factory − pack − logistics)', overhead, bd.overhead);
  check('bucket: margin = 8 % × subtotal', margin, bd.margin);
  check('TOTAL', subtotal + margin, live.total);
}

for (const q of [8, 6, 7, 9]) await runCase(q);
console.log(`\n${pass} PASS, ${fail} FAIL${fail ? `\n  ${failures.join('\n  ')}` : ''}`);
process.exit(fail ? 1 : 0);
