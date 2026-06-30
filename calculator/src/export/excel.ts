import type { PartCostResult, UniversalStackInput, RateLibrary } from '../engine/types.js';
import { breakdownPercentages } from '../engine/core.js';
import { buildWorkbook, workbookBlob, type SheetSpec } from './xlsx-util.js';

const pct = (n: number) => `${n.toFixed(1)}%`;
const num4 = (n: number) => +n.toFixed(4);

export async function exportToExcelBlob(
  result: PartCostResult,
  input: UniversalStackInput,
  library: RateLibrary,
  currency = 'GBP',
  fxRate = 1
): Promise<Blob> {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  const c = (n: number) => `${sym}${(n * fxRate).toFixed(2)}`;
  const sheets: SheetSpec[] = [];
  const pcts = breakdownPercentages(result);

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const grossWeight = input.rawMaterial.directCost === undefined
    ? input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization
    : 0;
  const scrapWeight = Math.max(0, grossWeight - input.rawMaterial.netWeightKg);

  const sum: unknown[][] = [
    ['SHOULD-COST ANALYSIS REPORT'],
    ['Part Name', result.partName],
    ['Report Date', new Date().toLocaleDateString('en-GB')],
    ['Currency', `${currency} (FX: ${fxRate.toFixed(4)} to GBP)`],
    [],
    ['── COST SUMMARY ──'],
    ['Cost Bucket', `Amount (${currency})`, '% of Total', 'Bar (scaled)'],
    ['1. Raw Material', c(result.breakdown.rawMaterial), pct(pcts.rawMaterial), '█'.repeat(Math.round(pcts.rawMaterial / 2))],
    ['2. Process (Machine)', c(result.breakdown.process), pct(pcts.process), '█'.repeat(Math.round(pcts.process / 2))],
    ['3. Direct Labour', c(result.breakdown.labour), pct(pcts.labour), '█'.repeat(Math.round(pcts.labour / 2))],
    ['4. Tooling (amortised)', c(result.breakdown.tooling), pct(pcts.tooling), '█'.repeat(Math.round(pcts.tooling / 2))],
    ['5. Packaging', c(result.breakdown.packaging), pct(pcts.packaging), ''],
    ['6. Logistics', c(result.breakdown.logistics), pct(pcts.logistics), ''],
    ['── Factory Cost', c(result.factoryCost), pct((result.factoryCost / result.total) * 100), ''],
    ['7. Overhead (SG&A)', c(result.breakdown.overhead), pct(pcts.overhead), '█'.repeat(Math.round(pcts.overhead / 2))],
    ['── Subtotal', c(result.subtotal), pct((result.subtotal / result.total) * 100), ''],
    ['8. Supplier Margin', c(result.breakdown.margin), pct(pcts.margin), '█'.repeat(Math.round(pcts.margin / 2))],
    ['TOTAL SHOULD COST', c(result.total), '100.0%', ''],
  ];
  if (result.toolingNRE !== undefined) {
    sum.push(['NRE / Tooling (one-time, not in unit cost)', c(result.toolingNRE), '', '']);
  }
  sum.push([], ['── COMMERCIAL PARAMETERS ──']);
  sum.push(['Overhead Rate', pct(input.overheadPct * 100)]);
  sum.push(['Supplier Margin Rate', pct(input.marginPct * 100)]);
  sum.push(['Packaging per Part', c(input.packagingPerPart)]);
  sum.push(['Logistics per Part', c(input.logisticsPerPart)]);
  if (input.tooling.mode === 'amortized') {
    sum.push(['Total Tooling Cost', c(input.tooling.totalToolingCost)]);
    sum.push(['Amortisation Volume', `${input.tooling.amortizationVolume.toLocaleString()} parts`]);
  }

  sheets.push({ name: '1-Summary', rows: sum, cols: [34, 18, 14, 30] });

  // ── Sheet 2: Material Detail ────────────────────────────────────────────────
  const matDetail: unknown[][] = [
    ['MATERIAL DETAIL'],
    [],
    ['Parameter', 'Value', 'Unit', 'Notes'],
    ['Material ID', input.rawMaterial.materialId, '', ''],
    ['Grade / Description', mat?.grade ?? 'Direct Cost', '', mat?.sourceNote ?? ''],
    ['Region', mat?.region ?? '—', '', ''],
    ['Net (Finished) Weight', num4(input.rawMaterial.netWeightKg), 'kg', 'Weight in finished part'],
  ];

  if (input.rawMaterial.directCost !== undefined) {
    matDetail.push(['Direct Material Cost', c(input.rawMaterial.directCost), currency, 'Bypasses weight-based calculation']);
  } else {
    matDetail.push(
      ['Gross Weight (stock/casting)', num4(grossWeight), 'kg', `= net ÷ utilisation`],
      ['Scrap Weight', num4(scrapWeight), 'kg', `= gross − net`],
      ['Material Utilisation', pct(input.rawMaterial.materialUtilization * 100), '', `Benchmark: ${mat ? '75-85%' : '—'}`],
      ['Material Price', c(mat?.pricePerKg ?? 0), `${currency}/kg`, mat?.sourceNote ?? ''],
      ['Scrap Recovery Price', c(mat?.scrapRecoveryPricePerKg ?? 0), `${currency}/kg`, ''],
      ['Gross Material Cost', c(grossWeight * (mat?.pricePerKg ?? 0)), currency, `= gross × price/kg`],
      ['Scrap Credit', c(scrapWeight * (mat?.scrapRecoveryPricePerKg ?? 0)), currency, `= scrap × recovery price`],
      ['NET RAW MATERIAL COST', c(result.breakdown.rawMaterial), currency, '= gross cost − scrap credit'],
    );
  }
  matDetail.push(
    [],
    ['Data confidence', mat?.confidence ?? '—', '', ''],
    ['Effective date', mat?.effectiveDate ?? '—', '', ''],
  );

  sheets.push({ name: '2-Material', rows: matDetail, cols: [32, 20, 10, 50] });

  // ── Sheet 3: Operations Detail ──────────────────────────────────────────────
  const opHdr: string[] = [
    'Operation', 'Machine ID', 'Machine Class', 'Machine Rate', 'Cycle Time (hr)', 'Cycle Time (min)',
    'Parts/Cycle', 'OEE %', 'Effective Time (hr)', 'Process Cost',
    'Labour ID', 'Labour Grade', 'Labour Rate', 'Manning', 'Labour Time (hr)',
    'Labour Efficiency %', 'Labour Cost', 'Op Total', '% of Total',
  ];
  const opRows: unknown[][] = [opHdr];

  for (const op of result.operationDetails) {
    const mach = library.machines.find(m => m.id === op.machineId);
    const lab = library.labour.find(l => l.id === op.labourId);
    const effectiveTimeHr = op.cycleTimeHr / op.oee;
    opRows.push([
      op.operationName,
      op.machineId,
      mach?.machineClass ?? '—',
      c(op.machineRateUsed),
      num4(op.cycleTimeHr),
      +(op.cycleTimeHr * 60).toFixed(2),
      op.partsPerCycle,
      pct(op.oee * 100),
      num4(effectiveTimeHr),
      c(op.processCost),
      op.labourId,
      lab?.skillLevel ?? '—',
      c(op.labourRateUsed),
      op.manning,
      num4(op.labourTimeHr),
      pct(op.labourEfficiency * 100),
      c(op.labourCost),
      c(op.processCost + op.labourCost),
      pct(((op.processCost + op.labourCost) / result.total) * 100),
    ]);
  }
  opRows.push([
    'TOTAL', '', '', '', '', '', '', '', '',
    c(result.breakdown.process), '', '', '', '', '', '',
    c(result.breakdown.labour),
    c(result.breakdown.process + result.breakdown.labour),
    pct(((result.breakdown.process + result.breakdown.labour) / result.total) * 100),
  ]);

  sheets.push({ name: '3-Operations', rows: opRows, cols: [
    26, 18, 22, 16, 16, 16, 12, 10, 18, 16, 18, 18, 16, 10, 16, 18, 16, 14, 12,
  ] });

  // ── Sheet 4: Machine Rate Buildup ───────────────────────────────────────────
  const machHdr: string[] = [
    'Machine ID', 'Machine Class', 'Region', 'Computed Rate',
    'Annual Depreciation', 'Maintenance', 'Energy', 'Floor Space',
    'Indirect Support', 'Finance Cost', 'Annual Hours', 'Utilisation %',
    'Effective Rate Check', 'Confidence',
  ];
  const machRows: unknown[][] = [machHdr];

  const usedMachIds = new Set(result.operationDetails.map(op => op.machineId));
  for (const mach of library.machines.filter(m => usedMachIds.has(m.id))) {
    const b = mach.buildup;
    const totalAnnualCost = b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
    const effectiveHrs = b.annualAvailableHours * b.machineUtilization;
    machRows.push([
      mach.id, mach.machineClass, mach.region, c(mach.computedRatePerHr),
      c(b.annualDepreciation / effectiveHrs),
      c(b.maintenance / effectiveHrs),
      c(b.energy / effectiveHrs),
      c(b.floorSpace / effectiveHrs),
      c(b.indirectSupport / effectiveHrs),
      c(b.financeCost / effectiveHrs),
      b.annualAvailableHours,
      pct(b.machineUtilization * 100),
      c(totalAnnualCost / effectiveHrs),
      mach.confidence,
    ]);
  }

  sheets.push({ name: '4-MachineRates', rows: machRows, cols: Array(14).fill(18) });

  // ── Sheet 5: Labour Rates ───────────────────────────────────────────────────
  const labHdr: string[] = ['Labour ID', 'Region', 'Skill Level', 'Fully Loaded Rate', 'Effective Date', 'Source', 'Confidence'];
  const labRows: unknown[][] = [labHdr];
  const usedLabIds = new Set(result.operationDetails.map(op => op.labourId));
  for (const lab of library.labour.filter(l => usedLabIds.has(l.id))) {
    labRows.push([lab.id, lab.region, lab.skillLevel, c(lab.fullyLoadedRatePerHr), lab.effectiveDate, lab.sourceNote, lab.confidence]);
  }
  labRows.push([], ['ALL AVAILABLE LABOUR RATES IN LIBRARY:']);
  labRows.push(labHdr);
  for (const lab of library.labour) {
    labRows.push([lab.id, lab.region, lab.skillLevel, c(lab.fullyLoadedRatePerHr), lab.effectiveDate, lab.sourceNote, lab.confidence]);
  }

  sheets.push({ name: '5-LabourRates', rows: labRows, cols: [22, 14, 20, 20, 14, 50, 12] });

  // ── Sheet 6: Rate Traceability ──────────────────────────────────────────────
  const trHdr: string[] = ['Field', 'Value', 'Unit', 'Rate Source / Reference', 'Rate ID', 'Confidence'];
  const trRows: unknown[][] = [trHdr];
  for (const t of result.traceability) {
    trRows.push([t.field, num4(t.value), t.unit, t.rateSource, t.rateId, t.confidence]);
  }

  sheets.push({ name: '6-Traceability', rows: trRows, cols: [36, 12, 10, 55, 22, 12] });

  return workbookBlob(await buildWorkbook(sheets));
}

// Legacy compat wrapper (called by old main.ts path)
export { exportToExcelBlob as exportToExcel };
