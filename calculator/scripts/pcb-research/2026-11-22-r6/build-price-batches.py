#!/usr/bin/env python3
"""Round 6: cut the discovered candidates into price-research batches (no web).
Scope B (the user's choice, 22 Nov 2026): every candidate with an orderable code AND a distributor listing seen, plus
every priority-1 candidate. Batches keep one maker's parts together (one search or page prices siblings).
Writes tasks/b<nn>-<group>.json and tasks/batches.json. Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/build-price-batches.py"""
import json, os, re, glob, collections
H = os.path.dirname(os.path.abspath(__file__)); SIZE = 36
rows = json.load(open(os.path.join(H, 'discovery', 'consolidated.json')))
quote = {(c['mfr'], c.get('orderableCode'), c.get('family')) for c in json.load(open(os.path.join(H, 'discovery', 'quote-items.json')))}
P = [c for c in rows if (c['mfr'], c.get('orderableCode'), c.get('family')) not in quote]
inB = lambda c: (c.get('orderableCode') and c.get('distribution') == 'distributor') or c.get('priority') == 1
B = [c for c in P if inB(c)]
def group(c):
    cat = c.get('category') or ''
    if cat.startswith('passive') or cat == 'transformer': return 'passives'
    if cat in ('fuse_tvs', 'led'): return 'discretes'
    if cat in ('crystal_osc', 'connector_smt', 'relay_switch', 'mechanical', 'through_hole', 'power_module'): return 'timing-interconnect'
    return 'ics'
by = collections.defaultdict(list)
for c in B: by[group(c)].append(c)
for f in glob.glob(os.path.join(H, 'tasks', 'b[0-9][0-9]-*.json')): os.remove(f)
KEEP = ('mfr', 'family', 'orderableCode', 'desc', 'category', 'pkg', 'aecq', 'launched', 'usedIn', 'boards', 'qtyPerBoardMax', 'distribution', 'priority', 'sourceUrl', 'note', 'catalogue', 'catalogueKey')
batches, n = [], 0
for g in ('passives', 'ics', 'discretes', 'timing-interconnect'):
    xs = by[g]
    # one maker together; inside a maker: BOM recurrence, priority, listed-with-code first
    xs.sort(key=lambda c: (c['mfr'].lower(), -(c.get('boards') or 0), c.get('priority') or 3, 0 if c.get('orderableCode') else 1, str(c.get('orderableCode') or c.get('family'))))
    for i in range(0, len(xs), SIZE):
        n += 1; part = xs[i:i + SIZE]; name = f"b{n:02d}-{g}"
        json.dump([{k: c.get(k) for k in KEEP if c.get(k) is not None} for c in part], open(os.path.join(H, 'tasks', name + '.json'), 'w'), indent=1, ensure_ascii=False)
        batches.append({'task': name, 'parts': len(part), 'makers': sorted({c['mfr'] for c in part}), 'withCode': sum(bool(c.get('orderableCode')) for c in part),
                        'distributorListed': sum(c.get('distribution') == 'distributor' for c in part), 'priority1': sum(c.get('priority') == 1 for c in part)})
out = {'scope': 'B', 'candidatesToPrice': len(P), 'inScopeB': len(B), 'notInScopeB': len(P) - len(B), 'byGroup': {g: len(v) for g, v in by.items()}, 'batches': batches}
json.dump(out, open(os.path.join(H, 'tasks', 'batches.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in out.items() if k != 'batches'}, indent=1))
for b in batches: print(b['task'], b['parts'], 'code', b['withCode'], 'dist', b['distributorListed'], 'p1', b['priority1'], '|', ', '.join(b['makers'])[:90])
