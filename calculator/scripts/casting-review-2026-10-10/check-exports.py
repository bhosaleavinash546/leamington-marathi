"""
Casting 360 review (10 Oct 2026): read the exported PDF and Excel of a live run and check each fixed finding by its
text — present where the fix says it must be, absent where it was garbage.

  python3 check-exports.py <dir with <label>.pdf / .xlsx> knuckle stub_axle casting_bracket
"""
import re, sys, fitz, openpyxl

d = sys.argv[1]
labels = sys.argv[2:]

def pdf_text(path):
    return '\n'.join(p.get_text() for p in fitz.open(path))

def xlsx_text(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = []
    for ws in wb.worksheets:
        out.append(f'== {ws.title}')
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) for c in row if c is not None]
            if cells: out.append(' | '.join(cells))
    return '\n'.join(out)

# (id, where, must match / must not match, regex)
CHECKS = [
    ('X1',  'pdf',  True,  r'INR \d{1,3}(,\d{3})*\.\d\d'),
    ('X2',  'pdf',  False, r'INR [\d,.]+/part[^\n]*£\d'),
    ('X6',  'pdf',  True,  r'bench \(no machine\s+time\)'),
    ('X10', 'pdf',  False, r'not an estimate'),
    ('X11', 'pdf',  True,  r'Costed weight'),
    ('X12', 'pdf',  True,  r'Values the rules set'),
    ('X12', 'xlsx', True,  r'VALUES THE RULES SET'),
    ('X13', 'pdf',  True,  r'Pattern equipment'),
    ('X13', 'pdf',  True,  r'Amortisation basis'),
    ('X13', 'xlsx', True,  r'Amortisation basis'),
    ('X14', 'pdf',  False, r'lab-uk-'),
    ('X14', 'xlsx', False, r'lab-uk-'),
    ('X15', 'pdf',  True,  r'as recorded, GBP'),
    ('X16', 'pdf',  True,  r'Finish boring'),
    ('X20', 'pdf',  False, r'pocket pass is in the cost either way'),
    ('X21', 'pdf',  True,  r'Melt Loss'),
    ('X24', 'pdf',  False, r'\d\.\d{9,}'),
    ('X27', 'pdf',  False, r'-INR 0\.00|-0\.00'),
    ('X29', 'pdf',  False, r'engine default'),
    ('X29', 'xlsx', False, r'engine default'),
    ('X30', 'pdf',  True,  r'± [\d.]+% \(P10'),
    ('X30', 'xlsx', True,  r'Uncertainty band'),
    ('X31', 'pdf',  False, r'\b\d{7}\.\d\d\b'),
    ('X33', 'pdf',  False, r'\b1 observations'),
    ('X35', 'xlsx', False, r'ALL AVAILABLE LABOUR RATES'),
    ('X36', 'xlsx', True,  r'rules \(per-part services\)'),
    ('X4',  'pdf',  False, r'No material family was confirmed'),
    ('X17', 'pdf',  True,  r'Geometric DFM / DFA'),
]

fails = 0
for lab in labels:
    texts = {'pdf': pdf_text(f'{d}/{lab}.pdf'), 'xlsx': xlsx_text(f'{d}/{lab}.xlsx')}
    open(f'{d}/{lab}.pdf.txt', 'w').write(texts['pdf'])
    open(f'{d}/{lab}.xlsx.txt', 'w').write(texts['xlsx'])
    for cid, where, must, rx in CHECKS:
        hit = re.search(rx, texts[where].replace('\n', ' ') if cid in ('X6', 'X30') else texts[where])
        ok = bool(hit) == must
        if not ok: fails += 1
        print(f'{lab:16s} {cid:4s} {where:4s} {"must" if must else "never":5s} {"OK " if ok else "FAIL"}  /{rx}/'
              + ('' if ok or not hit else f'  → {hit.group(0)[:80]!r}'))
print('FAILS', fails)
