/**
 * The CAD screen's annual volume, wherever it is read (7-country review, 3 Nov 2026). After Get cost the CAD screen is
 * swapped for the commodity form, so `#cad-annual-volume` is no longer in the page — and every later reader (the route
 * comparison, a re-analysis) fell back to a literal 100,000: a part costed at 200,000 a year was compared at 100,000.
 * The field when it is drawn; else the value the engineer last gave it (kept across redraws); else the field's own
 * default.
 */
export const CAD_VOLUME_DEFAULT = '100000';

export function cadAnnualVolumeText(field: { value: string } | null | undefined, kept: string | boolean | undefined): string {
  const v = field?.value?.trim();
  if (v) return v;
  if (typeof kept === 'string' && kept.trim()) return kept.trim();
  return CAD_VOLUME_DEFAULT;
}
