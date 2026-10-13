"""Stamp the independent review of the study imports onto the study packs (DECISIONS 128).

The review never rewrites the study's own words or numbers. Each finding becomes a visible
open point on the idea (reviewOpenPoints, reviewSeverity) and each confirmed duplicate of an
existing library idea becomes possibleDuplicateOf. Transcription findings are not stamped:
they were converter defects, fixed in convert.py and re-checked, and are listed in the review record.

usage: python3 -I apply-review.py <packs-dir> [<library-dir>]
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACKS = sys.argv[1]
LIB = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..')
RANK = {'critical': 3, 'major': 2, 'minor': 1}
# Deck-link findings fixed in convert.py (a card is attached only when it opens with the idea's own ID;
# slides that merely cross-reference it go to studyDeckMentions), so they are not stamped.
RESOLVED = {('edu26-t1', 'consistency'), ('edu26-t5', 'consistency'), ('edu26-g1', 'consistency'),
            ('edu26-g8', 'consistency'), ('edu26-g9', 'consistency')}

known = set()
for f in glob.glob(os.path.join(LIB, 'marketplace-*.json')) + glob.glob(os.path.join(PACKS, 'marketplace-study-*.json')):
    for x in json.load(open(f)):
        known.add(x['id'])

findings, dupes = {}, {}
for f in sorted(glob.glob(os.path.join(HERE, 'review', 'findings-*.json'))):
    for x in json.load(open(f)):
        if x['category'] == 'transcription' or (x['id'], x['category']) in RESOLVED:
            continue
        findings.setdefault(x['id'], []).append(x)
        if x['category'] == 'duplicate' and x.get('duplicateOf') in known:
            dupes.setdefault(x['id'], set()).add(x['duplicateOf'])
for f in sorted(glob.glob(os.path.join(HERE, 'review', 'summary-*.json'))):
    for x in json.load(open(f)).get('duplicates', []):
        if x.get('verdict') == 'true duplicate':
            m = re.match(r'[\w-]+', x['duplicateOf'] or '')
            tgt = m.group(0) if m else ''
            if tgt not in known:  # e.g. "ID-093 (mhev48s-id-093)"
                inner = re.search(r'\(([\w-]+)\)', x['duplicateOf'])
                tgt = inner.group(1) if inner else tgt
            if tgt in known:
                dupes.setdefault(x['id'], set()).add(tgt)
            else:
                print('unresolved duplicate target', x['id'], x['duplicateOf'], file=sys.stderr)

stamped = 0
for f in sorted(glob.glob(os.path.join(PACKS, 'marketplace-study-*.json'))):
    arr = json.load(open(f))
    for x in arr:
        d = x['ideaData']
        fs = sorted(findings.get(x['id'], []), key=lambda y: -RANK[y['severity']])
        for k in ('reviewOpenPoints', 'reviewSeverity', 'possibleDuplicateOf'):
            d.pop(k, None)
        if fs:
            d['reviewSeverity'] = fs[0]['severity']
            d['reviewOpenPoints'] = ' ¶ '.join(
                f"[{y['severity'].upper()} · {y['category']}] {y['issue']} Evidence: {y['evidence']} Recommendation: {y['recommendation']}"
                for y in fs)
            stamped += 1
        if x['id'] in dupes:
            d['possibleDuplicateOf'] = ', '.join(sorted(dupes[x['id']]))
    json.dump(arr, open(f, 'w'), indent=1, ensure_ascii=False)
print('ideas with open points', stamped, '· ideas with a library duplicate', len(dupes))
