/**
 * A supplied BOM file is the BOM.
 *
 * The upload form promised "locks in real part numbers and quantities, removing
 * AI guesswork" — but the file was only pasted into the model's prompt as a hint,
 * and the model re-wrote the BOM from the photos anyway (and priced it). Now the
 * file's lines ARE the BOM: identity and quantity from the file, component type
 * inferred from ref-des / footprint, the model's reading used only to fill a
 * missing package or as a price estimate for the same ref-des. Prices come from
 * the deterministic layer (catalogue → named range → class table).
 */
import type { ParsedBOMLine } from './pcb-bom-parser.js';
import { inferComponentType } from './pcb-bom-postprocess.js';
import { expandRefDes } from './pcb-vision-accuracy.js';
import { tableTypeOf } from './pcb-class-pricing.js';

export type BomLine = Record<string, unknown>;

export interface BomTruthResult {
  bom: BomLine[];
  /** The photo reading placed parts on the bottom side (the file has no side column). */
  bottomSide: boolean;
  /** AI lines whose ref-des the file does not contain — possibly parts the file forgot. */
  aiOnly: string[];
  smtPlacements: number;
  throughHoleLines: number;
  bgaCount: number;
}

const NOT_FITTED = /\b(DNP|DNF|DNI|not fitted|not populated|no[- ]?pop|omit)\b/i;

function refKey(s: unknown): string { return String(s ?? '').toUpperCase().replace(/\s+/g, ''); }

export function bomFromFile(lines: ParsedBOMLine[], aiBom: BomLine[], automotiveBoard: boolean): BomTruthResult {
  const aiByRef = new Map<string, BomLine>();
  const aiRefs = new Map<BomLine, Set<string>>();
  for (const l of aiBom) {
    const refs = new Set(expandRefDes(l.refDes).map(refKey));
    aiRefs.set(l, refs);
    for (const r of refs) aiByRef.set(r, l);
  }
  const bottomSide = aiBom.some(l => /\bbottom[- ]side\b|\bunderside\b|\(bottom\)|\bon the bottom\b/i.test(`${l.description ?? ''} ${l.refDes ?? ''}`));

  const used = new Set<BomLine>();
  let smt = 0, th = 0, bga = 0;
  const bom: BomLine[] = lines.map(l => {
    const refs = expandRefDes(l.refDes);
    const qty = Number(l.qty) > 0 ? Number(l.qty) : Math.max(1, refs.length);
    // The photo line must cover EVERY ref-des of the file line: a five-off
    // "U7-U11" must not inherit the price of the photo's "U6, U7" PMIC.
    const cand = refs.map(r => aiByRef.get(refKey(r))).find(Boolean) ?? null;
    const ai = cand && refs.every(r => aiRefs.get(cand)!.has(refKey(r))) ? cand : null;
    if (ai) used.add(ai);
    const pkg = l.pkg || String(ai?.pkg ?? '');
    const desc = l.description || String(ai?.description ?? '');
    const inferred = inferComponentType({ refDes: l.refDes, pkg, value: l.value, description: desc });
    const componentType = tableTypeOf(inferred, pkg, desc);
    const notFitted = NOT_FITTED.test(`${desc} ${l.value}`);
    if (!notFitted) {
      if (componentType === 'through_hole') th += qty; else if (componentType !== 'mechanical') smt += qty;
      if (componentType === 'ic_bga') bga += qty;
    }
    const aiPrice = Number(ai?.unitPriceGBP);
    return {
      refDes: l.refDes,
      partNumber: l.partNumber || '',
      manufacturer: l.manufacturer ?? '',
      description: desc,
      pkg,
      value: l.value || String(ai?.value ?? ''),
      qty,
      componentType,
      unitPriceGBP: Number.isFinite(aiPrice) && aiPrice > 0 ? aiPrice : 0,
      aiEstimatedPriceGBP: Number.isFinite(aiPrice) && aiPrice > 0 ? aiPrice : undefined,
      automotive: automotiveBoard || ai?.automotive === true,
      lineConf: l.partNumber ? 0.95 : 0.85,
      ocrExtracted: false,
      bomSource: 'file',
      notFitted: notFitted || undefined,
    };
  });
  // "Not in the file" means none of the photo line's ref-des is in the file —
  // the photo's R1-R70 inside the file's R1-R90 is not a missing part.
  const fileRefs = new Set(lines.flatMap(l => expandRefDes(l.refDes).map(refKey)));
  const aiOnly = aiBom.filter(l => !used.has(l) && ![...(aiRefs.get(l) ?? [])].some(r => fileRefs.has(r))).map(l => String(l.refDes ?? '?'));
  return { bom, bottomSide, aiOnly, smtPlacements: smt, throughHoleLines: th, bgaCount: bga };
}
