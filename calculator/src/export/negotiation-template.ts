/**
 * Negotiation Intelligence — per-part supplier cost-breakdown Excel template.
 *
 * The template is generated from the selected part's should-cost DETAIL, so its
 * rows (material line + each real operation) match the part exactly — this is
 * how one generic generator covers every commodity. Per decision A, no
 * should-cost values are pre-filled: the supplier fills only the "Supplier
 * value" column. Each row carries a machine-readable key in a "Ref" column so
 * the upload parser is robust to reordering and cosmetic edits.
 */
import type { PartDetail, SupplierDetail, SupplierOperation } from '../engine/quote-teardown-detailed.js';
import { buildWorkbook, downloadWorkbook } from './xlsx-util.js';

const HRS_TO_S = 3600;

interface TemplateMeta { partName: string; commodityLabel: string; currency: string; dateLabel: string; }

/** Build and download the blank supplier template for a part. */
export async function downloadNegotiationTemplate(part: PartDetail, meta: TemplateMeta): Promise<void> {
  const cur = meta.currency;
  // ── Instructions ──────────────────────────────────────────────────────────
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
    ['   • Times are in SECONDS per part.  • Utilisation / OEE / efficiency / overhead / margin are in PERCENT.'],
    ['3. Do NOT rename sheets, delete rows, or edit the "Ref" column — it is used to read your figures back.'],
    ['4. Leave a cell blank if not applicable; blank lines are simply skipped in the comparison.'],
    ['5. Save as .xlsx and upload it in the Negotiation Intelligence screen, then click "Analyze Quote".'],
    [],
    ['All figures are treated as per-part in ' + cur + ' unless the unit says otherwise.'],
  ];

  // ── Detailed sheet ──────────────────────────────────────────────────────────
  const header = ['Section', 'Parameter', 'Unit', 'Supplier value', 'Ref (do not edit)'];
  const rows: unknown[][] = [header];
  const m = part.material;
  rows.push(['MATERIAL', '', '', '', '']);
  if (m.directMode) {
    rows.push(['Material', 'Material cost (direct)', cur + '/part', '', 'mat.directCost']);
  } else {
    rows.push(['Material', 'Net weight', 'kg', '', 'mat.netWeightKg']);
    rows.push(['Material', 'Material utilisation (yield)', '%', '', 'mat.utilizationPct']);
    rows.push(['Material', 'Material price', cur + '/kg', '', 'mat.pricePerKg']);
    rows.push(['Material', 'Consumables', cur + '/part', '', 'mat.consumables']);
  }
  part.operations.forEach((op, i) => {
    rows.push([`OPERATION ${i + 1}: ${op.name}`, '', '', '', `op.${i}.name=${op.name}`]);
    rows.push(['Process', 'Cycle time', 's', '', `op.${i}.cycleTimeSec`]);
    rows.push(['Process', 'Machine rate', cur + '/hr', '', `op.${i}.machineRate`]);
    rows.push(['Process', 'Parts per cycle', 'count', '', `op.${i}.partsPerCycle`]);
    rows.push(['Process', 'OEE', '%', '', `op.${i}.oeePct`]);
    rows.push(['Labour', 'Labour time', 's', '', `op.${i}.labourTimeSec`]);
    rows.push(['Labour', 'Labour rate', cur + '/hr', '', `op.${i}.labourRate`]);
    rows.push(['Labour', 'Manning', 'operators', '', `op.${i}.manning`]);
    rows.push(['Labour', 'Labour efficiency', '%', '', `op.${i}.labourEffPct`]);
  });
  rows.push(['TOOLING & COMMERCIAL', '', '', '', '']);
  rows.push(['Tooling', 'Tooling (amortised per part)', cur + '/part', '', 'tooling.perPart']);
  rows.push(['Commercial', 'Overhead / SG&A', '%', '', 'overhead.pct']);
  rows.push(['Commercial', 'Margin', '%', '', 'margin.pct']);

  // ── Summary sheet (8 buckets — optional, derived automatically if left blank) ─
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
    { name: 'Detailed', rows, cols: [26, 30, 12, 16, 22] },
    { name: 'Summary', rows: summary, cols: [24, 12, 16, 22] },
  ]);
  const safe = meta.partName.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'part';
  await downloadWorkbook(wb, `Quote-Template_${safe}.xlsx`);
}

// ─── Parsing ────────────────────────────────────────────────────────────────
export interface ParsedTemplate {
  detail: SupplierDetail;
  summaryTotal: number | null;      // if the supplier filled the Summary TOTAL
  summaryBuckets: Partial<Record<string, number>>; // any 8-bucket values they filled
  rowsFilled: number;
}

const num = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/** Parse a filled template file back into a SupplierDetail. Throws on a wrong file. */
export async function parseNegotiationTemplate(file: File): Promise<ParsedTemplate> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = (name: string) => {
    const ws = wb.Sheets[name];
    return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][]) : null;
  };
  const detailed = sheet('Detailed');
  if (!detailed) throw new Error('This file is not a CostVision quote template (no "Detailed" sheet). Please download the template and fill that.');

  // Locate the header row (has "Supplier value" and "Ref…").
  const hdr = detailed.findIndex(r => r.some(c => String(c).toLowerCase().includes('supplier value')));
  if (hdr < 0) throw new Error('Could not find the "Supplier value" column — is this the right template?');
  const valCol = detailed[hdr].findIndex(c => String(c).toLowerCase().includes('supplier value'));
  const refCol = detailed[hdr].findIndex(c => String(c).toLowerCase().startsWith('ref'));
  if (valCol < 0 || refCol < 0) throw new Error('Template header is missing the "Supplier value" or "Ref" column.');

  const kv = new Map<string, unknown>();
  const opNames = new Map<number, string>();
  for (let i = hdr + 1; i < detailed.length; i++) {
    const ref = String(detailed[i][refCol] ?? '').trim();
    if (!ref) continue;
    const nameMatch = ref.match(/^op\.(\d+)\.name=(.*)$/);
    if (nameMatch) { opNames.set(Number(nameMatch[1]), nameMatch[2]); continue; }
    kv.set(ref, detailed[i][valCol]);
  }

  let rowsFilled = 0;
  const g = (k: string) => { const v = num(kv.get(k)); if (v !== undefined) rowsFilled++; return v; };

  const material: SupplierDetail['material'] = {};
  const direct = g('mat.directCost');
  if (direct !== undefined) material.materialCost = direct;
  const net = g('mat.netWeightKg'); if (net !== undefined) material.netWeightKg = net;
  const util = g('mat.utilizationPct'); if (util !== undefined) material.utilization = util / 100;
  const price = g('mat.pricePerKg'); if (price !== undefined) material.pricePerKg = price;
  const cons = g('mat.consumables'); if (cons !== undefined) material.consumablesPerPart = cons;

  const operations: SupplierOperation[] = [];
  const opCount = Math.max(0, ...[...opNames.keys()].map(k => k + 1),
    ...[...kv.keys()].map(k => { const m = k.match(/^op\.(\d+)\./); return m ? Number(m[1]) + 1 : 0; }));
  for (let i = 0; i < opCount; i++) {
    const cyc = g(`op.${i}.cycleTimeSec`); const mr = g(`op.${i}.machineRate`);
    const ppc = g(`op.${i}.partsPerCycle`); const oee = g(`op.${i}.oeePct`);
    const lt = g(`op.${i}.labourTimeSec`); const lr = g(`op.${i}.labourRate`);
    const man = g(`op.${i}.manning`); const le = g(`op.${i}.labourEffPct`);
    const op: SupplierOperation = { name: opNames.get(i) ?? `Operation ${i + 1}` };
    if (cyc !== undefined) op.cycleTimeHr = cyc / HRS_TO_S;
    if (mr !== undefined) op.machineRate = mr;
    if (ppc !== undefined) op.partsPerCycle = ppc;
    if (oee !== undefined) op.oee = oee / 100;
    if (lt !== undefined) op.labourTimeHr = lt / HRS_TO_S;
    if (lr !== undefined) op.labourRate = lr;
    if (man !== undefined) op.manning = man;
    if (le !== undefined) op.labourEfficiency = le / 100;
    operations.push(op);
  }

  const detail: SupplierDetail = { material, operations };
  const tool = g('tooling.perPart'); if (tool !== undefined) detail.toolingPerPart = tool;
  const oh = g('overhead.pct'); if (oh !== undefined) detail.overheadPct = oh / 100;
  const mg = g('margin.pct'); if (mg !== undefined) detail.marginPct = mg / 100;

  // Optional summary sheet.
  const summaryBuckets: Partial<Record<string, number>> = {};
  let summaryTotal: number | null = null;
  const sumSheet = sheet('Summary');
  if (sumSheet) {
    const sh = sumSheet.findIndex(r => r.some(c => String(c).toLowerCase().includes('supplier value')));
    if (sh >= 0) {
      const vc = sumSheet[sh].findIndex(c => String(c).toLowerCase().includes('supplier value'));
      const rc = sumSheet[sh].findIndex(c => String(c).toLowerCase().startsWith('ref'));
      for (let i = sh + 1; i < sumSheet.length; i++) {
        const ref = String(sumSheet[i][rc] ?? '').trim();
        const v = num(sumSheet[i][vc]);
        if (!ref || v === undefined) continue;
        if (ref === 'sum.total') summaryTotal = v;
        else if (ref.startsWith('sum.')) summaryBuckets[ref.slice(4)] = v;
      }
    }
  }
  return { detail, summaryTotal, summaryBuckets, rowsFilled };
}
