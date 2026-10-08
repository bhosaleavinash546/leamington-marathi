/**
 * How long the geometry kernel may take on an upload, by its size — ONE rule for the server and the page.
 *
 * A flat 120 s (server) / 150 s (page) was right for typical parts and wrong for a 31 MB fuel tank, which the kernel
 * measures in about three minutes: the page said "Analysis timed out" and the part could not be costed at all
 * (uploaded-parts review, Oct 2026). 120 s plus 6 s a megabyte, capped at 10 minutes.
 */
export const GEOMETRY_TIMEOUT_BASE_MS = 120_000;
export const GEOMETRY_TIMEOUT_PER_MB_MS = 6_000;
export const GEOMETRY_TIMEOUT_MAX_MS = 600_000;

export function geometryTimeoutMs(bytes: number): number {
  const ms = GEOMETRY_TIMEOUT_BASE_MS + GEOMETRY_TIMEOUT_PER_MB_MS * Math.max(0, bytes) / 1e6;
  return Math.round(Math.min(GEOMETRY_TIMEOUT_MAX_MS, ms));
}

/** The page waits for the kernel's limit plus a minute for the rules, the response and the upload itself. */
export function analyzeRequestTimeoutMs(bytes: number): number {
  return geometryTimeoutMs(bytes) + 60_000;
}
