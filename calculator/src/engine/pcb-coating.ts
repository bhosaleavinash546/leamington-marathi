/**
 * The coated share of a side (BMW inverter review, 26 Nov 2026): a selectively coated board pays for the coated area,
 * not the whole side. `coatedAreaPct` is typed on the PCB form (1–100); blank or out of range = the whole side (1).
 * One helper for Stage 4 (server) and the screen's country re-cost, so both charge the same area.
 */
export function coatedShare(pct: unknown): number {
  const p = Number(pct);
  return pct !== '' && pct != null && Number.isFinite(p) && p >= 1 && p <= 100 ? p / 100 : 1;
}
