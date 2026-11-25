/**
 * The information request (EDU audit G-18, Nov 2026): the ten things that move a photo-based PCBA should-cost most,
 * each ticked from what THIS costing actually holds — so the request a buyer sends the supplier (or the design team) lists
 * only what is missing. One model for the screen, the PDF and the workbook. Pure: reads the analysis, writes nothing.
 */

export interface InfoItem { n: number; item: string; have: boolean; why: string }

type Spec = Record<string, unknown>;
interface Like {
  bom: Array<{ bomSource?: unknown; fromImage?: unknown }>;
  boardSpec?: Spec;
  _verifyList?: Array<{ rank: number; status: string }>;
}

const typed = (v: unknown) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

export function pcbInfoRequest(a: Like): InfoItem[] {
  const b = (a.boardSpec ?? {}) as Spec;
  const measured = (k: string) => String(b[k] ?? '') === 'measured';
  const bomFile = a.bom.some(l => l.bomSource === 'file' || l.bomSource === 'image' || l.fromImage === true);
  const top3 = (a._verifyList ?? []).filter(v => v.rank <= 3);
  const items: Array<[string, boolean, string]> = [
    ['The BOM file (part numbers and quantities)', bomFile, bomFile ? 'attached — the BOM is the ground truth' : 'not attached — every unread part is priced inside its class range and quantities are read off the photos'],
    ['Gerber and drill files (layer stack, vias)', measured('layersSource') && measured('viasSource'), measured('layersSource') && measured('viasSource') ? 'layers and vias measured or typed' : 'layer count and via count are estimates — no photo shows them'],
    ['Board outline (size)', measured('dimensionsSource'), measured('dimensionsSource') ? 'measured or typed' : 'estimated from the photos'],
    ['Populated board weight', Number(b.boardWeightG) > 0, Number(b.boardWeightG) > 0 ? `${Number(b.boardWeightG)} g` : 'estimated — freight uses area × layers'],
    ['ASIL from the safety concept', Boolean(String(b.asilConfirmed ?? '')), String(b.asilConfirmed ?? '') ? String(b.asilConfirmed) : 'not confirmed — nothing ASIL-dependent is costed'],
    ['Annual volume, programme life and lot size', Number(b.programmeYears) > 0 && Number(b.lotSize) > 0, Number(b.programmeYears) > 0 && Number(b.lotSize) > 0 ? `${Number(b.programmeYears)} years, lots of ${Number(b.lotSize).toLocaleString('en-GB')}` : 'programme life or lot size not given — one-offs over one year, one lot a year'],
    ['Test plan (functional / EOL test time, ICT, programming)', typed(b.functionalTestSec), typed(b.functionalTestSec) ? `functional test ${Number(b.functionalTestSec)} s typed` : 'functional test time is an engineering estimate'],
    ['Conformal coating specification (sides, keep-outs)', typed(b.conformalCoatSides), typed(b.conformalCoatSides) ? `${Number(b.conformalCoatSides)} side(s)` : 'coated sides not given'],
    ['Delivery terms and first-pass yield', Boolean(String(b.deliveryTerms ?? '')) && typed(b.firstPassYield), [String(b.deliveryTerms ?? '') ? `terms ${String(b.deliveryTerms)}` : 'terms not given (delivered UK assumed)', typed(b.firstPassYield) ? `FPY ${Number(b.firstPassYield)}` : 'no first-pass yield (rework from an unsourced dppm)'].join('; ')],
    ['Quotes or contract prices for the three dearest lines', top3.length > 0 && top3.every(v => v.status === 'confirmed'), top3.length ? `${top3.filter(v => v.status === 'confirmed').length} of the 3 dearest lines confirmed` : 'no lines ranked'],
  ];
  return items.map(([item, have, why], i) => ({ n: i + 1, item, have, why }));
}
