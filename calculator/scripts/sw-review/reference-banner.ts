/**
 * "Reference example" banner for the static software reports (software review P2 #14).
 *
 * The Study / Benchmark / Deep-Dive / All-Models / per-vehicle pages are HTML written once by gen-sw-report.ts,
 * gen-l460-deepdive.ts and gen-allmodels-deepdive.ts. They are not the live calculation and do not change when the
 * model or the rate book does, so each one says so at the top. The generators call withReferenceBanner; run this file
 * to stamp the reports already in the repo (idempotent — the marker attribute is checked first):
 *
 *   npx tsx scripts/sw-review/reference-banner.ts public/reports/*.html docs/*-software-cost-breakdown.html ...
 */
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REFERENCE_MARKER = 'data-cv-reference-example';

export function referenceBannerHTML(generated: string): string {
  return `<div ${REFERENCE_MARKER} role="note" style="position:sticky;top:0;z-index:9999;background:#fef3c7;color:#78350f;border-bottom:1px solid #f59e0b;padding:8px 16px;font:600 13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif">`
    + `Reference example — a static report generated ${generated}. It is not the live calculation: its figures do not follow `
    + `later model fixes or your rate book. Re-run the costing in CostVision for current figures, and see its Excel / PDF `
    + `export for the rate basis.</div>`;
}

/** Insert the banner right after <body …> (or at the top when there is no body tag). Idempotent. */
export function withReferenceBanner(html: string, generated = new Date().toISOString().slice(0, 10)): string {
  if (html.includes(REFERENCE_MARKER)) return html;
  const banner = referenceBannerHTML(generated);
  const m = html.match(/<body[^>]*>/i);
  return m ? html.replace(m[0], m[0] + banner) : banner + html;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let n = 0;
  for (const f of process.argv.slice(2)) {
    const html = fs.readFileSync(f, 'utf8');
    // Files already in the repo predate the October 2026 P1 / P2 fixes.
    const out = withReferenceBanner(html, 'before the October 2026 model fixes');
    if (out !== html) { fs.writeFileSync(f, out); n++; }
  }
  console.log(`stamped ${n} file(s)`);
}
