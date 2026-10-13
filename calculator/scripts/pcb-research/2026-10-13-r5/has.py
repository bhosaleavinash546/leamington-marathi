#!/usr/bin/env python3
"""Is a part (or family) already in the catalogue? Usage: python3 has.py MPN [MPN ...]
Prints each match with its confidence and whether it carries distributor observations."""
import json, re, sys, os
cat = json.load(open(os.path.join(os.path.dirname(__file__), '../../../server/data/pcb-component-catalogue.json')))
items = cat['parts'] if isinstance(cat, dict) and 'parts' in cat else cat
items = list(items.values()) if isinstance(items, dict) else items
norm = lambda s: re.sub(r'[^A-Z0-9]', '', str(s).upper())
for q in sys.argv[1:]:
    n = norm(q); hits = []
    for e in items:
        keys = [e.get('mpn', ''), e.get('family', '')] + list(e.get('aliases') or [])
        if any(norm(k) and (norm(k).startswith(n) or n.startswith(norm(k))) for k in keys if len(norm(k)) >= 4):
            hits.append(f"{e['mpn']} [{e.get('confidence')}{', obs' if e.get('observations') else ''}] {e.get('desc','')[:50]}")
    print(f"{q}: " + ('NOT IN CATALOGUE' if not hits else '; '.join(hits[:6])))
