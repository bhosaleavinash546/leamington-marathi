"""
UK rate book, October 2026 — assemble the dated config from the research files.

  python3 scripts/rate-refresh/uk-2026-10/build-config.py   # writes scripts/rate-refresh/2026-10-uk.json

The UK book is the BASE book: every other country is derived from it (× its factors), so fixing it fixes the scaled
countries too. Every figure here is a research item (key, value, URL, date copied from research/*.json) or arithmetic
on research items written out in `basis`. Methods as the India book (scripts/rate-refresh/india-2026-10/build-config.py):
direct / ladder (anchor × the book's own grade premium over its base) / floor (raised to metal or mill content) / held.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}
for f in ['labour-energy', 'machines-a', 'machines-b', 'materials-ferrous', 'materials-nonferrous', 'materials-polymer']:
    for it in json.load(open(os.path.join(HERE, 'research', f + '.json')))['items']:
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
GJS = v('ferrous.charge.GJS-500-7'); GJL = v('ferrous.charge.GJL-250'); WCB = v('ferrous.charge.GS-C25_WCB'); CF8 = v('ferrous.charge.CF8')
fam('Ductile / CGI / ADI / SiMo iron (charge)', GJS, f'Treated-metal charge for GJS-500-7 £{GJS}/kg: 50% Brazilian pig iron (CFR Italy $520/t) + 50% UK 0A scrap (letsrecycle Jul 2026) + 1.2% FeSiMg (EU import value) + inoculant — + the book\'s grade premium over GJS-500-7 in £/kg (alloy content — Mo, Ni, Cu — and, for ADI, the austempering the casting engine does not add separately)',
    [src('ferrous.charge.GJS-500-7'), src('ferrous.anchor.pig_iron_brazil_cfr_italy'), src('ferrous.anchor.scrap_uk_0A_plate_girder'), src('ferrous.anchor.fesimg_eu_import_unit_value')], 'ladder-add',
    ['mat-gjs500', 'mat-gjs400', 'mat-gjs450-ssf', 'mat-gjs500-14', 'mat-gjs600', 'mat-gjs700', 'mat-gjs350-lt', 'mat-simo', 'mat-adi', 'mat-gjv450', 'mat-gjv500'], base=UK['mat-gjs500'])
fam('Grey / malleable iron (charge)', GJL, f'Bought metallics for GJL-250 £{GJL}/kg: 60% cast-iron scrap + 25% steel scrap + 15% pig iron (textbook mix; UK letsrecycle scrap, Brazilian pig iron)',
    [src('ferrous.charge.GJL-250'), src('ferrous.anchor.scrap_uk_9_10_cast')], 'ladder', ['mat-gjl250', 'mat-gjl150', 'mat-gjl200', 'mat-gjl300', 'mat-gjl350', 'mat-gjmb350'], base=UK['mat-gjl250'])
fam('Cast carbon / low-alloy steel (charge)', WCB, f'Steel-foundry charge £{WCB}/kg: UK 0A plate & girder scrap £142.5/t (Mn/Si trim not priced) + the book\'s grade premium in £/kg (Cr–Mo content)',
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

# ── MACHINES ──────────────────────────────────────────────────────────────────
machines = {
    'lifeYears': v('life.cutting-machine-stationary'),
    'lifeBasis': 'German BMF AfA table, stationary cutting machines 13 yr (a published tax life, used as the economic-life proxy; no UK table found)',
    'maintenancePctOfCapex': 0.03, 'maintenanceBasis': 'machine-hour-rate worked example: 3% of purchase price a year (no UK norm found)',
    'indirectPctOfCapex': 0.05, 'indirectBasis': 'the library\'s own line build-up rule (5% of capex)',
    'financeRate': 0.04, 'financeBasis': 'the library\'s own line build-up rule (4% on half the capex) — a current UK asset-finance rate was not researched',
    'groups': [
        {'id': 'cnc-3axis', 'match': '^(mach-haas-vf2|mach-vmc3|mach-lathe-cnc|mach-mazak-qt200|mach-drill)$', 'refId': 'mach-haas-vf2', 'refCapexGbp': v('capex.mach-haas-vf2'),
         'refKw': 10.0, 'kwBasis': 'measured machining-centre mean draw 7.4 kW finishing – 13 kW roughing (maker study) — midpoint 10 kW',
         'basis': 'Haas VF-2 US list $70,995 (2026) = £53,204, base machine (options, tooling and installation not included)', 'research': 'capex.mach-haas-vf2', 'source': R['capex.mach-haas-vf2']['source'], 'confidence': 'Medium'},
        {'id': 'cnc-5axis', 'match': '^(mach-haas-umc500|mach-vmc5|mach-dmg-dmu50)$', 'refId': 'mach-haas-umc500', 'refCapexGbp': v('capex.mach-haas-umc500'),
         'refKw': 13.0, 'kwBasis': 'measured machining-centre roughing mean 13 kW',
         'basis': 'Haas UMC-500 UK price £126,275 (2019 trade press — the only sterling figure; older)', 'research': 'capex.mach-haas-umc500', 'source': R['capex.mach-haas-umc500']['source'], 'confidence': 'Low'},
        {'id': 'fibre-laser', 'match': '^(laser-trumpf-3030|laser-trumpf-5030|laser-bystronic-3015|laser-amada-ensis-3015)$', 'refId': 'laser-trumpf-3030', 'refCapexGbp': v('capex.laser-trumpf-3030'),
         'refKw': v('kw.fibre-laser-6kw'), 'kwBasis': 'maker worked example: 6 kW fibre laser ~22 kW average',
         'basis': 'TruLaser 3030 6 kW fibre: third-party estimate $400–550k = £374,700 midpoint (Trumpf publishes no list price)', 'research': 'capex.laser-trumpf-3030', 'source': R['capex.laser-trumpf-3030']['source'], 'confidence': 'Low'},
        {'id': 'robot-mig', 'match': '^robot-mig-cell$', 'refId': 'robot-mig-cell', 'refCapexGbp': (80000 + 250000) / 2,
         'refKw': None, 'kwBasis': 'no sourced draw — the book\'s own running load kept',
         'basis': 'UK integrator band for a single-robot welding cell £80,000–250,000 (Phoenix Robotic; Robot Store gives £65,000–120,000+ for a full system) — midpoint £165,000', 'research': 'capex.robot-mig-cell', 'source': R['capex.robot-mig-cell']['source'], 'confidence': 'Low'},
    ],
    'notRebuilt': 'capex not sourced (or the book agrees with the evidence: IMM 800–2,000 t, HPDC 1,600 t, SMT lines): capital held; energy re-priced at the new UK tariff',
}

cfg = {'asOf': '2026-10-10', 'label': 'UK rate book — automotive tier-1/2 (W Midlands / NE / NW), 2-shift', 'labour': labour, 'energy': energy,
       'machines': machines, 'materialFamilies': families, 'held': held}
json.dump(cfg, open(os.path.join(HERE, '..', '2026-10-uk.json'), 'w'), indent=1, ensure_ascii=False)
print(f'{len(families)} families, {sum(len(f["members"]) for f in families)} grades; energy £{energy["electricityGbpPerKwh"]} / £{energy["gasGbpPerKwh"]}')
