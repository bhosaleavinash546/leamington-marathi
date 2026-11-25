/**
 * Counting what is on the board (EDU v6, Nov 2026).
 *
 * Quantity was the largest hidden error on the EDU control board: the photo reading costed 2,080 parts where a
 * part-by-part recount of 22 photos found 1,896. Three causes: the second motor channel was costed "by symmetry" with
 * the first (it is not — op-amps and CAN parts differ, footprints are empty); about 20 % of the top-side footprints are
 * not fitted (5–15 % in the MCU cores, 30 % by the motor connector, 55 % below one MCU); and two CAN transceivers were
 * read as quad op-amps. The model now says, per line, how the quantity was got (`countMethod`), on which side and in which
 * photos (`side`, `seenIn`), and the range it can defend (`qtyMin` / `qtyMax`); the board says how many bare footprints it
 * saw (`assembly.emptyFootprints`). This module keeps those fields sane, turns the ranges into a quantity band in parts
 * and £, and flags a count copied by symmetry.
 *
 * A reading that does not state how it counted (an older analysis, a fixture) keeps its quantity as exact: nothing is
 * invented for it, and the band says the count method was not stated.
 */

export type CountMethod = 'counted' | 'designator-range' | 'estimated' | 'bom' | 'unstated';
type Line = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

/** Make a line's count fields consistent: qtyMin ≤ qty ≤ qtyMax, qtyMax ≤ 3 × qty, a BOM-file line counted exactly. */
export function normaliseCount(l: Line): void {
  const qty = Math.max(0, num(l.qty) || 0);
  const fromBom = l.bomSource === 'file' || l.bomSource === 'image' || l.userCorrected === true || l.qtyUserCorrected === true;
  const m = String(l.countMethod ?? '');
  const method: CountMethod = fromBom ? 'bom' : (['counted', 'designator-range', 'estimated'] as const).includes(m as never) ? m as CountMethod : 'unstated';
  l.countMethod = method;
  let lo = num(l.qtyMin), hi = num(l.qtyMax);
  if (method === 'bom' || method === 'unstated' || method === 'counted') { lo = qty; hi = qty; }
  if (!Number.isFinite(lo) || lo < 0) lo = qty;
  if (!Number.isFinite(hi)) hi = qty;
  lo = Math.min(lo, qty); hi = Math.min(Math.max(hi, qty), Math.max(qty * 3, qty + 2));
  l.qtyMin = Math.round(lo); l.qtyMax = Math.round(hi);
  if (!['top', 'bottom', 'both', 'unknown'].includes(String(l.side))) l.side = 'unknown';
  if (!Array.isArray(l.seenIn)) l.seenIn = [];
}

export interface QuantityBand {
  parts: number; partsLow: number; partsHigh: number;
  /** £ a board the quantity ranges move the components by (at each line's own unit price), before the EMS burden. */
  gbpLow: number; gbpHigh: number;
  /** Parts by how they were counted. */
  byMethod: Record<CountMethod, number>;
  /** Bare footprints the reading saw (not costed). */
  emptyFootprints: number;
  note: string;
}

export function quantityBand(bom: Line[], emptyFootprints = 0): QuantityBand {
  const byMethod: Record<CountMethod, number> = { counted: 0, 'designator-range': 0, estimated: 0, bom: 0, unstated: 0 };
  let parts = 0, lo = 0, hi = 0, gLo = 0, gHi = 0;
  for (const l of bom) {
    if (l.notFitted === true || l.priceSource === 'not-fitted') continue;
    const q = Math.max(0, num(l.qty) || 0), u = Math.max(0, num(l.unitPriceGBP) || 0);
    const a = Number.isFinite(num(l.qtyMin)) ? num(l.qtyMin) : q, b = Number.isFinite(num(l.qtyMax)) ? num(l.qtyMax) : q;
    parts += q; lo += a; hi += b; gLo += (a - q) * u; gHi += (b - q) * u;
    byMethod[(l.countMethod as CountMethod) in byMethod ? l.countMethod as CountMethod : 'unstated'] += q;
  }
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const pc = (v: number) => parts > 0 ? Math.round(v / parts * 100) : 0;
  const stated = parts - byMethod.unstated;
  const note = stated === 0
    ? 'The reading did not say how its quantities were counted — they are taken as exact. A BOM file counts the board exactly.'
    : `${pc(byMethod.counted + byMethod.bom)} % of the parts counted one by one or from the BOM, ${pc(byMethod['designator-range'])} % from printed designator ranges, ${pc(byMethod.estimated)} % estimated; the count is ${lo === hi ? 'exact' : `${lo.toLocaleString('en-GB')}–${hi.toLocaleString('en-GB')} parts`}${emptyFootprints > 0 ? `; ${emptyFootprints.toLocaleString('en-GB')} bare footprints were seen and are not costed` : ''}.`;
  return { parts, partsLow: lo, partsHigh: hi, gbpLow: r4(gLo), gbpHigh: r4(gHi), byMethod, emptyFootprints, note };
}

/** A count copied from another circuit ("channel 2 as channel 1", "mirrored", "by symmetry") — the EDU board's biggest
 *  counting error. The text the model wrote is read; the warning names the lines. */
const SYMMETRY = /\bsymmetr\w*|\bmirror(ed)?\s+(of|from)\b|\bsame as (channel|ch\.?|side|the other)\b|\bas (channel|ch\.?) ?\d\b|\bassumed identical\b|\bcopy of (channel|ch)\b|\bby analogy\b|\bduplicated? (from|of) (channel|ch)\b/i;
export function symmetryLines(bom: Line[], limitations: unknown[] = []): { lines: string[]; limitation: boolean } {
  const lines = bom.filter(l => SYMMETRY.test(`${String(l.description ?? '')} ${String(l.countNote ?? '')}`)).map(l => String(l.refDes ?? l.description ?? '').slice(0, 40));
  const limitation = limitations.some(t => SYMMETRY.test(String(t)));
  return { lines, limitation };
}
