"""Phase 2 · Step 3: original values, GBP values and frozen FX snapshots — pre-fix run v fixed run, and within the fixed
run, the save-time snapshot v the end (after every PATCH).   python3 -I fx-check.py   (from reconciliation/)"""
import json
B=json.load(open('before/run.json')); A=json.load(open('after/run.json'))
def idx(run): return {r['sourceRef']:r for r in run['rows']+run['excludedRows']}
b,a=idx(B),idx(A)
def fxsig(r):
    f=r['fx']; return {k:(None if not f.get(k) else (round(f[k]['gbpPerUnit'],12), f[k]['source'], f[k]['effectiveDate'], f[k].get('approved'), f[k].get('method'))) for k in ('current','should','saving')}
keys=['currentCost','currentCcy','currentTerms','shouldCost','shouldCcy','shouldTerms','gbpCurrent','gbpShould','gbpSaving']
diff=[]
for ref in sorted(set(b)&set(a)):
    for k in keys:
        if b[ref][k]!=a[ref][k]: diff.append((ref,k,b[ref][k],a[ref][k]))
    if fxsig(b[ref])!=fxsig(a[ref]): diff.append((ref,'fx',fxsig(b[ref]),fxsig(a[ref])))
print('records in both runs:', len(set(b)&set(a)), '| only before:', sorted(set(b)-set(a)), '| only after:', sorted(set(a)-set(b)))
print('original values / GBP values / FX snapshots differing between the pre-fix and fixed runs:', diff or 'none')
first={}
for act in A['actions']:
    rec=act.get('record')
    if rec and rec.get('fx') and rec['id'] not in first: first[rec['id']]=rec['fx']
for r in A['rows']+A['excludedRows']:
    if r['id'] in first:
        f0=first[r['id']]
        if f0.get('current')!=r['fx'].get('current') or f0.get('should')!=r['fx'].get('should'): print('CURRENT/SHOULD SNAPSHOT CHANGED:', r['sourceRef'])
        elif f0!=r['fx']: print(r['sourceRef'], ': current/should snapshot unchanged; saving snapshot added', f0.get('saving'), '→', r['fx'].get('saving',{}).get('gbpPerUnit'))
print('checked', len(first), 'saved records for snapshot changes after their save')
for s,run in (('before',B),('after',A)):
    print(s,'currency totals:', [(c['currency'],c['currentRecords'],round(c['sumCurrent'],4),c['shouldRecords'],round(c['sumShould'],4),c['sameCcyRecords'],round(c['sumGap'],4)) for c in run['summary']['currencyTotals']])
