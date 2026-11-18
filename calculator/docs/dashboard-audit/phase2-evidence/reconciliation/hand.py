"""Phase 2 · Step 3 — the KPIs worked out "by hand" from the saved records (evidence script, not part of the app).

Reads the costing_records rows straight from a reconciliation database (read-only) and applies the KPI definitions
written out below — WITHOUT calling the CostVision engine — printing every record's contribution so the working can be
followed line by line.

    python3 -I hand.py <should-cost.db> <tie: created|updated> <out.md> <out.json>

tie = created : the A-06 rule (same-day ties break on the creation time) — what the FIXED code must reproduce.
tie = updated : the pre-fix rule (same-day ties break on the last-edit time) — what the PRE-FIX code must reproduce.

Definitions (Phase 1 §3 "what works", unchanged by Phase 2):
  * excluded = deleted, test, or invalid; excluded records count in nothing.
  * application key = part number upper-cased with whitespace removed | programme | model year | powertrain.
  * current = per application: non-draft before draft, then latest costing date, then the tie-break, then id (desc).
  * eligible = current, should > 0, current > 0, both GBP values present, same delivery terms.
  * gap = GBP current − GBP should (GBP = original × the frozen GBP-per-unit rate of that value).
  * weighted gap % = Σ gap ÷ Σ GBP current × 100 over eligible records.
  * opportunity = Σ positive gaps; unfavourable = Σ negative gaps (never netted).
  * annualised = Σ positive gap × annual volume, only where the volume is validated and > 0.
  * validated / implemented savings = Σ GBP saving of current records with that status (saving ≥ 0).
"""
import json, sqlite3, sys

db_path, tie, out_md, out_json = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
con.row_factory = sqlite3.Row
rows = [dict(r) for r in con.execute('SELECT * FROM costing_records ORDER BY created_at, id')]
L = []
p = L.append


def key(r):
    pn = r['part_number']
    k = ''.join(pn.upper().split()) if isinstance(pn, str) else ''
    if not k:
        return f"record:{r['id']}"
    return '|'.join([k, r['programme'] if r['programme'] is not None else '—', str(r['model_year']) if r['model_year'] is not None else '—', r['powertrain'] if r['powertrain'] is not None else '—'])


# 1. Frozen FX: every GBP value must equal original × its frozen rate.
p('## 1. Frozen FX check (GBP value = original × frozen GBP-per-unit rate)\n')
p('| Part | Current (orig) | Rate | GBP current | Should (orig) | Rate | GBP should | OK |')
p('|---|---|---|---|---|---|---|---|')
fx_ok = True
for r in rows:
    fx = json.loads(r['fx'] or '{}')
    def chk(v, ccy, snap, gbp):
        if v is None:
            return '—', '—', gbp is None
        rate = (snap or {}).get('gbpPerUnit')
        if rate is None:
            return f'{v} {ccy}', 'none', gbp is None
        return f'{v} {ccy}', f'{rate:.6f}', gbp is not None and abs(v * rate - gbp) < 1e-9
    c1, cr, okc = chk(r['current_cost'], r['current_ccy'], fx.get('current'), r['gbp_current'])
    s1, sr, oks = chk(r['should_cost'], r['should_ccy'], fx.get('should'), r['gbp_should'])
    ok = okc and oks
    fx_ok &= ok
    p(f"| {r['part_number']} ({r['source_ref']}) | {c1} | {cr} | {r['gbp_current']} | {s1} | {sr} | {r['gbp_should']} | {'✓' if ok else '✗'} |")
p(f'\nAll GBP values = original × frozen rate: **{fx_ok}**\n')

# 2. Exclusions and applications
incl = []
p('## 2. Exclusions\n')
for r in rows:
    reason = 'deleted' if r['deleted_at'] else 'test' if r['is_test'] else None
    if reason:
        p(f"- {r['part_number']} ({r['source_ref']}): excluded ({reason})")
    else:
        incl.append(r)
p(f'\nIncluded records: {len(incl)} of {len(rows)}\n')

groups = {}
for r in incl:
    groups.setdefault(key(r), []).append(r)
tie_col = 'created_at' if tie == 'created' else 'updated_at'
p(f'## 3. Applications and the current record (tie-break on `{tie_col}`)\n')
p('| Application key | Records (status, costing date, created, updated) | Current |')
p('|---|---|---|')
current = []
for k, g in groups.items():
    g.sort(key=lambda r: (0 if r['status'] == 'draft' else 1, r['costing_date'], r[tie_col], r['id']), reverse=True)
    current.append(g[0])
    desc = '<br>'.join(f"{r['source_ref']} {r['status']} {r['costing_date']} c={r['created_at'][11:23]} u={r['updated_at'][11:23]}" for r in g)
    p(f"| `{k}` | {desc} | **{g[0]['source_ref']}** |")
p(f'\nCurrent records: {len(current)}; included records: {len(incl)}\n')

# 4. Eligibility and the financial KPIs
p('## 4. Eligible current records and their gaps\n')
p('| Current record | Part | GBP current | GBP should | Terms | Gap (cur − should) | Opportunity | Unfavourable | Vol validated | Annual vol | Annualised (gap × vol) | Saving |')
p('|---|---|---|---|---|---|---|---|---|---|---|---|')
F = dict(eligible=0, sumCurrent=0.0, sumShould=0.0, sumGap=0.0, oppN=0, opp=0.0, unfN=0, unf=0.0, annN=0, ann=0.0, valN=0, val=0.0, impN=0, imp=0.0)
for r in sorted(current, key=lambda r: r['part_number'] or ''):
    if r['saving_status'] and r['gbp_saving'] is not None and r['gbp_saving'] >= 0:
        if r['saving_status'] == 'validated':
            F['valN'] += 1; F['val'] += r['gbp_saving']
        else:
            F['impN'] += 1; F['imp'] += r['gbp_saving']
    ok = (r['should_cost'] or 0) > 0 and (r['current_cost'] or 0) > 0 and r['gbp_should'] is not None and r['gbp_current'] is not None and r['current_terms'] and r['current_terms'] == r['should_terms']
    if not ok:
        p(f"| {r['source_ref']} | {r['part_number']} | not eligible | | | | | | | | | |")
        continue
    gap = r['gbp_current'] - r['gbp_should']
    F['eligible'] += 1; F['sumCurrent'] += r['gbp_current']; F['sumShould'] += r['gbp_should']; F['sumGap'] += gap
    opp = unf = ann = ''
    if gap > 0:
        F['oppN'] += 1; F['opp'] += gap; opp = f'{gap:.6f}'
        if r['volume_validated'] and (r['annual_volume'] or 0) > 0:
            F['annN'] += 1; a = gap * r['annual_volume']; F['ann'] += a; ann = f"{gap:.6f} × {r['annual_volume']:,} = {a:,.2f}"
    elif gap < 0:
        F['unfN'] += 1; F['unf'] += gap; unf = f'{gap:.6f}'
    sav = f"{r['saving_status']} {r['gbp_saving']}" if r['saving_status'] else ''
    p(f"| {r['source_ref']} | {r['part_number']} | {r['gbp_current']:.6f} | {r['gbp_should']:.6f} | {r['current_terms']} | {gap:.6f} | {opp} | {unf} | {'yes' if r['volume_validated'] else 'no'} | {r['annual_volume'] if r['annual_volume'] is not None else '—'} | {ann} | {sav} |")
F['weightedGapPct'] = F['sumGap'] / F['sumCurrent'] * 100 if F['eligible'] and F['sumCurrent'] > 0 else None
p('\n## 5. Totals\n')
p(f"- Eligible current records: **{F['eligible']}**")
p(f"- Σ GBP current = **{F['sumCurrent']:.6f}**; Σ GBP should = **{F['sumShould']:.6f}**; Σ gap = **{F['sumGap']:.6f}**")
p(f"- Weighted gap = {F['sumGap']:.6f} ÷ {F['sumCurrent']:.6f} × 100 = **{F['weightedGapPct']:.4f} %** (positive: current above should-cost)")
p(f"- Opportunity = Σ positive gaps = **£{F['opp']:.6f}** over {F['oppN']} records; unfavourable = Σ negative gaps = **£{F['unf']:.6f}** over {F['unfN']} (not netted)")
p(f"- Annualised = **£{F['ann']:,.2f}** over {F['annN']} validated volume(s)")
p(f"- Validated savings = **£{F['val']:.2f}** ({F['valN']}); implemented = **£{F['imp']:.2f}** ({F['impN']})")
st = {}
for r in current:
    st[r['status']] = st.get(r['status'], 0) + 1
F['statusOfCurrent'] = st
F['completedRecords'] = sum(v for k, v in st.items() if k != 'draft')
F['awaitingReview'] = st.get('completed', 0)
F['awaitingApproval'] = st.get('reviewed', 0)
F['currentRecords'] = len(current)
F['totalRecords'] = len(incl)
F['excluded'] = len(rows) - len(incl)
com = {}
for r in current:
    com[r['commodity'] or '(not set)'] = com.get(r['commodity'] or '(not set)', 0) + 1
F['currentByCommodity'] = com
p(f"- Current records by status: {st} → completed costings (non-draft) {F['completedRecords']}, awaiting review {F['awaitingReview']}, awaiting approval {F['awaitingApproval']}")
p(f"- Current records by commodity: {com}")
p(f"- Records: {F['totalRecords']} included ({F['currentRecords']} current), {F['excluded']} excluded")
open(out_md, 'w').write(f'# Hand working — {db_path} (tie on {tie_col})\n\n' + '\n'.join(L) + '\n')
json.dump({k: v for k, v in F.items()}, open(out_json, 'w'), indent=1)
print(json.dumps(F, indent=1))
