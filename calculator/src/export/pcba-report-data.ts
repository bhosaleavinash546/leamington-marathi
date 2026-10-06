/**
 * The should-cost report for a populated board costed from the PCB photo analysis.
 *
 * The 360° camera board report (6 Oct 2026, £15.68) went through the generic report body,
 * which is written for a machined or cast part: "Commodity: PCB FAB", "Region: UK" for a
 * board built in China, "Net weight 0.000 kg", a "Virtual / Pass-through" material
 * placeholder, empty operations and machine-rate tables, a regional table that rescaled
 * the pass-through and showed China at £1.79 (the headline IS China at £15.68), zero
 * carbon, "tooling carries the widest spread" with no tooling, "excludes duty and freight"
 * when both are in the figure, and metal/resin indexation advice.
 *
 * This module turns the analysis (every figure from the server's deterministic Stage 4)
 * into the report's content. It computes no price: it moves the analysis's figures into
 * rows and states where each came from. Pure (no DOM, no jsPDF) so it is tested directly.
 */

export interface PcbaLineLike {
  refDes?: string; componentType?: string; description?: string; partNumber?: string; pkg?: string; value?: string;
  qty?: number; unitPriceGBP?: number; priceSource?: string; livePriced?: boolean; catalogueConfidence?: string;
  bomSource?: string; fromImage?: boolean; needsVerification?: boolean; notFitted?: boolean;
}
export interface PcbaBreakdownLike {
  countryId: string; countryName: string;
  pcbFabPerBoard: number; assemblyPerBoard: number; logisticsPerBoard: number; bomCostPerBoard: number; totalPerBoard: number;
  leadTimeWeeks?: number; qualityIndex?: number;
  automotiveGrade?: { asil: string; fabPremiumGBP: number; assemblyPremiumGBP: number };
  breakdown?: {
    pcbBase?: number; pcbLayers?: number; pcbSurface?: number; pcbVias?: number; pcbHDI?: number; pcbSetup?: number; pcbCopper?: number; pcbImpedance?: number;
    automotiveFab?: number; automotiveAssembly?: number; smtAssembly?: number; thAssembly?: number; aoi?: number;
    materialBurden?: number; materialBurdenPct?: number; logistics?: number; importDuty?: number; energy?: number; packaging?: number; yieldLoss?: number;
  };
  panelInfo?: { boardsPerPanel: number; utilisation: number; panelW: number; panelH: number };
}
export interface PcbaAnalysisLike {
  partName?: string;
  boardSpec?: Record<string, unknown>;
  assembly?: Record<string, unknown>;
  bom: PcbaLineLike[];
  analysisLimitations?: string[];
  stage1Classification?: { domain?: string; classifierDomain?: string };
  _selectedCountryBreakdown?: PcbaBreakdownLike;
  _countryComparison?: PcbaBreakdownLike[];
  _confidenceBand?: { totalLow: number; totalMid: number; totalHigh: number; overallLabel: string; unconfirmedHighValueCount?: number };
  _sanityWarnings?: Array<{ code: string; message: string; severity: string }>;
  _asilLevel?: string; _asilClaimed?: string; _asilNotes?: string[]; _asilRationale?: string; _asilSafetyFunctions?: string[];
  _boardFunction?: string;
  _automotiveNRE?: { ppapCost: number; fmeaCost: number; dvprCost: number; asilAuditCost: number; totalNRE: number; asilLevel: string };
  _orderQty?: number;
}

export type PcbaStackKey = 'components' | 'burden' | 'fab' | 'autoFab' | 'asm' | 'test' | 'autoAsm' | 'other' | 'rounding' | 'exWorks' | 'freight' | 'duty' | 'delivered';
export interface PcbaStackRow { key: PcbaStackKey; label: string; amount: number; basis: string; kind?: 'sub' | 'total' }
export interface PcbaBomRow { ref: string; description: string; partNumber: string; pkg: string; qty: number; unit: number; ext: number; source: string; verify: boolean }
export interface PcbaCountryRow { id: string; name: string; components: number; fab: number; assembly: number; other: number; logistics: number; exWorks: number; total: number; delta: number; leadWeeks?: number; selected: boolean }

export interface PcbaReport {
  partName: string;
  country: string;
  countryId: string;
  annualVolume: number | null;
  total: number;
  /** Factory gate, packed — the total less freight and UK duty. */
  exWorks: number;
  basis: string;
  domainLabel: string;
  /** Headline chips: components / board / assembly / logistics shares. */
  shares: Array<{ label: string; amount: number; pct: number }>;
  stack: PcbaStackRow[];
  bom: PcbaBomRow[];
  bomPieces: number;
  bomTotal: number;
  /** The sourced components bucket the lines reconcile to (before the EMS burden). */
  componentsAtCost: number;
  sourcingFactor: number;
  bomReconciliation: string;
  sourceKey: string;
  boardRows: Array<[string, string]>;
  countries: PcbaCountryRow[];
  confidence: { label: string; low: number; high: number; verifyCount: number; verifyValue: number } | null;
  safety: { costed: string; claimed: string | null; notes: string[]; rationale: string; functions: string[]; qualityGrade: string } | null;
  nre: Array<[string, number]>;
  nreTotal: number;
  /** Deterministic findings: what drives the cost and where to look. */
  drivers: string[];
  /** Where the parts list came from. */
  bomOrigin: 'BOM file' | 'BOM image' | 'photos';
  warnings: string[];
  limitations: string[];
  excluded: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The short source label printed on each BOM line — what priced it. */
export function priceSourceLabel(l: PcbaLineLike): string {
  if (l.notFitted || l.priceSource === 'not-fitted') return 'not fitted';
  if (l.livePriced) return 'distributor (live)';
  switch (l.priceSource) {
    case 'catalogue': return l.catalogueConfidence === 'distributor' ? 'catalogue (distributor)' : 'catalogue (estimate)';
    case 'known-range': return 'named-part range';
    case 'function-range': return 'function range';
    case 'class-range': return 'class range';
    case 'user': return 'engineer';
    default: return 'estimate';
  }
}

/** A designator, or what the line is when the BOM gives none. */
function refOf(l: PcbaLineLike): string {
  // A designator is letters + a number (R1, C10-C20, U3). A BOM whose first column is a category
  // ("Capacitor", "Integrated circuit") has none — that is not printed as one.
  const ref = String(l.refDes ?? '').trim();
  if (ref && /\b[A-Z]{1,4}\d+/i.test(ref)) return ref.length > 18 ? `${ref.slice(0, 16)}…` : ref;
  return '';
}

export function buildPcbaReport(a: PcbaAnalysisLike, opts: { partName?: string; annualVolume?: number | null; qualityGrade?: string | null; fmt?: (gbp: number) => string } = {}): PcbaReport {
  /** Money in the report's display currency (figures are held in £). */
  const money0 = opts.fmt ?? gbp;
  /** Thousands separated: "£16,200.00", not "£16200.00". */
  const money = (n: number) => money0(n).replace(/\d{4,}(?=\.\d\d)/, m => Number(m).toLocaleString('en-GB'));
  const bd = a._selectedCountryBreakdown;
  if (!bd || !(bd.totalPerBoard > 0)) throw new Error('The PCB analysis has no country breakdown — run Analyze first.');
  const b = bd.breakdown ?? {};
  const country = bd.countryName || bd.countryId;
  const qty = opts.annualVolume ?? a._orderQty ?? null;

  // ── Cost stack: every row a field of the server's breakdown; the rows sum to the headline.
  const burden = num(b.materialBurden);
  const burdenPct = num(b.materialBurdenPct);
  const componentsAtCost = r2(bd.bomCostPerBoard - burden);
  const autoFab = num(b.automotiveFab), autoAsm = num(b.automotiveAssembly);
  const fabStd = r2(bd.pcbFabPerBoard - autoFab);
  const test = num(b.aoi);
  const asmStd = r2(bd.assemblyPerBoard - autoAsm - test);
  const duty = num(b.importDuty);
  const energy = num(b.energy), pack = num(b.packaging), yieldLoss = num(b.yieldLoss);
  const stack: PcbaStackRow[] = [
    { key: 'components', label: 'Components (as the EMS buys them)', amount: componentsAtCost, basis: `${a.bom.length} BOM lines at ${country} sourcing — see §3` },
    ...(burden > 0 ? [{ key: 'burden' as const, label: `EMS material burden (${Math.round(burdenPct * 100)}%)`, amount: burden, basis: 'Procurement, inventory, scrap and margin on material — stated rate by volume' }] : []),
    { key: 'fab', label: 'Bare PCB fabrication', amount: fabStd, basis: 'Fabricator price: base, layers, finish, vias, set-up — see §4' },
    ...(autoFab > 0 ? [{ key: 'autoFab' as const, label: 'Automotive fab grade', amount: autoFab, basis: 'IATF 16949 line, automotive laminate, class 3 inspection, coupons' }] : []),
    { key: 'asm', label: 'SMT / THT assembly', amount: asmStd, basis: 'Placements and joints at the country line rate' },
    { key: 'test', label: 'Test & inspection', amount: test, basis: 'AOI, X-ray, ICT (station time + fixture over the order)' },
    ...(autoAsm > 0 ? [{ key: 'autoAsm' as const, label: 'Automotive assembly grade', amount: autoAsm, basis: 'IATF line, class 3 workmanship, serialisation' + (/ASIL-[CD]/.test(String(bd.automotiveGrade?.asil)) ? ', burn-in' : '') }] : []),
    ...(energy + pack + yieldLoss > 0 ? [{ key: 'other' as const, label: 'Energy, packaging, cost of quality', amount: r2(energy + pack + yieldLoss), basis: `Energy ${money(energy)} · ESD packaging ${money(pack)} · rework/scrap ${money(yieldLoss)}` }] : []),
  ];
  // Ex-works = the board at the factory gate, packed: everything but freight and UK duty.
  const exWorks = r2(bd.totalPerBoard - bd.logisticsPerBoard);
  const sum = stack.reduce((t, s) => t + s.amount, 0);
  const rounding = r2(exWorks - sum);
  if (Math.abs(rounding) >= 0.005) stack.push({ key: 'rounding', label: 'Rounding (to the penny)', amount: rounding, basis: `Every figure is rounded to ${money(0.01)}; this is the residual` });
  stack.push({ key: 'exWorks', label: `Ex-works cost (${country.split(' (')[0]} factory gate)`, amount: exWorks, basis: 'Built, tested and packed — before freight and import duty', kind: 'sub' });
  // Freight is what the logistics figure holds beyond the duty, so the two rows sum to it exactly.
  stack.push(
    { key: 'freight', label: 'Freight to the UK', amount: r2(bd.logisticsPerBoard - duty), basis: `Sea at volume, air below 2,500 boards${r2(bd.logisticsPerBoard - duty) < 0.005 && (qty ?? 0) >= 2500 ? ' — under a penny a board by sea at this size and volume' : ''}` },
    { key: 'duty', label: 'UK import duty', amount: duty, basis: 'On components + board + assembly (customs value)' },
  );
  stack.push({ key: 'delivered', label: 'Delivered cost per board', amount: bd.totalPerBoard, basis: `${country} build, delivered UK, duty paid`, kind: 'total' });

  // ── BOM: the analysis's lines at the country's sourcing (the same factor the components bucket uses).
  const lines = a.bom.filter(l => num(l.qty) > 0);
  const dist = lines.reduce((t, l) => t + num(l.qty) * num(l.unitPriceGBP), 0);
  const sourcingFactor = dist > 0 ? componentsAtCost / dist : 1;
  const bom: PcbaBomRow[] = lines.map(l => {
    const unit = num(l.unitPriceGBP) * sourcingFactor;
    return {
      ref: refOf(l), description: tidyCaps(String(l.description || l.componentType || '')), partNumber: String(l.partNumber ?? ''),
      pkg: String(l.pkg ?? ''), qty: num(l.qty), unit, ext: unit * num(l.qty), source: priceSourceLabel(l),
      // The server's own flag when present, so the export's "to verify" list is the screen's (360 review);
      // the £1 rule is the screen's too.
      verify: unit * num(l.qty) >= 1 && (typeof l.needsVerification === 'boolean'
        ? l.needsVerification : !(l.livePriced || (l.priceSource === 'catalogue' && l.catalogueConfidence === 'distributor'))),
    };
  });
  const bomTotal = bom.reduce((t, l) => t + l.ext, 0);
  const bomPieces = bom.reduce((t, l) => t + l.qty, 0);
  const factorNote = Math.abs(sourcingFactor - 1) > 0.005 ? ` Unit prices are the distributor price × ${sourcingFactor.toFixed(3)}, ${country}'s component sourcing index.` : '';
  const bomReconciliation = Math.abs(bomTotal - componentsAtCost) < 0.01
    ? `The ${bom.length} lines (${bomPieces} parts) total ${money(bomTotal)} — the components row of §1.${factorNote}${burden > 0 ? ` The EMS material burden (${money(burden)}) is added on top in §1.` : ''}`
    : `The ${bom.length} lines total ${money(bomTotal)} against ${money(componentsAtCost)} in §1 — a ${money(Math.abs(bomTotal - componentsAtCost))} difference from rounding of line prices.`;
  const sourceKey = 'Source: catalogue (distributor) = a distributor price on file; catalogue (estimate) = a dated engineering estimate; '
    + 'named-part range = the part is identified, priced inside its own range; function / class range = priced from the tool\'s table for that kind of part. '
    + `Lines marked * are ${money(1)}+ with no distributor price behind them — confirm with a quote.`;

  // ── Board.
  const s = a.boardSpec ?? {};
  const asm = a.assembly ?? {};
  const w = num(s.widthMm), h = num(s.heightMm);
  const boardRows: Array<[string, string]> = [
    ['Size', w && h ? `${w} × ${h} mm (${String(s.dimensionsSource) === 'measured' ? 'measured' : 'estimated from the photos'})` : '—'],
    ['Layers', `${num(s.estimatedLayers) || '—'}${String((s as Record<string, unknown>).layersSource) === 'measured' ? ' (measured)' : ''}`],
    ['Technology / HDI', `${pretty(s.technologyType)}${s.hdiStructure && s.hdiStructure !== 'none' ? ` · ${pretty(s.hdiStructure)}` : ''}`],
    ['Finish · copper', `${pretty(s.surfaceFinish)} · ${num(s.copperWeightOz) || 1} oz`],
    ['Vias (through / blind / micro)', `${num(s.throughVias)} / ${num(s.blindVias)} / ${num(s.microVias)}`],
    ['Impedance control', s.impedanceControlRequired ? 'Yes' : 'No'],
    ['Placements · BGA/CSP', `${num(asm.smtPlacements)} SMT · ${num(asm.bgaCount)} BGA/CSP · ${num(asm.reflowSides) || 1} reflow side(s)`],
  ];
  if (bd.panelInfo) boardRows.push(['Panel', `${bd.panelInfo.boardsPerPanel} boards on ${bd.panelInfo.panelW} × ${bd.panelInfo.panelH} mm (${Math.round(bd.panelInfo.utilisation * 100)}% used)`]);
  const pb: Array<[string, number | undefined]> = [['base', b.pcbBase], ['layers', b.pcbLayers], ['finish', b.pcbSurface], ['vias', b.pcbVias], ['HDI', b.pcbHDI], ['set-up', b.pcbSetup], ['copper', b.pcbCopper], ['impedance', b.pcbImpedance]];
  const pbTxt = pb.filter(([, v]) => num(v) > 0).map(([k, v]) => `${k} ${money(num(v))}`).join(' · ');
  if (pbTxt) boardRows.push(['Bare-board build-up', pbTxt]);

  // ── Countries: each row the board costed in that country (delivered UK).
  const countries: PcbaCountryRow[] = (a._countryComparison ?? [])
    .filter(c => c.totalPerBoard > 0)
    .map(c => ({
      // "Poland", not "Poland (Wrocław / Łódź / Poznań)" — the city list wraps every row of the table.
      id: c.countryId, name: (c.countryName || c.countryId).split(' (')[0], components: c.bomCostPerBoard, fab: c.pcbFabPerBoard, assembly: c.assemblyPerBoard,
      other: r2(c.totalPerBoard - c.bomCostPerBoard - c.pcbFabPerBoard - c.assemblyPerBoard - c.logisticsPerBoard),
      logistics: c.logisticsPerBoard, exWorks: r2(c.totalPerBoard - c.logisticsPerBoard), total: c.totalPerBoard, delta: c.totalPerBoard - bd.totalPerBoard, leadWeeks: c.leadTimeWeeks,
      selected: c.countryId === bd.countryId,
    }))
    .sort((x, y) => x.total - y.total);

  // ── Confidence: the analysis's own band and the lines without a quote behind them.
  const toVerify = bom.filter(l => l.verify);
  const cb = a._confidenceBand;
  const confidence = cb ? { label: cb.overallLabel, low: cb.totalLow, high: cb.totalHigh, verifyCount: toVerify.length, verifyValue: toVerify.reduce((t, l) => t + l.ext, 0) } : null;

  // ── Functional safety: the level the costing used, what was claimed, why they differ.
  const asil = a._asilLevel && !/^(unknown|n\/?a|none)$/i.test(a._asilLevel) ? a._asilLevel : null;
  const safety = asil ? {
    costed: asil, claimed: a._asilClaimed && a._asilClaimed !== asil ? a._asilClaimed : null,
    notes: a._asilNotes ?? [], rationale: String(a._asilRationale ?? ''), functions: a._asilSafetyFunctions ?? [],
    qualityGrade: String(opts.qualityGrade ?? s.qualityGrade ?? '—').replace(/_/g, ' ').replace(/grade(\d)/i, 'grade $1'),
  } : null;
  const n = a._automotiveNRE;
  const nre: Array<[string, number]> = n && n.totalNRE > 0
    ? ([['PPAP', n.ppapCost], ['FMEA', n.fmeaCost], ['DV / PV (DVP&R)', n.dvprCost], ['ASIL audit', n.asilAuditCost]] as Array<[string, number]>).filter(([, v]) => v > 0)
    : [];

  // ── Drivers (deterministic): the lines that carry the money, the build country's position.
  const drivers: string[] = [];
  const top = [...bom].sort((x, y) => y.ext - x.ext).slice(0, 3);
  const topSum = top.reduce((t, l) => t + l.ext, 0);
  if (top.length) drivers.push(`${top.length} lines carry ${Math.round(topSum / bd.totalPerBoard * 100)}% of the board: ${top.map(l => `${l.description}${l.partNumber ? ` (${l.partNumber})` : ''} ${money(l.ext)}`).join('; ')}. These are the quotes to get first.`);
  // The same basis as the cost-composition table: components at cost, the EMS burden on them stated
  // separately (the audit found "87%" beside a table reading 83%).
  const pc = (x: number) => Math.round(x / bd.totalPerBoard * 100);
  drivers.push(`Components are ${pc(componentsAtCost)}% of the board${burden > 0 ? ` (${pc(componentsAtCost + burden)}% with the EMS material burden)` : ''}; bare board ${pc(bd.pcbFabPerBoard)}%, assembly and test ${pc(bd.assemblyPerBoard)}% (each with its automotive grade). A should-cost discussion on this board is a component-price discussion.`);
  const cheapest = countries[0];
  if (cheapest && !cheapest.selected && cheapest.delta < -0.005) drivers.push(`${cheapest.name} costs this board ${money(-cheapest.delta)} less delivered (${money(cheapest.total)}) — before qualification, lead time and supply-chain risk.`);
  else if (cheapest?.selected) drivers.push(`${country} is the lowest delivered cost of the ${countries.length} countries compared.`);
  if (toVerify.length) drivers.push(`${toVerify.length} line${toVerify.length === 1 ? '' : 's'} of ${money(1)}+ (${money(toVerify.reduce((t, l) => t + l.ext, 0))}) ${toVerify.length === 1 ? 'is' : 'are'} priced from a range, not a quote: ${toVerify.slice(0, 4).map(l => l.description).join('; ')}.`);

  // ── Warnings: the analysis's own, de-duplicated. Limitations as the analysis states them.
  // Not repeated here: the ASIL notes (in the functional-safety box) and the BOM-image transcription
  // notes (rows the reader skipped — for checking the picture on screen, not for the report).
  const seen = new Set<string>();
  const warnings = (a._sanityWarnings ?? [])
    .filter(w => !['ASIL_CHECKED_AGAINST_BOM', 'BOM_IMAGE_READING'].includes(w.code))
    .map(w => w.message).filter(m => { const k = m.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });

  const domain = a.stage1Classification?.domain ?? 'general';
  const domainLabel = domain === 'automotive_adas' ? `Automotive${a._boardFunction && a._boardFunction !== 'unknown' ? ` ${a._boardFunction}` : ''} board` : domain.replace(/_/g, ' ');

  const named = opts.partName && !/^unnamed part$/i.test(opts.partName.trim()) ? opts.partName : '';
  return {
    partName: named || a.partName || 'PCB assembly',
    country, countryId: bd.countryId, annualVolume: qty, total: bd.totalPerBoard, exWorks,
    basis: `Populated board built in ${country}, delivered to the UK, import duty paid${qty ? `, at ${qty.toLocaleString('en-GB')} boards a year` : ''}`,
    domainLabel,
    shares: [
      { label: 'Components', amount: bd.bomCostPerBoard, pct: bd.bomCostPerBoard / bd.totalPerBoard * 100 },
      { label: 'Bare board', amount: bd.pcbFabPerBoard, pct: bd.pcbFabPerBoard / bd.totalPerBoard * 100 },
      { label: 'Assembly & test', amount: bd.assemblyPerBoard, pct: bd.assemblyPerBoard / bd.totalPerBoard * 100 },
      { label: 'Freight & duty', amount: bd.logisticsPerBoard, pct: bd.logisticsPerBoard / bd.totalPerBoard * 100 },
    ],
    stack, bom, bomPieces, bomTotal, componentsAtCost, sourcingFactor, bomReconciliation, sourceKey,
    boardRows, countries, confidence, safety, nre, nreTotal: n?.totalNRE ?? 0,
    drivers, warnings,
    bomOrigin: a.bom.some(l => l.bomSource === 'image' || l.fromImage) ? 'BOM image' : a.bom.some(l => l.bomSource === 'file') ? 'BOM file' : 'photos',
    // The photo reader's own caveats. With a supplied parts list, a caveat about the photo-read BOM
    // ("ICs may be double counted") no longer applies: the list, not the photos, is the BOM.
    limitations: (a.analysisLimitations ?? []).filter(Boolean).map(t => (/[.!?)]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`))
      .filter(t => !(a.bom.some(l => l.bomSource === 'file' || l.bomSource === 'image' || l.fromImage) && /double[- ]?count|duplicat|designators? (are|were) not visible|assigned by grouping/i.test(t))),
    excluded: [
      ...(nre.length ? [`One-time automotive NRE (${money(n!.totalNRE).replace(/\.00$/, '')} — PPAP, FMEA, DV/PV, audit) is not in the unit cost; see §6.`] : []),
      'Stencils, test fixtures and programming are inside the EMS price, spread over the order (no separate tooling line).',
      'Tier-1 / distributor margin above the EMS price, and the enclosure, lens and cable of a module, are not in this board cost.',
    ],
  };
}

/** A description written in capitals ("LI-ION AND LI-POL CHARGER IC") in title case; short acronyms stay. */
export function tidyCaps(t: string): string {
  if (!/[A-Z]{4}/.test(t) || t !== t.toUpperCase()) return t;
  const small = new Set(['and', 'or', 'with', 'for', 'of', 'to', 'in', 'on']);
  return t.toLowerCase().replace(/[a-z0-9][a-z0-9]*/g, (w, i: number) => {
    if (w.length <= 3 && /^(ic|ldo|csi|i2c|spi|usb|can|lin|led|pmic|adc|dac|esd|tvs|emi|rf|mcu|soc|ddr|mipi)$/.test(w)) return w.toUpperCase();
    if (/^(pmic|mipi)$/.test(w)) return w.toUpperCase();
    if (i > 0 && small.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}
function gbp(n: number): string { return `£${n.toFixed(2)}`; }
/** "FR4_HTg" → "FR4 HTg", "osp" → "OSP" — a value the reader sees, not an id. */
function pretty(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return '—';
  const sp = t.replace(/_/g, ' ');
  return sp.length <= 6 && /^[a-z ]+$/.test(sp) ? sp.toUpperCase() : sp;
}
