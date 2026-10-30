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
    # The survey's major groups mix trades: ISCO 7 in manufacturing also holds food, garment and printing trades, and in
    # some countries (FR, ES, IT, BE, NL) its mean sits below ISCO 8's. A setter-machinist is not paid below the
    # operators he sets up, so the skilled role takes the HIGHER of the two manual groups and the semi-skilled the lower.
    o7, o8 = ses.get(f'{geo}|OC7|GE10'), ses.get(f'{geo}|OC8|GE10')
    hi, lo = ('OC7', 'OC8') if o7 >= o8 else ('OC8', 'OC7')
    swap = {'skilled': hi, 'semiskilled': lo}
    for role, (oc, why) in list(ISCO.items()) + [(g, v) for g, v in GRADES.items()]:
        if role in swap and swap[role] != oc:
            oc = swap[role]
            why = (f'the higher manual major group — ISCO {oc[2:]} (the survey\'s craft group ISCO 7 earns less than its operators ISCO 8 '
                   f'here, its mean pulled down by food / garment trades)' if role == 'skilled' else
                   f'the lower manual major group — ISCO {oc[2:]} (here below ISCO 8; a semi-skilled operator is not paid above the setter)')
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
    wb = OFF('worldbank.json')['values'].get(cc, {}).get('obs') or []
    if it and re.search(r'policy|money-market|overnight', (it.get('scope') or '') + it['basis'], re.I) and wb and int(wb[0][0]) >= 2024:
        y, v = wb[0]
        return v / 100, (f'World Bank lending interest rate {y} {v:.2f}% (FR.INR.LEND) — the central bank\'s own company-loan rate was not '
                         f'found; its policy / money-market rate {it["value"]}% would understate what a manufacturer pays'), OFF('worldbank.json')['values'][cc]['source']
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
    if not it:
        nf = next((i for i in research('rent.json') if i.get('key') == 'rent.industrial' and i.get('country') == cc), None)
        if nf is None: return None, None, None
        per_gbp = per_eur / FX['perEur']['GBP']
        v = round(110 / 12 * per_gbp, 2)
        return v, (f'no {cc} broker rent found (only property listings, which are not a price) — the UK book\'s rent £110/m²/yr AT PAR '
                   f'= {v} {ccy}/m²/month (no country factor)'), nf.get('source') or ''
    v, cur = float(it['value']), it.get('currency', ccy)
    if cur == 'EUR' and ccy != 'EUR':
        v = v * per_eur
        note = f" = {v:.2f} {ccy} at €1 = {per_eur} {ccy} (ECB {FX['day']})"
    elif cur == 'USD' and ccy != 'USD':
        k = per_eur / FX['perEur']['USD']
        v = v * k
        note = f" = {v:.2f} {ccy} at US$1 = {k:.4f} {ccy} (ECB {FX['day']})"
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



# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# Outside Europe (and Turkey's occupation mix): the same book, built from national / ILO earnings by occupation,
# the statutory employer contributions, hours actually worked, the regulator's industrial tariff and the regional
# market's material prices. Every fallback is named in the basis line.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
WORLD = {
    'TR': ('Turkey', 'TRY', '₺'), 'US': ('United States', 'USD', '$'), 'CA': ('Canada', 'CAD', 'C$'), 'MX': ('Mexico', 'MXN', '$M'),
    'BR': ('Brazil', 'BRL', 'R$'), 'JP': ('Japan', 'JPY', 'JP¥'), 'KR': ('South Korea', 'KRW', '₩'), 'TW': ('Taiwan', 'TWD', 'NT$'),
    'TH': ('Thailand', 'THB', '฿'), 'VN': ('Vietnam', 'VND', '₫'), 'MY': ('Malaysia', 'MYR', 'RM'), 'ID': ('Indonesia', 'IDR', 'Rp'),
    'PH': ('Philippines', 'PHP', '₱'), 'SG': ('Singapore', 'SGD', 'S$'), 'MA': ('Morocco', 'MAD', 'DH'), 'TN': ('Tunisia', 'TND', 'DT'),
    'EG': ('Egypt', 'EGP', 'E£'), 'ZA': ('South Africa', 'ZAR', 'R'),
}
ISO3 = {'TR': 'TUR', 'US': 'USA', 'CA': 'CAN', 'MX': 'MEX', 'BR': 'BRA', 'JP': 'JPN', 'KR': 'KOR', 'TW': 'TWN', 'TH': 'THA', 'VN': 'VNM',
        'MY': 'MYS', 'ID': 'IDN', 'PH': 'PHL', 'SG': 'SGP', 'MA': 'MAR', 'TN': 'TUN', 'EG': 'EGY', 'ZA': 'ZAF'}
ROLE_OC = {'skilled': '7', 'semiskilled': '8', 'foundry': '7', 'electronics': '8', 'inspector': '7', 'technician': '3', 'supervisor': '3', 'engineer': '2'}
GRADE_ROLE = {'forge': 'skilled', 'furnace': 'semiskilled', 'blow': 'semiskilled', 'roto': 'semiskilled', 'thermoform': 'semiskilled', 'trim-router': 'semiskilled'}
EMEA_EU_MARKET = {'TR', 'MA', 'TN', 'EG'}   # duty-free from the EU (customs union / association agreements) — EU list-price machines
NA = {'US', 'CA', 'MX'}
SEA = {'TH', 'VN', 'MY', 'ID', 'PH', 'SG'}
NEA = {'JP', 'KR', 'TW'}


def fx_world(cc, ccy):
    if ccy == 'VND':   # the State Bank of Vietnam refuses automated access; the ECB and IMF do not publish the dong
        cfg = json.load(open(os.path.join(RR, '2026-10-countries.json')))
        return None, None, f"held: £1 = {cfg['fx'].get('VND')} VND (scripts/rate-refresh/2026-10-countries.json, {cfg.get('fxSource', '')}) — sbv.gov.vn refuses automated access and neither the ECB nor the IMF publishes the dong"
    if ccy in FX['perEur']:
        fx, pe = fx_per_gbp(ccy)
        return fx, pe, f"ECB euro reference rates {FX['day']}: €1 = {pe} {ccy}, €1 = £{FX['perEur']['GBP']} → £1 = {fx} {ccy}"
    it = next(i for i in research('tax-fx.json') if i.get('key') == f'fx.central.{ccy}' and 'EUR' in str(i.get('unit', '')))
    fx, pe = fx_per_gbp(ccy)
    return fx, pe, f"{it['basis'][:160]} ({it.get('date', '')}) crossed with the ECB €/£ of {FX['day']} → £1 = {fx} {ccy}"


def per_eur_any(c):
    """units of currency c per €1: the ECB rate, else the central bank's (research/tax-fx.json)."""
    if c in FX['perEur']: return FX['perEur'][c]
    it = next(i for i in research('tax-fx.json') if i.get('key') == f'fx.central.{c}' and 'EUR' in str(i.get('unit', '')))
    return float(it['value'])


def usd_local(ccy, pe):
    """local currency per US$1 (ECB cross)."""
    return pe / FX['perEur']['USD']


def ilo_ratios(cc):
    """ILOSTAT mean monthly earnings by ISCO major group (all economy, latest year with groups 2/3/7/8) → {oc: ratio to total}."""
    rows = OFF('ilo.json')['values'].get(cc, {}).get('rows') or []
    by = {}
    for r in rows:
        by.setdefault(r['year'], {})[r['ocu'].replace('OCU_ISCO08_', '')] = r['value']
    for y in sorted(by, reverse=True):
        g = by[y]
        if all(k in g for k in ('2', '3', '7', '8', 'TOTAL')) and g['TOTAL'] > 0 and g.get('0') != g['TOTAL']:
            return {k: g[k] / g['TOTAL'] for k in ('2', '3', '7', '8')}, y
    return None, None


def ses_median_ratios():
    ses = ES['ses']['values']
    out = {}
    for oc in ('OC2', 'OC3', 'OC7', 'OC8'):
        rs = sorted(ses[f'{g}|{oc}|GE10'] / ses[f'{g}|TOTAL|GE10'] for g in REGIONS if ses.get(f'{g}|{oc}|GE10') and ses.get(f'{g}|TOTAL|GE10'))
        out[oc[2:]] = rs[len(rs) // 2]
    return out


def annual(it, cc, hours, bonus_m):
    """(annual gross incl. a statutory / customary bonus, how) from an earnings item."""
    v, u = float(it['value']), (it.get('unit') or '').lower()
    if 'hour' in u:
        paid = 2080 if cc == 'CA' else hours   # US: the ECEC loading is per hour WORKED, so the rate applies to the hours worked
        return v * paid, f"{v} an hour × {paid} paid h"
    if 'daily' in u:
        return v * 261 * (1 + bonus_m / 12), f"{v} a day × 261 days{f' + {bonus_m} months bonus' if bonus_m else ''}"
    if 'year' in u or 'annual' in u:
        return v, f"{v} a year"
    return v * (12 + bonus_m), f"{v} a month × {12 + bonus_m:g}{f' (incl. {bonus_m:g} months bonus)' if bonus_m else ''}"


def labour_world(cc, ccy, pe):
    src = set()
    L = [i for i in research('labour.json') if i.get('country') == cc]
    g = {i['key']: i for i in L}
    val = lambda k: g.get(k, {}).get('value')
    # hours actually worked a year
    hours, h_note = val('labour.hours'), (g.get('labour.hours') or {}).get('unit', '')
    if hours is None and cc == 'JP':
        hours, h_note = 1872, 'statutory 40 h × 52 = 2,080 − 16 public holidays × 8 − 10 days annual leave (Labour Standards Act art. 39 minimum) × 8 = 1,872 h — the survey figure was not read'
    hours = float(hours)
    # employer contributions: the tax researcher's statutory total, else the labour researcher's
    emp_it = next((i for i in research('tax-fx.json') if i.get('key') == 'tax.employer.social' and i.get('country') == cc and i.get('value') is not None), None)
    emp = float(emp_it['value']) / 100 if emp_it else (val('labour.employer') if isinstance(val('labour.employer'), float) and val('labour.employer') < 1 else 0)
    emp_note = (emp_it or {}).get('scope') or (g.get('labour.employer') or {}).get('scope', '')
    ec = {i['key']: i for i in research('us-ecec.json') if i.get('country') == cc}
    if 'labour.ecec.manufacturing' in ec:   # employer cost of ALL benefits (insurance, retirement, paid leave, legally required)
        t, w = ec['labour.ecec.manufacturing']['value'], ec['labour.ecec.manufacturing.wages']['value']
        emp = t / w - 1
        emp_note = (f"BLS ECEC June 2026, manufacturing: total compensation ${t} ÷ wages ${w} per hour worked = ×{t / w:.3f} — every "
                    f"benefit the employer pays (health insurance, retirement, paid leave, legally required), not only FICA")
        src.add(ec['labour.ecec.manufacturing']['source'])
    b = g.get('labour.bonus') or {}
    bonus_m = 0.0
    if b.get('value'):
        bonus_m = float(b['value']) / (30 if 'day' in (b.get('unit') or '') else 1)
    # Brazil: the 13th salary (Lei 4.090/1962) and the holiday third (Constitution art. 7 XVII) are statutory
    if cc == 'BR' and not (g.get('labour.bonus') or {}).get('value'):
        bonus_m = 1 + 1 / 3
    growth = float(val('labour.growth') or 0)
    ratios, ry = ilo_ratios(cc)
    rsrc = f'ILOSTAT ISCO major groups, all economy, {ry}' if ratios else 'the EU manufacturing structure (SES 2022 median ratios) — no ILOSTAT occupation split for this country'
    ratios = ratios or ses_median_ratios()
    cats = {}
    def from_item(role):
        it = g.get(f'labour.earnings.{role}')
        if not it or it.get('value') is None: return None
        if 'scope mismatch' in (it.get('notes') or '').lower(): return None   # e.g. an R&D team leader offered as a shift supervisor
        a, how = annual(it, cc, hours, bonus_m if 'month' in (it.get('unit') or '') or 'daily' in (it.get('unit') or '') else 0)
        c = it.get('currency') or ccy
        if c != ccy:   # a salary profile quoted in EUR / USD → local at the round's rates
            k = per_eur_any(ccy) / per_eur_any(c)
            a, how = a * k, f"{how} {c} × {k:.4f} {ccy}/{c} (ECB {FX['day']})"
        yr = int(str(it.get('date') or '2025')[:4])
        src.add(it.get('source', ''))
        return a, f"{it['key'].split('.')[-1]} earnings ({it.get('unit')}, {it.get('scope', '')[:90]}, {it.get('date')}): {how}", yr
    base = {r: from_item(r) for r in ROLE_OC}
    # anchors for roles not found: another role of the same country × the occupation-group ratio
    def fill(role):
        if base[role]: return base[role]
        oc = ROLE_OC[role]
        for other in ('skilled', 'semiskilled', 'technician', 'engineer', 'supervisor', 'electronics'):
            if base.get(other):
                a, how, yr = base[other]
                k = ratios[oc] / ratios[ROLE_OC[other]]
                return a * k, f"not found for this role: {other} × ISCO {oc} ÷ ISCO {ROLE_OC[other]} = {k:.3f} ({rsrc}) — {how}", yr
        if g.get('labour.earnings.all', {}).get('value') is not None:
            it = g['labour.earnings.all']; a, how = annual(it, cc, hours, 0); yr = int(str(it.get('date'))[:4]); src.add(it.get('source', ''))
            return a * ratios[oc], f"no occupation figure: all-employee average × ISCO {oc} ratio {ratios[oc]:.3f} ({rsrc}) — {how}", yr
        return None
    # Japanese-affiliated manufacturers' TOTAL employer burden (JETRO FY2025: base + allowances + social security +
    # overtime + bonus, a year) — manufacturing-specific and fully loaded, so it outranks an all-economy ILO average
    J = {i['key'].split('.')[2]: i for i in research('jetro-2025.json') if i.get('country') == cc}
    jet = {}
    if J:
        k = usd_local(ccy, pe)
        for role, jrole in (('semiskilled', 'worker'), ('engineer', 'engineer')):
            it = J[jrole]; src.add(it['source'])
            jet[role] = (it['value'] * k, f"JETRO FY2025, Japanese-affiliated manufacturers, Aug 2025: {jrole} annual employer burden US${it['value']:,} "
                                         f"(base + allowances + social security + overtime + bonus) × {k:.4f} {ccy}/US$", 2025)
        r78 = max(1.0, ratios['7'] / ratios['8']); r32 = ratios['3'] / ratios['2']
        a, how, yr = jet['semiskilled']; jet['skilled'] = (a * r78, f"the worker burden × ISCO 7 ÷ ISCO 8 = {r78:.3f} ({rsrc}; not below the worker) — {how}", yr)
        a, how, yr = jet['engineer']; jet['technician'] = (a * r32, f"the engineer burden × ISCO 3 ÷ ISCO 2 = {r32:.3f} ({rsrc}) — {how}", yr)
        jet['supervisor'] = (jet['technician'][0], 'costs as a technician (ISCO 3122 is in major group 3) — ' + jet['technician'][1], 2025)
        for r, base_r in (('foundry', 'skilled'), ('inspector', 'skilled'), ('electronics', 'semiskilled')):
            jet[r] = (jet[base_r][0], f'as {base_r} — ' + jet[base_r][1], 2025)
    out = {}
    for role in ROLE_OC:
        if role in jet:   # already fully loaded: no employer contributions on top
            a, how, yr = jet[role]
            n = max(0, 2026 - yr); up = (1 + growth) ** n
            v = a * up / hours
            out[role] = {'localPerHr': round(v, 2), 'source': ' ; '.join(sorted(s for s in src if s))[:600],
                         'basis': f"{how} × wage growth {(growth * 100):.1f}%/yr over {n} yr = ×{up:.4f} ÷ {hours:g} h worked a year ({h_note}) = {v:.2f}/h (fully loaded — no contributions added)"}
            continue
        r = fill(role)
        if r is None: raise KeyError(f'{cc}: no labour figure for {role}')
        a, how, yr = r
        n = max(0, 2026 - yr)
        up = (1 + growth) ** n
        v = a * up * (1 + emp) / hours
        out[role] = {'localPerHr': round(v, 2), 'source': ' ; '.join(sorted(s for s in src if s))[:600],
                     'basis': (f"{how} × wage growth {(growth * 100):.1f}%/yr over {n} yr = ×{up:.4f} × employer contributions {emp * 100:.2f}% "
                               f"({emp_note}) ÷ {hours:g} h worked a year ({h_note}) = {v:.2f}/h")}
    # the role order the costing relies on: a setter is not paid below the operators he sets up (as Europe)
    if out['skilled']['localPerHr'] < out['semiskilled']['localPerHr']:
        out['skilled'], out['semiskilled'] = out['semiskilled'], out['skilled']
        for k, w in (('skilled', 'the higher'), ('semiskilled', 'the lower')):
            out[k] = {**out[k], 'basis': f'{w} of the two manual figures (craft v operator) — ' + out[k]['basis']}
    # a technician (and the supervisor priced with him) sits between the skilled worker and the engineer: the occupation
    # ratios come from all-economy groups, which can put him outside that band (Korea below the worker, Indonesia above
    # the engineer) — clamp, and say so
    lo, hi = out['skilled']['localPerHr'], out['engineer']['localPerHr']
    for r in ('technician', 'supervisor'):
        v = out[r]['localPerHr']
        c = min(max(v, lo), hi)
        if abs(c - v) > 1e-9:
            out[r] = {**out[r], 'localPerHr': round(c, 2), 'basis': out[r]['basis'] + f" — held inside the skilled–engineer band: {v:.2f} → {c:.2f}/h"}
    grades = {gname: {**out[r], 'basis': f'paid as {r}: ' + out[r]['basis']} for gname, r in GRADE_ROLE.items()}
    return out, grades, hours, emp


def energy_world(cc, ccy, pe):
    E = [i for i in research('energy.json') if i.get('country') == cc]
    g = {i['key']: i for i in E}
    def loc(it):
        if not it or it.get('value') is None: return None, None
        v = float(it['value'])
        if it.get('currency') == 'USD' and ccy != 'USD':
            v2 = v * usd_local(ccy, pe)
            return round(v2, 6), f"US${v}/kWh × {usd_local(ccy, pe):.4f} {ccy}/US$ (ECB {FX['day']}) = {v2:.4f}"
        return v, f"{v} {ccy}/kWh"
    e, eb = loc(g.get('energy.electricity')); ga, gb = loc(g.get('energy.gas'))
    ei, gi = g.get('energy.electricity', {}), g.get('energy.gas', {})
    basis = (f"Electricity {eb}: {ei.get('basis', '')[:260]} ({ei.get('date', '')}). "
             + (f"Gas {gb}: {gi.get('basis', '')[:200]} ({gi.get('date', '')})" if ga else f"Gas: no industrial gas price found ({gi.get('scope') or gi.get('notes') or 'not sold to general industry'}) — held"))
    return {'electricityLocalPerKwh': e, **({'gasLocalPerKwh': ga} if ga else {}), 'basis': basis,
            'sources': [{'research': k, 'source': g[k].get('source'), 'date': g[k].get('date')} for k in ('energy.electricity', 'energy.gas') if k in g]}


INCOMPLETE_CALENDAR = {'TW', 'TH', 'MY', 'VN', 'MA', 'TN', 'ID', 'EG'}   # Nager.Date failed or misses Tết / Islamic holidays


def hours_world(cc, name):
    if cc in INCOMPLETE_CALENDAR or not HOL['values'].get(cc, {}).get('holidays'):
        return 6000, (f"3 × 8 h, Monday–Friday: 250 working days × 24 h = 6,000 h — {name}'s full 2026 public-holiday calendar was not "
                      f"available (the holiday API failed or misses Tết / Islamic holidays), so the round's median working year (250 days) is used")
    days, hol, src = working_days(cc)
    return days * 24, f"3 × 8 h, Monday–Friday, {name}'s 2026 working calendar: {days * 24} h ({days} days × 24 h; {hol} weekday national public holidays removed — {src})"


US_GROUPS = [  # Haas US list prices (the US price of the same machines the EU groups use)
    {'id': 'cnc-vmc-us', 'match': '^(mach-vmc3|mach-haas-vf2|mach-drill)$', 'refId': 'mach-haas-vf2', 'usd': 70995,
     'basis': 'Haas VF-2 US list $70,995 (2026; machine only — options, tooling and installation not included)',
     'source': 'https://machinetoolindex.com/machines/haas-vf-2', 'confidence': 'Medium'},
    {'id': 'cnc-5axis-us', 'match': '^(mach-vmc5|mach-dmg-dmu50|mach-haas-umc500)$', 'refId': 'mach-haas-umc500', 'usd': 119995,
     'basis': 'Haas UMC-500 US list "from $119,995" (machine only)', 'source': DE['machines']['groups'][1]['source'], 'confidence': 'Low'},
]


def groups_world(cc, ccy, pe, sym):
    if cc in EMEA_EU_MARKET:
        return groups_eu(ccy, pe, sym)
    if cc in NA:
        k = usd_local(ccy, pe)
        return [{'id': x['id'], 'match': x['match'], 'refId': x['refId'], 'refCapexLocal': round(x['usd'] * k, 2),
                 'basis': x['basis'] + ('' if ccy == 'USD' else f" = {sym}{x['usd'] * k:,.0f} at US$1 = {k:.4f} {ccy} (ECB {FX['day']})"),
                 'source': x['source'], 'confidence': x['confidence']} for x in US_GROUPS]
    return []


def mat_items():
    out = {}
    for f in ('materials-americas.json', 'materials-asia.json', 'materials-emea.json'):
        for i in research(f):
            if i.get('value') is not None: out[(i['country'], i['key'])] = i
    return out


def to_local_per_kg(it, ccy, pe):
    v, u, c = float(it['value']), (it.get('unit') or '').lower(), it.get('currency') or ccy
    per = 1.0
    if 'short ton' in u: per = 1 / 907.185
    elif '/t' in u or ' t ' in u or u.endswith(' t') or 'per t' in u: per = 1 / 1000
    elif 'cwt' in u: per = 1 / 45.359
    elif 'cents/kg' in u: per = 1 / 100
    elif 'cents/lb' in u: per = 2.20462 / 100
    elif '/lb' in u: per = 2.20462
    k = usd_local(ccy, pe) if c == 'USD' and ccy != 'USD' else (1.0 if c == ccy else None)
    if k is None:   # another currency (JPY / TWD / THB …) → its ECB / central-bank rate
        k = pe / per_eur_any(c)
    return v * per * k


REGION_OF = lambda cc: 'NA' if cc in NA else 'SEA' if cc in SEA else 'NEA' if cc in NEA else cc


def regional_price(cc, key, M):
    """the market price that applies in cc: its own, else its market's (NA → US; SEA → SG / the CFR SE Asia figures; NEA → JP)."""
    for c in [cc] + ({'NA': ['US'], 'SEA': ['SG', 'TH', 'MY', 'ID'], 'NEA': ['JP', 'KR', 'TW']}.get(REGION_OF(cc), [])):
        if (c, key) in M: return M[(c, key)], c
    return None, None


FAM = {   # German (European) family → the regional anchor that replaces it
    'CR coil (DC01 / DC04)': 'mat.crc', 'CR automotive grades': 'mat.crc', 'HR structural': 'mat.hrc', 'Coated sheet': 'mat.hdg',
    'HR pickled & oiled': 'mat.hr_po', '304 sheet': 'mat.ss304_cr', '301 spring strip': 'mat.ss304_cr',
    'Secondary ADC12': 'mat.al_adc12', 'Secondary cast aluminium (ingot)': 'mat.al_adc12', 'Aluminium sheet and plate (floor)': 'mat.al_sheet_asp',
    'PP family': 'mat.pp', 'PE family': 'mat.hdpe', 'LDPE family': 'mat.ldpe', 'LLDPE family': 'mat.lldpe', 'PVC family': 'mat.pvc',
    'ABS family': 'mat.abs', 'GPPS': 'mat.gpps', 'HIPS': 'mat.hips', 'PC family': 'mat.pc', 'PA6 family': 'mat.pa6', 'PA66': 'mat.pa66',
    'PBT': 'mat.pbt', 'PMMA family': 'mat.pmma', 'POM': 'mat.pom', 'PET family': 'mat.pet', 'Natural rubber (raw)': 'mat.nr_tsr20',
}
STEEL = {'mat.crc', 'mat.hrc', 'mat.hdg', 'mat.hr_po'}
EUROPE_SUPPLIED = {'RS', 'MA', 'TN'}     # buy at the European anchor (FTA; no domestic price published)
LME = json.load(open(os.path.join(HERE, 'official', 'lme.json')))


def families_world(cc, ccy, pe, sym):
    M = mat_items()
    fams = families_eu(ccy, pe, sym)
    fx_usd = usd_local(ccy, pe)
    for f in fams:
        key = FAM.get(f['family'])
        it = owner = None
        if key and cc not in EUROPE_SUPPLIED:
            if key in STEEL and cc not in ('US', 'MX', 'CA', 'JP', 'KR', 'TW', 'TR', 'EG') and cc not in SEA: key = None
            if key:
                it, owner = regional_price(cc, key, M)
                if key in STEEL and owner and owner != cc and cc in ('CA', 'MX') : it = None   # NA steel is national (US prices carry Section 232)
                if key == 'mat.hrc' and cc == 'MX' and (cc, 'mat.hrc.mx_mid') in M: it, owner = M[(cc, 'mat.hrc.mx_mid')], cc
        if it:
            loc = to_local_per_kg(it, ccy, pe)
            f['anchorLocalPerKg'] = round(loc, 4)
            where = f"{owner}'s market" if owner == cc else f"the {REGION_OF(cc)} market ({owner} figure)"
            f['anchorBasis'] = (f"{f['family']} — {where}: {it.get('basis', '')[:200]} = {it['value']} {it.get('unit')} ({it.get('date')}) = "
                                f"{sym}{loc:.4f}/kg" + ('' if f['method'] != 'ladder' else " × the book's grade premium over its base"))
            f['sources'] = [{'research': it['key'], 'source': it.get('source'), 'date': it.get('date')}]
            f['confidence'] = 'Low' if it.get('verify') or 'method not published' in json.dumps(it) else 'Medium'
        elif cc in EUROPE_SUPPLIED or True:
            f['anchorBasis'] = (f"no {cc} or regional price found — the European market price at par (traded material, no country factor): "
                                + f['anchorBasis'].replace('European market (as the German book): ', ''))
    # metals priced off the LME settlement of the round (29 Oct 2026) + the region's premium
    cu, zn = LME['metals']['copper']['cashUsdPerT'], LME['metals']['zinc']['cashUsdPerT']
    for f in fams:
        if f['family'].startswith('ETP copper'):
            it, owner = regional_price(cc, 'mat.cu_premium', M)
            if it:
                p = float(it['value']); v = (cu + p) / 1000 * fx_usd
                f.update(anchorLocalPerKg=round(v, 4), anchorBasis=f"LME copper cash ${cu}/t ({LME['day']}) + {owner} cathode premium ${p}/t = {sym}{v:.4f}/kg — no bar or sheet below the copper it contains",
                         sources=[{'research': 'official.lme', 'source': LME['source'], 'date': LME['day']}, {'research': it['key'], 'source': it.get('source'), 'date': it.get('date')}])
        if f['family'].startswith('Zamak'):
            it, owner = regional_price(cc, 'mat.zn_premium', M)
            if it:
                p = float(it['value']) * (22.0462 if 'cents/lb' in (it.get('unit') or '') else 1)
                zn_loc = (zn + p) / 1000 * fx_usd
                al_loc = LME['metals']['aluminium']['cashUsdPerT'] / 1000 * fx_usd
                v = 0.96 * zn_loc + 0.04 * al_loc if f['family'] == 'Zamak 3 (floor)' else 0.95 * zn_loc + 0.04 * al_loc + 0.01 * (cu / 1000 * fx_usd)
                f.update(anchorLocalPerKg=round(v, 4), anchorBasis=f"metal content: LME zinc ${zn}/t + {owner} SHG premium ${p:.0f}/t, LME Al, Cu ({LME['day']}) = {sym}{v:.4f}/kg",
                         sources=[{'research': 'official.lme', 'source': LME['source'], 'date': LME['day']}, {'research': it['key'], 'source': it.get('source'), 'date': it.get('date')}])
    # steel-foundry charge on the country's own heavy scrap (the German book's arithmetic: (scrap + FeSi 0.5 %) ÷ 0.96)
    sc = M.get((cc, 'mat.scrap_hms'))
    if sc:
        s_loc = to_local_per_kg(sc, ccy, pe); fesi = 0.0063 * pe
        for f in fams:
            if f['family'].startswith('Cast carbon / low-alloy steel'):
                v = (s_loc + fesi) / 0.96
                f.update(anchorLocalPerKg=round(v, 4), anchorBasis=f"steel-foundry charge on {cc} heavy scrap {sym}{s_loc:.4f}/kg ({sc.get('date')}) + FeSi75 0.5% at the European price (€0.0063/kg) ÷ 0.96 melt loss = {sym}{v:.4f}/kg (the German book's arithmetic; mix an engineering assumption)",
                         sources=[{'research': sc['key'], 'source': sc.get('source'), 'date': sc.get('date')}])
    # safeguard duties on European steel that the country levies (sourced in research/materials-emea.json)
    duty = {'MA': ('HR structural', 1.19, 'Morocco 19% hot-rolled coil safeguard from 19 Jun 2026 (EU not exempt)'),
            'ZA': ('Coated sheet', 1.5234, 'South Africa 52.34% safeguard on coated coil from 12 Jun 2026')}.get(cc)
    if duty:
        for f in fams:
            if f['family'] == duty[0]:
                f['anchorLocalPerKg'] = round(f['anchorLocalPerKg'] * duty[1], 4)
                f['anchorBasis'] += f" × {duty[1]} ({duty[2]}) = {sym}{f['anchorLocalPerKg']}/kg"
                f['confidence'] = 'Low'
    return fams


def build_world(cc):
    name, ccy, sym = WORLD[cc]
    fx, pe, fx_b = fx_world(cc, ccy)
    write_fx = fx is not None
    if not write_fx:
        cfg0 = json.load(open(os.path.join(RR, '2026-10-countries.json')))
        fx = float('%.4g' % cfg0['fx']['VND']); pe = fx * FX['perEur']['GBP']   # as REGIONAL_DATA holds it (4 significant figures)
    if cc == 'TR':   # Eurostat publishes Turkey's labour cost level and index, not its occupation mix → ILO ratios
        cats, grades, ly, up = labour_europe_ilo(cc)
        hours_note = 'Eurostat labour cost per hour worked'
        emp = None
    else:
        cats, grades, hrs, emp = labour_world(cc, ccy, pe)
    energy = energy_europe(cc) if cc == 'TR' else energy_world(cc, ccy, pe)
    mh, mh_b = (working_days(cc)[0] * 24, None) if cc == 'TR' else hours_world(cc, name)
    if cc == 'TR':
        d_, h_, s_ = working_days(cc); mh_b = f"3 × 8 h, Monday–Friday, Turkey's 2026 working calendar: {d_ * 24} h ({d_} days × 24 h; {h_} weekday national public holidays removed — {s_})"
    fin, fin_b, fin_s = finance(cc, ccy)
    lf, lf_b, lf_s = life(cc)
    rt, rt_b, rt_s = rent(cc, ccy, pe)
    missing = [k for k, v in (('finance', fin), ('life', lf), ('rent', rt), ('electricity', energy.get('electricityLocalPerKwh'))) if v is None]
    const = re.sub(r'[^A-Z]', '_', name.upper()) + '_BOOK'
    d = f'scripts/rate-refresh/world-2026-10/books/{cc.lower()}'
    cfg = {
        'asOf': '2026-10-30',
        'label': f'{name} rate book — world round: national / ILO earnings + statutory on-costs, regulator tariffs, regional material markets, 3 × 8 h',
        'region': cc, 'currency': ccy, 'currencySymbol': sym, 'dir': d, 'snapshot': f'{d}/current-book.json',
        'bookFile': f'src/engine/country-books/{cc.lower()}.ts', 'bookConst': const,
        'writeFx': write_fx, 'fxPerGbp': fx, 'fxBasis': fx_b,
        'labour': {'categories': cats, 'grades': grades,
                   'loadingIncluded': ('Fully-loaded hourly cost INCLUDES: gross earnings for the occupation (national survey or ILOSTAT, the year shown), any '
                                       'statutory or customary annual bonus named, carried to 2026 by the wage growth shown, plus the employer\'s statutory '
                                       'social contributions, divided by the hours actually worked a year (paid leave and holidays fall on the hours worked)'
                                       if cc != 'TR' else 'Eurostat labour cost per hour worked (as Europe) × ILOSTAT occupation ratios'),
                   'loadingNotIncluded': ('NOT included: employer-paid benefits that are not statutory (in the United States, health insurance and '
                                          'retirement plans — the US figure is a floor); a 3-shift premium beyond what the survey average holds; '
                                          'overtime; agency margins'),
                   'short': 'national / ILO occupation earnings + statutory employer contributions ÷ hours worked' if cc != 'TR' else 'Eurostat labour cost × ILO occupation ratio'},
        'energy': energy,
        'machines': {
            'hoursPerYear': mh, 'hoursBasis': mh_b, 'shiftDepreciationFactor': 1.0, 'shiftBasis': f'{name} straight-line tax depreciation — no shift uplift on capital',
            'lifeYears': lf, 'financeRate': fin and round(fin, 4), 'financeBasis': fin_b, 'ukFinanceRate': 0.04,
            'maintenancePctOfCapex': 0.035, 'maintenanceBasis': f'the library\'s own line build-up rule (3.5% of capex); no {name} norm found',
            'rentLocalPerM2Month': rt, 'rentBasis': rt_b, 'ukRentGbpPerM2Yr': 110, 'capitalHeldFactor': 1.0,
            'groups': groups_world(cc, ccy, pe, sym),
            'notRebuiltBasis': (f'capex not found for {name}: the machine\'s capital is the book\'s AT PAR (×1 — no unsourced country discount), '
                                f'under {name}\'s operating model (3 × 8 h, tax life, loan finance, rent, tariff, support at {name} wages)'),
        },
        'materialFamilies': families_world(cc, ccy, pe, sym),
        'held': DE['held'],
        'heldMaterialsAtPar': {'basis': f'no {name} or regional price this round — the book\'s European-market price at par, no {name} factor'},
        'shopMultipliersBasis': (f'Overhead and packaging: the UK basis × {name}\'s held multipliers — not researched this round'),
        'sources': {'finance': fin_s, 'life': lf_s, 'rent': rt_s},
    }
    if not cfg_has_lab_rows(cc): cfg['noLibraryLabourRows'] = True
    return cfg, missing


def labour_europe_ilo(cc):
    """Turkey: Eurostat labour cost level and index (as Europe), occupation ratios from ILOSTAT (SES 2022 does not cover it)."""
    geo = cc
    lev, lci = ES['lcLevelNAC']['values'], ES['lci']['values']
    y = sorted(k.split('|')[1] for k in lev if k.startswith(geo + '|') and lev[k] is not None)[-1]
    level = lev[f'{geo}|{y}']
    qs = sorted(k.split('|')[1] for k in lci if k.startswith(geo + '|') and lci[k] is not None)
    ly = qs[-1].split('-')[0]; pick = [q for q in qs if q.startswith(ly)]; base = [f'{y}-{q.split("-")[1]}' for q in pick]
    a = sum(lci[f'{geo}|{q}'] for q in pick); b = sum(lci[f'{geo}|{q}'] for q in base); up = a / b
    ratios, ry = ilo_ratios(cc)
    src = f"{ES['lcLevelNAC']['source']} ; {ES['lci']['source']} ; {OFF('ilo.json')['values'][cc]['source'] if cc in OFF('ilo.json')['values'] else ''}"
    o7, o8 = ratios['7'], ratios['8']
    m = dict(ROLE_OC); m['skilled'], m['semiskilled'] = ('7', '8') if o7 >= o8 else ('8', '7')
    cats = {}
    for role, oc in m.items():
        v = level * up * ratios[oc]
        cats[role] = {'localPerHr': round(v, 2), 'source': src,
                      'basis': (f'Eurostat labour cost per hour worked, manufacturing, {y}: {level} TRY × labour cost index {"+".join(pick)} ÷ {"+".join(base)} '
                                f'= {up:.4f} × ILOSTAT ISCO {oc} mean earnings ÷ all occupations ({ry}) = {ratios[oc]:.4f} → {v:.2f}/h')}
    grades = {gname: {**cats[r], 'basis': f'paid as {r}: ' + cats[r]['basis']} for gname, r in GRADE_ROLE.items()}
    return cats, grades, y, up


if __name__ == '__main__':
    todo = sys.argv[1:] or sorted(REGIONS) + sorted(WORLD)
    for cc in todo:
        try:
            cfg, missing = build(cc) if cc in REGIONS else build_world(cc)
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
              f"elec {cfg['energy']['electricityLocalPerKwh']} gas {cfg['energy'].get('gasLocalPerKwh')} h {cfg['machines']['hoursPerYear']} "
              f"life {cfg['machines']['lifeYears']} fin {cfg['machines']['financeRate']} rent {cfg['machines']['rentLocalPerM2Month']}")
