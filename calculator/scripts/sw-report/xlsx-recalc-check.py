"""Recalculate a workbook in LibreOffice (headless, recalculation forced on load) and check it:
no formula errors anywhere, and every row of the Checks sheet shows ✓.
    python3 -I scripts/sw-report/xlsx-recalc-check.py <book.xlsx> <workdir>
Exit 0 when clean. Prints the error cells and failed checks otherwise."""
import os, sys, subprocess, shutil, openpyxl

book, work = sys.argv[1], sys.argv[2]
os.makedirs(work, exist_ok=True)
profile = os.path.join(work, 'lo-profile')
user = os.path.join(profile, 'user')
os.makedirs(user, exist_ok=True)
# Always recalculate OOXML on load (default is "never").
with open(os.path.join(user, 'registrymodifications.xcu'), 'w') as f:
    f.write('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>''')
outdir = os.path.join(work, 'recalc')
shutil.rmtree(outdir, ignore_errors=True); os.makedirs(outdir)
subprocess.run(['soffice', f'-env:UserInstallation=file://{os.path.abspath(profile)}', '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', outdir, book],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
out = os.path.join(outdir, os.path.basename(book))
wb = openpyxl.load_workbook(out, data_only=True)
errs = []
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            if isinstance(v, str) and (v.startswith('#') and v.rstrip('!?0/').upper() in ('#REF', '#VALUE', '#NAME', '#DIV', '#N/A', '#NUM', '#NULL') or v.startswith('Err:') or v in ('#REF!', '#VALUE!', '#NAME?', '#DIV/0!', '#N/A', '#NUM!')):
                errs.append(f'{ws.title}!{c.coordinate} = {v}')
ck = wb['Checks']
rows = [(r[1].value, r[2].value, r[3].value, r[5].value) for r in ck.iter_rows(min_row=9) if r[1].value and r[5].value in ('✓', '✗')]
failed = [x for x in rows if x[3] != '✓']
print(f'{os.path.basename(book)}: {len(wb.worksheets)} sheets, {len(errs)} formula errors, {len(rows)} checks, {len(failed)} failed')
for e in errs[:30]: print('  ERROR', e)
for f_ in failed[:30]: print('  FAILED', f_)
sys.exit(1 if errs or failed or not rows else 0)
