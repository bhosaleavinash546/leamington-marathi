/**
 * One naming rule for every file the app hands the user (L6).
 *
 *   <kind>-<part>-<YYYY-MM-DD>.<ext>      e.g. should-cost-bracket-2026-09-28.pdf
 *
 * Lower case, words joined by hyphens, dated. The Excel and the PDF of the same
 * costing used to differ — should-cost-Unnamed-Part.xlsx against
 * should-cost-unnamed-part-2026-09-27.pdf — and the other exports followed
 * three more conventions between them.
 */

/** "Rear Bracket (RH) v2" → "rear-bracket-rh-v2". */
export function fileSlug(s: string | undefined | null, max = 60): string {
  return (s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

/** `part` is optional: a report that covers no single part leaves it out. */
export function exportFilename(kind: string, part: string | undefined | null, ext: string, date: Date = new Date()): string {
  const name = fileSlug(part);
  return [fileSlug(kind), name, date.toISOString().slice(0, 10)].filter(Boolean).join('-') + '.' + ext.replace(/^\./, '');
}
