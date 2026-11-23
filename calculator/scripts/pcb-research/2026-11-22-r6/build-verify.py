#!/usr/bin/env python3
"""Round 6 verification sample (no web): a seeded 20 % sample of every research file's merge-ready parts that carry a
Digi-Key page-read price. The verifier is BLIND: its task gives the code and the page, not the recorded prices; it
re-reads the page and records the whole price table. compare-verify.py then sets its reading against the researcher's.
Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/build-verify.py"""
import json, glob, os, random, math
H = os.path.dirname(os.path.abspath(__file__)); random.seed(20261123)
sample, truth = [], {}
for f in sorted(glob.glob(os.path.join(H, 'merge', '*.json'))):
    name = os.path.basename(f)[:-5]
    parts = [p for p in json.load(open(f))['parts'] if any('digi' in o['distributor'].lower() for o in p['observations'])]
    done = set(json.load(open(os.path.join(H, 'verify-sampled.json'))).get(name, [])) if os.path.exists(os.path.join(H, 'verify-sampled.json')) else set()
    pool = [p for p in parts if p['mpn'] not in done]
    k = max(0, math.ceil(0.2 * len(parts)) - len(done))
    for p in random.sample(pool, min(k, len(pool))):
        url = next(o['url'] for o in p['observations'] if 'digi' in o['distributor'].lower())
        sample.append({'file': name, 'mpn': p.get('observedMpn') or p['mpn'], 'catalogueMpn': p['mpn'], 'mfr': p['mfr'], 'url': url})
        truth.setdefault(name, []).append(p['mpn'])
random.shuffle(sample)
n = max(1, math.ceil(len(sample) / 45))
existing = len(glob.glob(os.path.join(H, 'tasks', 'v[0-9][0-9]-verify.json')))
for i in range(n):
    json.dump(sample[i::n], open(os.path.join(H, 'tasks', f'v{existing + i + 1:02d}-verify.json'), 'w'), indent=1, ensure_ascii=False)
prev = json.load(open(os.path.join(H, 'verify-sampled.json'))) if os.path.exists(os.path.join(H, 'verify-sampled.json')) else {}
for k2, v in truth.items(): prev[k2] = sorted(set(prev.get(k2, [])) | set(v))
json.dump(prev, open(os.path.join(H, 'verify-sampled.json'), 'w'), indent=1)
print('sampled', len(sample), 'in', n, 'task(s);', {k2: len(v) for k2, v in truth.items()})
