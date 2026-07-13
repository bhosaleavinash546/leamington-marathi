/**
 * Negotiation Intelligence — pure data & model layer.
 *
 * Extracted from main.ts as the first step in decomposing the UI monolith.
 * No DOM and no app state — just the deterministic recipes and helpers behind
 * the per-commodity demos and the detailed teardown, so they can be unit-tested
 * and reused independently of the 18k-line main module.
 */
import { analyzeDetailedQuote, type PartDetail, type SupplierDetail, type DetailedTeardown } from '../engine/quote-teardown-detailed.js';
import type { Breakdown8Bucket } from '../engine/types.js';

export const TYPICAL_SHARES: Record<string, Partial<Record<keyof Breakdown8Bucket, number>>> = {
  _default:  { rawMaterial: 0.35, process: 0.28, labour: 0.12, tooling: 0.05, packaging: 0.01, logistics: 0.02, overhead: 0.10, margin: 0.07 },
  machining: { rawMaterial: 0.22, process: 0.40, labour: 0.16, tooling: 0.03, packaging: 0.01, logistics: 0.02, overhead: 0.10, margin: 0.06 },
  casting:   { rawMaterial: 0.38, process: 0.24, labour: 0.10, tooling: 0.08, packaging: 0.01, logistics: 0.02, overhead: 0.10, margin: 0.07 },
  cast_and_machine:   { rawMaterial: 0.30, process: 0.34, labour: 0.12, tooling: 0.06, packaging: 0.01, logistics: 0.02, overhead: 0.09, margin: 0.06 },
  injection_moulding: { rawMaterial: 0.42, process: 0.22, labour: 0.06, tooling: 0.09, packaging: 0.02, logistics: 0.02, overhead: 0.10, margin: 0.07 },
  blow_moulding:      { rawMaterial: 0.40, process: 0.24, labour: 0.07, tooling: 0.08, packaging: 0.02, logistics: 0.02, overhead: 0.10, margin: 0.07 },
  extrusion:          { rawMaterial: 0.48, process: 0.22, labour: 0.06, tooling: 0.04, packaging: 0.02, logistics: 0.03, overhead: 0.09, margin: 0.06 },
  thermoforming:      { rawMaterial: 0.44, process: 0.22, labour: 0.08, tooling: 0.06, packaging: 0.02, logistics: 0.02, overhead: 0.09, margin: 0.07 },
  rotational_moulding:{ rawMaterial: 0.40, process: 0.24, labour: 0.09, tooling: 0.06, packaging: 0.02, logistics: 0.02, overhead: 0.10, margin: 0.07 },
  forging:   { rawMaterial: 0.40, process: 0.24, labour: 0.10, tooling: 0.06, packaging: 0.01, logistics: 0.02, overhead: 0.10, margin: 0.07 },
  sheet_metal: { rawMaterial: 0.32, process: 0.30, labour: 0.12, tooling: 0.06, packaging: 0.01, logistics: 0.02, overhead: 0.10, margin: 0.07 },
  sheet_metal_fab:    { rawMaterial: 0.30, process: 0.28, labour: 0.16, tooling: 0.05, packaging: 0.01, logistics: 0.02, overhead: 0.10, margin: 0.08 },
  rubber:    { rawMaterial: 0.34, process: 0.26, labour: 0.12, tooling: 0.07, packaging: 0.01, logistics: 0.02, overhead: 0.11, margin: 0.07 },
  composites:{ rawMaterial: 0.46, process: 0.20, labour: 0.14, tooling: 0.05, packaging: 0.01, logistics: 0.02, overhead: 0.06, margin: 0.06 },
  pcb_fab:   { rawMaterial: 0.40, process: 0.28, labour: 0.08, tooling: 0.04, packaging: 0.02, logistics: 0.03, overhead: 0.09, margin: 0.06 },
  pcba:      { rawMaterial: 0.55, process: 0.16, labour: 0.10, tooling: 0.03, packaging: 0.02, logistics: 0.03, overhead: 0.06, margin: 0.05 },
  wiring_harness:     { rawMaterial: 0.45, process: 0.14, labour: 0.22, tooling: 0.03, packaging: 0.01, logistics: 0.03, overhead: 0.06, margin: 0.06 },
  assembly:  { rawMaterial: 0.30, process: 0.10, labour: 0.34, tooling: 0.03, packaging: 0.02, logistics: 0.03, overhead: 0.10, margin: 0.08 },
};

export function shouldBreakdownFor(total: number, commodity: string): Breakdown8Bucket {
  const sh = TYPICAL_SHARES[commodity] ?? TYPICAL_SHARES._default;
  const g = (k: keyof Breakdown8Bucket) => Math.round((total * (sh[k] ?? 0)) * 100) / 100;
  return { rawMaterial: g('rawMaterial'), process: g('process'), labour: g('labour'), tooling: g('tooling'),
           packaging: g('packaging'), logistics: g('logistics'), overhead: g('overhead'), margin: g('margin') };
}

export interface NegoDemo { commodity: string; part: string; vol: number; }
export const NEGO_DEMOS: NegoDemo[] = [
  { commodity:'machining',           part:'Rear suspension knuckle (Al 6061)', vol:24000 },
  { commodity:'casting',             part:'Transfer-case housing (ADC12)',      vol:12000 },
  { commodity:'cast_and_machine',    part:'Turbo bearing housing (cast iron)',  vol:60000 },
  { commodity:'sheet_metal',         part:'Seat cross-member (HSLA)',           vol:180000 },
  { commodity:'sheet_metal_fab',     part:'Battery tray weldment (Al)',         vol:30000 },
  { commodity:'injection_moulding',  part:'Bumper fascia (TPO)',                vol:90000 },
  { commodity:'blow_moulding',       part:'Coolant expansion tank (PP)',        vol:120000 },
  { commodity:'extrusion',           part:'Roof-rail trim (Al 6063)',           vol:200000 },
  { commodity:'thermoforming',       part:'Load-floor panel (ABS)',             vol:40000 },
  { commodity:'rotational_moulding', part:'Washer-fluid reservoir (PE)',        vol:50000 },
  { commodity:'forging',             part:'Front axle beam (steel)',            vol:45000 },
  { commodity:'rubber',              part:'Engine mount (EPDM)',                vol:150000 },
  { commodity:'composites',          part:'Battery enclosure lid (CFRP)',       vol:8000 },
  { commodity:'pcb_fab',             part:'ADAS radar PCB (6-layer)',           vol:75000 },
  { commodity:'pcba',                part:'BMS control board (PCBA)',           vol:40000 },
  { commodity:'wiring_harness',      part:'Main body harness (Cu)',             vol:60000 },
  { commodity:'assembly',            part:'HVAC module assembly',               vol:55000 },
];

// ── Full cost-driver recipes powering each demo ──────────────────────────────
// Each recipe is a realistic, self-consistent should-cost (material params +
// per-commodity operations) plus a supplier "tilt" that inflates the drivers a
// supplier in that commodity typically pads — so a demo shows the detailed
// teardown (which parameter, and by how much) as well as the summary.
interface DemoOp { name: string; cyc: number; mr: number; ppc?: number; oee?: number; lab: number; lr: number; man?: number; eff?: number }
export interface DemoRecipe {
  mat: { grade: string; net?: number; util?: number; price?: number; scrap?: number; cons?: number; direct?: number };
  ops: DemoOp[]; tool: number; oh: number; mg: number; pkg: number; log: number;
  tilt: { matPrice?: number; matDirect?: number; util?: number; cyc?: number; mr?: number; lr?: number; man?: number; mg?: number; oh?: number; tool?: number };
}
export const NEGO_DEMO_RECIPES: Record<string, DemoRecipe> = {
  machining: { mat:{grade:'Aluminium 6061',net:1.6,util:0.55,price:3.8,scrap:0.9}, ops:[
    {name:'Turning',cyc:90,mr:55,lab:90,lr:24},{name:'Milling (5-axis)',cyc:180,mr:78,oee:0.8,lab:180,lr:26},
    {name:'Drilling & tapping',cyc:45,mr:48,lab:45,lr:22},{name:'Deburr & inspect',cyc:30,mr:20,lab:30,lr:20}],
    tool:0.4,oh:0.12,mg:0.08,pkg:0.3,log:0.5, tilt:{matPrice:0.06,util:-0.05,cyc:0.18,lr:0.10,mg:0.03} },
  casting: { mat:{grade:'Aluminium ADC12',net:3.8,util:0.72,price:2.9,scrap:0.8}, ops:[
    {name:'Die casting (HPDC)',cyc:75,mr:95,oee:0.8,lab:75,lr:22,man:0.5},{name:'Trim & degate',cyc:25,mr:30,lab:25,lr:20},
    {name:'Shot blast',cyc:40,mr:25,lab:20,lr:20},{name:'Leak test & inspect',cyc:35,mr:22,lab:35,lr:21}],
    tool:0.9,oh:0.11,mg:0.07,pkg:0.4,log:0.6, tilt:{matPrice:0.09,cyc:0.10,mr:0.06,mg:0.04} },
  cast_and_machine: { mat:{grade:'Grey cast iron',net:1.1,util:0.8,price:1.4,scrap:0.3}, ops:[
    {name:'Sand casting',cyc:60,mr:70,oee:0.8,lab:60,lr:20,man:0.6},{name:'Rough machining',cyc:55,mr:52,lab:55,lr:23},
    {name:'Finish boring',cyc:70,mr:60,lab:70,lr:24},{name:'Balancing & inspect',cyc:30,mr:28,lab:30,lr:22}],
    tool:0.3,oh:0.10,mg:0.06,pkg:0.2,log:0.3, tilt:{cyc:0.22,mr:0.08,lr:0.08} },
  sheet_metal: { mat:{grade:'HSLA steel',net:0.9,util:0.62,price:0.95,scrap:0.35}, ops:[
    {name:'Blanking',cyc:4,mr:65,oee:0.88,lab:4,lr:19,man:0.3},{name:'Progressive stamping',cyc:6,mr:110,oee:0.85,lab:6,lr:20,man:0.3},
    {name:'Piercing',cyc:3,mr:55,lab:3,lr:19},{name:'Inspect',cyc:5,mr:15,lab:5,lr:18}],
    tool:0.15,oh:0.10,mg:0.07,pkg:0.05,log:0.10, tilt:{matPrice:0.08,util:-0.06,mg:0.03} },
  sheet_metal_fab: { mat:{grade:'Aluminium 5754',net:6.5,util:0.7,price:3.4,scrap:0.9}, ops:[
    {name:'Laser cutting',cyc:120,mr:75,oee:0.85,lab:60,lr:22},{name:'Forming / brake',cyc:90,mr:60,lab:90,lr:22},
    {name:'MIG welding',cyc:300,mr:45,lab:300,lr:26,man:1},{name:'Leak test & inspect',cyc:60,mr:25,lab:60,lr:22}],
    tool:0.2,oh:0.11,mg:0.08,pkg:0.6,log:0.9, tilt:{lr:0.12,man:0.15,cyc:0.10} },
  injection_moulding: { mat:{grade:'TPO',net:2.4,util:0.92,price:1.8,scrap:0.4}, ops:[
    {name:'Injection moulding',cyc:55,mr:65,oee:0.82,lab:20,lr:20,man:0.25},{name:'De-gate & trim',cyc:20,mr:20,lab:20,lr:19},
    {name:'Flame treat & prep',cyc:35,mr:30,lab:35,lr:20},{name:'Inspect',cyc:15,mr:15,lab:15,lr:18}],
    tool:0.5,oh:0.10,mg:0.07,pkg:0.5,log:0.8, tilt:{matPrice:0.12,cyc:0.15,mg:0.03} },
  blow_moulding: { mat:{grade:'Polypropylene',net:0.35,util:0.88,price:1.7,scrap:0.3}, ops:[
    {name:'Extrusion blow moulding',cyc:40,mr:45,ppc:2,oee:0.8,lab:15,lr:19,man:0.25},{name:'De-flash',cyc:12,mr:15,lab:12,lr:18},
    {name:'Leak test',cyc:20,mr:18,lab:20,lr:18}],
    tool:0.3,oh:0.10,mg:0.07,pkg:0.15,log:0.25, tilt:{matPrice:0.10,cyc:0.12,mr:0.06} },
  extrusion: { mat:{grade:'Aluminium 6063',net:0.6,util:0.85,price:3.6,scrap:1.0}, ops:[
    {name:'Aluminium extrusion',cyc:8,mr:40,oee:0.82,lab:6,lr:19},{name:'Cut to length',cyc:5,mr:22,lab:5,lr:18},
    {name:'Anodise (batch)',cyc:20,mr:15,lab:8,lr:18},{name:'Inspect',cyc:6,mr:12,lab:6,lr:18}],
    tool:0.1,oh:0.09,mg:0.06,pkg:0.1,log:0.2, tilt:{matPrice:0.14,util:-0.05} },
  thermoforming: { mat:{grade:'ABS sheet',net:1.8,util:0.7,price:2.6,scrap:0.5}, ops:[
    {name:'Sheet heating',cyc:45,mr:30,oee:0.8,lab:20,lr:19},{name:'Vacuum forming',cyc:50,mr:40,lab:50,lr:20},
    {name:'CNC trim',cyc:60,mr:45,lab:30,lr:21},{name:'Inspect',cyc:20,mr:15,lab:20,lr:18}],
    tool:0.2,oh:0.10,mg:0.07,pkg:0.4,log:0.6, tilt:{util:-0.08,cyc:0.15,mg:0.03} },
  rotational_moulding: { mat:{grade:'Polyethylene',net:0.9,util:0.95,price:1.6,scrap:0.2}, ops:[
    {name:'Rotational moulding',cyc:600,mr:35,ppc:4,oee:0.8,lab:60,lr:19,man:0.5},{name:'De-mould & trim',cyc:40,mr:15,lab:40,lr:18},
    {name:'Leak test',cyc:25,mr:15,lab:25,lr:18}],
    tool:0.25,oh:0.10,mg:0.07,pkg:0.2,log:0.3, tilt:{cyc:0.18,mr:0.08,matPrice:0.08} },
  forging: { mat:{grade:'Steel 1045',net:12,util:0.75,price:1.1,scrap:0.4}, ops:[
    {name:'Billet heating',cyc:30,mr:40,lab:20,lr:20},{name:'Closed-die forging',cyc:25,mr:150,oee:0.8,lab:25,lr:24,man:1},
    {name:'Trim flash',cyc:15,mr:60,lab:15,lr:21},{name:'Heat treat (batch)',cyc:40,mr:35,lab:15,lr:20},{name:'Shot blast & inspect',cyc:35,mr:25,lab:35,lr:21}],
    tool:0.4,oh:0.11,mg:0.07,pkg:0.5,log:0.8, tilt:{matPrice:0.10,cyc:0.12,mr:0.08,mg:0.03} },
  rubber: { mat:{grade:'EPDM compound',net:0.4,util:0.82,price:2.2,scrap:0.2}, ops:[
    {name:'Compression moulding (cure)',cyc:180,mr:38,ppc:4,oee:0.8,lab:30,lr:19,man:0.5},{name:'De-flash & trim',cyc:20,mr:15,lab:20,lr:18},
    {name:'Bond to bracket',cyc:40,mr:25,lab:40,lr:20},{name:'Test & inspect',cyc:25,mr:18,lab:25,lr:19}],
    tool:0.3,oh:0.11,mg:0.08,pkg:0.15,log:0.25, tilt:{cyc:0.15,matPrice:0.09,mg:0.03} },
  composites: { mat:{grade:'Carbon prepreg',net:4.5,util:0.7,price:28,scrap:2.0}, ops:[
    {name:'Ply cutting',cyc:180,mr:35,lab:120,lr:24},{name:'Hand layup',cyc:900,mr:20,lab:900,lr:26,man:1},
    {name:'Autoclave cure (batch)',cyc:600,mr:60,ppc:2,oee:0.85,lab:60,lr:22},{name:'Trim & NDT inspect',cyc:240,mr:45,lab:180,lr:25}],
    tool:1.2,oh:0.09,mg:0.08,pkg:1.0,log:1.5, tilt:{matPrice:0.10,lr:0.12,cyc:0.10} },
  pcb_fab: { mat:{grade:'FR4 laminate (direct)',direct:6.5}, ops:[
    {name:'Inner layer image & etch',cyc:30,mr:40,ppc:4,oee:0.85,lab:15,lr:20},{name:'Lamination',cyc:45,mr:50,ppc:4,lab:15,lr:20},
    {name:'Drilling',cyc:25,mr:45,ppc:4,lab:10,lr:19},{name:'Plating & outer etch',cyc:40,mr:42,ppc:4,lab:15,lr:20},
    {name:'Soldermask & finish',cyc:30,mr:35,ppc:4,lab:15,lr:19},{name:'E-test & inspect',cyc:20,mr:30,ppc:4,lab:20,lr:20}],
    tool:0.05,oh:0.09,mg:0.06,pkg:0.1,log:0.2, tilt:{matDirect:0.05,cyc:0.12,mr:0.07,mg:0.03} },
  pcba: { mat:{grade:'BOM + bare board (direct)',direct:38}, ops:[
    {name:'Solder paste & SMT place',cyc:60,mr:80,oee:0.85,lab:20,lr:22},{name:'Reflow',cyc:240,mr:30,ppc:6,lab:10,lr:20},
    {name:'AOI inspect',cyc:30,mr:40,lab:15,lr:21},{name:'Through-hole & hand solder',cyc:120,mr:20,lab:120,lr:22,man:1},
    {name:'ICT / functional test',cyc:90,mr:55,lab:30,lr:23},{name:'Conformal coat & pack',cyc:45,mr:25,lab:45,lr:20}],
    tool:0.1,oh:0.08,mg:0.06,pkg:0.3,log:0.4, tilt:{matDirect:0.05,lr:0.10,cyc:0.10,mg:0.04} },
  wiring_harness: { mat:{grade:'Copper wire + terminals',net:2.2,util:0.95,price:12,scrap:2.0,cons:18}, ops:[
    {name:'Wire cut & strip',cyc:120,mr:25,lab:120,lr:19,man:1},{name:'Crimp terminals',cyc:180,mr:20,lab:180,lr:19,man:1},
    {name:'Board assembly',cyc:600,mr:15,lab:600,lr:20,man:1},{name:'Continuity test',cyc:90,mr:35,lab:60,lr:21},{name:'Tape & final',cyc:150,mr:12,lab:150,lr:19}],
    tool:0.2,oh:0.10,mg:0.08,pkg:0.5,log:0.8, tilt:{matPrice:0.15,lr:0.10,man:0.10} },
  assembly: { mat:{grade:'Sub-component BOM (direct)',direct:52}, ops:[
    {name:'Sub-assembly build',cyc:180,mr:20,lab:180,lr:21,man:1},{name:'Actuator & sensor fit',cyc:120,mr:18,lab:120,lr:21},
    {name:'Leak & function test',cyc:90,mr:45,lab:45,lr:22},{name:'Final assembly & pack',cyc:150,mr:15,lab:150,lr:20}],
    tool:0.1,oh:0.10,mg:0.08,pkg:0.6,log:1.0, tilt:{matDirect:0.06,lr:0.10,mg:0.03} },
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
const demoMatCost = (net: number, util: number, price: number, scrap: number, cons: number) =>
  (util > 0 ? (net / util) * price - (net / util - net) * scrap : 0) + cons;

/** Build a self-consistent should-cost PartDetail + supplier quote from a demo recipe. */
export function makeDemoParts(commodity: string, r: DemoRecipe): { part: PartDetail; sup: SupplierDetail; shouldBd: Breakdown8Bucket } {
  const s2 = (x: number) => x / 3600;
  const proc = (mr: number, cyc: number, ppc: number, oee: number) => mr * s2(cyc) / (ppc || 1) / (oee || 0.85);
  const labc = (lr: number, man: number, lab: number, ppc: number, eff: number) => lr * (man || 1) * s2(lab) / (ppc || 1) / (eff || 0.9);
  const direct = r.mat.direct != null;
  const matC = direct ? r.mat.direct! : demoMatCost(r.mat.net ?? 0, r.mat.util ?? 1, r.mat.price ?? 0, r.mat.scrap ?? 0, r.mat.cons ?? 0);
  const material = { grade: r.mat.grade, directMode: direct, netWeightKg: r.mat.net ?? 0, utilization: r.mat.util ?? 1, pricePerKg: r.mat.price ?? 0, scrapRecoveryPerKg: r.mat.scrap ?? 0, consumablesPerPart: r.mat.cons ?? 0, materialCost: round2(matC) };
  const operations = r.ops.map(o => ({
    name: o.name, cycleTimeHr: s2(o.cyc), machineRate: o.mr, partsPerCycle: o.ppc ?? 1, oee: o.oee ?? 0.85,
    labourTimeHr: s2(o.lab), labourRate: o.lr, manning: o.man ?? 1, labourEfficiency: o.eff ?? 0.9,
    processCost: round2(proc(o.mr, o.cyc, o.ppc ?? 1, o.oee ?? 0.85)), labourCost: round2(labc(o.lr, o.man ?? 1, o.lab, o.ppc ?? 1, o.eff ?? 0.9)),
  }));
  const factory = matC + operations.reduce((s, o) => s + o.processCost + o.labourCost, 0) + r.tool;
  const overheadGBP = factory * r.oh;
  const marginGBP = (factory + overheadGBP) * r.mg;
  const total = round2(factory + overheadGBP + marginGBP + r.pkg + r.log);
  const part: PartDetail = { commodity, material, operations, toolingPerPart: r.tool, overheadPct: r.oh, marginPct: r.mg, annualVolume: undefined, total };
  const shouldBd: Breakdown8Bucket = {
    rawMaterial: round2(matC), process: round2(operations.reduce((s, o) => s + o.processCost, 0)), labour: round2(operations.reduce((s, o) => s + o.labourCost, 0)),
    tooling: round2(r.tool), packaging: round2(r.pkg), logistics: round2(r.log), overhead: round2(overheadGBP), margin: round2(marginGBP),
  };
  const t = r.tilt;
  const sMat: SupplierDetail['material'] = direct
    ? { materialCost: round2(r.mat.direct! * (1 + (t.matDirect ?? 0))) }
    : { netWeightKg: r.mat.net, utilization: (r.mat.util ?? 1) + (t.util ?? 0), pricePerKg: round2((r.mat.price ?? 0) * (1 + (t.matPrice ?? 0))), consumablesPerPart: r.mat.cons ?? 0 };
  const sup: SupplierDetail = {
    material: sMat,
    operations: r.ops.map(o => ({
      name: o.name, cycleTimeHr: s2(o.cyc * (1 + (t.cyc ?? 0))), machineRate: round2(o.mr * (1 + (t.mr ?? 0))), partsPerCycle: o.ppc ?? 1, oee: o.oee ?? 0.85,
      labourTimeHr: s2(o.lab), labourRate: round2(o.lr * (1 + (t.lr ?? 0))), manning: (o.man ?? 1) * (1 + (t.man ?? 0)), labourEfficiency: o.eff ?? 0.9,
    })),
    toolingPerPart: round2(r.tool * (1 + (t.tool ?? 0))), overheadPct: r.oh + (t.oh ?? 0), marginPct: r.mg + (t.mg ?? 0),
  };
  return { part, sup, shouldBd };
}

// Memoised should/quote totals per demo (for the chip tooltips).
const _demoTotalsCache: Record<string, { should: number; quote: number }> = {};
export function demoTotals(commodity: string): { should: number; quote: number } | null {
  if (_demoTotalsCache[commodity]) return _demoTotalsCache[commodity];
  const r = NEGO_DEMO_RECIPES[commodity];
  if (!r) return null;
  const { part, sup, shouldBd } = makeDemoParts(commodity, r);
  const dt = analyzeDetailedQuote(part, sup);
  const supB = detailedToSupplierBuckets(dt, shouldBd);
  const out = { should: round2(Object.values(shouldBd).reduce((a, b) => a + b, 0)), quote: round2(Object.values(supB).reduce((a, b) => a + b, 0)) };
  _demoTotalsCache[commodity] = out;
  return out;
}

export function detailedToSupplierBuckets(dt: DetailedTeardown, shouldBd: Breakdown8Bucket): Breakdown8Bucket {
  const opProc = dt.operations.reduce((s, o) => s + (o.process.theirGBP ?? o.process.ourGBP), 0);
  const opLab = dt.operations.reduce((s, o) => s + (o.labour.theirGBP ?? o.labour.ourGBP), 0);
  return {
    rawMaterial: dt.material.theirGBP ?? dt.material.ourGBP, process: round2(opProc), labour: round2(opLab),
    tooling: dt.tooling.theirGBP ?? dt.tooling.ourGBP, packaging: shouldBd.packaging, logistics: shouldBd.logistics,
    overhead: dt.overhead.theirGBP ?? dt.overhead.ourGBP, margin: dt.margin.theirGBP ?? dt.margin.ourGBP,
  };
}
