"""Convert the user-supplied study files into marketplace idea packs.

Every text field is copied VERBATIM from the source; nothing is invented. Fields
the source does not carry are left empty or "Not stated". Each idea keeps its
study, original ID and an exact source pointer (file / sheet / row, deck slide).
"""
import json, re, os
from collections import Counter

S = os.environ.get('STUDY_DIR') or os.path.dirname(os.path.abspath(__file__))  # folder holding txt/ (the extracted study files)
T = f'{S}/txt'
OUT = f'{S}/packs'
os.makedirs(OUT, exist_ok=True)
J = lambda f: json.load(open(f'{T}/{f}'))
s = lambda v: '' if v is None else str(v).strip()


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def money_gbp(v, dec=2):
    return f'£{v:,.{dec}f}'


def money_big(v, sym='£'):
    a = abs(v)
    if a >= 1e6:
        t = f'{sym}{a / 1e6:.2f}M'
    elif a >= 1e3:
        t = f'{sym}{a / 1e3:.1f}K'
    else:
        t = f'{sym}{a:,.0f}'
    return t


def deck_index(deck_json, pattern):
    """Map an idea ID to the deck slides that carry it (1-based), with their text."""
    slides = J(deck_json)
    idx = {}
    for i, paras in enumerate(slides, 1):
        txt = ' '.join(paras)
        for m in set(re.findall(pattern, txt)):
            idx.setdefault(m, []).append((i, paras))
    return idx


NOT_ADDITIVE = ('Savings across ideas are NOT additive: the study states that ideas in a conflict set are '
                'mutually exclusive and that its combined capture is not the sum of the cards.')


def base(idea_id, title, system, level, study, study_code, src_file):
    return {
        'id': idea_id, 'title': title, 'system': system,
        'submittedBy': f'Study: {study} (user-supplied)', 'verified': 0, 'stars': 0,
        'level': level,
        'ideaData': {'id': idea_id, 'title': title, 'study': study, 'studyCode': study_code,
                     'sourceFile': src_file, 'confidenceLevel': 'estimated'},
    }


packs = {}

# ── 1. EDU Function Analysis (166) + Phase 5 Development Pack (77) ─────────
edu = J('EDU_Function_Analysis.xlsx.json')
reg = [r for r in edu['7. Creativity idea register'][7:] if s(r[0])]
evh = edu['11. Phase 4 evaluation'][3]
ev = {s(r[0]): dict(zip(evh, r)) for r in edu['11. Phase 4 evaluation'][4:] if s(r[0])}
edu_deck = deck_index('EDU_Phase5_Development_Pack.pptx.json', r'\b[A-Z]\d{1,2}\b')
EDU_VOL = 100_000
ideas = []
for i, r in enumerate(reg):
    rid = s(r[0]); title = s(r[4]); e = ev.get(rid, {})
    x = base(f'edu26-{rid.lower()}', title, f'EDU · {s(r[1])}', None,
             'EDU Function Analysis (single-motor EDU)', 'EDU-FA', 'EDU_Function_Analysis.xlsx')
    d = x['ideaData']
    lo, hi = num(r[13]), num(r[14])
    status = s(e.get('Decision')) or 'Not evaluated'
    d.update({
        'originalId': rid,
        'sourcePointer': f"EDU_Function_Analysis.xlsx › '7. Creativity idea register' row {i + 8}; '11. Phase 4 evaluation'",
        'studyStatus': status, 'studyDecisionReason': s(e.get('Reason')),
        'ideaClass': s(r[2]), 'lever': s(r[3]), 'targetFunctions': s(r[5]), 'functionClass': s(r[6]),
        'valueIndex': num(r[7]), 'functionValueGapGBP': num(r[8]), 'componentsAffected': s(r[9]),
        'affectedCostGBP': num(r[10]),
        'technicalDescription': f"Baseline: {s(r[15])} Proposal: {s(r[16])}",
        'costReductionMechanism': s(r[17]), 'riskNotes': s(r[18]), 'validationRequired': s(r[19]),
        'investment': None, 'investmentText': s(r[20]), 'timeToImplement': s(r[21]),
        'benchmarkReference': s(r[22]), 'practiceNote': s(r[23]), 'maturity': s(r[24]),
        'implementationDifficulty': {'Med': 'Medium'}.get(s(r[25]), s(r[25])), 'conflictsWith': s(r[26]),
        'powertrain': 'BEV (single-motor EDU)',
        'weightedScore': num(e.get('Weighted score')), 'pSuccess': num(e.get('P(success)')),
        'riskAdjustedLowGBP': num(e.get('Risk-adj low')), 'riskAdjustedHighGBP': num(e.get('Risk-adj high')),
        'nreGBP': num(e.get('NRE (GBP)')), 'nreShared': s(e.get('NRE shared?')),
        'paybackYears': num(e.get('Payback (years)')),
    })
    pct = f"{num(r[11]) * 100:.0f}-{num(r[12]) * 100:.0f}% of the affected component cost" if num(r[11]) is not None else ''
    if lo is not None and hi is not None:
        per = f'{money_gbp(lo)}-{money_gbp(hi)} per unit'
        ann = f'{money_big(lo * EDU_VOL)}-{money_big(hi * EDU_VOL)} at 100,000 units/yr'
        basis = (f"Study register band: {pct} of £{num(r[10]):,.2f} affected cost = {money_gbp(lo)}-{money_gbp(hi)} per unit "
                 f"× 100,000 units/yr (study volume, Assumptions tab). Phase 4 risk-adjusted: "
                 f"{money_gbp(d['riskAdjustedLowGBP'] or 0)}-{money_gbp(d['riskAdjustedHighGBP'] or 0)} per unit at P(success) {d['pSuccess']}; "
                 f"NRE £{(d['nreGBP'] or 0):,.0f} ({d['nreShared']}); payback {d['paybackYears']} yrs. Indicative band, not a quotation.")
    else:
        per, ann, basis = 'Not stated', 'Not stated', ''
    d['costSavingPotential'] = {'perVehicle': per, 'annualValue': ann, 'percentage': pct, 'calculationBasis': basis,
                                'qualitative': f"{s(r[2])} · {s(r[3])}"}
    d['volumeBasis'] = f'Study volume 100,000 units/yr. {NOT_ADDITIVE} Conflicts with: {s(r[26]) or "none stated"}.'
    if rid in edu_deck:
        sl = edu_deck[rid]
        d['developmentPackSlides'] = [n for n, _ in sl]
        d['developmentPackNotes'] = ' ¶ '.join(' | '.join(p) for n, p in sl if p and p[0].startswith(rid))[:12000]
    x.update({'costSavingType': s(r[3]), 'annualSaving': ann if lo is not None else 'Not stated',
              'difficulty': d['implementationDifficulty'], 'timeToImplement': s(r[21]),
              'description': f"[EDU study · {status}] {title}. {s(r[16])[:600]}"})
    ideas.append(x)
packs['marketplace-study-edu-function-analysis.json'] = ideas

# ── 2. 48V MHEV Should-Cost v1.8 (151) + Development Pack (35) ─────────────
m = J('48V_MHEV_Should_Cost_v1.8.xlsx.json')
ih = m['Ideas'][3]
reg = [r for r in m['Ideas'][4:] if s(r[0]).startswith('ID-')]
eh = m['Evaluation'][26]
ev = {s(r[0]): dict(zip(eh, r)) for r in m['Evaluation'][27:] if s(r[0]).startswith('ID-')}
mh_deck = deck_index('48V_MHEV_Development_Pack.pptx.json', r'ID-\d{3}')
VOL48 = 120_000
LEVEL = {'component': 'part', 'sub-assembly': 'subassembly', 'assembly': 'assembly'}
ideas = []
for i, r in enumerate(reg):
    rr = dict(zip(ih, r)); rid = s(rr['ID']); title = s(rr['Title']); e = ev.get(rid, {})
    grp = s(rr['Group'])
    x = base(f'mhev48s-{rid.lower()}', title, f'48V Battery · {grp.split(",")[0].strip()[2:]}', LEVEL.get(s(rr['Level'])),
             '48V MHEV Battery Should-Cost v1.8', '48V-SC', '48V_MHEV_Should_Cost_v1.8.xlsx')
    d = x['ideaData']
    lo, hi = num(rr['Saving low']), num(rr['Saving high'])
    status = s(e.get('Decision')) or 'Not evaluated'
    d.update({
        'originalId': rid,
        'sourcePointer': f"48V_MHEV_Should_Cost_v1.8.xlsx › 'Ideas' row {i + 5}; 'Evaluation'",
        'studyStatus': status, 'studyDecisionReason': s(e.get('Reason')),
        'depth': s(rr['Depth']), 'groups': grp, 'lever': s(rr['Lever']), 'ideaClass': s(rr['Novelty']),
        'maturity': s(rr['Maturity']), 'componentsAffected': s(rr['Components']), 'targetFunctions': s(rr['Target functions']),
        'affectedCostGBP': num(rr['Affected GBP']),
        'technicalDescription': s(rr['Specifics']), 'costReductionMechanism': s(rr['Cost mechanism']),
        'riskNotes': s(rr['Trade-offs and risks']), 'validationRequired': s(rr['Validation required']),
        'benchmarkReference': s(rr['Benchmark']), 'investmentText': s(rr['Investment']),
        'timeToImplement': s(rr['Lead time']), 'implementationDifficulty': s(rr['Effort']),
        'conflictsWith': s(rr['Conflicts']), 'savingBasis': s(rr['Saving basis']),
        'powertrain': 'MHEV (48V battery pack)',
        'weightedScore': num(e.get('Weighted')), 'pSuccess': num(e.get('p success')),
        'riskAdjustedLowGBP': num(e.get('Risk-adj low')), 'riskAdjustedHighGBP': num(e.get('Risk-adj high')),
        'nreGBP': num(e.get('NRE GBP')), 'nreShared': s(e.get('Shared NRE')), 'paybackYears': num(e.get('Payback yrs')),
        'nreNote': s(e.get('NRE note')),
    })
    if lo is not None and hi is not None:
        per = f'{money_gbp(lo)}-{money_gbp(hi)} per pack'
        ann = f'{money_big(lo * VOL48)}-{money_big(hi * VOL48)} at 120,000 packs/yr'
        basis = (f"Study register band ({s(rr['Saving basis'])}) on £{num(rr['Affected GBP']):,.2f} affected cost = "
                 f"{money_gbp(lo)}-{money_gbp(hi)} per pack × 120,000 packs/yr (study volume, README). Evaluation risk-adjusted: "
                 f"{money_gbp(d['riskAdjustedLowGBP'] or 0)}-{money_gbp(d['riskAdjustedHighGBP'] or 0)} per pack at p {d['pSuccess']}; "
                 f"NRE £{(d['nreGBP'] or 0):,.0f}; payback {d['paybackYears']} yrs. No teardown or quotation exists (study README).")
    else:
        per, ann, basis = 'Not stated', 'Not stated', ''
    d['costSavingPotential'] = {'perVehicle': per, 'annualValue': ann, 'calculationBasis': basis,
                                'qualitative': f"{s(rr['Novelty'])} · {s(rr['Lever'])}"}
    d['volumeBasis'] = f'Study volume 120,000 packs/yr for 7 years. {NOT_ADDITIVE} Conflicts: {s(rr["Conflicts"]) or "none stated"}.'
    if rid in mh_deck:
        d['developmentPackSlides'] = [n for n, _ in mh_deck[rid]]
        d['developmentPackNotes'] = ' ¶ '.join(' | '.join(p) for n, p in mh_deck[rid])[:12000]
    x.update({'costSavingType': s(rr['Lever']), 'annualSaving': ann if lo is not None else 'Not stated',
              'difficulty': s(rr['Effort']), 'timeToImplement': s(rr['Lead time']),
              'description': f"[48V MHEV study · {status}] {title}. {s(rr['Specifics'])[:600]}"})
    ideas.append(x)
packs['marketplace-study-48v-mhev-should-cost.json'] = ideas

# ── 3. Driveline masters (Half shaft, Differential, Prop shaft, Transfer case) ─
DRIVE = [
    ('Half_Shaft_Master_2026.xlsx.json', 'Half Shafts', 'Half-Shaft Study 2026', 'HS26', 'hs26',
     'Half_Shaft_Study_2026.pptx.json', 'Half_Shaft_Study_2026.pdf.txt'),
    ('Differential_Master_2026.xlsx.json', 'Differentials', 'Differential Study 2026', 'DIF26', 'dif26', None, None),
    ('Prop_Shaft_Master_2026.xlsx.json', 'Prop Shafts', 'Prop-Shaft Study 2026', 'PS26', 'ps26',
     'Prop_Shaft_Study_2026.pptx.json', None),
    ('Transfer_Case_Master_2026.xlsx.json', 'Transfer Case', 'Transfer-Case Study 2026', 'TC26', 'tc26',
     'Transfer_Case_Study_2026.pptx.json', 'Transfer_Case_Study_2026.pdf.txt'),
]
LEVER = {'M': 'material', 'P': 'process', 'D': 'design'}
DVOL = 80_000


def classify_cost(t):
    tl = t.lower()
    if 'avoided' in tl:
        return 'Cost avoidance'
    if 'deferred' in tl:
        return 'Deferred (not refused)'
    if 'refused' in tl or 'rejected' in tl:
        return 'Refused saving (protected)' if 'saving' in tl else 'Rejected alternative'
    if 'adder' in tl or t.startswith('+'):
        return 'Cost adder (defended)'
    if re.match(r'^\s*[-−]£', t):
        return 'Saving'
    return 'No cost change (specification)'


for fn, system, study, code, pfx, deck, pdf in DRIVE:
    x0 = J(fn); sh = [k for k in x0 if 'VAVE' in k][0]
    rows = x0[sh]
    hdr = next(r for r in rows if s(r[0]) == 'ID')
    capture = ' '.join(s(r[0]) for r in rows if s(r[0]).startswith('COMBINED CAPTURE'))
    scope = next((s(c) for R in x0.values() for r in R for c in r if s(c).startswith('SCOPE:')), '')
    didx = deck_index(deck, r'\b[MPD]\d{1,2}\b') if deck else {}
    pdftxt = open(f'{T}/{pdf}').read() if pdf else ''
    ideas = []
    for i, r in enumerate(rows):
        rid = s(r[0])
        if not re.fullmatch(r'[A-Z]\d{1,2}', rid):
            continue
        rr = dict(zip([s(h) for h in hdr], r))
        title = s(r[1]); how = s(r[2]); spec = s(r[3]); cost = s(r[4]); duty = s(r[5])
        if code == 'TC26':
            trade, maturity, effort, evidence, lever = s(r[6]), s(r[7]), s(r[8]), '', LEVER.get(rid[0], '')
        else:
            trade, maturity, evidence, lever = s(r[6]), '', s(r[7]), s(r[8])
            em = re.search(r'(?i)effort\s*:?\s*(very high|high|medium|low)', trade)
            effort = em.group(1).title() if em else ''
            mm = re.match(r'^([^·]+)·', trade)
            maturity = mm.group(1).strip() if mm else ''
        status = classify_cost(cost)
        amt = re.findall(r'[-−+]?£\s?([\d,.]+)', cost)
        val = float(amt[0].replace(',', '')) if amt else None
        x = base(f'{pfx}-{rid.lower()}', title, system, None, study, code, fn.replace('.json', ''))
        d = x['ideaData']
        d.update({'originalId': rid, 'sourcePointer': f"{fn.replace('.json', '')} › '{sh}' row {i + 1}",
                  'studyStatus': status, 'lever': lever, 'maturity': maturity,
                  'technicalDescription': f"How it works (benchmark as named by the study): {how} SPEC: {spec}",
                  'costReductionMechanism': f"Cost effect (study): {cost}. SPEC: {spec}",
                  'riskNotes': f"Duty / environment: {duty} Trade-off: {trade}",
                  'evidencePointer': evidence, 'studyCostEffect': cost, 'implementationDifficulty': effort,
                  'powertrain': 'ICE / MHEV (longitudinal I6 ~500 Nm, V8 ~700 Nm, 8AT — study reference vehicle)',
                  'offRoad': True, 'targetVehicle': scope[:600],
                  'studyCombinedCapture': capture[:1500]})
        if status == 'Saving' and val is not None:
            per = f'£{val:,.2f} per vehicle'
            ann = f'{money_big(val * DVOL)} at 80,000 vehicles/yr'
            basis = (f"Study cost effect {cost} per vehicle × 80,000 vehicles/yr (the study's stated amortisation volume). "
                     f"Figures marked * are the study's directional estimates, at its declared FX EUR→GBP 0.8644.")
            x['annualSaving'] = ann
        else:
            per = 'No saving booked'
            ann = f'No saving booked — {status.lower()}'
            basis = (f"Study cost effect: {cost}. Classed as '{status}', so it is NOT counted as a saving. "
                     f"Figures marked * are the study's directional estimates.")
            x['annualSaving'] = ann
        d['costSavingPotential'] = {'perVehicle': per, 'annualValue': ann, 'calculationBasis': basis,
                                    'qualitative': status}
        d['volumeBasis'] = f'Study amortisation volume 80,000 vehicles/yr. {NOT_ADDITIVE}'
        if rid in didx:
            d['studyDeckSlides'] = sorted({n for n, _ in didx[rid]})
        if pdftxt:
            pages = [p for p, t in enumerate(pdftxt.split('\f'), 1) if re.search(rf'\b{rid}\b', t)]
            if pages:
                d['studyPdfPages'] = pages
        x.update({'costSavingType': lever, 'difficulty': effort, 'timeToImplement': 'Not stated',
                  'description': f"[{study} · {status}] {title}. {how[:600]}"})
        ideas.append(x)
    packs[f'marketplace-study-{pfx}-{system.lower().replace(" ", "-")}.json'] = ideas

# ── 4. BMW iX3 Gen6 battery benchmark (4) ─────────────────────────────────
b = J('BMW_iX3_Gen6_Battery_Benchmark.xlsx.json')
rows = b['5 VAVE from this study']
capture = ' '.join(s(r[0]) for r in rows if s(r[0]).startswith('COMBINED CAPTURE'))
ideas = []
for i, r in enumerate(rows):
    rid = s(r[0])
    if not re.fullmatch(r'[A-Z]\d{1,2}', rid):
        continue
    title, how, spec, eur, cert = s(r[1]), s(r[2]), s(r[3]), s(r[4]), s(r[5])
    transfer = eur.startswith('+')
    status = 'Cost transfer (pack +, vehicle −)' if transfer else 'Saving'
    rng = re.findall(r'[−-]€\s?([\d.]+)', eur.split('/')[0])
    x = base(f'ix3b-{rid.lower()}', title, 'HV Battery · Pack architecture (BMW iX3 Gen6 benchmark)', None,
             'BMW iX3 Gen6 Battery Benchmark', 'IX3-BM', 'BMW_iX3_Gen6_Battery_Benchmark.xlsx')
    d = x['ideaData']
    if not transfer and rng:
        lo = float(rng[0]); hi = float(rng[1]) if len(rng) > 1 else lo
        per = f'€{lo:,.0f}-€{hi:,.0f} per pack' if hi != lo else f'€{lo:,.0f} per pack'
        ann = 'Not stated — the benchmark states no volume'
    else:
        per = 'No pack saving booked'
        ann = 'No saving booked — cost transfer (raises pack cost, lowers vehicle cost)'
    d.update({'originalId': rid, 'sourcePointer': f"BMW_iX3_Gen6_Battery_Benchmark.xlsx › '5 VAVE from this study' row {i + 1}",
              'studyStatus': status,
              'technicalDescription': f"How it works · benchmark (as stated): {how} Spec: {spec}",
              'costReductionMechanism': f"Cost effect on the 105 kWh GROSS reference pack (study): {eur}",
              'riskNotes': cert, 'studyCostEffect': eur, 'powertrain': '800V BEV (105 kWh GROSS reference pack)',
              'studyCombinedCapture': capture,
              'costSavingPotential': {'perVehicle': per, 'annualValue': ann,
                                      'calculationBasis': f"Study figure: {eur}. Priced on the study's reference pack. {capture}",
                                      'qualitative': status},
              'volumeBasis': f'No volume stated in the benchmark. {NOT_ADDITIVE}'})
    em = re.search(r'(?i)effort\s*:?\s*(very high|high|medium|low)', cert)
    d['implementationDifficulty'] = em.group(1).title() if em else ''
    x.update({'costSavingType': 'Architecture', 'annualSaving': ann, 'difficulty': d['implementationDifficulty'],
              'timeToImplement': 'Not stated', 'description': f"[iX3 benchmark · {status}] {title}. {how[:600]}"})
    ideas.append(x)
packs['marketplace-study-ix3-gen6-battery-benchmark.json'] = ideas

tot = 0
for fn, arr in packs.items():
    json.dump(arr, open(f'{OUT}/{fn}', 'w'), indent=1, ensure_ascii=False)
    tot += len(arr)
    print(f'{fn:58s} {len(arr):4d}', dict(Counter(x["ideaData"]["studyStatus"] for x in arr)))
print('total', tot)
