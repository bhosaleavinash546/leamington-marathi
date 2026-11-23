#!/usr/bin/env python3
"""Round 6 before / after figures for the report (no web). Usage: python3 round-stats.py <before.json> <after.json>"""
import json, sys, collections
def stats(path):
    P = json.load(open(path))['parts']; s = collections.OrderedDict()
    dist = [p for p in P if p['confidence'] == 'distributor']
    nd = lambda p: len({o['distributor'].lower() for o in p.get('observations') or []})
    own = lambda p: 'own breaks' in (p.get('volumeModel') or {}).get('basis', '')
    mx = lambda p: max((o['qty'] for o in p.get('observations') or []), default=0)
    s['parts'] = len(P); s['distributor-priced'] = len(dist); s['estimates'] = len(P) - len(dist)
    s['priced by 2+ distributors'] = sum(nd(p) >= 2 for p in dist)
    s['own volume slope'] = sum(own(p) for p in dist)
    s['generic curve (distributor-priced)'] = sum(not own(p) for p in dist)
    s['read on the live page (round 6)'] = sum(any(o.get('evidence') == 'page-read' for o in p.get('observations') or []) for p in dist)
    s['SMT passives'] = sum(p['category'].startswith('passive') for p in P)
    s['largest published break >= 10k'] = sum(mx(p) >= 10000 for p in dist)
    s['largest published break >= 100k'] = sum(mx(p) >= 100000 for p in dist)
    s['AEC-Q'] = sum(bool(p.get('aecq')) for p in P)
    s['by category'] = dict(collections.Counter(p['category'] for p in P).most_common())
    return s
b, a = stats(sys.argv[1]), stats(sys.argv[2])
for k in a:
    if k == 'by category':
        print('by category:'); [print(f"  {c:16} {b[k].get(c, 0):5} -> {n:5}") for c, n in a[k].items()]
    else: print(f"{k:38} {b[k]:6} -> {a[k]:6}")
