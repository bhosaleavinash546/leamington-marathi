import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Regression guard for the recurring "garbage in the PDF" bug.
 *
 * jsPDF's built-in fonts use WinAnsi (CP1252) encoding. Any glyph outside that
 * set — block bars (█ ▓ ■), bullets (● ◑), arrows (→ ←), stars (★), ticks (✓ ✗),
 * the Unicode minus (−, U+2212) — renders as random garbage ("%^%^…") in the
 * exported PDF. These must never appear in strings handed to doc.text()/autoTable.
 *
 * This test fails if any such glyph is present in the PDF-generating source
 * (comments excluded), so the class of bug can't silently come back. WinAnsi-safe
 * punctuation the reports rely on — · (·), — (em dash), § , £, ×, °, ± — is allowed.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Block elements, geometric shapes, arrows, stars, ticks, Unicode minus.
const BROKEN = /[←-⇿∀-⋿█▉▊▋▌▍▎▏▐░▒▓■□●○◐◑★☆✓✔✗✘⬆⬇]/;

function stripComments(src: string): { line: number; text: string }[] {
  return src.split('\n').map((raw, i) => {
    const idx = raw.indexOf('//');
    return { line: i + 1, text: idx >= 0 ? raw.slice(0, idx) : raw };
  });
}

function offenders(src: string, from = 0, to = src.length): string[] {
  return stripComments(src.slice(from, to))
    .filter(l => BROKEN.test(l.text))
    .map(l => `${l.line}: ${l.text.trim()}`);
}

describe('PDF reports use only WinAnsi-safe glyphs (no jsPDF garbage)', () => {
  it('src/export/pdf.ts — shared should-cost & CAD PDF module', () => {
    const src = readFileSync(path.join(root, 'src/export/pdf.ts'), 'utf-8');
    const bad = offenders(src);
    expect(bad, `Non-WinAnsi glyph(s) in export/pdf.ts:\n${bad.join('\n')}`).toEqual([]);
  });

  it('printMasterPDF (src/ui/main.ts) — combined "Export All" report', () => {
    const src = readFileSync(path.join(root, 'src/ui/main.ts'), 'utf-8');
    const start = src.indexOf('function printMasterPDF');
    expect(start).toBeGreaterThan(-1);
    const after = src.indexOf('\nfunction ', start + 25);
    const bad = offenders(src, start, after > -1 ? after : src.length);
    expect(bad, `Non-WinAnsi glyph(s) in printMasterPDF:\n${bad.join('\n')}`).toEqual([]);
  });

  it('exportPCBAnalysisPrint (src/ui/main.ts) — PCB PDF report', () => {
    const src = readFileSync(path.join(root, 'src/ui/main.ts'), 'utf-8');
    const start = src.indexOf('function exportPCBAnalysisPrint');
    expect(start).toBeGreaterThan(-1);
    const after = src.indexOf('\nfunction ', start + 25);
    const bad = offenders(src, start, after > -1 ? after : src.length);
    expect(bad, `Non-WinAnsi glyph(s) in exportPCBAnalysisPrint:\n${bad.join('\n')}`).toEqual([]);
  });
});
