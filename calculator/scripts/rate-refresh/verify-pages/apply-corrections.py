#!/usr/bin/env python3
"""
Apply the page re-check's corrections (30 Oct 2026) to the research files the rate books are built from.

  python3 -I scripts/rate-refresh/verify-pages/apply-corrections.py          # dry run: what would change
  python3 -I scripts/rate-refresh/verify-pages/apply-corrections.py --write

`corrections.json` lists each correction an independent verifier found on the cited page (verdicts/<book>.json):
{ file, key, value, why }. The research item keeps its history: `value` becomes the page's figure, `corrected`
records the old value, the date and why, and the basis is prefixed so every book note that quotes it says so.
Re-running is a no-op (an item already at the corrected value is skipped). Then re-run the book's build-config.py and
scripts/country-book.ts — the books move only through their configs.
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RR = os.path.dirname(HERE)
WRITE = '--write' in sys.argv
fixes = json.load(open(os.path.join(HERE, 'corrections.json')))
by_file = {}
for f in fixes: by_file.setdefault(f['file'], []).append(f)
for path, fs in by_file.items():
    d = json.load(open(os.path.join(RR, path)))
    items = {i['key']: i for i in d['items']}
    for f in fs:
        it = items.get(f['key'])
        if it is None: raise SystemExit(f"{path}: no item {f['key']}")
        if it.get('value') == f['value']: print(f"  = {f['key']} already {f['value']}"); continue
        print(f"  {path} {f['key']}: {it.get('value')} → {f['value']}  ({f['why'][:100]})")
        it['corrected'] = {'was': it.get('value'), 'on': '2026-10-30', 'why': f['why'], 'verdicts': f.get('verdicts', '')}
        it['basis'] = f"CORRECTED 30 Oct 2026 on a page re-check (was {it.get('value')}): {f['why']} — original basis: {it.get('basis', '')}"
        it['value'] = f['value']
        it['verify'] = False
    if WRITE: json.dump(d, open(os.path.join(RR, path), 'w'), indent=1, ensure_ascii=False)
print('written' if WRITE else 'dry run (add --write)')
