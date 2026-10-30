#!/usr/bin/env python3
"""
World rate round (30 Oct 2026) — one config builder for every country that gets its OWN book this round.

  python3 -I scripts/rate-refresh/world-2026-10/build-world.py FR IT …     # writes scripts/rate-refresh/2026-10-world-<cc>.json
  then: npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-world-<cc>.json --write

ONE method for every country of a kind, so 33 books are not 33 different judgements. Every figure comes from
`official/*.json` (read from the publishers' APIs by fetch-official.py) or `research/*.json` (researchers, every item
with its URL); this script only does the arithmetic and writes the judgements down in each basis line.

Europe (EU members + Serbia + Turkey — Eurostat publishes them):
  labour   Eurostat labour cost per hour WORKED in manufacturing (lc_lci_lev, latest year; compensation + taxes −
           subsidies, so employer contributions and paid leave are inside) × the labour cost index from that year's
           quarters to the latest same quarters (lc_lci_r2_q, NACE C, unadjusted) × the occupation's mean hourly earnings
           ÷ all occupations' (SES 2022, manufacturing, 10+ employees: ISCO major groups — the survey publishes no finer).
  energy   Eurostat non-household prices, latest semester, excl. VAT and recoverable levies: electricity band ID
           (2–20 GWh a year), gas band I3 (10–100 TJ a year).
  FX       ECB euro reference rate of the latest day, crossed through EUR.
  hours    3 × 8 h, Monday–Friday, on the country's 2026 working days (weekday national public holidays removed).
  finance  ECB composite cost of borrowing for new loans to non-financial corporations (euro area), else the central
           bank's new-loan rate (research/finance.json).
  life     the tax code's straight-line rate for general plant & machinery (research/tax-fx.json).
  rent     broker industrial / logistics rent (research/rent.json).
  machines capex at the EU single-market list price where one is sourced (the German / Polish books' groups, in €);
           every other machine's capital AT PAR (×1, no unsourced country discount) under the country's operating model.
  materials the German book's European-market anchors (€) at the country's FX — one European market, freight to the
           plant not added; a grade with no European anchor stays at the book's own price, AT PAR (×1).
"""
import json, os, sys, datetime, re

HERE = os.path.dirname(os.path.abspath(__file__))
RR = os.path.dirname(HERE)
OFF = lambda n: json.load(open(os.path.join(HERE, 'official', n)))
FX, ES, MIR, HOL = OFF('fx.json'), OFF('eurostat.json'), OFF('ecb-mir.json'), OFF('holidays.json')


def research(name):
    p = os.path.join(HERE, 'research', name)
    return json.load(open(p))['items'] if os.path.exists(p) else []


DE = json.load(open(os.path.join(RR, '2026-10-germany.json')))
PL = json.load(open(os.path.join(RR, '2026-10-poland.json')))

# region → (name, currency, symbol, Eurostat geo); names must equal REGIONAL_DATA[<cc>].name
REGIONS = {
    'FR': ('France', 'EUR', '€'), 'IT': ('Italy', 'EUR', '€'), 'ES': ('Spain', 'EUR', '€'), 'NL': ('Netherlands', 'EUR', '€'),
    'BE': ('Belgium', 'EUR', '€'), 'PT': ('Portugal', 'EUR', '€'), 'SK': ('Slovakia', 'EUR', '€'), 'SI': ('Slovenia', 'EUR', '€'),
    'LT': ('Lithuania', 'EUR', '€'), 'BG': ('Bulgaria', 'EUR', '€'), 'AT': ('Austria', 'EUR', '€'),
    'CZ': ('Czech Republic', 'CZK', 'Kč'), 'RO': ('Romania', 'RON', 'lei'), 'SE': ('Sweden', 'SEK', 'kr'),
    'RS': ('Serbia', 'RSD', 'din'),
}
EUROPE = set(REGIONS)

ISCO = {  # CostVision role → SES ISCO-08 major group (the survey's finest split), and why
    'skilled': ('OC7', 'craft and related trades (ISCO 7: machinists 7223, fitters 7233)'),
    'semiskilled': ('OC8', 'plant and machine operators and assemblers (ISCO 8)'),
    'foundry': ('OC7', 'craft and related trades (ISCO 7: moulders and coremakers 7211)'),
    'electronics': ('OC8', 'plant and machine operators and assemblers (ISCO 8: electronic equipment assemblers 8212)'),
    'inspector': ('OC7', 'craft and related trades (ISCO 7: product graders and testers 7543)'),
    'technician': ('OC3', 'technicians and associate professionals (ISCO 3: engineering technicians 311)'),
    'supervisor': ('OC3', 'technicians and associate professionals (ISCO 3: manufacturing supervisors 3122 — the survey has no finer split, so a supervisor costs as a technician)'),
    'engineer': ('OC2', 'professionals (ISCO 2: engineering professionals 214)'),
}
GRADES = {  # process labour grades → the category they are paid as
    'forge': ('OC7', 'craft and related trades (ISCO 7: forging-press workers 7221)'),
    'furnace': ('OC8', 'plant and machine operators (ISCO 8: metal processing plant operators 8121)'),
    'blow': ('OC8', 'plant and machine operators (ISCO 8: plastic products machine operators 8142)'),
    'roto': ('OC8', 'plant and machine operators (ISCO 8: plastic products machine operators 8142)'),
    'thermoform': ('OC8', 'plant and machine operators (ISCO 8: plastic products machine operators 8142)'),
    'trim-router': ('OC8', 'plant and machine operators (ISCO 8)'),
}


def fx_per_gbp(ccy):
    """(local per £1, local per €1) — ECB reference rates crossed through EUR; the six currencies the ECB does not publish
    take their central bank's own rate against the euro (research/tax-fx.json), crossed with the ECB's €/£."""
    pe = FX['perEur']
    if ccy in pe:
        return round(pe[ccy] / pe['GBP'], 4), round(pe[ccy], 4)
    it = next((i for i in research('tax-fx.json') if i.get('key') == f'fx.central.{ccy}' and 'EUR' in str(i.get('unit', '')) and i.get('value')), None)
    if not it:
        raise KeyError(f'{ccy}: no ECB rate and no central-bank rate in research/tax-fx.json yet')
    v = float(it['value'])
    return round(v / pe['GBP'], 4), round(v, 4)


def find(items, key, country):
    hits = [i for i in items if i.get('key') == key and i.get('country') == country and i.get('value') is not None]
    return hits[0] if hits else None


# ── Europe: labour ───────────────────────────────────────────────────────────────────────────────────────────────
def labour_europe(cc):
    geo = cc
    lev, lci, ses = ES['lcLevelNAC']['values'], ES['lci']['values'], ES['ses']['values']
    years = sorted({k.split('|')[1] for k in lev if k.startswith(geo + '|') and lev[k] is not None})
    y = years[-1]
    level = lev[f'{geo}|{y}']
    qs = sorted({k.split('|')[1] for k in lci if k.startswith(geo + '|') and lci[k] is not None})
    up, upTxt = 1.0, f'not carried forward (no labour cost index published for {y} onward)'
    if qs:
        last = qs[-1]; ly, lq = last.split('-')
        # the latest half-year of quarters against the same quarters of the level year (no seasonal mixing)
        pick = [q for q in qs if q.startswith(ly)]
        base = [f'{y}-{q.split("-")[1]}' for q in pick]
        if all(lci.get(f'{geo}|{b}') for b in base):
            a = sum(lci[f'{geo}|{q}'] for q in pick); b = sum(lci[f'{geo}|{q}'] for q in base)
            up = a / b
            upTxt = f'× labour cost index {"+".join(pick)} ÷ {"+".join(base)} = {a:.1f} ÷ {b:.1f} = {up:.4f}'
    tot = ses.get(f'{geo}|TOTAL|GE10')
    cats, grades = {}, {}
    src = f"{ES['lcLevelNAC']['source']} ; {ES['lci']['source']} ; {ES['ses']['source']}"
    for role, (oc, why) in list(ISCO.items()) + [(g, v) for g, v in GRADES.items()]:
        e = ses.get(f'{geo}|{oc}|GE10')
        ratio = e / tot
        v = level * up * ratio
        basis = (f'Eurostat labour cost per hour worked, manufacturing, {y}: {level} (national currency, compensation of employees + '
                 f'taxes − subsidies: employer contributions and paid leave inside) {upTxt} × {why}: SES 2022 mean hourly earnings '
                 f'€{e} ÷ all occupations €{tot} = {ratio:.4f} → {v:.2f}/h')
        entry = {'localPerHr': round(v, 2), 'basis': basis, 'source': src}
        (grades if role in GRADES else cats)[role] = entry
    return cats, grades, y, up


def energy_europe(cc):
    el, gs = ES['electricity']['values'], ES['gas']['values']
    def latest(vals):
        ks = sorted(k for k in vals if k.startswith(cc + '|') and vals[k] is not None)
        return (ks[-1].split('|')[1], vals[ks[-1]]) if ks else (None, None)
    te, e = latest(el); tg, g = latest(gs)
    basis = (f'Eurostat non-household prices excl. VAT and recoverable levies, national currency: electricity band ID '
             f'(2–20 GWh/yr) {te} = {e}/kWh (nrg_pc_205); gas band I3 (10–100 TJ/yr) {tg} = {g}/kWh (nrg_pc_203)')
    return {'electricityLocalPerKwh': e, 'gasLocalPerKwh': g, 'basis': basis,
            'sources': [{'research': 'eurostat.nrg_pc_205', 'source': ES['electricity']['source'], 'date': te},
                        {'research': 'eurostat.nrg_pc_203', 'source': ES['gas']['source'], 'date': tg}]}


# ── operating model ──────────────────────────────────────────────────────────────────────────────────────────────
def working_days(cc):
    h = HOL['values'][cc]
    hol = {x['date'] for x in h['holidays'] if x['national']}
    d, n, skipped = datetime.date(2026, 1, 1), 0, []
    while d.year == 2026:
        if d.weekday() < 5:
            if d.isoformat() in hol: skipped.append(d.isoformat())
            else: n += 1
        d += datetime.timedelta(days=1)
    return n, len(skipped), h['source']


def finance(cc, ccy):
    if ccy == 'EUR' and MIR['values'].get(cc, {}).get('obs'):
        m, v = MIR['values'][cc]['obs'][-1]
        return v / 100, (f'ECB composite cost of borrowing, new loans to non-financial corporations, {cc}, {m}: {v}%'), MIR['values'][cc]['source']
    it = find(research('finance.json'), 'finance.corporate_loan', cc)
    if it:
        return float(it['value']) / 100, f"{it['basis']} ({it.get('date', '')})", it['source']
    return None, None, None


# Machine life = the country's tax straight-line life for general plant & machinery, the economic-life proxy every
# country book uses (Germany's AfA 14 yr, Poland 14 %, Hungary 14.5 %, China 10 yr, India Schedule II). Rules, in order:
#  - a straight-line rate (fixed, or the code's maximum) of at most 20 % a year → life = 100 ÷ rate;
#  - a RANGE the tax guidance gives (no single rate) → its midpoint (the ranges are copied from the research basis);
#  - no rate, a declining-balance-only pool, or an accelerated incentive (> 20 % a year: an incentive to invest, not a
#    life) → the median life of the countries with a straight-line life this round, stated as such.
LIFE_RANGES = {   # country: (low %, high %, what the guidance says) — from research/tax-fx.json
    'FR': (10, 15, "BOFiP usual straight-line rates 'Matériel 10 à 15'"),
    'RO': (8.33, 12.5, 'HG 2139/2004 catalogue 2.1.5.2 machine tools and machining centres 8–12 years'),
    'VN': (6.67, 14.29, 'Circular 45/2013/TT-BTC B-1 machine tools 7–15 years'),
    'MA': (10, 15, "administrative guidelines 'Production equipment, tools 10 to 15'"),
}


def _sl_life(it):
    v = it.get('value')
    if v is None: return None
    scope = (it.get('scope') or '').lower()
    if 'declining' in scope or 'accelerated' in (it.get('basis') or '').lower() and float(v) > 20: return None
    return None if float(v) > 20 else 100 / float(v)


def life(cc):
    items = [i for i in research('tax-fx.json') if i.get('key') == 'tax.depreciation.machinery']
    it = next((i for i in items if i['country'] == cc), None)
    if not it: return None, None, None
    l = _sl_life(it)
    if l:
        kind = 'maximum ' if 'maximum' in (it.get('scope') or '') else ''
        return round(l, 2), f"tax straight-line {kind}rate {it['value']}% a year for plant & machinery → {l:.2f} yr ({it['basis'][:240]})", it['source']
    if cc in LIFE_RANGES:
        lo, hi, what = LIFE_RANGES[cc]; mid = (lo + hi) / 2
        return round(100 / mid, 2), f'tax guidance gives a range, {what}: midpoint {mid:.2f}% a year → {100 / mid:.2f} yr', it['source']
    lives = sorted(l for l in (_sl_life(i) for i in items) if l)
    med = lives[len(lives) // 2]
    why = it.get('scope') or 'no straight-line rate'
    return round(med, 2), (f'{why} ({it["basis"][:160]}) — not a life: the median tax straight-line life of the '
                           f'{len(lives)} round countries that have one, {med:.2f} yr'), it['source']


def rent(cc, ccy, per_eur):
    it = find(research('rent.json'), 'rent.industrial', cc)
    if not it: return None, None, None
    v, cur = float(it['value']), it.get('currency', ccy)
    if cur == 'EUR' and ccy != 'EUR':
        v = v * per_eur
        note = f" = {v:.2f} {ccy} at €1 = {per_eur} {ccy} (ECB {FX['day']})"
    elif cur != ccy and cur != 'EUR':
        raise SystemExit(f'{cc}: rent in {cur} — convert in research first')
    else:
        note = ''
    return round(v, 2), f"{it['basis']} ({it.get('scope', '')}, {it.get('date', '')}){note}", it['source']


def groups_eu(ccy, per_eur, sym):
    out = []
    for g in DE['machines']['groups'] + [x for x in PL['machines']['groups'] if x['id'] == 'press-brake-eu']:
        eur = g['refCapexLocal'] if g in DE['machines']['groups'] else 136000
        loc = round(eur * per_eur, 2)
        b = g['basis'] if ccy == 'EUR' else f"{g['basis']} = {sym}{loc:,.0f} at €1 = {per_eur} {ccy} (ECB {FX['day']})"
        if g['id'] == 'press-brake-eu':
            b = ('TRUMPF TruBend 3100 (100 t × 3 m) NEW, offered at €136,000 FCA ex-VAT (Jul 2026) — one EU single-market price'
                 + ('' if ccy == 'EUR' else f' = {sym}{loc:,.0f} at €1 = {per_eur} {ccy}'))
        out.append({'id': g['id'], 'match': g['match'], 'refId': g['refId'], 'refCapexLocal': loc, 'basis': b,
                    'source': g['source'], 'confidence': g['confidence']})
    return out


def families_eu(ccy, per_eur, sym):
    out = []
    for f in DE['materialFamilies']:
        f = json.loads(json.dumps(f))
        if ccy != 'EUR':
            f['anchorLocalPerKg'] = round(f['anchorLocalPerKg'] * per_eur, 4)
            f['anchorBasis'] = f"{f['anchorBasis']} — at €1 = {per_eur} {ccy} (ECB {FX['day']}): {sym}{f['anchorLocalPerKg']}/kg"
        f['anchorBasis'] = f"European market (as the German book): {f['anchorBasis']}"
        out.append(f)
    return out


def build(cc):
    name, ccy, sym = REGIONS[cc]
    fx, per_eur = fx_per_gbp(ccy)
    missing = []
    cats, grades, ly, up = labour_europe(cc)
    days, hol, hol_src = working_days(cc)
    fin, fin_b, fin_s = finance(cc, ccy)
    lf, lf_b, lf_s = life(cc)
    rt, rt_b, rt_s = rent(cc, ccy, per_eur)
    for k, v in (('finance', fin), ('life', lf), ('rent', rt)):
        if v is None: missing.append(k)
    const = re.sub(r'[^A-Z]', '_', name.upper()) + '_BOOK'
    d = f'scripts/rate-refresh/world-2026-10/books/{cc.lower()}'
    cfg = {
        'asOf': '2026-10-30',
        'label': f'{name} rate book — world round, one method for every European country (Eurostat, ECB, sourced research), 3 × 8 h',
        'region': cc, 'currency': ccy, 'currencySymbol': sym, 'dir': d, 'snapshot': f'{d}/current-book.json',
        'bookFile': f'src/engine/country-books/{cc.lower()}.ts', 'bookConst': const,
        'writeFx': True, 'fxPerGbp': fx,
        'fxBasis': f"ECB euro reference rates {FX['day']}: €1 = {per_eur} {ccy}, €1 = £{FX['perEur']['GBP']} → £1 = {fx} {ccy}",
        'labour': {
            'categories': cats, 'grades': grades,
            'loadingIncluded': (f'Fully-loaded hourly cost INCLUDES: everything Eurostat counts as labour cost in manufacturing — wages and '
                                f'salaries, bonuses, paid leave and public holidays, employer social contributions, vocational training and '
                                f'other labour taxes, less subsidies — per hour ACTUALLY WORKED ({ly}, carried to 2026 by the labour cost '
                                f'index); the role\'s level is its ISCO major group\'s mean hourly earnings relative to all occupations in '
                                f'manufacturing (SES 2022)'),
            'loadingNotIncluded': ('NOT included: a 3-shift premium beyond what the average manufacturing employee is paid (the average '
                                   'already holds the shift allowances actually paid); overtime; agency margins; work clothing and training '
                                   'time outside the survey'),
            'short': f'Eurostat manufacturing labour cost per hour worked {ly} × LCI × SES occupation ratio',
        },
        'energy': energy_europe(cc),
        'machines': {
            'hoursPerYear': days * 24,
            'hoursBasis': f'3 × 8 h, Monday–Friday, {name}\'s 2026 working calendar: {days * 24} h ({days} days × 24 h; {hol} weekday national public holidays removed — {hol_src})',
            'shiftDepreciationFactor': 1.0, 'shiftBasis': f'{name} straight-line tax depreciation — no shift uplift on capital',
            'lifeYears': lf, 'financeRate': fin and round(fin, 4),
            'financeBasis': fin_b, 'ukFinanceRate': 0.04,
            'maintenancePctOfCapex': 0.035, 'maintenanceBasis': f'the library\'s own line build-up rule (3.5% of capex); no {name} norm found',
            'rentLocalPerM2Month': rt, 'rentBasis': rt_b, 'ukRentGbpPerM2Yr': 110,
            'capitalHeldFactor': 1.0,
            'groups': groups_eu(ccy, per_eur, sym),
            'notRebuiltBasis': (f'capex not found for {name}: the machine\'s capital is the book\'s AT PAR (×1 — the same machine costs the '
                                f'same on the EU single market; no unsourced country discount), under {name}\'s operating model (3 × 8 h, '
                                f'tax life, loan finance, rent, tariff, support at {name} wages)'),
        },
        'materialFamilies': families_eu(ccy, per_eur, sym),
        'held': DE['held'],
        'heldMaterialsAtPar': {'basis': f'no European anchor this round (the German book\'s held list: engineering and stainless bar, electrical '
                                        f'steel, wrought Al bar / plate, magnesium, titanium / nickel, filled / FR compounds, TPE / TPU, rubber '
                                        f'compounds, composites) — the book\'s European-market price at par, no {name} factor'},
        'alBilletPremiumUsdPerT': {**DE['alBilletPremiumUsdPerT'], 'basis': 'European ' + DE['alBilletPremiumUsdPerT']['basis']},
        'shopMultipliersBasis': (f'Overhead and packaging: the UK basis × {name}\'s held multipliers — not researched this round (no {name} '
                                 f'overhead share or packaging comparator found)'),
        'sources': {'finance': fin_s, 'life': lf_s, 'rent': rt_s, 'holidays': hol_src},
    }
    if not cfg_has_lab_rows(cc):
        cfg['noLibraryLabourRows'] = True
    return cfg, missing


def cfg_has_lab_rows(cc):
    lib = open(os.path.join(RR, '..', '..', 'src', 'engine', 'rate-library.ts')).read()
    return f"id: 'lab-{cc.lower()}-" in lib


if __name__ == '__main__':
    todo = sys.argv[1:] or sorted(REGIONS)
    for cc in todo:
        try:
            cfg, missing = build(cc)
        except KeyError as e:
            print(f'{cc}: NOT written — {e}')
            continue
        if missing:
            print(f'{cc}: NOT written — missing {", ".join(missing)} (research pending)')
            continue
        out = os.path.join(RR, f'2026-10-world-{cc.lower()}.json')
        json.dump(cfg, open(out, 'w'), indent=1, ensure_ascii=False)
        c = cfg['labour']['categories']
        print(f"{cc}: fx {cfg['fxPerGbp']} skilled {c['skilled']['localPerHr']} engineer {c['engineer']['localPerHr']} "
              f"elec {cfg['energy']['electricityLocalPerKwh']} gas {cfg['energy']['gasLocalPerKwh']} h {cfg['machines']['hoursPerYear']} "
              f"life {cfg['machines']['lifeYears']} fin {cfg['machines']['financeRate']} rent {cfg['machines']['rentLocalPerM2Month']}")
