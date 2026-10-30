"""
Summarise the four-country live run (e2e/cad-to-cost-trace.ts with CV_TRACE_COUNTRY / CV_TRACE_TERMS=EXW).

  python3 scripts/country-trace/live-summary.py <dir with live4c-CN … live4c-HU> [out.md]

Reads each country's trace.json (every check PASS / FAIL / GAP / INFO with its evidence, and each part's headline) and
prints one table a country plus every FAIL in full.
"""
import json, os, sys
from collections import Counter

base = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
lines = []
say = lines.append
heads = {}
for c in ['CN', 'IN', 'PL', 'HU']:
    p = os.path.join(base, f'live4c-{c}', 'trace.json')
    if not os.path.exists(p):
        say(f'## {c}: no trace.json'); continue
    d = json.load(open(p))
    checks = d.get('checks', [])
    v = Counter(ch['verdict'] for ch in checks)
    say(f'## {c} — {v.get("PASS", 0)} PASS · {v.get("FAIL", 0)} FAIL · {v.get("GAP", 0)} GAP · {v.get("INFO", 0)} INFO')
    for part in d.get('results', []):
        heads.setdefault(part.get('part'), {})[c] = part.get('headline')
    by = Counter((ch['part'], ch['verdict']) for ch in checks)
    for part in sorted({ch['part'] for ch in checks}):
        say(f'- {part}: {by[(part, "PASS")]} pass, {by[(part, "FAIL")]} fail')
    for ch in checks:
        if ch['verdict'] == 'FAIL':
            say(f'  - FAIL {ch["part"]} [{ch["ref"]}] {ch["what"]} — {ch["evidence"][:400]}')
say('\n## Headlines (display currency of each country)')
say('| Part | CN | IN | PL | HU |')
say('|---|---|---|---|---|')
for part, h in heads.items():
    say(f'| {part} | ' + ' | '.join(str(h.get(c, '—')) for c in ['CN', 'IN', 'PL', 'HU']) + ' |')
text = '\n'.join(lines)
print(text)
if out: open(out, 'w').write(text + '\n')
