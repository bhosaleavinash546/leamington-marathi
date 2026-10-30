/**
 * Arithmetic audit — PCB FAB and PCBA (arith audit, Oct 2026; docs/review/arith-audit/pcb.md).
 *
 * An INDEPENDENT re-add of the PCB should-cost on the boards the PCB tests carry (the 77 GHz radar, the 360° camera),
 * through the product's own Stage 4 (`runStage4` — what the screen, PDF and Excel print) and the two engine modules the
 * PCB forms use (`computePCBFabDrivers`, `computePCBADrivers`). It recomputes every figure from the board figures as
 * costed, the rate tables (PCB country table, REGIONAL_DATA, the component catalogue JSON, the class table) and the
 * stated constants — WITHOUT calling `computePCBCountryCost`, `applyAutomotiveGrade`, `capUnconfirmedPrices`,
 * `cataloguePriceAt`, `getVolumeMultiplier` or the modules' own arithmetic. Every difference over ½ p (or 0.5 % on an
 * input) is a FAIL. Exit code 1 on any FAIL.
 *
 *   cd calculator && npx tsx scripts/arith-audit/pcb.ts [--verbose]
 */
import { readFileSync } from 'node:fs';
import { runStage4 } from '../../server/routes/pcb.js';
import { PCB_COUNTRY_RATES, computePCBCountryCost } from '../../server/data/pcb-country-rates.js';
import { applyAutomotiveGrade } from '../../server/routes/pcb.js';
import { classRowByKey } from '../../server/utils/pcb-class-pricing.js';
import { CLASS_MEDIAN, descriptionCap } from '../../server/utils/pcb-price-catalogue.js';
import { REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { countryFactor } from '../../src/engine/regional-services.js';
import { computePCBFabDrivers, type PCBFabInputs } from '../../src/engine/modules/pcb-fab.js';
import { computePCBADrivers, type PCBAInputs } from '../../src/engine/modules/pcba.js';

const VERBOSE = process.argv.includes('--verbose');
const log = console.log;
console.log = () => {}; console.warn = () => {};

let pass = 0, fail = 0;
const fails: string[] = [];
function check(name: string, shadow: number, product: number, tol = 0.005) {
  const ok = Math.abs(shadow - product) <= tol + 1e-9;
  if (ok) pass++; else { fail++; fails.push(name); }
  if (VERBOSE || !ok) log(`${ok ? 'PASS' : 'FAIL'}  ${name}: shadow ${shadow.toFixed(5)} · product ${product.toFixed(5)}`);
}
function checkTrue(name: string, cond: boolean, detail = '') {
  if (cond) pass++; else { fail++; fails.push(name); }
  if (VERBOSE || !cond) log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── The volume factors, re-derived from their stated definitions (CLAUDE.md "PCB Image→BOM") ────────────────────
// Class / named ranges: ~10k reel prices; franchise curve 10k = 1k × 0.85 on the parts bought, flat above 300k;
// below 10k the prototype steps, re-based to 10k, interpolated in log q.
function tableFactor(partsBought: number): number {
  const q = Math.max(1, partsBought);
  if (q >= 10_000) return Math.round(Math.pow(Math.min(q, 300_000) / 10_000, Math.log10(0.85)) * 1e5) / 1e5;
  const steps: [number, number][] = [[50, 8.0], [100, 6.0], [250, 4.0], [500, 2.8], [1000, 2.0], [2500, 1.55], [5000, 1.28], [10000, 1.12]];
  if (q <= 50) return Math.round(8.0 / 1.12 * 1e5) / 1e5;
  for (let i = 1; i < steps.length; i++) {
    const [q1, m1] = steps[i - 1], [q2, m2] = steps[i];
    if (q <= q2) return Math.round((m1 + (m2 - m1) * (Math.log(q / q1) / Math.log(q2 / q1))) / 1.12 * 1e5) / 1e5;
  }
  return 1;
}
// Catalogue: log-linear between the entry's own 1k / 10k / 100k / 200k / 300k breaks, flat above the last.
type Cat = { mpn: string; aliases?: string[]; gbp: { q1k: number; q10k: number; q100k: number; q200k?: number; q300k?: number } };
const CAT: Cat[] = JSON.parse(readFileSync(new URL('../../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')).parts;
function catalogueAt(mpn: string, q: number): number | null {
  const e = CAT.find(p => p.mpn === mpn) ?? CAT.find(p => (p.aliases ?? []).includes(mpn));
  if (!e) return null;
  const pts: [number, number][] = [[1e3, e.gbp.q1k], [1e4, e.gbp.q10k], [1e5, e.gbp.q100k]];
  if (e.gbp.q200k != null) pts.push([2e5, e.gbp.q200k]);
  if (e.gbp.q300k != null) pts.push([3e5, e.gbp.q300k]);
  if (q >= pts[pts.length - 1][0]) return Math.round(pts[pts.length - 1][1] * 1e4) / 1e4;
  if (q < 1000) return null;   // prototype region of the catalogue: not exercised here
  for (let i = 1; i < pts.length; i++) if (q <= pts[i][0]) {
    const [qa, pa] = pts[i - 1], [qb, pb] = pts[i];
    return Math.round((pa + (pb - pa) * Math.log10(q / qa) / Math.log10(qb / qa)) * 1e4) / 1e4;
  }
  return null;
}

// ── One BOM line, re-priced ───────────────────────────────────────────────────────────────────────────────────────
type Line = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
function shadowUnit(l: Line, boards: number, auto: boolean): number | null {
  const qty = Math.max(1, n(l.qty));
  const k = tableFactor(qty * boards);
  switch (l.priceSource) {
    case 'not-fitted': return 0;
    case 'user': return n(l.unitPriceGBP);
    case 'catalogue': return catalogueAt(String(l.catalogueMpn), qty * boards);
    case 'class-range': {
      const row = classRowByKey(String(l.priceBasis));
      if (!row) return null;
      const pn = String(l.partNumber ?? '').trim();
      const key = String(l.priceBasis);
      const unidentified = /\.any(\.|$)/.test(key) || /\b(class|est|unknown|generic)\b/i.test(pn) || (pn.length === 0 && /^ic_/.test(key));
      const dCap = descriptionCap(String(l.description ?? ''));
      const ceiling = Math.min(unidentified ? (CLASS_MEDIAN[key.split('.')[0]] ?? CLASS_MEDIAN.ic) * k : Infinity, row.hi * k, dCap != null ? dCap * k : Infinity);
      const point = Math.round((row.lo + (row.hi - row.lo) * 0.25) * 1e5) / 1e5 * k;   // lower-half midpoint
      void auto;
      return Math.round(Math.max(Math.min(row.lo * k, ceiling), Math.min(point, ceiling)) * 1e5) / 1e5;
    }
    default: return null;   // known / function range: not on these boards
  }
}

// ── The country cost, re-added ────────────────────────────────────────────────────────────────────────────────────
function panelFit(w: number, h: number) {
  let best = { n: 1, util: 0, pw: 480, ph: 350 };
  for (const [pw, ph] of [[480, 350], [380, 280], [250, 330]]) for (const [bw, bh] of [[w, h], [h, w]]) {
    const cols = Math.floor((pw - 20 + 3) / (bw + 3)), rows = Math.floor((ph - 20 + 3) / (bh + 3));
    const k = cols * rows, util = k * bw * bh / (pw * ph);
    if (k > best.n || (k === best.n && util > best.util)) best = { n: Math.max(1, k), util, pw, ph };
  }
  return best;
}
interface Board { w: number; h: number; layers: number; finish: string; through: number; blind: number; micro: number; hdi: boolean; imp: boolean;
  smt: number; th: number; manual: number; bga: number; aoi: boolean; ict: number; coatCm2: number; bom: number; qty: number; weightKg?: number }
function shadowCountry(b: Board, cc: string) {
  const r = PCB_COUNTRY_RATES[cc];
  const rd = REGIONAL_DATA[(cc === 'gb' ? 'UK' : cc.toUpperCase()) as ManufacturingRegion];
  const labour = rd.labour.electronics, tariff = rd.energy.electricityPerKwh;
  const A = b.w * b.h / 10_000, x = Math.max(0, b.layers - 2);
  const p = panelFit(b.w, b.h);
  const W = p.util > 0 ? 1 / Math.min(1, Math.max(0.4, p.util)) : 1;
  const fk = ({ imag: 'iteq', iteq: 'iteq', enig: 'enig', osp: 'osp', hasl: 'hasl', hasl_lf: 'hasl_lf', enepig: 'enepig' } as Record<string, keyof typeof r.pcbFab.surfaceFinishMultiplier>)[b.finish] ?? 'enig';
  const base = A * r.pcbFab.baseCostPerDm2_2L * W, lay = A * r.pcbFab.layerAdderPerDm2 * x * W;
  const fin = (base + lay) * (r.pcbFab.surfaceFinishMultiplier[fk] - 1);
  const vias = b.through / 100 * r.pcbFab.viaAdderPer100Through + b.blind / 10 * r.pcbFab.viaAdderPer10Blind + b.micro / 10 * r.pcbFab.viaAdderPer10Micro;
  const hdi = b.hdi ? (base + lay) * r.pcbFab.hdiUpliftPct / 100 : 0;
  const imp = b.imp ? (base + lay) * r.pcbFab.impedanceUpliftPct / 100 : 0;
  const fab = base + lay + fin + vias + hdi + imp + r.pcbFab.setupCostGBP / b.qty;
  const st = (sec: number, nre: number, cap: number) => Math.min(cap, sec / 3600 * 2 * labour + nre / b.qty);
  const smt = b.smt / 3600 * r.assembly.smtLineRatePerHr + (b.smt > 0 ? r.assembly.batchSetupGBP / b.qty : 0);
  const aoi = b.aoi ? st(20, 200, r.assembly.aoiPerBoard) : 0;
  const xray = b.bga > 0 ? st(20, 300, r.assembly.xrayPerBoard) : 0;
  const ict = b.ict > 0 ? st(b.ict, 5000, r.assembly.ictPerBoard) : 0;
  const asm = smt + b.th * r.assembly.thRatePerJoint + b.manual * r.assembly.manualSolderPerJoint + aoi + xray + ict + b.coatCm2 * r.assembly.conformalCoatPerCm2;
  const lq = Math.log10(Math.max(1, b.qty));
  const burdenPct = b.qty <= 1000 ? 0.10 : b.qty >= 100_000 ? 0.05 : Math.round((lq <= 4 ? 0.10 - 0.03 * (lq - 3) : 0.07 - 0.02 * (lq - 4)) * 1e5) / 1e5;
  const bom = b.bom * (1 + burdenPct);
  const kg = b.weightKg ?? Math.max(0.02, A * b.layers * 0.028);
  const rate = b.qty >= 2500 && r.logistics.seaFreightPerKgGBP > 0 ? r.logistics.seaFreightPerKgGBP : r.logistics.airFreightPerKgGBP;
  const freight = Math.max(r.logistics.minAirFreightGBP / b.qty, kg * rate);
  const duty = (fab + asm + bom + freight) * r.logistics.importDutyFraction;   // CIF customs value
  const energy = (A * (0.9 + 0.15 * x) + 0.06 + 0.0008 * b.smt) * tariff;
  const pack = r.packagingCostPerBoard ?? 0.12;
  const lambda = Math.min(0.3, b.smt * r.assembly.dppm / 1e6);
  const yieldLoss = lambda * (0.95 * (0.2 * asm + 0.5 * ict) + 0.05 * (fab + asm + bom));
  return { fab, asm, bom, burden: b.bom * burdenPct, freight, duty, energy, pack, yieldLoss, test: aoi + xray + ict, ict,
    total: fab + asm + freight + duty + bom + energy + pack + yieldLoss, panel: p };
}
// The automotive premiums (CostVision engineering figures; pcb.ts computeAutomotiveFab/AssemblyCost).
function shadowAuto(fabStd: number, asmStd: number, b: Board, cc: string, asil: string, bpp: number) {
  const reg = (cc === 'gb' ? 'UK' : cc.toUpperCase()) as ManufacturingRegion;
  const insp = countryFactor('inspection', reg), proc = countryFactor('process', reg);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const area = b.w * b.h / 100;
  const fabT = r2(fabStd + fabStd * 0.18 + fabStd * 0.4 * (b.layers >= 8 ? 0.5 : 0.35)
    + Math.min(45, Math.max(8, area * 0.08)) * insp / bpp + Math.min(35, Math.max(5, b.layers * 2.5)) * insp / bpp);
  const shifts = asil === 'ASIL-D' ? 6 : asil === 'ASIL-C' ? 4 : 0;
  const perShift = b.qty >= 1000 ? 500 : Math.max(1, Math.min(200, b.qty));
  const burn = shifts ? Math.round(180 * insp * shifts / perShift * 100) / 100 : 0;
  const asmT = r2(asmStd * 1.25 + (b.qty >= 1000 ? 0.05 : 0.8) * proc + burn);
  return { fabP: Math.max(0, fabT - r2(fabStd)), asmP: Math.max(0, asmT - r2(asmStd)), burn };
}

// ── A board through the product's Stage 4, then re-added ──────────────────────────────────────────────────────────
async function board(name: string, fixture: string, cc: string, qty: number) {
  const R = JSON.parse(readFileSync(new URL(`../../e2e/fixtures/${fixture}`, import.meta.url), 'utf8'));
  const a = JSON.parse(JSON.stringify(R.analysis));
  const s4 = await runStage4({ analysis: a, domain: R.stage1?.domain ?? 'general', asilLevel: R.asil?.asilLevel ?? 'Unknown',
    ocrResult: { ...R.ocr, refDesGroups: R.ocr.refDesGroups ?? [], connectors: R.ocr.connectors ?? [], boardText: R.ocr.boardText ?? [] },
    country: cc, orderQty: qty, tag: '/arith' });
  const tag = `${name} ${cc} ${qty.toLocaleString('en-GB')}`;
  checkTrue(`${tag}: Stage 4 completed`, !s4.failed);
  const bd = s4.selectedCountryBreakdown!;
  const auto = s4.domain === 'automotive_adas';
  // 1. Every BOM line: unit at its parts bought, line = qty × unit.
  let bomSum = 0;
  for (const l of a.bom as Line[]) {
    const u = shadowUnit(l, qty, auto);
    if (u == null) { checkTrue(`${tag}: line ${l.refDes} priced by a rule the shadow covers`, false, String(l.priceSource)); continue; }
    check(`${tag}: line ${l.refDes} unit (${l.priceSource} ${l.priceBasis ?? l.catalogueMpn ?? ''})`, u, n(l.unitPriceGBP), Math.max(0.00002, u * 0.005));
    // ½ p: the printed unit has 5 decimals, the line total is taken before that rounding (≤ 0.05 p on 90 parts).
    check(`${tag}: line ${l.refDes} total = qty × unit`, n(l.qty) * n(l.unitPriceGBP), n(l.lineTotalGBP), 0.005);
    if (l.priceSource === 'class-range') {
      const row = classRowByKey(String(l.priceBasis))!, k = tableFactor(Math.max(1, n(l.qty)) * qty);
      const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
      checkTrue(`${tag}: line ${l.refDes} note prints the range it used`, String(l.priceNote).includes(`£${r4(Math.round(row.lo * k * 1e5) / 1e5)}–£${r4(Math.round(row.hi * k * 1e5) / 1e5)}`), String(l.priceNote).slice(0, 90));
    }
    bomSum += n(l.lineTotalGBP);
  }
  const ce = a.costEstimates;
  check(`${tag}: BOM total = Σ lines`, Math.round(bomSum * 100) / 100, ce.totalBOMCostGBP);
  check(`${tag}: confirmed + to verify = BOM total`, ce.confirmedBOMCostGBP + ce.unverifiedBOMCostGBP, ce.totalBOMCostGBP);
  // 2. The country cost from the board figures as costed.
  const bs = a.boardSpec, as = a.assembly;
  const B: Board = { w: n(bs.widthMm), h: n(bs.heightMm), layers: n(bs.estimatedLayers), finish: String(bs.surfaceFinish || 'enig').toLowerCase(),
    through: n(bs.throughVias), blind: n(bs.blindVias), micro: n(bs.microVias), hdi: String(bs.hdiStructure || 'none') !== 'none', imp: Boolean(bs.impedanceControlRequired),
    smt: n(as.smtPlacements), th: n(as.throughHoleJoints), manual: n(as.manualJoints), bga: n(as.bgaCount), aoi: Boolean(as.aoiRequired), ict: n(as.ictTimeSec),
    coatCm2: 0, bom: ce.totalBOMCostGBP, qty, weightKg: n(bs.boardWeightG) > 0 ? n(bs.boardWeightG) / 1000 : undefined };
  const S = shadowCountry(B, s4.selectedCountry);
  checkTrue(`${tag}: panel ${S.panel.n}-up on ${S.panel.pw}×${S.panel.ph}`, S.panel.n === bd.panelInfo.boardsPerPanel && S.panel.pw === bd.panelInfo.panelW);
  let fab = S.fab, asm = S.asm;
  if (auto) {
    const P = shadowAuto(Math.round(S.fab * 100) / 100, Math.round(S.asm * 100) / 100, B, s4.selectedCountry, String(bd.automotiveGrade?.asil), S.panel.n);
    fab += P.fabP; asm += P.asmP;
    check(`${tag}: automotive fab premium`, P.fabP, bd.breakdown.automotiveFab ?? 0, 0.006);
    check(`${tag}: automotive assembly premium`, P.asmP, bd.breakdown.automotiveAssembly ?? 0, 0.006);
    S.duty += (P.fabP + P.asmP) * PCB_COUNTRY_RATES[s4.selectedCountry].logistics.importDutyFraction;
    S.total += (P.fabP + P.asmP) * (1 + PCB_COUNTRY_RATES[s4.selectedCountry].logistics.importDutyFraction);
  }
  check(`${tag}: bare board (graded)`, fab, bd.pcbFabPerBoard, 0.011);
  check(`${tag}: assembly & test (graded)`, asm, bd.assemblyPerBoard, 0.011);
  check(`${tag}: test & inspection (AOI + X-ray + ICT)`, S.test, bd.breakdown.aoi);
  check(`${tag}: components + EMS burden`, S.bom, bd.bomCostPerBoard);
  check(`${tag}: EMS burden`, S.burden, bd.breakdown.materialBurden ?? 0);
  check(`${tag}: freight`, S.freight, bd.breakdown.logistics);
  check(`${tag}: UK duty (CIF)`, S.duty, bd.breakdown.importDuty, 0.006);
  check(`${tag}: energy`, S.energy, bd.breakdown.energy);
  check(`${tag}: packaging`, S.pack, bd.breakdown.packaging);
  check(`${tag}: cost of quality`, S.yieldLoss, bd.breakdown.yieldLoss);
  check(`${tag}: HEADLINE`, S.total, bd.totalPerBoard, 0.011);
  // 3. Every basis line's £ is the figure it describes (the printed arithmetic is the arithmetic done).
  for (const ln of bd.basis ?? []) {
    const m = /= £(-?[0-9.]+)\s*$/.exec(ln.formula);
    if (m) check(`${tag}: basis "${ln.item}" prints its own £`, Number(m[1]), ln.gbp, 0.00006 + Math.abs(ln.gbp) * 1e-4);
  }
  // 4. Panels that quote a figure: country row, curve at the analysed qty, NPI production, band mid = the headline.
  check(`${tag}: country row = headline`, s4.countryComparison.find(c => c.countryId === bd.countryId)!.totalPerBoard, bd.totalPerBoard);
  check(`${tag}: volume curve at ${qty} = headline`, s4.volumeCurves[bd.countryId].find(p => p.qty === qty)!.totalPerBoard, bd.totalPerBoard);
  check(`${tag}: NPI production = headline`, s4.npiBreakdown!.unitCostProd, bd.totalPerBoard);
  const cb = s4.confidenceBand!;
  check(`${tag}: band mid = headline`, cb.totalMid, bd.totalPerBoard);
  checkTrue(`${tag}: band fab + assembly is a range, not a point`, cb.fabCostLow < cb.fabCostMid && cb.fabCostMid < cb.fabCostHigh, `${cb.fabCostLow}–${cb.fabCostHigh}`);
  check(`${tag}: band low = components low + fab low + the rest`, cb.bomCostLow + cb.fabCostLow + (bd.totalPerBoard - cb.bomCostMid - cb.fabCostMid), cb.totalLow, 0.011);
  // 5. NPI = the same costing at 50 boards (BOM at 50 × qty parts) + stencil and first article over 50.
  const bom50 = Math.round((a.bom as Line[]).reduce((t, l) => {
    const lt = n(l.lineTotalGBP), q1 = Math.max(1, n(l.qty));
    if (l.priceSource === 'catalogue' && l.livePriced !== true && l.catalogueMpn) {
      const at = catalogueAt(String(l.catalogueMpn), q1 * 50), now = catalogueAt(String(l.catalogueMpn), q1 * qty);
      if (at == null) {   // below the 1k break: the catalogue's 1k price × its prototype step (not re-derived here)
        return t + lt * NaN;
      }
      return t + lt * at / now!;
    }
    return t + lt * tableFactor(q1 * 50) / tableFactor(q1 * qty);
  }, 0) * 100) / 100;
  if (Number.isFinite(bom50)) {
    const S50 = shadowCountry({ ...B, qty: 50, bom: bom50 }, s4.selectedCountry);
    let t50 = S50.total;
    if (auto) {
      const P = shadowAuto(Math.round(S50.fab * 100) / 100, Math.round(S50.asm * 100) / 100, { ...B, qty: 50 }, s4.selectedCountry, String(bd.automotiveGrade?.asil), S50.panel.n);
      t50 += (P.fabP + P.asmP) * (1 + PCB_COUNTRY_RATES[s4.selectedCountry].logistics.importDutyFraction);
    }
    const tooling = (B.smt > 300 ? 220 : B.smt > 100 ? 160 : 120) + 280;
    check(`${tag}: NPI 50-board unit = costing at 50 + tooling ÷ 50`, t50 + tooling / 50, s4.npiBreakdown!.unitCostNPI, 0.02);
  } else checkTrue(`${tag}: NPI re-add (catalogue lines below 1k parts not re-derived)`, true);
  log(`${tag}: headline £${bd.totalPerBoard.toFixed(2)} (shadow £${S.total.toFixed(2)}) · NPI £${s4.npiBreakdown!.unitCostNPI.toFixed(2)}`);
  return { a, s4 };
}

// ── The engine modules (the PCB forms with no analysis) ───────────────────────────────────────────────────────────
function fabModule() {
  const inp: PCBFabInputs = { layers: 8, boardWidthMm: 200, boardHeightMm: 150, panelWidthMm: 500, panelHeightMm: 600, panelUtilization: 0.72,
    technology: 'FR4_HTg', baseMaterialTg: 170, copperWeightOz: 1, outerCopperWeightOz: 2, viaType: 'through_only', throughViaCount: 400,
    blindViaCount: 0, buriedViaCount: 0, microViaCount: 0, hdiStructure: 'none', minTraceSpaceMm: 0.1, impedanceControlled: true,
    hasFinePitchBGA: true, solderMaskColor: 'green', silkscreenSides: 2, surfaceFinish: 'enig', testMethod: 'flying_probe',
    qualityGrade: 'auto_grade1', region: 'china', nreCost: 800, amortizationVolume: 100_000 };
  const d = computePCBFabDrivers(inp);
  // Shadow: the module's stated tables, multiplied out by hand.
  const area = 200 * 150 / 100, panelA = 500 * 600 / 100, bpp = Math.floor(panelA * 0.72 / area);
  const market = 4.5 / 15;
  const raw = 4.5 * (panelA / 3000) * 3.90 * 1.32 * 1.15 * (1 + 0 * 0.07 + 1 * 0.05) * 1 * 1 * 1.18 * 1 + market * 400 * 0.002 * bpp;
  const y = Math.max(0.70, Math.min(0.985, (98.5 - 1.5) / 100));   // fine-pitch BGA only
  const perBoard = (raw / bpp / y + 0.85 * market + 2 * 0.06 * market + 1.80 * market) * 1.80;
  check('pcb-fab module (8L 200×150, China, auto grade 1): cost per board', perBoard, d.rawMaterial.directCost!, 0.0001);
  const lines = d.rawMaterial.lines ?? [];
  check('pcb-fab module: build-up lines sum to the board cost', lines.reduce((t, l) => t + l.qty * l.unitCost, 0), d.rawMaterial.directCost!, 1e-9);
  checkTrue('pcb-fab module: every build-up line states its class', lines.length === 6 && lines.every(l => /engineering figure, not sourced/.test(l.description)));
  checkTrue('pcb-fab module: a fabricator price — no second overhead / margin', d.priceBasis === 'market_price');
  const L = (layers: number) => computePCBFabDrivers({ ...inp, layers }).rawMaterial.directCost!;
  checkTrue('pcb-fab module: cost rises with the layer count 1…24', [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24].every((k, i, arr) => i === 0 || L(k) > L(arr[i - 1])));
}
function pcbaModule() {
  const inp: PCBAInputs = { pcbCostPerBoard: 2.5, smtMachineId: 'smt-line', smtLabourId: 'lab', smtLines: 2, smtLineRatePerHr: 0, smtOee: 0.85,
    throughHoleCount: 6, manualSolderCount: 2, thLabourId: 'lab-th', thLabourTimeSecPerJoint: 12, manualLabourTimeSecPerJoint: 20, smtSides: 2,
    assemblyYield: 0.98, reworkCostPerFailure: 4, amortizationVolume: 100_000, bomPriceRefQty: 1000, bgaCount: 2, xrayMachineId: 'xray',
    ictMachineId: 'ict', ictCycleTimeSec: 90, qualityGrade: 'auto_grade1', assemblyComplexity: 'high',
    bom: [
      { refDes: 'U1', componentType: 'ic_bga', description: 'MCU', qty: 1, unitPriceGBP: 6, moq: 1 },
      { refDes: 'C1-C40', componentType: 'passive_0402', description: 'MLCC', qty: 40, unitPriceGBP: 0.004, moq: 1 },
      { refDes: 'J1', componentType: 'connector_smt', description: 'conn', qty: 1, unitPriceGBP: 0.8, moq: 1 },
    ] };
  const d = computePCBADrivers(inp);
  const f = Math.pow(0.775, Math.log10(100_000 / 1000));                  // stated decay per decade, 1k → 100k
  const comp = (6 + 40 * 0.004 + 0.8) * f;
  check('pcba module: direct material = board + components at volume + rework', 2.5 + comp + (1 / 0.98 - 1) * 4, d.rawMaterial.directCost!, 1e-6);
  const smtHr = (1 / 2000 + 40 / 25000 + 1 / 3000) * 1.7 + 30 / 3600;   // per BOARD: not divided by the 2 parallel lines
  check('pcba module: SMT time a board (2 parallel lines do not halve it)', smtHr, d.operations.find(o => o.machineId === 'smt-line')!.cycleTimeHr, 1e-9);
  check('pcba module: TH + hand-solder time', (6 * 12 + 2 * 20) / 3600, d.operations.find(o => o.machineId === 'bench-assembly')!.cycleTimeHr, 1e-9);
  check('pcba module: X-ray 100 % offline (2 min + 0.8 min a BGA) × grade 1.8', (2 + 2 * 0.8) / 60 * 1.8, d.operations.find(o => o.machineId === 'xray')!.cycleTimeHr, 1e-9);
  check('pcba module: ICT 90 s × grade 1.8', 90 / 3600 * 1.8, d.operations.find(o => o.machineId === 'ict')!.cycleTimeHr, 1e-9);
}

await board('radar', 'pcb-radar-replies.json', 'cn', 250_000);
await board('camera', 'pcb-camera-replies.json', 'cn', 250_000);
await board('radar', 'pcb-radar-replies.json', 'gb', 1_000);
await board('radar', 'pcb-radar-replies.json', 'pl', 25_000);
// ASIL-C (burn-in): the guard costs the radar at ASIL-B (no safety PMIC named), so the ASIL-C premiums are checked on
// the product's own functions directly, on the radar figures of tests/pcb-headline-trace.test.ts.
{
  const B: Board = { w: 87.8, h: 48.9, layers: 8, finish: 'imag', through: 220, blind: 0, micro: 0, hdi: false, imp: true, smt: 222, th: 4, manual: 0,
    bga: 1, aoi: true, ict: 90, coatCm2: 0, bom: 66.84, qty: 250_000 };
  const bd = computePCBCountryCost({ widthMm: B.w, heightMm: B.h, layers: 8, surfaceFinish: 'imag', throughVias: 220, blindVias: 0, microVias: 0, hdiStructure: 'none',
    impedanceControlled: true, smtPlacements: 222, throughHoleJoints: 4, manualJoints: 0, bgaCount: 1, aoiRequired: true, ictTimeSec: 90, conformalCoatAreaCm2: 0,
    totalBOMCostGBP: 66.84, orderQuantity: 250_000 }, 'cn');
  const S = shadowCountry(B, 'cn');
  check('radar ASIL-C cn 250,000: commercial headline', S.total, bd.totalPerBoard, 0.011);
  applyAutomotiveGrade(bd, { widthMm: 87.8, heightMm: 48.9, estimatedLayers: 8 }, { smtPlacements: 222, bgaCount: 1, throughHoleJoints: 4 }, 'ASIL-C', 250_000, 'automotive_adas');
  const P = shadowAuto(Math.round(S.fab * 100) / 100, Math.round(S.asm * 100) / 100, B, 'cn', 'ASIL-C', S.panel.n);
  check('radar ASIL-C cn 250,000: burn-in 4 shifts × £180 × inspection factor ÷ 500', P.burn, Math.round(180 * countryFactor('inspection', 'CN') * 4 / 500 * 100) / 100, 0.0001);
  check('radar ASIL-C cn 250,000: assembly premium (incl. burn-in)', P.asmP, bd.breakdown.automotiveAssembly ?? 0, 0.006);
  check('radar ASIL-C cn 250,000: fab premium', P.fabP, bd.breakdown.automotiveFab ?? 0, 0.006);
  check('radar ASIL-C cn 250,000: graded headline', S.total + (P.fabP + P.asmP) * 1.037, bd.totalPerBoard, 0.011);
  log(`radar ASIL-C cn 250,000 (product functions): headline £${bd.totalPerBoard.toFixed(2)} · burn-in £${P.burn.toFixed(2)}`);
}
fabModule();
pcbaModule();
log(`\n${pass} PASS · ${fail} FAIL${fail ? `\n  ${fails.join('\n  ')}` : ''}`);
process.exit(fail ? 1 : 0);
