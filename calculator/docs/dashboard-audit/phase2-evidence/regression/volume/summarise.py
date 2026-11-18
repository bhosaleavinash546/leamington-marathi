"""Phase 2 · Step 5: medians of 3 runs per configuration v Phase 1 (one run each).  python3 -I summarise.py (from volume/)"""
import json, glob, statistics, os
P1 = {n: json.load(open(f'../../../phase1-evidence/30-perf-{n}.json')) for n in (20000, 50000)}
def metrics(d):
    m = {f'api.{k}': v['ms'] for k, v in d['api'].items()}
    b = d['browser']
    for k, v in b.items():
        if isinstance(v, dict): m[f'browser.{k}.ms'] = v['ms']; m[f'browser.{k}.bytes'] = v['bytes']
        elif isinstance(v, (int, float)): m[f'browser.{k}'] = v
    m['insertMs'] = d['insertMs']; m['dbBytes'] = d['dbBytes']
    return m
rows = {}
for f in sorted(glob.glob('*-run[123].json')):
    cfg, n = f.split('-run')[0].rsplit('-', 1)
    rows.setdefault((cfg, int(n)), []).append(metrics(json.load(open(f))))
out = []
for n in (20000, 50000):
    p1 = metrics(P1[n]); cfgs = [c for (c, nn) in rows if nn == n]
    out.append(f'\n## {n:,} records — median of 3 runs (Phase 1: one run)\n')
    out.append('| Measure | Phase 1 | ' + ' | '.join(cfgs) + ' | fixed (plain) v Phase 1 |')
    out.append('|---|---|' + '---|' * len(cfgs) + '---|')
    for k in p1:
        meds = {c: statistics.median([r[k] for r in rows[(c, n)] if k in r]) for c in cfgs}
        a = meds.get('after-plain'); ch = (a - p1[k]) / p1[k] * 100 if p1[k] else 0
        flag = ' **>10 %**' if ch > 10 and not k.endswith('bytes') and k not in ('dbBytes',) else ''
        out.append(f'| {k} | {p1[k]:,} | ' + ' | '.join(f'{meds[c]:,}' for c in cfgs) + f' | {ch:+.0f} %{flag} |')
    out.append('\nRuns: ' + '; '.join(f"{c}: " + ', '.join(str(r.get('api.summary_cold_default12m')) for r in rows[(c, n)]) + ' ms (summary cold)' for c in cfgs))
open('volume-summary.md', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
