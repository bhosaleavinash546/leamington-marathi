#!/usr/bin/env python3
"""Round 6: bring scripts/pcb-research/queue.json up to date (no web).
Removes parts the catalogue now prices from a distributor; adds what round 6 found and could not price, by group:
  ndaOrDirect    pre-production / contract-only parts (supplier quote)
  noUsablePrice  a real code with no franchised listing at a break >= 100 (supplier quote)
  pendingReview  priced from a page read but not yet independently re-read, or held for a person
  notReached     a scope-B line still to read (the page refused, or its batch has not run)
The 1,100 discovered candidates outside scope B stay in 2026-11-22-r6/discovery/consolidated.json (named in the note).
Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/update-queue.py"""
import json, os, re, glob
H = os.path.dirname(os.path.abspath(__file__)); norm = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
cat = json.load(open(os.path.join(H, '../../../server/data/pcb-component-catalogue.json')))['parts']
priced = {norm(k) for e in cat if e['confidence'] == 'distributor' for k in [e['mpn']] + list(e.get('aliases') or [])}
qp = os.path.join(H, '..', 'queue.json'); q = json.load(open(qp))
before = len(q['remaining'])
rem = [x for x in q['remaining'] if norm(x['mpn']) not in priced]
have = {norm(x['mpn']) for x in rem}
def add(mpn, group, why):
    if not mpn or norm(mpn) in have or norm(mpn) in priced: return
    have.add(norm(mpn)); rem.append({'mpn': mpn, 'group': group, 'why': 'round 6 (23 Nov 2026): ' + why[:300]})
d = json.load(open(os.path.join(H, 'decisions.json')))['lists']
for c in json.load(open(os.path.join(H, 'discovery', 'quote-items.json'))):
    add(c.get('orderableCode') or f"{c['mfr']} {c['family']}", 'ndaOrDirect', f"{c.get('desc', '')[:120]} - pre-production or sold under contract; supplier quote")
for x in d.get('NO-LISTING', []): add(x['mpn'], 'noUsablePrice', x.get('why') or 'no franchised listing')
for x in d.get('OBSOLETE', []): add(x['mpn'], 'noUsablePrice', x.get('why') or 'obsolete')
for x in d.get('HELD-UNVERIFIED', []) + d.get('HELD-PERSON', []): add(x['mpn'], 'pendingReview', x['why'])
for k in ('SUMMARY-ONLY', 'NOT-READ', 'UNPRICED', 'WRONG-CODE'):
    for x in d.get(k, []): add(x['mpn'], 'notReached', f"{k}: {x.get('why', '')}")
started = {os.path.basename(f)[:-5] for f in glob.glob(os.path.join(H, 'b*.json'))}
for b in json.load(open(os.path.join(H, 'tasks', 'batches.json')))['batches']:
    if b['task'] in started: continue
    for c in json.load(open(os.path.join(H, 'tasks', b['task'] + '.json'))):
        add(c.get('orderableCode') or f"{c['mfr']} {c['family']}", 'notReached', f"scope B batch {b['task']} not run (Digi-Key refused page reads): {c.get('desc', '')[:120]}")
for f in glob.glob(os.path.join(H, 'b*.json')):
    for n in json.load(open(f)).get('notResearched', []):
        add(n.get('code') or n.get('mpn'), 'notReached', f"{os.path.basename(f)[:-5]}: {n.get('why', '')}")
q['remaining'] = rem
note6 = (' Round 6 (23 Nov 2026): prices are now READ ON THE DISTRIBUTOR PAGE; entries marked "round 6" came from the discovery pass '
         '(2026-11-22-r6/discovery/consolidated.json holds 1,861 discovered candidates - 1,100 of them outside scope B and not listed here).')
if 'Round 6' not in q['note']: q['note'] += note6
json.dump(q, open(qp, 'w'), indent=1, ensure_ascii=False)
import collections
print('queue', before, '->', len(rem), dict(collections.Counter(x['group'] for x in rem)))
