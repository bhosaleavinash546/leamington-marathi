"""
Review pack of a live country run (7-country review, 3 Nov 2026): every part's cost in every country, read off the
reports the tool exported — nothing is re-costed here.

  python3 -I scripts/country-trace/review-pack.py <runDir> <out.xlsx> [out.json]

<runDir>/<CC>/ holds what e2e/cad-to-cost-trace.ts wrote for one country: <part>.xlsx (the tool's own Excel export),
<part>.pdf and trace.json (every live check). From each workbook's 1-Summary it takes the 8 buckets, the total, the
confidence, the band, the tooling investment, the amortisation basis, the stamp and the report's FX (B8, "1 GBP = …").
A figure in £ is the report's local figure ÷ that FX — the same FX the report printed, never a second one.

The workbook it writes:
  Totals        part × country, £ at each report's FX (and the cheapest country per part)
  Local         part × country in the country's own currency, as printed
  Buckets       one row a part a country: the 8 buckets, local and £, with the re-add (sum of buckets = total)
  Checks        live verdicts a country (PASS / FAIL / GAP / INFO) from trace.json
  Basis         stamp, FX, terms, volume and the overhead / packaging basis line, a country
"""
import json, os, re, sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

COUNTRIES = ['UK', 'CN', 'IN', 'PL', 'HU', 'DE', 'SK']
BUCKETS = ['Raw Material', 'Process (Machine)', 'Direct Labour', 'Tooling (amortised)', 'Packaging', 'Logistics',
           'Overhead', 'Supplier Margin']
COMMODITY = {
    'hub-flange-forging': 'Forging', 'knuckle-forging': 'Forging', 'stub-axle-cast-machine': 'Cast + machine',
    'casting-bracket': 'Casting', 'ecu-cover-moulding': 'Injection moulding', 'seat-bracket-sheet': 'Sheet metal',
    'battery-rail-al-extrusion': 'Aluminium extrusion', 'blow-moulding-air-duct': 'Blow moulding',
    'roto-header-tank': 'Rotational moulding', 'thermoforming-trim-cover': 'Thermoforming',
    'composites-hat-stiffener': 'Composites', 'extrusion-vent-pipe': 'Polymer extrusion', 'rubber-grommet': 'Rubber',
    'gear-m3-z38': 'Gear', 'machining-manifold': 'Machining',
}


def read_summary(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb['1-Summary']
    rows = {}
    for r in ws.iter_rows(min_row=1, max_row=80):
        a, b = r[0].value, r[1].value if len(r) > 1 else None
        if isinstance(a, str):
            rows[a.strip()] = b
    def find(prefix):
        for k, v in rows.items():
            if k.startswith(prefix):
                return v
        return None
    fx_text = rows.get('Currency') or ''
    m = re.search(r'1 GBP = ([\d.,]+) ([A-Z]{3})', fx_text)
    fx, ccy = (float(m.group(1).replace(',', '')), m.group(2)) if m else (1.0, 'GBP')
    b = {
        'Raw Material': find('1. Raw Material'), 'Process (Machine)': find('2. Process'),
        'Direct Labour': find('3. Direct Labour'), 'Tooling (amortised)': find('4. Tooling'),
        'Packaging': find('5. Packaging'), 'Logistics': find('6. Logistics'),
        'Overhead': find('7. Overhead'), 'Supplier Margin': find('8. Supplier Margin'),
    }
    return {
        'part': rows.get('Part Name'), 'country': rows.get('Manufacturing Country'), 'stamp': rows.get('Reproducibility'),
        'fx': fx, 'ccy': ccy, 'buckets': b, 'total': find('TOTAL SHOULD COST'),
        'confidence': rows.get('Model confidence'), 'band': rows.get('Uncertainty band'),
        'tooling': find('Total Tooling Cost'), 'amortisation': rows.get('Amortisation basis'),
        'annual': rows.get('Annual Volume'), 'terms': rows.get('Delivery terms'),
        'basis': rows.get('Overhead / packaging / logistics basis'),
    }


def main():
    base, out = sys.argv[1], sys.argv[2]
    out_json = sys.argv[3] if len(sys.argv) > 3 else None
    data, checks = {}, {}
    for cc in COUNTRIES:
        d = os.path.join(base, cc)
        if not os.path.isdir(d):
            continue
        tr = os.path.join(d, 'trace.json')
        if os.path.exists(tr):
            v = {}
            for c in json.load(open(tr)).get('checks', []):
                v[c['verdict']] = v.get(c['verdict'], 0) + 1
            checks[cc] = v
        for f in sorted(os.listdir(d)):
            if f.endswith('.xlsx'):
                data.setdefault(f[:-5], {})[cc] = read_summary(os.path.join(d, f))
    parts = [p for p in COMMODITY if p in data] + [p for p in data if p not in COMMODITY]
    ccs = [c for c in COUNTRIES if any(c in data[p] for p in parts)]

    wb = openpyxl.Workbook()
    bold = Font(bold=True)
    head = PatternFill('solid', fgColor='DDE7E3')
    wrap = Alignment(wrap_text=True, vertical='top')

    def header(ws, cols):
        ws.append(cols)
        for c in ws[ws.max_row]:
            c.font = bold
            c.fill = head

    ws = wb.active
    ws.title = 'Totals'
    ws.append(['Should-cost a part, £ at each report\'s own FX — 200,000 a year, 5-year programme, ex-works (EXW)'])
    ws['A1'].font = Font(bold=True, size=12)
    header(ws, ['Part', 'Commodity'] + ccs + ['Cheapest', 'Cheapest ÷ UK'])
    for p in parts:
        gbp = {c: data[p][c]['total'] / data[p][c]['fx'] for c in ccs if c in data[p] and data[p][c]['total'] is not None}
        lo = min(gbp, key=gbp.get) if gbp else ''
        ws.append([p, COMMODITY.get(p, '')] + [round(gbp[c], 2) if c in gbp else None for c in ccs]
                  + [lo, round(gbp[lo] / gbp['UK'], 2) if lo and 'UK' in gbp else None])
    for row in ws.iter_rows(min_row=3, min_col=3, max_col=2 + len(ccs)):
        for c in row:
            c.number_format = '£#,##0.00'

    ws = wb.create_sheet('Local')
    header(ws, ['Part', 'Commodity'] + [f'{c} ({next((data[p][c]["ccy"] for p in parts if c in data[p]), "")})' for c in ccs])
    for p in parts:
        ws.append([p, COMMODITY.get(p, '')] + [data[p][c]['total'] if c in data[p] else None for c in ccs])

    ws = wb.create_sheet('Buckets')
    header(ws, ['Part', 'Commodity', 'Country', 'Currency', 'FX (per £)'] + BUCKETS
           + ['Total (printed)', 'Sum of buckets', 'Re-adds', 'Total £', 'Material %', 'Confidence', 'Band',
              'Tooling investment (local)', 'Amortisation'])
    for p in parts:
        for c in ccs:
            r = data[p].get(c)
            if not r:
                continue
            vals = [r['buckets'][k] or 0 for k in BUCKETS]
            s = sum(vals)
            ws.append([p, COMMODITY.get(p, ''), c, r['ccy'], r['fx']] + vals
                      + [r['total'], round(s, 4), abs(s - (r['total'] or 0)) < 0.01, round((r['total'] or 0) / r['fx'], 4),
                         round(vals[0] / s, 3) if s else None, r['confidence'], r['band'], r['tooling'], r['amortisation']])

    ws = wb.create_sheet('Checks')
    header(ws, ['Country', 'PASS', 'FAIL', 'GAP', 'INFO'])
    for c in ccs:
        v = checks.get(c, {})
        ws.append([c, v.get('PASS', 0), v.get('FAIL', 0), v.get('GAP', 0), v.get('INFO', 0)])

    ws = wb.create_sheet('Basis')
    header(ws, ['Country', 'Report says', 'Stamp', 'FX', 'Annual volume', 'Delivery terms', 'Overhead / packaging / logistics basis'])
    for c in ccs:
        r = next((data[p][c] for p in parts if c in data[p]), None)
        if r:
            ws.append([c, r['country'], r['stamp'], f"1 GBP = {r['fx']} {r['ccy']}", r['annual'], r['terms'], r['basis']])
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = wrap

    for w in wb.worksheets:
        for i, col in enumerate(w.columns, 1):
            width = max((len(str(c.value)) for c in col if c.value is not None), default=8)
            w.column_dimensions[get_column_letter(i)].width = min(max(10, width + 2), 60)
        w.freeze_panes = 'C3' if w.title == 'Totals' else 'A2'
    wb.save(out)
    if out_json:
        json.dump({'parts': parts, 'countries': ccs, 'data': data, 'checks': checks}, open(out_json, 'w'), indent=1, ensure_ascii=False, default=str)
    bad = [(p, c) for p in parts for c in ccs if c in data[p]
           and abs(sum((data[p][c]['buckets'][k] or 0) for k in BUCKETS) - (data[p][c]['total'] or 0)) >= 0.01]
    print(f'{len(parts)} parts × {len(ccs)} countries; buckets that do not re-add to the total: {bad or "none"}')


if __name__ == '__main__':
    main()
