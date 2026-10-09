/**
 * The photo analysis and the PCB form below it are ONE costing (live trial, Oct 2026).
 *
 * After "Analyze", Calculate used to cost the form's untouched defaults — a 200×150 mm,
 * 8-layer HDI bare board in the UK (£82.43) — while the analysis above priced the real
 * 20×20 mm camera board, BOM and assembly in China (£16.74). Now:
 *   - the analysis fills the form, so the fields show what was used;
 *   - Calculate with nothing edited reports the analysis itself (the populated board in the
 *     analysis's country, every figure from the server's deterministic Stage 4);
 *   - an edited field is the engineer's figure: it is written into the analysis's board spec
 *     and the board is re-priced on the server (/reprice) before Calculate reports it.
 * Nothing here computes a price; it only moves figures between the analysis and the form.
 */
import type { UniversalStackInput, MaterialLineItem } from '../../engine/types.js';

/** The fab-form fields the analysis fills, and the board-spec key each one edits. */
export const FAB_FIELDS: Array<{ id: string; key: string; kind: 'num' | 'text' | 'bool' }> = [
  { id: 'pcbf-board-w', key: 'widthMm', kind: 'num' },
  { id: 'pcbf-board-h', key: 'heightMm', kind: 'num' },
  { id: 'pcbf-layers', key: 'estimatedLayers', kind: 'num' },
  { id: 'pcbf-vias', key: 'throughVias', kind: 'num' },
  { id: 'pcbf-blind-vias', key: 'blindVias', kind: 'num' },
  { id: 'pcbf-uvias', key: 'microVias', kind: 'num' },
  { id: 'pcbf-finish', key: 'surfaceFinish', kind: 'text' },
  { id: 'pcbf-hdi-structure', key: 'hdiStructure', kind: 'text' },
  { id: 'pcbf-impedance', key: 'impedanceControlRequired', kind: 'bool' },
  { id: 'pcbf-outer-cu', key: 'copperWeightOz', kind: 'num' },
  { id: 'pcbf-technology', key: 'technologyType', kind: 'text' },
  { id: 'pcbf-quality', key: 'qualityGrade', kind: 'text' },
];
/** Order fields: they change the order, not the board. */
export const ORDER_FIELDS = ['annual-volume'] as const;

type Field = HTMLInputElement | HTMLSelectElement;
const valueOf = (f: Field): string => ((f as HTMLInputElement).type === 'checkbox' ? String((f as HTMLInputElement).checked) : f.value);

/** The values the analysis put in the form, by id — what "edited" is measured against. */
export function snapshotFields(doc: Document = document): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of [...FAB_FIELDS.map(f => f.id), ...ORDER_FIELDS]) {
    const f = doc.getElementById(id) as Field | null;
    if (f) out[id] = valueOf(f);
  }
  return out;
}

/** Ids whose value the engineer changed since the analysis filled the form. */
export function editedFields(snapshot: Record<string, string>, doc: Document = document): string[] {
  return Object.keys(snapshot).filter(id => {
    const f = doc.getElementById(id) as Field | null;
    return !!f && valueOf(f) !== snapshot[id];
  });
}

/**
 * The board-spec patch for the edited fields. A size, layer count or via count the engineer
 * typed is ground truth: it is marked measured so the server keeps it exactly.
 * A quality grade picks the costing: an automotive grade costs the board as automotive.
 */
export function boardSpecPatch(edited: string[], doc: Document = document): { spec: Record<string, unknown>; domain?: string; notes: string[] } {
  const spec: Record<string, unknown> = {};
  const notes: string[] = [];
  let domain: string | undefined;
  for (const id of edited) {
    const def = FAB_FIELDS.find(f => f.id === id);
    const f = doc.getElementById(id) as Field | null;
    if (!def || !f) continue;
    const v = valueOf(f);
    if (def.kind === 'num') { const x = Number(v); if (Number.isFinite(x) && x >= 0) spec[def.key] = x; }
    else if (def.kind === 'bool') spec[def.key] = v === 'true';
    else spec[def.key] = v;
    if (def.key === 'widthMm' || def.key === 'heightMm') { spec.dimensionsSource = 'measured'; spec.dimensionsEvidence = 'user'; }
    if (def.key === 'estimatedLayers') { spec.layersSource = 'measured'; spec.layersEvidence = 'user'; }
    if (def.key === 'throughVias') { spec.viasSource = 'measured'; spec.viasEvidence = 'user'; }
    if (def.key === 'qualityGrade') domain = /^auto/i.test(v) ? 'automotive_adas' : 'general';
    if (def.key === 'technologyType') notes.push('PCB technology is derived from the layers, vias and HDI structure — the price follows those fields, so edit them to change it.');
  }
  return { spec, domain, notes };
}

/** What the analysis's selected-country breakdown carries (attachPcbPayload). */
export interface CountryBreakdownLike {
  totalPerBoard: number; pcbFabPerBoard: number; assemblyPerBoard: number; bomCostPerBoard: number; logisticsPerBoard: number;
  breakdown?: { energy?: number; packaging?: number; yieldLoss?: number };
  countryName?: string; countryId?: string;
}
export interface AnalysisLike {
  partName?: string;
  bom: Array<{ refDes?: string; description?: string; partNumber?: string; qty?: number; unitPriceGBP?: number; pkg?: string; value?: string; priceSource?: string }>;
  _selectedCountryBreakdown?: CountryBreakdownLike | null;
}

/**
 * The analysis as the costing form's input: the populated board in the analysis's country.
 * Components (as that country buys them, line by line), the bare board and the assembly are all
 * supplier prices — they carry the supplier's overhead and margin — so they enter as bought-in
 * and no second overhead or margin is added. Energy, packaging and yield go to packaging,
 * logistics and duty to logistics. The total equals the analysis headline to the penny.
 */
export function analysisStackInput(r: AnalysisLike, partName?: string, annualVolume?: number): UniversalStackInput {
  const bd = r._selectedCountryBreakdown;
  if (!bd || !(bd.totalPerBoard > 0)) throw new Error('The PCB analysis has no country breakdown yet — run Analyze first.');
  const b = bd.breakdown ?? {};
  const pack = (b.energy ?? 0) + (b.packaging ?? 0) + (b.yieldLoss ?? 0);
  const bomDist = r.bom.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unitPriceGBP) || 0), 0);
  const sourcing = bomDist > 0 ? bd.bomCostPerBoard / bomDist : 1;   // the country's sourcing factor on the distributor BOM
  const lines: MaterialLineItem[] = r.bom.filter(l => (Number(l.qty) || 0) > 0).map(l => ({
    // A designator (R1, C1-C10, U3) — not a BOM's category column ("Capacitor").
    ref: /\b[A-Z]{1,4}\d+/i.test(String(l.refDes ?? '')) ? String(l.refDes) : String(l.partNumber || '—'), description: String(l.description ?? ''), qty: Number(l.qty) || 0,
    unitCost: Math.round((Number(l.unitPriceGBP) || 0) * sourcing * 1e6) / 1e6, pkg: l.pkg || undefined, value: l.value || undefined,
    note: [l.partNumber, l.priceSource].filter(Boolean).join(' · ') || undefined,
  }));
  const where = bd.countryName ?? bd.countryId ?? 'the analysis country';
  lines.push({ ref: 'PCB', description: `Bare board (fabrication, ${where})`, qty: 1, unitCost: bd.pcbFabPerBoard, note: 'fabricator price' });
  lines.push({ ref: 'ASM', description: `SMT / THT assembly, inspection and test (${where})`, qty: 1, unitCost: bd.assemblyPerBoard, note: 'EMS price' });
  // Rounding: logistics absorbs the last fraction of a penny so the total IS the headline.
  const logistics = Math.max(0, bd.totalPerBoard - bd.bomCostPerBoard - bd.pcbFabPerBoard - bd.assemblyPerBoard - pack);
  return {
    partName: partName || r.partName || 'PCB assembly',
    rawMaterial: {
      materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1,
      directCost: bd.bomCostPerBoard,
      boughtIn: { cost: bd.pcbFabPerBoard + bd.assemblyPerBoard, handlingPct: 0 },
      lines,
    },
    operations: [],
    // No tooling of its own (stencil / fixtures are inside the EMS price); the volume is the order's.
    tooling: { totalToolingCost: 0, amortizationVolume: Math.max(1, annualVolume ?? 1), mode: 'amortized' } as UniversalStackInput['tooling'],
    ...(annualVolume && annualVolume > 0 ? { annualVolume } : {}),
    packagingPerPart: pack,
    logisticsPerPart: logistics,
    overheadPct: 0,
    marginPct: 0,
    priceBasis: 'market_price',
  };
}
