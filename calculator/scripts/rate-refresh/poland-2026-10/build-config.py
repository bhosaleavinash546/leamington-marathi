"""
Poland rate book, October 2026 — assemble the dated config from the research files.

  python3 scripts/rate-refresh/poland-2026-10/build-config.py   # writes scripts/rate-refresh/2026-10-poland.json
  npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-poland.json [--write]

Basis: an average of the four automotive supplier clusters (Silesia, Lower Silesia, Wielkopolska, Podkarpacie), three
8-hour shifts Monday–Friday, October 2026, PLN ex-VAT. Every figure is a research item (key, value, URL and date copied
from research/*.json) or arithmetic on research items written out in `basis`. Which grade follows which anchor, and how,
is the only judgement here; each family says what it is. Methods as the India and China books: direct / ladder (anchor ×
the frozen UK book's grade premium over its base) / ladder-add (anchor + that premium in £/kg at the book FX — alloy
content) / floor (raised to the metal content) / held.

Poland buys steel, aluminium, copper and polymers at European prices, so most anchors are European market prices
(NW / Central Europe) converted at the book's own FX; freight to a Polish plant is NOT added where the source is
ex-works or in-warehouse Rotterdam, and the family says so.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}
for f in ['labour-energy', 'machines', 'materials-ferrous', 'materials-nonferrous', 'materials-polymer']:
    for it in json.load(open(os.path.join(HERE, 'research', f + '.json')))['items']:
        R[it['key']] = it
# ladder bases are the FROZEN UK snapshot (the generator reads the same file)
UK = {m['id']: m['gbpPerKg'] for m in json.load(open(os.path.join(HERE, '..', 'uk-2026-10', 'current-uk-book.json')))['materials']}
FX = 5.096   # £1 = zł5.096 (REGIONAL_DATA.PL.fxToGBP), asserted by the generator; €1 = zł4.374, $1 = zł3.849 in the research

def src(key):
    it = R[key]
    return {'research': key, 'source': it.get('source'), 'date': it.get('date')}
def v(key):
    val = R[key]['value']
    if val is None: raise KeyError(f'{key} has no value')
    return val

families = []
def fam(name, anchor, basis, sources, method, members, base=None, floor_at_anchor=False, confidence='Low', note='', proxies=None):
    families.append({'family': name, 'anchorLocalPerKg': round(anchor, 3), 'anchorBasis': basis, 'sources': sources, 'method': method,
                     'base': base, 'floorAtAnchor': floor_at_anchor, 'members': members, 'confidence': confidence, 'note': note,
                     'proxies': proxies or {}})

# ── FERROUS (European flat-steel assessments, Polish distributor lists, alloy surcharges, scrap boards) ─────────────────
CR = v('ferrous.anchor.crc')
fam('CR coil (DC01 / DC04)', CR, 'NW Europe CRC €850–880/t ex-works (13 Sep 2026, as relayed by Tacto) = zł3.78/kg at zł4.374/€; freight to a Polish plant not added',
    [src('ferrous.anchor.crc')], 'direct', ['mat-dc01', 'mat-dc04'], confidence='Medium')
fam('CR automotive grades', CR, 'CR coil zł3.78 × the book\'s grade premium over its DC01/DC04 mean (£0.84); European AHSS / press-hardening extras not found',
    [src('ferrous.anchor.crc')], 'ladder',
    ['mat-dc05', 'mat-dc06', 'mat-if-dx56', 'mat-if-hs260', 'mat-bh260', 'mat-greensteel-dc01', 'mat-hsla340', 'mat-hsla420', 'mat-hsla550',
     'mat-dp600', 'mat-dp780', 'mat-dp980', 'mat-dp1000', 'mat-trip780', 'mat-cp800', 'mat-ms1200', 'mat-ms1300', 'mat-ms1500', 'mat-qp980',
     'mat-medmn1180', 'mat-22mnb5', 'mat-usibor1500', 'mat-usibor2000', 'mat-c67s-spring'], base=0.84, floor_at_anchor=True)
fam('HR structural', v('ferrous.anchor.hrc'), 'NW Europe HRC €745/t ex-works (Fastmarkets via Eurometal, 6 Oct 2026) = zł3.26/kg (Polish distributor index PUDS St3S sheet zł3.43, w/e 28 Sep, agrees) × the book\'s premium over HRPO; S355MC / S420MC extras not found',
    [src('ferrous.anchor.hrc'), src('ferrous.anchor.hrc.poland_distributor_St3S')], 'ladder', ['mat-s355mc', 'mat-s420mc'], base=UK['mat-hrpo'], floor_at_anchor=True)
fam('Coated sheet', v('ferrous.anchor.hdg'), 'NW Europe HDG €850–870/t ex-works (13 Sep 2026, as relayed by Tacto) = zł3.76/kg × the book\'s premium over DC01 GI',
    [src('ferrous.anchor.hdg')], 'ladder', ['mat-dc01-gi', 'mat-dc03-ga', 'mat-dc01-ze', 'mat-znni-eg', 'mat-zm-coated', 'mat-tinplate-etp'],
    base=UK['mat-dc01-gi'], floor_at_anchor=True)
C45 = v('ferrous.bar.C45')
fam('C45 medium-carbon bar', C45, 'C45 round bar zł3.17/kg net (24metal.com Polish stockholder list, read 10 Oct 2026; the page is undated)', [src('ferrous.bar.C45')], 'direct',
    ['mat-steel1045', 'mat-steel-c45', 'mat-en8'])
fam('Carbon / micro-alloyed bar', C45, 'C45 bar zł3.17 × the book\'s premium over C45; 38MnVS / 11SMnPb30 / A105 extras not found',
    [src('ferrous.bar.C45')], 'ladder', ['mat-steel-c35', 'mat-steel1020', 'mat-steel-a105', 'mat-steel-c70s6', 'mat-steel1141', 'mat-steel-en3-bar',
                                         'mat-steel-11smnpb30', 'mat-steel-30mnvs6', 'mat-steel-38mnvs6'], base=UK['mat-steel-c45'])
S304, S316, S430 = v('ferrous.stainless.304_CR_2B'), v('ferrous.stainless.316L_CR'), v('ferrous.stainless.430_CR')
fam('304 sheet', S304, '304 CR 2B €2,770/t delivered N. Europe incl. alloy surcharge (Eurometal, 7 Sep 2026) = zł12.12/kg; the October 1.4301 surcharge is €2,188/t (legierungszuschlag.info)',
    [src('ferrous.stainless.304_CR_2B'), src('ferrous.stainless.alloy_surcharge_1.4301_oct2026')], 'direct', ['mat-ss304-sheet'], confidence='Medium')
fam('301 spring strip', S304, '304 sheet zł12.12 × the book\'s premium of 301 over 304L sheet', [src('ferrous.stainless.304_CR_2B')], 'ladder', ['mat-ss301-spring'], base=UK['mat-ss304-sheet'])
fam('316L sheet', S316, '316 CR €4,225/t delivered N. Europe (Eurometal, 7 Sep 2026) = zł18.48/kg; 316L bar not found (held)',
    [src('ferrous.stainless.316L_CR')], 'direct', ['mat-ss316-sheet', 'mat-ss316l'], confidence='Medium')
fam('430 ferritic sheet', S430, '430 CR zł6.77/kg — DERIVED: the October 1.4016 alloy surcharge €985/t + a base assumed equal to 304\'s (no 430 transaction price found)',
    [src('ferrous.stainless.430_CR')], 'direct', ['mat-aisi430'])
# Foundry: the casting engine adds melt energy, melt loss, line, labour, fettling, overhead and margin — the grade is the CHARGE.
GJS, GJL, WCB, CF8 = v('ferrous.charge.GJS-500-7'), v('ferrous.charge.GJL-250'), v('ferrous.charge.GS-C25'), v('ferrous.charge.CF8')
fam('Ductile / CGI / ADI / SiMo iron (charge)', GJS, f'Treated ductile charge zł{GJS}/kg (45% merchant pig zł1.86 — Brazil→Italy Aug 2026 — + 30% heavy scrap zł1.20 + returns, FeSiMg and inoculant priced at FeSi75 zł5.51; the mix is an engineering assumption and the figure a FLOOR — arithmetic in research) + the book\'s grade premium in £/kg at zł{FX}/£ (alloy content; ADI\'s austempering, which the casting engine does not add)',
    [src('ferrous.charge.GJS-500-7'), src('ferrous.foundry.pig_iron'), src('ferrous.foundry.steel_scrap_heavy'), src('ferrous.foundry.FeSi75')], 'ladder-add',
    ['mat-gjs500', 'mat-gjs400', 'mat-gjs450-ssf', 'mat-gjs500-14', 'mat-gjs600', 'mat-gjs700', 'mat-gjs350-lt', 'mat-simo', 'mat-adi', 'mat-gjv450', 'mat-gjv500'],
    base=UK['mat-gjs500'])
fam('Grey / malleable iron (charge)', GJL, f'Grey-iron charge zł{GJL}/kg (merchant pig + heavy scrap + returns; engineering-assumption mix, a FLOOR) × the book\'s grade premium over GJL-250',
    [src('ferrous.charge.GJL-250'), src('ferrous.foundry.pig_iron')], 'ladder', ['mat-gjl250', 'mat-gjl150', 'mat-gjl200', 'mat-gjl300', 'mat-gjl350', 'mat-gjmb350'],
    base=UK['mat-gjl250'])
fam('Cast carbon / low-alloy steel (charge)', WCB, f'Steel-foundry charge zł{WCB}/kg (heavy melting scrap zł1.20 — German E3 / Polish scrap boards, Aug 2026 — + deoxidation and melt loss) + the book\'s premium in £/kg (Cr–Mo)',
    [src('ferrous.charge.GS-C25'), src('ferrous.foundry.steel_scrap_heavy')], 'ladder-add', ['mat-gs-c25', 'mat-astm-a216-wcb', 'mat-g20mn5', 'mat-g42crmo4'],
    base=UK['mat-gs-c25'])
fam('Cast stainless (charge)', CF8, f'CF8 charged as 304 scrap zł{CF8}/kg (304 scrap $1,420/t CIF Rotterdam, mid-Sep 2026, ÷ 0.97 melt loss) + the book\'s premium in £/kg (Mo / Ni / Cr)',
    [src('ferrous.charge.CF8'), src('ferrous.stainless.304_scrap')], 'ladder-add',
    ['mat-ss304-cast', 'mat-cf8m-cast', 'mat-ca6nm-cast', 'mat-cd4mcun-cast', 'mat-gx40crnisi25-20', 'mat-17-4ph-cast'], base=UK['mat-ss304-cast'])
NI = v('nonferrous.ni.spot'); CRK = v('ferrous.foundry.FeCr_HC') * 2   # zł per kg Cr contained (HC FeCr ~50% Cr)
FESI = v('ferrous.foundry.FeSi75')
fam('Ni-Resist D-2 (charge)', 0.20 * NI + 0.02 * CRK + 0.78 * GJS, f'0.20 × Ni zł{NI} (LME, 8 Sep) + 0.02 × Cr zł{CRK:.2f} (HC FeCr) + 0.78 × ductile charge zł{GJS}',
    [src('nonferrous.ni.spot'), src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-ni-resist-d2'])
fam('Ni-Resist D-5S (charge)', 0.35 * NI + 0.02 * CRK + 0.04 * FESI + 0.59 * GJS, f'0.35 × Ni + 0.02 × Cr + 0.04 kg FeSi75 zł{FESI} + 0.59 × ductile charge',
    [src('nonferrous.ni.spot')], 'direct', ['mat-ni-resist-d5s'])
fam('High-Cr white iron (charge)', 0.23 * CRK + 0.77 * GJL, f'0.23 × Cr zł{CRK:.2f} + 0.77 × grey charge zł{GJL}', [src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-hicr-white'])

# ── NON-FERROUS (LME + European premia, Fastmarkets / Argus public headlines, Westmetall) ────────────────────────────
ADC12, P1020, CU = v('nonferrous.al.adc12'), v('nonferrous.al.p1020'), v('nonferrous.cu.cathode_delivered')
fam('Secondary cast aluminium (ingot)', ADC12, 'Fastmarkets DIN226 / A380 pressure-diecasting ingot €2,430–2,530/t delivered Europe = zł10.85/kg — the latest public print is 23 Jan 2026 (STALE; the Rotterdam premium has risen since) × the book\'s premium over ADC12',
    [src('nonferrous.al.adc12')], 'ladder', ['mat-adc12', 'mat-a380', 'mat-a413', 'mat-a319', 'mat-lm4', 'mat-en-ac-46200'], base=UK['mat-adc12'])
fam('Secondary ADC12', ADC12, 'DIN226 zł10.85 (Jan 2026, stale)', [src('nonferrous.al.adc12')], 'direct', ['mat-adc12-secondary'])
fam('Primary-based cast aluminium (floor)', P1020, f'P1020 = LME $3,248 (28 Sep) + Rotterdam duty-paid premium $510–530 (15 Sep) = zł{P1020}/kg; a primary foundry alloy is never below the primary metal (A356 premium not found)',
    [src('nonferrous.al.p1020'), src('nonferrous.al.dutyPaidPremium')], 'floor',
    ['mat-lm25', 'mat-a365', 'mat-alsi10mg', 'mat-a390', 'mat-a357', 'mat-lm6', 'mat-almg5-cast', 'mat-a206', 'mat-en-ac-45300', 'mat-lm13', 'mat-aural5',
     'mat-silafont36', 'mat-castasil37', 'mat-magsimal59', 'mat-al-hpdc-lowco2', 'mat-htf-gigacast'], confidence='Medium')
fam('ETP copper bar / sheet (floor)', CU, 'LME copper $14,740 (25 Sep 2026) + Aurubis 2026 cathode premium $315 = zł57.95/kg delivered — the book\'s bar and sheet zł56.86 were below the copper they contain',
    [src('nonferrous.cu.cathode_delivered'), src('nonferrous.cu.cathode_premium')], 'floor', ['mat-c101-bar', 'mat-c110-copper', 'mat-cu-hairpin'], confidence='Medium')
fam('Free-machining / forging brass rod (floor)', v('nonferrous.brass.CW614N_rod'), 'Westmetall MS 58 metal basis €10.99/kg (9 Sep 2026) = zł48.07/kg — metal value before fabrication',
    [src('nonferrous.brass.CW614N_rod')], 'floor', ['mat-brass-cz121', 'mat-brass-cz122-forge'])
fam('70/30 and 63/37 brass sheet (floor)', v('nonferrous.brass.CW508L_sheet'), 'Westmetall MS 63/37 metal basis (9 Sep 2026) = zł49.95/kg — metal value before rolling',
    [src('nonferrous.brass.CW508L_sheet')], 'floor', ['mat-cz108-brass'])
SN = v('nonferrous.sn.spot')
fam('Phosphor / tin bronze (floor)', 0.89 * CU + 0.105 * SN, f'Metal content 0.89 × Cu zł{CU} + 0.105 × Sn zł{SN} (LME, 8 Sep)', [src('nonferrous.cu.cathode_delivered'), src('nonferrous.sn.spot')],
    'floor', ['mat-bronze-pb1', 'mat-bronze-c905', 'mat-cusn12-cast'])
ZN = v('nonferrous.zn.shg_delivered')
fam('Zamak 3 (floor)', 0.96 * ZN + 0.04 * P1020, f'Metal content 0.96 × SHG zinc zł{ZN} (LME $4,110, 8 Sep, + Argus Rotterdam premium) + 0.04 × Al zł{P1020}; a Zamak premium was not found',
    [src('nonferrous.zn.shg_delivered'), src('nonferrous.al.p1020')], 'floor', ['mat-zamak3'])
fam('Zamak 5 (floor)', 0.95 * ZN + 0.04 * P1020 + 0.01 * CU, f'Metal content 0.95 × zinc zł{ZN} + 0.04 × Al + 0.01 × Cu zł{CU}', [src('nonferrous.zn.shg_delivered')], 'floor', ['mat-zamak5'])

# ── POLYMERS / RUBBER (myCEPPI Central & Eastern Europe weekly; businessanalytiq Europe index) ─────────────────────────
def pfam(name, key, members, base_id, basis, method='ladder', confidence='Medium', floor=False):
    fam(name, v(key), basis, [src(key)], method, members, base=UK[base_id] if method == 'ladder' else None, floor_at_anchor=floor, confidence=confidence)
CEE = 'myCEPPI Central & Eastern Europe market price (plasticportal.eu / plasticker, wk 36–37 2026)'
pfam('PP family', 'polymer.pp_homo', ['mat-pp-homo', 'mat-pp', 'mat-pp-impact', 'mat-pp-bm', 'mat-pp-ext-sheet', 'mat-ppr-pipe', 'mat-pp-roto', 'mat-pp-tf'],
     'mat-pp-homo', f'PP homo zł5.11/kg ex-VAT ({CEE}; PP copolymer zł5.68) × the book\'s premium over PP homopolymer', floor=True)
pfam('PE family', 'polymer.hdpe', ['mat-hdpe', 'mat-hdpe-bm', 'mat-hdpe-fuel-coex', 'mat-pe100-pipe', 'mat-pe80-pipe', 'mat-hdpe-profile', 'mat-hdpe-roto',
                                   'mat-xlpe-roto', 'mat-fr-pe-roto', 'mat-foam-pe-roto', 'mat-cond-pe-roto', 'mat-hdpe-tf', 'mat-pex-pipe'],
     'mat-hdpe', f'HDPE film zł5.47/kg ex-VAT ({CEE}) × the book\'s premium over HDPE')
pfam('LDPE family', 'polymer.ldpe', ['mat-ldpe', 'mat-ldpe-bm', 'mat-ldpe-tube', 'mat-ldpe-tf'], 'mat-ldpe', f'LDPE zł5.58/kg ex-VAT ({CEE}) × the book\'s premium over LDPE')
pfam('LLDPE family', 'polymer.lldpe', ['mat-lldpe', 'mat-lldpe-bm', 'mat-lldpe-roto'], 'mat-lldpe', f'LLDPE C6 zł5.45/kg ex-VAT ({CEE}) × the book\'s premium over LLDPE')
pfam('PVC family', 'polymer.pvc', ['mat-upvc', 'mat-fpvc', 'mat-pvc-bm', 'mat-upvc-pipe', 'mat-pvc-cable', 'mat-upvc-window-profile', 'mat-pvcp-profile', 'mat-pvc-foam', 'mat-rpvc-tf'],
     'mat-upvc', f'S-PVC resin zł4.34/kg ex-VAT ({CEE}) × the book\'s premium of each compound over uPVC, never below the resin (the book\'s pipe compound zł3.97 sat below it)', floor=True)
pfam('ABS family', 'polymer.abs', ['mat-abs', 'mat-abs-ext-sheet', 'mat-abs-tf', 'mat-abs-fr'], 'mat-abs', f'ABS zł8.03/kg ex-VAT ({CEE}) × the book\'s premium over ABS')
pfam('GPPS', 'polymer.ps', ['mat-gpps', 'mat-gpps-ext'], 'mat-gpps', f'GPPS zł6.71/kg ex-VAT ({CEE}) × the book\'s premium over GPPS')
pfam('HIPS', 'polymer.hips', ['mat-hips'], 'mat-gpps', f'HIPS zł7.33/kg ex-VAT ({CEE}) — the book had HIPS at the GPPS price', method='direct')
BAQ = 'businessanalytiq Europe price index (method not published — Medium at best)'
pfam('PC family', 'polymer.pc', ['mat-pc', 'mat-pc-glazing', 'mat-pc-bm', 'mat-pc-ext-sheet', 'mat-pc-tf'], 'mat-pc', f'PC zł11.55/kg ex-VAT ({BAQ}, Sep 2026) × the book\'s premium over PC')
pfam('PA6 family', 'polymer.pa6', ['mat-pa6', 'mat-pa6-bm', 'mat-pa6-ext-tube'], 'mat-pa6', f'PA6 zł10.28/kg ex-VAT ({BAQ}, Aug 2026) × the book\'s premium over PA6')
pfam('PA66', 'polymer.pa66', ['mat-pa66'], 'mat-pa6', f'PA66 zł16.28/kg ex-VAT ({BAQ}, Aug 2026)', method='direct')
pfam('PBT', 'polymer.pbt', ['mat-pbt'], 'mat-pa6', f'PBT zł14.24/kg ex-VAT ({BAQ}, Sep 2026)', method='direct')
pfam('PET family', 'polymer.pet_bottle', ['mat-pet-bg', 'mat-pet-preform', 'mat-apet-tf'], 'mat-pet-bg', f'PET bottle grade zł4.97/kg ex-VAT ({BAQ}, Sep 2026) × the book\'s premium over PET bottle grade')
pfam('PMMA family', 'polymer.pmma', ['mat-pmma', 'mat-pmma-ext-sheet', 'mat-pmma-tf'], 'mat-pmma', f'PMMA zł14.20/kg ex-VAT ({BAQ}, Sep 2026; Trinseo +€250/t from 1 Oct not added) × the book\'s premium over PMMA')
pfam('PEEK family', 'polymer.peek', ['mat-peek', 'mat-peek-ext'], 'mat-peek', 'PEEK ≈ zł346.5/kg — Victrex FY2026 Q3 average selling price £68/kg (its whole mix incl. medical, so an upper bound for industrial resin)', confidence='Low')
fam('Natural rubber (raw)', v('rubber.nr'), 'TSR20 benchmark zł9.97/kg (Trading Economics, 9 Oct 2026) — FOB Asia, freight to Poland NOT added; for the book\'s raw NR SMR20 line; compounds held',
    [src('rubber.nr')], 'direct', ['mat-nr'])

held = {
    'HRPO, alloy engineering bar (41Cr4, 42CrMo4, 20MnCr5, 100Cr6, Ni-Cr-Mo), bearing steel': 'No dated Polish / European price found — held',
    'stainless bar (304, 316L, 303, martensitic, PH, duplex), 409L / 441': 'Not found (alloy surcharges only) — held',
    'electrical steel (NO / GO / CoFe / NiFe / amorphous)': 'Only a generic German index (grade not stated) — held',
    'wrought aluminium sheet / plate / forging stock': 'Not found — held (extrusion billets move by the billet premium)',
    'magnesium alloys (AZ91D, AM60 …)': 'Only an aggregator ingot figure (IMARC, Q2 2026) — held',
    'titanium, nickel superalloys, aluminium bronze, gunmetal': 'Not found — held',
    'POM': 'Only a Polish OFFER price (Plastech, which runs 20–35% above the CEE market on PP / ABS) — held',
    'filled / FR / blended compounds (PA66-GF30, PA6-GF30, PP-GF30 …), TPU, TPE / TPV, PPS, PEI, LCP, PA12': 'No compound price found — held',
    'rubber compounds (EPDM / NBR / CR / FKM / silicone …)': 'Raw polymers found (EPDM zł12.39, NBR zł8.43, SBR zł7.74) but a compound is not its polymer — held',
    'composites (prepreg, fabrics, SMC), paint, foam cores, engineering-plastic stock shapes': 'Epoxy (IMARC, May 2026) only — held',
}

# ── LABOUR (Sedlak & Sedlak OBW total pay by job, GUS regional medians, ZUS on-costs, 3 × 8 h) ─────────────────────────
def lab(role, std=False):
    key = f'labour.{role}.fullyLoadedPlnPerHr' + ('Std' if std else '')
    return {'localPerHr': v(key), 'basis': R[key]['basis'], 'source': R[key].get('source') or R.get(f'labour.{role}.monthlyGross', {}).get('source', ''), 'research': key}
labour = {
    'categories': {**{c: lab(c) for c in ['skilled', 'semiskilled', 'foundry', 'electronics', 'inspector', 'technician', 'supervisor']},
                   'engineer': lab('engineer', std=True)},
    'grades': {'forge': lab('forge'), 'furnace': lab('furnace'), 'blow': lab('blow'), 'roto': lab('roto'), 'thermoform': lab('thermoform'), 'trim-router': lab('trimRouter')},
    'loadingIncluded': R['labour.loadingIncluded']['basis'],
    'loadingNotIncluded': R['labour.loadingNotIncluded']['basis'],
    'short': '4-cluster, 3 × 8 h, ZUS-loaded, 1,720 productive h',
}

# ── ENERGY ────────────────────────────────────────────────────────────────────────────────────────────────────────────
energy = {
    'electricityLocalPerKwh': v('energy.electricity.allIn'),
    'gasLocalPerKwh': v('energy.gas.allIn'),
    'basis': ('Electricity zł0.702/kWh ex-VAT: TGE 2026 baseload year zł0.4305 + 2026 capacity fee zł0.2194 in weekday 07–21 h (zł0.128 on a flat 3-shift load) '
              '+ network zł0.129 (Forum Energii 2024, energy-intensive industry — a proxy) + OZE zł0.0073 + cogeneration zł0.003 + excise zł0.005; the book\'s zł0.698 agrees (Eurostat band IC, H2 2025, zł0.536 before the capacity-fee rise). '
              'Gas zł0.249/kWh ex-VAT (GCV): TGE day-ahead Mar–Apr 2026 zł0.224 + PSG variable distribution zł0.025 (2024) — a FLOOR (fixed / capacity charges and supplier margin not found); '
              'the EU-average non-household band I3, H2 2025, is zł0.265 and agrees; the book had zł0.408'),
    'sources': [src('energy.electricity.allIn'), src('energy.electricity.energyComponent'), src('energy.electricity.capacityFee'), src('energy.electricity.networkCharges'),
                src('energy.gas.commodity'), src('energy.gas.distribution')],
}

# ── MACHINES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
machines = {
    'hoursPerYear': v('hours.annual'),
    'hoursBasis': '3 × 8 h, Monday–Friday, 251 working days in 2026 = 6,024 h (the labour model\'s pattern)',
    'shiftDepreciationFactor': 1.0,
    'shiftBasis': 'Polish straight-line tax depreciation — no shift uplift on held capital',
    'lifeYears': round(v('life.machinery'), 2),
    'financeRate': round(v('finance.machineryLoan') / 100, 4),
    'financeBasis': 'SME machinery / investment loan WIBOR 3M 3.82% + 3.9–4.9 pp = 7.72–8.72%, midpoint 8.22% (cooperative bank tariff, Mar 2026); NBP reference rate 3.75% (7 Oct 2026) — a large Tier-1 borrows below this; the book\'s line build-ups use 4% on half the capex',
    'ukFinanceRate': 0.04,
    'maintenancePctOfCapex': 0.035,
    'maintenanceBasis': 'the library\'s own line build-up rule (3.5% of capex); no Polish norm found',
    'rentLocalPerM2Month': v('rent.clusterAvg'),
    'rentBasis': 'warehouse / light-industrial headline rent midpoints: Upper Silesia zł20.12, Wrocław zł18.92, Poznań zł21.10 per m²/month (€3.15–6.00 at zł4.374/€; ceo.com.pl, ~Apr 2026) — mean; CBRE Q2 2026 national €4.7 = zł20.56 agrees; Rzeszów listings only',
    'ukRentGbpPerM2Yr': 110,
    'capitalHeldFactor': 0.72,
    'groups': [
        {'id': 'cnc-vmc-eu', 'match': '^(mach-vmc3|mach-haas-vf2|mach-drill)$', 'refId': 'mach-vmc3', 'refCapexLocal': v('capex.mach-vmc3'),
         'basis': 'Haas VF-2SSYT-EU list €64,995 on Haas\'s Polish site = zł284,288 (machine only; delivery, installation and tooling not included); US list $70,995 = zł273,260 agrees — an imported machine costs Poland what it costs the EU',
         'source': R['capex.mach-vmc3']['source'], 'confidence': 'Medium'},
        {'id': 'cnc-5axis-eu', 'match': '^(mach-vmc5|mach-dmg-dmu50|mach-haas-umc500)$', 'refId': 'mach-vmc5', 'refCapexLocal': v('capex.mach-vmc5'),
         'basis': 'Haas UMC-500 "from $119,995" (US list, older article) = zł461,861 — no EU price found',
         'source': R['capex.mach-vmc5']['source'], 'confidence': 'Low'},
    ],
    'notRebuiltBasis': 'capex not sourced for Poland: the book\'s capital (UK × 0.72) is HELD — note most Polish plant is imported and priced in EUR, so this likely UNDERSTATES it; the Poland operating model (3 × 8 h hours, straight-line tax life, loan finance, rent, tariff, support at Polish wages) is applied',
}

# Al extrusion billet = LME + the DDP North Germany 6063 billet premium, over the library's LME (al-extrusion-data AL_MARKET)
LME, PLN_PER_USD = 3240, 3.849
billet_usd = v('nonferrous.al.billet6063') / PLN_PER_USD * 1000
cfg = {'asOf': '2026-10-10', 'label': 'Poland rate book — 4-cluster average (Silesia, Lower Silesia, Wielkopolska, Podkarpacie), 3 × 8 h',
       'region': 'PL', 'currency': 'PLN', 'currencySymbol': 'zł', 'dir': 'scripts/rate-refresh/poland-2026-10',
       'snapshot': 'scripts/rate-refresh/poland-2026-10/current-poland-book.json', 'bookFile': 'src/engine/country-books/pl.ts', 'bookConst': 'POLAND_BOOK',
       'fxPerGbp': FX, 'labour': labour, 'energy': energy, 'machines': machines, 'materialFamilies': families, 'held': held,
       'alBilletPremiumUsdPerT': {'value': round(billet_usd - LME), 'current': 1080,
                                  'basis': f'LME $3,248 (28 Sep 2026) + 6063 billet DDP North Germany premium $1,070–1,135 (Fastmarkets, 28 Aug 2026; being discontinued) = zł{v("nonferrous.al.billet6063")}/kg = ${billet_usd:.0f}/t at zł{PLN_PER_USD}/$ — over the library LME ${LME}',
                                  **src('nonferrous.al.billet6063_premium')}}
json.dump(cfg, open(os.path.join(HERE, '..', '2026-10-poland.json'), 'w'), indent=1, ensure_ascii=False)
print(f'{len(families)} families, {sum(len(f["members"]) for f in families)} grades; billet premium ${cfg["alBilletPremiumUsdPerT"]["value"]}/t; rent zł{machines["rentLocalPerM2Month"]}/m²/month')
