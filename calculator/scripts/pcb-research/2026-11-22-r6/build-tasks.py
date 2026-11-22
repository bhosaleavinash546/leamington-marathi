#!/usr/bin/env python3
"""Round 6 gap analysis (no web): reads the catalogue and writes the data-driven task lists.
  tasks/s1..s4-slope.json   existing distributor-priced parts on the GENERIC volume curve (one break only), dearest first
  tasks/h1-held.json        the 32 single-distributor parts held by round 5 (independent re-search)
  tasks/estimates-<domain>.txt  the catalogue's estimates, by research domain (appended to the domain task by hand)
  gap-summary.json          the counts the plan quotes
Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/build-tasks.py"""
import json, re, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
cat = json.load(open(os.path.join(HERE, '../../../server/data/pcb-component-catalogue.json')))
P = cat['parts']
dist_of = lambda p: sorted({o['distributor'] for o in p.get('observations') or []})
own = lambda p: 'own breaks' in (p.get('volumeModel') or {}).get('basis', '')
DOMAIN = [
 ('p-passives', lambda p, d: p['category'].startswith('passive')),
 ('i2-mcu-memory', lambda p, d: re.search(r'\bmcu\b|microcontroller|aurix|rh850|s32k|stm32|spc5|tricore|traveo|\bsoc\b|processor|fpga|flash|eeprom|dram|ddr|emmc|ufs|\bnor\b|\bnand\b|fram|sram', d)),
 ('i3-power', lambda p, d: re.search(r'pmic|\bsbc\b|system basis|buck|boost|dc.?dc|converter|regulator|\bldo\b|led driver|high.?side|low.?side|efuse|smart switch|load switch|ideal diode|gate driver|motor driver|pre-?driver|h-bridge|battery|cell monitor', d) and p['category'].startswith('ic_')),
 ('i4-interface-sensor', lambda p, d: re.search(r'\bcan\b|\blin\b|flexray|ethernet|\bphy\b|serdes|serializer|usb|isolat|sensor|hall|imu|accelerom|gyro|audio|codec|bluetooth|wi-?fi|gnss|uwb|nfc|radar', d) and p['category'].startswith('ic_')),
 ('d1-discretes', lambda p, d: p['category'] in ('fuse_tvs', 'led') or re.search(r'mosfet|\bfet\b|diode|tvs|esd|schottky|zener|transistor|bjt|igbt|rectifier', d)),
 ('d2-interconnect-timing', lambda p, d: p['category'] in ('connector_smt', 'crystal_osc', 'relay_switch', 'mechanical', 'transformer', 'through_hole', 'power_module')),
 ('i1-logic-analog', lambda p, d: True),
]
def domain(p):
    d = (p['desc'] + ' ' + p['mpn']).lower()
    for name, f in DOMAIN:
        if f(p, d): return name
est = collections.defaultdict(list)
for p in P:
    if p['confidence'] == 'estimate': est[domain(p)].append(p)
for name, xs in est.items():
    xs.sort(key=lambda p: -p['gbp']['q1k'])
    open(os.path.join(HERE, 'tasks', f'estimates-{name}.txt'), 'w').write(
        f"Catalogue ESTIMATES in this domain ({len(xs)}), dearest first: key | maker | description | estimate at 1k (GBP)\n"
        "A key that is a FAMILY (no packing suffix) needs ONE orderable automotive member priced; a generic key (\"MLCC 0402 …\") needs a real code for that cell.\n"
        + ''.join(f"{p['mpn']} | {p['mfr']} | {p['desc'][:90]} | {p['gbp']['q1k']}\n" for p in xs))
# slope: distributor-priced, observations present, generic curve
gen = [p for p in P if p['confidence'] == 'distributor' and p.get('observations') and not own(p)]
gen.sort(key=lambda p: -p['gbp']['q1k'])
# passives and jellybean parts are bought in the largest numbers: take every passive / discrete first, then the dearest ICs
hi_count = [p for p in gen if p['category'].startswith('passive') or p['category'] in ('fuse_tvs', 'crystal_osc', 'led')]
ics = [p for p in gen if p not in hi_count]
pick = hi_count[:80] + ics[:80]
def row(p):
    o = p['observations']
    return {'mpn': p['mpn'], 'mfr': p['mfr'], 'desc': p['desc'], 'category': p['category'], 'pkg': p.get('pkg', ''), 'aecq': p.get('aecq', False),
            'currentQ1kGBP': p['gbp']['q1k'], 'currentQ200kGBP': p['gbp'].get('q200k'),
            'stored': [{'distributor': x['distributor'], 'qty': x['qty'], 'price': x['price'], 'currency': x['currency'], 'url': x['url']} for x in o]}
pick.sort(key=lambda p: (p['mfr'], p['mpn']))
n = 4; size = -(-len(pick) // n)
for i in range(n):
    json.dump([row(p) for p in pick[i * size:(i + 1) * size]], open(os.path.join(HERE, 'tasks', f's{i+1}-slope.json'), 'w'), indent=1)
held = json.load(open(os.path.join(HERE, '../2026-10-13-r5/held-for-review.json')))
json.dump(held, open(os.path.join(HERE, 'tasks', 'h1-held.json'), 'w'), indent=1)
summary = {
 'parts': len(P), 'distributorPriced': sum(p['confidence'] == 'distributor' for p in P), 'estimates': sum(p['confidence'] == 'estimate' for p in P),
 'twoPlusDistributors': sum(len(dist_of(p)) >= 2 for p in P), 'ownSlope': sum(own(p) and p['confidence'] == 'distributor' for p in P),
 'genericCurveDistributor': len(gen), 'distributorNoStoredListing': sum(p['confidence'] == 'distributor' and not p.get('observations') for p in P),
 'smtPassives': sum(p['category'].startswith('passive') for p in P),
 'largestPublishedBreak': dict(collections.Counter(('>=100k' if m >= 100000 else '>=10k' if m >= 10000 else '>=2.5k' if m >= 2500 else '>=1k' if m >= 1000 else '<1k')
     for m in (max(o['qty'] for o in p['observations']) for p in P if p.get('observations')))),
 'estimatesByDomain': {k: len(v) for k, v in est.items()}, 'slopeTaskParts': len(pick), 'held': len(held),
}
json.dump(summary, open(os.path.join(HERE, 'gap-summary.json'), 'w'), indent=1); print(json.dumps(summary, indent=1))
