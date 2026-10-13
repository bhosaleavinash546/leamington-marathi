"""Apply review corrections to study ideas the user asked to have fixed (DECISIONS 129).

A correction replaces the booked saving with a figure re-derived from the study's OWN cost lines
(and cited research for any percentage the study did not state). The study's original figures are
kept verbatim under ideaData.studyOriginal so nothing is lost, and the correction carries its
itemised derivation, sources and confidence so the badge is never silent.

Run after convert.py and apply-review.py:  python3 -I apply-corrections.py <packs-dir>
"""
import glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACKS = sys.argv[1]
VOL = {'edu26': (100_000, 'units', 'unit'), 'mhev48s': (120_000, 'packs', 'pack')}


def money(v):
    a = abs(v)
    t = f'£{a / 1e6:,.2f}M' if a >= 1e6 else f'£{a / 1e3:,.1f}K' if a >= 1e3 else f'£{a:,.2f}'
    return ('−' + t) if v < 0 else t


def gbp(v):
    return ('−' if v < 0 else '') + f'£{abs(v):,.2f}'


corr = {}
for f in sorted(glob.glob(os.path.join(HERE, 'corrections', 'correction-*.json'))):
    c = json.load(open(f))
    corr[c['id']] = c

done = 0
for f in sorted(glob.glob(os.path.join(PACKS, 'marketplace-study-*.json'))):
    arr = json.load(open(f))
    for x in arr:
        c = corr.get(x['id'])
        if not c:
            continue
        d = x['ideaData']
        vol, plural, one = VOL[x['id'].split('-')[0]]
        csp = d['costSavingPotential']
        d['studyOriginal'] = {
            'annualSaving': x['annualSaving'], 'perUnit': csp.get('perVehicle'), 'annualValue': csp.get('annualValue'),
            'calculationBasis': csp.get('calculationBasis'),
            'savingPerUnitLowGBP': d.get('savingPerUnitLowGBP'), 'savingPerUnitHighGBP': d.get('savingPerUnitHighGBP'),
            'riskAdjustedLowGBP': d.get('riskAdjustedLowGBP'), 'riskAdjustedHighGBP': d.get('riskAdjustedHighGBP'),
            'paybackYears': d.get('paybackYears'), 'conflictsWith': d.get('conflictsWith'), 'nreGBP': d.get('nreGBP'),
        }
        k = c['corrected']; ra = c.get('riskAdjusted') or {}
        was = f"study claimed {gbp(d['studyOriginal']['savingPerUnitLowGBP'])} to {gbp(d['studyOriginal']['savingPerUnitHighGBP'])} per {one}"
        if k.get('booked') and k.get('perUnitLowGBP') is not None:
            lo, hi = k['perUnitLowGBP'], k['perUnitHighGBP']
            d.update({'savingPerUnitLowGBP': lo, 'savingPerUnitHighGBP': hi,
                      'annualSavingLowGBP': lo * vol, 'annualSavingHighGBP': hi * vol})
            per = f'{gbp(lo)} to {gbp(hi)} per {one} (review-corrected; {was})'
            ann = f'{money(lo * vol)} to {money(hi * vol)} at {vol:,} {plural}/yr (review-corrected)'
        else:
            for key in ('savingPerUnitLowGBP', 'savingPerUnitHighGBP', 'annualSavingLowGBP', 'annualSavingHighGBP'):
                d.pop(key, None)
            per = f'Not booked — {k.get("statusNote") or "not a part-level saving"} (review-corrected; {was})'
            ann = 'No saving booked — review-corrected (see the correction note)'
        for key, src in (('riskAdjustedLowGBP', 'lowGBP'), ('riskAdjustedHighGBP', 'highGBP'), ('paybackYears', 'paybackYears'), ('nreGBP', 'nreGBP')):
            if key == 'nreGBP' and ra.get('nreGBP') is None:
                continue
            d[key] = ra.get(src)
        x['annualSaving'] = ann
        csp['perVehicle'] = per
        csp['annualValue'] = ann
        csp['calculationBasis'] = f"Review-corrected: {k['basis']} Original study basis: {d['studyOriginal']['calculationBasis']}"
        if c.get('conflictsAdded'):
            d['conflictsWith'] = f"{d['studyOriginal']['conflictsWith'] or 'none stated'} · Review-added conflicts: {', '.join(c['conflictsAdded'])}"
        d['reviewCorrection'] = {
            'summary': c['summary'], 'basis': k['basis'], 'derivation': c.get('derivation', []),
            'riskAdjustedNote': ra.get('note', ''), 'systemTradeNote': c.get('systemTradeNote', ''),
            'confidence': c.get('confidence'), 'openQuestions': c.get('openQuestions', []), 'date': '2026-10-13',
        }
        ev = d.get('evidenceSources') or []
        for r in c.get('research', []):
            if r.get('url'):
                ev.append({'title': r['claim'], 'url': r['url'], 'type': 'review research', 'supports': f"{r['verdict']}: {r['finding']}",
                           'confidence': r['verdict']})
        d['evidenceSources'] = ev
        if d.get('reviewOpenPoints'):
            d['reviewOpenPoints'] = f"[CORRECTED 13 Oct 2026] {c['summary']} ¶ {d['reviewOpenPoints']}"
        d['reviewCorrectionStatus'] = 'corrected'
        done += 1
    json.dump(arr, open(f, 'w'), indent=1, ensure_ascii=False)
print('corrected', done, 'of', len(corr))
