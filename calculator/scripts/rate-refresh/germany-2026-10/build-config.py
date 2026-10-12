"""
Germany rate book, October 2026 — assemble the dated config from the research files.

  python3 scripts/rate-refresh/germany-2026-10/build-config.py   # writes scripts/rate-refresh/2026-10-germany.json
  npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-germany.json [--write]

Basis: an average of the four automotive supplier clusters (Baden-Württemberg, Bavaria, Lower Saxony, North Rhine-
Westphalia), two 8-hour shifts Monday–Friday, October 2026, EUR ex-VAT. Every figure is a research item (key, value, URL and
date copied from research/*.json) or arithmetic on research items written out in `basis`. Which grade follows which anchor,
and how, is the only judgement here; each family says what it is. Methods as the India, China and Poland books: direct /
ladder (anchor × the frozen UK book's grade premium over its base) / ladder-add (anchor + that premium in £/kg at the book
FX — alloy content) / floor (raised to the metal content) / held.

Germany buys steel, aluminium, copper and polymers on the European market, so the anchors are European market prices,
most of them ex-works or delivered North / Central Europe; freight to a German plant is NOT added where the source is
ex-works, and the family says so. The research could open no source page (proxy / DNS): every figure is the search
extract of the cited page, and the research files say so — the book's confidence reflects it.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}
for f in ['labour-energy', 'machines', 'materials-ferrous', 'materials-nonferrous', 'materials-polymer', 'r2-overhead-logistics-services']:
    p = os.path.join(HERE, 'research', f + '.json')
    if not os.path.exists(p):
        raise SystemExit(f'missing research file {f}.json')
    for it in json.load(open(p))['items']:
        R[it['key']] = it
# ladder bases are the FROZEN UK snapshot (the generator reads the same file)
UK = {m['id']: m['gbpPerKg'] for m in json.load(open(os.path.join(HERE, '..', 'uk-2026-10', 'current-uk-book.json')))['materials']}
FX = 1.165   # £1 = €1.165 (REGIONAL_DATA.DE.fxToGBP), asserted by the generator; $1 = €0.880 in the research

def src(key):
    it = R[key]
    return {'research': key, 'source': it.get('source'), 'date': it.get('date')}
def v(key):
    val = R[key]['value']
    if val is None: raise KeyError(f'{key} has no value')
    return val

families = []
def fam(name, anchor, basis, sources, method, members, base=None, floor_at_anchor=False, confidence='Low', note='', proxies=None):
    families.append({'family': name, 'anchorLocalPerKg': round(anchor, 4), 'anchorBasis': basis, 'sources': sources, 'method': method,
                     'base': base, 'floorAtAnchor': floor_at_anchor, 'members': members, 'confidence': confidence, 'note': note,
                     'proxies': proxies or {}})

# ── FERROUS (NW Europe flat-steel assessments, stainless surcharges, German scrap) ───────────────────────────────────
CR = v('ferrous.anchor.crc')
fam('CR coil (DC01 / DC04)', CR, f'NW Europe CRC €{CR*1000:.0f}/t ex-works (Fastmarkets via Tacto, 13 Sep 2026) = €{CR}/kg; freight to the plant not added',
    [src('ferrous.anchor.crc')], 'direct', ['mat-dc01', 'mat-dc04'], confidence='Medium')
CRBASE = round((UK['mat-dc01'] + UK['mat-dc04']) / 2, 4)
fam('CR automotive grades', CR, f'CR coil €{CR} × the book\'s grade premium over its DC01/DC04 mean (£{CRBASE}); European AHSS / press-hardening extras not found',
    [src('ferrous.anchor.crc')], 'ladder',
    ['mat-dc05', 'mat-dc06', 'mat-if-dx56', 'mat-if-hs260', 'mat-bh260', 'mat-greensteel-dc01', 'mat-hsla340', 'mat-hsla420', 'mat-hsla550',
     'mat-dp600', 'mat-dp780', 'mat-dp980', 'mat-dp1000', 'mat-trip780', 'mat-cp800', 'mat-ms1200', 'mat-ms1300', 'mat-ms1500', 'mat-qp980',
     'mat-medmn1180', 'mat-22mnb5', 'mat-usibor1500', 'mat-usibor2000', 'mat-c67s-spring'], base=CRBASE, floor_at_anchor=True)
HRC = v('ferrous.anchor.hrc')
fam('HR structural', HRC, f'NW Europe HRC €{HRC*1000:.0f}/t ex-works (Fastmarkets, 6 Oct 2026) = €{HRC}/kg × the book\'s premium over HRPO; S355MC / S420MC extras not found',
    [src('ferrous.anchor.hrc')], 'ladder', ['mat-s355mc', 'mat-s420mc'], base=UK['mat-hrpo'], floor_at_anchor=True)
HDG = v('ferrous.anchor.hdg')
fam('Coated sheet', HDG, f'NW Europe HDG €{HDG*1000:.0f}/t ex-works (Fastmarkets via Tacto, 13 Sep 2026) = €{HDG}/kg × the book\'s premium over DC01 GI',
    [src('ferrous.anchor.hdg')], 'ladder', ['mat-dc01-gi', 'mat-dc03-ga', 'mat-dc01-ze', 'mat-znni-eg', 'mat-zm-coated', 'mat-tinplate-etp'],
    base=UK['mat-dc01-gi'], floor_at_anchor=True)
fam('HR pickled & oiled', v('ferrous.anchor.hrpo'), f'HRC €{HRC*1000:.0f}/t + a service-centre pickling extra ~€90/t (undated) = €{v("ferrous.anchor.hrpo")}/kg — DERIVED',
    [src('ferrous.anchor.hrpo')], 'direct', ['mat-hrpo'])
fam('409L / 441 ferritic sheet', v('ferrous.stainless.409L_CR'), f'409L CR €{v("ferrous.stainless.409L_CR")}/kg — DERIVED (alloy surcharge + base); 441 at the book\'s premium over 409L',
    [src('ferrous.stainless.409L_CR')], 'ladder', ['mat-ss409l-sheet', 'mat-ss441-sheet'], base=UK['mat-ss409l-sheet'])
S304, S316, S430 = v('ferrous.stainless.304_CR_2B'), v('ferrous.stainless.316L_CR'), v('ferrous.stainless.430_CR')
fam('304 sheet', S304, f'304 CR 2B €{S304*1000:,.0f}/t delivered N. Europe incl. alloy surcharge (Fastmarkets, 7 Sep 2026) = €{S304}/kg; the October 1.4301 surcharge is €{v("ferrous.stainless.alloy_surcharge_1.4301_oct2026")*1000:,.0f}/t',
    [src('ferrous.stainless.304_CR_2B'), src('ferrous.stainless.alloy_surcharge_1.4301_oct2026')], 'direct', ['mat-ss304-sheet'], confidence='Medium')
fam('301 spring strip', S304, f'304 sheet €{S304} × the book\'s premium of 301 over 304 sheet', [src('ferrous.stainless.304_CR_2B')], 'ladder', ['mat-ss301-spring'], base=UK['mat-ss304-sheet'])
fam('316L sheet', S316, f'316 CR €{S316*1000:,.0f}/t delivered N. Europe (Fastmarkets, 7 Sep 2026) = €{S316}/kg; 316L bar not found (the bar takes the sheet price — a floor)',
    [src('ferrous.stainless.316L_CR')], 'direct', ['mat-ss316-sheet', 'mat-ss316l'], confidence='Medium')
fam('430 ferritic sheet', S430, f'430 CR €{S430}/kg — DERIVED: the October 1.4016 alloy surcharge + a base (no 430 transaction price found)',
    [src('ferrous.stainless.430_CR')], 'direct', ['mat-aisi430'])
# Foundry: the casting engine adds melt energy, melt loss, line, labour, fettling, overhead and margin — the grade is the CHARGE.
GJS, GJL, WCB, CF8 = v('ferrous.charge.GJS-500-7'), v('ferrous.charge.GJL-250'), v('ferrous.charge.GS-C25'), v('ferrous.charge.CF8')
fam('Ductile / CGI / ADI / SiMo iron (charge)', GJS, f'Treated ductile charge €{GJS}/kg (merchant pig €{v("ferrous.foundry.pig_iron")} — Brazil→Italy Aug 2026 — + heavy scrap €{v("ferrous.foundry.steel_scrap_heavy")} (German E3, Jul–Aug 2026) + returns, FeSiMg and inoculant at FeSi75 €{v("ferrous.foundry.FeSi75")}; the mix is an engineering assumption and the figure a FLOOR — arithmetic in research) + the book\'s grade premium in £/kg at €{FX}/£ (alloy content)',
    [src('ferrous.charge.GJS-500-7'), src('ferrous.foundry.pig_iron'), src('ferrous.foundry.steel_scrap_heavy'), src('ferrous.foundry.FeSi75')], 'ladder-add',
    ['mat-gjs500', 'mat-gjs400', 'mat-gjs450-ssf', 'mat-gjs500-14', 'mat-gjs600', 'mat-gjs700', 'mat-gjs350-lt', 'mat-simo', 'mat-adi', 'mat-gjv450', 'mat-gjv500'],
    base=UK['mat-gjs500'])
fam('Grey / malleable iron (charge)', GJL, f'Grey-iron charge €{GJL}/kg (merchant pig + heavy scrap + returns; engineering-assumption mix, a FLOOR) × the book\'s grade premium over GJL-250',
    [src('ferrous.charge.GJL-250'), src('ferrous.foundry.pig_iron')], 'ladder', ['mat-gjl250', 'mat-gjl150', 'mat-gjl200', 'mat-gjl300', 'mat-gjl350', 'mat-gjmb350'],
    base=UK['mat-gjl250'])
fam('Cast carbon / low-alloy steel (charge)', WCB, f'Steel-foundry charge €{WCB}/kg (heavy melting scrap €{v("ferrous.foundry.steel_scrap_heavy")} — German E3, Jul–Aug 2026 — + deoxidation and melt loss) + the book\'s premium in £/kg (Cr–Mo)',
    [src('ferrous.charge.GS-C25'), src('ferrous.foundry.steel_scrap_heavy')], 'ladder-add', ['mat-gs-c25', 'mat-astm-a216-wcb', 'mat-g20mn5', 'mat-g42crmo4'],
    base=UK['mat-gs-c25'])
fam('Cast stainless (charge)', CF8, f'CF8 charged as 304 scrap €{CF8}/kg (304 scrap, mid-Sep 2026, ÷ 0.97 melt loss) + the book\'s premium in £/kg (Mo / Ni / Cr)',
    [src('ferrous.charge.CF8'), src('ferrous.stainless.304_scrap')], 'ladder-add',
    ['mat-ss304-cast', 'mat-cf8m-cast', 'mat-ca6nm-cast', 'mat-cd4mcun-cast', 'mat-gx40crnisi25-20', 'mat-17-4ph-cast'], base=UK['mat-ss304-cast'])
NI = v('nonferrous.ni.spot'); CRK = v('ferrous.foundry.FeCr_HC') * 2   # € per kg Cr contained (HC FeCr ~50% Cr)
FESI = v('ferrous.foundry.FeSi75')
fam('Ni-Resist D-2 (charge)', 0.20 * NI + 0.02 * CRK + 0.78 * GJS, f'0.20 × Ni €{NI} (LME, 9 Oct) + 0.02 × Cr €{CRK:.2f} (HC FeCr) + 0.78 × ductile charge €{GJS}',
    [src('nonferrous.ni.spot'), src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-ni-resist-d2'])
fam('Ni-Resist D-5S (charge)', 0.35 * NI + 0.02 * CRK + 0.04 * FESI + 0.59 * GJS, f'0.35 × Ni + 0.02 × Cr + 0.04 kg FeSi75 €{FESI} + 0.59 × ductile charge',
    [src('nonferrous.ni.spot')], 'direct', ['mat-ni-resist-d5s'])
fam('High-Cr white iron (charge)', 0.23 * CRK + 0.77 * GJL, f'0.23 × Cr €{CRK:.2f} + 0.77 × grey charge €{GJL}', [src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-hicr-white'])

# ── NON-FERROUS (LME + European premia, Fastmarkets / Argus public headlines, Westmetall, Aurubis) ───────────────────
ADC12, P1020, CU = v('nonferrous.al.adc12'), v('nonferrous.al.p1020'), v('nonferrous.cu.cathode_delivered')
fam('Secondary cast aluminium (ingot)', ADC12, f'Fastmarkets DIN226 / A380 pressure-diecasting ingot €2,430–2,530/t delivered Europe = €{ADC12}/kg — the latest public print is 23 Jan 2026 (STALE) × the book\'s premium over ADC12',
    [src('nonferrous.al.adc12')], 'ladder', ['mat-adc12', 'mat-a380', 'mat-a413', 'mat-a319', 'mat-lm4', 'mat-en-ac-46200'], base=UK['mat-adc12'])
fam('Secondary ADC12', ADC12, f'DIN226 €{ADC12} (Jan 2026, stale)', [src('nonferrous.al.adc12')], 'direct', ['mat-adc12-secondary'])
A356 = v('nonferrous.al.alsi7mg')
fam('Primary-based cast aluminium', A356, f'AlSi7Mg (A356) = LME + Fastmarkets primary-foundry-alloy premium ddp Germany $950–1,050/t (29 May 2026) = €{A356}/kg × the book\'s premium over LM25, never below A356',
    [src('nonferrous.al.alsi7mg'), src('nonferrous.al.a356_premium')], 'ladder',
    ['mat-lm25', 'mat-a365', 'mat-alsi10mg', 'mat-a390', 'mat-a357', 'mat-lm6', 'mat-almg5-cast', 'mat-a206', 'mat-en-ac-45300', 'mat-lm13', 'mat-aural5',
     'mat-silafont36', 'mat-castasil37', 'mat-magsimal59', 'mat-al-hpdc-lowco2', 'mat-htf-gigacast'], base=UK['mat-lm25'], floor_at_anchor=True)
BILLET = v('nonferrous.al.billet6063')
fam('Aluminium forging stock (floor)', BILLET, f'Delivered 6063 billet €{BILLET}/kg (LME 9 Oct + DDP North Germany billet premium) — forging stock is never below the billet it is cut from',
    [src('nonferrous.al.billet6063')], 'floor', ['mat-al6061-forge', 'mat-al6082-forge', 'mat-al2014-forge', 'mat-al7075-forge', 'mat-al2618-forge', 'mat-al7050-forge'])
FRP = v('nonferrous.al.frp_europe_asp')
fam('Aluminium sheet and plate (floor)', FRP, f'Novelis Europe average selling price, FY to Mar 2026: $5,272 M ÷ 1,115 kt = €{FRP}/kg (all rolled products, can stock included — a floor, not a price); a German stockholder\'s single-sheet 5754 price €{v("nonferrous.al.sheet_5754")} is a retail ceiling',
    [src('nonferrous.al.frp_europe_asp'), src('nonferrous.al.sheet_5754')], 'floor',
    ['mat-aa5182', 'mat-aa5052', 'mat-aa5083', 'mat-aa6082-sheet', 'mat-aa5754-sheet', 'mat-aa6061-sheet', 'mat-aa6063-sheet', 'mat-aa3003-sheet', 'mat-al-busbar',
     'mat-aa6016-t4', 'mat-aa6111-t4', 'mat-aa7075-t6', 'mat-aa1050-sheet'])
fam('ETP copper bar / sheet (floor)', CU, f'LME copper (9 Oct 2026) + Aurubis 2026 cathode premium $315/t = €{CU}/kg delivered — no bar or sheet may sit below the copper it contains',
    [src('nonferrous.cu.cathode_delivered'), src('nonferrous.cu.cathode_premium')], 'floor', ['mat-c101-bar', 'mat-c110-copper', 'mat-cu-hairpin'], confidence='Medium')
fam('Free-machining / forging brass rod (floor)', v('nonferrous.brass.CW614N_rod'), f'MS 58 metal basis €{v("nonferrous.brass.CW614N_rod")}/kg (9 Oct 2026) — metal value before fabrication',
    [src('nonferrous.brass.CW614N_rod')], 'floor', ['mat-brass-cz121', 'mat-brass-cz122-forge'])
fam('70/30 and 63/37 brass sheet (floor)', v('nonferrous.brass.CW508L_sheet'), f'CuZn37 metal basis €{v("nonferrous.brass.CW508L_sheet")}/kg (5 Oct 2026) — metal value before rolling',
    [src('nonferrous.brass.CW508L_sheet')], 'floor', ['mat-cz108-brass'])
SN = v('nonferrous.sn.spot')
fam('Phosphor / tin bronze (floor)', 0.89 * CU + 0.105 * SN, f'Metal content 0.89 × Cu €{CU} + 0.105 × Sn €{SN} (LME, 9 Oct)', [src('nonferrous.cu.cathode_delivered'), src('nonferrous.sn.spot')],
    'floor', ['mat-bronze-pb1', 'mat-bronze-c905', 'mat-cusn12-cast'])
ZN = v('nonferrous.zn.shg_delivered')
fam('Zamak 3 (floor)', 0.96 * ZN + 0.04 * P1020, f'Metal content 0.96 × SHG zinc €{ZN} (LME + Rotterdam premium) + 0.04 × Al €{P1020}', [src('nonferrous.zn.shg_delivered'), src('nonferrous.al.p1020')], 'floor', ['mat-zamak3'])
fam('Zamak 5 (floor)', 0.95 * ZN + 0.04 * P1020 + 0.01 * CU, f'Metal content 0.95 × zinc €{ZN} + 0.04 × Al + 0.01 × Cu €{CU}', [src('nonferrous.zn.shg_delivered')], 'floor', ['mat-zamak5'])

# ── POLYMERS / RUBBER (myCEPPI Central & Eastern Europe weekly; businessanalytiq Europe index) ─────────────────────────
def pfam(name, key, members, base_id, basis, method='ladder', confidence='Medium', floor=False):
    fam(name, v(key), basis, [src(key)], method, members, base=UK[base_id] if method == 'ladder' else None, floor_at_anchor=floor, confidence=confidence)
CEE = 'myCEPPI Central & Eastern Europe weekly market price (plasticportal.eu, wk 37 2026) — the German KI price list is subscriber-only'
pfam('PP family', 'polymer.pp_homo', ['mat-pp-homo', 'mat-pp', 'mat-pp-impact', 'mat-pp-bm', 'mat-pp-ext-sheet', 'mat-ppr-pipe', 'mat-pp-roto', 'mat-pp-tf'],
     'mat-pp-homo', f'PP homo €{v("polymer.pp_homo")}/kg ex-VAT ({CEE}; PP copolymer €{v("polymer.pp_copo")}) × the book\'s premium over PP homopolymer', floor=True)
pfam('PE family', 'polymer.hdpe', ['mat-hdpe', 'mat-hdpe-bm', 'mat-hdpe-fuel-coex', 'mat-pe100-pipe', 'mat-pe80-pipe', 'mat-hdpe-profile', 'mat-hdpe-roto',
                                   'mat-xlpe-roto', 'mat-fr-pe-roto', 'mat-foam-pe-roto', 'mat-cond-pe-roto', 'mat-hdpe-tf', 'mat-pex-pipe'],
     'mat-hdpe', f'HDPE €{v("polymer.hdpe")}/kg ex-VAT ({CEE}) × the book\'s premium over HDPE')
pfam('LDPE family', 'polymer.ldpe', ['mat-ldpe', 'mat-ldpe-bm', 'mat-ldpe-tube', 'mat-ldpe-tf'], 'mat-ldpe', f'LDPE €{v("polymer.ldpe")}/kg ex-VAT ({CEE}) × the book\'s premium over LDPE')
pfam('LLDPE family', 'polymer.lldpe', ['mat-lldpe', 'mat-lldpe-bm', 'mat-lldpe-roto'], 'mat-lldpe', f'LLDPE C6 €{v("polymer.lldpe")}/kg ex-VAT ({CEE}) × the book\'s premium over LLDPE')
pfam('PVC family', 'polymer.pvc', ['mat-upvc', 'mat-fpvc', 'mat-pvc-bm', 'mat-upvc-pipe', 'mat-pvc-cable', 'mat-upvc-window-profile', 'mat-pvcp-profile', 'mat-pvc-foam', 'mat-rpvc-tf'],
     'mat-upvc', f'S-PVC resin €{v("polymer.pvc")}/kg ex-VAT ({CEE}) × the book\'s premium of each compound over uPVC, never below the resin', floor=True)
pfam('ABS family', 'polymer.abs', ['mat-abs', 'mat-abs-ext-sheet', 'mat-abs-tf', 'mat-abs-fr'], 'mat-abs', f'ABS €{v("polymer.abs")}/kg ex-VAT ({CEE}) × the book\'s premium over ABS')
pfam('GPPS', 'polymer.ps', ['mat-gpps', 'mat-gpps-ext'], 'mat-gpps', f'GPPS €{v("polymer.ps")}/kg ex-VAT ({CEE}) × the book\'s premium over GPPS')
pfam('HIPS', 'polymer.hips', ['mat-hips'], 'mat-gpps', f'HIPS €{v("polymer.hips")}/kg ex-VAT ({CEE}) — the book had HIPS at the GPPS price', method='direct')
BAQ = 'businessanalytiq Europe price index (method not published — Medium at best)'
pfam('PC family', 'polymer.pc', ['mat-pc', 'mat-pc-glazing', 'mat-pc-bm', 'mat-pc-ext-sheet', 'mat-pc-tf'], 'mat-pc', f'PC €{v("polymer.pc")}/kg ex-VAT ({BAQ}, Sep 2026) × the book\'s premium over PC')
pfam('PA6 family', 'polymer.pa6', ['mat-pa6', 'mat-pa6-bm', 'mat-pa6-ext-tube'], 'mat-pa6', f'PA6 €{v("polymer.pa6")}/kg ex-VAT ({BAQ}, Aug 2026) × the book\'s premium over PA6')
pfam('PA66', 'polymer.pa66', ['mat-pa66'], 'mat-pa6', f'PA66 €{v("polymer.pa66")}/kg ex-VAT ({BAQ}, Sep 2026; an August reading was €3.72 — the two extracts conflict)', method='direct', confidence='Low')
pfam('PBT', 'polymer.pbt', ['mat-pbt'], 'mat-pa6', f'PBT €{v("polymer.pbt")}/kg ex-VAT ({BAQ}, Sep 2026)', method='direct')
pfam('PET family', 'polymer.pet_bottle', ['mat-pet-bg', 'mat-pet-preform', 'mat-apet-tf'], 'mat-pet-bg', f'PET €{v("polymer.pet_bottle")}/kg ex-VAT ({BAQ}, Sep 2026; a general PET index, not bottle grade) × the book\'s premium over PET bottle grade', confidence='Low')
pfam('PMMA family', 'polymer.pmma', ['mat-pmma', 'mat-pmma-ext-sheet', 'mat-pmma-tf'], 'mat-pmma', f'PMMA €{v("polymer.pmma")}/kg ex-VAT ({BAQ}, Sep 2026) × the book\'s premium over PMMA')
pfam('PEEK family', 'polymer.peek', ['mat-peek', 'mat-peek-ext'], 'mat-peek', f'PEEK ≈ €{v("polymer.peek")}/kg — Victrex average selling price £68/kg (its whole mix incl. medical, so an upper bound for industrial resin)', confidence='Low')
pfam('POM', 'polymer.pom', ['mat-pom', 'mat-pom-rod'], 'mat-pom', f'POM €{v("polymer.pom")}/kg ex-VAT (Plastech monthly offer price, Sep 2026 — a distributor level) × the book\'s premium over POM', confidence='Low')
PCABS = 0.7 * v('polymer.pc') + 0.3 * v('polymer.abs')
fam('PC/ABS (floor)', PCABS, f'Resin content 0.7 × PC €{v("polymer.pc")} + 0.3 × ABS €{v("polymer.abs")} = €{PCABS:.2f}/kg',
    [src('polymer.pc'), src('polymer.abs')], 'floor', ['mat-pc-abs'])
fam('Carbon fabric (floor)', v('composite.cf_t700_12k'), f'Carbon fibre €{v("composite.cf_t700_12k")}/kg (IMARC Germany, Mar 2026, grade not stated) — a woven fabric is never below the fibre it is woven from',
    [src('composite.cf_t700_12k')], 'floor', ['mat-cf-dry-3k'])
fam('Natural rubber (raw)', v('rubber.nr'), f'TSR20 benchmark €{v("rubber.nr")}/kg (SGX, 28 Sep 2026, as reported) — FOB Asia, freight to Germany NOT added; for the book\'s raw NR line; compounds held',
    [src('rubber.nr')], 'direct', ['mat-nr'])

held = {
    'engineering bar (C45, 42CrMo4, 38MnVS6, 16MnCr5, 20MnCr5, 100Cr6, 11SMnPb30, 4140 / 4340), forging stock': 'No German mill or stockholder BASE price published; only 2026 alloy / scrap surcharges found (Frankstahl Feb 2026, Swiss Steel Steeltec) — held',
    'stainless bar (304, 316, 303, martensitic, PH, duplex)': 'Not found (surcharges only) — held',
    'electrical steel (NO / GO / CoFe / NiFe / amorphous)': 'EU minimum import price for GO only; NO grades not priced — held',
    'aluminium extrusion / machining bar and plate (6082-T6 bar, 6061 …)': 'No German bar or plate price found (the sheet floor is a rolled-products average) — held',
    'magnesium alloys (AZ91D, AM60 …)': 'No European transaction price found — held',
    'titanium, nickel superalloys, aluminium bronze, gunmetal': 'Not found — held',
    'filled / FR / blended compounds (PA66-GF30, PA6-GF30, PP-GF30, PP-TD20, TPE …), TPU, PPS, PEI, LCP, PA12': 'No compound market price found (KI compound prices are subscriber-only) — held',
    'rubber compounds (EPDM / NBR / CR / FKM / silicone …)': 'Raw polymers found (EPDM €2.83, NBR €1.93) but a compound is not its polymer — held',
    'composites (prepreg, fabrics, SMC), paint, foam cores': 'Not found — held',
}

# ── LABOUR (IG Metall ERA tables, employer social contributions 2026, 2 × 8 h) ─────────────────────────────────────────
def lab(role, std=False):
    key = f'labour.{role}.fullyLoadedEurPerHr' + ('Std' if std else '')
    return {'localPerHr': v(key), 'basis': R[key]['basis'], 'source': R[key].get('source') or R.get(f'labour.{role}.monthlyGross', {}).get('source', ''), 'research': key}
labour = {
    'categories': {**{c: lab(c) for c in ['skilled', 'semiskilled', 'foundry', 'electronics', 'inspector', 'technician', 'supervisor']},
                   'engineer': lab('engineer', std=True)},
    'grades': {'forge': lab('forge'), 'furnace': lab('furnace'), 'blow': lab('blow'), 'roto': lab('roto'), 'thermoform': lab('thermoform'), 'trim-router': lab('trimRouter')},
    'loadingIncluded': R['labour.loadingIncluded']['basis'],
    'loadingNotIncluded': R['labour.loadingNotIncluded']['basis'],
    'short': '4-cluster, 2 × 8 h, IG Metall ERA + employer social contributions',
}

# ── ENERGY ────────────────────────────────────────────────────────────────────────────────────────────────────────────
energy = {
    'electricityLocalPerKwh': v('energy.electricity.allIn'),
    'gasLocalPerKwh': v('energy.gas.allIn'),
    'basis': f'Electricity €{v("energy.electricity.allIn")}/kWh ex-VAT: {R["energy.electricity.allIn"]["basis"]} Gas €{v("energy.gas.allIn")}/kWh ex-VAT: {R["energy.gas.allIn"]["basis"]}',
    'sources': [src(k) for k in ['energy.electricity.allIn', 'energy.gas.allIn'] + [k for k in R if k.startswith('energy.') and k not in ('energy.electricity.allIn', 'energy.gas.allIn') and R[k].get('source')]][:8],
}

# ── MACHINES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
machines = {
    'hoursPerYear': v('hours.annual'),
    'hoursBasis': '2 × 8 h, Monday–Friday, 252.75 working days in 2026 (average of BW, BY, NI, NRW public holidays) = 4,044 h (the labour model\'s pattern)',
    'continuousHoursPerYear': round(252.75 * 24),
    'continuousBasis': 'three 8-hour shifts Monday–Friday, 252.75 days × 24 h = 6,066 h — for lines the UK book itself runs ≥ 6,000 h (extrusion presses, furnaces, ageing ovens, compounding lines); the plant pattern is 2 × 8 h',
    'shiftDepreciationFactor': 1.0,
    'shiftBasis': 'straight-line depreciation over the AfA life — no shift uplift on held capital',
    'lifeYears': v('life.machinery'),
    'financeRate': round(v('finance.machineryLoan') / 100, 4),
    'financeBasis': 'euro-area MFI new loans > €1 M to non-financial corporations, fixation > 10 years 3.73% (Bundesbank release, July 2026; a euro-area figure — the German-only series was not reached); ECB deposit rate 2.50% since 16 Sep 2026',
    'ukFinanceRate': 0.04,
    'maintenancePctOfCapex': 0.035,
    'maintenanceBasis': 'the library\'s own line build-up rule (3.5% of capex); no German norm found',
    'rentLocalPerM2Month': v('rent.clusterAvg'),
    'rentBasis': 'PRIME LOGISTICS headline rents (no production-space figure found): Stuttgart €8.75, Munich €11.00, Hanover/Braunschweig €6.40 (2025), Cologne €8.00 per m²/month — mean €8.54',
    'ukRentGbpPerM2Yr': 110,
    # Held capital: UK book's × 1.05 — one sourced pair, the Haas VF-2 EU list €64,995 v the UK book's US-list €61,983
    'capitalHeldFactor': round(v('capex.mach-vmc3') / 61983, 3),
    'groups': [
        {'id': 'cnc-vmc-eu', 'match': '^(mach-vmc3|mach-haas-vf2|mach-drill)$', 'refId': 'mach-vmc3', 'refCapexLocal': v('capex.mach-vmc3'),
         'basis': 'Haas VF-2SSYT-EU EU-series list €64,995 (one EUR price across the EU; machine only — delivery, installation and tooling not included)',
         'source': R['capex.mach-vmc3']['source'], 'confidence': 'Medium'},
        {'id': 'cnc-5axis-eu', 'match': '^(mach-vmc5|mach-dmg-dmu50|mach-haas-umc500)$', 'refId': 'mach-vmc5', 'refCapexLocal': v('capex.mach-vmc5'),
         'basis': 'Haas UMC-500 "from $119,995" (US list, older article) = €105,596 — no EU price found',
         'source': R['capex.mach-vmc5']['source'], 'confidence': 'Low'},
        {'id': 'al-extrusion-line-eu', 'match': '^al-ext-(press|indirect|hydrostatic)-', 'refId': 'al-ext-press-1800t', 'refCapexLocal': v('capex.al-ext-press-1800t'),
         'basis': 'a complete automatic 7-inch extrusion line incl. automation, Presezzi, about €10 M (Vimetco Extrusion, Romania, 2021–22, ALRO release); Hydro Rackwitz added an 8-inch line on a SECOND-HAND 22 MN press for €11 M (2022–23) — a floor that agrees; other press sizes scale by the book\'s own capital ratio',
         'source': R['capex.al-ext-press-1800t']['source'], 'confidence': 'Low'},
    ],
    'notRebuiltBasis': f'capex not sourced for Germany: the capital is the UK book\'s × {round(v("capex.mach-vmc3") / 61983, 3)} (Haas VF-2 EU list €64,995 v the UK book\'s US-list €61,983 — one sourced pair); the Germany operating model (2 × 8 h, AfA life, euro-area loan rate, rent, tariff, support at German wages) is applied',
}

# Al extrusion billet = LME + the DDP North Germany 6063 billet premium, over the library's LME (al-extrusion-data AL_MARKET)
LME = 3240
prem_usd = round((1070 + 1135) / 2)
cfg = {'asOf': '2026-10-12', 'label': 'Germany rate book — 4-cluster average (Baden-Württemberg, Bavaria, Lower Saxony, North Rhine-Westphalia), 2 × 8 h',
       'region': 'DE', 'currency': 'EUR', 'currencySymbol': '€', 'dir': 'scripts/rate-refresh/germany-2026-10',
       'snapshot': 'scripts/rate-refresh/germany-2026-10/current-germany-book.json', 'bookFile': 'src/engine/country-books/de.ts', 'bookConst': 'GERMANY_BOOK',
       'fxPerGbp': FX, 'labour': labour, 'energy': energy, 'machines': machines, 'materialFamilies': families, 'held': held,
       'alBilletPremiumUsdPerT': {'value': prem_usd, 'current': 1100,
                                  'basis': f'6063 billet premium DDP North Germany (Ruhr) $1,070–1,135/t (Fastmarkets, 28 Aug 2026 — the latest public print) — mid-point ${prem_usd}/t over the library LME ${LME}',
                                  **src('nonferrous.al.billet6063_premium')}}
json.dump(cfg, open(os.path.join(HERE, '..', '2026-10-germany.json'), 'w'), indent=1, ensure_ascii=False)
print(f'{len(families)} families, {sum(len(f["members"]) for f in families)} grades; billet premium ${prem_usd}/t; rent €{machines["rentLocalPerM2Month"]}/m²/month; held capital × {machines["capitalHeldFactor"]}')
