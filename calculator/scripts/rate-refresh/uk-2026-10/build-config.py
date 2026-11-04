"""
UK rate book, October 2026 — assemble the dated config from the research files.

  python3 scripts/rate-refresh/uk-2026-10/build-config.py   # writes scripts/rate-refresh/2026-10-uk.json

The UK book is the BASE book: every other country is derived from it (× its factors), so fixing it fixes the scaled
countries too. Every figure here is a research item (key, value, URL, date copied from research/*.json) or arithmetic
on research items written out in `basis`. Methods as the India book (scripts/rate-refresh/india-2026-10/build-config.py):
direct / ladder (anchor × the book's own grade premium over its base) / floor (raised to metal or mill content) / held.

Machines ADDED after the frozen snapshot (3 Nov 2026): `machines.added` — the automatic green-sand moulding line and the
robotic fettling cell, from scripts/research/2026-11-report-standard/foundry-capex/data.json (see the block below); and
(review round, 4 Nov 2026) the twin-pallet HMC, until then hand-written in rate-library.ts. The CNC lathes have their own
capex group (`cnc-lathe`, a UK public award) — scripts/research/2026-11-review-round/data.json.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}
for f in ['labour-energy', 'machines-a', 'machines-b', 'materials-ferrous', 'materials-nonferrous', 'materials-polymer']:
    for it in json.load(open(os.path.join(HERE, 'research', f + '.json')))['items']:
        R[it['key']] = it
# round 30 Oct 2026 (scripts/rate-refresh/round-2026-10-30): UK public-contract awards for machines the book held
for rnd, f in [('round-2026-10-30', 'eu-capex-metal'), ('round-2026-10-30', 'eu-capex-plastics-composites'), ('round-2026-10-30', 'materials'),
               ('round-2026-10-30b', 'capex-machining-finishing'), ('round-2026-10-30b', 'capex-forming-casting')]:
    for it in json.load(open(os.path.join(HERE, '..', rnd, 'research', f + '.json')))['items']:
        if it.get('value') is not None or it['key'] not in R:   # a sourced round figure fills a key the first round left empty
            R[it['key']] = it
cur = json.load(open(os.path.join(HERE, 'current-uk-book.json')))
UK = {m['id']: m['gbpPerKg'] for m in cur['materials']}

def src(key):
    it = R[key]
    return {'research': key, 'source': it.get('source'), 'date': it.get('date')}
def v(key):
    return R[key]['value']

families = []
def fam(name, anchor, basis, sources, method, members, base=None, floor_at_anchor=False, confidence='Low', note='', proxies=None, scrap=None):
    families.append({'scrapGbpPerKg': scrap, 'scrapBasis': None if scrap is None else 'UK merchant No.1 old steel £125/t (letsrecycle, Jul 2026; turnings were not priced) — the book\'s £0.28 credit was above the new charge price','family': name, 'anchorGbpPerKg': round(anchor, 4), 'anchorBasis': basis, 'sources': sources, 'method': method,
                     'base': base, 'floorAtAnchor': floor_at_anchor, 'members': members, 'confidence': confidence, 'note': note,
                     'proxies': proxies or {}})

# ── FERROUS ───────────────────────────────────────────────────────────────────
CR = v('ferrous.anchor.crc_hdg_eu_mill_base_delivered')
fam('CR coil (DC01 / DC04)', CR, 'ArcelorMittal Europe CRC base €880/t delivered (Oct 2026 contracts) × 0.859 = £0.756/kg',
    [src('ferrous.anchor.crc_hdg_eu_mill_base_delivered')], 'direct', ['mat-dc01', 'mat-dc04'], confidence='Medium',
    note='The book had DC01 £0.91 ABOVE the deeper-drawing DC04 £0.77.')
fam('CR automotive grades', CR, 'CR base £0.756 × the book\'s grade premium over its DC01/DC04 mean (£0.84); European grade extras not found',
    [src('ferrous.anchor.crc_hdg_eu_mill_base_delivered')], 'ladder',
    ['mat-dc05', 'mat-dc06', 'mat-if-dx56', 'mat-if-hs260', 'mat-bh260', 'mat-greensteel-dc01', 'mat-hsla340', 'mat-hsla420', 'mat-hsla550',
     'mat-dp600', 'mat-dp780', 'mat-dp980', 'mat-dp1000', 'mat-trip780', 'mat-cp800', 'mat-ms1200', 'mat-ms1300', 'mat-ms1500', 'mat-qp980',
     'mat-medmn1180', 'mat-22mnb5', 'mat-usibor1500', 'mat-usibor2000', 'mat-c67s-spring'], base=0.84, floor_at_anchor=True)
fam('Coated sheet', CR, 'ArcelorMittal Europe HDG base €880/t delivered = £0.756/kg (Tata UK HRC £620 + HDG uplift ~£145/t agrees) × the book\'s premium over DC01 GI',
    [src('ferrous.anchor.crc_hdg_eu_mill_base_delivered'), src('ferrous.anchor.hrc_uk_tata_ddp')], 'ladder',
    ['mat-dc01-gi', 'mat-dc03-ga', 'mat-dc01-ze', 'mat-znni-eg', 'mat-zm-coated', 'mat-tinplate-etp'], base=UK['mat-dc01-gi'], floor_at_anchor=True, confidence='Medium')
SS304 = (v('ferrous.anchor.stainless.crc304_may_deliv_transaction') + v('ferrous.anchor.stainless.crc304_jul_offer') + v('ferrous.anchor.stainless.crc304_mill_target_endQ3')) / 3
s304 = v('ferrous.extra.stainless.outokumpu_eu_alloy_surcharge.304.2026-05'); s316 = v('ferrous.extra.stainless.outokumpu_eu_alloy_surcharge.316L.2026-05'); s430 = v('ferrous.extra.stainless.outokumpu_eu_alloy_surcharge.430.2026-05')
fam('304L sheet', SS304, f'European 304 CRC effective price (incl. alloy surcharge) delivered: May €2,560 / Jul €2,700 / end-Q3 target €2,900 per t × 0.859 — mean £{SS304:.3f}/kg (mill coil)',
    [src('ferrous.anchor.stainless.crc304_may_deliv_transaction'), src('ferrous.anchor.stainless.crc304_mill_target_endQ3')], 'direct', ['mat-ss304-sheet'], confidence='Medium')
fam('316L sheet', SS304 + s316 - s304, f'304 CRC £{SS304:.3f} + (Outokumpu May 2026 surcharge 316L £{s316:.2f} − 304 £{s304:.2f}) — same base assumed (derived)',
    [src('ferrous.extra.stainless.outokumpu_eu_alloy_surcharge.316L.2026-05')], 'direct', ['mat-ss316-sheet'])
fam('Ferritic sheet (430 / 409L / 441)', SS304 + s430 - s304, f'304 CRC £{SS304:.3f} + (surcharge 430 £{s430:.2f} − 304 £{s304:.2f}) — same base assumed (derived); 409L / 441 at the book\'s premium over 430',
    [src('ferrous.extra.stainless.outokumpu_eu_alloy_surcharge.430.2026-05')], 'ladder', ['mat-aisi430', 'mat-ss409l-sheet', 'mat-ss441-sheet'], base=UK['mat-aisi430'])
# Foundry charge (the casting engine adds melt energy, labour, loss, line, fettling, overhead and margin)
# Melt loss on the charge (round 30 Oct 2026): the casting engine loses metal only on the REMELTED gating (casting.ts
# metalLostKg); the loss on the part's own metal belongs in the charge price — the Poland, Germany and Hungary books
# divide by (1 − loss) and the UK did not. Iron 2 %, steel 4 % (the same engineering-typical losses those books use).
IRON_LOSS, STEEL_LOSS = 0.98, 0.96
GJS = round(v('ferrous.charge.GJS-500-7') / IRON_LOSS, 4); GJL = round(v('ferrous.charge.GJL-250') / IRON_LOSS, 4)
WCB = round(v('ferrous.charge.GS-C25_WCB') / STEEL_LOSS, 4); CF8 = v('ferrous.charge.CF8')
fam('Ductile / CGI / ADI / SiMo iron (charge)', GJS, f'Treated-metal charge for GJS-500-7 £{GJS}/kg: (50% Brazilian pig iron (CFR Italy $520/t) + 50% UK 0A scrap (letsrecycle Jul 2026) + 1.2% FeSiMg (EU import value) + inoculant) ÷ 0.98 melt loss (engineering-typical, as the PL / DE / HU books) — + the book\'s grade premium over GJS-500-7 in £/kg (alloy content — Mo, Ni, Cu — and, for ADI, the austempering the casting engine does not add separately)',
    [src('ferrous.charge.GJS-500-7'), src('ferrous.anchor.pig_iron_brazil_cfr_italy'), src('ferrous.anchor.scrap_uk_0A_plate_girder'), src('ferrous.anchor.fesimg_eu_import_unit_value')], 'ladder-add',
    ['mat-gjs500', 'mat-gjs400', 'mat-gjs450-ssf', 'mat-gjs500-14', 'mat-gjs600', 'mat-gjs700', 'mat-gjs350-lt', 'mat-simo', 'mat-adi', 'mat-gjv450', 'mat-gjv500'], base=UK['mat-gjs500'])
fam('Grey / malleable iron (charge)', GJL, f'Bought metallics for GJL-250 £{GJL}/kg: (60% cast-iron scrap + 25% steel scrap + 15% pig iron — textbook mix; UK letsrecycle scrap, Brazilian pig iron) ÷ 0.98 melt loss (engineering-typical)',
    [src('ferrous.charge.GJL-250'), src('ferrous.anchor.scrap_uk_9_10_cast')], 'ladder', ['mat-gjl250', 'mat-gjl150', 'mat-gjl200', 'mat-gjl300', 'mat-gjl350', 'mat-gjmb350'], base=UK['mat-gjl250'])
fam('Cast carbon / low-alloy steel (charge)', WCB, f'Steel-foundry charge £{WCB}/kg: UK 0A plate & girder scrap £142.5/t ÷ 0.96 melt loss (engineering-typical, as the PL / DE / HU books; Mn/Si trim not priced) + the book\'s grade premium in £/kg (Cr–Mo content)',
    [src('ferrous.charge.GS-C25_WCB'), src('ferrous.anchor.scrap_uk_0A_plate_girder')], 'ladder-add', ['mat-gs-c25', 'mat-astm-a216-wcb', 'mat-g20mn5', 'mat-g42crmo4'], base=UK['mat-gs-c25'], scrap=v('ferrous.anchor.scrap_uk_no1_old_steel'))
fam('Cast stainless (charge)', CF8, f'CF8 virgin-units charge £{CF8}/kg (Ni 9.5% at LME, Cr 19.5% via ferrochrome benchmark, Fe units) — an upper bound (scrap-based melting is cheaper) — + the book\'s grade premium in £/kg (Mo / Ni / Cr content: CF8M is CF8 + the 316-v-304 surcharge)',
    [src('ferrous.charge.CF8'), src('ferrous.anchor.nickel_lme_cash'), src('ferrous.anchor.ferrochrome_eu_benchmark_q3')], 'ladder-add',
    ['mat-ss304-cast', 'mat-cf8m-cast', 'mat-ca6nm-cast', 'mat-cd4mcun-cast', 'mat-gx40crnisi25-20', 'mat-17-4ph-cast'], base=UK['mat-ss304-cast'])
NI = v('ferrous.anchor.nickel_lme_cash'); CR_C = v('ferrous.anchor.ferrochrome_eu_benchmark_q3'); FESI = v('ferrous.anchor.fesi75_ddp_nwe')
d2 = 0.20 * NI + 0.02 * CR_C + 0.78 * GJS
d5 = 0.35 * NI + 0.02 * CR_C + 0.04 * FESI + 0.59 * GJS
fam('Ni-Resist D-2 (charge)', d2, f'0.20 × Ni £{NI:.3f} + 0.02 × Cr £{CR_C:.3f} (contained) + 0.78 × ductile charge £{GJS}', [src('ferrous.anchor.nickel_lme_cash')], 'direct', ['mat-ni-resist-d2'])
fam('Ni-Resist D-5S (charge)', d5, f'0.35 × Ni + 0.02 × Cr + 0.04 kg FeSi75 £{FESI:.3f} + 0.59 × ductile charge', [src('ferrous.anchor.nickel_lme_cash')], 'direct', ['mat-ni-resist-d5s'])
hicr = 0.23 * CR_C + 0.77 * GJL
fam('High-Cr white iron (charge)', hicr, f'0.23 × Cr £{CR_C:.3f} (contained) + 0.77 × grey-iron charge £{GJL}', [src('ferrous.anchor.ferrochrome_eu_benchmark_q3')], 'direct', ['mat-hicr-white'])

# ── NON-FERROUS ───────────────────────────────────────────────────────────────
DIN = v('nonferrous.anchor.al_secondary_din226_delivered_europe')
fam('Secondary cast aluminium (ingot)', DIN, 'Fastmarkets pressure-diecasting ingot DIN226 / A380 delivered Europe €2,430–2,530/t (Jan 2026 — the latest found; STALE) — the secondary (scrap-based) Al-Si-Cu alloys; × the book\'s premium over ADC12',
    [src('nonferrous.anchor.al_secondary_din226_delivered_europe')], 'ladder',
    ['mat-adc12', 'mat-a380', 'mat-a413', 'mat-a319', 'mat-lm4', 'mat-en-ac-46200'], base=UK['mat-adc12'])
P1020 = v('nonferrous.anchor.al_p1020_dp_rotterdam_allin')
fam('Primary-based cast aluminium (floor)', P1020, 'P1020 primary aluminium duty-paid Rotterdam all-in (LME cash + DP premium, Oct 2026) — the primary-based alloys (A356/A357, AlSi7/10Mg, structural HPDC, A206, LM13) cannot sit below the primary metal they are made from; the book\'s prices above it are held (alloy-ingot premiums not found)',
    [src('nonferrous.anchor.al_lme_cash'), src('nonferrous.anchor.al_rotterdam_dp_premium')], 'floor',
    ['mat-alsi10mg', 'mat-a365', 'mat-a390', 'mat-a357', 'mat-lm25', 'mat-lm6', 'mat-almg5-cast', 'mat-a206', 'mat-en-ac-45300', 'mat-lm13',
     'mat-aural5', 'mat-silafont36', 'mat-castasil37', 'mat-magsimal59', 'mat-al-hpdc-lowco2', 'mat-htf-gigacast'], confidence='Medium')
fam('Secondary ADC12 (ingot)', DIN, 'DIN226 / A380 secondary ingot (Fastmarkets, Jan 2026)', [src('nonferrous.anchor.al_secondary_din226_delivered_europe')], 'direct', ['mat-adc12-secondary'])
CU = v('nonferrous.anchor.cu_cathode_delivered_derived')
fam('ETP copper bar / sheet (floor)', CU, 'LME copper $14,568.72/t (8 Oct 2026) + Aurubis 2026 premium $315/t = £11.24/kg — the book\'s bar £11.05 and sheet £10.77 were below the metal; conversion premium not found',
    [src('nonferrous.anchor.cu_cathode_delivered_derived'), src('nonferrous.anchor.cu_lme')], 'floor', ['mat-c101-bar', 'mat-c110-copper'], confidence='Medium')
BR = v('nonferrous.anchor.brass_rod_cw614n_cw617n_mill')
fam('Brass rod (mill list)', BR, 'Almag (Italian brass-rod mill) published CW614N–CW617N rod price €9,990/t on 9 Oct 2026 = £8.48/kg',
    [src('nonferrous.anchor.brass_rod_cw614n_cw617n_mill')], 'direct', ['mat-brass-cz121', 'mat-brass-cz122-forge'], confidence='Medium')
SN = v('nonferrous.anchor.sn_lme_spot')
pb1 = 0.89 * (CU) + 0.105 * SN
fam('Phosphor bronze PB1 (floor)', pb1, f'Metal content 0.89 × Cu £{CU:.2f} + 0.105 × Sn £{SN:.2f} (LME tin, Aug 2026) — the book\'s £13.91 was below it',
    [src('nonferrous.anchor.sn_lme_spot'), src('nonferrous.anchor.cu_cathode_delivered_derived')], 'floor', ['mat-bronze-pb1'])

# ── POLYMERS / RUBBER ─────────────────────────────────────────────────────────
PVC = (v('polymer.anchor.pvc_s_gross_contract_nwe') + v('polymer.anchor.pvc_index_europe_ba')) / 2
fam('Rigid PVC (floor at the resin)', PVC, 'S-PVC NW Europe gross contract £1.096 and Business Analytiq Europe index £1.131 (Sep 2026) — mean; the book\'s rigid grades (£0.76–0.85) were below the resin they are made of',
    [src('polymer.anchor.pvc_s_gross_contract_nwe'), src('polymer.anchor.pvc_index_europe_ba')], 'floor', ['mat-upvc', 'mat-pvc-bm', 'mat-upvc-pipe'], confidence='Medium')
fam('PA6 unfilled', v('polymer.anchor.pa6_index_europe_ba'), 'Business Analytiq PA6 Europe index (Sep 2026) — one source',
    [src('polymer.anchor.pa6_index_europe_ba')], 'direct', ['mat-pa6', 'mat-pa6-ext-tube'])
fam('PA66 unfilled', v('polymer.anchor.pa66_index_europe_ba'), 'Business Analytiq PA66 Europe index (Sep 2026) — one source',
    [src('polymer.anchor.pa66_index_europe_ba')], 'direct', ['mat-pa66'])
fam('Natural rubber (floor)', v('rubber.nr_tsr20_sgx'), 'SGX TSR20 (Oct 2026) — the book\'s SMR20 £1.84 was below the exchange price before freight',
    [src('rubber.nr_tsr20_sgx')], 'floor', ['mat-nr'])

held = {
    'HR / HRPO / structural HR, carbon & alloy bar, forging stock': 'NW Europe HRC £0.61–0.66/kg, Tata UK £0.62; the book\'s HRPO £0.77 / S355MC £0.80 are not contradicted (pickling / grade extras); no UK bar or SBQ base price found (only alloy surcharges) — held',
    'electrical steel': 'Only EU GOES safeguard floors (£2.41–3.01/kg; the book\'s GO grades sit inside) and an unspecified IMARC figure — held',
    'wrought aluminium sheet / bar / forging stock, aluminium billet': 'P1020 duty-paid Rotterdam £2.79/kg; the book\'s wrought grades are above it; conversion premiums not found; 6063 billet £3.27 v LME + billet premium £3.20 — consistent; held',
    'zinc, magnesium, titanium, nickel alloys': 'LME zinc £2.85 under Zamak £3.19 (consistent); Mg China FOB £1.70 v AZ91D £3.81 — likely high but no European alloy price found; Ti / Ni mill prices not found — held',
    'brass sheet, gunmetal, aluminium bronze, tin bronze, winding wire': 'Consistent with the metal content or no mill price found — held',
    'PP, PE, PS, ABS, PC, PET and the engineering polymers without an anchor': 'NW Europe spot (PP £1.02, HDPE £0.97, LDPE £1.09) to index (PP £1.47, HDPE £1.30) spans the book (PP £0.99, HDPE £1.05); ABS £1.64 v book £1.62; PC £2.21 v £2.52 (one source); held',
    'filled / FR compounds, rubber compounds, composites, paint, masterbatch': 'No European compound / paint / composite price found — held',
}

# ── LABOUR ────────────────────────────────────────────────────────────────────
def lab(role):
    key = f'labour.{role}.fullyLoadedGbpPerHr'
    return {'gbpPerHr': v(key), 'basis': R[key]['basis'], 'source': R[f'labour.{role}.hourlyGross']['source'] if f'labour.{role}.hourlyGross' in R else R[key].get('source'), 'research': key}
def supervisor_p75():
    # The research's own caveat: SOC 8160 is all-industry; an automotive tier-1 shift supervisor sits nearer the p75
    # (£41,444/yr). Loaded exactly as the median was (uprate, 2-shift premium, NIC above £5,000, pension, levy).
    hr = 41444 / (39 * 52) * v('labour.oncost.wageUprateApr2025ToOct2026')
    gross = hr * 2028 * (1 + v('labour.oncost.shiftPremium2Shift'))
    cost = gross + v('labour.oncost.employerNicRate') * (gross - v('labour.oncost.employerNicSecondaryThresholdGbpPerYr')) \
        + v('labour.oncost.pensionTypical') * gross + v('labour.oncost.apprenticeshipLevy') * gross
    rate = round(cost / v('labour.productiveHoursPerYear'), 2)
    return {'gbpPerHr': rate, 'research': 'labour.supervisor.hourlyGross',
            'source': R['labour.supervisor.hourlyGross']['source'],
            'basis': f"ASHE 2025 SOC 8160 p75 £41,444/yr (the research's note: an automotive tier-1 shift supervisor sits nearer the p75 than the all-industry median £34,684) ÷ 2,028 h × 1.053 = £{hr:.2f}/h; × 2,028 h × 1.18 shift = £{gross:,.0f}; + NIC 15% above £5,000 + pension 5% + levy 0.5% = £{cost:,.0f} ÷ 1,773.4 h = £{rate}/h"}
labour = {
    'categories': {**{c: lab(c) for c in ['skilled', 'semiskilled', 'engineer', 'foundry', 'electronics', 'inspector', 'technician']}, 'supervisor': supervisor_p75()},
    'grades': {'forge': lab('forge'), 'furnace': lab('furnace'), 'blow': lab('blow'), 'roto': lab('roto'), 'thermoform': lab('thermoform'), 'trim-router': lab('trimRouter')},
    'loadingIncluded': 'ASHE 2025 median ×1.053 (ONS regular pay growth) → 2-shift premium 18% (IDR 2025), employer NIC 15% above £5,000 (2026/27), pension 5% (IFS), Apprenticeship Levy 0.5%; 1,773 productive h/yr (39 h × 52 − 28 days − 2.0% sickness)',
}

# ── ENERGY ────────────────────────────────────────────────────────────────────
ccl = v('energy.cclMainRate') / 100
energy = {'electricityGbpPerKwh': round(v('energy.electricity.manufacturingAvg') / 100 + ccl, 4), 'gasGbpPerKwh': round(v('energy.gas.manufacturingAvg') / 100 + ccl, 4),
          'basis': 'DESNZ Quarterly Energy Prices (Sep 2026): manufacturing-sector average Q2 2026 electricity 17.4 p/kWh, gas 3.8 p/kWh, + Climate Change Levy 0.801 p/kWh (from 1 Apr 2026) — CCL added because the release could not be confirmed to include it (if it does, these are 0.8 p high)',
          'sources': [src('energy.electricity.manufacturingAvg'), src('energy.gas.manufacturingAvg'), src('energy.cclMainRate')]}

# ── REVIEW ROUND (4 Nov 2026): the CNC lathe and the twin-pallet HMC ─────────
# scripts/research/2026-11-review-round/data.json (each row: value, currency, year, scope, URL, quote, grade). The lathe's
# capex is a UK public award (row T4, grade A, sterling); the HMC has no new price anywhere (rows H1 / H3: a used floor and
# an unsized award), so its £300,000 is an ESTIMATE between them and says so. Hours are NOT changed: the lathe keeps the
# book's 4,000 h × 0.80, the HMC its three-shift 6,000 h × 0.80 — the research notes capex and hours are chosen together.
RV = {r['id']: r for r in json.load(open(os.path.join(HERE, '..', '..', 'research', '2026-11-review-round', 'data.json')))}
T4, H1, H3 = RV['T4'], RV['H1'], RV['H3']
assert T4['currency'] == 'GBP' and T4['value_num'] == 135041, T4['value_num']
assert round(H1['gbp_at_book_fx']) == 187722 and round(H3['gbp_at_book_fx']) == 351192
_snapm = {m['id']: m for m in cur['machines']}
def _implied_kw(mid):   # the snapshot's running load, kW (energy ÷ running hours ÷ the snapshot tariff)
    b = _snapm[mid]['buildup']
    return b['energy'] / (b['annualAvailableHours'] * b['machineUtilization'] * cur['regional']['energy']['electricityPerKwh'])
LATHE_GROUP = {
    'id': 'cnc-lathe', 'match': '^(mach-lathe-cnc|mach-mazak-qt200)$', 'refId': 'mach-lathe-cnc', 'refCapexGbp': T4['value_num'],
    # the lathe keeps the draw it had in the cnc-3axis group: no lathe draw was sourced
    'refKw': round(10.0 * _implied_kw('mach-lathe-cnc') / _implied_kw('mach-haas-vf2'), 3),
    'kwBasis': 'no lathe draw sourced — the machining-centre mean 10 kW (7.4 kW finishing – 13 kW roughing, maker study) × the book\'s running-load ratio lathe ÷ VF-2, as before',
    'basis': (f"UK public award: Yamazaki Mazak UK, UKRI-4318 'CNC Lathe machine' £{T4['value_num']:,} (Nov 2024, Contracts Finder; supply — "
              "no bar feeder or gantry loader stated); other UK awards: Mazak NPL £147,330 and Aston 'Quickturn' £113,000 (2020), "
              "Doosan via Mills CNC £92,901 (2023) and £89,711 (2018), a Haas ST-15 toolroom lathe £57,091 (2019); a US DLA turning centre "
              "with bar feeder US$219,379 = £164,736 (2023). Hours held at the book's convention (the lathe 4,000 h × 0.80): a production "
              "lathe at 200,000 a year may run three shifts, which would lower the rate — capex and hours are chosen together, and the "
              "hours were not changed with this capex"),
    'research': 'review-round T4', 'source': f"{T4['source']} — {T4['url']} (read {T4['date']})", 'confidence': 'Medium',
}
HMC_ADDED = {
    'id': 'mach-hmc-400', 'class': 'Horizontal machining centre — 400 mm twin pallet, 4th axis (production cell)',
    'after': 'mach-haas-vf2', 'added': '2026-10-30',
    'capexGbp': 300000,
    'capexBasis': (f"ESTIMATE (review round, 4 Nov 2026) — no new list price or award for a named 400 mm twin-pallet HMC was found (the Haas EC-400 price page "
                   f"returned HTTP 403, not bypassed): the floor is a USED Okuma MB-4000H (2021, 400 mm, 2-station APC) asked at "
                   f"US${H1['value_num']:,} = £{round(H1['gbp_at_book_fx']):,} (The Equipment Hub listing, read 2026-11-04 — a new machine costs more); "
                   f"a US DLA award for an unsized 'horizontal machining center' was US${H3['value_num']:,.0f} = £{round(H3['gbp_at_book_fx']):,} "
                   "(2023, model, pallet size and options not in the record); £300,000 is taken between the used floor and the unsized "
                   "award (CostVision judgement — replace with a dealer quote). It was £185,000 (2019–2023 used EC-400 listings + 25 %), "
                   "below the used price of the machine whose pallet- and tool-change times the cycle model uses (Low confidence)"),
    'kwFixed': 13.0, 'kwBasis': 'measured machining-centre roughing mean 13 kW (maker study)',
    'floorFromMachine': 'mach-lathe-cnc', 'floorBasis': 'the floor of the book\'s lathe / 5-axis class, held — not sourced for this cell',
    'hours': 6000, 'utilisation': 0.80,
    'hoursBasis': 'a production cell runs three shifts, the economics of a pallet cell (the book\'s convention for a three-shift line, as the EV lines)',
    'altHours': 4000, 'altUtilisation': 0.50, 'altBasis': 'the book\'s job-shop VMC hours',
    'confidence': 'Low', 'source': f"{H1['source']} — {H1['url']} (read {H1['date']}); {H3['source']} — {H3['url']} (award {H3['date']})",
    'research': 'review-round H1 / H3',
}

# ── MACHINES ──────────────────────────────────────────────────────────────────
machines = {
    'lifeYears': v('life.cutting-machine-stationary'),
    'lifeBasis': 'German BMF AfA table, stationary cutting machines 13 yr (a published tax life, used as the economic-life proxy; no UK table found)',
    'maintenancePctOfCapex': 0.03, 'maintenanceBasis': 'machine-hour-rate worked example: 3% of purchase price a year (no UK norm found)',
    'indirectPctOfCapex': 0.05, 'indirectBasis': 'the library\'s own line build-up rule (5% of capex)',
    'financeRate': 0.04, 'financeBasis': 'the library\'s own line build-up rule (4% on half the capex) — a current UK asset-finance rate was not researched',
    'groups': [
        # The CNC lathes have their own group since the review round (4 Nov 2026) — the VF-2 mill scaled to a lathe gave
        # £56,004, below every production-lathe award found (scripts/research/2026-11-review-round, rows T1–T4).
        LATHE_GROUP,
        {'id': 'cnc-3axis', 'match': '^(mach-haas-vf2|mach-vmc3|mach-drill)$', 'refId': 'mach-haas-vf2', 'refCapexGbp': v('capex.mach-haas-vf2'),
         'refKw': 10.0, 'kwBasis': 'measured machining-centre mean draw 7.4 kW finishing – 13 kW roughing (maker study) — midpoint 10 kW',
         'basis': 'Haas VF-2 US list $70,995 (2026) = £53,204, base machine (options, tooling and installation not included)', 'research': 'capex.mach-haas-vf2', 'source': R['capex.mach-haas-vf2']['source'], 'confidence': 'Medium'},
        {'id': 'cnc-5axis', 'match': '^(mach-haas-umc500|mach-vmc5|mach-dmg-dmu50)$', 'refId': 'mach-haas-umc500', 'refCapexGbp': v('capex.mach-haas-umc500'),
         'refKw': 13.0, 'kwBasis': 'measured machining-centre roughing mean 13 kW',
         'basis': 'Haas UMC-500 UK price £126,275 (2019 trade press — the only sterling figure; older)', 'research': 'capex.mach-haas-umc500', 'source': R['capex.mach-haas-umc500']['source'], 'confidence': 'Low'},
        # (the twin-pallet HMC is not in the frozen snapshot, so a group never reached it: it is built under `machines.added`)
        {'id': 'fibre-laser', 'match': '^(laser-trumpf-3030|laser-trumpf-5030|laser-bystronic-3015|laser-amada-ensis-3015)$', 'refId': 'laser-trumpf-3030', 'refCapexGbp': v('capex.laser-trumpf-3030'),
         'refKw': v('kw.fibre-laser-6kw'), 'kwBasis': 'maker worked example: 6 kW fibre laser ~22 kW average',
         'basis': 'TruLaser 3030 6 kW fibre: third-party estimate $400–550k = £374,700 midpoint (Trumpf publishes no list price)', 'research': 'capex.laser-trumpf-3030', 'source': R['capex.laser-trumpf-3030']['source'], 'confidence': 'Low'},
        {'id': 'robot-mig', 'match': '^robot-mig-cell$', 'refId': 'robot-mig-cell', 'refCapexGbp': (80000 + 250000) / 2,
         'refKw': None, 'kwBasis': 'no sourced draw — the book\'s own running load kept',
         'basis': 'UK integrator band for a single-robot welding cell £80,000–250,000 (Phoenix Robotic; Robot Store gives £65,000–120,000+ for a full system) — midpoint £165,000', 'research': 'capex.robot-mig-cell', 'source': R['capex.robot-mig-cell']['source'], 'confidence': 'Low'},
        # round 30 Oct 2026 — UK public-contract awards (find-tender / Contracts Finder, read from search results: verify)
        {'id': 'press-brake', 'match': '^brake-', 'refId': 'brake-amada-hfe100', 'refCapexGbp': v('capex.brake-amada-hfe100'),
         'refKw': None, 'kwBasis': 'no sourced draw — the book\'s own running load kept',
         'basis': 'Amada UK press brake, Ministry of Justice award £120,000 ex-VAT (Feb 2026; a second award £112,500; tonnage not stated) — TRUMPF TruBend 3100 new €136,000 (≈ £116,800) agrees; the other brakes sized by the book\'s relative capital',
         'research': 'capex.brake-amada-hfe100', 'source': R['capex.brake-amada-hfe100']['source'], 'confidence': 'Medium'},
        {'id': 'autoclave', 'match': '^autoclave-1200mm$', 'refId': 'autoclave-1200mm', 'refCapexGbp': v('capex.autoclave-1200mm'),
         'refKw': None, 'kwBasis': 'no sourced draw — the book\'s own running load kept',
         'basis': 'ASC Process Systems autoclave moulding facility, University of Bristol award £333,765 ex-VAT (Jul 2023) — a smaller (~1.0 × 1.5 m), hotter (400 °C) vessel than the 1.2 × 3 m library unit, installation likely included; a 3 × 6 m vessel was estimated at £730k (QUB, 2025)',
         'research': 'capex.autoclave-1200mm', 'source': R['capex.autoclave-1200mm']['source'], 'confidence': 'Low'},
        # round 30 Oct 2026 (b) — UK public-contract awards for two more held families (read from search results: verify)
        {'id': 'turret-punch', 'match': '^punch-', 'refId': 'punch-amada-emz3610', 'refCapexGbp': v('capex.punch-amada-emz3610'),
         'refKw': None, 'kwBasis': 'no sourced draw — the book\'s own running load kept',
         'basis': 'Amada UK CNC punch press, HM Prison & Probation Service framework award £230,000 (Jan 2020; model not named — a 30 t-class turret; delivery / installation may be included); the TruPunch sized by the book\'s relative capital',
         'research': 'capex.punch-amada-emz3610', 'source': R['capex.punch-amada-emz3610']['source'], 'confidence': 'Low'},
        {'id': 'gravity-die', 'match': '^grav-die-cast-std$', 'refId': 'grav-die-cast-std', 'refCapexGbp': v('capex.grav-die-cast-std'),
         'refKw': None, 'kwBasis': 'no sourced draw — the book\'s own running load kept',
         'basis': 'Tecnofond tilting gravity die-casting system for aluminium, Brunel University award £82,769 (Mar 2017; a research cell, no escalation applied; die / furnace inclusions not shown)',
         'research': 'capex.grav-die-cast-std', 'source': R['capex.grav-die-cast-std']['source'], 'confidence': 'Low'},
        {'id': 'rtm-press', 'match': '^rtm-press-std$', 'refId': 'rtm-press-std', 'refCapexGbp': round((230000 + 120745) / 2),
         'refKw': None, 'kwBasis': 'no sourced draw — the book\'s own running load kept',
         'basis': 'Langzauner hydraulic composites presses, UK university awards £230,000 installed (2020) and £120,745 (2021), tonnage not stated, press only — midpoint £175,373',
         'research': 'capex.rtm-press-std', 'source': R['capex.rtm-press-std']['source'], 'confidence': 'Low'},
    ],
    'notRebuilt': 'capex not sourced (or the book agrees with the evidence: IMM 800–2,000 t, HPDC 1,600 t, SMT lines): capital held; energy re-priced at the new UK tariff',
}

# ── MACHINES ADDED (foundry at volume, 3 Nov 2026) ───────────────────────────
# Two machines the book did not have, from scripts/research/2026-11-report-standard/foundry-capex/data.json (each row:
# value, currency, year, scope, URL, quote). Built by scripts/uk-book.ts with the SAME capital method as the groups
# above (life, maintenance, indirect, finance); their running load and floor are another book machine's, said so.
# Hours: the UK book's convention for a three-shift production line — 6,000 h × 0.80 (mach-hmc-400 and the EV lines;
# CONTINUOUS_UK_HOURS = 6,000 in src/engine/country-books.ts marks such a line for the country books). Not a foundry
# source: the only published running pattern is one DISAMATIC C3-350 run 24/7 at ≈ 6,400 rated-speed h/yr (foundry-capex
# row H1). The research shows the hours move a line rate about 2× (3,500 h × 0.75 v 6,066 h × 0.83), so the note prints
# the rate at the book's semi-automatic sand line's 3,500 h × 0.75 beside it.
FC = {r['id']: r for r in json.load(open(os.path.join(HERE, '..', '..', 'research', '2026-11-report-standard', 'foundry-capex', 'data.json')))}
BOOK_FX = {'EUR': 1.1965, 'PLN': 5.096}   # REGIONAL_DATA.fxToGBP (2026-10 display FX) — the research's own conversion

def capex_gbp(row_id):
    r = FC[row_id]
    gbp = round(r['value_num'] / BOOK_FX[r['currency']])
    assert abs(gbp - r['gbp_at_book_fx']) <= 1, (row_id, gbp, r['gbp_at_book_fx'])
    return gbp

THREE_SHIFT = {'hours': 6000, 'utilisation': 0.80,
               'hoursBasis': 'the UK book\'s convention for a three-shift production line (as its twin-pallet machining cell and the EV lines; the book treats 6,000 h or more as a continuous line) — NOT a foundry-specific source; one published DISAMATIC C3-350 ran 24/7 at ≈ 6,400 rated-speed h/yr (Deshan, 2022)',
               'altHours': 3500, 'altUtilisation': 0.75, 'altBasis': 'the book\'s semi-automatic sand line\'s hours'}
L2 = FC['L2']; F1 = FC['F1']
machines['added'] = [
    {'id': 'sand-auto-vertical-line', 'class': 'Automatic vertical green-sand moulding line (DISAMATIC 270 class, moulding equipment only)',
     'after': 'sand-cast-line', 'added': '2026-11-03',
     'capexGbp': capex_gbp('L2'),
     'capexBasis': f"Dovre (BE) investment in DISA moulding equipment, a DISAMATIC 270-A replacing a DISAMATIC 2070, €{L2['value_num']:,} ({L2['year']} money, NOT escalated — the library has no escalation rule) ÷ €{BOOK_FX['EUR']}/£ (book FX); scope: the moulding equipment only — the foundry kept its DISA sand plant, and melting, pouring automation and the building are not in it; a maker's press release quoting the buyer, one data point (Medium–Low confidence)",
     'kwFromMachine': 'sand-cast-line', 'kwBasis': 'no sourced draw — the running load of the book\'s semi-automatic sand moulding line, not measured for this line',
     'floorFromMachine': 'sand-cast-line', 'floorBasis': 'the floor of the book\'s semi-automatic sand moulding line, held — not sourced for this line',
     **THREE_SHIFT, 'confidence': 'Low', 'source': f"{L2['source']} — {L2['url']} (read {L2['date']})", 'research': 'foundry-capex L2'},
    {'id': 'fettle-robot-cell', 'class': 'Robotic fettling / grinding cell (7-axis, iron castings)',
     'after': 'sand-auto-vertical-line', 'added': '2026-11-03',
     'capexGbp': capex_gbp('F1'),
     'capexBasis': f"KAW-MET iron foundry (PL) declared budget for a 7-axis robotic grinding-cleaning centre (Ø800 × 500 mm envelope, castings ≥ 40 kg), zł{F1['value_num']:,} net ({F1['year']}, a resolved EU-funds procedure, 3 bids; the winning price was not published) ÷ zł{BOOK_FX['PLN']}/£ (book FX); scope: the cell, three tool sets, installation, start-up, training and a 24-month warranty with service — part fixtures excluded; cross-check Sinto America US$300–500k (2019) (Low–Medium confidence)",
     'kwFixed': 30.0, 'kwBasis': 'the tender\'s ≤ 30 kW power limit — an upper bound on the draw, not a measured load',
     'floorFromMachine': 'robot-mig-cell', 'floorBasis': 'the floor of the book\'s single-robot welding cell, held — not sourced for this cell',
     **THREE_SHIFT, 'confidence': 'Low', 'source': f"{F1['source']} — {F1['url']} (read {F1['date']})", 'research': 'foundry-capex F1'},
    # review round (4 Nov 2026): the twin-pallet HMC was hand-written in rate-library.ts at £185,000; it is generated now
    HMC_ADDED,
]

cfg = {'asOf': '2026-10-10', 'label': 'UK rate book — automotive tier-1/2 (W Midlands / NE / NW), 2-shift', 'labour': labour, 'energy': energy,
       'machines': machines, 'materialFamilies': families, 'held': held}
json.dump(cfg, open(os.path.join(HERE, '..', '2026-10-uk.json'), 'w'), indent=1, ensure_ascii=False)
print(f'{len(families)} families, {sum(len(f["members"]) for f in families)} grades; energy £{energy["electricityGbpPerKwh"]} / £{energy["gasGbpPerKwh"]}')
