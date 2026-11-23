#!/usr/bin/env python3
"""Round 6 decisions: raw research files -> merge/ (what the merge may read) + decisions.json (what was dropped or held
and why). No web. Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/decide-r6.py

Rules (each decision is written with its reason):
 1. Only a price READ ON THE PAGE is an observation. `evidence: "search-summary"` is dropped (the pilot measured live
    Digi-Key prices 9-39 % above the summaries on 10 of 17 parts). Pilot files without the field (b05, s1) were page
    reads; the three TME figures the b05 pilot took from page JSON-LD are dropped (hidden data, paired by the agent).
 2. A break below 100 units, a price with fewer than two significant figures, and a part-reel row (a ladder whose implied
    slope between rows of ONE distributor exceeds 0.45 below the full reel - a pack-fraction surcharge, not a volume
    break; Master Electronics on non-stocked parts) are dropped.
 3. A part whose notes start OBSOLETE / WRONG-CODE / NO-LISTING / SUMMARY-ONLY / NOT-READ / UNPRICED, or that has no
    observation left, is not merged; it is listed by outcome (quote list, re-run list).
 4. A price read on a NON-automotive sibling for an automotive line (aecq false + observedMpn differs + the task asked
    for the automotive code) is not merged.
 5. HOLD list (a person decides): parts named in HOLD with the reason.
 6. Common-mode chokes are `transformer` (RULES-R4); categories outside the 17 are refused by validate.mts.
 7. Verification (verify-*.json, an independent re-read of a sample): a part the verifier found DIFFERENT is replaced by
    the verifier's reading when the verifier read the page (both kept in decisions.json); a batch with any DIFFERENT
    price is flagged for a full re-read."""
import json, glob, os, re, math, collections
H = os.path.dirname(os.path.abspath(__file__))
RAW = sorted(f for f in glob.glob(os.path.join(H, '*.json')) if re.match(r'^(b\d\d[a-z]?-|s\d+-|r\d\d-|h\d-)', os.path.basename(f)))
norm = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
HOLD = {
  'SPC58NE84E7QMSAR': 'Digi-Key 26.02 USD @500 (factory-order row, not stocked) v TME 9.22 USD @500: 2.8x apart, and TME is below its own price for the smaller SPC58EC80 - a person decides',
}
OUTCOME = re.compile(r'^\s*(OBSOLETE|NRND|WRONG-CODE|NO-LISTING|SUMMARY-ONLY|NOT-READ|UNPRICED|NO-LARGER-BREAK|CROSS-CHECK ONLY)', re.I)
def sigfigs(x):
    s = ('%.10f' % float(x)).rstrip('0').replace('.', '').lstrip('0'); return len(s)
dec, out_lists = [], collections.defaultdict(list)
os.makedirs(os.path.join(H, 'merge'), exist_ok=True)
for f in glob.glob(os.path.join(H, 'merge', '*.json')): os.remove(f)
stats = collections.Counter()
for f in RAW:
    name = os.path.basename(f)[:-5]; j = json.load(open(f)); keep = []
    for p in j.get('parts', []):
        mpn = p.get('mpn'); notes = str(p.get('notes') or ''); stats['lines'] += 1
        obs = []
        for o in p.get('observations') or []:
            why = None
            ev = o.get('evidence', 'page-read')
            if ev != 'page-read': why = f'rule 1: {ev}'
            elif name == 'b05-passives' and re.search(r'tme', o.get('distributor', ''), re.I) and re.search(r'JSON-LD|lowPrice', notes, re.I): why = 'rule 1: TME figure taken from page JSON-LD (hidden data)'
            elif float(o.get('qty') or 0) < 100: why = 'rule 2: break below 100'
            elif float(o.get('price') or 0) < 0.1 and sigfigs(o.get('price') or 0) < 2: why = 'rule 2: a price under 0.10 printed with fewer than two significant figures'
            if why: dec.append({'file': name, 'mpn': mpn, 'action': 'dropObs', 'obs': f"{o.get('distributor')} {o.get('price')} {o.get('currency')} @{o.get('qty')}", 'reason': why})
            else: obs.append(o)
        # rule 2: part-reel rows, per distributor and packing
        by = collections.defaultdict(list)
        for o in obs: by[(str(o.get('distributor')).lower(), o.get('packing', '?'))].append(o)
        drop = set()
        for (d, pk), l in by.items():
            l.sort(key=lambda o: o['qty']); top = l[-1]
            for o in l[:-1]:
                if top['qty'] / o['qty'] <= 4.01 and o['price'] > top['price']:
                    b = math.log(o['price'] / top['price']) / math.log(top['qty'] / o['qty'])
                    if b > 0.45: drop.add(id(o)); dec.append({'file': name, 'mpn': mpn, 'action': 'dropObs', 'obs': f"{o['distributor']} {o['price']} @{o['qty']}", 'reason': f"rule 2: part-reel row (implied slope {b:.2f} to the {top['qty']} row)"})
        obs = [o for o in obs if id(o) not in drop]
        m = OUTCOME.match(notes); outcome = m.group(1).upper() if m else None
        if norm(mpn) in {norm(k) for k in HOLD}:
            out_lists['HELD-PERSON'].append({'file': name, 'mpn': mpn, 'why': HOLD[[k for k in HOLD if norm(k) == norm(mpn)][0]]}); stats['held'] += 1; continue
        if outcome in ('OBSOLETE', 'WRONG-CODE', 'NO-LISTING', 'SUMMARY-ONLY', 'NOT-READ', 'UNPRICED') or not obs:
            if outcome == 'OBSOLETE' and re.search(r'discontinued at digi-?key|no longer (available|carried|stocked)', notes, re.I) and not re.search(r'obsolete|last time buy|no longer manufactured', notes[9:], re.I):
                outcome = 'NO-LISTING'
            key = outcome or ('NO-LARGER-BREAK' if name.startswith('s') else 'UNPRICED')
            out_lists[key].append({'file': name, 'mpn': mpn, 'mfr': p.get('mfr'), 'desc': p.get('desc'), 'why': notes[:400]}); stats[key] += 1; continue
        if p.get('aecq') is False and p.get('observedMpn') and norm(p['observedMpn']) != norm(mpn) and re.search(r'industrial sibling|non-automotive sibling|priced on the industrial', notes, re.I):
            out_lists['SIBLING-NOT-AUTOMOTIVE'].append({'file': name, 'mpn': mpn, 'why': notes[:300]}); stats['sibling'] += 1; continue
        q = dict(p); q['observations'] = obs
        if re.search(r'common.?mode', str(p.get('desc', '')), re.I) and p.get('category', '').startswith('passive'):
            dec.append({'file': name, 'mpn': mpn, 'action': 'category', 'from': p['category'], 'to': 'transformer', 'reason': 'rule 6: common-mode choke'}); q['category'] = 'transformer'
        keep.append(q); stats['toMerge'] += 1
        stats['ownLadder'] += any(len(l) >= 2 for l in by.values())
        stats['twoDistributors'] += len({str(o.get('distributor')).lower() for o in obs}) >= 2
    if keep:
        json.dump({'domain': j.get('domain', name), 'researched': j.get('researched'), 'parts': keep}, open(os.path.join(H, 'merge', name + '.json'), 'w'), indent=1, ensure_ascii=False)
json.dump({'stats': dict(stats), 'lists': out_lists, 'decisions': dec}, open(os.path.join(H, 'decisions.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps(dict(stats), indent=1)); print({k: len(v) for k, v in out_lists.items()}); print('observations dropped:', collections.Counter(d['reason'].split(':')[0] + ':' + d['reason'].split(':')[1][:40] for d in dec if d['action'] == 'dropObs').most_common())
