/**
 * BrainSpark — Detailed manual should-costing engine for PCBA (CBD view)
 * ------------------------------------------------------------------
 * Industry-standard cost-breakdown structure (VDA / open-book waterfall):
 *   Material → +Material OH → +Conversion (per-station machine/labour) →
 *   +NRE amortisation → +Scrap/Rework (rolled-throughput yield) →
 *   +Mfg OH → +SG&A → +Profit → ex-works → +Freight +Duty +Packaging → landed.
 *
 * ONE ENGINE, TWO VIEWS: deriveDrivers() decomposes engine v2's own constants
 * (pcb-cost.mjs PCB_INTERNALS) into physically meaningful, editable drivers —
 * cycle seconds, machine-hour rates, per-stage FPY, overhead pools — such that
 * at defaults costBomDetailed() reconciles with costBom() (asserted <0.5% in
 * tests). Every user override replaces a derived value; provenance is the
 * caller's concern (they know which keys they overrode).
 */
import { costBom, PCB_REGIONS, PCB_INTERNALS } from './pcb-cost.mjs';

const I = PCB_INTERNALS;
const LINE_MHR_BASE = 130;   // £/hr fully-burdened SMT line, China basis (research MED)
const round = (n, dp = 2) => { const f = 10 ** dp; return Math.round((n + Number.EPSILON) * f) / f; };
const num = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : dflt; };

/** SMT machine-hour-rate build-up (the standard formula; all £/year unless noted). */
export function mhrFromBuildup(p = {}) {
  const investment = num(p.investment, 0, 1e9, 1_000_000);
  const deprYears = num(p.deprYears, 1, 30, 7);
  const residualPct = num(p.residualPct, 0, 90, 10);
  const interestPct = num(p.interestPct, 0, 30, 6);
  const maintPct = num(p.maintPct, 0, 50, 5);
  const floorM2 = num(p.floorM2, 0, 10000, 45);
  const spacePerM2Yr = num(p.spacePerM2Yr, 0, 10000, 120);
  const energyKw = num(p.energyKw, 0, 1000, 25);
  const energyPrice = num(p.energyPrice, 0, 5, 0.12);          // £/kWh
  const operators = num(p.operators, 0, 20, 0.75);              // fraction of an operator on the line
  const labourRate = num(p.labourRate, 0, 500, 18);             // fully-loaded £/hr
  const productiveHoursYr = num(p.productiveHoursYr, 100, 8760, 5000);
  const annual =
    (investment * (1 - residualPct / 100)) / deprYears +
    investment * (interestPct / 100) / 2 +                      // avg book value
    investment * (maintPct / 100) +
    floorM2 * spacePerM2Yr +
    energyKw * 0.6 * energyPrice * productiveHoursYr;           // 0.6 load factor
  const mhr = annual / productiveHoursYr + operators * labourRate;
  return round(mhr, 2);
}

/**
 * Derive the full editable driver tree from engine-v2's own numbers.
 * Every value is region/volume-aware and, unmodified, reproduces costBom().
 */
export function deriveDrivers(input, opts = {}) {
  const base = costBom(input, opts);            // canonical stats/lines/params
  const region = PCB_REGIONS[base.region];
  const CI = region.convIndex;
  const V = base.volume;
  const convMult = I.convVolMult(V);
  const s = base.stats;
  const sides = base.params.sides;
  const strategy = base.params.testStrategy;

  // Raw component material (lines exclude attrition/yield in v2).
  const matRaw = base.lines.reduce((sum, l) => sum + l.unitCost * l.qty, 0);

  // Bare-board base (v2 fab minus its NRE-amortisation share, un-grossed).
  const fabRatePerCm2 = (I.LAYER_RATE[base.board.layers] || I.LAYER_RATE[2]) * I.fabVolMult(V) * region.fabMult;
  const finishMult = I.FINISH_MULT[base.board.finish] || 1;
  const panelFactor = 0.85 / base.params.panelUtil;

  // SMT line: express v2's per-placement economics as cycle-seconds × MHR.
  const smtCost = s.totalPlacements * I.SMT_PLACEMENT * convMult
    + s.bgaPlacements * I.BGA_PREMIUM
    + (sides === 'double' ? I.SECOND_SIDE_ADDER * convMult : 0);
  const mhrSmt = round(LINE_MHR_BASE * CI, 2);
  const smtCycleSec = round((smtCost * 3600) / LINE_MHR_BASE, 1);   // region-invariant time

  const thCost = s.thLeads * I.TH_LEAD * convMult;
  const thCycleSec = round((thCost * 3600) / LINE_MHR_BASE, 1);

  const testRate = round(I.TEST_RATE_HR * CI, 2);
  const stations = [
    { id: 'smt', label: 'SMT line (print · place · reflow)', cycleSec: smtCycleSec, mhr: mhrSmt, detail: `${s.totalPlacements} placements${s.bgaPlacements ? ` incl ${s.bgaPlacements} BGA/fine-pitch` : ''}${sides === 'double' ? ' · double-sided' : ''}` },
  ];
  if (s.thLeads > 0) stations.push({ id: 'th', label: 'TH / selective solder', cycleSec: thCycleSec, mhr: mhrSmt, detail: `${s.thLeads} joints` });
  stations.push({ id: 'aoi', label: 'AOI inspection', cycleSec: round((I.AOI_FLAT * 3600) / I.TEST_RATE_HR, 1), mhr: testRate, detail: '100% inline' });
  if (s.bgaPlacements > 0) stations.push({ id: 'xray', label: 'X-ray (BGA)', cycleSec: round((I.XRAY_PER_BOARD * 3600) / I.TEST_RATE_HR, 1), mhr: testRate, detail: 'BGA joints' });
  if (strategy === 'aoi_fct') stations.push({ id: 'fct_bench', label: 'Bench functional test', cycleSec: round(((I.FCT_BENCH_BASE + I.FCT_BENCH_PER_ACTIVE * s.activeDevices) * 3600) / I.TEST_RATE_HR, 1), mhr: testRate, detail: `${s.activeDevices} active devices` });
  if (strategy === 'aoi_ict' || strategy === 'aoi_ict_fct') stations.push({ id: 'ict', label: 'ICT (bed-of-nails)', cycleSec: I.ICT_SEC, mhr: testRate, detail: 'opens/shorts/values' });
  if (strategy === 'aoi_ict_fct') stations.push({ id: 'fct', label: 'Functional test (FCT)', cycleSec: round(I.FCT_SEC_BASE + I.FCT_SEC_PER_ACTIVE * s.activeDevices, 1), mhr: testRate, detail: `${s.activeDevices} active devices` });

  const nre = [
    { id: 'pcb_tooling', label: 'PCB tooling / phototools / e-test setup', amount: round(I.FAB_NRE, 0), amortVolume: V },
    { id: 'stencil', label: 'Solder-paste stencil', amount: round(0.4 * I.ASSY_NRE * CI, 0), amortVolume: V },
    { id: 'programming', label: 'Line programming + first article', amount: round(0.6 * I.ASSY_NRE * CI, 0), amortVolume: V },
    { id: 'feeders', label: `Feeder setup (${s.uniqueParts} unique parts)`, amount: round(s.uniqueParts * I.FEEDER_SETUP * CI, 0), amortVolume: V },
  ];
  if (strategy === 'aoi_ict' || strategy === 'aoi_ict_fct') nre.push({ id: 'ict_fixture', label: 'ICT fixture', amount: I.ICT_FIXTURE_NRE, amortVolume: V });
  if (strategy === 'aoi_ict_fct') nre.push({ id: 'fct_fixture', label: 'FCT fixture + test development', amount: I.FCT_FIXTURE_NRE, amortVolume: V });

  return {
    meta: { region: base.region, regionLabel: base.regionLabel, volume: V, testStrategy: strategy, sides, currency: 'GBP' },
    material: {
      attritionPct: round((I.ATTRITION - 1) * 100, 1),
      materialOhPct: round(region.matMarkupPct * 100, 1),
      consumablesPerBoard: 0,      // paste/flux/coating — not estimated by default (flagged in UI)
    },
    fab: {
      ratePerCm2: round(fabRatePerCm2, 4),
      finishMult: round(finishMult, 2),
      panelUtil: base.params.panelUtil,
    },
    stations,
    yieldD: {
      // Product = 0.997·0.996·0.996·0.996 ≈ engine v2's 0.985 first-pass yield.
      fpyPrintPct: 99.7, fpyPlacePct: 99.6, fpyReflowPct: 99.6, fpyTestPct: 99.6,
      // v2-equivalent treatment: failures scrapped at full accumulated cost.
      // Raise reworkSharePct to model rework economics instead of scrap.
      reworkSharePct: 0, reworkMin: 8, reworkRatePerHr: round(40 * CI, 2),
    },
    nre,
    overheads: { mfgOhPct: 15, sgaPct: 8, profitPct: 7 },   // sums to v2's 30% on conversion
    belowLine: { packagingPerBoard: 0, freightPct: round(I.FREIGHT_PCT * 100, 1), tariffPct: base.params.tariffPct },
  };
}

/** Clamp/whitelist a (possibly hostile) overrides object. Exported for the route. */
export function sanitizeDriverOverrides(o = {}) {
  const out = {};
  const take = (grp, key, min, max) => {
    const v = Number(o?.[grp]?.[key]);
    if (Number.isFinite(v) && v >= min && v <= max) { (out[grp] ||= {})[key] = v; }
  };
  take('material', 'attritionPct', 0, 20);
  take('material', 'materialOhPct', 0, 30);
  take('material', 'consumablesPerBoard', 0, 100);
  take('fab', 'ratePerCm2', 0, 10);
  take('fab', 'finishMult', 0.5, 3);
  take('fab', 'panelUtil', 0.5, 0.95);
  for (const k of ['fpyPrintPct', 'fpyPlacePct', 'fpyReflowPct', 'fpyTestPct']) take('yieldD', k, 80, 100);
  take('yieldD', 'reworkSharePct', 0, 100);
  take('yieldD', 'reworkMin', 0, 120);
  take('yieldD', 'reworkRatePerHr', 0, 500);
  take('overheads', 'mfgOhPct', 0, 60);
  take('overheads', 'sgaPct', 0, 30);
  take('overheads', 'profitPct', 0, 30);
  take('belowLine', 'packagingPerBoard', 0, 100);
  take('belowLine', 'freightPct', 0, 30);
  take('belowLine', 'tariffPct', 0, 200);
  if (o?.stations && typeof o.stations === 'object') {
    for (const [id, st] of Object.entries(o.stations)) {
      const cycleSec = Number(st?.cycleSec), mhr = Number(st?.mhr);
      const e = {};
      if (Number.isFinite(cycleSec) && cycleSec >= 0 && cycleSec <= 36000) e.cycleSec = cycleSec;
      if (Number.isFinite(mhr) && mhr >= 0 && mhr <= 5000) e.mhr = mhr;
      if (Object.keys(e).length) (out.stations ||= {})[String(id).slice(0, 24)] = e;
    }
  }
  if (o?.nre && typeof o.nre === 'object') {
    for (const [id, n] of Object.entries(o.nre)) {
      const amount = Number(n?.amount), amortVolume = Number(n?.amortVolume);
      const e = {};
      if (Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000) e.amount = amount;
      if (Number.isFinite(amortVolume) && amortVolume >= 1 && amortVolume <= 100_000_000) e.amortVolume = amortVolume;
      if (Object.keys(e).length) (out.nre ||= {})[String(id).slice(0, 24)] = e;
    }
  }
  return out;
}

const merge = (base, over) => ({ ...base, ...(over || {}) });

/**
 * Compute the CBD waterfall from drivers (derived ⊕ overrides).
 * Returns ordered lines, station/NRE detail, RTY, ex-works + landed totals,
 * and parity vs the Simple engine.
 */
export function costBomDetailed(input, opts = {}, overrides = {}) {
  const d = deriveDrivers(input, opts);
  const base = costBom(input, opts);
  const areaCm2 = base.board.areaCm2;
  const V = d.meta.volume;

  const mat = merge(d.material, overrides.material);
  const fab = merge(d.fab, overrides.fab);
  const yld = merge(d.yieldD, overrides.yieldD);
  const oh = merge(d.overheads, overrides.overheads);
  const bl = merge(d.belowLine, overrides.belowLine);
  const stations = d.stations.map(st => ({ ...st, ...(overrides.stations?.[st.id] || {}) }));
  const nre = d.nre.map(n => ({ ...n, ...(overrides.nre?.[n.id] || {}) }));

  // ── Tier A: direct material ──
  const matRaw = base.lines.reduce((sum, l) => sum + l.unitCost * l.qty, 0);
  const attrition = matRaw * (mat.attritionPct / 100);
  const consumables = mat.consumablesPerBoard;
  const fabBase = areaCm2 * fab.ratePerCm2 * fab.finishMult * (0.85 / fab.panelUtil);

  // ── Conversion: stations + NRE amortisation ──
  const stationCosts = stations.map(st => ({ ...st, cost: (st.cycleSec / 3600) * st.mhr }));
  const stationTotal = stationCosts.reduce((s2, st) => s2 + st.cost, 0);
  const nreItems = nre.map(n => ({ ...n, perBoard: n.amount / Math.max(1, n.amortVolume) }));
  const nrePerBoard = nreItems.reduce((s2, n) => s2 + n.perBoard, 0);
  const fabNrePerBoard = nreItems.filter(n => n.id === 'pcb_tooling').reduce((s2, n) => s2 + n.perBoard, 0);
  const convNrePerBoard = nrePerBoard - fabNrePerBoard;

  // ── Yield: rolled-throughput; failures scrapped or reworked ──
  const rty = (yld.fpyPrintPct / 100) * (yld.fpyPlacePct / 100) * (yld.fpyReflowPct / 100) * (yld.fpyTestPct / 100);
  const failRate = Math.max(0, 1 / Math.max(0.5, rty) - 1);
  const preYield = matRaw + attrition + consumables + fabBase + stationTotal + nrePerBoard;
  const scrapShare = 1 - yld.reworkSharePct / 100;
  const scrapCost = preYield * failRate * scrapShare;
  const reworkCost = failRate * (yld.reworkSharePct / 100) * ((yld.reworkMin / 60) * yld.reworkRatePerHr);
  const yieldCost = scrapCost + reworkCost;
  // Distribute the yield gross-up onto buckets the way v2 does (uniform), so
  // downstream %-lines sit on grossed bases and parity holds at defaults.
  const yf = preYield > 0 ? 1 + yieldCost / preYield : 1;

  const materialEff = (matRaw + attrition + consumables) * yf;
  const fabEff = (fabBase + fabNrePerBoard) * yf;
  const convEff = (stationTotal + convNrePerBoard) * yf;

  // ── Overheads, margin, below-the-line ──
  const matOH = (materialEff + fabEff) * (mat.materialOhPct / 100);
  const mfgOh = convEff * (oh.mfgOhPct / 100);
  const sga = convEff * (oh.sgaPct / 100);
  const profit = convEff * (oh.profitPct / 100);
  const exWorks = materialEff + fabEff + convEff + matOH + mfgOh + sga + profit;
  const freight = (materialEff + fabEff) * (bl.freightPct / 100);
  const tariff = (materialEff + fabEff + convEff) * (bl.tariffPct / 100);
  const packaging = bl.packagingPerBoard;
  const landed = exWorks + freight + tariff + packaging;

  const lines = [
    { tier: 'A', label: 'Purchased components (BOM)', value: matRaw, basis: `${base.stats.lineItems} lines · unit prices as shown in the BOM table` },
    { tier: 'A', label: `Component attrition (${mat.attritionPct}%)`, value: attrition, basis: 'reel/handling losses on purchased parts' },
    { tier: 'A', label: 'Process consumables (paste, flux, coating)', value: consumables, basis: consumables === 0 ? 'not estimated — enter your value' : 'user-entered' },
    { tier: 'A', label: 'Bare PCB (fabricated board)', value: fabBase, basis: `${areaCm2} cm² × £${round(fab.ratePerCm2, 4)}/cm² × finish ${fab.finishMult} ÷ panel util ${fab.panelUtil}` },
    ...stationCosts.map(st => ({ tier: 'C', label: st.label, value: st.cost, basis: `${st.cycleSec}s @ £${st.mhr}/hr${st.detail ? ` · ${st.detail}` : ''}` })),
    { tier: 'C', label: 'NRE & tooling amortisation', value: nrePerBoard, basis: nreItems.map(n => `${n.label} £${round(n.amount, 0)}÷${n.amortVolume.toLocaleString()}`).join('; ') },
    { tier: 'D', label: `Scrap & rework (RTY ${round(rty * 100, 2)}%)`, value: yieldCost, basis: yld.reworkSharePct > 0 ? `${round(failRate * 100, 2)}% fallout · ${yld.reworkSharePct}% reworked @ ${yld.reworkMin} min × £${yld.reworkRatePerHr}/hr` : `${round(failRate * 100, 2)}% fallout scrapped at accumulated cost` },
    { tier: 'B', label: `Material overhead (${mat.materialOhPct}%)`, value: matOH, basis: 'procurement, incoming inspection, warehousing on material+board' },
    { tier: 'E', label: `Manufacturing overhead (${oh.mfgOhPct}%)`, value: mfgOh, basis: 'indirect labour, quality, facilities — on conversion' },
    { tier: 'F', label: `SG&A (${oh.sgaPct}%)`, value: sga, basis: 'on conversion (v2 basis)' },
    { tier: 'F', label: `Profit (${oh.profitPct}%)`, value: profit, basis: 'on conversion (v2 basis)' },
    { tier: 'G', label: `Freight inbound (${bl.freightPct}%)`, value: freight, basis: 'on material + board' },
    ...(tariff > 0 ? [{ tier: 'G', label: `Duty / tariff (${bl.tariffPct}%)`, value: tariff, basis: 'on material + conversion' }] : []),
    ...(packaging > 0 ? [{ tier: 'G', label: 'Packaging', value: packaging, basis: 'user-entered per board' }] : []),
  ].map(l => ({ ...l, value: round(l.value, 3), pct: landed > 0 ? round((l.value / landed) * 100, 1) : 0 }));

  const deltaPct = base.total > 0 ? round(((landed - base.total) / base.total) * 100, 2) : 0;
  return {
    currency: 'GBP',
    meta: d.meta,
    lines,
    stations: stationCosts.map(st => ({ id: st.id, label: st.label, cycleSec: st.cycleSec, mhr: st.mhr, cost: round(st.cost, 3), detail: st.detail })),
    nre: nreItems.map(n => ({ id: n.id, label: n.label, amount: round(n.amount, 0), amortVolume: n.amortVolume, perBoard: round(n.perBoard, 4) })),
    rty: round(rty * 100, 2),
    exWorks: round(exWorks, 2),
    landed: round(landed, 2),
    parity: { simpleTotal: base.total, detailedTotal: round(landed, 2), deltaPct },
  };
}
