/**
 * Negotiation Intelligence — per-part supplier cost-breakdown Excel template.
 *
 * The template is generated from the selected part's should-cost DETAIL, so its
 * rows (material line + each real operation) match the part exactly — one
 * generator covers every commodity. Human labels are commodity-specific
 * (injection → "shot weight / cavitation / press rate", casting → "alloy price /
 * yield / impressions", …) while the machine-readable "Ref" key on every row is
 * commodity-agnostic. Per decision A, no should-cost values are pre-filled.
 *
 * The upload parser is deliberately forgiving: it reads by Ref key when present,
 * and otherwise reconstructs the field from the row's Section + Parameter label
 * (so a supplier who deletes the Ref column, renames a sheet, appends units to a
 * number, or types a percentage as a fraction still parses — with warnings).
 */
import type { PartDetail, SupplierDetail, SupplierOperation } from '../engine/quote-teardown-detailed.js';
import { buildWorkbook, downloadWorkbook } from './xlsx-util.js';

const HRS_TO_S = 3600;

interface TemplateMeta { partName: string; commodityLabel: string; currency: string; dateLabel: string; }

// ─── Commodity-specific labels ────────────────────────────────────────────────
type DriverKey =
  | 'netWeight' | 'utilization' | 'price' | 'consumables'
  | 'cycleTime' | 'machineRate' | 'partsPerCycle' | 'oee'
  | 'labourTime' | 'labourRate' | 'manning' | 'labourEff'
  | 'tooling' | 'overhead' | 'margin';

interface Lbl { label: string; unit?: string }

const DEFAULT_LABELS: Record<DriverKey, Required<Lbl>> = {
  netWeight:    { label: 'Net weight', unit: 'kg' },
  utilization:  { label: 'Material utilisation (yield)', unit: '%' },
  price:        { label: 'Material price', unit: '{cur}/kg' },
  consumables:  { label: 'Consumables', unit: '{cur}/part' },
  cycleTime:    { label: 'Cycle time', unit: 's' },
  machineRate:  { label: 'Machine rate', unit: '{cur}/hr' },
  partsPerCycle:{ label: 'Parts per cycle', unit: 'count' },
  oee:          { label: 'OEE', unit: '%' },
  labourTime:   { label: 'Labour time', unit: 's' },
  labourRate:   { label: 'Labour rate', unit: '{cur}/hr' },
  manning:      { label: 'Manning', unit: 'operators' },
  labourEff:    { label: 'Labour efficiency', unit: '%' },
  tooling:      { label: 'Tooling (amortised per part)', unit: '{cur}/part' },
  overhead:     { label: 'Overhead / SG&A', unit: '%' },
  margin:       { label: 'Margin', unit: '%' },
};

const COMMODITY_LABELS: Record<string, Partial<Record<DriverKey, Lbl>>> = {
  machining: { netWeight: { label: 'Finished weight' }, utilization: { label: 'Stock utilisation (buy-to-fly)' }, price: { label: 'Bar / billet price' }, cycleTime: { label: 'Machining cycle time' }, machineRate: { label: 'Spindle / machine rate' }, partsPerCycle: { label: 'Parts per setup' } },
  casting: { netWeight: { label: 'Cast net weight' }, utilization: { label: 'Casting yield (runners/risers)' }, price: { label: 'Alloy price' }, cycleTime: { label: 'Cast cycle time' }, machineRate: { label: 'Cell / machine rate' }, partsPerCycle: { label: 'Impressions / cavities', unit: 'cavities' } },
  cast_and_machine: { netWeight: { label: 'Cast net weight' }, utilization: { label: 'Casting yield' }, price: { label: 'Alloy price' }, partsPerCycle: { label: 'Impressions / cavities', unit: 'cavities' } },
  injection_moulding: { netWeight: { label: 'Part shot weight' }, utilization: { label: 'Material yield (runner/regrind)' }, price: { label: 'Resin price' }, partsPerCycle: { label: 'Cavitation (cavities)', unit: 'cavities' }, cycleTime: { label: 'Injection cycle time' }, machineRate: { label: 'Press rate (tonnage-based)' }, oee: { label: 'Press OEE' } },
  blow_moulding: { netWeight: { label: 'Part weight' }, price: { label: 'Resin price' }, partsPerCycle: { label: 'Cavities', unit: 'cavities' }, cycleTime: { label: 'Blow cycle time' }, machineRate: { label: 'Machine rate' } },
  extrusion: { netWeight: { label: 'Weight per cut part' }, utilization: { label: 'Yield (offcut/scrap)' }, price: { label: 'Billet / resin price' }, cycleTime: { label: 'Extrusion time per part' }, machineRate: { label: 'Line rate' } },
  thermoforming: { netWeight: { label: 'Sheet weight per part' }, utilization: { label: 'Sheet yield (trim)' }, price: { label: 'Sheet price' }, partsPerCycle: { label: 'Ups per cycle', unit: 'ups' }, cycleTime: { label: 'Form cycle time' }, machineRate: { label: 'Former rate' } },
  rotational_moulding: { netWeight: { label: 'Part weight' }, price: { label: 'Powder price' }, partsPerCycle: { label: 'Cavities', unit: 'cavities' }, cycleTime: { label: 'Roto cycle time' }, machineRate: { label: 'Machine rate' } },
  forging: { netWeight: { label: 'Forged net weight' }, utilization: { label: 'Material yield (flash)' }, price: { label: 'Billet price' }, cycleTime: { label: 'Forge cycle time' }, machineRate: { label: 'Hammer / press rate' }, partsPerCycle: { label: 'Parts per stroke', unit: 'parts' } },
  sheet_metal: { netWeight: { label: 'Blank weight' }, utilization: { label: 'Nesting utilisation' }, price: { label: 'Coil / sheet price' }, partsPerCycle: { label: 'Parts per hit', unit: 'parts' }, cycleTime: { label: 'Press cycle time' }, machineRate: { label: 'Press rate' } },
  sheet_metal_fab: { netWeight: { label: 'Blank weight' }, utilization: { label: 'Nesting utilisation' }, price: { label: 'Coil / sheet price' }, machineRate: { label: 'Cell rate' } },
  rubber: { netWeight: { label: 'Part net weight' }, utilization: { label: 'Compound yield (flash)' }, price: { label: 'Compound price' }, partsPerCycle: { label: 'Cavities', unit: 'cavities' }, cycleTime: { label: 'Cure cycle time' }, machineRate: { label: 'Press rate' } },
  composites: { netWeight: { label: 'Laminate weight' }, utilization: { label: 'Material yield (offcut)' }, price: { label: 'Prepreg / resin price' }, cycleTime: { label: 'Cure / layup cycle time' }, machineRate: { label: 'Tool / autoclave rate' }, partsPerCycle: { label: 'Parts per tool', unit: 'parts' } },
  pcb_fab: { netWeight: { label: 'Panel material per board' }, utilization: { label: 'Panel utilisation' }, price: { label: 'Laminate price' }, partsPerCycle: { label: 'Boards per panel', unit: 'boards' }, cycleTime: { label: 'Process time per board' }, machineRate: { label: 'Line rate' } },
  pcba: { netWeight: { label: 'Board + components' }, price: { label: 'BOM / material cost' }, partsPerCycle: { label: 'Boards per cycle', unit: 'boards' }, cycleTime: { label: 'Placement / assembly time' }, machineRate: { label: 'SMT / line rate' } },
  wiring_harness: { netWeight: { label: 'Copper + material weight' }, price: { label: 'Wire / terminal price' }, cycleTime: { label: 'Assembly cycle time' }, machineRate: { label: 'Bench / machine rate' }, labourTime: { label: 'Assembly labour time' } },
  assembly: { netWeight: { label: 'Component material' }, price: { label: 'BOM cost' }, cycleTime: { label: 'Station cycle time' }, machineRate: { label: 'Line rate' }, labourTime: { label: 'Assembly labour time' } },
  painting: { price: { label: 'Paint / material cost' }, cycleTime: { label: 'Line cycle time' }, machineRate: { label: 'Booth / line rate' }, partsPerCycle: { label: 'Parts per carrier', unit: 'parts' }, oee: { label: 'Line OEE' }, labourTime: { label: 'Handling labour time' } },
  biw_assembly: { netWeight: { label: 'Sub-assembly material' }, price: { label: 'Material / sub-assembly cost' }, cycleTime: { label: 'Station cycle time' }, machineRate: { label: 'Line / robot rate' }, partsPerCycle: { label: 'Parts per station', unit: 'parts' }, oee: { label: 'Line OEE' }, labourTime: { label: 'Assembly labour time' } },
};

function labelFor(commodity: string, key: DriverKey, cur: string): { label: string; unit: string } {
  const base = DEFAULT_LABELS[key];
  const over = COMMODITY_LABELS[commodity]?.[key];
  const label = over?.label ?? base.label;
  const unit = (over?.unit ?? base.unit).replace('{cur}', cur);
  return { label, unit };
}

// ─── Template generation ──────────────────────────────────────────────────────
export async function downloadNegotiationTemplate(part: PartDetail, meta: TemplateMeta): Promise<void> {
  const cur = meta.currency;
  const c = part.commodity;
  const L = (k: DriverKey) => labelFor(c, k, cur);

  const instructions: unknown[][] = [
    ['Supplier Cost Breakdown — CostVision Negotiation Intelligence'],
    [],
    ['Part', meta.partName],
    ['Commodity', meta.commodityLabel],
    ['Prepared', meta.dateLabel],
    [],
    ['How to complete this template'],
    ['1. Fill ONLY the "Supplier value" column on the "Detailed" and "Summary" sheets.'],
    ['2. Enter one value per row, in the unit shown in the "Unit" column.'],
    ['   • Times are in SECONDS per part.  • Utilisation / OEE / efficiency / overhead / margin are in PERCENT (e.g. 70).'],
    ['3. You may leave the "Ref" column as-is — it helps us read your figures back, but the tool can also match by row label.'],
    ['4. Leave a cell blank if not applicable; blank lines are simply skipped in the comparison.'],
    ['5. Save as .xlsx and upload it in Negotiation Intelligence, then click "Analyze Quote".'],
    [],
    ['All figures are per-part in ' + cur + ' unless the unit says otherwise.'],
  ];

  const header = ['Section', 'Parameter', 'Unit', 'Supplier value', 'Ref (do not edit)'];
  const rows: unknown[][] = [header];
  const m = part.material;
  rows.push(['MATERIAL', '', '', '', '']);
  if (m.directMode) {
    rows.push(['Material', 'Material cost (direct)', cur + '/part', '', 'mat.directCost']);
  } else {
    const nw = L('netWeight'), ut = L('utilization'), pr = L('price'), co = L('consumables');
    rows.push(['Material', nw.label, nw.unit, '', 'mat.netWeightKg']);
    rows.push(['Material', ut.label, ut.unit, '', 'mat.utilizationPct']);
    rows.push(['Material', pr.label, pr.unit, '', 'mat.pricePerKg']);
    rows.push(['Material', co.label, co.unit, '', 'mat.consumables']);
  }
  part.operations.forEach((op, i) => {
    rows.push([`OPERATION ${i + 1}: ${op.name}`, '', '', '', `op.${i}.name=${op.name}`]);
    const ct = L('cycleTime'), mr = L('machineRate'), pc = L('partsPerCycle'), oe = L('oee');
    const lt = L('labourTime'), lr = L('labourRate'), mn = L('manning'), le = L('labourEff');
    rows.push(['Process', ct.label, ct.unit, '', `op.${i}.cycleTimeSec`]);
    rows.push(['Process', mr.label, mr.unit, '', `op.${i}.machineRate`]);
    rows.push(['Process', pc.label, pc.unit, '', `op.${i}.partsPerCycle`]);
    rows.push(['Process', oe.label, oe.unit, '', `op.${i}.oeePct`]);
    rows.push(['Labour', lt.label, lt.unit, '', `op.${i}.labourTimeSec`]);
    rows.push(['Labour', lr.label, lr.unit, '', `op.${i}.labourRate`]);
    rows.push(['Labour', mn.label, mn.unit, '', `op.${i}.manning`]);
    rows.push(['Labour', le.label, le.unit, '', `op.${i}.labourEffPct`]);
  });
  const tl = L('tooling'), oh = L('overhead'), mg = L('margin');
  rows.push(['TOOLING & COMMERCIAL', '', '', '', '']);
  rows.push(['Tooling', tl.label, tl.unit, '', 'tooling.perPart']);
  rows.push(['Commercial', oh.label, oh.unit, '', 'overhead.pct']);
  rows.push(['Commercial', mg.label, mg.unit, '', 'margin.pct']);

  const summary: unknown[][] = [
    ['Cost element', 'Unit', 'Supplier value', 'Ref (do not edit)'],
    ['Raw material', cur + '/part', '', 'sum.rawMaterial'],
    ['Process', cur + '/part', '', 'sum.process'],
    ['Labour', cur + '/part', '', 'sum.labour'],
    ['Tooling', cur + '/part', '', 'sum.tooling'],
    ['Packaging', cur + '/part', '', 'sum.packaging'],
    ['Logistics', cur + '/part', '', 'sum.logistics'],
    ['Overhead / SG&A', cur + '/part', '', 'sum.overhead'],
    ['Margin', cur + '/part', '', 'sum.margin'],
    ['TOTAL quoted price', cur + '/part', '', 'sum.total'],
  ];

  const wb = await buildWorkbook([
    { name: 'Instructions', rows: instructions, cols: [40, 40] },
    { name: 'Detailed', rows, cols: [26, 32, 13, 16, 22] },
    { name: 'Summary', rows: summary, cols: [24, 12, 16, 22] },
  ]);
  const safe = meta.partName.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'part';
  await downloadWorkbook(wb, `Quote-Template_${safe}.xlsx`);
}

// ─── Parsing (forgiving) ──────────────────────────────────────────────────────
export interface ParsedTemplate {
  detail: SupplierDetail;
  summaryTotal: number | null;
  summaryBuckets: Partial<Record<string, number>>;
  rowsFilled: number;
  warnings: string[];
}

/** Tolerant number cleaner: strips currency/units, handles %, thousands, parens negatives, n/a. */
function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = String(v).trim();
  if (!s || /^(n\/?a|na|tbd|tba|-{1,2}|—|n\.?a\.?)$/i.test(s)) return undefined;
  const neg = /^\(.*\)$/.test(s) || /-/.test(s.replace(/[^\d-]/g, '').charAt(0));
  s = s.replace(/[()]/g, '').replace(/[^0-9.,\-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',') && !s.includes('.')) s = /,\d{3}(?:\D|$)/.test(s + ' ') ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  return neg && n > 0 ? -n : n;
}

const normalize = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Map a Section + Parameter label to a field suffix when the Ref key is missing. */
function fieldFromLabel(section: string, label: string): string | null {
  const sec = normalize(section), p = normalize(label);
  const has = (...ks: string[]) => ks.some(k => p.includes(k));
  if (sec === 'material') {
    if (has('direct')) return 'mat.directCost';
    if (has('weight', 'shot', 'mass', 'blank', 'laminate', 'billet weight')) return 'mat.netWeightKg';
    if (has('util', 'yield', 'nesting', 'buy-to-fly', 'buy to fly')) return 'mat.utilizationPct';
    if (has('price', 'resin', 'alloy', 'coil', 'billet', 'compound', 'powder', 'prepreg', 'bom', 'wire', 'laminate price', 'material cost')) return 'mat.pricePerKg';
    if (has('consumable', 'core', 'wax', 'shell')) return 'mat.consumables';
    return null;
  }
  if (sec === 'process') {
    // Order matters — check the specific drivers before the generic "rate".
    if (has('oee')) return '.oeePct';
    if (has('cavit', 'impression', 'per cycle', 'per hit', 'per setup', 'per stroke', 'per tool', 'ups', 'boards per', 'per panel', 'parts per')) return '.partsPerCycle';
    if (has('rate')) return '.machineRate';       // every machine-rate label contains "rate"
    if (has('time', 'cycle', 'cure', 'placement', 'extrusion', 'layup', 'process')) return '.cycleTimeSec';
    return null;
  }
  if (sec === 'labour') {
    if (has('rate')) return '.labourRate';
    if (has('manning', 'operator')) return '.manning';
    if (has('eff')) return '.labourEffPct';
    if (has('time', 'labour')) return '.labourTimeSec';
    return null;
  }
  if (sec === 'tooling') { if (has('tool')) return 'tooling.perPart'; return null; }
  if (sec === 'commercial') {
    if (has('overhead', 'sg&a', 'sga')) return 'overhead.pct';
    if (has('margin', 'profit')) return 'margin.pct';
    return null;
  }
  return null;
}

export async function parseNegotiationTemplate(file: File): Promise<ParsedTemplate> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const warnings: string[] = [];

  const aoaOf = (ws: import('xlsx').WorkSheet) => XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
  // Find the sheet with a supplier-value column (case-insensitive; not necessarily named "Detailed").
  const findSheet = (): unknown[][] | null => {
    const exact = Object.keys(wb.Sheets).find(n => n.toLowerCase() === 'detailed');
    if (exact) return aoaOf(wb.Sheets[exact]);
    for (const n of wb.SheetNames) {
      const a = aoaOf(wb.Sheets[n]);
      if (a.some(r => r.some(c => /supplier|your value|quote|supplier value/i.test(String(c))))
        && a.some(r => r.some(c => /^(cost element|section|parameter)/i.test(String(c).trim())) || r.some(c => /^op\.\d|^mat\./i.test(String(c))))) return a;
    }
    return null;
  };
  const detailed = findSheet();
  if (!detailed) throw new Error('This file doesn’t look like a CostVision quote template — no supplier breakdown found. Please download the template and fill it in.');

  const hdr = detailed.findIndex(r => r.some(c => /supplier|your value|quote/i.test(String(c))));
  if (hdr < 0) throw new Error('Couldn’t find the "Supplier value" column — is this the right template?');
  const row0 = detailed[hdr].map(c => normalize(c));
  const valCol = row0.findIndex(c => /supplier|your value|quote/.test(c));
  let refCol = row0.findIndex(c => c.startsWith('ref') || c === 'key' || c === 'reference');
  const secCol = row0.findIndex(c => c === 'section' || c === 'cost element');
  const paramCol = row0.findIndex(c => c === 'parameter' || c === 'driver');
  const refPresent = refCol >= 0;
  if (!refPresent) warnings.push('The "Ref" column was missing — figures were matched by their row labels instead.');

  const kv = new Map<string, unknown>();
  const opNames = new Map<number, string>();
  let curOp = -1;

  for (let i = hdr + 1; i < detailed.length; i++) {
    const row = detailed[i];
    const secRaw = String(row[secCol >= 0 ? secCol : 0] ?? '').trim();
    // Operation section header → set current op index + capture its name.
    const opHead = secRaw.match(/^operation\s*(\d+)\s*:?\s*(.*)$/i);
    if (opHead) { curOp = Number(opHead[1]) - 1; if (opHead[2]) opNames.set(curOp, opHead[2].trim()); continue; }
    // Bare group-header rows (MATERIAL / TOOLING & COMMERCIAL) have an empty
    // value cell, so they're skipped by the empty-value guard below — no special
    // case needed (and Section='Material' on real data rows must NOT be skipped).

    let ref = refPresent ? String(row[refCol] ?? '').trim() : '';
    const nameMatch = ref.match(/^op\.(\d+)\.name=(.*)$/);
    if (nameMatch) { const idx = Number(nameMatch[1]); curOp = idx; opNames.set(idx, nameMatch[2]); continue; }

    const val = row[valCol];
    if (val == null || val === '') continue;

    // Reconstruct the key from Section + label when Ref is absent/blank.
    if (!ref) {
      const label = paramCol >= 0 ? String(row[paramCol] ?? '') : secRaw;
      const suffix = fieldFromLabel(secRaw || (curOp >= 0 ? 'process' : ''), label);
      if (!suffix) continue;
      ref = suffix.startsWith('.') ? (curOp >= 0 ? `op.${curOp}${suffix}` : '') : suffix;
      if (!ref) continue;
    }
    kv.set(ref, val);
  }

  let rowsFilled = 0;
  const g = (k: string): number | undefined => { const v = num(kv.get(k)); if (v !== undefined) rowsFilled++; return v; };
  // Percent → fraction, tolerating suppliers who type a fraction (0.7) instead of 70.
  const frac = (v: number | undefined, name: string): number | undefined => {
    if (v === undefined) return undefined;
    if (v <= 1.5) { warnings.push(`Read ${name} as ${Math.round(v * 100)}% (entered ${v}).`); return v; }
    if (v > 100) warnings.push(`${name} of ${v}% looks high — please check.`);
    return v / 100;
  };

  const material: SupplierDetail['material'] = {};
  const direct = g('mat.directCost'); if (direct !== undefined) material.materialCost = direct;
  const net = g('mat.netWeightKg'); if (net !== undefined) material.netWeightKg = net;
  const util = frac(g('mat.utilizationPct'), 'material utilisation'); if (util !== undefined) material.utilization = util;
  const price = g('mat.pricePerKg'); if (price !== undefined) material.pricePerKg = price;
  const cons = g('mat.consumables'); if (cons !== undefined) material.consumablesPerPart = cons;

  const opCount = Math.max(0, ...[...opNames.keys()].map(k => k + 1),
    ...[...kv.keys()].map(k => { const m = k.match(/^op\.(\d+)\./); return m ? Number(m[1]) + 1 : 0; }));
  const operations: SupplierOperation[] = [];
  for (let i = 0; i < opCount; i++) {
    const cyc = g(`op.${i}.cycleTimeSec`), mr = g(`op.${i}.machineRate`), ppc = g(`op.${i}.partsPerCycle`), oee = frac(g(`op.${i}.oeePct`), `op ${i + 1} OEE`);
    const lt = g(`op.${i}.labourTimeSec`), lr = g(`op.${i}.labourRate`), man = g(`op.${i}.manning`), le = frac(g(`op.${i}.labourEffPct`), `op ${i + 1} labour efficiency`);
    const op: SupplierOperation = { name: opNames.get(i) ?? `Operation ${i + 1}` };
    if (cyc !== undefined) op.cycleTimeHr = cyc / HRS_TO_S;
    if (mr !== undefined) op.machineRate = mr;
    if (ppc !== undefined) op.partsPerCycle = ppc;
    if (oee !== undefined) op.oee = oee;
    if (lt !== undefined) op.labourTimeHr = lt / HRS_TO_S;
    if (lr !== undefined) op.labourRate = lr;
    if (man !== undefined) op.manning = man;
    if (le !== undefined) op.labourEfficiency = le;
    operations.push(op);
  }

  const detail: SupplierDetail = { material, operations };
  const tool = g('tooling.perPart'); if (tool !== undefined) detail.toolingPerPart = tool;
  const oh = frac(g('overhead.pct'), 'overhead'); if (oh !== undefined) detail.overheadPct = oh;
  const mg = frac(g('margin.pct'), 'margin'); if (mg !== undefined) detail.marginPct = mg;

  // Optional Summary sheet.
  const summaryBuckets: Partial<Record<string, number>> = {};
  let summaryTotal: number | null = null;
  const sumName = Object.keys(wb.Sheets).find(n => n.toLowerCase() === 'summary');
  if (sumName) {
    const s = aoaOf(wb.Sheets[sumName]);
    const sh = s.findIndex(r => r.some(c => /supplier|your value|quote/i.test(String(c))));
    if (sh >= 0) {
      const vc = s[sh].findIndex(c => /supplier|your value|quote/i.test(String(c)));
      const rc = s[sh].findIndex(c => /^ref|^key/i.test(String(c).trim()));
      for (let i = sh + 1; i < s.length && rc >= 0; i++) {
        const ref = String(s[i][rc] ?? '').trim(); const v = num(s[i][vc]);
        if (!ref || v === undefined) continue;
        if (ref === 'sum.total') summaryTotal = v; else if (ref.startsWith('sum.')) summaryBuckets[ref.slice(4)] = v;
      }
    }
  }
  return { detail, summaryTotal, summaryBuckets, rowsFilled, warnings };
}
