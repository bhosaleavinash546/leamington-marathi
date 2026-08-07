# PDF export QA harness

Renders the analysis-report and RFQ PDFs under Node with a hostile fixture
(Unicode arrows in idea text, 200-word descriptions, 18 ideas, 4-type saving
lists) and scans the output for words drawn past the right margin or page
bottom. Run after ANY change to src/services/export-service.ts:

```bash
npx esbuild src/services/export-service.ts --bundle --format=esm --platform=node \
  --external:jspdf --external:pptxgenjs --external:exceljs \
  --outfile=scripts/pdf-qa/export-service.bundle.mjs
npx esbuild src/services/foresight-report.ts --bundle --format=esm --platform=node \
  --external:jspdf \
  --outfile=scripts/pdf-qa/foresight-report.bundle.mjs
sed -i 's/import jsPDF from "jspdf";/import { jsPDF } from "jspdf";/' scripts/pdf-qa/*.bundle.mjs
cd scripts/pdf-qa && node render.mjs && python3 scan.py *.pdf
```

Also renders the Horizon foresight report (full 75-card register + hostile
AI-layer fixture in fixture-foresight.mjs) — run after any change to
src/services/foresight-report.ts too.

The Innovation Studio report (PDF + Excel) has its own renderer, because it
also has to capture the workbook bytes. Run after any change to
src/services/innovation-report.ts:

```bash
npx esbuild src/services/innovation-report.ts --bundle --format=esm --platform=node \
  --external:jspdf --external:exceljs \
  --outfile=scripts/pdf-qa/innovation-report.bundle.mjs
sed -i 's/import jsPDF from "jspdf";/import { jsPDF } from "jspdf";/;s|const ExcelJS = await import("exceljs");|const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));|' \
  scripts/pdf-qa/innovation-report.bundle.mjs
cd scripts/pdf-qa && node render-innovation.mjs && python3 scan.py BrainSpark_Innovation*.pdf
```

fixture-innovation.mjs carries two payload shapes on purpose — a FAST
function-cost matrix and a TRIZ contradiction — because the report renders
`analysis` generically. If a change quietly shapes the renderer around one
method, the other fixture shows it. The pure helpers behind both are unit
tested in tests/innovation-report-core.test.mjs.

`scan.py` needs `pip install pymupdf`. The bundle + generated PDFs are
gitignored — only the harness itself is tracked.

The DFM / DFA report has its own renderer too. Run after any change to
src/services/dfm-report.ts:

```bash
npx esbuild src/services/dfm-report.ts --bundle --format=esm --platform=node \
  --external:jspdf --external:exceljs \
  --outfile=scripts/pdf-qa/dfm-report.bundle.mjs
sed -i 's/import jsPDF from "jspdf";/import { jsPDF } from "jspdf";/;s|const ExcelJS = await import("exceljs");|const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));|' \
  scripts/pdf-qa/dfm-report.bundle.mjs
cd scripts/pdf-qa && node render-dfm.mjs && python3 scan.py BrainSpark_DFM*.pdf
```

fixture-dfm.mjs deliberately includes the states a layout is most likely to get
wrong: a process family where NOTHING could be evaluated (null score), a finding
the engines could not price, an external cost range that must stay labelled as
literature, and a DFA table whose index is withheld pending human answers.

Two bugs this harness caught that reading the code would not have: wrapped()
re-selects its font on every line, because a page break mid-paragraph leaves
Courier selected by footer() and the rest of the paragraph then draws wider than
it was measured; and pdfSafe is applied at the DRAW boundary, because a literal
arrow typed into a template string in the generator never passes through the
deepPdfSafe applied to the caller's data — jsPDF falls back to UTF-16 and renders
it as letter-spaced garbage off the right margin.
