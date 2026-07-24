# PDF export QA harness

Renders the analysis-report and RFQ PDFs under Node with a hostile fixture
(Unicode arrows in idea text, 200-word descriptions, 18 ideas, 4-type saving
lists) and scans the output for words drawn past the right margin or page
bottom. Run after ANY change to src/services/export-service.ts:

```bash
npx esbuild src/services/export-service.ts --bundle --format=esm --platform=node \
  --external:jspdf --external:pptxgenjs --external:exceljs \
  --outfile=scripts/pdf-qa/export-service.bundle.mjs
sed -i 's/import jsPDF from "jspdf";/import { jsPDF } from "jspdf";/' scripts/pdf-qa/export-service.bundle.mjs
cd scripts/pdf-qa && node render.mjs && python3 scan.py *.pdf
```

`scan.py` needs `pip install pymupdf`. The bundle + generated PDFs are
gitignored — only the harness itself is tracked.
