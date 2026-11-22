#!/usr/bin/env python3
"""Round 6 discovery → one checked list and the "latest parts" price-research tasks. No web, no prices.
Checks each discovered candidate against the catalogue by EXACT code (has.py prefix-matches: GCM155D71E105KE36 is not
GCM155R71H104KE02D), drops duplicates across the discovery files, and writes
  discovery/consolidated.json     every candidate with its catalogue verdict
  tasks/n<file>-<domain>.json  candidates to price, priority 1 first, parts with a code seen on a page first
  discovery/quote-items.json      OEM-direct / pre-production parts: supplier quote, not distributor research
  discovery/summary.json          the counts the plan quotes
Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/consolidate-discovery.py"""
import json, re, os, glob, collections
HERE = os.path.dirname(os.path.abspath(__file__))
cat = json.load(open(os.path.join(HERE, '../../../server/data/pcb-component-catalogue.json')))['parts']
norm = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
exact = {}                                   # normalised code / alias / family → entry
for e in cat:
    for k in [e.get('mpn'), e.get('family')] + list(e.get('aliases') or []):
        if len(norm(k)) >= 4: exact.setdefault(norm(k), e)
def verdict(c):
    """'priced' = the catalogue already holds this exact code (or its family key) with a distributor price."""
    # A candidate with a code is judged on the CODE: its family key matching a priced sibling does not make it held
    # (GCM155R71H222KA37D is not GCM155R71H104KE02D). A family-level candidate is judged on the family key.
    code, fam = c.get('orderableCode'), c.get('family')
    e = exact.get(norm(code)) if code else exact.get(norm(fam)) if fam else None
    if e: return ('priced' if e['confidence'] == 'distributor' else 'estimate'), e['mpn']
    f = exact.get(norm(fam)) if (code and fam) else None
    if f and f['confidence'] == 'estimate': return 'estimate', f['mpn']        # an orderable member of a family estimate
    return 'no', None
rows, seen, dropped = [], {}, collections.Counter()
# The reference-design BOM dump (k8b) is filtered: a code joined from wrapped table cells, a part only on a design that is
# not automotive, a part not fitted, development-board hardware and a pre-production print are not research candidates.
BOM_SKIP = re.compile(r'wrapped|joined from|not automotive|off-brief|TIDM-02010|TIDEP-01033|TIDM-02022|pre-?production|internal code|looks short|not printed in BOM', re.I)
HARDWARE = re.compile(r'test ?point|standoff|screw|spacer|jumper|shunt jumper|header|socket|bumper|washer|\bnut\b|heat ?sink|label|pcb\b|fiducial|banana|binding post|terminal block|sma\b|probe', re.I)
def bom_ok(c):
    if not c.get('orderableCode'): return 'BOM: no orderable code'
    if (c.get('qtyPerBoardMax') == 0): return 'BOM: not fitted'
    if BOM_SKIP.search(str(c.get('note', ''))) or BOM_SKIP.search(' '.join(c.get('usedIn') or [])): return 'BOM: doubtful print / off-brief design'
    if c.get('category') in ('mechanical', 'through_hole', 'connector_smt') or HARDWARE.search(str(c.get('desc', ''))): return 'BOM: dev-board hardware / connector'
    if (c.get('boards') or 0) < 2 and not c.get('aecq'): return 'BOM: one board, no automotive statement'
    return None
files = sorted(glob.glob(os.path.join(HERE, 'discovery', '[km]*.json')), key=lambda f: (os.path.basename(f).startswith('k8b'), f))  # the BOM dump last
for f in files:
    d = json.load(open(f)); dom = d.get('domain') or os.path.basename(f)[:-5]
    for c in d.get('candidates', []):
        if dom.startswith('k8b'):
            why = bom_ok(c)
            if why: dropped[why] += 1; continue
        if not c.get('sourceUrl'): dropped['no source URL'] += 1; continue
        key = norm(c.get('orderableCode')) or norm(c.get('mfr')) + '|' + norm(c.get('family'))
        if not key or key == '|': dropped['no code and no family'] += 1; continue
        if key in seen: dropped['duplicate across files'] += 1; continue
        v, hit = verdict(c)
        if v == 'priced': dropped['already distributor-priced (exact code)'] += 1; continue
        seen[key] = 1
        rows.append({**c, 'domain': dom, 'catalogue': v, 'catalogueKey': hit})
PREPROD = re.compile(r'pre-?production|preview|sampling|samples? (only|since|from)|not yet (orderable|released)|quote item|no orderable code (is )?published', re.I)
def bucket(c):
    if c.get('distribution') == 'oem-direct': return 'quote'
    if PREPROD.search(str(c.get('note', '')) + ' ' + str(c.get('desc', ''))) and c.get('distribution') != 'distributor': return 'quote'
    return 'price'
quote = [c for c in rows if bucket(c) == 'quote']
price = [c for c in rows if bucket(c) == 'price']
price.sort(key=lambda c: (c['domain'], c.get('priority') or 3, 0 if c.get('distribution') == 'distributor' else 1, 0 if c.get('orderableCode') else 1, c.get('mfr', ''), str(c.get('family'))))
json.dump(rows, open(os.path.join(HERE, 'discovery', 'consolidated.json'), 'w'), indent=1, ensure_ascii=False)
json.dump(quote, open(os.path.join(HERE, 'discovery', 'quote-items.json'), 'w'), indent=1, ensure_ascii=False)
for f in glob.glob(os.path.join(HERE, 'tasks', 'n[km]*.json')) + glob.glob(os.path.join(HERE, 'tasks', 'n*-latest-*.json')): os.remove(f)
by = collections.defaultdict(list)
for c in price: by[c['domain']].append(c)
KEEP = ('boards', 'qtyPerBoardMax', 'mfr', 'family', 'orderableCode', 'desc', 'category', 'pkg', 'aecq', 'launched', 'usedIn', 'distribution', 'priority', 'sourceUrl', 'note', 'catalogue', 'catalogueKey')
tasks = {}
for dom, xs in sorted(by.items()):
    k = 'n' + dom.split('-')[0]; name = f"{k}-{'-'.join(dom.split('-')[1:])}"
    json.dump([{a: c.get(a) for a in KEEP} for c in xs], open(os.path.join(HERE, 'tasks', name + '.json'), 'w'), indent=1, ensure_ascii=False)
    tasks[name] = {'parts': len(xs), 'boards3plus': sum((c.get('boards') or 0) >= 3 for c in xs), 'priority1': sum(c.get('priority') == 1 for c in xs), 'withCode': sum(bool(c.get('orderableCode')) for c in xs),
                   'distributorListed': sum(c.get('distribution') == 'distributor' for c in xs)}
summary = {'candidates': len(rows), 'toPrice': len(price), 'quoteItems': len(quote), 'dropped': dict(dropped),
           'replacesEstimate': sum(c['catalogue'] == 'estimate' for c in rows),
           'priority': dict(collections.Counter(str(c.get('priority')) for c in price)),
           'withOrderableCode': sum(bool(c.get('orderableCode')) for c in price),
           'distributorListed': sum(c.get('distribution') == 'distributor' for c in price),
           'aecqStatedOnPage': sum(bool(c.get('aecq')) for c in price),
           'launched2024plus': sum(bool(re.match(r'202[4-6]', str(c.get('launched')))) for c in rows),
           'byCategory': dict(collections.Counter(c.get('category') for c in price)), 'tasks': tasks}
json.dump(summary, open(os.path.join(HERE, 'discovery', 'summary.json'), 'w'), indent=1); print(json.dumps(summary, indent=1))
