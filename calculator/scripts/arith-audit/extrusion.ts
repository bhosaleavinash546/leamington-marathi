/**
 * Arithmetic audit — POLYMER EXTRUSION and ALUMINIUM EXTRUSION (30 Oct 2026).
 *
 * An independent shadow of the two routes. For every real part it re-derives, from the MEASURED geometry
 * (tests/fixtures/real-parts-baseline.json), the RATE BOOK (recomputeMachineRates(DEFAULT_RATE_LIBRARY), UK) and the
 * baseline's stated ANSWERS (UK, 50,000 a year, 5-year programme):
 *
 *   polymer   section V/L, kg/m, wall 2·V/S, outline, process, line, screw-vs-cooling line rate, runs, start-up purge,
 *             die + calibration, gross kg, energy kWh, every operation's time and £, tooling, the 8 buckets
 *   aluminium section (kernel cut), part kg, die type, press (circle, ratio, Johnson + container friction), openings,
 *             exit speed, mill lengths, strand, billet, cycle, recovery, runs, die price and life, ageing, cold
 *             cut-to-length, fabrication from the feature table, finish, pack, gas kWh, every operation, tooling,
 *             the 8 buckets
 *
 * WITHOUT calling the modules or the rule functions under audit (extrusion*.ts, aluminium-extrusion*.ts, the rule
 * packs, to-cost-params). It imports only: the rate library, the aluminium DATA table (al-extrusion-data.ts — the
 * commodity's book, every figure there carries its basis), and two helpers another auditor owns (machining:
 * featureMinutesEach, secondaryMachiningCell). The polymer advisor's coefficients are not exported, so they are
 * RESTATED below with their file:line — a change to one of them fails this script, which is the point.
 *
 * It then runs the product's own headless chain (costMeasuredPart, as scripts/arith-audit/dump.ts does) and compares
 * every figure. A difference > ½ p (or > 0.5 % on an input) is a FAIL. Exit code 1 on any FAIL.
 *
 *   npx tsx scripts/arith-audit/extrusion.ts            # all 12 parts
 *   npx tsx scripts/arith-audit/extrusion.ts --verbose  # every check, not only the FAILs
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import type { RateLibrary } from '../../src/engine/types.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';
import {
  AL_ALLOYS, AL_PRESSES, AL_DIES, AL_LINE, AL_DOWNSTREAM, AL_DIE_NITRIDE, AL_CONFORM, AL_IMPACT, AL_MARKET,
  BILLET_PREMIUM_USD_PER_T, type AlAlloy, type AlDieType,
} from '../../src/engine/al-extrusion-data.js';
import { featureMinutesEach } from '../../src/engine/feature-machining.js';
import { CUTTING_DATA, secondaryMachiningCell } from '../../src/engine/machining-time.js';

process.env.AIR_GAPPED = '1';

export interface Check { part: string; what: string; expected: number | string; actual: number | string; pass: boolean }

const ANNUAL = 50_000;
const YEARS = 5;
const AMORT = ANNUAL * YEARS;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** A money check (½ p) or an input check (0.5 %, or an absolute floor for tiny figures). */
function near(a: number, b: number, kind: 'money' | 'input'): boolean {
  if (kind === 'money') return Math.abs(a - b) <= 0.005;
  return Math.abs(a - b) <= Math.max(0.005 * Math.abs(a), 1e-9);
}

// ─── Stack (core.ts semantics restated: rm + Σ ops + tooling ÷ amortisation, overhead on the factory base, margin on the subtotal) ──
interface ShadowOp { name: string; machineId: string; labourId: string; cycleHr: number; ppc: number; oee: number; manning: number; labourHr: number; eff: number }
interface ShadowStack {
  materialId: string; grossKg: number; netKg: number; consumables: number; gasKwh: number; elecKwh: number;
  ops: ShadowOp[]; tooling: number;
}
function stack(s: ShadowStack, book: RateLibrary, shop: { overheadPct: number; marginPct: number; packagingPerPart: number; logisticsPerPart: number }) {
  const mat = book.materials.find(m => m.id === s.materialId)!;
  const tariff = book.energy[0];
  const rm = s.grossKg * mat.pricePerKg - (s.grossKg - s.netKg) * mat.scrapRecoveryPricePerKg
    + s.consumables + s.gasKwh * tariff.gasPerKwh + s.elecKwh * tariff.electricityPerKwh;
  const opsOut = s.ops.map(o => {
    const m = book.machines.find(x => x.id === o.machineId)!;
    const l = book.labour.find(x => x.id === o.labourId)!;
    return { ...o, process: m.computedRatePerHr * o.cycleHr / o.ppc / o.oee, labour: l.fullyLoadedRatePerHr * o.manning * o.labourHr / o.ppc / o.eff };
  });
  const process = opsOut.reduce((a, o) => a + o.process, 0);
  const labour = opsOut.reduce((a, o) => a + o.labour, 0);
  const tooling = s.tooling / AMORT;
  const base = rm + process + labour + tooling;
  const overhead = shop.overheadPct * base;
  const subtotal = base + shop.packagingPerPart + shop.logisticsPerPart + overhead;
  const margin = shop.marginPct * subtotal;
  return { rawMaterial: rm, process, labour, tooling, packaging: shop.packagingPerPart, logistics: shop.logisticsPerPart, overhead, margin, total: subtotal + margin, ops: opsOut };
}

// ─── Polymer extrusion ────────────────────────────────────────────────────────
// Restated from src/engine/modules/extrusion-advisor.ts (OUTPUT_COEF :47, OUTPUT_FACTOR :49, COOL_SPEED_COEF :59,
// SPECIFIC_ENERGY_KWH_KG :110, CHILL :114, dieRates :152) and commodities/extrusion.ts (EXTRUSION_LINES :39,
// STARTUP_HR :46, MIN_RUN_HR :48, STEADY_SCRAP :50, MAX_RUNS :52, SMALL_TUBE_OD_MM :54).
const P_OUTPUT_COEF = 0.0533;
const P_FAMILY: Record<string, { family: string; output: number; meltKwh: number }> = {
  'mat-pe100-pipe': { family: 'pe', output: 1.00, meltKwh: 0.34 },
  'mat-pa12-ext-tube': { family: 'pa', output: 0.85, meltKwh: 0.48 },
  'mat-upvc-pipe': { family: 'rigid-pvc', output: 0.52, meltKwh: 0.30 },
};
const P_CHILL = 0.08;
const P_COOL: Record<string, number> = { 'water-bath': 25, 'vacuum-tank': 28 };
const P_LINES: Record<string, { machineId: string; screwMm: number; cooling: string }> = {
  'tube-medical': { machineId: 'extruder-micro-tube', screwMm: 45, cooling: 'water-bath' },
  pipe: { machineId: 'extruder-pipe-line', screwMm: 90, cooling: 'vacuum-tank' },
  profile: { machineId: 'extruder-profile-line', screwMm: 75, cooling: 'vacuum-tank' },
  'profile-complex': { machineId: 'extruder-profile-line', screwMm: 75, cooling: 'vacuum-tank' },
};
const P_DIE: Record<string, [number, number, number, number]> = {
  pipe: [4000, 22, 3000, 30], profile: [5500, 30, 2500, 20], 'profile-complex': [9000, 55, 4000, 35], 'tube-medical': [6000, 40, 3500, 25],
};

export function shadowPolymer(geo: OCCTGeometry, answers: Record<string, unknown>, book: RateLibrary) {
  const bb = geo.boundingBox!; const pa = geo.projectedArea!;
  const v = geo.volume!.mm3; const s = geo.surfaceArea!.mm2;
  const dims: Array<[number, number]> = [[bb.xMm, pa.xMm2!], [bb.yMm, pa.yMm2!], [bb.zMm, pa.zMm2!]];
  dims.sort((x, y) => y[0] - x[0]);
  const L = dims[0][0];
  const matId = String(answers['material.resin']);
  const mat = book.materials.find(m => m.id === matId)!;
  const fam = P_FAMILY[matId];
  const rho = mat.densityKgPerM3!;
  const massKg = r4(geo.volume!.cm3 * rho / 1e6);
  const section = v / L;
  const kgPerM = r4(section * 1e-6 * rho);
  const wall = r2(2 * v / s);
  const perim = (s - 2 * section) / L;
  const cross = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a).slice(1);
  const round = Math.abs(cross[0] - cross[1]) <= 0.05 * cross[0];
  const hollowRound = round && section < 0.7 * Math.PI / 4 * cross[0] * cross[1];
  const intricacy = perim * wall / (2 * section);
  const proc = hollowRound ? (cross[0] <= 16 ? 'tube-medical' : 'pipe')
    : (perim > 6 * Math.sqrt(section) || intricacy > 1.3 ? 'profile-complex' : 'profile');
  const cx = proc === 'profile-complex' ? 1.5 : proc === 'profile' ? 1.0 : 0.75;
  const line = P_LINES[proc];
  const out = P_OUTPUT_COEF * line.screwMm ** 2 * fam.output;
  const speed = P_COOL[line.cooling] / Math.max(0.2, wall) ** 1.4;
  const cool = speed * 60 * kgPerM;
  const lineRate = Math.round(Math.min(out, cool));
  const annualKg = ANNUAL * massKg;
  const runs = Math.max(1, Math.min(12, Math.floor(annualKg / lineRate / 8)));
  const runKg = Math.max(1, annualKg / runs);
  // The purge runs through the same sizing tank and haul-off as the product: at the LINE rate (fix X3).
  const startup = r4(Math.min(0.3, lineRate * 0.25 / runKg));
  const size = Math.round(cross[0]);
  const [b, pm, cb, cpm] = P_DIE[proc];
  const dieTotal = Math.round((b + size * pm) * cx + cb + size * cpm);

  const partLenM = Math.round(L) / 1000;
  const partKg = kgPerM * partLenM;
  const scrap = startup + 0.02;
  const gross = partKg / (1 - scrap);
  const kwh = (fam.meltKwh + P_CHILL) * gross;
  const shadow: ShadowStack = {
    materialId: matId, grossKg: gross, netKg: partKg, consumables: 0, gasKwh: 0, elecKwh: kwh,
    tooling: dieTotal,
    ops: [
      { name: 'Extrusion', machineId: line.machineId, labourId: 'lab-uk-semiskilled', cycleHr: gross / lineRate, ppc: 1, oee: 0.80, manning: 0.5, labourHr: gross / lineRate, eff: 0.92 },
      { name: 'Inspect', machineId: 'extrusion-finish-qa', labourId: 'lab-uk-semiskilled', cycleHr: 4 / 3600, ppc: 1, oee: 0.80, manning: 1, labourHr: 6 / 3600, eff: 0.92 },
    ],
  };
  return { inputs: { process: proc, partLengthM: partLenM, profileWeightKgPerM: kgPerM, wallThicknessMm: wall, lineRateKgPerHr: lineRate, startupScrapFraction: startup, dieCost: dieTotal, screwDiameterMm: line.screwMm, extruderId: line.machineId }, shadow };
}

// ─── Aluminium extrusion ──────────────────────────────────────────────────────
const G = 9806.65;
function dieTypeOf(voids: number, tongue: number, ccd: number, minWall: number): AlDieType {
  if (voids === 0) return tongue >= AL_LINE.semiHollowTongueRatio ? 'semi-hollow' : 'solid';
  if (voids >= 6 && minWall < 0.8) return 'multi-port';
  return ccd > 250 ? 'hollow-bridge' : 'hollow-porthole';
}

export function shadowAluminium(geo: OCCTGeometry, answers: Record<string, unknown>, book: RateLibrary) {
  const alloy = answers['material.alAlloy'] as AlAlloy;
  const a = AL_ALLOYS[alloy];
  const rho = a.densityKgPerM3;
  const ps = geo.profileSection as Record<string, number> | undefined;
  const route = (answers['al.route'] as string | undefined) ?? (ps ? (a.prefersIndirect ? 'indirect' : 'direct') : 'impact');
  const temper = (answers['al.temper'] as string | undefined) ?? a.defaultTemper;
  const finish = (answers['al.finish'] as string | undefined) ?? 'mill';
  const bends = Number(answers['al.bends'] ?? 0);
  const vol = geo.volume!.mm3;
  const partKgSpec = r4(vol * 1e-9 * rho);
  // Section, as the rules round it (alx-* fields).
  const bb = geo.boundingBox!;
  const d = [bb.xMm, bb.yMm, bb.zMm].sort((x, y) => y - x);
  const area = ps ? r2(ps.areaMm2) : 0;
  const perim = ps ? r1(ps.perimeterMm) : 0;
  const ccd = ps ? r1(ps.ccdMm) : r1(d[1]);
  const voids = ps ? ps.voids : 0;
  const minWall = ps ? r2(ps.minWallMm ?? ps.meanWallMm) : 0;
  const L = ps ? r1(ps.lengthMm) : 0;
  const tongue = ps?.tongueRatio ?? 0;
  const volumeShare = ps ? vol / (ps.areaMm2 * ps.lengthMm) : 1;
  const finishArea = r4(geo.surfaceArea!.mm2 / 1e6);
  const finishOut = ps?.outerPerimeterMm ? r4(ps.outerPerimeterMm * ps.lengthMm / 1e6) : 0;

  // Fabrication: holes across the profile from the feature table, plus volume machined away.
  let fabMin = 0; let rows = 0; let holeMm3 = 0;
  if (ps) {
    for (const r of geo.featureTable ?? []) {
      if (r.depthMm >= 0.9 * ps.lengthMm || r.kind !== 'hole') continue;
      fabMin += featureMinutesEach(r) * CUTTING_DATA.aluminium.timeFactor * (r.count ?? 1); rows += 1;
      holeMm3 += Math.PI / 4 * r.diaMm ** 2 * r.depthMm * (r.count ?? 1);
    }
    const removedCm3 = Math.max(0, ((1 - volumeShare) * ps.areaMm2 * ps.lengthMm - holeMm3) / 1000);
    if (volumeShare < 0.98 && removedCm3 > 0.5) { fabMin += removedCm3 / CUTTING_DATA.aluminium.millRoughCm3PerMin + 0.5; rows += 1; }
  }
  fabMin = r2(fabMin);
  const fixturings = fabMin > 0 ? 1 : 0;

  const extrudedKg = area * L * 1e-9 * rho;
  const reject = AL_LINE.rejectRate; const up = 1 / (1 - reject);
  const oee = AL_LINE.oee; const eff = 0.92;
  let pressId: string; let crew: number; let cycleSec: number; let perPush: number; let billetPerPart: number;
  let dieGbp: number; let dieLifeKg: number; let runs: number; let dieChangeHr = AL_LINE.dieChangeHr;
  let heatKwh = AL_DOWNSTREAM.billetHeatGasKwhPerKg; let feedAdder = 0; let partsPerMill = 0;
  const plan: Record<string, number | string> = {};

  if (route === 'impact') {
    const slug = partKgSpec * (1 + AL_IMPACT.trimAllowance);
    pressId = AL_IMPACT.id; crew = AL_IMPACT.crew; cycleSec = 60 / AL_IMPACT.strokesPerMin; perPush = 1; billetPerPart = slug;
    dieGbp = Math.round(AL_IMPACT.toolBaseGbp + AL_IMPACT.toolPerMmGbp * ccd);
    dieLifeKg = AL_IMPACT.toolLifeHits * partKgSpec;     // fix X1: the tool wears out by HITS — one part a hit
    heatKwh = 0; feedAdder = AL_IMPACT.slugPrepGbpPerKg; runs = 12; dieChangeHr = 1;
  } else if (route === 'conform') {
    pressId = AL_CONFORM.id; crew = AL_CONFORM.crew; perPush = 1;
    cycleSec = extrudedKg / AL_CONFORM.outputKgPerHr * 3600; billetPerPart = extrudedKg * 1.03;
    heatKwh = 0; feedAdder = AL_CONFORM.rodAdderUsdPerT / AL_MARKET.usdPerGbp / 1000;
    const dd = AL_DIES[voids > 0 ? 'hollow-porthole' : 'solid'];
    dieGbp = Math.round((dd.baseGbp + dd.perMmGbp * ccd) * 0.6); dieLifeKg = 30_000; runs = 12;
  } else {
    const dt = dieTypeOf(voids, tongue, ccd, minWall);
    const hollow = dt !== 'solid' && dt !== 'semi-hollow';
    const weld = hollow ? AL_LINE.weldChamberFactor : 1;
    const k = a.flowStressMPa / Math.sqrt(3);
    const pDef = (R: number) => a.flowStressMPa * (AL_LINE.johnsonA + AL_LINE.johnsonB * Math.log(Math.max(1.5, R))) * weld;
    const fric = (D: number) => route === 'direct' ? 4 * AL_LINE.containerFrictionM * k / D : 0;
    let pick: { p: typeof AL_PRESSES[number]; holes: number; R: number; pd: number; lF: number } | null = null;
    for (const p of AL_PRESSES.filter(x => x.route === route)) {
      if (ccd > (hollow ? p.maxCcdHollowMm : p.maxCcdSolidMm)) continue;
      const ac = Math.PI / 4 * p.containerMm ** 2;
      const usable = 0.8 * p.containerMm; const pitch = ccd + 15;
      const nRaw = pitch >= usable ? 1 : Math.floor(0.7 * (usable / pitch) ** 2);
      const nMax = Math.max(1, Math.min(dt === 'solid' ? 8 : dt === 'multi-port' ? 2 : 4, nRaw));
      let holes = 1; let R = ac / area;
      while (holes < nMax && (R > a.maxRatio || R > 60) && ac / ((holes + 1) * area) >= 15) { holes++; R = ac / (holes * area); }
      if (R < AL_LINE.minRatio) continue;
      const pMax = AL_LINE.forceUse * p.forceT * G / ac;
      const pd = pDef(R);
      if (pd >= pMax) continue;
      const lF = fric(p.containerMm) > 0 ? (pMax - pd) / fric(p.containerMm) : Infinity;
      if (lF < AL_LINE.minBilletDiameters * p.containerMm) continue;
      pick = { p, holes, R, pd, lF }; break;
    }
    if (!pick) throw new Error('shadow: no press fits — the module would warn; not on any real part');
    const { p, holes, R } = pick;
    // Exit speed.
    let vEx = a.baseExitSpeedMPerMin;
    if (p.route === 'indirect') vEx *= 1.5;
    if (hollow) vEx *= 0.75;
    if (dt === 'semi-hollow') vEx *= 0.85;
    if (minWall < 1.0) vEx *= 0.55; else if (minWall < 1.5) vEx *= 0.75;
    if (perim * Math.max(0.5, minWall) / (2 * area) > 1.3) vEx *= 0.8;
    vEx = Math.min(vEx, p.maxRamMmPerSec * R * 60 / 1000, 100);
    vEx = r1(vEx);
    // Mill lengths, strand, billet.
    const ac = Math.PI / 4 * p.containerMm ** 2;
    const cap = Math.min(p.maxBilletMm, pick.lF);
    const maxStrandM = Math.min(p.runoutM, (cap - a.buttMm) * ac / (holes * area) / 1000);
    const pitch = L + AL_LINE.sawKerfMm; const trim = AL_LINE.millEndTrimMm;
    const usableMm = maxStrandM * 1000 - AL_LINE.endScrapM * 1000;
    const kMax = Math.max(1, Math.floor((AL_LINE.millLengthMaxMm - 2 * trim) / pitch));
    let mills = 0; let kBest = 0;
    for (let n = 1; n <= 20; n++) {
      const kk = Math.min(kMax, Math.floor((usableMm / n - 2 * trim) / pitch));
      if (kk < 1) break;
      if (kk > 1 && kk * pitch + 2 * trim < AL_LINE.millLengthMinMm) continue;
      if (kk === 1 && pitch + 2 * trim < AL_LINE.millLengthMinMm && n > 1) continue;
      if (n * kk > mills * kBest) { mills = n; kBest = kk; }
    }
    partsPerMill = kBest;
    const millMm = kBest * pitch + 2 * trim;
    const strandM = mills * millMm / 1000 + AL_LINE.endScrapM;
    const billetMm = a.buttMm + strandM * 1000 * holes * area / ac;
    const billetKg = ac * billetMm * 1e-9 * rho;
    perPush = mills * kBest * holes;
    cycleSec = r1(p.deadCycleSec + strandM / vEx * 60);
    billetPerPart = r4(billetKg / perPush);
    pressId = p.id; crew = p.crew;
    const pressHrs = ANNUAL / perPush * (p.deadCycleSec + strandM / vEx * 60) / 3600;
    runs = Math.max(1, Math.min(AL_LINE.runsPerYear, Math.floor(pressHrs / AL_LINE.minRunHr)));
    const dd = AL_DIES[dt];
    let g = (dd.baseGbp + dd.perMmGbp * ccd) * (1 + 0.45 * (holes - 1));
    if (voids > 2) g *= 1.3;
    if (perim * Math.max(0.5, minWall) / (2 * area) > 1.3) g *= 1.3;
    dieGbp = Math.round(g); dieLifeKg = dd.lifeT * 1000;
    Object.assign(plan, { dieType: dt, holes, ratio: r1(R), exitSpeed: vEx, mills, partsPerMill: kBest, strandM: r2(strandM), billetMm: Math.round(billetMm), billetKg: r3(billetKg),
      throughputKgPerHr: billetKg / (cycleSec / 3600), recovery: extrudedKg / (billetKg / perPush) });
  }
  const partKg = Math.min(partKgSpec, route === 'impact' ? partKgSpec : extrudedKg);
  const exKg = route === 'impact' ? partKg : extrudedKg;
  const billetKg = Math.max(billetPerPart, partKg);

  // Temper.
  const heatTreat = a.heatTreatable && !['F', 'O', 'H112'].includes(temper);
  const age = heatTreat && ['T5', 'T6', 'T64', 'T66', 'T7', 'T73', 'T76', 'T8'].includes(temper);
  const sht = heatTreat && a.quench === 'offline-sht' && temper !== 'T5';

  // Operations.
  const ops: ShadowOp[] = [];
  const lab = 'lab-uk-semiskilled';
  const pushHr = cycleSec / 3600 * up;
  ops.push({ name: 'press', machineId: pressId, labourId: lab, cycleHr: pushHr, ppc: perPush, oee, manning: crew, labourHr: pushHr, eff });
  const setup = runs * dieChangeHr / ANNUAL;
  ops.push({ name: 'die change', machineId: pressId, labourId: lab, cycleHr: setup, ppc: 1, oee: 1, manning: crew, labourHr: setup, eff });
  const ageOp: ShadowOp | null = age ? { name: 'age', machineId: AL_DOWNSTREAM.ageOven.id, labourId: lab, cycleHr: (a.ageHours + AL_DOWNSTREAM.ageOven.handlingHr) * up,
    ppc: Math.max(1, Math.floor(AL_DOWNSTREAM.ageOven.loadKg / exKg)), oee: 1, manning: 1, labourHr: AL_DOWNSTREAM.ageOven.handlingHr * up, eff } : null;
  if (sht) throw new Error('shadow: no real part takes off-line SHT');
  // Cold cut-to-length (profile routes only).
  let ctlSec = 0;
  if (route === 'direct' || route === 'indirect' || route === 'hydrostatic') {
    const c = AL_DOWNSTREAM.ctlSaw;
    const perCut = c.secPerCutBase + c.secPerCutPerMmCcd * ccd;
    const bundle = Math.max(1, Math.min(c.bundleMaxPieces, Math.floor(c.bundleWidthMm / Math.max(ccd, 1))));
    ctlSec = r2((partsPerMill + 1) / partsPerMill * perCut / bundle + c.handlingSecPerPart);
  }
  const ctlOp: ShadowOp | null = ctlSec ? { name: 'ctl', machineId: AL_DOWNSTREAM.ctlSaw.id, labourId: lab, cycleHr: ctlSec / 3600 * up, ppc: 1, oee, manning: 1, labourHr: ctlSec / 3600 * up, eff } : null;
  const bendOp: ShadowOp | null = bends > 0 ? { name: 'bend', machineId: AL_DOWNSTREAM.bender.id, labourId: lab,
    cycleHr: (AL_DOWNSTREAM.bender.loadSec + bends * AL_DOWNSTREAM.bender.secPerBend) / 3600 * up, ppc: 1, oee, manning: 1,
    labourHr: (AL_DOWNSTREAM.bender.loadSec + bends * AL_DOWNSTREAM.bender.secPerBend) / 3600 * up, eff } : null;
  // Process order (fix X5): straight → age the mill lengths, then cut to length; bent → cut, bend in the
  // as-quenched temper, then age.
  if (bendOp) { if (ctlOp) ops.push(ctlOp); ops.push(bendOp); if (ageOp) ops.push(ageOp); }
  else { if (ageOp) ops.push(ageOp); if (ctlOp) ops.push(ctlOp); }
  // Fabrication.
  let fabTool = 0; let fabWear = 0;
  if (fabMin > 0) {
    const cell = secondaryMachiningCell({ fixturings, weightKg: partKg, annualVolume: ANNUAL, family: 'aluminium', featureRows: rows, cuttingMin: fabMin,
      engineerRatePerHr: book.labour.find(l => l.id === 'lab-uk-engineer')!.fullyLoadedRatePerHr });
    fabTool = cell.toolingGBP; fabWear = cell.toolWearPerPart;
    const cut = fabMin / 60;
    const handle = (cell.cell.handlingMin * cell.cell.fixturings + cell.cell.setupMinPerFixturing * cell.cell.fixturings / cell.cell.batchSize) / 60;
    ops.push({ name: 'cnc', machineId: AL_DOWNSTREAM.cnc.id, labourId: 'lab-uk-skilled', cycleHr: cut * up, ppc: 1, oee: 0.8, manning: 0.5, labourHr: cut * up, eff });
    ops.push({ name: 'cnc handling', machineId: AL_DOWNSTREAM.cnc.id, labourId: 'lab-uk-skilled', cycleHr: handle * up, ppc: 1, oee: 0.8, manning: 1, labourHr: handle * up, eff });
  }
  // Finish.
  const line = finish === 'anodise' ? AL_DOWNSTREAM.anodise : finish === 'powder' ? AL_DOWNSTREAM.powder : finish === 'ecoat' ? AL_DOWNSTREAM.ecoat : null;
  const fArea = line ? (line.outsideOnly && finishOut ? finishOut : finishArea) : 0;
  if (line) ops.push({ name: 'finish', machineId: line.id, labourId: lab, cycleHr: fArea / line.m2PerHr * up, ppc: 1, oee, manning: line.crew, labourHr: fArea / line.m2PerHr * up, eff });
  const packSec = r1(6 + 4 * L / 1000);
  ops.push({ name: 'pack', machineId: 'bench-assembly', labourId: lab, cycleHr: 0, ppc: 1, oee: 1, manning: 1, labourHr: packSec / 3600 * up, eff });

  // Material: the billet bought for good parts AND rejects; everything not in a GOOD part is scrap credit (fix X2).
  const nitride = route === 'impact' ? 0 : AL_DIE_NITRIDE.gbp / (AL_DIE_NITRIDE.everyT * 1000) * exKg;
  const finishCons = line ? line.consumablesGbpPerM2 * fArea : 0;
  const consumables = (feedAdder * billetKg + nitride + finishCons + fabWear) * up;
  const gasKwh = (heatKwh * billetKg + (age ? AL_DOWNSTREAM.ageOven.gasKwhPerKg * exKg : 0)) * up;
  // Tooling: dies consumed over the programme (fractional, at least one set) + one-off fab / bend tooling.
  const sets = dieLifeKg > 0 ? Math.max(1, AMORT * exKg / dieLifeKg) : 1;
  const bendTool = bends > 0 ? AL_DOWNSTREAM.bender.toolFirstGbp + (bends - 1) * AL_DOWNSTREAM.bender.toolPerExtraBendGbp : 0;
  const tooling = dieGbp * sets + fabTool + bendTool;
  const billetPrice = (AL_MARKET.lmeUsdPerT + BILLET_PREMIUM_USD_PER_T.UK.usdPerT + a.billetAdderUsdPerT) / AL_MARKET.usdPerGbp / 1000;
  const scrapPrice = (AL_MARKET.lmeUsdPerT + a.scrapDiffUsdPerT) / AL_MARKET.usdPerGbp / 1000;
  const shadow: ShadowStack = {
    materialId: `mat-al-billet-${alloy.toLowerCase()}`, grossKg: billetKg * up, netKg: partKg, consumables, gasKwh, elecKwh: 0, ops, tooling,
  };
  return {
    inputs: { pressId, crew, cycleSecPerPush: cycleSec, partsPerPush: perPush, billetKgPerPart: billetPerPart, runsPerYear: runs, ctlSecPerPart: ctlSec,
      packSecPerPart: packSec, dieCostGbp: dieGbp, dieLifeKg, extrudedKgPerPart: exKg, partWeightKg: partKg, cncMinutes: fabMin },
    shadow, plan, billetPrice: r4(billetPrice), scrapPrice: r4(scrapPrice), dieSets: sets, dieGbp,
  };
}

// ─── Compare with the product's own chain ────────────────────────────────────
export async function runExtrusionAudit(): Promise<{ checks: Check[]; parts: Record<string, Record<string, unknown>> }> {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
  const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  const checks: Check[] = [];
  const parts: Record<string, Record<string, unknown>> = {};
  for (const p of base) {
    if (!/^(EXT_|AL_)/.test(p.part)) continue;
    const spec = ANSWERS[p.part];
    const r = await costMeasuredPart(p.geometry, p.part,
      { partNumber: p.part, file: p.part, annualVolume: ANNUAL, ...(spec.commodity ? { commodity: spec.commodity } : {}) },
      spec.answers, 'UK', { annualVolume: ANNUAL, programmeYears: YEARS }, book, { partNumber: p.part, file: p.part, status: 'error' });
    const part = p.part.replace(/\.(stp|step)$/i, '');
    const add = (what: string, expected: number | string, actual: unknown, kind: 'money' | 'input' = 'input') => {
      const a = typeof expected === 'number' ? Number(actual) : String(actual);
      const pass = typeof expected === 'number' ? near(expected, a as number, kind) : expected === a;
      checks.push({ part, what, expected, actual: a as number | string, pass });
    };
    if (r.status !== 'costed') { add('status', 'costed', r.status); continue; }
    const params = (r as unknown as { params: Record<string, unknown> }).params;
    const trace = (r as unknown as { trace: { stackInput: Record<string, number> & { operations: Array<Record<string, unknown>>; rawMaterial: Record<string, unknown>; tooling: { totalToolingCost: number } }; result: { operationDetails: Array<Record<string, number>> } } }).trace;
    const si = trace.stackInput;
    const shop = { overheadPct: si.overheadPct, marginPct: si.marginPct, packagingPerPart: si.packagingPerPart, logisticsPerPart: si.logisticsPerPart };
    const poly = p.part.startsWith('EXT_');
    const sh = poly ? shadowPolymer(p.geometry, spec.answers, book) : shadowAluminium(p.geometry, spec.answers, book);
    const prov = (r as unknown as { provenance: Record<string, { value: unknown }> }).provenance;
    for (const [k, v] of Object.entries(sh.inputs)) {
      // cncMinutes is a rule value (alx-cnc-min), not a module input; an absent saw is 0 s.
      const actual = k === 'cncMinutes' ? prov['alx-cnc-min']?.value : params[k] ?? (typeof v === 'number' ? 0 : undefined);
      add(`input ${k}`, v as number | string, actual);
    }
    const st = stack(sh.shadow, book, shop);
    // Operations, one by one, in order.
    const ops = trace.result.operationDetails;
    add('operation count', st.ops.length, ops.length);
    st.ops.forEach((o, i) => {
      const a = ops[i] ?? {};
      add(`op ${i + 1} ${o.name} machine`, o.machineId, (a as unknown as { machineId: string }).machineId);
      add(`op ${i + 1} ${o.name} cycle h`, o.cycleHr, a.cycleTimeHr);
      add(`op ${i + 1} ${o.name} parts/cycle`, o.ppc, a.partsPerCycle);
      add(`op ${i + 1} ${o.name} manning`, o.manning, a.manning);
      add(`op ${i + 1} ${o.name} labour h`, o.labourHr, a.labourTimeHr);
      add(`op ${i + 1} ${o.name} process £`, o.process, a.processCost, 'money');
      add(`op ${i + 1} ${o.name} labour £`, o.labour, a.labourCost, 'money');
    });
    const rm = si.rawMaterial as { netWeightKg: number; materialUtilization: number };
    add('material net kg (good part)', sh.shadow.netKg, rm.netWeightKg);
    add('material gross kg', sh.shadow.grossKg, rm.netWeightKg / rm.materialUtilization);
    add('tooling total £', sh.shadow.tooling, trace.stackInput.tooling.totalToolingCost, 'money');
    const bd = r.breakdown as Record<string, number>;
    for (const k of ['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'] as const) add(`bucket ${k}`, st[k], bd[k], 'money');
    add('total £', st.total, r.total, 'money');
    if (!poly) {
      const s = sh as ReturnType<typeof shadowAluminium>;
      const mat = book.materials.find(m => m.id === `mat-al-billet-${String(spec.answers['material.alAlloy']).toLowerCase()}`)!;
      add('billet £/kg = (LME + UK premium + adder) ÷ FX', s.billetPrice, mat.pricePerKg, 'money');
      add('scrap £/kg = (LME + differential) ÷ FX', s.scrapPrice, mat.scrapRecoveryPricePerKg, 'money');
      // The die line must say what the tooling total is made of (fix X4).
      const items = (trace.stackInput.tooling as unknown as { items?: Array<{ label: string; gbp: number }> }).items ?? [];
      const dieItem = items.find(i => /die|tool set/i.test(i.label));
      add('tooling item: dies consumed £', s.dieGbp * s.dieSets, dieItem?.gbp ?? NaN, 'money');
      parts[part] = { plan: s.plan, dieSets: s.dieSets, dieGbp: s.dieGbp, total: r.total, breakdown: bd };
    } else parts[part] = { total: r.total, breakdown: bd };
  }
  return { checks, parts };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const verbose = process.argv.includes('--verbose');
  const { checks, parts } = await runExtrusionAudit();
  let lastPart = '';
  for (const c of checks) {
    if (!verbose && c.pass) continue;
    if (c.part !== lastPart) { console.log(`\n${c.part}`); lastPart = c.part; }
    const fmtv = (v: number | string) => typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(2) : v.toPrecision(6)) : v;
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.what.padEnd(46)} shadow ${fmtv(c.expected)}  product ${fmtv(c.actual)}`);
  }
  for (const [p, v] of Object.entries(parts)) {
    const pl = v.plan as Record<string, number> | undefined;
    if (pl?.throughputKgPerHr) console.log(`${p.padEnd(22)} press ${(pl.throughputKgPerHr / 1000).toFixed(2)} t/h billet at 100 % (×${AL_LINE.oee} OEE = ${(pl.throughputKgPerHr * AL_LINE.oee / 1000).toFixed(2)} t/h), recovery ${(Number(pl.recovery) * 100).toFixed(1)} %, dies ${Number(v.dieSets).toFixed(2)} × £${v.dieGbp}`);
  }
  const fails = checks.filter(c => !c.pass).length;
  console.log(`\n${checks.length} checks, ${checks.length - fails} PASS, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
}
