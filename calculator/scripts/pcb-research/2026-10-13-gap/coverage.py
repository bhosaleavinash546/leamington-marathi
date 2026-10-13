#!/usr/bin/env python3
"""Catalogue coverage before / after round 4: parts by category, distributor-priced, AEC-Q, with 2+ distributors.
Usage: python3 coverage.py <before.json> <after.json>"""
import json, sys, collections
def load(p):
    d = json.load(open(p)); return d['parts'] if isinstance(d, dict) else d
def stats(parts):
    s = collections.defaultdict(lambda: collections.Counter())
    for e in parts:
        c = e['category']; s[c]['parts'] += 1
        if e.get('confidence') == 'distributor': s[c]['dist'] += 1
        if e.get('aecq'): s[c]['aecq'] += 1
        if len({o['distributor'].lower() for o in e.get('observations') or []}) >= 2: s[c]['two'] += 1
    return s
b, a = stats(load(sys.argv[1])), stats(load(sys.argv[2]))
print(f"| Category | Parts before | Parts after | Distributor-priced before → after | AEC-Q after | 2+ distributors after |")
print("|---|---|---|---|---|---|")
tot = collections.Counter(); totb = collections.Counter()
for c in sorted(set(a) | set(b), key=lambda k: -a[k]['parts']):
    print(f"| {c} | {b[c]['parts']} | {a[c]['parts']} | {b[c]['dist']} → {a[c]['dist']} | {a[c]['aecq']} | {a[c]['two']} |")
    tot += a[c]; totb += b[c]
print(f"| **Total** | **{totb['parts']}** | **{tot['parts']}** | **{totb['dist']} → {tot['dist']}** | **{tot['aecq']}** | **{tot['two']}** |")
