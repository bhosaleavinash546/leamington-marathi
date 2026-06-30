/**
 * Board signature / template matching (Rec #5, dependency-free variant).
 *
 * A pixel-level perceptual hash or silkscreen OCR needs an image-processing
 * dependency the project doesn't carry. Instead we fingerprint a board by its
 * EXTRACTED identity — manufacturer, title, revision, dimensions and the set of
 * reference designators. Two photos of the same board (even re-encoded, so the
 * SHA-256 byte cache misses) resolve to the same signature, which lets us:
 *   - recognise a previously analysed board ("template match"), and
 *   - detect when the SAME board yields a DIFFERENT BOM (a repeatability alarm).
 *
 * Pure and deterministic — unit-tested. A heavier perceptual-hash/OCR matcher
 * can be layered on later behind the same signature interface.
 */

import { createHash } from 'node:crypto';

export interface BoardIdentity {
  manufacturer?: unknown;
  title?: unknown;
  revision?: unknown;
  widthMm?: unknown;
  heightMm?: unknown;
  bom?: Array<{ refDes?: unknown }>;
}

const clean = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
/** Bucket a dimension so small estimation jitter (±2mm) doesn't change the signature. */
const bucketMm = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n / 5) * 5 : 0; };

/** Stable signature for a board from its extracted identity. */
export function boardSignature(b: BoardIdentity): string {
  const refDes = (b.bom ?? [])
    .map(l => clean(l.refDes))
    .filter(Boolean)
    .sort();
  const basis = [
    clean(b.manufacturer),
    clean(b.title),
    clean(b.revision),
    bucketMm(b.widthMm),
    bucketMm(b.heightMm),
    refDes.join(','),
  ].join('|');
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

/** True when two analyses are (almost certainly) the same physical board. */
export function isSameBoard(a: BoardIdentity, b: BoardIdentity): boolean {
  return boardSignature(a) === boardSignature(b);
}

/**
 * Repeatability check: same board but the component count or BOM cost moved more
 * than `tol` (default 5%) between two analyses → flag as non-repeatable.
 */
export function repeatabilityDrift(
  a: { bom?: Array<{ qty?: unknown; unitPriceGBP?: unknown }> },
  b: { bom?: Array<{ qty?: unknown; unitPriceGBP?: unknown }> },
  tol = 0.05,
): { countDrift: number; costDrift: number; stable: boolean } {
  const count = (x?: Array<unknown>) => (x ?? []).length;
  const cost = (x?: Array<{ qty?: unknown; unitPriceGBP?: unknown }>) =>
    (x ?? []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPriceGBP) || 0), 0);
  const ca = count(a.bom), cb = count(b.bom);
  const sa = cost(a.bom), sb = cost(b.bom);
  const countDrift = Math.max(ca, cb) ? Math.abs(ca - cb) / Math.max(ca, cb) : 0;
  const costDrift = Math.max(sa, sb) ? Math.abs(sa - sb) / Math.max(sa, sb) : 0;
  return { countDrift, costDrift, stable: countDrift <= tol && costDrift <= tol };
}
