#!/usr/bin/env python3
"""Apply review-decisions.json to raw/*.json and write the cleaned research files the merge reads.
Every decision is written into the part's notes ("Review 13 Oct 2026: ..."), so the catalogue entry says what was removed."""
import json, glob, os
D = os.path.dirname(os.path.abspath(__file__))
dec = json.load(open(os.path.join(D, 'review-decisions.json')))['decisions']
used = set()
def matches(o, m):
    return all(str(o.get(k)).upper() == str(v).upper() for k, v in m.items())
for f in sorted(glob.glob(os.path.join(D, 'raw', '*.json'))):
    j = json.load(open(f))
    for p in j.get('parts', []):
        for i, d in enumerate(dec):
            if d['mpn'] != p['mpn']: continue
            used.add(i)
            obs = p.get('observations') or []
            if d['action'] == 'dropPart':
                p['observations'] = []
            elif d['action'] == 'dropObs':
                p['observations'] = [o for o in obs if not matches(o, d['match'])]
            elif d['action'] == 'setObs':
                p['observations'] = d['observations']
            p['notes'] = ((p.get('notes') or '') + f" Review 13 Oct 2026: {d['action']} - {d['reason']}.").strip()
    json.dump(j, open(os.path.join(D, os.path.basename(f)), 'w'), indent=1, ensure_ascii=False)
missing = [d['mpn'] for i, d in enumerate(dec) if i not in used]
print(f"{len(dec)} decisions, {len(used)} applied" + (f"; NOT FOUND: {missing}" if missing else ''))
