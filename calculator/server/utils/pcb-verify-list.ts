/**
 * The lines to verify first (EDU v6, Nov 2026). On the EDU control board the ten dearest lines carried most of the
 * component cost, and one of them (the AURIX pair, a distributor list ceiling against a volume price) moved the board
 * by £17. An engineer's minute is worth most on those lines, so the tool ranks them: the N largest lines by £ a board,
 * each with its share of the components, how it was priced and whether anything stands behind the price.
 *
 * Pure: reads the priced BOM, writes nothing.
 */

export interface VerifyLine {
  rank: number;
  refDes: string;
  description: string;
  partNumber: string;
  qty: number;
  unitPriceGBP: number;
  lineTotalGBP: number;
  /** Share of the components total (0..1). */
  share: number;
  priceSource: string;
  /** 'confirmed' — the engineer's price, the user's BOM, or an exact catalogue match on an evidenced part number;
   *  'to verify' — everything else (a class range, a family price, an estimate). */
  status: 'confirmed' | 'to verify';
  why: string;
  customerSupplied: boolean;
}

type Line = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Why a line's price stands, or what it rests on. */
function statusOf(l: Line): { status: VerifyLine['status']; why: string } {
  const src = String(l.priceSource ?? '');
  if (src === 'user' || l.userCorrected === true && l.priceEdited !== false) return { status: 'confirmed', why: 'the engineer\'s price' };
  if (l.bomSource === 'file' || l.bomSource === 'image') {
    if (src === 'catalogue' && l.catalogueExact === true) return { status: 'confirmed', why: 'your BOM\'s part number, catalogue price' };
  }
  if (src === 'catalogue' && l.catalogueExact === true && String(l.identityEvidence ?? '') !== '') return { status: 'confirmed', why: `part number read (${String(l.identityEvidence)}), catalogue price` };
  if (src === 'live' || l.livePriced === true) return { status: 'confirmed', why: 'a distributor price read this run' };
  if (src === 'catalogue') return { status: 'to verify', why: l.catalogueExact === true ? 'catalogue price on a part number nobody confirmed' : 'a family price — the exact part is not known' };
  if (src === 'class-range') return { status: 'to verify', why: 'priced inside its class range — the part was not identified' };
  return { status: 'to verify', why: src ? `priced by ${src}` : 'no price basis' };
}

export function verifyList(bom: Line[], n = 10): VerifyLine[] {
  const total = bom.reduce((t, l) => t + num(l.lineTotalGBP), 0);
  return bom
    .filter(l => num(l.lineTotalGBP) > 0)
    .sort((a, b) => num(b.lineTotalGBP) - num(a.lineTotalGBP))
    .slice(0, n)
    .map((l, i) => {
      const s = statusOf(l);
      return {
        rank: i + 1, refDes: String(l.refDes ?? ''), description: String(l.description ?? ''), partNumber: String(l.partNumber ?? ''),
        qty: num(l.qty), unitPriceGBP: num(l.unitPriceGBP), lineTotalGBP: Math.round(num(l.lineTotalGBP) * 10000) / 10000,
        share: total > 0 ? num(l.lineTotalGBP) / total : 0, priceSource: String(l.priceSource ?? ''),
        status: s.status, why: s.why, customerSupplied: l.customerSupplied === true,
      };
    });
}

/** £ a board of the parts the customer supplies (directed buy / consignment). */
export function customerSuppliedGBP(bom: Line[]): number {
  return Math.round(bom.filter(l => l.customerSupplied === true).reduce((t, l) => t + num(l.lineTotalGBP), 0) * 10000) / 10000;
}
