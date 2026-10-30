"""
Summarise a live country run (e2e/cad-to-cost-trace.ts with CV_TRACE_COUNTRY / CV_TRACE_TERMS=EXW).

  python3 scripts/country-trace/live-summary.py <dir> [out.md] [out.json]

<dir> holds one folder a country — either live4c-<CC> (the four-country run) or <CC> (the world round, 30 Oct 2026) —
each with its trace.json (every check PASS / FAIL / GAP / INFO with its evidence, and each part's headline in that
country's display currency). Prints one line a country, every FAIL in full, and the headlines in local currency and
in £ at the country's own book FX (REGIONAL_DATA.fxToGBP via world-2026-10/summary.json — never a second FX).
"""
import json, os, re, sys
from collections import Counter

base = sys.argv[1]
out_md = sys.argv[2] if len(sys.argv) > 2 else None
out_json = sys.argv[3] if len(sys.argv) > 3 else None
here = os.path.dirname(os.path.abspath(__file__))
fx = {r['region']: (r['fxToGBP'], r['currency'], r['name'])
      for r in json.load(open(os.path.join(here, '..', 'rate-refresh', 'world-2026-10', 'summary.json')))}

dirs = {}
for name in sorted(os.listdir(base)):
    m = re.fullmatch(r'(?:live4c-)?([A-Z]{2})', name)
    if m and os.path.exists(os.path.join(base, name, 'trace.json')):
        dirs[m.group(1)] = os.path.join(base, name, 'trace.json')
order = [r for r in fx if r in dirs]

lines, say = [], None
say = lines.append
rows, heads = {}, {}
say('| Country | PASS | FAIL | GAP | INFO | Parts costed |')
say('|---|---|---|---|---|---|')
fails = []
for c in order:
    d = json.load(open(dirs[c]))
    checks = d.get('checks', [])
    v = Counter(ch['verdict'] for ch in checks)
    res = d.get('results', [])
    costed = sum(1 for r in res if r.get('headline'))
    rate, cur, name = fx[c]
    hl = {r['part']: r.get('headline') for r in res}
    def gbp(x):
        try: return round(float(str(x).replace(',', '')) / rate, 2)
        except (TypeError, ValueError): return None
    rows[c] = {'name': name, 'currency': cur, 'fxToGBP': rate, 'pass': v.get('PASS', 0), 'fail': v.get('FAIL', 0),
               'gap': v.get('GAP', 0), 'info': v.get('INFO', 0), 'parts': len(res), 'costed': costed,
               'headlines': hl, 'headlinesGbp': {p: gbp(x) for p, x in hl.items()},
               'fails': [{'part': ch['part'], 'ref': ch['ref'], 'what': ch['what'], 'evidence': ch['evidence'][:400]}
                         for ch in checks if ch['verdict'] == 'FAIL']}
    for p, x in hl.items(): heads.setdefault(p, {})[c] = x
    say(f'| {name} ({c}) | {v.get("PASS", 0)} | {v.get("FAIL", 0)} | {v.get("GAP", 0)} | {v.get("INFO", 0)} | {costed} / {len(res)} |')
    fails += [(c, f) for f in rows[c]['fails']]
tot = Counter()
for r in rows.values(): tot.update({k: r[k] for k in ('pass', 'fail', 'gap', 'info', 'costed', 'parts')})
say(f'| **All {len(rows)} countries** | {tot["pass"]} | {tot["fail"]} | {tot["gap"]} | {tot["info"]} | {tot["costed"]} / {tot["parts"]} |')
say('\n## Every FAIL')
for c, f in fails or []:
    say(f'- {c} {f["part"]} [{f["ref"]}] {f["what"]} — {f["evidence"]}')
if not fails: say('- none')
say('\n## Headlines in £ at each book\'s FX (ex-works)')
say('| Part | ' + ' | '.join(order) + ' |')
say('|---|' + '---|' * len(order))
for p in heads:
    say(f'| {p} | ' + ' | '.join(str(rows[c]['headlinesGbp'].get(p) or '—') for c in order) + ' |')
text = '\n'.join(lines)
print(text)
if out_md: open(out_md, 'w').write(text + '\n')
if out_json: json.dump(rows, open(out_json, 'w'), indent=1, ensure_ascii=False)
