/**
 * Detailed (cost-driver level) supplier-quote teardown.
 *
 * The summary teardown (quote-teardown.ts) compares the 8 buckets. This module
 * goes one level deeper — to the actual cost drivers the should-cost engine
 * uses — so the report can say *why* a line is high, not just that it is:
 *
 *   Material  → net weight · utilisation (yield) · £/kg
 *   Process   → cycle time · machine rate · parts/cycle · OEE   (per operation)
 *   Labour    → labour time · labour rate · manning · efficiency (per operation)
 *   Tooling   → per-part amortised charge
 *   Commercial→ overhead % · margin %
 *
 * Every gap is decomposed to its drivers by a one-at-a-time swap (recost with
 * the supplier's value for one parameter, holding the rest at our should-cost),
 * which is intuitive and defensible. Fully deterministic arithmetic on the
 * should-cost the engine already produced.
 *
 * Cost formulas mirror the engine exactly (src/engine/core.ts):
 *   processCost = machineRate * cycleTimeHr / partsPerCycle / oee
 *   labourCost  = labourRate  * manning * labourTimeHr / partsPerCycle / labourEfficiency
 *   materialCost(weight) = gross*pricePerKg − (gross−net)*scrapRecovery,  gross = net/util
 */

// ─── Our should-cost detail (distilled from PartCostResult + input) ───────────
export interface OperationDetail {
  name: string;
  cycleTimeHr: number;      // per cycle
  machineRate: number;      // £/hr
  partsPerCycle: number;
  oee: number;              // 0–1
  labourTimeHr: number;     // per cycle
  labourRate: number;       // £/hr (fully loaded)
  manning: number;
  labourEfficiency: number; // 0–1
  processCost: number;      // £/part
  labourCost: number;       // £/part
}

export interface MaterialDetail {
  grade: string;
  directMode: boolean;      // painting/BIW/PCB use a pre-computed £ (no weight breakdown)
  netWeightKg: number;
  utilization: number;      // 0–1
  pricePerKg: number;
  scrapRecoveryPerKg: number;
  consumablesPerPart: number;
  materialCost: number;     // £/part (what the engine booked)
}

export interface PartDetail {
  commodity: string;
  material: MaterialDetail;
  operations: OperationDetail[];
  toolingPerPart: number;
  toolingTotal?: number;
  amortVolume?: number;
  overheadPct: number;      // 0–1
  marginPct: number;        // 0–1
  annualVolume?: number;
  total: number;
}

// ─── Supplier's filled detail (all fields optional — a partial quote) ─────────
export interface SupplierMaterial {
  netWeightKg?: number; utilization?: number; pricePerKg?: number;
  consumablesPerPart?: number; materialCost?: number;
}
export interface SupplierOperation {
  name: string;
  cycleTimeHr?: number; machineRate?: number; partsPerCycle?: number; oee?: number;
  labourTimeHr?: number; labourRate?: number; manning?: number; labourEfficiency?: number;
}
export interface SupplierDetail {
  material?: SupplierMaterial;
  operations?: SupplierOperation[];
  toolingPerPart?: number;
  overheadPct?: number;     // 0–1
  marginPct?: number;       // 0–1
}

// ─── Output ───────────────────────────────────────────────────────────────────
export interface Driver {
  label: string;            // e.g. "Cycle time"
  unit: string;             // "s", "£/hr", "%", "kg", "×"
  ourValue: number;
  theirValue: number;
  deltaGBP: number;         // £/part effect of this driver alone
  deltaPct: number;         // % change of the parameter (their vs our)
}
export interface DetailedBlock {
  ourGBP: number;
  theirGBP: number | null;  // null when the supplier left it blank
  gapGBP: number;
  drivers: Driver[];        // ranked by |deltaGBP|
}
export interface DetailedOperation {
  name: string;
  process: DetailedBlock;
  labour: DetailedBlock;
}
export interface DetailedTeardown {
  material: DetailedBlock;
  operations: DetailedOperation[];
  tooling: DetailedBlock;
  overhead: { ourPct: number; theirPct: number | null; ourGBP: number; theirGBP: number | null; gapGBP: number };
  margin: { ourPct: number; theirPct: number | null; ourGBP: number; theirGBP: number | null; gapGBP: number };
  ourTotal: number;
  theirTotalModelled: number;   // sum of modelled supplier lines (where provided)
  topDrivers: string[];         // ranked human sentences
  unmatchedSupplierOps: string[];
  coverage: number;             // 0–1 fraction of our lines the supplier populated
}

const HRS_TO_S = 3600;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (their: number, our: number) => (our === 0 ? 0 : Math.round(((their - our) / our) * 1000) / 10);

/** Weight-mode material cost, mirroring the engine. */
function matCost(net: number, util: number, price: number, scrap: number, consumables: number): number {
  if (!(util > 0)) return consumables;
  const gross = net / util;
  return gross * price - (gross - net) * scrap + consumables;
}
const procCost = (rate: number, cycHr: number, ppc: number, oee: number) =>
  (ppc > 0 && oee > 0 ? rate * cycHr / ppc / oee : 0);
const labCost = (rate: number, manning: number, labHr: number, ppc: number, eff: number) =>
  (ppc > 0 && eff > 0 ? rate * manning * labHr / ppc / eff : 0);

/** Normalise an operation name for matching. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

function rankDrivers(drivers: Driver[]): Driver[] {
  return drivers.filter(d => Math.abs(d.deltaGBP) > 0.001).sort((a, b) => Math.abs(b.deltaGBP) - Math.abs(a.deltaGBP));
}

export function analyzeDetailedQuote(our: PartDetail, sup: SupplierDetail): DetailedTeardown {
  // ── Material ──────────────────────────────────────────────────────────────
  const om = our.material;
  const sm = sup.material ?? {};
  let matBlock: DetailedBlock;
  const supHasWeight = !om.directMode && (sm.netWeightKg != null || sm.utilization != null || sm.pricePerKg != null);
  if (supHasWeight) {
    const tNet = sm.netWeightKg ?? om.netWeightKg;
    const tUtil = sm.utilization ?? om.utilization;
    const tPrice = sm.pricePerKg ?? om.pricePerKg;
    const tCons = sm.consumablesPerPart ?? om.consumablesPerPart;
    const theirGBP = r2(matCost(tNet, tUtil, tPrice, om.scrapRecoveryPerKg, tCons));
    const base = om.materialCost;
    const drivers: Driver[] = [
      { label: 'Material price', unit: '£/kg', ourValue: om.pricePerKg, theirValue: tPrice,
        deltaGBP: r2(matCost(om.netWeightKg, om.utilization, tPrice, om.scrapRecoveryPerKg, om.consumablesPerPart) - base), deltaPct: pct(tPrice, om.pricePerKg) },
      { label: 'Net weight', unit: 'kg', ourValue: om.netWeightKg, theirValue: tNet,
        deltaGBP: r2(matCost(tNet, om.utilization, om.pricePerKg, om.scrapRecoveryPerKg, om.consumablesPerPart) - base), deltaPct: pct(tNet, om.netWeightKg) },
      { label: 'Material utilisation', unit: '%', ourValue: r2(om.utilization * 100), theirValue: r2(tUtil * 100),
        deltaGBP: r2(matCost(om.netWeightKg, tUtil, om.pricePerKg, om.scrapRecoveryPerKg, om.consumablesPerPart) - base), deltaPct: pct(tUtil, om.utilization) },
    ];
    if (Math.abs(tCons - om.consumablesPerPart) > 0.001) {
      drivers.push({ label: 'Consumables', unit: '£', ourValue: om.consumablesPerPart, theirValue: tCons, deltaGBP: r2(tCons - om.consumablesPerPart), deltaPct: pct(tCons, om.consumablesPerPart) });
    }
    matBlock = { ourGBP: r2(base), theirGBP, gapGBP: r2(theirGBP - base), drivers: rankDrivers(drivers) };
  } else if (sm.materialCost != null) {
    matBlock = { ourGBP: r2(om.materialCost), theirGBP: r2(sm.materialCost), gapGBP: r2(sm.materialCost - om.materialCost), drivers: [] };
  } else {
    matBlock = { ourGBP: r2(om.materialCost), theirGBP: null, gapGBP: 0, drivers: [] };
  }

  // ── Operations (match by normalised name, else by index) ────────────────────
  const supOps = sup.operations ?? [];
  const usedSup = new Set<number>();
  const findSup = (name: string, idx: number): SupplierOperation | undefined => {
    let j = supOps.findIndex((s, k) => !usedSup.has(k) && norm(s.name) === norm(name));
    if (j < 0 && supOps[idx] && !usedSup.has(idx)) j = idx;   // positional fallback
    if (j < 0) return undefined;
    usedSup.add(j); return supOps[j];
  };

  const operations: DetailedOperation[] = our.operations.map((oo, idx) => {
    const so = findSup(oo.name, idx);
    // process
    let process: DetailedBlock;
    if (so && (so.cycleTimeHr != null || so.machineRate != null || so.partsPerCycle != null || so.oee != null)) {
      const tRate = so.machineRate ?? oo.machineRate;
      const tCyc = so.cycleTimeHr ?? oo.cycleTimeHr;
      const tPpc = so.partsPerCycle ?? oo.partsPerCycle;
      const tOee = so.oee ?? oo.oee;
      const theirGBP = r2(procCost(tRate, tCyc, tPpc, tOee));
      const base = oo.processCost;
      const drivers = rankDrivers([
        { label: 'Cycle time', unit: 's', ourValue: r2(oo.cycleTimeHr * HRS_TO_S), theirValue: r2(tCyc * HRS_TO_S), deltaGBP: r2(procCost(oo.machineRate, tCyc, oo.partsPerCycle, oo.oee) - base), deltaPct: pct(tCyc, oo.cycleTimeHr) },
        { label: 'Machine rate', unit: '£/hr', ourValue: r2(oo.machineRate), theirValue: r2(tRate), deltaGBP: r2(procCost(tRate, oo.cycleTimeHr, oo.partsPerCycle, oo.oee) - base), deltaPct: pct(tRate, oo.machineRate) },
        { label: 'Parts / cycle', unit: '×', ourValue: oo.partsPerCycle, theirValue: tPpc, deltaGBP: r2(procCost(oo.machineRate, oo.cycleTimeHr, tPpc, oo.oee) - base), deltaPct: pct(tPpc, oo.partsPerCycle) },
        { label: 'OEE', unit: '%', ourValue: r2(oo.oee * 100), theirValue: r2(tOee * 100), deltaGBP: r2(procCost(oo.machineRate, oo.cycleTimeHr, oo.partsPerCycle, tOee) - base), deltaPct: pct(tOee, oo.oee) },
      ]);
      process = { ourGBP: r2(base), theirGBP, gapGBP: r2(theirGBP - base), drivers };
    } else {
      process = { ourGBP: r2(oo.processCost), theirGBP: null, gapGBP: 0, drivers: [] };
    }
    // labour
    let labour: DetailedBlock;
    if (so && (so.labourTimeHr != null || so.labourRate != null || so.manning != null || so.labourEfficiency != null)) {
      const tRate = so.labourRate ?? oo.labourRate;
      const tTime = so.labourTimeHr ?? oo.labourTimeHr;
      const tMan = so.manning ?? oo.manning;
      const tEff = so.labourEfficiency ?? oo.labourEfficiency;
      const tPpc = so.partsPerCycle ?? oo.partsPerCycle;
      const theirGBP = r2(labCost(tRate, tMan, tTime, tPpc, tEff));
      const base = oo.labourCost;
      const drivers = rankDrivers([
        { label: 'Labour time', unit: 's', ourValue: r2(oo.labourTimeHr * HRS_TO_S), theirValue: r2(tTime * HRS_TO_S), deltaGBP: r2(labCost(oo.labourRate, oo.manning, tTime, oo.partsPerCycle, oo.labourEfficiency) - base), deltaPct: pct(tTime, oo.labourTimeHr) },
        { label: 'Labour rate', unit: '£/hr', ourValue: r2(oo.labourRate), theirValue: r2(tRate), deltaGBP: r2(labCost(tRate, oo.manning, oo.labourTimeHr, oo.partsPerCycle, oo.labourEfficiency) - base), deltaPct: pct(tRate, oo.labourRate) },
        { label: 'Manning', unit: '×', ourValue: oo.manning, theirValue: tMan, deltaGBP: r2(labCost(oo.labourRate, tMan, oo.labourTimeHr, oo.partsPerCycle, oo.labourEfficiency) - base), deltaPct: pct(tMan, oo.manning) },
        { label: 'Labour efficiency', unit: '%', ourValue: r2(oo.labourEfficiency * 100), theirValue: r2(tEff * 100), deltaGBP: r2(labCost(oo.labourRate, oo.manning, oo.labourTimeHr, oo.partsPerCycle, tEff) - base), deltaPct: pct(tEff, oo.labourEfficiency) },
      ]);
      labour = { ourGBP: r2(base), theirGBP, gapGBP: r2(theirGBP - base), drivers };
    } else {
      labour = { ourGBP: r2(oo.labourCost), theirGBP: null, gapGBP: 0, drivers: [] };
    }
    return { name: oo.name, process, labour };
  });

  // ── Tooling ─────────────────────────────────────────────────────────────────
  const tooling: DetailedBlock = sup.toolingPerPart != null
    ? { ourGBP: r2(our.toolingPerPart), theirGBP: r2(sup.toolingPerPart), gapGBP: r2(sup.toolingPerPart - our.toolingPerPart), drivers: [] }
    : { ourGBP: r2(our.toolingPerPart), theirGBP: null, gapGBP: 0, drivers: [] };

  // ── Commercial (overhead / margin) — applied to the factory cost base ───────
  const factoryBase = our.material.materialCost + our.operations.reduce((s, o) => s + o.processCost + o.labourCost, 0) + our.toolingPerPart;
  const overhead = (() => {
    const ourGBP = factoryBase * our.overheadPct;
    if (sup.overheadPct == null) return { ourPct: r2(our.overheadPct * 100), theirPct: null, ourGBP: r2(ourGBP), theirGBP: null, gapGBP: 0 };
    const theirGBP = factoryBase * sup.overheadPct;
    return { ourPct: r2(our.overheadPct * 100), theirPct: r2(sup.overheadPct * 100), ourGBP: r2(ourGBP), theirGBP: r2(theirGBP), gapGBP: r2(theirGBP - ourGBP) };
  })();
  const marginBase = factoryBase + (overhead.theirGBP ?? overhead.ourGBP);
  const margin = (() => {
    const ourGBP = (factoryBase + overhead.ourGBP) * our.marginPct;
    if (sup.marginPct == null) return { ourPct: r2(our.marginPct * 100), theirPct: null, ourGBP: r2(ourGBP), theirGBP: null, gapGBP: 0 };
    const theirGBP = marginBase * sup.marginPct;
    return { ourPct: r2(our.marginPct * 100), theirPct: r2(sup.marginPct * 100), ourGBP: r2(ourGBP), theirGBP: r2(theirGBP), gapGBP: r2(theirGBP - ourGBP) };
  })();

  // ── Roll-ups ────────────────────────────────────────────────────────────────
  const lines: Array<{ our: number; their: number | null }> = [
    { our: matBlock.ourGBP, their: matBlock.theirGBP },
    ...operations.flatMap(o => [{ our: o.process.ourGBP, their: o.process.theirGBP }, { our: o.labour.ourGBP, their: o.labour.theirGBP }]),
    { our: tooling.ourGBP, their: tooling.theirGBP },
    { our: overhead.ourGBP, their: overhead.theirGBP },
    { our: margin.ourGBP, their: margin.theirGBP },
  ];
  const provided = lines.filter(l => l.their != null);
  const theirTotalModelled = r2(provided.reduce((s, l) => s + (l.their as number), 0));
  const ourTotal = r2(lines.reduce((s, l) => s + l.our, 0));
  const coverage = lines.length ? provided.length / lines.length : 0;

  // Top drivers across every block, ranked by £ impact.
  const allDrivers: Array<{ where: string; d: Driver }> = [];
  matBlock.drivers.forEach(d => allDrivers.push({ where: 'Material', d }));
  operations.forEach(o => {
    o.process.drivers.forEach(d => allDrivers.push({ where: o.name, d }));
    o.labour.drivers.forEach(d => allDrivers.push({ where: o.name, d }));
  });
  const topDrivers = allDrivers
    .filter(x => x.d.deltaGBP > 0.01)
    .sort((a, b) => b.d.deltaGBP - a.d.deltaGBP)
    .slice(0, 6)
    .map(x => `${x.where} — ${x.d.label.toLowerCase()} ${x.d.theirValue}${x.d.unit === '%' || x.d.unit === '×' ? x.d.unit : ' ' + x.d.unit} vs our ${x.d.ourValue}${x.d.unit === '%' || x.d.unit === '×' ? x.d.unit : ' ' + x.d.unit} (${x.d.deltaPct > 0 ? '+' : ''}${x.d.deltaPct}%) → +£${x.d.deltaGBP.toFixed(2)}/part`);

  const unmatchedSupplierOps = supOps.filter((_, k) => !usedSup.has(k)).map(s => s.name);

  return { material: matBlock, operations, tooling, overhead, margin, ourTotal, theirTotalModelled, topDrivers, unmatchedSupplierOps, coverage };
}
