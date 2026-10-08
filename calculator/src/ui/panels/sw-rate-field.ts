/**
 * The software panel's base-rate field (£ / person-month) is an OVERRIDE only when the engineer typed in it.
 *
 * It was always read as one: the field shows the built-in £28,000 until the company rate book has loaded, so an
 * uploaded company base rate never reached a costing in the advanced form (software review P1 #2, Oct 2026).
 * An untyped field leaves `baseRateGBP` unset and the active rate book's base applies.
 */
export const SW_BASE_RATE_FIELDS = ['sw-base-rate', 'wiz-baserate'] as const;

export function baseRateOverride(raw: string | undefined | null, typed: boolean): number | undefined {
  if (!typed) return undefined;
  const v = parseFloat(raw ?? '');
  return Number.isFinite(v) && v > 0 ? v : undefined;
}
