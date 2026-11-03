"""
Scan the exported reports of a live country run for garbage (7-country review, 3 Nov 2026).

  python3 -I scripts/country-trace/report-scan.py <runDir> [out.json]

<runDir> holds one folder a country (<CC>/ with <part>.pdf, <part>.xlsx and trace.json from e2e/cad-to-cost-trace.ts).
Each report is read as text (pdftotext -layout; every Excel cell by openpyxl) and checked for:
  - placeholders a renderer leaked: undefined, NaN, null, [object, Infinity, a bare "e+" number;
  - a library id on the page (mach-…, lab-…, mat-…, energy-…, oh-…) or an enum in snake_case where a name belongs;
  - money in the wrong currency: a "£" in a non-£ country's report, or that country's symbol twice in a row;
  - rate-book plumbing: "| Refresh", "Was £", "as recorded, GBP";
  - the reproducibility stamp naming another country's rate book;
  - the volume and terms the run asked for (200,000 a year, ex-works) not stated.
Every hit carries the line it was found on, so a person can judge it. Nothing here is a cost; it reads what was printed.
"""
import json, os, re, subprocess, sys
from collections import Counter, defaultdict

import openpyxl

SYMBOL = {'UK': '£', 'CN': '¥', 'IN': '₹', 'PL': 'zł', 'HU': 'Ft', 'DE': '€', 'SK': '€', 'AT': '€', 'CZ': 'Kč',
          'JP': '¥', 'KR': '₩', 'US': '$', 'VN': '₫'}
NAME = {'UK': 'United Kingdom', 'CN': 'China', 'IN': 'India', 'PL': 'Poland', 'HU': 'Hungary', 'DE': 'Germany',
        'SK': 'Slovakia'}

CHECKS = [
    ('placeholder', re.compile(r'\b(undefined|NaN|Infinity)\b|\[object |\bnull\b(?! hypothesis)')),
    ('exp-number', re.compile(r'\b\d\.\d+e[+-]\d+\b')),
    ('library-id', re.compile(r'\b(mach|lab|mat|energy|oh|tool|cons)-[a-z0-9]+(?:-[a-z0-9]+)+\b')),
    ('snake-enum', re.compile(r'\b(?:injection_moulding|sheet_metal|cast_and_machine|blow_moulding|rotational_moulding|'
                              r'aluminium_extrusion|sheet_metal_fab|wiring_harness|battery_pack|e_motor)\b')),
    ('rate-plumbing', re.compile(r'\| Refresh|Was £|as recorded, GBP')),
]


def pdf_lines(path):
    out = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=False).stdout
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def xlsx_lines(path):
    wb = openpyxl.load_workbook(path, data_only=False)
    lines = []
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.strip():
                    lines.append(f'{ws.title}!{c.coordinate}: {c.value.strip()}')
    return lines


def scan(cc, kind, lines):
    hits = []
    sym = SYMBOL.get(cc, '£')
    for ln in lines:
        for name, rx in CHECKS:
            if rx.search(ln):
                hits.append((name, ln[:240]))
        if cc != 'UK' and '£' in ln and not re.search(r'£1 = |\(£|GBP|£/', ln):
            hits.append(('pound-in-local-report', ln[:240]))
        if sym != '£' and re.search(re.escape(sym) + r'\s*' + re.escape(sym), ln):
            hits.append(('double-symbol', ln[:240]))
        m = re.search(r'[Rr]ate book[^·|]*?\b(United Kingdom|China|India|Poland|Hungary|Germany|Slovakia|UK)\b', ln)
        if m and cc in NAME and m.group(1) not in (NAME[cc], cc):
            hits.append(('stamp-country', ln[:240]))
    text = '\n'.join(lines)
    if kind == 'pdf':
        if not re.search(r'200,000', text):
            hits.append(('volume-not-stated', '200,000 not found'))
        if not re.search(r'[Ee]x-works|EXW', text):
            hits.append(('terms-not-stated', 'ex-works not found'))
    return hits


def main():
    base = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    result = defaultdict(dict)
    totals = Counter()
    for cc in sorted(os.listdir(base)):
        d = os.path.join(base, cc)
        if not (os.path.isdir(d) and re.fullmatch(r'[A-Z]{2}', cc)):
            continue
        for f in sorted(os.listdir(d)):
            kind = 'pdf' if f.endswith('.pdf') else 'xlsx' if f.endswith('.xlsx') else None
            if not kind:
                continue
            lines = pdf_lines(os.path.join(d, f)) if kind == 'pdf' else xlsx_lines(os.path.join(d, f))
            hits = scan(cc, kind, lines)
            result[cc][f] = hits
            for h in hits:
                totals[(cc, h[0])] += 1
    for (cc, name), n in sorted(totals.items()):
        print(f'{cc}  {name:24s} {n}')
    seen = set()
    for cc, files in result.items():
        for f, hits in files.items():
            for name, ln in hits:
                key = (name, re.sub(r'[\d.,]+', '#', ln)[:120])
                if key in seen:
                    continue
                seen.add(key)
                print(f'  [{cc} {f}] {name}: {ln}')
    if out:
        json.dump(result, open(out, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
