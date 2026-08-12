/**
 * Export the "AI CAD-to-Cost Analysis" PDF headlessly for every Arm-B capture,
 * using the REAL renderer (src/export/pdf.ts::printCADAnalysisPDF) — not a
 * reimplementation. That report's §7 prints the model's raw costRange as
 * headline money, which is one of the things under audit, so the audit needs
 * the genuine artefact.
 *
 *   npx tsx scripts/cad-audit-report.ts <runs-dir> <out-dir>
 *
 * jsPDF's save() assumes a browser; its prototype is redirected to write the
 * bytes to disk instead. The document content is untouched.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import { jsPDF } from 'jspdf';
import { printCADAnalysisPDF } from '../src/export/pdf.js';
import type { CADAnalysisResult } from '../src/engine/ai-analysis.js';

// Under tsx the ESM and CJS builds of jspdf can BOTH be live (dual-package
// hazard): pdf.ts may hold a different class object than this script's import,
// in which case patching one prototype intercepts nothing. Patch both.
const jsPDF_CJS = (createRequire(import.meta.url)('jspdf') as { jsPDF: typeof jsPDF }).jsPDF;

const [runsDir, outDir] = process.argv.slice(2);
if (!runsDir || !outDir) {
  console.error('usage: tsx scripts/cad-audit-report.ts <runs-dir> <out-dir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

let current = '';
function interceptSave(this: jsPDF, _name: string): void {
  const out = join(outDir, `${current}-cadanalysis.pdf`);
  writeFileSync(out, Buffer.from(this.output('arraybuffer') as ArrayBuffer));
  console.log(`  ${out}`);
}
(jsPDF.prototype as unknown as { save: typeof interceptSave }).save = interceptSave;
(jsPDF_CJS.prototype as unknown as { save: typeof interceptSave }).save = interceptSave;

for (const f of readdirSync(runsDir).sort()) {
  if (!f.endsWith('.json') || f.startsWith('armA')) continue;
  const cap = JSON.parse(readFileSync(join(runsDir, f), 'utf8'));
  const analysis = cap?.response?.analysis as CADAnalysisResult | undefined;
  if (!analysis?.costInputSuggestions) continue;
  current = basename(f, '.json');
  try {
    printCADAnalysisPDF(analysis, null, 'GBP', 1);
  } catch (e) {
    console.error(`  FAILED ${current}: ${(e as Error).message}`);
  }
}
