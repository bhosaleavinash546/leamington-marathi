"""
A costing traced step by step from the Excel report the tool exported (7-country review, 3 Nov 2026).

  python3 -I scripts/country-trace/worked-example.py <part.xlsx> [more.xlsx …] [--md out.md] [--json out.json]

Every figure is read off the workbook (what the engineer received) and every step is re-done here from the printed
INPUTS, independently of the tool's own arithmetic:
  1  what was measured and decided      7-Checks "VALUES THE RULES SET" and the answered questions
  2  material                           gross kg × price/kg − scrap credit + process energy = bucket 1
  3  each operation                     rate × cycle ÷ OEE ÷ parts a cycle = process £;
                                        labour rate × time × manning ÷ efficiency ÷ parts a cycle = labour £
  4  tooling                            tool investment ÷ amortisation volume = bucket 4
  5  packaging and logistics            as printed (logistics 0 ex-works)
  6  overhead                           12 % (the printed rate) × (material + process + labour + tooling)
  7  margin                             8 % (the printed rate) × (factory cost + overhead)
  8  total                              the sum of the 8 buckets
A step "holds" when the re-done figure equals the printed one to ½ of the last printed unit (a 0.5 p tolerance on
£ figures). Nothing here calls the tool.
"""
import json, re, sys

import openpyxl

TOL = 0.006   # local currency units: the report prints to ≥ 4 dp; a pence-level slack for rounding of inputs


def num(v):
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r'-?\d[\d,]*(?:\.\d+)?', str(v))
    return float(m.group(0).replace(',', '')) if m else None


def sheet_rows(ws):
    return [[c.value for c in r] for r in ws.iter_rows()]


def trace(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    s = {}
    for r in sheet_rows(wb['1-Summary']):
        if isinstance(r[0], str):
            s[r[0].strip()] = r[1]
    get = lambda p: next((v for k, v in s.items() if k.startswith(p)), None)
    sym = (re.search(r'1 GBP = [\d.,]+ ([A-Z]{3})', s.get('Currency') or '') or [None, 'GBP'])[1]
    out = {'file': path, 'part': s.get('Part Name'), 'country': s.get('Manufacturing Country'), 'ccy': sym,
           'stamp': s.get('Reproducibility'), 'steps': [], 'holds': True}

    def step(n, what, formula, redone, printed):
        ok = printed is None or redone is None or abs(redone - printed) <= TOL + 1e-6 * abs(printed)
        out['steps'].append({'n': n, 'what': what, 'formula': formula,
                             'redone': None if redone is None else round(redone, 6),
                             'printed': printed, 'holds': ok})
        out['holds'] = out['holds'] and ok

    # 1 — measured and decided
    rows = sheet_rows(wb['7-Checks'])
    decided, answers, mode = [], [], None
    for r in rows:
        a = r[0]
        if a in ('DECISIONS', 'VALUES THE RULES SET', 'CONSISTENCY CHECKS', 'ARITHMETIC CHECKS'):
            mode = a
            continue
        if mode == 'DECISIONS' and a and a != 'Question' and r[2]:
            answers.append(f'{a} → {r[2]}')
        if mode == 'VALUES THE RULES SET' and a and a != 'Field' and r[1] is not None:
            decided.append(f'{a} = {r[1]} ({r[3]})')
    out['answers'] = answers
    out['decided'] = decided

    # 2 — material
    m = {r[0]: r[1] for r in sheet_rows(wb['2-Material']) if isinstance(r[0], str)}
    gross, price = num(m.get('Gross Weight (material bought)')), num(m.get('Material Price'))
    gross_cost, credit = num(m.get('Gross Material Cost')), num(m.get('Scrap Credit')) or 0
    energy, net = num(m.get('Process energy')) or 0, num(m.get('NET RAW MATERIAL COST'))
    if gross is not None and price is not None and gross_cost is not None and (m.get('Gross Material Cost') or 0) != 0:
        step(2, f"material bought: {m.get('Grade / Description')}", f'{gross} kg × {price}/kg', gross * price, gross_cost)
    note = next((r[3] for r in sheet_rows(wb['2-Material']) if r[0] == 'Scrap Credit'), None)
    sc = re.search(r'= ([\d.,]+) kg × \D?([\d.,]+)/kg', str(note or ''))
    if sc and credit:
        step(2, 'scrap credit', f'{sc.group(1)} kg × {sc.group(2)}/kg', -float(sc.group(1).replace(',', '')) * float(sc.group(2).replace(',', '')), credit)
    mrows = [r for r in sheet_rows(wb['2-Material']) if isinstance(r[0], str)]
    extras = [(r[0], num(r[1])) for r in mrows if r[0].startswith('Consumable')]
    direct = num(m.get('Direct material cost'))
    if direct is not None:
        # a module-priced material (composites, gear blank): its itemised lines "a × £b" must add to it
        items = [r for r in mrows if r[0].startswith('   ')]
        for r in items:
            f = re.search(r'([\d.,]+) × \D?([\d.,]+)', str(r[3] or ''))
            if f:
                step(2, r[0].strip(), f'{f.group(1)} × {f.group(2)}', float(f.group(1).replace(',', '')) * float(f.group(2).replace(',', '')), num(r[1]))
        if items:
            step(2, 'direct material = its lines', ' + '.join(str(num(r[1])) for r in items), sum(num(r[1]) or 0 for r in items), direct)
        else:
            out.setdefault('gaps', []).append('direct material cost printed without its arithmetic')
        gross_cost = direct
    extra = sum(v or 0 for _, v in extras)
    step(2, 'net raw material = bucket 1',
         f'{gross_cost} {credit:+} (scrap credit)' + ''.join(f' {v:+} ({k.split("—")[-1].strip()})' for k, v in extras) + f' {energy:+} (process energy)',
         (gross_cost or 0) + credit + extra + energy, net)
    step(2, 'bucket 1 on the summary', 'material sheet total', net, num(get('1. Raw Material')))

    # 3 — operations
    ops = sheet_rows(wb['3-Operations'])
    hdr = next(i for i, r in enumerate(ops) if r and r[0] == 'Operation')
    cols = {v: i for i, v in enumerate(ops[hdr]) if v}
    proc_sum = lab_sum = 0.0
    for r in ops[hdr + 1:]:
        if not r or not r[0] or r[0] == 'TOTAL':
            continue
        g = lambda k: num(r[cols[k]]) if k in cols else None
        rate, cyc, ppc, oee, pc = g('Machine Rate (/hr)'), g('Cycle Time (hr)'), g('Parts/Cycle') or 1, g('OEE') or 1, g('Process Cost')
        lr, lt, man, eff, lc = g('Labour Rate (/hr)'), g('Labour Time (hr)'), g('Manning'), g('Labour Efficiency') or 1, g('Labour Cost')
        if rate is not None and cyc is not None and pc is not None:
            step(3, f'{r[0]} — machine', f'{rate}/h × {cyc} h ÷ {oee} OEE ÷ {ppc:g} a cycle', rate * cyc / oee / ppc, pc)
        if lr is not None and lt is not None and lc is not None:
            step(3, f'{r[0]} — labour', f'{lr}/h × {lt} h × {man} crew ÷ {eff} efficiency ÷ {ppc:g} a cycle',
                 lr * lt * (man if man is not None else 1) / eff / ppc, lc)
        proc_sum += pc or 0
        lab_sum += lc or 0
    step(3, 'operations = bucket 2 (process)', 'sum of machine £', proc_sum, num(get('2. Process')))
    step(3, 'operations = bucket 3 (labour)', 'sum of labour £', lab_sum, num(get('3. Direct Labour')))

    # 4 — tooling
    tool, vol = num(get('Total Tooling Cost')), num(get('Amortisation Volume'))
    if tool is not None and vol:
        step(4, f"tooling over the programme ({s.get('Amortisation basis')})", f'{tool:,.2f} ÷ {vol:,.0f} parts',
             tool / vol, num(get('4. Tooling')))

    # 5–8 — packaging, logistics, overhead, margin, total
    b = [num(get(p)) or 0 for p in ('1. Raw Material', '2. Process', '3. Direct Labour', '4. Tooling', '5. Packaging',
                                     '6. Logistics', '7. Overhead', '8. Supplier Margin')]
    step(5, 'packaging (as printed) + logistics', f"{b[4]} + {b[5]} ({'ex-works' if 'Ex-works' in str(s.get('Delivery terms')) else 'delivered'})",
         None, None)
    oh_label = next((k for k in s if k.startswith('7. Overhead')), '')
    oh_pct = num(re.search(r'([\d.]+)%', oh_label).group(1)) / 100 if re.search(r'([\d.]+)%', oh_label) else None
    base = b[0] + b[1] + b[2] + b[3]
    if oh_pct is not None:
        step(6, f'overhead {oh_pct:.1%} of material + process + labour + tooling', f'{oh_pct} × {base:.6f}', oh_pct * base, b[6])
    mg_label = next((k for k in s if k.startswith('8. Supplier Margin')), '')
    mg_pct = num(re.search(r'([\d.]+)%', mg_label).group(1)) / 100 if re.search(r'([\d.]+)%', mg_label) else None
    sub = sum(b[:7])
    if mg_pct is not None:
        step(7, f'margin {mg_pct:.1%} of the subtotal', f'{mg_pct} × {sub:.6f}', mg_pct * sub, b[7])
    step(8, 'total = the 8 buckets', ' + '.join(f'{x:.4f}' for x in b), sum(b), num(get('TOTAL SHOULD COST')))
    out['total'] = num(get('TOTAL SHOULD COST'))
    return out


def md(t):
    L = [f"### {t['part']} — {t['country']}", '', f"Stamp: {t['stamp']}. Currency {t['ccy']}.", '']
    if t['answers']:
        L.append('Answered: ' + '; '.join(t['answers']) + '.')
        L.append('')
    if t['decided']:
        L.append('Set by the rules from the measured part: ' + '; '.join(t['decided'][:12]) + ('; …' if len(t['decided']) > 12 else '') + '.')
        L.append('')
    L += ['| Step | What | Arithmetic | Re-done | Printed | Holds |', '|---|---|---|---|---|---|']
    for s in t['steps']:
        L.append(f"| {s['n']} | {s['what']} | {s['formula']} | {'' if s['redone'] is None else s['redone']} | "
                 f"{'' if s['printed'] is None else s['printed']} | {'✓' if s['holds'] else '✗'} |")
    L.append('')
    return '\n'.join(L)


def main():
    args = sys.argv[1:]
    out_md = args[args.index('--md') + 1] if '--md' in args else None
    out_json = args[args.index('--json') + 1] if '--json' in args else None
    files = [a for i, a in enumerate(args) if a.endswith('.xlsx') and (i == 0 or args[i - 1] not in ('--md', '--json'))]
    traces = [trace(f) for f in files]
    bad = [(t['part'], t['country'], s['what']) for t in traces for s in t['steps'] if not s['holds']]
    steps = sum(len(t['steps']) for t in traces)
    print(f'{len(traces)} costings, {steps} steps re-done, {len(bad)} do not hold')
    for b in bad[:40]:
        print('  ✗', *b)
    if out_md:
        open(out_md, 'w').write('\n'.join(md(t) for t in traces))
    if out_json:
        json.dump(traces, open(out_json, 'w'), indent=1, ensure_ascii=False, default=str)


if __name__ == '__main__':
    main()
