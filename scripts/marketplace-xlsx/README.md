# Idea Marketplace → Excel export

Builds the full marketplace workbook: Cover, an interactive Dashboard, Top 20,
All Ideas, one tab per commodity, Sources, Cost Bridges and a Field Guide.

```bash
node scripts/marketplace-xlsx/extract.mjs /tmp/marketplace.json           # flatten every idea, every field
python3 scripts/marketplace-xlsx/build.py /tmp/marketplace.json exports/BrainSpark-Idea-Marketplace.xlsx
```

**Requirements:** `openpyxl`. To verify the formulas, recalculate with
LibreOffice; this needs the `libreoffice-calc` package.

**Formulas:**
- The £ figures are formulas on the stated figures and on one editable
  EUR→GBP rate (`FX_EUR_GBP` on the Dashboard).
- Every Dashboard figure, and the Top 20, is a COUNTIFS / SUMIFS / LARGE
  formula on the All Ideas tab, driven by the seven filter dropdowns.
- Only Excel-2007-era functions are used, so the workbook works in every
  Excel version.
