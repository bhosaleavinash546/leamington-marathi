/**
 * WINDOWING MATHS, PURE.
 *
 * Given every row's height (measured where known, estimated where not) and
 * where the reader is, decide which rows to render and how much empty space
 * stands in for the rest. Kept free of React and the DOM so it is tested as
 * arithmetic (tests/virtual-range.test.mjs); the hook in
 * src/hooks/useVirtualList.ts only feeds it measurements.
 *
 * Offsets are prefix sums; the visible range is found by binary search, so a
 * scroll event costs O(log n) on a 1,600-row list, not a walk.
 */

export interface VirtualRange {
  /** First and one-past-last row indices to render. */
  start: number;
  end: number;
  /** Height of the spacer above the rendered rows, in px. */
  offsetTop: number;
  /** Height of the spacer below the rendered rows, in px. */
  offsetBottom: number;
  /** Total list height, in px. */
  totalHeight: number;
}

/** Prefix sums: offsets[i] is where row i starts; offsets[n] is the total height. */
export function prefixOffsets(heights: readonly number[]): number[] {
  const out = new Array(heights.length + 1);
  out[0] = 0;
  for (let i = 0; i < heights.length; i++) out[i + 1] = out[i] + Math.max(0, heights[i] || 0);
  return out;
}

/** Largest i with offsets[i] <= y (the row containing y). */
export function rowAt(offsets: readonly number[], y: number): number {
  const n = offsets.length - 1;
  if (n <= 0) return 0;
  if (y <= 0) return 0;
  if (y >= offsets[n]) return n - 1;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function computeRange(
  offsets: readonly number[],
  scrollTop: number,
  viewport: number,
  overscanPx = 600,
): VirtualRange {
  const n = offsets.length - 1;
  const totalHeight = n > 0 ? offsets[n] : 0;
  if (n <= 0) return { start: 0, end: 0, offsetTop: 0, offsetBottom: 0, totalHeight: 0 };
  const top = Math.max(0, scrollTop - overscanPx);
  const bottom = scrollTop + Math.max(0, viewport) + overscanPx;
  const start = rowAt(offsets, top);
  // end is exclusive: the first row that starts at or beyond `bottom`.
  let end = rowAt(offsets, bottom) + 1;
  if (end > n) end = n;
  if (end < start + 1) end = Math.min(n, start + 1);
  return { start, end, offsetTop: offsets[start], offsetBottom: totalHeight - offsets[end], totalHeight };
}
