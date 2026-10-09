/**
 * BOM consolidation before pricing (PCB review, Oct 2026).
 *
 * The model reads up to eight photos of one board: top, bottom and close-ups. The
 * only guard against counting a part twice (U1 in the top photo AND in a close-up)
 * was a sentence in the prompt. Its quantities were taken as given: 1.5, 0 and −2
 * passed, and "R1-R10" with qty 12 was priced as 12. Placements, fab sizing and
 * the BOM total all follow these numbers, so they are made consistent here,
 * deterministically, and every change is reported.
 *
 *  - qty is a whole number ≥ 1 (0 kept for a not-fitted footprint);
 *  - an explicit designator list or range is countable evidence: when it names
 *    a different number of parts than qty, qty follows the designators;
 *  - a designator already listed on an earlier line is removed from the later one,
 *    and a line left with none of its own is dropped as a duplicate view.
 */
import { expandRefDes } from './pcb-vision-accuracy.js';
import { isNotFitted } from './pcb-price-catalogue.js';

export type BomLine = Record<string, unknown>;
export interface ConsolidationWarning { code: string; severity: 'warn' | 'error'; message: string }

export function consolidateBom(bom: BomLine[]): { bom: BomLine[]; warnings: ConsolidationWarning[] } {
  const warnings: ConsolidationWarning[] = [];
  const fixedQty: string[] = [];
  const fromRefs: string[] = [];
  const dropped: string[] = [];
  const trimmed: string[] = [];
  const seen = new Set<string>();
  const out: BomLine[] = [];
  const unverifiedQty: string[] = [];
  const mergedDup: string[] = [];
  // Lines with NO designators that say exactly the same thing (the same parts seen in two photos) — pipeline review F16.
  const sig = (l: BomLine) => [l.componentType, l.value, l.pkg, l.partNumber, l.description].map(v => String(v ?? '').trim().toLowerCase()).join('|');
  const bare = new Map<string, number>();

  for (const line of bom) {
    // Name the line by what a reader recognises: its designators if it has real ones, else its part / description.
    const label = String(expandRefDes(line.refDes).length ? line.refDes : (line.partNumber || line.description || line.refDes || '?')).slice(0, 40);
    const notFitted = isNotFitted(line);
    let qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty < 0 || (qty === 0 && !notFitted) || !Number.isInteger(qty)) {
      const was = line.qty;
      qty = notFitted && (qty === 0 || !Number.isFinite(qty)) ? 0 : Math.max(1, Math.round(Number.isFinite(qty) ? qty : 1));
      fixedQty.push(`${label} (${String(was)} → ${qty})`);
    }
    const refs = expandRefDes(line.refDes);
    // Designators are countable: "R1-R10" is ten parts whatever qty says.
    const explicit = refs.length > 1 && refs.every(r => /^[A-Z]+\d+$/.test(r));
    if (explicit && qty !== refs.length && !notFitted) {
      fromRefs.push(`${label} (qty ${qty} → ${refs.length})`);
      qty = refs.length;
    }
    // Same designator seen in an earlier view → that part is already counted.
    const own = refs.filter(r => !seen.has(r));
    if (refs.length > 0 && own.length === 0) {
      dropped.push(label);
      continue;
    }
    if (refs.length > 0 && own.length < refs.length) {
      const removed = refs.length - own.length;
      trimmed.push(`${label} (−${removed})`);
      if (explicit || qty === refs.length) qty = Math.max(own.length, qty - removed);
    }
    for (const r of own) seen.add(r);
    if (refs.length === 0 && !notFitted) {
      const k = sig(line);
      const at = bare.get(k);
      if (at != null) {
        // Kept once, at the larger count, and listed to verify: a second view of the same parts is not a second set.
        out[at] = { ...out[at], qty: Math.max(Number(out[at].qty) || 0, qty), qtyUnverified: true, duplicateLinesMerged: (Number(out[at].duplicateLinesMerged) || 1) + 1 };
        mergedDup.push(label);
        continue;
      }
      bare.set(k, out.length);
    }
    // A quantity the designators cannot show ("C47" × 90, "R" × 700) is the model's count, not a count of the board:
    // kept, but listed to verify — unless the user's BOM file gave it.
    const fromFile = line.bomSource === 'file' || line.bomSource === 'image';
    const qtyUnverified = !fromFile && !notFitted && qty > Math.max(1, own.length) && !explicit;
    if (qtyUnverified) unverifiedQty.push(`${label} (${qty})`);
    out.push(qty === Number(line.qty) && own.length === refs.length && !qtyUnverified ? line : {
      ...line,
      qty,
      refDes: own.length === refs.length ? line.refDes : own.join(', '),
      ...(qty !== Number(line.qty) || own.length !== refs.length ? { qtyAdjusted: true } : {}),
      ...(qtyUnverified ? { qtyUnverified: true } : {}),
    });
  }
  if (mergedDup.length) warnings.push({ code: 'BOM_DUPLICATE_LINES_MERGED', severity: 'warn',
    message: `${mergedDup.length} line(s) without designators repeated another line exactly (the same parts in another photo) and were merged: ${mergedDup.slice(0, 10).join(', ')}${mergedDup.length > 10 ? ', …' : ''}.` });
  if (unverifiedQty.length) warnings.push({ code: 'BOM_QTY_NOT_COUNTABLE', severity: 'warn',
    message: `Quantities the designators do not show are the AI's count and are listed to verify: ${unverifiedQty.slice(0, 10).join(', ')}${unverifiedQty.length > 10 ? ', …' : ''}.` });

  if (dropped.length) warnings.push({ code: 'BOM_DUPLICATE_VIEWS', severity: 'warn',
    message: `${dropped.length} line(s) repeated a part already listed from another photo and were removed: ${dropped.slice(0, 10).join(', ')}${dropped.length > 10 ? ', …' : ''}.` });
  if (trimmed.length) warnings.push({ code: 'BOM_OVERLAPPING_REFDES', severity: 'warn',
    message: `Designators listed twice across lines were counted once: ${trimmed.slice(0, 10).join(', ')}${trimmed.length > 10 ? ', …' : ''}.` });
  if (fromRefs.length) warnings.push({ code: 'BOM_QTY_FROM_REFDES', severity: 'warn',
    message: `Quantity set from the designators listed (they name a different count): ${fromRefs.slice(0, 10).join(', ')}${fromRefs.length > 10 ? ', …' : ''}.` });
  if (fixedQty.length) warnings.push({ code: 'BOM_QTY_NOT_WHOLE', severity: 'warn',
    message: `Quantities that were not whole numbers ≥ 1 were corrected: ${fixedQty.slice(0, 10).join(', ')}${fixedQty.length > 10 ? ', …' : ''}.` });
  return { bom: out, warnings };
}
