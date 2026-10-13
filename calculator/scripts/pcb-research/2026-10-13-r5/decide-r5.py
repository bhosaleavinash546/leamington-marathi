#!/usr/bin/env python3
"""Round 5 decisions (13 Oct 2026), written to review-decisions.json and audit-exclusions.json. The web-search budget was
spent by the ten research agents, so no independent re-search of round 5 could run in this turn. Rules:
 1. An observation read on a category page (Mouser /c/), a family page (Digi-Key base-product) or an aggregator search
    that does not name the exact code (findchips.com/search/k344) is not a price for that code: dropped.
 2. A NEW part (extend task) priced by fewer than two distributors is HELD (not merged) until an independent review can
    re-check it; its observations stay in raw/ and the part goes to the queue as group 'pendingReview'.
 3. Verify tasks add observations to EXISTING entries (a second distributor) - merged.
 4. A verifier's WRONG-CODE dispute with a stored URL drops that stored observation (audit-exclusions.json 'observations');
    a price conflict or a code doubt without a URL marks the entry DISPUTED (it keeps its price, the source says why)."""
import json, glob, os, re
D = os.path.dirname(os.path.abspath(__file__))
norm = lambda s: re.sub(r'[^A-Z0-9]', '', str(s).upper())
FR = re.compile(r'^(digi-?key|mouser|arrow|avnet|farnell|newark|element ?14|rs( components)?|tme|rutronik|future( electronics)?|tti|lcsc|verical|heilind|allied|sager|master electronics)', re.I)
def bad_page(o, codes):
    u = o['url'].lower()
    if re.search(r'mouser\.[a-z.]+/c/', u): return 'Mouser category page'
    if 'base-product' in u: return 'Digi-Key family (base-product) page'
    if re.search(r'(findchips|octopart|digipart|trustedparts)\.com/search', u) and not any(len(c) >= 6 and c[:min(len(c), 10)] in norm(u) for c in codes):
        return 'aggregator search that does not name the code'
    return None
dec, held, audit_obs, disputed = [], [], [], {}
for f in sorted(glob.glob(os.path.join(D, 'raw', '*.json'))):
    j = json.load(open(f)); name = os.path.basename(f)[:-5]; verify = name.startswith('v')
    for p in j.get('parts', []):
        obs = p.get('observations') or []
        codes = [norm(p['mpn'])] + ([norm(p['observedMpn'])] if p.get('observedMpn') else [])
        bad = [o for o in obs if bad_page(o, codes)]
        for o in bad:
            dec.append({'mpn': p['mpn'], 'action': 'dropObs', 'match': {'url': o['url']}, 'reason': f"rule 1: {bad_page(o, codes)} ({o['url'][:80]})"})
        good = [o for o in obs if o not in bad]
        dists = {o['distributor'].lower().split()[0] for o in good if FR.match(o['distributor'].strip()) and o.get('qty', 0) >= 100}
        if not verify and good and len(dists) < 2:
            dec.append({'mpn': p['mpn'], 'action': 'dropPart', 'reason': 'rule 2: held for independent review (single distributor; round-5 search budget spent) - observations kept in raw/'})
            held.append({'mpn': p['mpn'], 'group': 'pendingReview', 'why': f"round 5 (13 Oct 2026, {name}): single-distributor price held for review: " + '; '.join(f"{o['distributor']} {o['price']} {o['currency']} @{o['qty']}" for o in good)[:300]})
    for d in j.get('disputes', []) or []:
        if d.get('url'):
            frag = re.sub(r'^https?://', '', d['url'])[:120]
            if re.search(r'possible, not proven', d.get('reason', ''), re.I):
                disputed[d['mpn']] = d['reason'][:240]
            else:
                audit_obs.append({'mpn': d['mpn'], 'url': frag, 'reason': d['reason'][:240]})
        else:
            disputed[d['mpn']] = d['reason'][:240]
json.dump({'note': 'Round 5 decisions, written by decide-r5.py (see its header). Applied by apply-review.py to raw/*.json.', 'decisions': dec},
          open(os.path.join(D, 'review-decisions.json'), 'w'), indent=1, ensure_ascii=False)
json.dump({'note': 'Round 5 audit (13 Oct 2026). observations: a stored observation the verifier showed is for another code / a disallowed host - dropped by the merge (applyAuditToCatalogue). disputed: the price is kept, the source states the dispute until a quote settles it.',
           'observations': audit_obs, 'disputed': disputed}, open(os.path.join(D, 'audit-exclusions.json'), 'w'), indent=1, ensure_ascii=False)
json.dump(held, open(os.path.join(D, 'held-for-review.json'), 'w'), indent=1, ensure_ascii=False)
print(f"{len(dec)} decisions ({sum(d['action']=='dropObs' for d in dec)} page drops, {sum(d['action']=='dropPart' for d in dec)} held parts); "
      f"{len(audit_obs)} stored observations to drop; {len(disputed)} disputed")
for a in audit_obs: print('  DROP STORED', a['mpn'], a['url'][:60])
for k, v in disputed.items(): print('  DISPUTED', k, '|', v[:110])
