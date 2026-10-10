import sys, re, glob, os, json
d = sys.argv[1]
pats = {
 '£amount (non-UK)': r'£\s?\d',
 'INR in CN': r'\bINR\b|₹',
 'CNY in IN': r'\bCNY\b|¥',
 'regional-rates.ts': r'regional-rates\.ts|country-book\.ts|uk-book\.ts',
 'screen/headless jargon': r'screen had|headless',
 'GBP as recorded': r'as recorded, GBP',
 'FX 1.0000 GBP': r'1\.0000 GBP',
 'benchmark 2026-09': r'benchmark 2026-09',
 'note starts UK (held)': r'(?m)^UK book',
 'pounds': r'\bpounds\b',
}
rows = []
for f in sorted(glob.glob(os.path.join(d, '*.txt'))):
    lab = os.path.basename(f); cc = lab[:2]; t = open(f).read()
    r = {'file': lab}
    for k, p in pats.items():
        if k == '£amount (non-UK)' and cc == 'UK': r[k] = '-'; continue
        if k == 'INR in CN' and cc != 'CN': r[k] = '-'; continue
        if k == 'CNY in IN' and cc != 'IN': r[k] = '-'; continue
        r[k] = len(re.findall(p, t))
    r['pdf pages'] = t.count('--- page ') if lab.endswith('.pdf.txt') else '-'
    rows.append(r)
tot = {k: sum(r[k] for r in rows if isinstance(r[k], int)) for k in pats}
print(json.dumps({'totals': tot, 'rows': rows}, indent=0, ensure_ascii=False))
