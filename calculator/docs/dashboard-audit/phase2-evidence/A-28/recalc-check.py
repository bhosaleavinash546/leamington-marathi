"""Phase 2 · A-28 (b) / A-27 evidence: recalculate a KPI dashboard workbook in LibreOffice (headless, recalculation
forced on load) and report: formula errors anywhere, every Reconciliation row (dashboard, re-added, check), and how
LibreOffice DISPLAYS negative GBP cells (HTML export of the recalculated book).
    python3 -I recalc-check.py <book.xlsx> <workdir>
Exit 0 when there is no formula error and every Reconciliation row shows ✓."""
import os, sys, subprocess, shutil, re, json, openpyxl

book, work = sys.argv[1], sys.argv[2]
os.makedirs(work, exist_ok=True)
profile = os.path.join(work, 'lo-profile'); user = os.path.join(profile, 'user'); os.makedirs(user, exist_ok=True)
with open(os.path.join(user, 'registrymodifications.xcu'), 'w') as f:
    f.write('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>''')
outdir = os.path.join(work, 'recalc'); shutil.rmtree(outdir, ignore_errors=True); os.makedirs(outdir)
lo = ['soffice', f'-env:UserInstallation=file://{os.path.abspath(profile)}', '--headless', '--calc']
subprocess.run(lo + ['--convert-to', 'xlsx', '--outdir', outdir, book], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
out = os.path.join(outdir, os.path.basename(book))
subprocess.run(lo + ['--convert-to', 'html', '--outdir', outdir, out], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
wb = openpyxl.load_workbook(out, data_only=True)
errs = []
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            if isinstance(v, str) and (v in ('#REF!', '#VALUE!', '#NAME?', '#DIV/0!', '#N/A', '#NUM!', '#NULL!') or v.startswith('Err:')):
                errs.append(f'{ws.title}!{c.coordinate} = {v}')
rc = wb['Reconciliation']
rows = [(r[0].value, r[1].value, r[2].value, r[3].value) for r in rc.iter_rows(min_row=2) if r[3].value in ('✓', '✗')]
html = open(os.path.splitext(out)[0] + '.html', encoding='utf-8', errors='replace').read()
neg_shown = sorted(set(re.findall(r'[−-]£[\d,]+\.\d\d|£-[\d,]+\.\d\d', html)))
res = {'book': os.path.basename(book), 'sheets': len(wb.worksheets), 'formulaErrors': errs, 'reconciliation': rows,
       'failed': [r for r in rows if r[3] != '✓'], 'negativeMoneyAsDisplayed': neg_shown}
print(json.dumps(res, indent=1, ensure_ascii=False, default=str))
sys.exit(1 if errs or res['failed'] or not rows else 0)
