#!/usr/bin/env python3
"""
Official-statistics layer for every CostVision country (rate round, 30 Oct 2026).

Pulls, from the publishers' own APIs, the figures every country book needs and that an official body publishes for
many countries on ONE method — so 33 countries are not researched 33 different ways:

  fx.json            ECB euro reference rates (latest day) → local currency per £1 (cross through EUR)
  eurostat.json      Eurostat: labour cost per hour worked in manufacturing (lc_lci_lev, 2023–25) + the quarterly
                     labour cost index (lc_lci_r2_q, NACE C) to carry it to 2026; mean hourly earnings by ISCO-08 major
                     group in manufacturing (SES 2022, earn_ses22_47); non-household electricity (nrg_pc_205, band ID
                     2–20 GWh) and gas (nrg_pc_203, band I3 10–100 TJ), excluding VAT and recoverable levies, national
                     currency, latest semesters
  ecb-mir.json       ECB MFI interest rates: composite cost of borrowing for non-financial corporations, euro area
                     countries (latest months)
  worldbank.json     World Bank WDI lending interest rate (FR.INR.LEND), every country, latest years
  ilo.json           ILOSTAT average monthly earnings of employees by occupation (ISCO-08 major groups), non-EU countries
  holidays.json      public holidays 2026 per country (Nager.Date), weekday holidays counted

Every value is stored with the exact URL it came from and the time it was read. Nothing is edited by hand; the config
builder (`build-world.py`) reads these files.

  python3 -I scripts/rate-refresh/world-2026-10/fetch-official.py
"""
import csv, io, json, os, subprocess, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'official')
os.makedirs(OUT, exist_ok=True)
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')

# CostVision region code → ISO2 / ISO3 / currency (REGIONAL_DATA); Eurostat uses EL for Greece (none here), UK for GB.
REGIONS = {
    'UK': ('GB', 'GBR', 'GBP'), 'DE': ('DE', 'DEU', 'EUR'), 'FR': ('FR', 'FRA', 'EUR'), 'IT': ('IT', 'ITA', 'EUR'),
    'ES': ('ES', 'ESP', 'EUR'), 'PL': ('PL', 'POL', 'PLN'), 'CZ': ('CZ', 'CZE', 'CZK'), 'RO': ('RO', 'ROU', 'RON'),
    'HU': ('HU', 'HUN', 'HUF'), 'SE': ('SE', 'SWE', 'SEK'), 'NL': ('NL', 'NLD', 'EUR'), 'TR': ('TR', 'TUR', 'TRY'),
    'CN': ('CN', 'CHN', 'CNY'), 'IN': ('IN', 'IND', 'INR'), 'MX': ('MX', 'MEX', 'MXN'), 'US': ('US', 'USA', 'USD'),
    'TH': ('TH', 'THA', 'THB'), 'VN': ('VN', 'VNM', 'VND'), 'BR': ('BR', 'BRA', 'BRL'), 'KR': ('KR', 'KOR', 'KRW'),
    'AT': ('AT', 'AUT', 'EUR'), 'BE': ('BE', 'BEL', 'EUR'), 'PT': ('PT', 'PRT', 'EUR'), 'SK': ('SK', 'SVK', 'EUR'),
    'SI': ('SI', 'SVN', 'EUR'), 'LT': ('LT', 'LTU', 'EUR'), 'BG': ('BG', 'BGR', 'EUR'), 'RS': ('RS', 'SRB', 'RSD'),
    'MA': ('MA', 'MAR', 'MAD'), 'TN': ('TN', 'TUN', 'TND'), 'EG': ('EG', 'EGY', 'EGP'), 'ZA': ('ZA', 'ZAF', 'ZAR'),
    'JP': ('JP', 'JPN', 'JPY'), 'TW': ('TW', 'TWN', 'TWD'), 'MY': ('MY', 'MYS', 'MYR'), 'ID': ('ID', 'IDN', 'IDR'),
    'PH': ('PH', 'PHL', 'PHP'), 'SG': ('SG', 'SGP', 'SGD'), 'CA': ('CA', 'CAN', 'CAD'),
}
ESTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'
ES_GEO = {r: ('UK' if v[0] == 'GB' else v[0]) for r, v in REGIONS.items()}


def get(url, timeout=150):
    r = subprocess.run(['curl', '-sS', '-m', str(timeout), '-A', 'CostVision rate research (official statistics)', url],
                       capture_output=True, timeout=timeout + 30)
    if r.returncode != 0:
        raise RuntimeError(f'{url}: {r.stderr.decode()[:200]}')
    return r.stdout.decode('utf-8', errors='replace')


def jsonstat(url):
    """Eurostat JSON-stat 2.0 → list of ({dim: code}, value)."""
    d = json.loads(get(url))
    ids, sizes = d['id'], d['size']
    cats = [sorted(d['dimension'][k]['category']['index'].items(), key=lambda x: x[1]) for k in ids]
    out = []
    for flat, v in d['value'].items():
        i, key = int(flat), {}
        for dim, size, cat in zip(reversed(ids), reversed(sizes), reversed(cats)):
            key[dim] = cat[i % size][0]
            i //= size
        out.append((key, v))
    return out, d.get('updated')


def save(name, obj):
    json.dump(obj, open(os.path.join(OUT, name), 'w'), indent=1, ensure_ascii=False)
    print(f'  wrote official/{name}')


def fx():
    url = 'https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata'
    rows = list(csv.DictReader(io.StringIO(get(url))))
    per_eur = {r['CURRENCY']: (float(r['OBS_VALUE']), r['TIME_PERIOD']) for r in rows if r['OBS_VALUE']}
    gbp, day = per_eur['GBP']
    out = {'source': url, 'read': NOW, 'publisher': 'European Central Bank, euro foreign exchange reference rates',
           'day': day, 'perEur': {k: v[0] for k, v in per_eur.items() if v[1] == day}, 'perGbp': {}}
    out['perEur']['EUR'] = 1.0
    for r, (_, _, ccy) in REGIONS.items():
        if ccy in out['perEur']:
            out['perGbp'][ccy] = round(out['perEur'][ccy] / gbp, 6)
    out['perGbp']['GBP'] = 1.0
    out['notPublishedByEcb'] = sorted({c for _, _, c in REGIONS.values()} - set(out['perGbp']))
    save('fx.json', out)


def eurostat():
    geos = '&'.join(f'geo={g}' for g in sorted(set(ES_GEO.values())))
    res = {'read': NOW, 'publisher': 'Eurostat'}
    # 1. labour cost level, manufacturing, € and national currency per hour worked
    for unit in ('EUR', 'NAC'):
        url = f'{ESTAT}/lc_lci_lev?nace_r2=C&lcstruct=D1_D4_MD5&unit={unit}&sinceTimePeriod=2023&{geos}&format=JSON&lang=en'
        rows, upd = jsonstat(url)
        res[f'lcLevel{unit}'] = {'source': url, 'updated': upd,
                                 'values': {f"{k['geo']}|{k['time']}": v for k, v in rows}}
    # 2. labour cost index, manufacturing, quarterly, unadjusted
    url = f'{ESTAT}/lc_lci_r2_q?nace_r2=C&lcstruct=D1_D4_MD5&unit=I20&s_adj=NSA&sinceTimePeriod=2024-Q1&{geos}&format=JSON&lang=en'
    rows, upd = jsonstat(url)
    res['lci'] = {'source': url, 'updated': upd, 'values': {f"{k['geo']}|{k['time']}": v for k, v in rows}}
    # 3. SES 2022 mean hourly earnings by ISCO major group, manufacturing (enterprises with 10+ employees)
    url = f'{ESTAT}/earn_ses22_47?sex=T&nace_r2=C&indic_se=ERN&unit=EUR&{geos}&format=JSON&lang=en'
    rows, upd = jsonstat(url)
    res['ses'] = {'source': url, 'updated': upd,
                  'values': {f"{k['geo']}|{k['isco08']}|{k['sizeclas']}": v for k, v in rows}}
    # 4. electricity (band ID) and gas (band I3), excl. VAT and recoverable levies, national currency
    url = f'{ESTAT}/nrg_pc_205?nrg_cons=MWH2000-19999&tax=X_VAT&currency=NAC&unit=KWH&sinceTimePeriod=2025-S1&{geos}&format=JSON&lang=en'
    rows, upd = jsonstat(url)
    res['electricity'] = {'source': url, 'updated': upd, 'band': 'ID (2 000–19 999 MWh/yr)',
                          'values': {f"{k['geo']}|{k['time']}": v for k, v in rows}}
    url = f'{ESTAT}/nrg_pc_203?nrg_cons=GJ10000-99999&tax=X_VAT&currency=NAC&unit=KWH&sinceTimePeriod=2025-S1&{geos}&format=JSON&lang=en'
    rows, upd = jsonstat(url)
    res['gas'] = {'source': url, 'updated': upd, 'band': 'I3 (10 000–99 999 GJ/yr)',
                  'values': {f"{k['geo']}|{k['time']}": v for k, v in rows}}
    save('eurostat.json', res)


def ecb_mir():
    out = {'read': NOW, 'publisher': 'European Central Bank, MFI interest rate statistics',
           'series': 'composite cost of borrowing indicator, new loans to non-financial corporations', 'values': {}}
    for r, (iso2, _, ccy) in REGIONS.items():
        if ccy != 'EUR':
            continue
        url = f'https://data-api.ecb.europa.eu/service/data/MIR/M.{iso2}.B.A2I.AM.R.A.2240.EUR.N?lastNObservations=6&format=csvdata'
        try:
            rows = list(csv.DictReader(io.StringIO(get(url, 60))))
            obs = [(x['TIME_PERIOD'], float(x['OBS_VALUE'])) for x in rows if x.get('OBS_VALUE')]
            out['values'][r] = {'source': url, 'obs': obs}
        except Exception as e:  # recorded, not hidden
            out['values'][r] = {'source': url, 'error': str(e)[:200]}
    save('ecb-mir.json', out)


def worldbank():
    out = {'read': NOW, 'publisher': 'World Bank, World Development Indicators', 'indicator': 'FR.INR.LEND', 'values': {}}
    for r, (_, iso3, _) in REGIONS.items():
        url = f'https://api.worldbank.org/v2/country/{iso3}/indicator/FR.INR.LEND?format=json&mrv=5'
        try:
            d = json.loads(get(url, 60))
            obs = [(x['date'], x['value']) for x in (d[1] or []) if x['value'] is not None]
            out['values'][r] = {'source': url, 'obs': obs}
        except Exception as e:
            out['values'][r] = {'source': url, 'error': str(e)[:200]}
    save('worldbank.json', out)


def ilo():
    out = {'read': NOW, 'publisher': 'International Labour Organization, ILOSTAT',
           'dataflow': 'DF_EAR_EMTA_SEX_OCU_NB (average monthly earnings of employees by sex and occupation, ISCO-08)',
           'values': {}}
    for r, (_, iso3, _) in REGIONS.items():
        url = f'https://sdmx.ilo.org/rest/data/ILO,DF_EAR_EMTA_SEX_OCU_NB/{iso3}.A.....?startPeriod=2018&format=csvfilewithlabels'
        try:
            rows = list(csv.DictReader(io.StringIO(get(url, 120))))
            keep = [{'ocu': x['OCU'], 'year': x['TIME_PERIOD'], 'value': float(x['OBS_VALUE']), 'unit': x['UNIT_MEASURE'],
                     'survey': x.get('SOURCE', ''), 'note': x.get('NOTE_SOURCE', '')}
                    for x in rows if x.get('SEX') == 'SEX_T' and x.get('OBS_VALUE') and x['OCU'].startswith('OCU_ISCO08')]
            out['values'][r] = {'source': url, 'rows': keep}
        except Exception as e:
            out['values'][r] = {'source': url, 'error': str(e)[:200]}
    save('ilo.json', out)


def holidays():
    out = {'read': NOW, 'publisher': 'Nager.Date public-holiday API (compiled from each country’s official calendar)',
           'year': 2026, 'values': {}}
    for r, (iso2, _, _) in REGIONS.items():
        url = f'https://date.nager.at/api/v3/PublicHolidays/2026/{iso2}'
        try:
            d = json.loads(get(url, 60))
            hol = [{'date': h['date'], 'name': h['name'], 'national': bool(h['global'])} for h in d]
            out['values'][r] = {'source': url, 'holidays': hol}
        except Exception as e:
            out['values'][r] = {'source': url, 'error': str(e)[:200]}
    save('holidays.json', out)


if __name__ == '__main__':
    steps = sys.argv[1:] or ['fx', 'eurostat', 'ecb_mir', 'worldbank', 'ilo', 'holidays']
    for s in steps:
        print(s, flush=True)
        globals()[s]()
