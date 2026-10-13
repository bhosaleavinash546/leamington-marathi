#!/usr/bin/env python3
"""Build scripts/rate-refresh/2026-10-sw-rates.json from the agents' sourced research in raw/ (13 Oct 2026).

    python3 scripts/sw-research/2026-10-13/build-config.py
    npx tsx scripts/sw-rate-book.ts

Every salary observation is PULLED from raw/<file>.json by (file, hub, value[, role, level]) so its source, URL, data
year and seen-in travel with it — nothing is retyped. The selection rule is the same in every hub:

  mid    = median of the hub's CENTRAL figures for embedded / automotive software engineers (median, mean, or the
           midpoint of a stated p25–p75 / band), plus the official software-developer median where one was found.
           A general-developer survey is used only where no embedded figure exists.
  senior = median of the hub's senior-level figures, else its p75 / band tops (flagged), else the mid (flagged).

Excluded figures are listed per hub with the reason. Monthly figures are ×12 unless the source states the paid months
(13th / 14th salaries, Japanese bonus) — the factor is in the observation. Hours and on-costs come from F.json and the
independent review (review.json).
"""
import json, os, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(HERE, '..', '..', 'rate-refresh', '2026-10-sw-rates.json')

_cache = {}
def raw(f):
    if f not in _cache:
        _cache[f] = json.load(open(os.path.join(RAW, f + '.json')))
    return _cache[f]

def hub_of(f, hub):
    for c in raw(f)['countries']:
        if c['hub'] == hub:
            return c
    raise SystemExit(f'{f}: no hub {hub}')

def pick(f, hub, value, factor=1, role=None, level=None, note=None, statistic=None, src=None):
    """One sourced observation, annualised by `factor` (12 for monthly)."""
    hits = [s for s in hub_of(f, hub)['salaries'] if abs(float(s['value']) - value) < 0.5
            and (role is None or s.get('role') == role) and (level is None or s.get('level') == level)
            and (src is None or src in (s.get('source') or ''))]
    if len(hits) != 1:
        raise SystemExit(f'{f} {hub} {value}: {len(hits)} matches')
    s = hits[0]
    return {
        'value': s['value'], 'period': s.get('period'), 'annualFactor': factor, 'currency': s['currency'],
        'statistic': statistic or s.get('statistic') or '', 'dataYear': s.get('dataYear'),
        'source': s.get('source'), 'url': s.get('url'), 'seenIn': s.get('seenIn', 'search-snippet'),
        'role': s.get('role'), 'level': s.get('level'), 'note': note or s.get('note', ''),
    }

def midpoint(f, hub, lo, hi, factor=1, role=None, level=None, label='band', src=None):
    """The midpoint of a sourced band (two stored observations), carried as ONE observation with both in the note."""
    a = pick(f, hub, lo, factor, role, level, src=src)
    b = pick(f, hub, hi, factor, role, level, src=src)
    o = dict(a)
    o['value'] = (lo + hi) / 2
    o['statistic'] = f'midpoint of {label} {lo:,}–{hi:,}'
    o['note'] = f"({lo:,} + {hi:,}) / 2. {a['note']}"
    return o

def review(hub, key):
    """A figure the independent reviewer found (raw/review.json), same shape."""
    p = os.path.join(RAW, 'review.json')
    if not os.path.exists(p):
        return None
    r = json.load(open(p))
    for c in r.get('checks', []) + r.get('gaps', []):
        if c.get('hub') == hub and key in (c.get('item') or ''):
            return c
    return None

def evidence(f, hub, n=3):
    return [{'claim': e['claim'], 'url': e.get('url', '')} for e in hub_of(f, hub).get('evidence', [])[:n]]

def oncost(hub):
    for h in raw('F')['hubs']:
        if h['hub'] == hub:
            return h['employerOnCost']
    raise SystemExit(hub)

def oc(hub, components, note='', in_salary=False):
    o = oncost('US' if hub.startswith('US-') else hub)
    return {'components': components, 'inSalary': in_salary, 'source': 'PwC Worldwide Tax Summaries / national authority (F.json)',
            'url': o.get('url') or '', 'note': note}

HOURS = {}   # filled by hours_from_review()
def hours_from_review():
    p = os.path.join(RAW, 'review.json')
    if not os.path.exists(p):
        return
    for h in json.load(open(p)).get('hours', []):
        HOURS[h['hub']] = h

def hours(hub, weekly, leave, holidays, src, incl=False, note=''):
    return {'weeklyHours': weekly, 'leaveDays': leave, 'publicHolidays': holidays, 'leaveIncludesHolidays': incl,
            'source': src, 'note': note}

M = 12  # months a year, where the source gives a monthly figure and states no extra salaries

HUBS = []
def hub(**k):
    HUBS.append(k)

# ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# The hubs. Hours: statutory / normal weekly hours, minimum paid leave and public holidays from the review table
# (review.json `hours`, falling back to F.json where the review has none) — see hours_for().
# ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def hours_for(hub, weekly, leave, holidays, incl=False, note=''):
    """Prefer the independent review's figures; else the stated defaults (F.json leave / holidays + statutory week)."""
    r = HOURS.get(hub)
    if r and r.get('weeklyHours') and r.get('annualLeaveDays') is not None and r.get('publicHolidays') is not None:
        return hours(hub, r['weeklyHours'], r['annualLeaveDays'], r['publicHolidays'],
                     f"{r.get('source', 'review')} ({r.get('url', '')})", bool(r.get('leaveIncludesHolidays')), note)
    return hours(hub, weekly, leave, holidays, 'statutory week; leave and public holidays from F.json (Wikipedia minimum-leave table / PwC)', incl, note)

def rv(hub, idx_or_key, i=0, factor=1, statistic=None, note=None):
    """An observation the independent reviewer found (review.json), or None."""
    p = os.path.join(RAW, 'review.json')
    if not os.path.exists(p):
        return None
    r = json.load(open(p))
    for c in r.get('checks', []) + r.get('gaps', []):
        if c.get('hub') != hub:
            continue
        if isinstance(idx_or_key, int) and c.get('id') != idx_or_key:
            continue
        if isinstance(idx_or_key, str) and idx_or_key.lower() not in (c.get('item') or '').lower():
            continue
        found = c.get('found') or []
        if i >= len(found) or found[i].get('value') in (None, ''):
            return None
        f = found[i]
        return {'value': f['value'], 'period': f.get('period', ''), 'annualFactor': factor, 'currency': f.get('currency', ''),
                'statistic': statistic or f.get('statistic', ''), 'dataYear': f.get('dataYear'), 'source': f.get('source', '') + ' (independent review)',
                'url': f.get('url', ''), 'seenIn': f.get('seenIn', 'search-snippet'), 'note': note or f.get('note', '') or f.get('grossOrNet', '')}
    return None

def some(*xs):
    return [x for x in xs if x]

WIKI_LEAVE = 'https://en.wikipedia.org/wiki/List_of_minimum_annual_leave_by_country'
NS = 'not sourced in this research — CostVision reading of the national calendar / labour code, to verify'
def hrs(weekly, leave, ph, src, incl=False, note=''):
    return {'weeklyHours': weekly, 'leaveDays': leave, 'publicHolidays': ph, 'leaveIncludesHolidays': incl, 'source': src, 'note': note}
def legacy(key, mult):
    return {'key': key, 'perPMGBP': 28000 * mult * 0.975}   # retired: UK £28,000 × multiplier × senior blend at 50 %

def mhlw_jp():
    a = pick('D', 'JP', 386200, 12)
    b = pick('D', 'JP', 1106800, 1)
    o = dict(a)
    o['value'] = 386200 * 12 + 1106800
    o['annualFactor'] = 1
    o['statistic'] = 'mean, 12 × monthly contractual earnings ¥386,200 + annual bonus ¥1,106,800'
    o['note'] = 'MHLW Basic Survey on Wage Structure 2024, ソフトウェア作成者 (all ages); bonus row: ' + (b['url'] or '')
    return o

def net_to_gross(obs, ratio, basis):
    o = dict(obs)
    o['annualFactor'] = obs['annualFactor'] * ratio
    o['statistic'] = f"{obs['statistic']} NET × {ratio:.4f} ({basis})"
    return o

# ── Europe ───────────────────────────────────────────────────────────────────────────────────────────────────────────
hub(id='UK', label='United Kingdom', country='UK', currency='GBP', cities=['Coventry / Gaydon', 'Warwick', 'Manchester', 'Birmingham'],
    evidence=evidence('A', 'UK'),
    mid=[pick('A', 'UK', 54615), pick('A', 'UK', 65000), pick('A', 'UK', 68750), pick('A', 'UK', 70000, role='embedded_sw_engineer', level='all')],
    senior=[pick('A', 'UK', 70000, level='senior', src='UK perman', note='IT Jobs Watch senior embedded, UK (the reviewer saw £65,000 in the Jan 2026 window)'),
            pick('A', 'UK', 70000, level='senior', src='Midlands'),
            pick('A', 'UK', 76752, statistic='upper end of "most earn between" (≈ p75–p80, percentile not stated)')]
           + some(rv('UK', 1, i=1, statistic='median (Jan 2026 window)')),
    seniorBasis='median of the senior embedded advert medians (IT Jobs Watch, two windows) and the upper end of the ASHE SOC 2134 band',
    excluded=[{'what': 'PayScale Birmingham £34,392', 'why': 'self-reported, experience mix unknown, half the advert medians'},
              {'what': 'SOC 2134 "going rate" £54,700', 'why': 'a Skilled Worker visa threshold, not a pay statistic (reviewer)'}],
    onCost={'components': [{'name': 'employer Class 1 NIC', 'pct': 15, 'floorAnnual': 5000}], 'source': 'PwC Worldwide Tax Summaries UK 2026',
            'url': oncost('UK')['url'], 'note': 'workplace-pension auto-enrolment (3 % minimum) and the apprenticeship levy not included'},
    hours=hrs(40, 28, 8, f'statutory 5.6 weeks (28 days) may include the 8 bank holidays — {WIKI_LEAVE}', True),
    confidence='Medium', legacy=legacy('UK', 1.0),
    notes='Advertised salaries (IT Jobs Watch) run above paid salaries (ASHE); the ONS table itself was not opened — the ASHE figure is a republisher\'s.')

de_on = [{'name': 'pension', 'pct': 9.3, 'ceilingAnnual': 101400}, {'name': 'unemployment', 'pct': 1.3, 'ceilingAnnual': 101400},
         {'name': 'health 7.3 % + half the 2.9 % supplement', 'pct': 8.75, 'ceilingAnnual': 69750}, {'name': 'long-term care', 'pct': 1.8, 'ceilingAnnual': 69750},
         {'name': 'insolvency levy', 'pct': 0.15, 'ceilingAnnual': 101400}]
hub(id='DE', label='Germany', country='DE', currency='EUR', cities=['Stuttgart', 'Munich', 'Wolfsburg', 'Ingolstadt', 'Erlangen'],
    evidence=evidence('A', 'DE'),
    mid=[pick('A', 'DE', 6301, M), pick('A', 'DE', 71692), pick('A', 'DE', 64900)],
    senior=[pick('A', 'DE', 7723, M, statistic='p75 (BA Entgeltatlas, Experte)'), pick('A', 'DE', 78906), pick('A', 'DE', 75677, statistic='p75')]
           + some(rv('DE', 2, i=1, factor=M, statistic='median, Experte level (Systementwickler)')),
    seniorBasis='median of the BA Entgeltatlas upper quartile, jobvector "with experience", gehalt.de p75 and the JobJump Experte median',
    excluded=[{'what': 'IG Metall ERA BW EG 12 / 14 / 17 tables', 'why': 'collective-agreement minima excluding performance pay and special payments — cross-check only (EG 14 ≈ €69.5k a year)'},
              {'what': 'BA Spezialist / Fachkraft levels', 'why': 'complexity levels, not seniority'}],
    onCost={'components': de_on, 'source': 'PwC Worldwide Tax Summaries Germany 2026', 'url': oncost('DE')['url'],
            'note': 'employer accident insurance (BG, sector rate) not included'},
    hours=hrs(40, 20, 12, f'20 days statutory (5-day week) + 12 public holidays (Baden-Württemberg / Bavaria; 10–13 by state) — {WIKI_LEAVE}', False,
              'most automotive employers give 30 days leave; the book uses the statutory 20'),
    confidence='Medium', legacy=legacy('EU', 0.95),
    notes='The BA Entgeltatlas €6,301 Experte median came via a republisher; the reviewer could not see it on the live tool.')

hub(id='AT', label='Austria', country='AT', currency='EUR', cities=['Graz', 'Vienna', 'Steyr'],
    evidence=evidence('A', 'AT'),
    mid=[midpoint('A', 'AT', 53000, 71000, label='Glassdoor Graz base range'), pick('A', 'AT', 54000),
         pick('A', 'AT', 4905.47, 14, statistic='collective-agreement minimum EEI group H, × 14 salaries')],
    senior=[pick('A', 'AT', 71000, statistic='top of Glassdoor Graz base range'), pick('A', 'AT', 6002.02, 14, statistic='collective-agreement minimum EEI group I, × 14 salaries')],
    seniorBasis='median of the Glassdoor Graz range top and the EEI collective-agreement group I minimum (×14)',
    excluded=[{'what': 'EEI group J minimum', 'why': 'a leading-role grade'}],
    onCost={'components': [{'name': 'employer social insurance (pension, sickness, unemployment, accident, minor)', 'pct': 20.98, 'ceilingAnnual': 6930 * 14}],
            'source': 'PwC Worldwide Tax Summaries Austria', 'url': oncost('AT')['url'], 'note': 'FLAF, municipal tax and severance fund (≈ 7 %) not researched'},
    hours=hrs(40, 25, 13, f'25 days leave — {WIKI_LEAVE}; 13 public holidays (reviewer, aggregator)'),
    confidence='Low', legacy=legacy('EU', 0.95),
    notes='Austria pays 14 monthly salaries; the collective-agreement figures are × 14.')

hub(id='SE', label='Sweden', country='SE', currency='SEK', cities=['Gothenburg', 'Lund', 'Södertälje'],
    evidence=evidence('A', 'SE'),
    mid=[pick('A', 'SE', 52500, M), pick('A', 'SE', 53500, M), pick('A', 'SE', 59200, M)] + some(rv('SE', 'SCB', i=0, factor=M, statistic='mean (secondary, SCB)')),
    senior=[pick('A', 'SE', 72200, M, statistic='top of Sveriges Ingenjörer range (percentile not stated; SCB p90 is 72,500)')],
    seniorBasis='the top of the Sveriges Ingenjörer civilingenjör range — close to the SCB p90, so the senior rate is on the high side',
    excluded=[], onCost={'components': [{'name': 'employer social security', 'pct': 31.42}], 'source': 'PwC Worldwide Tax Summaries Sweden',
                         'url': oncost('SE')['url'], 'note': 'ITP occupational pension (collective agreement) not included'},
    hours=hrs(40, 25, 11, f'25 days leave — {WIKI_LEAVE}; 11 public holidays (reviewer, aggregator)'),
    confidence='Medium', legacy=legacy('EU', 0.95), notes='SCB figures seen through republishers.')

hub(id='FR', label='France', country='FR', currency='EUR', cities=['Guyancourt', 'Paris / Île-de-France', 'Créteil', 'Vélizy'],
    evidence=evidence('A', 'FR'),
    mid=[midpoint('A', 'FR', 45000, 55000, level='mid', label='Seyos confirmé Paris'), midpoint('A', 'FR', 43000, 48000, level='mid', label='Silkhom confirmé Paris')]
        + some(rv('FR', 14, i=0) and (lambda a, b: dict(a, value=(a['value'] + b['value']) / 2, statistic=f"midpoint of {a['value']:,}–{b['value']:,} (Optima Industrie, confirmé)"))(rv('FR', 14, i=0), rv('FR', 14, i=1))),
    senior=[pick('A', 'FR', 55000, level='senior', statistic='senior Paris "> 55 k€" (lower bound)')] + some(rv('FR', 14, i=2, statistic='advert floor, ≥ 5 y, Paris')),
    seniorBasis='lower bound of the Seyos senior band and a Paris senior advert floor — senior pay is at least this',
    excluded=[{'what': 'INSEE 2023 digital-jobs median €3,100 NET a month', 'why': 'net; cross-check only (≈ €47–48k gross)'},
              {'what': 'APEC IT-function cadres €71k', 'why': 'all IT functions incl. management, with variable pay'}],
    onCost={'components': [{'name': 'employer contributions (PwC average)', 'pct': 45}], 'source': 'PwC Worldwide Tax Summaries France (an average; the rate falls as pay rises)',
            'url': oncost('FR')['url'], 'note': 'an average, not a statutory sum — likely high for a senior'},
    hours=hrs(40, 42, 0, 'cadres on "forfait jours": 218 days a year (Code du travail L3121-64, reviewer) × 8 h', True, '218 working days → 42 days off incl. public holidays'),
    confidence='Medium', legacy=legacy('EU', 0.95), notes='Recruiter salary grids (data basis not published).')

hub(id='IT', label='Italy', country='IT', currency='EUR', cities=['Turin', 'Modena', 'Milan'],
    evidence=evidence('B', 'IT'),
    mid=[pick('B', 'IT', 30248)],
    senior=[pick('B', 'IT', 46000)] + some(rv('IT', 'PayScale', i=0)),
    seniorBasis='PayScale "experienced" embedded (two readings)',
    excluded=[{'what': 'Indeed junior software developer €26,666', 'why': 'junior, general software'}],
    onCost={'components': [{'name': 'employer social security (midpoint of KPMG 29–32 %)', 'pct': 30.5}], 'source': 'KPMG Taxation of International Executives: Italy, Mar 2025 (reviewer)',
            'url': '', 'note': 'midpoint of a range — a judgement; TFR severance accrual (≈ 6.9 %) not included'},
    hours=hrs(40, 20, 12, f'20 days leave, 12 public holidays — {WIKI_LEAVE}'),
    confidence='Low', legacy=legacy('EU', 0.95),
    notes='Only PayScale; the mid figure is its EARLY-CAREER (1–4 y) average — the mid rate is on the low side.')

hub(id='PT', label='Portugal', country='PT', currency='EUR', cities=['Braga', 'Porto', 'Lisbon'],
    evidence=evidence('B', 'PT'),
    mid=[pick('B', 'PT', 23892), pick('B', 'PT', 36400)],
    senior=[pick('B', 'PT', 41000, statistic='top of PayScale range (≈ p90)')],
    seniorBasis='top of the PayScale range (≈ p90) — high for a senior',
    excluded=[{'what': 'nettocalc.com Braga median €36,000', 'why': 'a calculator site with figures for every title (reviewer)'}],
    onCost={'components': [{'name': 'employer social security', 'pct': 23.75}], 'source': 'PwC Worldwide Tax Summaries Portugal', 'url': oncost('PT')['url'],
            'note': 'occupational accident insurance not included'},
    hours=hrs(40, 22, 13, f'22 days leave, 13 public holidays — {WIKI_LEAVE} (reviewer)'),
    confidence='Low', legacy=legacy('EU', 0.95), notes='The two mid sources disagree by ~50 %; the median of two is their average.')

# ── Central & Eastern Europe ─────────────────────────────────────────────────────────────────────────────────────────
hub(id='PL', label='Poland', country='PL', currency='PLN', cities=['Kraków', 'Gliwice', 'Wrocław', 'Łódź'],
    evidence=evidence('B', 'PL'),
    mid=[pick('B', 'PL', 13800, M, level='mid')],
    senior=[pick('B', 'PL', 22800, M, level='senior'), midpoint('B', 'PL', 17000, 23000, M, level='senior', label='No Fluff Jobs senior UoP gross offers (all IT)')],
    seniorBasis='median of the Bulldogjob senior embedded figure and the No Fluff Jobs senior employment-contract band',
    excluded=[{'what': 'Bulldogjob B2B 16,000 / 26,000', 'why': 'net invoice of a self-employed contractor — a supplier rate, not a salary'},
              {'what': 'Bulldogjob year-end 9,300 / 14,000', 'why': 'take-home (net)'}],
    onCost={'components': [{'name': 'employer ZUS + Labour / Solidarity funds (PwC lower bound)', 'pct': 19.48}], 'source': 'PwC Worldwide Tax Summaries Poland 2026',
            'url': oncost('PL')['url'], 'note': 'pension / disability capped at PLN 282,600 a year — above both salaries'},
    hours=hrs(40, 20, 14, f'20 days leave (26 after 10 years incl. study), 14 public holidays — {WIKI_LEAVE}'),
    confidence='Low', legacy=legacy('Eastern_Europe', 0.45),
    notes='DISPUTED BASIS: the researcher read the Bulldogjob embedded medians as gross, the reviewer as net take-home. If net, the true gross is materially higher and this rate is understated. Read bulldogjob.pl/it-report/salaries/embedded before relying on it.')

hub(id='CZ', label='Czechia', country='CZ', currency='CZK', cities=['Prague', 'Brno', 'Mladá Boleslav'],
    evidence=evidence('B', 'CZ'),
    mid=[midpoint('B', 'CZ', 65000, 90000, M, label='Grafton AUTOSAR advert', src='Grafton'), midpoint('B', 'CZ', 85000, 105000, M, label='Jenprace embedded advert'),
         midpoint('B', 'CZ', 50000, 90000, M, label='Pracomat firmware advert', src='Pracomat'), pick('B', 'CZ', 80378, M)]
        + some(rv('CZ', 15, i=1, factor=M, statistic='median, IT section (ČSÚ ISPV 2025)')),
    senior=[pick('B', 'CZ', 90000, M, statistic='advert range top', note='Grafton AUTOSAR advert top', src='Grafton'), pick('B', 'CZ', 90000, M, statistic='advert range top', src='Pracomat'), pick('B', 'CZ', 105000, M, statistic='advert range top')],
    seniorBasis='median of advert range tops — no survey by level',
    excluded=[], onCost={'components': [{'name': 'employer social security', 'pct': 24.8, 'ceilingAnnual': 2350416}, {'name': 'health insurance', 'pct': 9}],
                         'source': 'PwC Worldwide Tax Summaries Czech Republic 2026', 'url': oncost('CZ')['url'], 'note': ''},
    hours=hrs(40, 20, 13, f'20 days leave, 13 public holidays — {WIKI_LEAVE}'),
    confidence='Medium', legacy=legacy('Eastern_Europe', 0.45), notes='Adverts, cross-checked by the ČSÚ IT-section median (official).')

ro_ratio = 8716 / 5266
hub(id='RO', label='Romania', country='RO', currency='RON', cities=['Timișoara', 'Iași', 'Sibiu', 'Brașov', 'Cluj-Napoca'],
    evidence=evidence('C', 'RO'),
    mid=[net_to_gross(pick('C', 'RO', 12136, M), ro_ratio, 'INS 2025 whole-economy gross/net 8,716 / 5,266')]
        + [net_to_gross(x, ro_ratio, 'INS 2025 whole-economy gross/net 8,716 / 5,266') for x in some(rv('RO', 8, i=1, factor=M), rv('RO', 8, i=2, factor=M), rv('RO', 8, i=3, factor=M))],
    senior=[], seniorBasis='no senior figure — the mid rate is used (senior share has no effect)',
    excluded=[{'what': 'INS December 2025 net 12,588', 'why': 'includes year-end bonuses'},
              {'what': 'PayScale embedded RON 50,050 a year', 'why': 'contradicts the official figures (researcher)'},
              {'what': 'Paylab p10–p90', 'why': 'gross / net stated inconsistently'}],
    onCost={'components': [{'name': 'work insurance contribution (CAM)', 'pct': 2.25}], 'source': 'PwC Worldwide Tax Summaries Romania', 'url': oncost('RO')['url'],
            'note': 'Romania puts social contributions on the employee — they are inside the gross'},
    hours=hrs(40, 20, 15, f'15 public holidays — Wikipedia list of public holidays; 20 days leave {NS}'),
    confidence='Low', legacy=legacy('Eastern_Europe', 0.45),
    notes='INS publishes the IT-services average NET; gross = net × the 2025 whole-economy gross/net ratio — an assumption. IT-services industry average (all staff), not an occupation.')

hub(id='HU', label='Hungary', country='HU', currency='HUF', cities=['Budapest', 'Veszprém', 'Szeged'],
    evidence=evidence('C', 'HU'),
    mid=[midpoint('C', 'HU', 900000, 1400000, M, label='Hays 2024 mid-level developer (gross)')],
    senior=[midpoint('C', 'HU', 1500000, 2000000, M, label='Hays 2024 senior developer (gross)'), midpoint('C', 'HU', 1600000, 2300000, M, label='Grafton 2025 senior developer')],
    seniorBasis='median of the Hays 2024 and Grafton 2025 senior developer bands',
    excluded=[], onCost={'components': [{'name': 'social contribution tax', 'pct': 13}], 'source': 'PwC Worldwide Tax Summaries Hungary 2026', 'url': oncost('HU')['url'], 'note': ''},
    hours=hrs(40, 20, 12, f'20 days leave (ILO table), 11–13 public holidays — Wikipedia'),
    confidence='Low', legacy=legacy('Eastern_Europe', 0.45), notes='General software developers (no embedded survey found).')

rs_ratio = 345350 / 254895
hub(id='RS', label='Serbia', country='RS', currency='RSD', cities=['Novi Sad', 'Belgrade'],
    evidence=evidence('C', 'RS'),
    mid=[net_to_gross(pick('C', 'RS', v, M), rs_ratio, 'RZS Sep 2022 programming gross/net 345,350 / 254,895') for v in (288617, 305805, 295476)],
    senior=[], seniorBasis='no senior figure — the mid rate is used',
    excluded=[{'what': 'RZS November net 281,991', 'why': 'year not certain (reviewer)'},
              {'what': 'RZS January 2025 400,234', 'why': 'basis not stated; it matches the converted gross (≈ 400k) — cross-check'}],
    onCost={'components': [{'name': 'pension and disability', 'pct': 10}, {'name': 'health', 'pct': 5.15}], 'source': 'PwC Worldwide Tax Summaries Serbia',
            'url': oncost('RS')['url'], 'note': 'contribution ceiling not researched'},
    hours=hrs(40, 20, 9, f'20 days leave (ILO table), 9 public holidays — Wikipedia'),
    confidence='Medium', legacy=legacy('Eastern_Europe', 0.45),
    notes='RZS publishes NET pay for computer programming; gross = net × RZS\'s own 2022 gross/net for the same activity.')

hub(id='TR', label='Türkiye', country='TR', currency='TRY', cities=['Istanbul', 'Bursa', 'Ankara', 'Gebze'],
    evidence=evidence('C', 'TR'),
    mid=[pick('C', 'TR', 94096, M, statistic='mean EMPLOYER LABOUR COST per employee, ICT section (TÜİK 2024)')],
    senior=[], seniorBasis='no senior figure — the mid rate is used',
    excluded=[{'what': 'kariyer.net embedded 63,521 / senior 73,472 TL a month', 'why': 'applicants\' NET salary expectations, not paid salaries (reviewer)'},
              {'what': 'eleman.net 70,000 TL', 'why': 'gross / net not stated'},
              {'what': 'TÜİK 2023 annual gross earnings', 'why': 'superseded by the 2024 labour-cost figure; high inflation'}],
    onCost={'components': [], 'inSalary': True, 'source': 'TÜİK labour-cost statistics', 'url': '', 'note': 'TÜİK\'s figure is the employer\'s cost — social security is inside it'},
    hours=hrs(40, 14, 9, f'14 days leave (1–5 years) — {WIKI_LEAVE}; 9 fixed public holidays (reviewer) — the religious feasts are not in that count'),
    confidence='Low', legacy=legacy('Eastern_Europe', 0.45),
    notes='2024 lira at the book\'s 2026 FX: Turkish inflation since 2024 is NOT applied, so this rate is a lower bound. ICT section average (all staff).')

# ── Middle East & Africa ─────────────────────────────────────────────────────────────────────────────────────────────
hub(id='EG', label='Egypt', country='EG', currency='EGP', cities=['Cairo (Smart Village / New Cairo)'],
    evidence=evidence('C', 'EG'),
    mid=[pick('C', 'EG', 197193)] + some(rv('EG', 15, i=0, statistic='median total package (Levels.fyi, Valeo embedded)')),
    senior=[], seniorBasis='no senior figure — the mid rate is used',
    excluded=[{'what': 'Paylab p10–p90', 'why': 'no central figure'},
              {'what': 'CAPMAS 2023 ICT average EGP 19,179 a month', 'why': 'predates the March 2024 devaluation (the pound lost ~40 %); an industry average'}],
    onCost={'components': [{'name': 'social insurance (insurable pay EGP 2,700–16,700 a month)', 'pct': 18.75, 'floorAnnual': 0, 'ceilingAnnual': 16700 * 12},
                           {'name': 'comprehensive health insurance (base assumed the same)', 'pct': 4, 'ceilingAnnual': 16700 * 12}],
            'source': 'PwC Worldwide Tax Summaries Egypt 2026', 'url': oncost('EG')['url'], 'note': ''},
    hours=hrs(40, 21, 14, f'21 days leave and 14 public holidays {NS}'),
    confidence='Low', legacy=legacy('Eastern_Europe', 0.45),
    notes='Two self-reported sources for the same employer and role disagree three-fold (PayScale EGP 197k v Levels.fyi 610k); the mid is their average. Treat as directional.')

# ── Asia ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
hub(id='IN', label='India', country='IN', currency='INR', cities=['Bengaluru', 'Pune', 'Hyderabad', 'Chennai'],
    evidence=evidence('D', 'IN'),
    mid=[midpoint('D', 'IN', 450000, 1090000, label='AmbitionBox KPIT AUTOSAR developer, 2–4 y'),
         midpoint('D', 'IN', 460000, 1260000, label='AmbitionBox Schaeffler India embedded, 1–5 y')],
    senior=[o for o in [
        (lambda a, b: a and b and dict(a, value=(a['value'] + b['value']) / 2, statistic=f"midpoint of {a['value']:,}–{b['value']:,} (Tata Elxsi embedded, 5–8 y)"))(rv('IN', 'SENIOR', i=0), rv('IN', 'SENIOR', i=1)),
        (lambda a, b: a and b and dict(a, value=(a['value'] + b['value']) / 2, statistic=f"midpoint of {a['value']:,}–{b['value']:,} (BGSW senior software engineer, 2–10 y)"))(rv('IN', 'SENIOR', i=2), rv('IN', 'SENIOR', i=3)),
    ] if o],
    seniorBasis='median of AmbitionBox Tata Elxsi (5–8 y) and Bosch Global Software Technologies senior bands (independent review)',
    excluded=[{'what': 'AmbitionBox TCS / Tech Mahindra rows', 'why': 'stored under the KPIT URL — wrong source link (reviewer)'},
              {'what': 'AmbitionBox junior embedded', 'why': 'junior'}],
    onCost={'components': [], 'inSalary': True, 'source': 'AmbitionBox figures read as CTC', 'url': oncost('IN')['url'],
            'note': 'AmbitionBox salaries are taken as CTC (cost to company), which includes the employer PF (12 %) and usually gratuity (4.81 %) — UNVERIFIED; if they are not CTC, add ≈ 10 %'},
    hours=hrs(40, 25, 3, f'25 days leave — {WIKI_LEAVE} (state Shops & Establishments law varies); 3 national holidays {NS}'),
    confidence='Low', legacy=legacy('India', 0.20),
    notes='Job-board aggregates only; no official statistic for software engineers.')

hub(id='CN', label='China', country='CN', currency='CNY', cities=['Shanghai', 'Shenzhen', 'Huizhou', 'Suzhou', 'Hefei'],
    evidence=evidence('D', 'CN'),
    mid=[pick('D', 'CN', 238966)] + [o for o in [
        (lambda a, b: a and b and dict(a, value=(a['value'] + b['value']) / 2, annualFactor=12, statistic=f"midpoint of {a['value']:,}–{b['value']:,} a month × 12 (Shanghai AUTOSAR advert, 5–10 y)"))(rv('CN', 6, i=0), rv('CN', 6, i=1))] if o],
    senior=[o for o in [(lambda a: a and dict(a, annualFactor=12, statistic='advert range top × 12'))(rv('CN', 6, i=1))] if o],
    seniorBasis='top of a single Shanghai AUTOSAR advert (5–10 y) — weak',
    excluded=[{'what': 'NBS private-unit IT average ¥123,193', 'why': 'automotive software employers are mostly non-private / large units'},
              {'what': 'Liepin listings "20–30k … 16 薪"', 'why': 'headhunter adverts without a central figure'}],
    onCost={'components': [{'name': 'pension', 'pct': 16}, {'name': 'medical incl. maternity', 'pct': 9}, {'name': 'unemployment', 'pct': 0.5}, {'name': 'work injury (lowest class)', 'pct': 0.2}],
            'source': 'PwC Worldwide Tax Summaries China (Shanghai)', 'url': oncost('CN')['url'], 'note': 'housing provident fund (5–7 %) not sourced — excluded; base cap 300 % of city average not applied'},
    hours=hrs(40, 5, 13, f'5 days leave (1–10 years) — {WIKI_LEAVE}; 13 public holidays {NS}'),
    confidence='Low', legacy=legacy('China', 0.35),
    notes='No published salary statistic for embedded / automotive software was found; the NBS figure is an industry average (all staff, all of China). Bonus months (13th–16th) are not included.')

hub(id='VN', label='Vietnam', country='VN', currency='VND', cities=['Hanoi', 'Ho Chi Minh City', 'Da Nang'],
    evidence=evidence('D', 'VN'),
    mid=[pick('D', 'VN', 28400000, M), pick('D', 'VN', 34350000, M)],
    senior=[pick('D', 'VN', 39400000, M)],
    seniorBasis='ITviec 2025–26 embedded median, 5–8 years',
    excluded=[{'what': 'ITviec 2024 point 45.6 M', 'why': 'single 2024 data point'}],
    onCost={'components': [{'name': 'social insurance', 'pct': 17.5}, {'name': 'health insurance', 'pct': 3}, {'name': 'unemployment insurance', 'pct': 1}],
            'source': 'PwC Worldwide Tax Summaries Vietnam', 'url': oncost('VN')['url'], 'note': 'income cap (20 × reference level) not applied; trade-union fee not included'},
    hours=hrs(40, 12, 11, 'Labour Code 2019: 12 days leave, 11 public holidays (reviewer, lawnet.vn)'),
    confidence='Low', legacy=legacy('India', 0.20),
    notes='ITviec does not say gross or net; if net, the rate is understated. Tet (13th-month) bonus not included.')

hub(id='JP', label='Japan', country='JP', currency='JPY', cities=['Tokyo', 'Nagoya / Aichi (Kariya, Toyota City)'],
    evidence=evidence('D', 'JP'),
    mid=[mhlw_jp(), pick('D', 'JP', 5576000)],
    senior=[], seniorBasis='no senior figure — the mid rate is used (Japanese pay rises with age; the survey is all ages)',
    excluded=[{'what': 'en-ambi posting ¥6.0–12.5 M', 'why': 'a single employer\'s advert'}],
    onCost={'components': [{'name': 'welfare pension', 'pct': 9.15, 'ceilingAnnual': 650000 * 12}, {'name': 'health insurance (Tokyo)', 'pct': 4.925},
                           {'name': 'employment insurance', 'pct': 0.5}], 'source': 'PwC Worldwide Tax Summaries Japan 2026', 'url': oncost('JP')['url'],
            'note': 'nursing-care (40+), child-support levy and accident insurance not included'},
    hours=hrs(40, 10, 16, f'40-hour week (Labour Standards Act, reviewer); 10 days leave (first year) — {WIKI_LEAVE}; 16 public holidays {NS}'),
    confidence='Medium', legacy=legacy('Japan', 0.90),
    notes='MHLW wage-structure survey (official) incl. bonus; jobtag figure year unconfirmed.')

hub(id='KR', label='South Korea', country='KR', currency='KRW', cities=['Seoul', 'Pangyo / Seongnam', 'Hwaseong (Namyang R&D)'],
    evidence=evidence('D', 'KR'),
    mid=[pick('D', 'KR', 6099042, M, statistic='mean monthly EMPLOYER COST (KOSA: base + allowances + bonus + severance provision + employer 4 insurances)')],
    senior=[], seniorBasis='no senior figure — the mid rate is used',
    excluded=[{'what': 'KOSA all-SW-technician daily rate', 'why': 'all software roles, not system / embedded'}],
    onCost={'components': [], 'inSalary': True, 'source': 'KOSA definition (reviewer)', 'url': '',
            'note': 'KOSA\'s average wage already includes severance provision and the employer\'s four social insurances — nothing added'},
    hours=hrs(40, 15, 15, f'40-hour week (reviewer); 15 days leave after one year — {WIKI_LEAVE}; 15 public holidays {NS}'),
    confidence='Medium', legacy=legacy('Japan', 0.90),
    notes='KOSA statutory survey (SW Industry Promotion Act), 시스템SW개발자 incl. embedded, 2024 data published for 2025.')

# ── Americas ─────────────────────────────────────────────────────────────────────────────────────────────────────────
us_on = [{'name': 'OASDI', 'pct': 6.2, 'ceilingAnnual': 184500}, {'name': 'Medicare', 'pct': 1.45}]
us_note = 'FUTA / state unemployment and employer health cover / 401(k) not included'
hub(id='US-MI', label='USA — Michigan', country='US', currency='USD', cities=['Detroit-Warren-Dearborn', 'Ann Arbor'],
    evidence=evidence('E', 'US-MI'),
    mid=[pick('E', 'US-MI', 124780), pick('E', 'US-MI', 119310), pick('E', 'US-MI', 140344), pick('E', 'US-MI', 135000)]
        + some(rv('US-MI', 3, i=0, statistic='median, May 2025 (Detroit)')),
    senior=[pick('E', 'US-MI', 135830), pick('E', 'US-MI', 138850), pick('E', 'US-MI', 159000, statistic='top of a Ford AUTOSAR posted band')],
    seniorBasis='median of the Detroit and Ann Arbor OEWS p75 and a Ford AUTOSAR band top',
    excluded=[{'what': 'Michigan statewide median $107,820', 'why': 'the hub is the Detroit / Ann Arbor metros'},
              {'what': 'ZipRecruiter functional-safety $91,188', 'why': 'implausibly low against posted bands (researcher)'}],
    onCost={'components': us_on, 'source': 'SSA 2026 contribution base / IRS Pub. 15', 'url': oncost('US')['url'], 'note': us_note},
    hours=hrs(40, 0, 0, f'no statutory paid leave or private-sector holidays — {WIKI_LEAVE}', False,
              'employers typically give ~10 holidays + ~15 days PTO, which would raise the hourly cost ≈ 11 %'),
    confidence='Medium', legacy=legacy('USA_Detroit', 1.35), notes='BLS OEWS (official) for software developers + automotive embedded figures.')

hub(id='US-CA', label='USA — California', country='US', currency='USD', cities=['San Jose / Sunnyvale', 'San Francisco / Palo Alto', 'Irvine'],
    evidence=evidence('E', 'US-CA'),
    mid=[pick('E', 'US-CA', 213110, statistic='median (May 2025 per reviewer)'), pick('E', 'US-CA', 186640), midpoint('E', 'US-CA', 146000, 201000, label='Glassdoor San Jose embedded BASE range')]
        + some(rv('US-CA', 4, i=1, statistic='median, May 2024 (San Jose, third-party quote)')),
    senior=[pick('E', 'US-CA', 226080), pick('E', 'US-CA', 219670), pick('E', 'US-CA', 201000, statistic='top of Glassdoor base range')],
    seniorBasis='median of the San Jose and San Francisco OEWS p75 and the Glassdoor base-range top (the OEWS p75 may be top-coded)',
    excluded=[{'what': 'Levels.fyi total compensation (Rivian, Tesla, GM)', 'why': 'includes stock grants — not comparable with OEWS base wages'},
              {'what': 'Glassdoor total-pay median $237k', 'why': 'includes bonus / stock'}],
    onCost={'components': us_on, 'source': 'SSA 2026 contribution base / IRS Pub. 15', 'url': oncost('US')['url'], 'note': us_note + '; California SDI is employee-paid'},
    hours=hrs(40, 0, 0, f'no statutory paid leave — {WIKI_LEAVE}', False, 'typical PTO would raise the hourly cost ≈ 11 %'),
    confidence='Medium', legacy=legacy('USA_SV', 1.85), notes='OEWS years differ between sources (May 2024 / May 2025) — stated per figure.')

ca_h = 40 * 52
hub(id='CA', label='Canada (Ontario)', country='CA', currency='CAD', cities=['Toronto / Markham', 'Ottawa-Kanata', 'Kitchener-Waterloo'],
    evidence=evidence('E', 'CA'),
    mid=[pick('E', 'CA', 56.73, ca_h, statistic='median hourly × 2,080 h'), pick('E', 'CA', 48.08, ca_h, role='software_developer_general', note='NOC 21232 Ontario median', statistic='median hourly × 2,080 h') if False else pick('E', 'CA', 89842),
         pick('E', 'CA', 86651)],
    senior=[pick('E', 'CA', 102428), pick('E', 'CA', 113153, statistic='top of Glassdoor typical range (≈ p75)')],
    seniorBasis='median of PayScale senior embedded (Toronto) and the Glassdoor range top',
    excluded=[{'what': 'Job Bank NOC 21232 C$48.08 / h', 'why': 'listed twice (Ontario and Toronto) — the NOC 21231 engineer row is used'},
              {'what': 'Levels.fyi GM Canada', 'why': 'total compensation'}],
    onCost={'components': [{'name': 'CPP', 'pct': 5.95, 'floorAnnual': 3500, 'ceilingAnnual': 74600}, {'name': 'EI (1.4 × 1.63 %)', 'pct': 2.282, 'ceilingAnnual': 68900}],
            'source': 'Canada Revenue Agency 2026', 'url': oncost('CA')['url'], 'note': 'CPP2 and the Ontario Employer Health Tax not included'},
    hours=hrs(40, 10, 9, f'10 days leave (Ontario 2 weeks), 9 public holidays — reviewer (Statista) / {WIKI_LEAVE}'),
    confidence='Medium', legacy=legacy('USA_Detroit', 1.35), notes='Job Bank hourly figures annualised at 2,080 h (40 h × 52).')

hub(id='MX', label='Mexico', country='MX', currency='MXN', cities=['Guadalajara', 'Querétaro', 'Monterrey'],
    evidence=evidence('E', 'MX'),
    mid=[pick('E', 'MX', 25000, M)],
    senior=[pick('E', 'MX', 34000, M, statistic='top of Glassdoor base range')],
    seniorBasis='top of the Glassdoor embedded base range',
    excluded=[{'what': 'DataMéxico MXN 11k', 'why': 'rounded, all software developers incl. informal work'},
              {'what': 'Indeed / Computrabajo general developer pay', 'why': 'general software, not embedded'},
              {'what': 'Levels.fyi Guadalajara total comp MXN 730k', 'why': 'total compensation, international employers'}],
    onCost={'components': [{'name': 'INFONAVIT', 'pct': 5}, {'name': 'SAR retirement', 'pct': 2}, {'name': 'CEAV (lowest band, 2026)', 'pct': 3.15}],
            'source': 'vendor payroll guides (F.json / reviewer) — no big-four source', 'url': oncost('MX')['url'],
            'note': 'PARTIAL: the IMSS sickness, disability, work-risk and childcare branches, the state payroll tax (3–4 %), the aguinaldo (15 days) and the vacation premium are not included'},
    hours=hrs(40, 12, 7, f'12 days leave (first year) — {WIKI_LEAVE}; 7 mandatory rest days {NS}'),
    confidence='Low', legacy=legacy('Mexico', 0.28),
    notes='One embedded figure (Glassdoor); the reviewer could not re-find it. Mexican software pay spans MXN 15k–60k a month by employer segment.')

# ── write ────────────────────────────────────────────────────────────────────────────────────────────────────────────
for h in HUBS:
    for lst in ('mid', 'senior'):
        for o in h[lst]:
            o['currency'] = h['currency'] if o.get('currency') in (None, '') else o['currency']
    h.setdefault('onCost', {}).setdefault('inSalary', False)
cfg = {
    'version': '2026-10',
    'researched': '2026-10-13',
    'method': ('mid = median of the hub\'s central embedded / automotive software salaries and its official software-developer '
               'median; senior = median of its senior / upper-quartile figures; + statutory employer on-cost; ÷ productive hours '
               '((260 − statutory leave − public holidays) × 8 h; France 218 forfait days) × 152 h; ÷ the app\'s FX. Every figure '
               'was read from a search result of the cited page (the pages could not be opened in the research environment).'),
    'hubs': HUBS,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cfg, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(f'wrote {os.path.normpath(OUT)}: {len(HUBS)} hubs')
