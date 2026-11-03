import { overallConfidence } from '../engine/uncertainty.js';
import { coverWarningText, decisionAnswerText, toolingAmortisationBasis } from './decision-text.js';
import { labourRoleLabel } from '../engine/labour-roles.js';
import { routeRowLabel, routeReferenceRow, traceFieldLabel, type RouteComparisonExport } from '../ui/cad-workspace.js';
import { shortOperationName, operationFeatureList } from '../engine/operation-names.js';
import { decisionAnswerLabel } from './decision-text.js';
import { COMMODITY_REPORT_LABELS } from '../ui/data/commodity-meta.js';
import { reportNoteText } from './money-text.js';
import type { ChecksAppliedMeta, CADReportMeta } from './pdf.js';
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType } from '../engine/types.js';
import { buildCoreReport } from './executive-summary.js';
import { normaliseSeverity, SEVERITY_LABEL } from '../engine/dfm-geometry/types.js';
import { breakdownPercentages, overheadBaseOf, overheadRateOf } from '../engine/core.js';
import { currencySymbol } from '../engine/insights.js';
import { buildWorkbook, workbookBlob, money, pctCell, type SheetSpec } from './xlsx-util.js';
import { localiseGbpText, localiseRuleValue, directMaterialBasis } from './money-text.js';
import { shopDefaultsBasis, deliveryTermsLine, type ManufacturingRegion, type RegionalComparisonRow } from '../engine/regional-rates.js';

const num4 = (n: number) => +n.toFixed(4);
/** Hours to 6 dp — at 4 dp a reader recomputing an operation from the sheet was out by up to £0.003. */
const hr6 = (n: number) => +n.toFixed(6);
/** Minutes with enough digits that a non-zero time never reads 0.00 (a die change is 0.0018 min a part). */
export const minutesCell = (min: number): number => (!(min > 0) ? 0 : min >= 0.01 ? +min.toFixed(3) : +min.toPrecision(2));
/** A traceability rate id as a report prints it — the direct-cost placeholder id is not a rate anyone can look up. */
export const traceRateIdText = (id: string | undefined): string =>
  id && /^mat-virtual/.test(id) ? 'material lines' : (id ?? '');

/**
 * The part weight the commodity's rules costed, read off the rule values the report carries — for a material line that
 * is not weight × price (composites buy fibre + resin as itemised lines, so `rawMaterial.netWeightKg` is 0 and the
 * placeholder material's density-1 mass is not the part's). Null when the rules did not set one.
 */
export function rulePartWeightKg(ruleValues: ReadonlyArray<{ label: string; value: string }> | null | undefined): number | null {
  const rv = (ruleValues ?? []).find(r => /^(cured |net |finished )?part weight\b/i.test(String(r.label).trim()));
  const v = rv ? Number(String(rv.value).replace(/[^0-9.]/g, '')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * A route row's material that is the direct-cost placeholder (composites: fibre + resin priced as itemised lines) —
 * its "0.000 kg for 0.000 kg (Virtual / Pass-through)" is not a mass anyone bought.
 */
export function isItemisedRouteMaterial(mt: { materialId?: string | null; label: string; netKg: number | null } | null | undefined): boolean {
  return !!mt && (/^mat-virtual/.test(mt.materialId ?? '') || /pass-through/i.test(mt.label) || mt.netKg === 0);
}
export const ITEMISED_MATERIAL_TEXT = 'priced by its itemised lines (not by weight)';

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
  /** The band the screen shows (casting 360 X30: the workbook had no band and no confidence grade). */
  band: { plusMinusPct: number; p10: number; p90: number; overallConfidence?: string } | null = null,
  /** The rate book, rules and kernel behind a CAD costing (CAD to COST v2) — printed under the country. */
  stamp: string | null = null,
  /** The route comparison the screen drew (compare-routes review, Oct 2026) — sheet 8, never re-run here. */
  routeComparison: RouteComparisonExport | null = null,
  /** Two isometric renders of the CAD model, placed beside the summary (the Director's request, 30 Oct 2026). */
  cadViews: Array<{ label: string; dataUrl: string }> | null = null,
  /** The commodity — lets the executive summary list the re-costed levers (Nov 2026). */
  commodity: CommodityType | null = null,
  /**
   * The CAD report metadata (the same object the PDF gets) and the country rows' basis: the first sheet is the CORE
   * report's model (report standard, Nov 2026) and sheet 9 lists the geometric DFM findings.
   */
  extras: { cadMeta?: Partial<CADReportMeta> | null; baseLibrary?: RateLibrary; regionalRows?: RegionalComparisonRow[] } | null = null,
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
    ...(stamp ? [['Reproducibility', stamp]] : []),
    ['Currency', currency === 'GBP' ? 'GBP' : `${currency} — 1 GBP = ${fxRate.toFixed(4)} ${currency} (the costing is held in GBP; every figure and note here is converted)`],
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
  sum.push(['Model confidence', band?.overallConfidence ?? overallConfidence(result)]);
  if (band) {
    sum.push(['Uncertainty band', `± ${band.plusMinusPct}%`, 'as shown on screen']);
    // The band is a simulated range, held to the penny in GBP: converted, it is rounded to the report currency's
    // penny so the cell does not carry the conversion's digits (CN P10 read 49.6392 beside 6-dp engine figures).
    const r2 = (gbp: number) => money(Math.round(gbp * fxRate * 100) / 100, sym);
    sum.push(['  P10 (optimistic)', r2(band.p10)], ['  P90 (conservative)', r2(band.p90)]);
  }
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
  sum.push(['Delivery terms', deliveryTermsLine(input.deliveryTerms)]);
  sum.push(['Overhead / packaging / logistics basis', shopDefaultsBasis(library.regional?.code as ManufacturingRegion | undefined, input.deliveryTerms)]);
  if (input.tooling.mode === 'amortized') {
    sum.push(['Total Tooling Cost', m(input.tooling.totalToolingCost)]);
    for (const t of input.tooling.items ?? []) sum.push([`  ${t.label}`, m(t.gbp)]);
    sum.push(['Amortisation Volume', input.tooling.amortizationVolume, 'parts']);
    sum.push(['Amortisation basis', toolingAmortisationBasis(input)]);
    if (input.annualVolume) sum.push(['Annual Volume', input.annualVolume, 'parts / year']);
    if (input.programmeYears) {
      const life = (input.annualVolume ?? 0) * input.programmeYears;
      sum.push(['Programme Life', input.programmeYears, `years (${life.toLocaleString('en-GB')} lifetime)`]);
      if (life > 0 && Math.abs(input.tooling.amortizationVolume - life) > 0.5) {
        sum.push(['NOTE', `Tooling is amortised over ${Math.round(input.tooling.amortizationVolume).toLocaleString('en-GB')} parts, not the programme lifetime`]);
      }
    }
  }
  const warnings = result.warnings ?? [];
  if (warnings.length) {
    sum.push([], ['── WARNINGS ON THIS COSTING ──'], ...warnings.map(w => [shortOperationName(coverWarningText(w))]));
  }

  sheets.push({ name: '1-Summary', rows: sum, cols: [58, 18, 12] });

  // ── Sheet 0: the CORE should-cost report — the same model as the core PDF (executive-summary.ts buildCoreReport), FIRST ──
  try {
    const meta = { ...(extras?.cadMeta ?? {}), ...(band ? { uncertainty: band as never } : {}), ...(stamp ? { stamp } : {}),
      ...(routeComparison ? { routeComparison } : {}), checks: (extras?.cadMeta?.checks ?? checks) ?? null };
    const cr = buildCoreReport({ result, input, library, commodity, region: library.regional?.code ?? 'UK', cadMeta: meta as never,
      baseLibrary: extras?.baseLibrary, regionalRows: extras?.regionalRows, fx: fxRate, sym });
    const whole = (gbp: number) => money(Math.round(gbp * fxRate), sym);
    const t = cr.tooling;
    const pr = cr.price;
    const core: unknown[][] = [
      ['SHOULD-COST REPORT — CORE (the same seven sections as the core PDF; the other sheets are the audit detail)'],
      ['Part', cr.part],
      ...(cr.commodity ? [['Commodity', cr.commodity]] : []),
      ['Country', cr.country],
      ...(cr.stamp ? [['Reproducibility stamp', cr.stamp]] : []),
      [],
      ['── 1. DECISION ──'],
      ['Verdict', cr.verdict],
      ['Should-cost a part', m(cr.total), currency],
      ...(cr.band ? [['  P10 – P90', money(Math.round(cr.band.p10 * fxRate * 100) / 100, sym), money(Math.round(cr.band.p90 * fxRate * 100) / 100, sym)],
        ['  Band', `± ${cr.band.plusMinusPct}% — ${cr.bandNote}`]] : []),
      ...(cr.annualSpend != null ? [['A year at this volume', m(cr.annualSpend), `${(cr.annualVolume ?? 0).toLocaleString('en-GB')} a year`]] : []),
      ['Piece price as quoted', m(pr.pieceAsQuotedGbp), pr.mode === 'amortized' ? 'replacement sets and tool wear inside it; the up-front tooling out (the stack re-run)' : 'the headline'],
      ['Up-front tooling (lump sum)', pr.upfrontGbp > 0.5 ? whole(pr.upfrontGbp) : 'none',
        pr.unsplitCountedUpfront ? 'first sets, fixtures, programming — incl. tooling not split into sets' : 'first sets, fixtures, programming and masters'],
      ['  of which tool replacement & wear a part', m(pr.runningPerPartGbp), 'with its overhead and margin — inside the piece price'],
      ...(pr.mode === 'amortized' && pr.upfrontFactor != null ? [['  Re-add', `piece price + up-front ÷ ${Math.round(pr.amortisationVolume).toLocaleString('en-GB')} parts × ${pr.upfrontFactor.toFixed(4)} (its overhead and margin)`,
        m(pr.pieceAsQuotedGbp + pr.upfrontGbp / pr.amortisationVolume * pr.upfrontFactor), '= should-cost']] : []),
      ...(pr.toolWearInMaterialGbp > 0 ? [['  Cutting-tool wear in material (bucket 1)', m(pr.toolWearInMaterialGbp), 'a consumable where the costing puts it — inside the piece price too']] : []),
      ['Confidence', cr.confidence.grade, cr.confidence.sentence],
      ...(cr.confidence.gradeNote ? [['  Why the screen differs', cr.confidence.gradeNote]] : []),
      ...cr.confidence.lowInputs.map(l => ['  Low input', l.label, `${l.unit.includes('£') ? `${sym}${(l.value * fxRate).toFixed(4)}${l.unit.replace('£', '')}` : `${l.value} ${l.unit}`}${l.operations > 1 ? ` (${l.operations} operations)` : ''}`]),
      ['Resting on figures labelled "not sourced" / "engineering-typical" / "held" / ESTIMATE', m(cr.unsourced.totalGbp), pc(cr.unsourced.sharePct)],
      ['  Not in this share', cr.unsourced.defaultsNote],
      ...cr.alerts.flatMap(al => [[`ALERT — ${al.title}`], ...al.lines.map(l => [`  ${l}`])]),
      ...(cr.openQuestions.length ? [['Open questions'], ...cr.openQuestions.map(q => [`  ${q}`])] : []),
      ['Not included until answered'], ...cr.notIncluded.map(n => [`  ${n}`]),
      ...(cr.notModelled.length ? [['Not in the cost model (a supplier will charge it)'], ...cr.notModelled.map(n => [`  ${n}`])] : []),
      [],
      ['── 2. COST BUILD-UP ──'],
      ['Bucket', `A part (${currency})`, 'Share'],
      ...cr.buckets.map(bk => [bk.label, m(bk.gbp), pc(bk.sharePct)]),
      ['Should-cost', m(cr.total), pc(100)],
      [],
      ['Material split (bucket 1)', `A part (${currency})`, 'Group'],
      ...cr.material.lines.map(l => [l.label, m(l.gbp), ({ metal: 'metal', direct: 'material', consumable: 'consumables & services', energy: 'energy', boughtIn: 'bought-in' } as Record<string, string>)[l.group]]),
      ['Material total = bucket 1', m(cr.material.totalGbp), `metal ${sym}${(cr.material.metalGbp * fxRate).toFixed(2)} · consumables & services ${sym}${(cr.material.consumablesGbp * fxRate).toFixed(2)} · energy ${sym}${(cr.material.energyGbp * fxRate).toFixed(2)}`],
      ...(cr.formMachine ? [
        [`${cr.formMachine.form} ex-${cr.formMachine.form === 'Casting' ? 'foundry' : 'forge'} a part`, m(cr.formMachine.formGbp), 'with its overhead and margin'],
        [`${cr.formMachine.form} a kg (${cr.formMachine.kgLabel}, ${cr.formMachine.kg.toFixed(3)} kg)`, m(cr.formMachine.formPerKg), 'ex-works price ÷ kg'],
        ['Machining a part', m(cr.formMachine.machiningGbp), `(${cr.formMachine.machiningParts.join(' + ')}) × overhead and margin`],
      ] : cr.perKg ? [[`Price a kg (${cr.perKg.kgLabel}, ${cr.perKg.kg.toFixed(3)} kg)`, m(cr.perKg.pricePerKg), 'should-cost ÷ kg']] : []),
      ...(cr.perKg ? [[`Metal a kg (${cr.perKg.kgLabel})`, m(cr.perKg.metalPerKg), 'metal line ÷ kg']] : []),
      [],
      ...(t.totalGbp > 0 ? [
        ['Tooling item', `Over the programme (${currency})`, 'First set / NRE', 'Replacements', 'Perishable', 'Split read from'],
        ...t.rows.map(r => [r.label, m(r.gbp), m(r.initialGbp), m(r.replacementGbp), m(r.perishableGbp), r.basis]),
        ['Tooling total', m(t.totalGbp), m(t.initialGbp), m(t.replacementGbp), m(t.perishableGbp), `÷ ${Math.round(t.amortisationVolume).toLocaleString('en-GB')} parts = bucket 4`],
        [],
      ] : []),
      ['Commercial basis', 'Value', 'Source'],
      ...cr.commercial.map(c2 => [c2.label, c2.value, c2.source]),
      [],
      ['── 3. PROCESS ──'],
      ...(cr.spec.length ? [['Specification costed to', 'Answer'], ...cr.spec.map(sp => [sp.question, sp.answer]), []] : []),
      ['Operation', 'Machine class', 'Cycle (min)', 'Parts / cycle', 'OEE', 'Crew charged', `Machine (${currency}/h)`, `Labour (${currency}/h)`, `A part (${currency})`],
      ...cr.operations.map(op => [op.name, op.machine, minutesCell(op.cycleMin), op.partsPerCycle, op.oee == null ? '—' : op.oee, +op.crewCharged.toFixed(3),
        op.machinePerHr == null ? '—' : m(op.machinePerHr), m(op.labourPerHr), m(op.gbp)]),
      ['A part = cycle ÷ 60 ÷ parts a cycle × (machine ÷ OEE + labour); labour = labour rate × crew charged ÷ labour efficiency; before overhead and margin'],
      [],
      ...(cr.capacity && cr.capacity.rows.length ? [['Capacity implied', 'Operations', 'Hours a year', 'Available h / machine', 'Machines'],
        ...cr.capacity.rows.map(r => [r.machine, r.operations, Math.round(r.hoursPerYear), r.availableHours, +r.machines.toFixed(2)]), [cr.capacity.formula],
        ...cr.capacity.warnings.map(w => [`WARNING — ${w}`]), []] : []),
      ...(cr.keyParams.length ? [['Key process parameter', 'Costed', 'Basis'], ...cr.keyParams.map(kp => [kp.name, kp.display, kp.basis]), []] : []),
      ['── 4. WHAT MOVES THE PRICE ──'],
      ['Figure labelled "not sourced" / "engineering-typical" / "held" / ESTIMATE', 'Costed', `A part (${currency})`, 'Basis'],
      ...cr.unsourced.items.map(i => [i.label, i.value, i.gbp == null ? 'moves the whole cost' : m(i.gbp), i.basis]),
      ['Counted once', '', m(cr.unsourced.totalGbp), `${cr.unsourced.sharePct}% of the price, before overhead and margin`],
      [cr.unsourced.defaultsNote],
      [],
      [`Top movers (± ${cr.sensitivityPct}%, the cost re-run; < 0.5 % or a zero base left out)`, `−${cr.sensitivityPct}% (${currency} a part)`, `+${cr.sensitivityPct}% (${currency} a part)`],
      ...cr.sensitivity.map(sv => [sv.label, m(sv.minusGbp), m(sv.plusGbp)]),
      ...(cr.volumeLine ? [['Volume', cr.volumeLine]] : []),
      [],
      ['── 5. SUPPLIER NEGOTIATION ──'],
      ['Driver', 'Our value', 'Question to ask'],
      ...cr.negotiation.map(n => [n.driver, n.ours, n.question]),
      [],
      ['Ask the supplier to break the quotation down into'], ...cr.quoteBreakdown.map(q => [`  ${q}`]),
      [],
      ...(cr.levers.length ? [['Re-costed lever', `Saves a part (${currency})`, 'Re-costed on'], ...cr.levers.map(l => [l.action, m(l.savingGbp), l.basis])] : [['No lever could be re-costed for this part.']]),
      [],
      ['── 6. ALTERNATIVES ──'],
      ...(cr.routes ? [[`Route comparison — reference: ${cr.routes.reference}`, `A part (${currency})`, `vs this costing (${currency})`, 'vs this costing %', `Up-front tooling — first set (${currency})`, `Tooling over the programme (${currency})`],
        ...cr.routes.rows.map(r => [r.name, m(r.total), m(r.deltaGbp), pc(r.deltaPct), r.toolingGbp != null ? m(r.toolingGbp) : '—', r.toolingProgrammeGbp != null ? m(r.toolingProgrammeGbp) : '—']),
        [`${cr.routes.notShown} other route(s) not feasible, needing an answer, or more than +50 % — see 8-Routes`]] : [['Route comparison not run on this costing']]),
      [],
      ['Country', `A part (${currency})`, 'vs base %'],
      ...cr.countries.rows.map(r => [r.name, m(r.total), r.isBase ? 'base' : pc(-r.vsBasePct)]),
      [cr.countries.basis],
      [cr.countries.note],
      [],
      ['── 7. DESIGN TO COST ──'],
      ...(cr.dfm.findings.length ? [['Finding', 'Severity', 'In this costing', 'Fix'], ...cr.dfm.findings.map(f => [`${f.title}${f.count > 1 ? ` (${f.count})` : ''}`, f.severity, f.amount ?? 'not re-costed', f.fix])] : []),
      [cr.dfm.notChecked],
      [],
      ['Prepared by', ''], ['Reviewed by', ''], ['Approved by', ''],
    ];
    sheets.unshift({ name: '0-Executive', rows: core, cols: [62, 22, 40, 16, 16, 22, 16, 16, 16] });
  } catch (e) { console.warn('[excel] core report sheet not built:', e); /* the workbook is unaffected */ }

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
      ['Material basis', placeholder
        ? ((rm.lines ?? []).length ? 'Priced by its itemised lines below (not weight × price per kg)' : 'Supplied / bought-in price — no weight-based material')
        : (mat?.grade ?? rm.materialId), '', ''],
      ['Direct material cost', m(metalNet), currency, directMaterialBasis(rm.lines)],
    );
    const partKg = rm.netWeightKg > 0 ? rm.netWeightKg : rulePartWeightKg(checks?.ruleValues);
    if (partKg) matDetail.push(['Costed part weight', num4(partKg), 'kg', 'the part weight the commodity rules costed — the material is priced by its itemised lines, not weight × price per kg']);
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
      ['Grade / Description', mat?.grade ?? rm.materialId, '', reportNoteText(mat?.sourceNote)],
      ['Costed Net Weight', num4(rm.netWeightKg), 'kg', 'the weight the material line is costed on — the finished part plus any machining stock or reject allowance the module carries'],
      ['Gross Weight (material bought)', num4(gross), 'kg', '= net ÷ utilisation'],
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
    'Operation', 'Measured features', 'Machine ID', 'Machine Class', 'Machine Rate (/hr)', 'Cycle Time (hr)', 'Cycle Time (min)',
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
      shortOperationName(op.operationName),
      operationFeatureList(op.operationName) ?? '',
      bench ? '— bench (no machine time)' : op.machineId,
      bench ? '' : mach?.machineClass ?? '—',
      bench ? '' : m(op.machineRateUsed),
      hr6(op.cycleTimeHr),
      minutesCell(op.cycleTimeHr * 60),
      op.partsPerCycle,
      bench ? '' : pctCell(op.oee),
      bench ? '' : hr6(op.cycleTimeHr / op.oee),
      m(op.processCost),
      untended ? '— untended' : labourRoleLabel(op.labourId),
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
  // Summary rows are placed BY HEADER NAME — a count of blanks put the TOTAL one column left of its headers when the
  // 'Measured features' column was added (labour total under "Labour Efficiency"; report review, Nov 2026).
  const byHeader = (cells: Record<string, unknown>): unknown[] => {
    for (const k of Object.keys(cells)) if (!opHdr.includes(k)) throw new Error(`3-Operations has no column '${k}'`);
    return opHdr.map(h => (h in cells ? cells[h] : ''));
  };
  if (lc && Math.abs(b.labour - opsLabour) >= 0.00005) {
    // The operations' labour is costed before Wright's law; the bucket after it.
    opRows.push(byHeader({
      'Operation': `Learning-curve adjustment (${lc.curvePct}% curve, ×${lc.adjustmentFactor.toFixed(4)} on labour)`,
      'Labour Cost': m(b.labour - opsLabour), 'Op Total': m(b.labour - opsLabour),
    }));
  }
  opRows.push(byHeader({
    'Operation': 'TOTAL',
    'Process Cost': m(b.process),
    'Labour Cost': m(b.labour),
    'Op Total': m(b.process + b.labour),
    '% of Total': pctCell((b.process + b.labour) / result.total),
  }));

  sheets.push({ name: '3-Operations', rows: opRows, cols: [
    40, 30, 22, 16, 14, 14, 10, 8, 8, 14, 14, 18, 20, 14, 9, 14, 14, 14, 14, 10,
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
  // The roles THIS costing used, priced in its country — printed by role, not by library key; the "all available
  // labour rates" list (blow, roto, SMT operators on a casting) is not printed (casting 360 review, Oct 2026).
  const labHdr: string[] = ['Labour role', 'Region', 'Skill Level', 'Fully Loaded Rate (/hr)', 'Effective Date', 'Source', 'Confidence'];
  const labRows: unknown[][] = [labHdr];
  const usedLabIds = new Set(result.operationDetails.filter(o => o.labourTimeHr > 0).map(op => op.labourId));
  for (const lab of library.labour.filter(l => usedLabIds.has(l.id))) {
    labRows.push([labourRoleLabel(lab.id), lab.region, lab.skillLevel, m(lab.fullyLoadedRatePerHr), lab.effectiveDate, reportNoteText(lab.sourceNote), lab.confidence]);
  }
  sheets.push({ name: '5-LabourRates', rows: labRows, cols: [22, 14, 20, 20, 14, 50, 12] });

  // ── Sheet 6: Rate Traceability (money in the report's currency, like every other sheet) ──
  const trHdr: string[] = ['Field', 'Value', 'Unit', 'Rate Source / Reference', 'Rate ID', 'Confidence'];
  const trRows: unknown[][] = [trHdr];
  for (const t of trace) {
    const isMoney = t.unit.includes('£');
    trRows.push([traceFieldLabel(shortOperationName(t.field)), isMoney ? m(t.value) : num4(t.value), isMoney ? t.unit.replace('£', sym) : t.unit, reportNoteText(t.rateSource), /^lab-/.test(t.rateId ?? '') ? labourRoleLabel(t.rateId) : traceRateIdText(t.rateId), t.confidence]);
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
      ...(checks.decisions.length ? checks.decisions.map(d => [d.question, d.severity, decisionAnswerText({ ...d, answer: decisionAnswerLabel(d.id ?? '', d.answer, { routeLabels: COMMODITY_REPORT_LABELS, grades: library.materials }) })]) : [['none recorded']]),
      [],
      ['VALUES THE RULES SET'], ['Field', 'Costed', 'Rule value', 'Source', 'Basis'],
      ...(checks.ruleValues?.length
        ? checks.ruleValues.map(r => {
          const lv = localiseRuleValue(r.label, String(r.value), fxRate, sym), rv = localiseRuleValue(r.label, String(r.ruleValue), fxRate, sym);
          return [lv.label, r.edited ? `${lv.value} (edited)` : lv.value, rv.value, r.source, r.basis];
        })
        : [['none recorded']]),
      [],
      ['MODEL VALUES OVERWRITTEN BY A RULE'], ['Field', 'Rule', 'Model said', 'Used', 'Basis'],
      ...(checks.overrides.length ? checks.overrides.map(o => [o.field, o.ruleId, fmtVal(o.from), fmtVal(o.to), o.basis])
        : [['none — no model value was used (deterministic rules)']]),
    );
  }
  sheets.push({ name: '7-Checks', rows: ck, cols: [56, 18, 18, 14, 60] });

  // ── Sheet 8: Route comparison — the screen's rows, each with its buckets, the independent re-add, its spec, band and ladder ──
  if (routeComparison && routeComparison.rows.length) {
    const x = routeComparison;
    const name = (r: { route: string; process: string | null; label: string }) => routeRowLabel(r, x.labels);
    const refRow = routeReferenceRow(x);
    const ref = refRow?.total ?? null;
    const rr: unknown[][] = [
      ['ROUTE COMPARISON', `(${currency})`],
      [x.principle],
      [`Programme view: ${x.programme.annualVolume.toLocaleString('en-GB')} a year over ${x.programme.years} years${x.programme.yearsAssumed ? ' (5 years assumed — no programme life given)' : ''}.`],
      [],
      ['Route · process', 'Status', 'Cost / part', 'Band P10', 'Band P90', '± %', 'vs reference', 'Material', 'Process', 'Labour', 'Tooling', 'Packaging', 'Logistics', 'Overhead', 'Margin', 'Buckets add up', 'Independent re-add', 'Grade costed', 'Net kg', 'Bought kg', 'Utilisation', 'Tooling over programme', 'Amortised over', 'Programme spend', 'Basis'],
      ...x.rows.map(r => [
        `${name(r)}${r === refRow ? ' (this costing)' : ''}`, r.status,
        r.total != null ? m(r.total) : '—',
        r.band ? m(r.band.p10) : '', r.band ? m(r.band.p90) : '', r.band ? pctCell(r.band.plusMinusPct / 100) : '',
        r === refRow ? 'reference' : r.total != null && ref != null ? m(r.total - ref) : '—',
        ...['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'].map(k => (r.breakdown ? m(r.breakdown[k] ?? 0) : '—')),
        r.reconciles == null ? '' : r.reconciles ? 'OK' : 'MISMATCH',
        r.audit ? (r.audit.closes ? 'CLOSES' : 'OPEN') : '',
        ...(isItemisedRouteMaterial(r.material) ? [ITEMISED_MATERIAL_TEXT, '', '', '']
          : [r.material?.label ?? '', r.material?.netKg ?? '', r.material?.boughtKg ?? '', r.material?.utilisation != null ? pctCell(r.material.utilisation) : '']),
        r.tooling ? m(r.tooling.investment) : '', r.tooling?.amortisedOver ?? '', r.programme ? m(r.programme.total) : '',
        [...(r.commodity && r.commodity !== r.route ? [`costed as ${x.labels[r.commodity] ?? r.commodity}`] : []), ...r.assumed.map(a => `assumed: ${a}`), ...r.openQuestions.map(q => `needs an answer: ${q}`), ...(r.refusal ? [`not costed: ${r.refusal}`] : []), ...r.notes, ...r.caveats].join('; '),
      ]),
      [],
    ];
    const specLabels = [...new Set(x.rows.flatMap(r => r.spec.map(sp => sp.label)))];
    if (specLabels.length) {
      rr.push(['SPECIFICATION EACH ROW WAS COSTED TO — answered by the engineer · assumed from the question\'s leaning · chosen by the comparison · not read on this route'],
        ['Route · process', ...specLabels],
        ...x.rows.map(r => [name(r), ...specLabels.map(l => { const sp = r.spec.find(s2 => s2.label === l); return sp ? `${sp.value} (${sp.source})` : '—'; })]), []);
    }
    if (x.ladder.length) {
      rr.push(['COST A PART BY ANNUAL VOLUME — each figure is a re-cost at that volume with its P10–P90 band; a crossover is interpolated between two re-costs; where bands overlap the routes are indistinguishable'],
        ['Route · process', ...x.ladder.flatMap(v => [`${v.toLocaleString('en-GB')} / yr`, 'P10', 'P90']), 'Crossover'],
        ...x.rows.filter(r => r.byVolume.length).map(r => [name(r),
          ...x.ladder.flatMap(v => { const p = r.byVolume.find(b => b.volume === v); return [p?.total != null ? m(p.total) : '—', p?.p10 != null ? m(p.p10) : '', p?.p90 != null ? m(p.p90) : '']; }),
          x.crossovers.find(k => k.route === r.route && k.process === r.process)?.text ?? (r === refRow ? 'reference' : '')]),
        []);
    }
    rr.push(['INDEPENDENT RE-ADD — recomputed from the rates and times the engine recorded, never by running the engine again'], ['Route · process', 'Line', 'How', 'Re-added', 'Engine', 'Closes']);
    for (const r of x.rows) for (const ln of r.audit?.lines ?? []) rr.push([name(r), ln.line, ln.how, m(ln.recomputed), m(ln.reported), ln.closes ? 'yes' : 'NO']);
    rr.push([], ['OPERATIONS BY ROUTE'], ['Route · process', 'Operation', 'Machine class', 'Cycle (min)', 'Process', 'Labour']);
    for (const r of x.rows) for (const op of r.operations ?? []) rr.push([name(r), op.name, op.machine, op.bench ? '' : minutesCell(op.cycleMin), m(op.processCost), m(op.labourCost)]);
    rr.push([], ['FEASIBILITY — every route and process with rules, the checks it passed or failed, and the source of each limit'], ['Route · process', 'Feasible', 'Check', 'Measured', 'Limit', 'Pass', 'Source']);
    for (const r of x.rows) for (const ck of r.checks) rr.push([name(r), 'yes', ck.label, ck.measured, ck.limit, ck.pass ? 'pass' : 'fail', ck.source]);
    for (const e of x.excluded) for (const ck of e.reasons) rr.push([name(e), 'no', ck.label, ck.measured, ck.limit, 'fail', ck.source]);
    sheets.push({ name: '8-Routes', rows: rr, cols: [30, 12, 12, 11, 11, 7, 12, 11, 11, 11, 11, 11, 11, 11, 11, 10, 12, 26, 9, 9, 10, 14, 12, 14, 70] });
  }

  // ── Sheet 9: the geometric DFM findings (every rule group, with faces and sources) — when a DFM job has completed ──
  const gd = extras?.cadMeta?.geometricDFM;
  if (gd) {
    const amt = extras?.cadMeta?.geometricDFMAmounts ?? {};
    const dfmRows: unknown[][] = [
      ['GEOMETRIC DFM — measured from the CAD model'],
      [`${gd.grouped.length} rule group(s) across ${gd.findings.length} instance(s), from ${gd.featuresExamined} measured feature(s)`],
      [],
      ['Rule', 'Severity', 'Finding', 'Instances', 'In this costing', 'Worst', 'Measured range', 'Limit', 'Fix', 'Not priced because', 'Source', 'Faces'],
      ...gd.grouped.map(gr => [gr.ruleId, SEVERITY_LABEL[normaliseSeverity(gr.severity, (gr.totalCostGBP ?? 0) > 0)], gr.title, gr.count, amt[gr.ruleId]?.text ?? ((gr.totalCostGBP ?? 0) > 0 ? 'not re-costed' : ''),
        gr.worst?.detail ?? '', gr.range ? `${gr.range.min} – ${gr.range.max} ${gr.range.unit}` : '', gr.threshold ? `${gr.threshold.comparator} ${gr.threshold.value} ${gr.threshold.unit}` : '',
        gr.recommendation, gr.costNotModelled ?? '', [gr.source.standard, gr.source.clause].filter(Boolean).join(' — '), (gr.faceIds ?? []).join(', ')]),
      [],
      ['What was NOT checked'], ...gd.limitations.map(l => [l]),
    ];
    sheets.push({ name: '9-DFM', rows: dfmRows, cols: [34, 10, 40, 10, 16, 40, 18, 14, 50, 30, 30, 30] });
  }

  // Every £ amount in the text of a non-£ workbook (rule bases, rate sources, notes) in the workbook's currency
  // (demo review 2026-10-10: a China workbook read "die £3,056" and "capex £22,394" beside ¥ totals).
  if (currency !== 'GBP') {
    for (const sh of sheets) sh.rows = sh.rows.map(row => row.map(c => (typeof c === 'string' ? localiseGbpText(c, fxRate, sym) : c))) as typeof sh.rows;
  }
  const blob = await workbookBlob(await buildWorkbook(sheets));
  return cadViews?.length ? embedCadViews(blob, cadViews) : blob;
}

/**
 * The summary sheet carries the two CAD views beside the figures. The workbook is built by SheetJS, which cannot embed
 * a picture, so the finished file is re-opened with ExcelJS (the PCB workbook's library) and the images are added to
 * `1-Summary`; every cell, formula and width round-trips. If anything fails the workbook is returned without pictures.
 */
async function embedCadViews(blob: Blob, views: Array<{ label: string; dataUrl: string }>): Promise<Blob> {
  try {
    const mod = await import('exceljs');
    const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet('1-Summary');
    if (!ws) return blob;
    const W = 400, H = 300;   // px on the sheet; the picture itself is HD (1920 × 1440)
    views.slice(0, 2).forEach((v, i) => {
      const ext = /^data:image\/png/.test(v.dataUrl) ? 'png' : 'jpeg';
      const id = wb.addImage({ base64: v.dataUrl.replace(/^data:image\/\w+;base64,/, ''), extension: ext });
      const col = 5 + i * 7;   // F and M
      ws.getCell(1, col).value = `CAD model — ${v.label}`;
      ws.getCell(1, col).font = { bold: true, size: 9 };
      ws.addImage(id, { tl: { col: col - 1, row: 1 }, ext: { width: W, height: H }, editAs: 'oneCell' });
    });
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch {
    return blob;
  }
}

// Legacy compat wrapper (called by old main.ts path)
export { exportToExcelBlob as exportToExcel };
