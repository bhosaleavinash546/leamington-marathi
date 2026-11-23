#!/usr/bin/env python3
"""Round 6: set the verifier's blind re-read against the researcher's observations (no web).
For every sampled part: each recorded Digi-Key row (packing, qty) is looked up in the verifier's table.
  MATCH       the same unit price (within 0.5 %)
  MOVED       the row exists at another price (the size of the move is printed)
  ROW-MISSING the verifier's table has no such row
  NOT-SERVED  the verifier could not read the page
Grade: the researcher's aecq against the page's Grade / Qualification fields. Writes verify-report.json.
Usage (from calculator/): python3 scripts/pcb-research/2026-11-22-r6/compare-verify.py"""
import json, glob, os, re, collections
H = os.path.dirname(os.path.abspath(__file__)); norm = lambda s: re.sub(r'[^A-Z0-9]', '', str(s or '').upper())
research = {}
for f in glob.glob(os.path.join(H, 'merge', '*.json')):
    for p in json.load(open(f))['parts']: research[norm(p.get('observedMpn') or p['mpn'])] = (os.path.basename(f)[:-5], p)
rep, tally, by_file = [], collections.Counter(), collections.defaultdict(collections.Counter)
for f in sorted(glob.glob(os.path.join(H, 'v[0-9][0-9]-verify.json'))):
    for v in json.load(open(f)).get('verified', []):
        hit = research.get(norm(v.get('mpn')))
        if not hit: tally['not in merge set'] += 1; continue
        name, p = hit; rows = v.get('rows') or []
        out = {'file': name, 'mpn': p['mpn'], 'pageMpn': v.get('pageMpn'), 'status': v.get('status'), 'rows': []}
        if not rows: out['verdict'] = 'NOT-SERVED'; out['notes'] = v.get('notes'); tally['NOT-SERVED'] += 1; rep.append(out); continue
        worst = 'MATCH'
        for o in p['observations']:
            if 'digi' not in o['distributor'].lower(): continue
            pk = str(o.get('packing', '')).lower()
            cand = [r for r in rows if int(r.get('qty') or 0) == int(o['qty']) and (not pk or pk in ('unknown',) or str(r.get('packing', '')).lower() == pk) and str(r.get('currency', 'USD')).upper() == str(o['currency']).upper()]
            if not cand:
                any_qty = [r for r in rows if int(r.get('qty') or 0) == int(o['qty'])]
                verdict = 'ROW-MISSING' if not any_qty else 'PACKING/CURRENCY-DIFFERS'
                out['rows'].append({'qty': o['qty'], 'packing': o.get('packing'), 'recorded': o['price'], 'verdict': verdict, 'seen': [(r.get('packing'), r.get('price'), r.get('currency')) for r in any_qty]})
            else:
                d = float(cand[0]['price']) / float(o['price']) - 1
                verdict = 'MATCH' if abs(d) <= 0.005 else 'MOVED'
                out['rows'].append({'qty': o['qty'], 'packing': o.get('packing'), 'recorded': o['price'], 'seen': cand[0]['price'], 'verdict': verdict, 'change': round(d, 4)})
            if verdict != 'MATCH': worst = verdict if worst == 'MATCH' or verdict == 'MOVED' else worst
        g = ' '.join(str(v.get(k) or '') for k in ('grade', 'qualification'))
        page_auto = bool(re.search(r'automotive|AEC-?Q', g, re.I))
        out['grade'] = {'recordedAecq': p.get('aecq'), 'page': g.strip() or None, 'verdict': 'MATCH' if page_auto == bool(p.get('aecq')) else ('RESEARCHER-TRUE-PAGE-SILENT' if p.get('aecq') else 'RESEARCHER-FALSE-PAGE-AUTOMOTIVE')}
        out['verdict'] = worst; tally[worst] += 1; by_file[name][worst] += 1; tally['grade ' + out['grade']['verdict']] += 1
        if norm(v.get('pageMpn')) and norm(v.get('pageMpn')) != norm(v.get('mpn')): out['pageNamesAnotherCode'] = True; tally['page names another code'] += 1
        rep.append(out)
json.dump({'tally': dict(tally), 'byFile': {k: dict(v) for k, v in by_file.items()}, 'parts': rep}, open(os.path.join(H, 'verify-report.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps(dict(tally), indent=1)); print({k: dict(v) for k, v in by_file.items()})
for o in rep:
    if o['verdict'] != 'MATCH': print(o['verdict'], o['file'], o['mpn'], [(r['qty'], r.get('recorded'), r.get('seen'), r['verdict']) for r in o['rows'] if r['verdict'] != 'MATCH'][:4])
