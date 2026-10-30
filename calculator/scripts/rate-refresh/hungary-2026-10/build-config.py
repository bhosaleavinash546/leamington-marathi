"""
Hungary rate book, October 2026 — assemble the dated config from the research files.

  python3 scripts/rate-refresh/hungary-2026-10/build-config.py   # writes scripts/rate-refresh/2026-10-hungary.json
  npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-hungary.json [--write]

Basis: an average of the four automotive supplier clusters (Győr-Moson-Sopron, Central Transdanubia, Bács-Kiskun,
Hajdú-Bihar), three 8-hour shifts Monday–Friday, October 2026, HUF ex-VAT. Every figure is a research item (key, value,
URL and date copied from research/*.json) or arithmetic on research items written out in `basis`. Which grade follows
which anchor, and how, is the only judgement here; each family says what it is. Methods as the Poland book: direct /
ladder (anchor × the frozen UK book's grade premium over its base) / ladder-add (anchor + that premium in £/kg) / floor.

NO UK MULTIPLIER (owner's instruction, 30 Oct 2026). What the research could not price is NOT scaled by an unsourced
Hungary factor:
  - a material with no Hungarian / European evidence is priced AT PAR — the book's own European-market price, ×1
    (`heldMaterialsAtPar`), and its register line says so;
  - a machine whose capex was not found keeps the book's capex AT PAR (`capitalHeldFactor` 1.0 — the same machine
    costs the same on the EU market), under Hungary's operating model (hours, life, finance, rent, tariff, support
    staff at Hungarian wages).
Network note: this session's proxy refused mnb.hu, Eurostat, HUPX and most Hungarian sites, so the researchers read
search-result extracts; every source is a URL to re-open before the next refresh (RULES.md).

Hungary buys steel, aluminium, copper and polymers at European prices, so most anchors are European market prices
converted at the MNB rate; freight to a Hungarian plant is NOT added where the source is ex-works or in-warehouse
Rotterdam, and the family says so.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}
for f in ['labour', 'energy-operating', 'machines-cutting-sheet', 'machines-forming-casting', 'machines-plastics-other',
          'materials-ferrous', 'materials-nonferrous', 'materials-polymer', 'overhead-logistics-services']:
    p = os.path.join(HERE, 'research', f + '.json')
    if not os.path.exists(p): raise SystemExit(f'missing research/{f}.json')
    for it in json.load(open(p))['items']:
        R[it['key']] = it
UK = {m['id']: m['gbpPerKg'] for m in json.load(open(os.path.join(HERE, '..', 'uk-2026-10', 'current-uk-book.json')))['materials']}

def v(key):
    val = R[key]['value']
    if val is None: raise KeyError(f'{key} has no value')
    return val
def src(key):
    it = R[key]
    return {'research': key, 'source': it.get('source'), 'date': it.get('date')}

# ── FX (MNB) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
EUR = float(v('fx.mnb.EURHUF'))
USD = float(v('fx.mnb.USDHUF'))
FX = round(float(v('fx.mnb.GBPHUF')), 2)        # £1 = Ft — REGIONAL_DATA.HU.fxToGBP must equal it (the generator asserts)
GBP = FX
FXBASIS = f"MNB official rates ({R['fx.mnb.EURHUF'].get('date')}): €1 = Ft{EUR}, $1 = Ft{USD}, £1 = Ft{FX}"

families = []
def fam(name, anchor, basis, sources, method, members, base=None, floor_at_anchor=False, confidence='Low', proxies=None):
    families.append({'family': name, 'anchorLocalPerKg': round(anchor, 3), 'anchorBasis': basis, 'sources': sources, 'method': method,
                     'base': base, 'floorAtAnchor': floor_at_anchor, 'members': members, 'confidence': confidence, 'note': '',
                     'proxies': proxies or {}})
eur = lambda k: float(v(k)) * EUR          # €/kg → Ft/kg
usd_t = lambda x: x / 1000 * USD          # $/t → Ft/kg

# ── FERROUS (European flat-steel assessments, alloy surcharges, scrap, foundry charges) ──────────────────────────────
CR = eur('ferrous.anchor.crc')
fam('CR coil (DC01 / DC04)', CR, f'NW Europe CRC €{v("ferrous.anchor.crc")}/kg ex-works (13 Sep 2026) = Ft{CR:.1f}/kg at €1 = Ft{EUR}; freight to a Hungarian plant not added',
    [src('ferrous.anchor.crc')], 'direct', ['mat-dc01', 'mat-dc04'], confidence='Medium')
fam('CR automotive grades', CR, f'CR coil Ft{CR:.1f} × the book\'s grade premium over its DC01/DC04 mean (£0.84); European AHSS / press-hardening extras not found',
    [src('ferrous.anchor.crc')], 'ladder',
    ['mat-dc05', 'mat-dc06', 'mat-if-dx56', 'mat-if-hs260', 'mat-bh260', 'mat-greensteel-dc01', 'mat-hsla340', 'mat-hsla420', 'mat-hsla550',
     'mat-dp600', 'mat-dp780', 'mat-dp980', 'mat-dp1000', 'mat-trip780', 'mat-cp800', 'mat-ms1200', 'mat-ms1300', 'mat-ms1500', 'mat-qp980',
     'mat-medmn1180', 'mat-22mnb5', 'mat-usibor1500', 'mat-usibor2000', 'mat-c67s-spring'], base=0.84, floor_at_anchor=True)
HRC = eur('ferrous.anchor.hrc')
fam('HR structural', HRC, f'Fastmarkets N. Europe HRC €{v("ferrous.anchor.hrc")}/kg (12 Oct 2026) = Ft{HRC:.1f}/kg × the book\'s premium over HRPO; S355MC / S420MC extras not found',
    [src('ferrous.anchor.hrc')], 'ladder', ['mat-s355mc', 'mat-s420mc'], base=UK['mat-hrpo'], floor_at_anchor=True)
HDG = eur('ferrous.anchor.hdg')
fam('Coated sheet', HDG, f'NW Europe HDG €{v("ferrous.anchor.hdg")}/kg ex-works (13 Sep 2026) = Ft{HDG:.1f}/kg × the book\'s premium over DC01 GI',
    [src('ferrous.anchor.hdg')], 'ladder', ['mat-dc01-gi', 'mat-dc03-ga', 'mat-dc01-ze', 'mat-znni-eg', 'mat-zm-coated', 'mat-tinplate-etp'],
    base=UK['mat-dc01-gi'], floor_at_anchor=True)
HRPO = eur('ferrous.anchor.hrpo')
fam('HR pickled & oiled', HRPO, f'HRC + a service-centre pickling extra = €{v("ferrous.anchor.hrpo")}/kg = Ft{HRPO:.1f}/kg — DERIVED', [src('ferrous.anchor.hrpo')], 'direct', ['mat-hrpo'])
S409 = eur('ferrous.stainless.409L_CR')
fam('409L / 441 ferritic sheet', S409, f'1.4512 alloy surcharge + an effective base equal to 304\'s = €{v("ferrous.stainless.409L_CR")}/kg = Ft{S409:.1f}/kg — DERIVED; 441 at the book\'s premium over 409L',
    [src('ferrous.stainless.409L_CR')], 'ladder', ['mat-ss409l-sheet', 'mat-ss441-sheet'], base=UK['mat-ss409l-sheet'])
S304, S316, S430 = eur('ferrous.stainless.304_CR_2B'), eur('ferrous.stainless.316L_CR'), eur('ferrous.stainless.430_CR')
fam('304 sheet', S304, f'304 CR 2B €{v("ferrous.stainless.304_CR_2B")}/kg delivered N. Europe incl. alloy surcharge (Eurometal, 7 Sep 2026) = Ft{S304:.1f}/kg',
    [src('ferrous.stainless.304_CR_2B'), src('ferrous.stainless.alloy_surcharge_1.4301_oct2026')], 'direct', ['mat-ss304-sheet'], confidence='Medium')
fam('301 spring strip', S304, f'304 sheet Ft{S304:.1f} × the book\'s premium of 301 over 304 sheet', [src('ferrous.stainless.304_CR_2B')], 'ladder', ['mat-ss301-spring'], base=UK['mat-ss304-sheet'])
fam('316L sheet', S316, f'316 CR €{v("ferrous.stainless.316L_CR")}/kg delivered N. Europe (Eurometal, 7 Sep 2026) = Ft{S316:.1f}/kg',
    [src('ferrous.stainless.316L_CR')], 'direct', ['mat-ss316-sheet', 'mat-ss316l'], confidence='Medium')
fam('430 ferritic sheet', S430, f'430 CR €{v("ferrous.stainless.430_CR")}/kg — DERIVED: the October 1.4016 alloy surcharge + a base assumed equal to 304\'s',
    [src('ferrous.stainless.430_CR')], 'direct', ['mat-aisi430'])
GJS, GJL, WCB = float(v('ferrous.charge.GJS-500-7')), float(v('ferrous.charge.GJL-250')), float(v('ferrous.charge.GS-C25'))
CF8 = eur('ferrous.stainless.304_scrap') / 0.97
fam('Ductile / CGI / ADI / SiMo iron (charge)', GJS, f'Treated ductile charge Ft{GJS}/kg (pig iron + steel scrap + returns + FeSiMg + inoculant; the mix is an engineering assumption and the figure a FLOOR — arithmetic in research; Hungarian steel scrap Ft110/kg, 2026, agrees with German E3) + the book\'s grade premium in £/kg at Ft{FX}/£ (alloy content)',
    [src('ferrous.charge.GJS-500-7'), src('ferrous.foundry.pig_iron'), src('ferrous.hu.steel_scrap_7204'), src('ferrous.foundry.FeSi75')], 'ladder-add',
    ['mat-gjs500', 'mat-gjs400', 'mat-gjs450-ssf', 'mat-gjs500-14', 'mat-gjs600', 'mat-gjs700', 'mat-gjs350-lt', 'mat-simo', 'mat-adi', 'mat-gjv450', 'mat-gjv500'],
    base=UK['mat-gjs500'])
fam('Grey / malleable iron (charge)', GJL, f'Grey-iron charge Ft{GJL}/kg (pig iron + steel scrap + returns; engineering-assumption mix, a FLOOR) × the book\'s grade premium over GJL-250',
    [src('ferrous.charge.GJL-250'), src('ferrous.hu.steel_scrap_7204')], 'ladder', ['mat-gjl250', 'mat-gjl150', 'mat-gjl200', 'mat-gjl300', 'mat-gjl350', 'mat-gjmb350'],
    base=UK['mat-gjl250'])
fam('Cast carbon / low-alloy steel (charge)', WCB, f'Steel-foundry charge Ft{WCB}/kg (Hungarian steel scrap Ft110/kg — liquidator\'s 2026 valuation, agreeing with German E3 — + deoxidation and melt loss) + the book\'s premium in £/kg (Cr–Mo)',
    [src('ferrous.charge.GS-C25'), src('ferrous.hu.steel_scrap_7204')], 'ladder-add', ['mat-gs-c25', 'mat-astm-a216-wcb', 'mat-g20mn5', 'mat-g42crmo4'],
    base=UK['mat-gs-c25'])
fam('Cast stainless (charge)', CF8, f'CF8 charged as 304 scrap €{v("ferrous.stainless.304_scrap")}/kg (CIF Rotterdam, mid-Sep 2026) ÷ 0.97 melt loss = Ft{CF8:.1f}/kg + the book\'s premium in £/kg (Mo / Ni / Cr)',
    [src('ferrous.stainless.304_scrap')], 'ladder-add',
    ['mat-ss304-cast', 'mat-cf8m-cast', 'mat-ca6nm-cast', 'mat-cd4mcun-cast', 'mat-gx40crnisi25-20', 'mat-17-4ph-cast'], base=UK['mat-ss304-cast'])
NI = usd_t(float(v('nonferrous.ni.spot')))
CRK = eur('ferrous.foundry.FeCr_HC') * 2     # Ft per kg Cr contained (HC FeCr ~50% Cr)
FESI = eur('ferrous.foundry.FeSi75')
fam('Ni-Resist D-2 (charge)', 0.20 * NI + 0.02 * CRK + 0.78 * GJS, f'0.20 × Ni Ft{NI:.1f} (LME, 23 Oct 2026) + 0.02 × Cr Ft{CRK:.1f} (HC FeCr) + 0.78 × ductile charge Ft{GJS}',
    [src('nonferrous.ni.spot'), src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-ni-resist-d2'])
fam('Ni-Resist D-5S (charge)', 0.35 * NI + 0.02 * CRK + 0.04 * FESI + 0.59 * GJS, f'0.35 × Ni + 0.02 × Cr + 0.04 kg FeSi75 Ft{FESI:.1f} + 0.59 × ductile charge',
    [src('nonferrous.ni.spot'), src('ferrous.foundry.FeSi75')], 'direct', ['mat-ni-resist-d5s'])
fam('High-Cr white iron (charge)', 0.23 * CRK + 0.77 * GJL, f'0.23 × Cr Ft{CRK:.1f} + 0.77 × grey charge Ft{GJL}', [src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-hicr-white'])

# ── NON-FERROUS (LME 23 Oct 2026 + European premia) ─────────────────────────────────────────────────────────────────
LME_AL, LME_CU, LME_ZN, LME_SN = (float(v(k)) for k in ['nonferrous.al.lme', 'nonferrous.cu.spot', 'nonferrous.zn.spot', 'nonferrous.sn.spot'])
P1020 = usd_t(LME_AL + float(v('nonferrous.al.dutyPaidPremium')))
ADC12 = eur('nonferrous.al.adc12') / 1000
fam('Secondary cast aluminium (ingot)', ADC12, f'Fastmarkets DIN226 / A380 €{v("nonferrous.al.adc12")}/t delivered Europe = Ft{ADC12:.1f}/kg — the latest public print is 23 Jan 2026 (STALE) × the book\'s premium over ADC12',
    [src('nonferrous.al.adc12')], 'ladder', ['mat-adc12', 'mat-a380', 'mat-a413', 'mat-a319', 'mat-lm4', 'mat-en-ac-46200'], base=UK['mat-adc12'])
fam('Secondary ADC12', ADC12, f'DIN226 Ft{ADC12:.1f} (Jan 2026, stale)', [src('nonferrous.al.adc12')], 'direct', ['mat-adc12-secondary'])
A356 = usd_t(LME_AL + float(v('nonferrous.al.a356_premium')))
fam('Primary-based cast aluminium', A356, f'AlSi7Mg = LME ${LME_AL:.0f} (23 Oct 2026) + Fastmarkets primary-foundry-alloy Si7 premium ddp Eastern Europe ${v("nonferrous.al.a356_premium")}/t (29 May 2026) = Ft{A356:.1f}/kg × the book\'s premium over LM25, never below A356',
    [src('nonferrous.al.lme'), src('nonferrous.al.a356_premium')], 'ladder',
    ['mat-lm25', 'mat-a365', 'mat-alsi10mg', 'mat-a390', 'mat-a357', 'mat-lm6', 'mat-almg5-cast', 'mat-a206', 'mat-en-ac-45300', 'mat-lm13', 'mat-aural5',
     'mat-silafont36', 'mat-castasil37', 'mat-magsimal59', 'mat-al-hpdc-lowco2', 'mat-htf-gigacast'], base=UK['mat-lm25'], floor_at_anchor=True)
BILLET_PREM = float(v('nonferrous.al.billet6063_premium'))
BILLET = usd_t(LME_AL + BILLET_PREM)
fam('Aluminium forging stock (floor)', BILLET, f'Delivered 6063 billet Ft{BILLET:.1f}/kg (LME ${LME_AL:.0f} + 6063 billet premium ${BILLET_PREM}/t, Fastmarkets 28 Aug 2026) — forging stock is never below the billet it is cut from',
    [src('nonferrous.al.lme'), src('nonferrous.al.billet6063_premium')], 'floor',
    ['mat-al6061-forge', 'mat-al6082-forge', 'mat-al2014-forge', 'mat-al7075-forge', 'mat-al2618-forge', 'mat-al7050-forge'])
FRP = usd_t(float(v('nonferrous.al.frp_europe_asp')))
fam('Aluminium sheet and plate (floor)', FRP, f'Novelis Europe average selling price, FY to Mar 2026: ${v("nonferrous.al.frp_europe_asp")}/t = Ft{FRP:.1f}/kg (all rolled products — a floor, not a price; AMAG\'s 2025 rolling average ~€5.9/kg is the specialty-heavy upper reference)',
    [src('nonferrous.al.frp_europe_asp'), src('nonferrous.al.amag_rolling_asp')], 'floor',
    ['mat-aa5182', 'mat-aa5052', 'mat-aa5083', 'mat-aa6082-sheet', 'mat-aa5754-sheet', 'mat-aa6061-sheet', 'mat-aa6063-sheet', 'mat-aa3003-sheet', 'mat-al-busbar',
     'mat-aa6016-t4', 'mat-aa6111-t4', 'mat-aa7075-t6', 'mat-aa1050-sheet'])
CU = usd_t(LME_CU + float(v('nonferrous.cu.cathode_premium')))
fam('ETP copper bar / sheet (floor)', CU, f'LME copper ${LME_CU:.0f} (23 Oct 2026) + Aurubis 2026 cathode premium ${v("nonferrous.cu.cathode_premium")} = Ft{CU:.1f}/kg delivered — bar and sheet are never below the copper they contain',
    [src('nonferrous.cu.spot'), src('nonferrous.cu.cathode_premium')], 'floor', ['mat-c101-bar', 'mat-c110-copper', 'mat-cu-hairpin'], confidence='Medium')
fam('Free-machining / forging brass rod (floor)', eur('nonferrous.brass.CW614N_rod'), f'MS 58 metal basis €{v("nonferrous.brass.CW614N_rod")}/kg (9 Oct 2026) — metal value before fabrication',
    [src('nonferrous.brass.CW614N_rod')], 'floor', ['mat-brass-cz121', 'mat-brass-cz122-forge'])
fam('70/30 and 63/37 brass sheet (floor)', eur('nonferrous.brass.CW508L_sheet'), f'CuZn37 metal basis €{v("nonferrous.brass.CW508L_sheet")}/kg (5 Oct 2026) — metal value before rolling',
    [src('nonferrous.brass.CW508L_sheet')], 'floor', ['mat-cz108-brass'])
SN = usd_t(LME_SN)
fam('Phosphor / tin bronze (floor)', 0.89 * CU + 0.105 * SN, f'Metal content 0.89 × Cu Ft{CU:.1f} + 0.105 × Sn Ft{SN:.1f} (LME, 23 Oct 2026)', [src('nonferrous.cu.spot'), src('nonferrous.sn.spot')],
    'floor', ['mat-bronze-pb1', 'mat-bronze-c905', 'mat-cusn12-cast'])
ZN = usd_t(LME_ZN + float(v('nonferrous.zn.shg_premium')))
fam('Zamak 3 (floor)', 0.96 * ZN + 0.04 * P1020, f'Metal content 0.96 × SHG zinc Ft{ZN:.1f} (LME ${LME_ZN:.0f} + Argus Rotterdam premium) + 0.04 × Al Ft{P1020:.1f}; a Zamak premium was not found',
    [src('nonferrous.zn.spot'), src('nonferrous.zn.shg_premium'), src('nonferrous.al.dutyPaidPremium')], 'floor', ['mat-zamak3'])
fam('Zamak 5 (floor)', 0.95 * ZN + 0.04 * P1020 + 0.01 * CU, f'Metal content 0.95 × zinc Ft{ZN:.1f} + 0.04 × Al + 0.01 × Cu Ft{CU:.1f}', [src('nonferrous.zn.spot')], 'floor', ['mat-zamak5'])

# ── POLYMERS / RUBBER (myCEPPI CEE weekly; businessanalytiq Europe index) ─────────────────────────────────────────────
CEE = 'myCEPPI Central & Eastern Europe market price (wk 37–38 2026)'
BAQ = 'businessanalytiq Europe price index (method not published — Medium at best)'
def pfam(name, key, members, base_id, basis, method='ladder', confidence='Medium', floor=False, cur='EUR'):
    a = float(v(key)) * (EUR if cur == 'EUR' else USD if cur == 'USD' else GBP)
    fam(name, a, basis.replace('{A}', f'{a:.1f}'), [src(key)], method, members, base=UK[base_id] if method == 'ladder' else None, floor_at_anchor=floor, confidence=confidence)
pfam('PP family', 'polymer.pp_homo', ['mat-pp-homo', 'mat-pp', 'mat-pp-impact', 'mat-pp-bm', 'mat-pp-ext-sheet', 'mat-ppr-pipe', 'mat-pp-roto', 'mat-pp-tf'],
     'mat-pp-homo', f'PP homo Ft{{A}}/kg ex-VAT ({CEE}) × the book\'s premium over PP homopolymer', floor=True)
pfam('PE family', 'polymer.hdpe', ['mat-hdpe', 'mat-hdpe-bm', 'mat-hdpe-fuel-coex', 'mat-pe100-pipe', 'mat-pe80-pipe', 'mat-hdpe-profile', 'mat-hdpe-roto',
                                   'mat-xlpe-roto', 'mat-fr-pe-roto', 'mat-foam-pe-roto', 'mat-cond-pe-roto', 'mat-hdpe-tf', 'mat-pex-pipe'],
     'mat-hdpe', f'HDPE film Ft{{A}}/kg ex-VAT ({CEE}) × the book\'s premium over HDPE')
pfam('LDPE family', 'polymer.ldpe', ['mat-ldpe', 'mat-ldpe-bm', 'mat-ldpe-tube', 'mat-ldpe-tf'], 'mat-ldpe', f'LDPE Ft{{A}}/kg ex-VAT ({CEE}) × the book\'s premium over LDPE')
pfam('LLDPE family', 'polymer.lldpe', ['mat-lldpe', 'mat-lldpe-bm', 'mat-lldpe-roto'], 'mat-lldpe', f'LLDPE Ft{{A}}/kg ex-VAT ({CEE}) × the book\'s premium over LLDPE')
pfam('PVC family', 'polymer.pvc', ['mat-upvc', 'mat-fpvc', 'mat-pvc-bm', 'mat-upvc-pipe', 'mat-pvc-cable', 'mat-upvc-window-profile', 'mat-pvcp-profile', 'mat-pvc-foam', 'mat-rpvc-tf'],
     'mat-upvc', f'S-PVC resin Ft{{A}}/kg ex-VAT ({CEE}) × the book\'s premium of each compound over uPVC, never below the resin', floor=True)
pfam('ABS family', 'polymer.abs', ['mat-abs', 'mat-abs-ext-sheet', 'mat-abs-tf', 'mat-abs-fr'], 'mat-abs', f'ABS Ft{{A}}/kg ex-VAT ({CEE}) × the book\'s premium over ABS')
pfam('GPPS', 'polymer.ps', ['mat-gpps', 'mat-gpps-ext'], 'mat-gpps', f'GPPS Ft{{A}}/kg ex-VAT ({CEE}) × the book\'s premium over GPPS')
pfam('HIPS', 'polymer.hips', ['mat-hips'], 'mat-gpps', f'HIPS Ft{{A}}/kg ex-VAT ({CEE}) — the book had HIPS at the GPPS price', method='direct')
pfam('PC family', 'polymer.pc', ['mat-pc', 'mat-pc-glazing', 'mat-pc-bm', 'mat-pc-ext-sheet', 'mat-pc-tf'], 'mat-pc', f'PC Ft{{A}}/kg ex-VAT ({BAQ}, Sep 2026) × the book\'s premium over PC', cur='USD')
pfam('PA6 family', 'polymer.pa6', ['mat-pa6', 'mat-pa6-bm', 'mat-pa6-ext-tube'], 'mat-pa6', f'PA6 Ft{{A}}/kg ex-VAT ({BAQ}, Aug 2026) × the book\'s premium over PA6', cur='USD')
pfam('PA66', 'polymer.pa66', ['mat-pa66'], 'mat-pa6', f'PA66 Ft{{A}}/kg ex-VAT ({BAQ}, Sep 2026)', method='direct', cur='USD')
pfam('PBT', 'polymer.pbt', ['mat-pbt'], 'mat-pa6', f'PBT Ft{{A}}/kg ex-VAT ({BAQ}, Sep 2026)', method='direct', cur='USD')
pfam('PMMA family', 'polymer.pmma', ['mat-pmma', 'mat-pmma-ext-sheet', 'mat-pmma-tf'], 'mat-pmma', f'PMMA Ft{{A}}/kg ex-VAT ({BAQ}, Sep 2026; Trinseo +€250/t from 1 Oct not added) × the book\'s premium over PMMA', cur='USD')
pfam('PEEK family', 'polymer.peek', ['mat-peek', 'mat-peek-ext'], 'mat-peek', 'PEEK ≈ Ft{A}/kg — Victrex average selling price £68/kg (its whole mix incl. medical, so an upper bound for industrial resin)', confidence='Low', cur='GBP')
pfam('POM', 'polymer.pom', ['mat-pom', 'mat-pom-rod'], 'mat-pom', 'POM Ft{A}/kg ex-VAT (Plastech October 2026 offer average — offers run above market settlements, so an upper reference) × the book\'s premium over POM', confidence='Low')
PCABS = 0.7 * float(v('polymer.pc')) * USD + 0.3 * float(v('polymer.abs')) * EUR
fam('PC/ABS (floor)', PCABS, f'Resin content 0.7 × PC + 0.3 × ABS = Ft{PCABS:.1f}/kg — the book\'s PC/ABS sat below its own resins',
    [src('polymer.pc'), src('polymer.abs')], 'floor', ['mat-pc-abs'])
CF = float(v('composite.cf_12k')) * USD
fam('Carbon fabric (floor)', CF, f'Carbon fibre (12K, generic) ${v("composite.cf_12k")}/kg (IMARC Germany, Mar 2026) = Ft{CF:.1f}/kg — a woven fabric is never below the fibre it is woven from',
    [src('composite.cf_12k')], 'floor', ['mat-cf-dry-3k'])
NR = float(v('rubber.nr')) * USD
fam('Natural rubber (raw)', NR, f'TSR20 benchmark ${v("rubber.nr")}/kg (28 Sep 2026) = Ft{NR:.1f}/kg — FOB Asia, freight to Hungary NOT added; for the book\'s raw NR SMR20 line; compounds at par',
    [src('rubber.nr')], 'direct', ['mat-nr'])

AT_PAR = ('no Hungarian or European price found this round (alloy engineering and stainless bar, electrical steel, wrought Al '
          'sheet grades beyond the floor, magnesium, titanium / nickel, filled / FR compounds, TPE / TPU, rubber compounds, '
          'composites, stock shapes) — priced at the book\'s own European-market price, ×1: a traded material costs Hungary '
          'what it costs the European market, and the 0.97 / resin factors this replaces had no source')
held = {'materials at par': AT_PAR}

# ── LABOUR (KSH earnings by occupation and county, statutory on-costs, 3 × 8 h) ─────────────────────────────────────
import re
def lab(role, std=False):
    """KSH total gross earnings ALREADY include the allowances paid (KSH measures base + premiums + allowances), so the
    researcher's +30% shift allowance on half the hours would count the shift premium twice: the book takes the figure
    WITHOUT it (printed in the research basis) — KSH total pay + szocho 13% ÷ 1,728 productive h. A plant running only
    3 × 8 h pays up to ~+14.5% over the occupation average; not added (no source for the shift mix)."""
    key = f'labour.{role}.fullyLoadedHufPerHr' + ('Std' if std else '')
    it = R[key]
    m = re.search(r'Without the shift allowance: ([\d,]+\.?\d*)', it['basis'])
    if not m: raise KeyError(f'{key}: no without-allowance figure in the basis')
    val = float(m.group(1).replace(',', ''))
    basis = re.sub(r'\+ shift allowance [^;]*?= [\d,]+;\s*', '', it['basis']).split(' Without the shift allowance')[0]
    return {'localPerHr': round(val, 2), 'basis': f'{basis} — taken WITHOUT the shift allowance (KSH total earnings already include the allowances paid): Ft{val:,.2f}/h',
            'source': it.get('source') or R.get(f'labour.{role}.monthlyGross', {}).get('source', ''), 'research': key}
ENG_GBP = 16.63   # REGIONAL_DATA.HU.labour.engineer before this book (UK × factor)
engineer = {'localPerHr': round(ENG_GBP * FX, 2), 'basis': f'HELD — no Hungarian engineer pay found this round (KSH FEOR 2141/2143 not reachable): the regional table\'s £{ENG_GBP}/h at £1 = Ft{FX} (UK × factor — the one labour rate not yet Hungary\'s own)',
            'source': '', 'research': 'labour.engineer (not found)'}
# Round 30 Oct 2026: engineer, technician, supervisor and inspector from their own KSH 2025 FEOR averages
# (round-2026-10-30/research/hu-labour.json) — they were the machinist proxy (technician, supervisor, inspector) and a
# held UK × factor (engineer). Same method as the machinist: KSH total earnings × 1.084 × 0.9406, the sick-pay saving
# on 10 days at 30%, szocho 13%, ÷ 1,728 productive hours; no extra shift allowance.
RND = {it['key']: it for it in json.load(open(os.path.join(HERE, '..', 'round-2026-10-30', 'research', 'hu-labour.json')))['items']}
FEOR = {'engineer': ('2118 Gépészmérnök (mechanical engineer)', 'labour.engineer.monthlyGross'),
        'technician': ('3116 Gépésztechnikus (mechanical engineering technician)', 'labour.technician.monthlyGross'),
        'supervisor': ('3212 manufacturing supervisor / foreman (művezető, műszakvezető)', 'labour.supervisor.monthlyGross'),
        'inspector': ('3135 quality-assurance technician', 'labour.inspector.monthlyGross')}
def feor(role):
    name, key = FEOR[role]
    g = float(RND[key]['value'])
    pay = 12 * g - 0.30 * 80 * g / 174
    rate = round(pay * 1.13 / 1728, 2)
    return {'localPerHr': rate, 'basis': f'KSH 2025 FEOR {name}: {RND[key]["basis"]}; annual 12 × {g:,.0f} − sick-pay saving 30% × 80 h × ({g:,.0f} ÷ 174) = {pay:,.0f}; + szocho 13% ÷ 1,728 productive h = Ft{rate:,.2f}/h (KSH total earnings include the allowances paid)',
            'source': RND[key]['source'], 'research': key}
labour = {
    'categories': {**{c: lab(c) for c in ['skilled', 'semiskilled', 'foundry', 'electronics']},
                   **{c: feor(c) for c in ['inspector', 'technician', 'supervisor', 'engineer']}},
    'grades': {'forge': lab('forge'), 'furnace': lab('furnace'), 'blow': lab('blow'), 'roto': lab('roto'), 'thermoform': lab('thermoform'), 'trim-router': lab('trimRouter')},
    'loadingIncluded': R['labour.loadingIncluded']['basis'],
    'loadingNotIncluded': R['labour.loadingNotIncluded']['basis'],
    'short': '4-cluster, KSH total earnings by FEOR occupation + szocho, 1,728 productive h',
}

# ── ENERGY ────────────────────────────────────────────────────────────────────────────────────────────────────────────
energy = {
    'electricityLocalPerKwh': round(float(v('energy.electricity.allIn')), 2),
    'gasLocalPerKwh': round(float(v('energy.gas.allIn')), 2),
    'basis': (f'Electricity Ft{v("energy.electricity.allIn")}/kWh ex-VAT: HUPX Cal-26 baseload ~€117/MWh = Ft{v("energy.electricity.energyComponent")} '
              f'+ MV network (E.ON 2026 tariff, MEKH H2995/2025, at 70% of contracted kW — an assumption) Ft{v("energy.electricity.networkCharges")} '
              f'+ energiaadó Ft{v("energy.electricity.levies")} — DERIVED; MAVIR system charges and KÁT/METÁR levies not found. '
              f'Gas Ft{v("energy.gas.allIn")}/kWh (GCV): TTF October 2026 contract as the commodity — a FLOOR (distribution and excise not found)'),
    'sources': [src('energy.electricity.allIn'), src('energy.electricity.energyComponent'), src('energy.electricity.networkCharges'),
                src('energy.electricity.levies'), src('energy.gas.allIn')],
}

# ── MACHINES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def capex_huf(key):
    it = R[key]; val = it['value']; cur = (it.get('currency') or 'EUR').upper()
    rate = {'EUR': EUR, 'USD': USD, 'GBP': GBP, 'HUF': 1}[cur]
    return round(float(val) * rate), cur, val
def group(gid, match, ref, key, basis, confidence='Low'):
    huf, cur, val = capex_huf(key)
    return {'id': gid, 'match': match, 'refId': ref, 'refCapexLocal': huf,
            'basis': f'{basis} = Ft{huf:,} ({cur} {val:,} at the MNB rate)', 'source': R[key]['source'], 'confidence': confidence}
# Not used as groups — the evidence is a different scope from the library machine, so these keep the book's capex at
# par and the figures are cross-checks (docs/rates/hungary-rate-book-2026-10.md): Wittmann 500 t £500k ("scope not
# stated — may include auxiliaries"; the book implies £312.5k); a cobot MIG cell £37,308 for a full robot welding
# station; a Manncorp entry-level SMT line $269,995; machine-only MIG / TIG sets and a pedestal spot welder (the book's
# stations include extraction and fixtures).
groups = [
    group('cnc-vmc-eu', '^(mach-vmc3|mach-haas-vf2)$', 'mach-haas-vf2', 'capex.mach-haas-vf2',
          'Haas VF-2 EU-series list €64,995 (machine only; delivery, installation and tooling not included) — an imported machine costs Hungary what it costs the EU', 'Medium'),
    group('cnc-5axis', '^(mach-vmc5|mach-haas-umc500)$', 'mach-haas-umc500', 'capex.mach-haas-umc500',
          'Haas UMC-500 US list $119,995 (no EU list found)'),
    group('press-brake-eu', '^brake-', 'brake-trumpf-trubend3100', 'capex.brake-trumpf-trubend3100',
          'TRUMPF TruBend 3100 (100 t × 3 m) NEW, offered at €136,000 FCA ex-VAT (2026, advertiser at TRUMPF Ditzingen); the other brakes sized by the book\'s relative capital'),
    group('waterjet-5ax', '^waterjet-5ax-composite$', 'waterjet-5ax-composite', 'capex.waterjet-5ax-composite',
          '5-axis waterjet, public tender award 2022 (make not named) €173,128'),
    group('al-extrusion-line-hu', '^al-ext-press-\\d+t$', 'al-ext-press-5500t', 'capex.al-ext-press-5500t',
          'Hydro Székesfehérvár new 12-inch automotive extrusion press, HUF 14.6 bn as reported (€35.7 M, announced 2022, in an existing building) — Hungarian evidence; the other direct presses sized by the book\'s relative capital (Vimetco 7-inch line €10 M agrees in order)'),
    group('heat-treat-furnace', '^heat-treat-furnace$', 'heat-treat-furnace', 'capex.heat-treat-furnace',
          'Single-chamber heat-treat furnace, public purchase FY2025 $134,910'),
    group('smt-high-speed', '^smt-high-speed-line$', 'smt-high-speed-line', 'capex.smt-high-speed-line', 'High-speed SMT line £1.6 M (company investment, trade press)'),
]
machines = {
    'hoursPerYear': int(v('hours.annual')),
    'hoursBasis': f'3 × 8 h, Monday–Friday, Hungary\'s 2026 working calendar: {int(v("hours.annual"))} h (253 days × 24 h)',
    'shiftDepreciationFactor': 1.0,
    'shiftBasis': 'Hungarian straight-line tax depreciation (14.5% a year) — no shift uplift on capital',
    'lifeYears': round(float(v('life.machinery')), 2),
    'financeRate': round(float(v('finance.machineryLoan')) / 100, 4),
    'financeBasis': f'MNB base rate {v("finance.mnbBase")}% (since 26 Aug 2026) + the Q1-2026 spread of new small HUF corporate loans (8.6%) over the base then ≈ 2.2 pp = {v("finance.machineryLoan")}% — DERIVED',
    'ukFinanceRate': 0.04,
    'maintenancePctOfCapex': 0.035,
    'maintenanceBasis': 'the library\'s own line build-up rule (3.5% of capex); no Hungarian norm found',
    'rentLocalPerM2Month': round(float(v('rent.clusterAvg')), 1),
    'rentBasis': f'CBRE Q1 2026 prime big-box rent €5.5/m²/month (national — the four cluster rents were not found; Kecskemét €6.8–7.2 from a recruiter quoting CBRE) = Ft{v("rent.clusterAvg")}',
    'ukRentGbpPerM2Yr': 110,
    'capitalHeldFactor': 1.0,
    'groups': groups,
    'notRebuiltBasis': 'capex not found for Hungary: the machine\'s capital is the book\'s AT PAR (×1 — the same machine costs the same on the EU market; no unsourced country discount), under Hungary\'s operating model (3 × 8 h, 14.5% straight-line life, loan finance, rent, tariff, support at Hungarian wages)',
}

cfg = {'asOf': '2026-10-30', 'label': 'Hungary rate book — 4-cluster average (Győr, Central Transdanubia, Kecskemét, Debrecen), 3 × 8 h',
       'region': 'HU', 'currency': 'HUF', 'currencySymbol': 'Ft', 'dir': 'scripts/rate-refresh/hungary-2026-10',
       'snapshot': 'scripts/rate-refresh/hungary-2026-10/current-hungary-book.json', 'bookFile': 'src/engine/country-books/hu.ts', 'bookConst': 'HUNGARY_BOOK',
       'fxPerGbp': FX, 'fxBasis': FXBASIS, 'labour': labour, 'energy': energy, 'machines': machines, 'materialFamilies': families, 'held': held,
       'heldMaterialsAtPar': {'basis': AT_PAR}, 'noLibraryLabourRows': True,
       'alBilletPremiumUsdPerT': {'value': round(BILLET_PREM), 'current': 1080,
                                  'basis': f'6063 billet premium ${BILLET_PREM}/t over LME (Fastmarkets, 28 Aug 2026; DDP North Germany — no Central-European print found)',
                                  **src('nonferrous.al.billet6063_premium')}}
json.dump(cfg, open(os.path.join(HERE, '..', '2026-10-hungary.json'), 'w'), indent=1, ensure_ascii=False)
print(f'{len(families)} families, {sum(len(f["members"]) for f in families)} grades; {len(groups)} machine groups; FX £1 = Ft{FX}; '
      f'elec Ft{energy["electricityLocalPerKwh"]}/kWh; hours {machines["hoursPerYear"]}')
