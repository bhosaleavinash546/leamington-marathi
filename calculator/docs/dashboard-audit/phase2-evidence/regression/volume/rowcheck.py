"""Phase 2 · Step 5: rows in the 50,000-record exports (as Phase 1's 32-perf-export-rowcheck.txt).
   python3 -I rowcheck.py <download dir> ..."""
import sys, glob, csv, os, openpyxl
csv.field_size_limit(10**9)
for d in sys.argv[1:]:
    x = glob.glob(os.path.join(d, '*.xlsx'))[0]; c = glob.glob(os.path.join(d, '*.csv'))[0]; p = glob.glob(os.path.join(d, '*.pdf'))[0]
    wb = openpyxl.load_workbook(x, read_only=True)
    sheets = {ws.title: sum(1 for _ in ws.iter_rows(values_only=True)) for ws in wb.worksheets}
    with open(c, encoding='utf-8-sig', newline='') as f: n = sum(1 for _ in csv.reader(f)) - 1
    print(os.path.basename(d), 'xlsx sheets', sheets, '| csv data rows', n, '| pdf bytes', os.path.getsize(p))
