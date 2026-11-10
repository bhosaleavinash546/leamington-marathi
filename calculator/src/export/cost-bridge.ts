/**
 * The COST BRIDGE of a costing — raw material in, finished part out, each line of the brief's Phase 8 cost structure read
 * off what the costing already holds (PKG-6 / CF-17, Nov 2026). ONE model, drawn by the cost card on screen, the core PDF
 * (section 2), the audit pack (§3C) and the workbook (0-Executive and 2-Material).
 *
 * Why: the engine's eight buckets are its contract and stay as they are, but bucket 1 "raw material" holds the metal AND
 * the melt / heating energy, heat treatment, blast, descale, NDT, cores, sand and cutting-tool wear (the module hands them
 * to the core as consumables and kWh). On the iron parts the metal was 24–29 % of that bucket (audit P7). The bridge
 * regroups the SAME figures by what they pay for — metal bought, scrap / return credit, melt or forge energy, primary
 * conversion, secondary processes, inspection, machining, tool wear, tooling, packaging, logistics, overhead, margin.
 *
 * Nothing is computed here that the stack did not compute: every amount is a stack input (consumable line, tooling item ÷
 * amortisation volume, packaging, logistics) or a stack output (an operation's process and labour £, an energy trace
 * line, overhead, margin), and the metal line is the core's own gross kg × £/kg − credit with the prices the costing USED
 * (its trace). The rows re-add to the headline, and per bucket to the eight buckets — `reconciles` says so; a renderer
 * prints `bridgePrintRows` and adds nothing.
 */
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType, Breakdown8Bucket } from '../engine/types.js';
import { shortOperationName } from '../engine/operation-names.js';

export type BridgeBucket = keyof Breakdown8Bucket;
export type BridgeKey = 'metal' | 'credit' | 'energy' | 'primary' | 'secondary' | 'inspection' | 'machining' | 'toolWear'
  | 'otherMaterial' | 'boughtIn' | 'learning' | 'tooling' | 'packaging' | 'logistics' | 'overhead' | 'margin';

/** One figure inside a bridge row, with the bucket(s) the engine holds it in. */
export interface CostBridgeItem {
  label: string;
  gbp: number;
  /** £ by bucket (an operation is machine time + labour); sums to `gbp`. */
  byBucket: Partial<Record<BridgeBucket, number>>;
}

export interface CostBridgeRow {
  key: BridgeKey;
  /** Phase 8 line number (brief): 1 raw material … 11 overheads and margin; the order the bridge runs in. */
  phase8: string;
  label: string;
  gbp: number;
  /** The running total after this row; the last row's is the headline. */
  cumulativeGbp: number;
  /** Which of the eight buckets the figures sit in today, as a reader names them. */
  inBuckets: string;
  /** How the figure is made, without money (money is in `kg`, `pricePerKg` or the items) — see `bridgePrintRows`. */
  basis: string;
  /** The metal line's kg × £/kg (metal bought, scrap credit). */
  kg?: number;
  pricePerKg?: number;
  items: CostBridgeItem[];
}

export interface CostBridge {
  /** 'cast' / 'forged' name the primary conversion; null for any other commodity. */
  form: 'cast' | 'forged' | null;
  rows: CostBridgeRow[];
  /** The headline the bridge must reach (`result.total`). */
  totalGbp: number;
  /** Σ rows. */
  reAddGbp: number;
  /** Σ rows − headline (a few 1e-15 of float order; never a penny). */
  differenceGbp: number;
  /** Σ of the bridge's figures by bucket, and the bucket it must equal. */
  bucketCheck: Array<{ bucket: BridgeBucket; bridgeGbp: number; engineGbp: number }>;
  /** The rows add to the headline AND to each of the eight buckets, within 1e-6 £. */
  reconciles: boolean;
  note: string;
}

const BUCKET_WORD: Record<BridgeBucket, string> = {
  rawMaterial: 'material', process: 'process', labour: 'labour', tooling: 'tooling',
  packaging: 'packaging', logistics: 'logistics', overhead: 'overhead', margin: 'margin',
};

/** Cutting-tool wear carried as a consumable (in material): the same reading as the core report's piece price. */
export const TOOL_WEAR_RE = /tool[\s-]?wear|cutting[\s-]?tool|\binserts?\b/i;
/** The machining cell's consumables that ride with the tool wear (the core report's form / machine split reads the same). */
const CELL_CONSUMABLE_RE = /cell consumables|coolant/i;
/** Inspection: NDT, NDI, radiography, MPI, CT, C-scan, gauging bought as a service or run as a station. */
const INSPECTION_RE = /\bndt\b|\bndi\b|x-?ray|radiograph|\bmpi\b|magnetic particle|\bct\b|c-scan|ultrason|inspect|\bcmm\b|leak[\s-]?test/i;
/** Secondary processes after the primary conversion (heat treatment, cleaning, sealing, finishing). */
const SECONDARY_RE = /heat[\s-]?treat|normalis|normaliz|\btemper(ing|ed)?\b|quench|anneal|ageing|\bt6\b|\bt5\b|carburi|nitrid|stress[\s-]?reliev|\bblast|descale|pickl|impregnat|\bcoin(ing)?\b|\bwash|\bclean|\bpaint|\bcoat|plating|\bplated\b|anodis|anodiz|e-?coat|passivat/i;

/**
 * Machining inside a cast + machine or forge + machine costing: a cutting machine (the library's `mach-` machines, or a
 * class that says machining centre / lathe), or a bench deburr / gauge. The class test read "machin" and "grind"
 * anywhere: "Gravity Die Casting Machine", "Shot Blast Machine" and the "Robotic fettling / grinding cell" were counted as
 * machining, and page 1 put the casting route's robotic fettling (£0.44 on the bracket) in the machining half.
 */
export function isMachiningOp(o: { operationName: string; machineId: string; benchOperation?: boolean }, library: RateLibrary): boolean {
  if (o.benchOperation) return /deburr|gauge|machin/i.test(o.operationName);
  const m = library.machines.find(x => x.id === o.machineId);
  return /^mach-/.test(o.machineId) || /\bmachining\b|\blathe\b/i.test(m?.machineClass ?? '');
}

/** An operation name short enough for a bridge item ("Melt shop (charge, melt, treat, ladle)"). */
function opLabel(name: string): string {
  const s = shortOperationName(name);
  if (s.length <= 64) return s;
  const cut = s.split(' — ')[0];
  return cut.length <= 64 ? cut : `${cut.slice(0, 61)}…`;
}

const sentence = (s: string) => s.replace(/^./, c => c.toUpperCase());

/**
 * The cost bridge of a costing (see the module header). `commodity` names the primary conversion (casting / forging);
 * `library` resolves an operation's machine class (machining or not) and, without a trace, the material price.
 */
export function buildCostBridge(a: { result: PartCostResult; input: UniversalStackInput; library: RateLibrary; commodity?: CommodityType | string | null }): CostBridge {
  const { result, input, library } = a;
  const c = String(a.commodity ?? '');
  const form: CostBridge['form'] = /forg/.test(c) ? 'forged' : /cast/.test(c) ? 'cast' : null;
  const rm = input.rawMaterial;
  const bd = result.breakdown;
  const traced = (f: string) => result.traceability.find(t => t.field === f)?.value;
  const rows: Array<Omit<CostBridgeRow, 'cumulativeGbp' | 'gbp' | 'inBuckets'>> = [];
  const add = (r: Omit<CostBridgeRow, 'cumulativeGbp' | 'gbp' | 'inBuckets'>) => { rows.push(r); };
  const item = (label: string, byBucket: Partial<Record<BridgeBucket, number>>): CostBridgeItem =>
    ({ label, gbp: Object.values(byBucket).reduce((s, v) => s + (v ?? 0), 0), byBucket });

  // ── 1. Raw material input: the metal bought, and what is sold back ──
  if (rm.directCost !== undefined) {
    add({ key: 'metal', phase8: '1', label: 'Material (priced by its own lines, not weight × price a kg)',
      basis: 'the direct material cost the commodity priced (its itemised lines are in the material detail)',
      items: [item('Direct material cost', { rawMaterial: rm.directCost })] });
  } else {
    const mat = library.materials.find(m => m.id === rm.materialId);
    const price = traced('material.pricePerKg') ?? mat?.pricePerKg ?? 0;
    const ov = rm.scrapRecoveryPricePerKgOverride;
    const scrapPrice = traced('material.scrapRecoveryPricePerKg')
      ?? (ov !== undefined && Number.isFinite(ov) && ov >= 0 ? ov : (mat?.scrapRecoveryPricePerKg ?? 0));
    const gross = rm.netWeightKg / rm.materialUtilization;
    const lostKg = gross - rm.netWeightKg;
    const word = form === 'forged' ? 'bar' : form === 'cast' ? 'metal charge' : 'material';
    add({ key: 'metal', phase8: '1', label: `${sentence(word)} bought${mat?.grade ? ` — ${mat.grade}` : ''}`, kg: gross, pricePerKg: price,
      basis: `${gross.toFixed(3)} kg bought a good part (net ${rm.netWeightKg.toFixed(3)} kg ÷ ${rm.materialUtilization.toFixed(4)} utilisation) × the price a kg the costing used`,
      items: [item(`${gross.toFixed(3)} kg bought`, { rawMaterial: gross * price })] });
    if (lostKg > 0.0000005) {
      const credit = rm.lossIsNotScrap ? 0 : lostKg * scrapPrice;
      add({ key: 'credit', phase8: '10', label: 'Scrap / return credit', kg: lostKg, pricePerKg: rm.lossIsNotScrap ? 0 : scrapPrice,
        basis: rm.lossIsNotScrap
          ? `none: the ${lostKg.toFixed(3)} kg bought and not in the part is metal lost in melting, not scrap sold — runners, risers and rejected castings are remelted in house`
          : `${lostKg.toFixed(3)} kg bought and not in the part (bought − made a good part), sold back at the scrap price a kg`,
        items: [item(rm.lossIsNotScrap ? 'No credit (metal lost)' : `${lostKg.toFixed(3)} kg sold back`, { rawMaterial: -credit })] });
    }
  }

  // ── Energy the module handed the core as kWh (melt, billet heating, drying, ladle preheat, plant electricity) ──
  const energy = result.traceability.filter(t => /^rawMaterial\.energyKwh\./.test(t.field));
  if (energy.length) {
    add({ key: 'energy', phase8: '2', label: form === 'cast' ? 'Melt and foundry energy' : form === 'forged' ? 'Billet heating energy' : 'Process energy',
      basis: `kWh × the costing country's tariff${rm.energyKwh?.basis ? ` — ${rm.energyKwh.basis.split(';')[0].replace(/:.*$/, '').trim()}` : ''}`,
      items: energy.map(t => {
        const kwh = /^([\d.]+) kWh/.exec(t.rateSource)?.[1];
        const kind = t.field.split('.').pop() ?? 'energy';
        return item(`${sentence(kind)}${kwh ? ` ${Number(kwh).toFixed(2)} kWh` : ''}`, { rawMaterial: t.value });
      }) });
  }

  // ── Operations: primary conversion / secondary / inspection / machining ──
  const ops = result.operationDetails.map(o => ({ o, mach: isMachiningOp(o, library) }));
  const opItem = (o: PartCostResult['operationDetails'][number]) => item(opLabel(o.operationName), { process: o.processCost, labour: o.labourCost });
  const primaryOps = ops.filter(x => !x.mach && !INSPECTION_RE.test(x.o.operationName) && !SECONDARY_RE.test(x.o.operationName)).map(x => opItem(x.o));
  const secondaryOps = ops.filter(x => !x.mach && !INSPECTION_RE.test(x.o.operationName) && SECONDARY_RE.test(x.o.operationName)).map(x => opItem(x.o));
  const inspectionOps = ops.filter(x => !x.mach && INSPECTION_RE.test(x.o.operationName)).map(x => opItem(x.o));
  const machiningOps = ops.filter(x => x.mach).map(x => opItem(x.o));

  // ── Consumables and services the module put in the material bucket, by what they pay for ──
  const cons = rm.consumablesCostPerPart && rm.consumablesCostPerPart > 0 ? rm.consumablesCostPerPart : 0;
  const consItems = cons > 0 ? (rm.consumablesItems ?? []) : [];
  const ci = (l: { label: string; gbp: number }) => item(sentence(l.label), { rawMaterial: l.gbp });
  const wear = consItems.filter(i => TOOL_WEAR_RE.test(i.label) || CELL_CONSUMABLE_RE.test(i.label));
  const inspect = consItems.filter(i => !wear.includes(i) && INSPECTION_RE.test(i.label));
  const secondary = consItems.filter(i => !wear.includes(i) && !inspect.includes(i) && SECONDARY_RE.test(i.label));
  const primaryCons = consItems.filter(i => !wear.includes(i) && !inspect.includes(i) && !secondary.includes(i));
  const notItemised = cons - consItems.reduce((s, i) => s + i.gbp, 0);

  const primaryWord = form === 'cast' ? 'casting' : form === 'forged' ? 'forging' : 'process operations';
  if (primaryOps.length || primaryCons.length) {
    add({ key: 'primary', phase8: '2', label: `Primary conversion — ${primaryWord}`,
      basis: `the ${primaryWord} operations (machine time ÷ OEE + labour, as costed)${primaryCons.length ? ' and their consumables in the material bucket' : ''}`,
      items: [...primaryOps, ...primaryCons.map(ci)] });
  }
  if (secondaryOps.length || secondary.length) {
    add({ key: 'secondary', phase8: '3', label: 'Secondary processes',
      basis: `${secondary.length ? 'services the costing carries as consumables in the material bucket' : ''}${secondary.length && secondaryOps.length ? ' and ' : ''}${secondaryOps.length ? 'their own operations' : ''}`,
      items: [...secondaryOps, ...secondary.map(ci)] });
  }
  if (inspectionOps.length || inspect.length) {
    add({ key: 'inspection', phase8: '9', label: 'Inspection and NDT',
      basis: `${inspect.length ? 'NDT / inspection the costing carries as a service in the material bucket' : ''}${inspect.length && inspectionOps.length ? ' and ' : ''}${inspectionOps.length ? 'its inspection operations' : ''}`,
      items: [...inspectionOps, ...inspect.map(ci)] });
  }
  if (machiningOps.length) {
    add({ key: 'machining', phase8: '4', label: 'Machining, by operation',
      basis: 'each machining operation (set-up, cutting, handling, deburr and gauge): machine time ÷ OEE + labour, as costed',
      items: machiningOps });
  }
  if (wear.length) {
    add({ key: 'toolWear', phase8: '4', label: 'Cutting-tool wear', basis: 'inserts, drills and end mills worn in machining — a consumable in the material bucket, not a tool set',
      items: wear.map(ci) });
  }
  if (Math.abs(notItemised) > 0.00005) {
    add({ key: 'otherMaterial', phase8: '1', label: 'Consumables not itemised by this costing', basis: 'the module states a total, not its lines',
      items: [item('Consumables (total only)', { rawMaterial: notItemised })] });
  }
  const bought = Math.max(0, rm.boughtIn?.cost ?? 0);
  if (bought > 0) {
    add({ key: 'boughtIn', phase8: '1', label: 'Bought-in components', basis: 'their supplier\'s price — handling as overhead, no second margin',
      items: [item('Bought-in content', { rawMaterial: bought })] });
  }
  const opLabour = result.operationDetails.reduce((s, o) => s + o.labourCost, 0);
  const learning = bd.labour - opLabour;
  if (Math.abs(learning) > 0.0000005) {
    add({ key: 'learning', phase8: '7', label: 'Learning-curve labour adjustment', basis: 'the labour bucket after the learning curve, less the operations\' labour before it',
      items: [item('Learning curve', { labour: learning })] });
  }

  // ── Tooling amortisation (bucket 4): each item ÷ the amortisation volume ──
  const tl = input.tooling;
  if (bd.tooling > 0) {
    const vol = tl.amortizationVolume;
    const its = (tl.items ?? []).map(i => item(i.label.split(':')[0].split(' (')[0].trim(), { tooling: i.gbp / vol }));
    const rest = bd.tooling - its.reduce((s, i) => s + i.gbp, 0);
    if (Math.abs(rest) > 0.0000005 || !its.length) its.push(item(its.length ? 'Tooling not itemised' : 'Tooling (not itemised)', { tooling: rest }));
    add({ key: 'tooling', phase8: '6', label: 'Tooling amortisation',
      basis: `dies, patterns, fixtures and programming over the programme ÷ ${Math.round(vol).toLocaleString('en-GB')} parts`, items: its });
  }

  // ── Packaging, logistics, overhead, margin ──
  if (bd.packaging > 0) add({ key: 'packaging', phase8: '—', label: 'Packaging', basis: 'a part, as on the costing', items: [item('Packaging', { packaging: bd.packaging })] });
  if (bd.logistics > 0) add({ key: 'logistics', phase8: '—', label: 'Logistics', basis: 'a part, as on the costing', items: [item('Logistics', { logistics: bd.logistics })] });
  if (bd.overhead !== 0) {
    add({ key: 'overhead', phase8: '11', label: 'Overhead',
      basis: `${(input.overheadPct * 100).toFixed(1)} % of material + process + labour + tooling${bought > 0 ? ' (bought-in carries handling only)' : ''}`,
      items: [item('Overhead', { overhead: bd.overhead })] });
  }
  if (bd.margin !== 0) {
    add({ key: 'margin', phase8: '11', label: 'Margin', basis: `${(input.marginPct * 100).toFixed(1)} % of the subtotal${bought > 0 ? ' less bought-in' : ''}`,
      items: [item('Margin', { margin: bd.margin })] });
  }

  // ── Re-add: to the headline and to each bucket ──
  let run = 0;
  const out: CostBridgeRow[] = rows.map(r => {
    const gbp = r.items.reduce((s, i) => s + i.gbp, 0);
    run += gbp;
    const buckets = [...new Set(r.items.flatMap(i => Object.keys(i.byBucket).filter(k => (i.byBucket[k as BridgeBucket] ?? 0) !== 0)))] as BridgeBucket[];
    const first = Object.keys(r.items[0]?.byBucket ?? {})[0] as BridgeBucket | undefined;
    return { ...r, gbp, cumulativeGbp: run, inBuckets: buckets.map(b => BUCKET_WORD[b]).join(' + ') || BUCKET_WORD[first ?? 'rawMaterial'] };
  });
  const bucketCheck = (Object.keys(BUCKET_WORD) as BridgeBucket[]).map(b => ({
    bucket: b, engineGbp: bd[b],
    bridgeGbp: out.reduce((s, r) => s + r.items.reduce((t, i) => t + (i.byBucket[b] ?? 0), 0), 0),
  }));
  const reAdd = out.reduce((s, r) => s + r.gbp, 0);
  // The last running total IS the headline: float order differs from the core's by ~1e-15, never by a penny.
  if (out.length) out[out.length - 1].cumulativeGbp = result.total;
  const difference = reAdd - result.total;
  const reconciles = Math.abs(difference) < 1e-6 && bucketCheck.every(x => Math.abs(x.bridgeGbp - x.engineGbp) < 1e-6);
  return {
    form, rows: out, totalGbp: result.total, reAddGbp: reAdd, differenceGbp: difference, bucketCheck, reconciles,
    note: 'The same figures as the eight buckets, grouped by what they pay for — raw material in, finished part out. '
      + 'Bucket 1 "material" also holds energy, secondary processes, inspection services and cutting-tool wear; here each is on its own line. '
      + 'Every figure is the costing\'s own; the rows re-add to the should-cost and, by bucket, to the eight buckets.',
  };
}

/** One printed bridge row — the SAME strings and £ on every surface (cost card, core PDF, audit pack, workbook). */
export interface BridgePrintRow { phase8: string; label: string; basis: string; gbp: number; cumulativeGbp: number; inBuckets: string; detail: string }

/**
 * The bridge as printed: `money` formats £ in the report's currency (2 dp on the core page, 4 dp in the audit pack and
 * workbook — the caller's choice), the items are listed under each row, largest first. No figure is made here.
 */
export function bridgePrintRows(b: CostBridge, money: (gbp: number) => string, maxItems = 6,
  /** £ a kg (the metal price) — 4 dp wherever it is printed, so kg × price re-adds to the line; null: the core report,
   *  which prints money in text to 2 dp, states the kg and leaves the price a kg to the audit pack (coreMoneyText). */
  rate: ((gbp: number) => string) | null = money): BridgePrintRow[] {
  return b.rows.map(r => {
    const its = [...r.items].filter(i => Math.abs(i.gbp) > 0.0000005 || r.items.length === 1).sort((x, y) => Math.abs(y.gbp) - Math.abs(x.gbp));
    const shown = its.slice(0, maxItems).map(i => `${i.label} ${money(i.gbp)}`);
    const rest = its.slice(maxItems);
    const restGbp = rest.reduce((s, i) => s + i.gbp, 0);
    const basis = r.kg != null && r.pricePerKg != null && rate
      ? (r.key === 'metal' ? `${r.kg.toFixed(3)} kg × ${rate(r.pricePerKg)}/kg — ${r.basis.replace(/ × the price a kg the costing used$/, '')}`
        : r.pricePerKg > 0 ? `${r.kg.toFixed(3)} kg × ${rate(r.pricePerKg)}/kg — ${r.basis}` : r.basis)
      : r.basis.replace(/ × the price a kg the costing used$/, ' at the price a kg the costing used (in the material detail)');
    return {
      phase8: r.phase8, label: r.label, basis, gbp: r.gbp, cumulativeGbp: r.cumulativeGbp, inBuckets: r.inBuckets,
      detail: r.items.length > 1 || ['energy', 'primary', 'machining', 'secondary', 'inspection', 'toolWear'].includes(r.key)
        ? [...shown, ...(rest.length ? [`${rest.length} more ${money(restGbp)}`] : [])].join(' · ') : '',
    };
  });
}

/** "Re-add: £a + £b + … = £total" — the bridge's closing line, the same on every surface. */
export function bridgeReAddText(b: CostBridge, money: (gbp: number) => string): string {
  return `Re-add: ${b.rows.map((r, i) => `${i ? (r.gbp < 0 ? ' − ' : ' + ') : ''}${money(i && r.gbp < 0 ? -r.gbp : r.gbp)}`).join('')} = ${money(b.reAddGbp)}; should-cost ${money(b.totalGbp)}`
    + (b.reconciles ? ' — the bridge closes to the should-cost and to each of the eight buckets.' : ' — DOES NOT CLOSE: report this.');
}
