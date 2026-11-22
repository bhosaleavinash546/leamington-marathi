#!/usr/bin/env python3
"""Second discovery pass: is a code / family already in the catalogue (EXACT code, alias or family key) or already
found by the first pass (discovery/consolidated.json)?  Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/seen.py CODE [CODE ...]
Prints NEW, or where it was seen. has.py prefix-matches other family members; this one does not."""
import json, re, sys, os
H = os.path.dirname(os.path.abspath(__file__))
n = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
cat = json.load(open(os.path.join(H, '../../../server/data/pcb-component-catalogue.json')))['parts']
C = {}
for e in cat:
    for k in [e.get('mpn'), e.get('family')] + list(e.get('aliases') or []):
        if len(n(k)) >= 4: C.setdefault(n(k), f"CATALOGUE {e['mpn']} [{e['confidence']}]")
D = {}
p = os.path.join(H, 'discovery', 'consolidated.json')
for c in (json.load(open(p)) if os.path.exists(p) else []):
    for k in (c.get('orderableCode'), c.get('family')):
        if len(n(k)) >= 4: D.setdefault(n(k), f"FOUND in first pass ({c['domain']})")
for q in sys.argv[1:]:
    k = n(q); hit = C.get(k) or D.get(k)
    if not hit:  # a family key typed without suffix: is some first-pass / catalogue code an extension of it?
        ext = [v for kk, v in list(C.items()) + list(D.items()) if len(k) >= 5 and kk.startswith(k)]
        hit = ('family seen: ' + ext[0]) if ext else None
    print(f"{q}: {hit or 'NEW'}")
