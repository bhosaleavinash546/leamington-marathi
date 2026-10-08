import { labourRoles } from '../engine/labour-roles.js';
import type { ChecksAppliedMeta } from './pdf.js';
import type { PartCostResult, UniversalStackInput, RateLibrary } from '../engine/types.js';
import { breakdownPercentages, overheadBaseOf, overheadRateOf } from '../engine/core.js';
import { currencySymbol } from '../engine/insights.js';
import { buildWorkbook, workbookBlob, money, pctCell, type SheetSpec } from './xlsx-util.js';

const num4 = (n: number) => +n.toFixed(4);
/** Hours to 6 dp — at 4 dp a reader recomputing an operation from the sheet was out by up to £0.003. */
const hr6 = (n: number) => +n.toFixed(6);

/**
 * The costing as a workbook. Every figure is the ENGINE's (computeUniversalStack) — nothing here recomputes a cost — and
 * every money cell is a NUMBER in the report's currency with a currency format, so the sheet can be summed and checked
 * (it was text, "£25.34"; uploaded-parts review, Oct 2026). Sheet 7 states the arithmetic that ties the sheets to the
 * total, so a reader can see the workbook reconciles rather than take it on trust.
 */
export async function exportToExcelBlob(
  result: PartCostResult,
  input: UniversalStackInput,
  library: RateLibrary,
  currency = 'GBP',
  fxRate = 1,
  /** The guardrails, decisions and rule overrides behind a CAD costing (same block the PDF prints). */
  checks: ChecksAppliedMeta | null = null,
): Promise<Blob> {
  const sym = currencySymbol(currency);
  const m = (gbp: number) => money(gbp * fxRate, sym);
  const pc = (pct100: number) => pctCell(pct100 / 100);
  const sheets: SheetSpec[] = [];
  const pcts = breakdownPercentages(result);
  const b = result.breakdown;
  const rm = input.rawMaterial;
  const boughtIn = Math.max(0, rm.boughtIn?.cost ?? 0);
  const base = overheadBaseOf(result);
  const handling = boughtIn > 0 ? Math.max(0, b.overhead - input.overheadPct * base) : 0;
  const lc = result.learningCurveApplied;

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const sum: unknown[][] = [
    ['SHOULD-COST ANALYSIS REPORT'],
    ['Part Name', result.partName],
    ['Manufacturing Country', library.regional ? `${library.regional.name} (${library.regional.code}) — rates rebuilt for this country` : 'United Kingdom — base rate book'],
    ['Report Date', new Date().toLocaleDateString('en-GB')],
    ['Currency', currency === 'GBP' ? 'GBP' : `${currency} — £1 = ${fxRate.toFixed(4)} ${currency} (the costing is in GBP)`],
    [],
    ['── COST SUMMARY ──'],
    ['Cost Bucket', `Amount (${currency})`, '% of Total'],
    ['1. Raw Material', m(b.rawMaterial), pc(pcts.rawMaterial)],
    ['2. Process (Machine)', m(b.process), pc(pcts.process)],
    ['3. Direct Labour', m(b.labour), pc(pcts.labour)],
    ['4. Tooling (amortised)', m(b.tooling), pc(pcts.tooling)],
    ['5. Packaging', m(b.packaging), pc(pcts.packaging)],
    ['6. Logistics', m(b.logistics), pc(pcts.logistics)],
    ['── Factory Cost', m(result.factoryCost), pc((result.factoryCost / result.total) * 100)],
    [boughtIn > 0
      ? `   Overhead base (material + process + labour + tooling, excl. bought-in ${sym}${(boughtIn * fxRate).toFixed(2)})`
      : '   Overhead base (material + process + labour + tooling)', m(base), ''],
    [boughtIn > 0
      ? `7. Overhead (SG&A) — ${(input.overheadPct * 100).toFixed(1)}% of base + bought-in handling ${sym}${(handling * fxRate).toFixed(2)}`
      : `7. Overhead (SG&A) — ${(overheadRateOf(result) * 100).toFixed(1)}% of base`, m(b.overhead), pc(pcts.overhead)],
    ['── Subtotal', m(result.subtotal), pc((result.subtotal / result.total) * 100)],
    [boughtIn > 0
      ? `8. Supplier Margin — ${(input.marginPct * 100).toFixed(1)}% of the subtotal excl. bought-in`
      : `8. Supplier Margin — ${(input.marginPct * 100).toFixed(1)}% of the subtotal`, m(b.margin), pc(pcts.margin)],
    ['TOTAL SHOULD COST', m(result.total), pc(100)],
  ];
  if (result.toolingNRE !== undefined) {
    sum.push(['NRE / Tooling (one-time, not in unit cost)', m(result.toolingNRE), '']);
  }
  sum.push([], ['── COMMERCIAL PARAMETERS ──']);
  sum.push(['Overhead Rate', input.priceBasis === 'market_price'
    ? 'not added — a fabricator\'s price already includes overhead and margin'
    : `${(input.overheadPct * 100).toFixed(1)}% of material + process + labour + tooling${boughtIn > 0 ? ' (excl. bought-in, which carries handling only)' : ''}`]);
  sum.push(['Supplier Margin Rate', `${(input.marginPct * 100).toFixed(1)}%${boughtIn > 0 ? ' (not on bought-in content)' : ''}`]);
  sum.push(['Packaging per Part', m(input.packagingPerPart)]);
  sum.push(['Logistics per Part', m(input.logisticsPerPart)]);
  if (input.tooling.mode === 'amortized') {
    sum.push(['Total Tooling Cost', m(input.tooling.totalToolingCost)]);
    sum.push(['Amortisation Volume', input.tooling.amortizationVolume, 'parts']);
  }
  const warnings = result.warnings ?? [];
  if (warnings.length) {
    sum.push([], ['── WARNINGS ON THIS COSTING ──'], ...warnings.map(w => [w]));
  }

  sheets.push({ name: '1-Summary', rows: sum, cols: [58, 18, 12] });

  // ── Sheet 2: Material Detail — every row of the material line, adding up to bucket 1 ──
  const trace = result.traceability ?? [];
  const traced = (re: RegExp) => trace.filter(t => re.test(t.field)).reduce((s, t) => s + (Number(t.value) || 0), 0);
  const tracedValue = (field: string) => trace.find(t => t.field === field)?.value;
  const mat = library.materials.find(x => x.id === rm.materialId);
  const isDirect = rm.directCost !== undefined;
  const placeholder = /^mat-virtual/.test(rm.materialId);
  const matDetail: unknown[][] = [
    ['MATERIAL DETAIL'],
    [],
    ['Parameter', 'Value', 'Unit', 'Notes'],
  ];
  let metalNet = 0;
  if (isDirect) {
    metalNet = rm.directCost ?? 0;
    matDetail.push(
      ['Material basis', placeholder ? 'Supplied / bought-in price — no weight-based material' : (mat?.grade ?? rm.materialId), '', ''],
      ['Direct material cost', m(metalNet), currency, 'priced by the commodity module (not weight × £/kg)'],
    );
    for (const l of rm.lines ?? []) {
      matDetail.push([`   ${l.ref} ${l.description}`, m(l.unitCost * l.qty), currency, `${l.qty} × ${sym}${(l.unitCost * fxRate).toFixed(4)}${l.pkg ? ` · ${l.pkg}` : ''}`]);
    }
  } else {
    // The prices the costing USED (its trace), not the library as it stands at export time.
    const price = tracedValue('material.pricePerKg') ?? mat?.pricePerKg ?? 0;
    const scrapPrice = tracedValue('material.scrapRecoveryPricePerKg') ?? mat?.scrapRecoveryPricePerKg ?? 0;
    const gross = rm.netWeightKg / rm.materialUtilization;
    const scrap = Math.max(0, gross - rm.netWeightKg);
    const lossIsNotScrap = !!rm.lossIsNotScrap;
    const credit = lossIsNotScrap ? 0 : scrap * scrapPrice;
    metalNet = gross * price - credit;
    matDetail.push(
      ['Material ID', rm.materialId, '', ''],
      ['Grade / Description', mat?.grade ?? rm.materialId, '', mat?.sourceNote ?? ''],
      ['Costed Net Weight', num4(rm.netWeightKg), 'kg', 'the weight the material line is costed on — the finished part plus any machining stock or reject allowance the module carries'],
      ['Gross Weight (stock / pour)', num4(gross), 'kg', '= net ÷ utilisation'],
      ['Material Utilisation', pctCell(rm.materialUtilization), '', lossIsNotScrap ? 'melt loss only — runners and risers are remelted' : '= net ÷ gross'],
      ['Material Price', m(price), `${currency}/kg`, 'as costed'],
      ['Gross Material Cost', m(gross * price), currency, '= gross × price/kg'],
      ['Scrap Credit', m(-credit), currency, lossIsNotScrap ? 'none — melt loss is metal lost, not scrap sold' : `= ${num4(scrap)} kg × ${sym}${(scrapPrice * fxRate).toFixed(2)}/kg`],
    );
  }
  const consumables = rm.consumablesCostPerPart ?? 0;
  const energy = traced(/^rawMaterial\.energyKwh\./);
  if (consumables > 0) {
    if (rm.consumablesItems?.length) {
      for (const i of rm.consumablesItems) matDetail.push([`Consumable / service — ${i.label}`, m(i.gbp), currency, 'per part']);
      const rest = consumables - rm.consumablesItems.reduce((s, i) => s + i.gbp, 0);
      if (Math.abs(rest) >= 0.00005) matDetail.push(['Consumables & services — not itemised', m(rest), currency, 'per part']);
    } else {
      matDetail.push(['Consumables & services', m(consumables), currency, 'per part']);
    }
  }
  if (energy > 0) matDetail.push(['Process energy', m(energy), currency, 'kWh × the costing country tariff (see 6-Traceability)']);
  if (boughtIn > 0) matDetail.push(['Bought-in content', m(boughtIn), currency, 'supplier price — handling only, no second overhead / margin']);
  const residual = b.rawMaterial - metalNet - consumables - energy - boughtIn;
  if (Math.abs(residual) >= 0.0005) {
    // Never a label that explains a difference away: if the rows do not add up, say so.
    matDetail.push(['UNRECONCILED', m(residual), currency, 'the rows above do not add up to the material bucket — report this']);
  }
  matDetail.push(['NET RAW MATERIAL COST', m(b.rawMaterial), currency, '= bucket 1']);
  if (!placeholder && mat) {
    matDetail.push([], ['Data confidence', mat.confidence, '', ''], ['Effective date', mat.effectiveDate, '', '']);
  }

  sheets.push({ name: '2-Material', rows: matDetail, cols: [40, 18, 10, 60] });

  // ── Sheet 3: Operations Detail ──────────────────────────────────────────────
  const opHdr: string[] = [
    'Operation', 'Machine ID', 'Machine Class', 'Machine Rate (/hr)', 'Cycle Time (hr)', 'Cycle Time (min)',
    'Parts/Cycle', 'OEE', 'Effective Time (hr)', 'Process Cost',
    'Labour ID', 'Labour Grade', 'Labour Rate (/hr)', 'Manning', 'Labour Time (hr)',
    'Labour Efficiency', 'Labour Cost', 'Op Total', '% of Total',
  ];
  const opRows: unknown[][] = [opHdr];
  for (const op of result.operationDetails) {
    const mach = library.machines.find(x => x.id === op.machineId);
    const lab = library.labour.find(x => x.id === op.labourId);
    const bench = !!op.benchOperation || op.cycleTimeHr === 0;
    const untended = op.labourTimeHr === 0;
    opRows.push([
      op.operationName,
      bench ? '— bench (no machine time)' : op.machineId,
      bench ? '' : mach?.machineClass ?? '—',
      bench ? '' : m(op.machineRateUsed),
      hr6(op.cycleTimeHr),
      +(op.cycleTimeHr * 60).toFixed(3),
      op.partsPerCycle,
      bench ? '' : pctCell(op.oee),
      bench ? '' : hr6(op.cycleTimeHr / op.oee),
      m(op.processCost),
      untended ? '— untended' : op.labourId,
      untended ? '' : lab?.skillLevel ?? '—',
      untended ? '' : m(op.labourRateUsed),
      untended ? 0 : op.manning,
      hr6(op.labourTimeHr),
      untended ? '' : pctCell(op.labourEfficiency),
      m(op.labourCost),
      m(op.processCost + op.labourCost),
      pctCell((op.processCost + op.labourCost) / result.total),
    ]);
  }
  const opsLabour = result.operationDetails.reduce((s, o) => s + o.labourCost, 0);
  if (lc && Math.abs(b.labour - opsLabour) >= 0.00005) {
    // The operations' labour is costed before Wright's law; the bucket after it.
    opRows.push([`Learning-curve adjustment (${lc.curvePct}% curve, ×${lc.adjustmentFactor.toFixed(4)} on labour)`,
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', m(b.labour - opsLabour), m(b.labour - opsLabour), '']);
  }
  opRows.push([
    'TOTAL', '', '', '', '', '', '', '', '',
    m(b.process), '', '', '', '', '', '',
    m(b.labour),
    m(b.process + b.labour),
    pctCell((b.process + b.labour) / result.total),
  ]);

  sheets.push({ name: '3-Operations', rows: opRows, cols: [
    40, 18, 22, 16, 14, 14, 10, 8, 16, 14, 18, 20, 16, 9, 14, 14, 14, 14, 10,
  ] });

  // ── Sheet 4: Machine Rate Buildup (machines the costing used, bench placeholders excluded) ──
  const machHdr: string[] = [
    'Machine ID', 'Machine Class', 'Region', 'Rate used in this costing (/hr)',
    'Depreciation (/hr)', 'Maintenance (/hr)', 'Energy (/hr)', 'Floor Space (/hr)',
    'Indirect Support (/hr)', 'Finance Cost (/hr)', 'Annual Hours', 'Utilisation',
    'Build-up total (/hr)', 'Confidence',
  ];
  const machRows: unknown[][] = [machHdr];
  const usedMach = new Map<string, number>();
  for (const op of result.operationDetails) if (!(op.benchOperation || op.cycleTimeHr === 0)) usedMach.set(op.machineId, op.machineRateUsed);
  for (const mach of library.machines.filter(x => usedMach.has(x.id))) {
    const bu = mach.buildup;
    const effectiveHrs = Math.max(1, bu.annualAvailableHours * bu.machineUtilization);
    const totalAnnual = bu.annualDepreciation + bu.maintenance + bu.energy + bu.floorSpace + bu.indirectSupport + bu.financeCost;
    machRows.push([
      mach.id, mach.machineClass, mach.region, m(usedMach.get(mach.id) ?? mach.computedRatePerHr),
      m(bu.annualDepreciation / effectiveHrs), m(bu.maintenance / effectiveHrs), m(bu.energy / effectiveHrs),
      m(bu.floorSpace / effectiveHrs), m(bu.indirectSupport / effectiveHrs), m(bu.financeCost / effectiveHrs),
      bu.annualAvailableHours, pctCell(bu.machineUtilization), m(totalAnnual / effectiveHrs), mach.confidence,
    ]);
  }
  sheets.push({ name: '4-MachineRates', rows: machRows, cols: Array(14).fill(18) });

  // ── Sheet 5: Labour Rates ───────────────────────────────────────────────────
  const labHdr: string[] = ['Labour ID', 'Region', 'Skill Level', 'Fully Loaded Rate (/hr)', 'Effective Date', 'Source', 'Confidence'];
  const labRows: unknown[][] = [labHdr];
  const usedLabIds = new Set(result.operationDetails.filter(o => o.labourTimeHr > 0).map(op => op.labourId));
  for (const lab of library.labour.filter(l => usedLabIds.has(l.id))) {
    labRows.push([lab.id, lab.region, lab.skillLevel, m(lab.fullyLoadedRatePerHr), lab.effectiveDate, lab.sourceNote, lab.confidence]);
  }
  labRows.push([], ['ALL AVAILABLE LABOUR RATES IN LIBRARY:']);
  labRows.push(labHdr);
  for (const lab of labourRoles(library)) {   // roles, one per job (labour-roles.ts)
    labRows.push([lab.id, lab.region, lab.skillLevel, m(lab.fullyLoadedRatePerHr), lab.effectiveDate, lab.sourceNote, lab.confidence]);
  }
  sheets.push({ name: '5-LabourRates', rows: labRows, cols: [22, 14, 20, 20, 14, 50, 12] });

  // ── Sheet 6: Rate Traceability (money in the report's currency, like every other sheet) ──
  const trHdr: string[] = ['Field', 'Value', 'Unit', 'Rate Source / Reference (as recorded, GBP)', 'Rate ID', 'Confidence'];
  const trRows: unknown[][] = [trHdr];
  for (const t of trace) {
    const isMoney = t.unit.includes('£');
    trRows.push([t.field, isMoney ? m(t.value) : num4(t.value), isMoney ? t.unit.replace('£', sym) : t.unit, t.rateSource, t.rateId, t.confidence]);
  }
  sheets.push({ name: '6-Traceability', rows: trRows, cols: [40, 14, 10, 70, 22, 12] });

  // ── Sheet 7: Checks — the arithmetic that ties the sheets to the total, then the CAD checks ──
  const bucketSum = b.rawMaterial + b.process + b.labour + b.tooling + b.packaging + b.logistics + b.overhead + b.margin;
  const opsProcess = result.operationDetails.reduce((s, o) => s + o.processCost, 0);
  const lcAdj = lc ? b.labour - opsLabour : 0;
  const tol = 0.005;
  const row = (what: string, a: number, bb: number) => [what, m(a), m(bb), m(a - bb), Math.abs(a - bb) <= tol ? 'OK' : 'MISMATCH'];
  const ck: unknown[][] = [
    ['ARITHMETIC CHECKS', `(${currency})`, '', '', ''],
    ['Check', 'Sheets', 'Engine', 'Difference', 'Result'],
    row('Buckets 1–8 add to the total', bucketSum, result.total),
    row('Operations\' process cost = bucket 2', opsProcess, b.process),
    row(`Operations' labour cost${lc ? ' + learning-curve adjustment' : ''} = bucket 3`, opsLabour + lcAdj, b.labour),
    row('Material rows = bucket 1', metalNet + consumables + energy + boughtIn, b.rawMaterial),
    row('Tooling: tool cost ÷ amortisation volume = bucket 4', input.tooling.mode === 'amortized' && input.tooling.amortizationVolume > 0
      ? input.tooling.totalToolingCost / input.tooling.amortizationVolume : 0, b.tooling),
    [],
  ];
  if (checks) {
    const fmtVal = (v: unknown): string => {
      if (v == null) return '';
      if (Array.isArray(v)) return `${v.length} item(s): ${v.slice(0, 6).map(x => typeof x === 'object' && x ? String((x as { operationName?: string; label?: string; name?: string }).operationName ?? (x as { label?: string }).label ?? (x as { name?: string }).name ?? '…') : String(x)).join('; ')}${v.length > 6 ? '; …' : ''}`;
      if (typeof v === 'object') return JSON.stringify(v).slice(0, 200);
      return String(v);
    };
    ck.push(
      ['STATUS', checks.costable ? 'COSTABLE' : 'NOT COSTABLE — blocking decision open or blocking check unacknowledged'],
      ['Geometry', checks.geometryQuality === 'occt' ? 'measured from CAD solid (OCCT)' : checks.geometryQuality === 'stl' ? 'measured from mesh (STL)' : checks.geometryQuality === 'text' ? 'NOT measured' : 'not recorded'],
      [],
      ['CONSISTENCY CHECKS'], ['Code', 'Severity', 'Blocking', 'Acknowledged', 'Finding'],
      ...(checks.sanity.length ? checks.sanity.map(w => [w.code, w.severity, w.blocking ? 'yes' : 'no', w.blocking ? (w.acknowledged ? 'yes' : 'NO') : '', w.message]) : [['none fired']]),
      [],
      ['DECISIONS'], ['Question', 'Severity', 'Answer'],
      ...(checks.decisions.length ? checks.decisions.map(d => [d.question, d.severity, d.answer ?? (d.severity === 'blocking' ? 'OPEN' : 'engine default')]) : [['none recorded']]),
      [],
      ['RULE-OWNED VALUES'], ['Field', 'Rule', 'Model said', 'Used', 'Basis'],
      ...checks.overrides.map(o => [o.field, o.ruleId, fmtVal(o.from), fmtVal(o.to), o.basis]),
    );
  }
  sheets.push({ name: '7-Checks', rows: ck, cols: [56, 18, 18, 14, 60] });

  return workbookBlob(await buildWorkbook(sheets));
}

// Legacy compat wrapper (called by old main.ts path)
export { exportToExcelBlob as exportToExcel };
