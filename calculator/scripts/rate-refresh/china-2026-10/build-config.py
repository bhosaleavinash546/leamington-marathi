"""
China rate book, October 2026 — assemble the dated config from the research files.

  python3 scripts/rate-refresh/china-2026-10/build-config.py   # writes scripts/rate-refresh/2026-10-china.json
  npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-china.json [--write]

Basis: an average of the four automotive supplier clusters (Yangtze River Delta, Pearl River Delta, Chongqing, Wuhan),
two 12-hour shifts, October 2026, CNY ex-VAT. Every figure is a research item (key, value, URL and date copied from
research/*.json) or arithmetic on research items written out in `basis`. Which grade follows which anchor, and how, is
the only judgement here; each family says what it is. Methods as the India book: direct / ladder (anchor × the frozen
UK book's grade premium over its base) / ladder-add (anchor + that premium in £/kg at the book FX — alloy content) /
floor (raised to the metal content) / held.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}
for f in ['labour-energy', 'machines', 'materials-ferrous', 'materials-nonferrous', 'materials-polymer']:
    for it in json.load(open(os.path.join(HERE, 'research', f + '.json')))['items']:
        R[it['key']] = it
# ladder bases are the FROZEN UK snapshot (the generator reads the same file)
UK = {m['id']: m['gbpPerKg'] for m in json.load(open(os.path.join(HERE, '..', 'uk-2026-10', 'current-uk-book.json')))['materials']}
FX = 8.88   # £1 = ¥8.88 (REGIONAL_DATA.CN.fxToGBP), asserted by the generator

def src(key):
    it = R[key]
    return {'research': key, 'source': it.get('source'), 'date': it.get('date')}
def v(key):
    return R[key]['value']

families = []
def fam(name, anchor, basis, sources, method, members, base=None, floor_at_anchor=False, confidence='Low', note='', proxies=None):
    families.append({'family': name, 'anchorLocalPerKg': round(anchor, 3), 'anchorBasis': basis, 'sources': sources, 'method': method,
                     'base': base, 'floorAtAnchor': floor_at_anchor, 'members': members, 'confidence': confidence, 'note': note,
                     'proxies': proxies or {}})

# ── FERROUS (Mysteel / Lange / NBS spot, Shanghai or national, ex-VAT) ───────────────────────────────────────────────
CR = v('ferrous.anchor.crc')
fam('CR coil (DC01 / DC04)', CR, 'Shanghai 1.0 mm SPCC cold-rolled spot ¥3,239/t ex-VAT (Mysteel, 9 Oct 2026)', [src('ferrous.anchor.crc')],
    'direct', ['mat-dc01', 'mat-dc04'], confidence='Medium', note='The book had DC01 ¥5.57 (UK × 0.83).')
fam('CR automotive grades', CR, 'CR spot ¥3.24 × the book\'s grade premium over its DC01/DC04 mean (£0.84); Baosteel automotive extras (DP, 22MnB5, GA, ZnMg) not found',
    [src('ferrous.anchor.crc'), src('ferrous.anchor.baosteel.auto_grades')], 'ladder',
    ['mat-dc05', 'mat-dc06', 'mat-if-dx56', 'mat-if-hs260', 'mat-bh260', 'mat-greensteel-dc01', 'mat-hsla340', 'mat-hsla420', 'mat-hsla550',
     'mat-dp600', 'mat-dp780', 'mat-dp980', 'mat-dp1000', 'mat-trip780', 'mat-cp800', 'mat-ms1200', 'mat-ms1300', 'mat-ms1500', 'mat-qp980',
     'mat-medmn1180', 'mat-22mnb5', 'mat-usibor1500', 'mat-usibor2000', 'mat-c67s-spring'], base=0.84, floor_at_anchor=True)
fam('HR pickled & oiled', v('ferrous.anchor.pickled'), 'SPHC pickled spot ¥3,142/t ex-VAT (Mysteel, Sep 2026)', [src('ferrous.anchor.pickled')], 'direct', ['mat-hrpo'], confidence='Medium')
fam('HR structural', v('ferrous.anchor.hrc'), 'Shanghai 4.75 mm Q235 HRC ¥2,885/t ex-VAT (9 Oct 2026) × the book\'s premium over HRPO; S355MC / S420MC extras not found',
    [src('ferrous.anchor.hrc')], 'ladder', ['mat-s355mc', 'mat-s420mc'], base=UK['mat-hrpo'], floor_at_anchor=True)
fam('Coated sheet', v('ferrous.anchor.hdg'), 'Shanghai 1.0 mm DX51D+Z galvanised spot ¥3,496/t ex-VAT (29 Sep 2026) × the book\'s premium over DC01 GI',
    [src('ferrous.anchor.hdg')], 'ladder', ['mat-dc01-gi', 'mat-dc03-ga', 'mat-dc01-ze', 'mat-znni-eg', 'mat-zm-coated', 'mat-tinplate-etp'],
    base=UK['mat-dc01-gi'], floor_at_anchor=True, confidence='Medium')
B45, B40CR, B42 = v('ferrous.bar.45'), v('ferrous.bar.40Cr'), v('ferrous.bar.42CrMo')
fam('45# medium-carbon bar', B45, 'Shanghai 45# (C45) round bar ¥3,257/t ex-VAT (Mysteel, 24 Sep 2026)', [src('ferrous.bar.45')], 'direct',
    ['mat-steel1045', 'mat-steel-c45', 'mat-en8'], confidence='Medium')
fam('Carbon / micro-alloyed bar', B45, '45# bar ¥3.26 × the book\'s premium over C45; 38MnVS / 1215 / A105 extras not found',
    [src('ferrous.bar.45')], 'ladder', ['mat-steel-c35', 'mat-steel1020', 'mat-steel-a105', 'mat-steel-c70s6', 'mat-steel1141', 'mat-steel-en3-bar',
                                        'mat-steel-11smnpb30', 'mat-steel-30mnvs6', 'mat-steel-38mnvs6'], base=UK['mat-steel-c45'])
fam('40Cr', B40CR, 'Shanghai 40Cr round bar ¥3,451/t ex-VAT (24 Sep 2026) — the GB equivalent of 41Cr4 / 5140', [src('ferrous.bar.40Cr')], 'direct', ['mat-steel-41cr4'], confidence='Medium')
fam('42CrMo', B42, 'Shanghai 42CrMo round bar ¥4,283/t ex-VAT (24 Sep 2026) — 42CrMo4 / 4140 (the book held the same grade at two prices)',
    [src('ferrous.bar.42CrMo')], 'direct', ['mat-steel-42crmo4', 'mat-steel4140'], confidence='Medium')
fam('Case-hardening bar', v('ferrous.bar.20CrMnTi'), 'Shanghai 20CrMnTi round bar ¥3,646/t ex-VAT (24 Sep 2026) — the GB case-hardening workhorse, used for 20MnCr5 / 16MnCr5',
    [src('ferrous.bar.20CrMnTi')], 'direct', ['mat-steel-20mncr5', 'mat-steel-16mncr5'])
fam('Bearing steel', v('ferrous.bar.GCr15'), 'GCr15 ex-mill ¥5,265/t ex-VAT (23 Sep 2026) — 52100 / 100Cr6', [src('ferrous.bar.GCr15')], 'direct', ['mat-steel-52100'])
fam('Ni-Cr-Mo / Cr-Mo alloy bar', B42, '42CrMo bar ¥4.28 × the book\'s premium over 42CrMo4 (Ni-bearing and aerospace grades: Chinese prices not found)',
    [src('ferrous.bar.42CrMo')], 'ladder', ['mat-steel4340', 'mat-steel4130', 'mat-steel8620', 'mat-steel-34crnimo6', 'mat-steel-18crnimo7-6',
                                            'mat-steel-f22', 'mat-steel-300m'], base=UK['mat-steel-42crmo4'])
B304, S316, S430 = v('ferrous.stainless.304_bar'), v('ferrous.stainless.316L_CR'), v('ferrous.stainless.430_CR')
fam('304 stainless bar', B304, '304 round bar ¥12,168/t ex-VAT (30 Sep 2026)', [src('ferrous.stainless.304_bar')], 'direct', ['mat-ss304-bar', 'mat-ss304l-bar'], confidence='Medium')
fam('303 free-machining bar', B304, '304 bar ¥12.17 × the book\'s premium of 303 over 304 bar', [src('ferrous.stainless.304_bar')], 'ladder', ['mat-ss303'], base=UK['mat-ss304-bar'])
fam('316L', S316, '316L cold-rolled coil ¥26,504/t ex-VAT (Wuxi, 30 Sep 2026); bar taken at the coil price (316L bar not found)',
    [src('ferrous.stainless.316L_CR')], 'direct', ['mat-ss316-sheet', 'mat-ss316l', 'mat-ss316l-bar'])
fam('304 sheet', (v('ferrous.stainless.304_CR_2B') + v('ferrous.stainless.304_CR_2B_tisco')) / 2,
    '304 CR 2B: Wuxi spot ¥12,146/t and Tisco cut-edge ¥13,363/t ex-VAT (Sep–Oct 2026) — mean',
    [src('ferrous.stainless.304_CR_2B'), src('ferrous.stainless.304_CR_2B_tisco')], 'direct', ['mat-ss304-sheet'], confidence='Medium')
fam('301 spring strip', (v('ferrous.stainless.304_CR_2B') + v('ferrous.stainless.304_CR_2B_tisco')) / 2, '304 sheet ¥12.75 × the book\'s premium of 301 over 304L sheet',
    [src('ferrous.stainless.304_CR_2B')], 'ladder', ['mat-ss301-spring'], base=UK['mat-ss304-sheet'])
fam('430 ferritic sheet', S430, '430 CR coil ¥6,726/t ex-VAT (9 Oct 2026)', [src('ferrous.stainless.430_CR')], 'direct', ['mat-aisi430'], confidence='Medium')
fam('409L / 441 ferritic sheet', v('ferrous.stainless.409L_CR'), '409L CR ¥6,681/t ex-VAT (Jun 2026 — stale); 441 at the book\'s premium over 409L',
    [src('ferrous.stainless.409L_CR')], 'ladder', ['mat-ss409l-sheet', 'mat-ss441-sheet'], base=UK['mat-ss409l-sheet'])
fam('Martensitic stainless bar (410 / 416 / 420 / 431)', S430, '430 CR ¥6.73 (13–17% Cr, the nearest priced chromium stainless) × the book\'s premium of each bar over 430 sheet — martensitic bar prices not found',
    [src('ferrous.stainless.430_CR')], 'ladder', ['mat-ss410-bar', 'mat-ss416-bar', 'mat-ss420-bar', 'mat-ss431-bar'], base=UK['mat-aisi430'])
E35, E50 = v('ferrous.electrical.35W300'), v('ferrous.electrical.50W800')
fam('NO electrical steel 0.35 mm', E35, '35W300 non-oriented ¥4.89–5.18/kg ex-VAT (Sep 2026; upper end used) — for M270-35A / M330-35A',
    [src('ferrous.electrical.35W300')], 'direct', ['mat-nogo-m270-35a', 'mat-m330-35a'])
fam('NO electrical steel, premium / thin / high-strength', E35, '35W300 ¥5.18 × the book\'s premium over M330-35A (Chinese 0.27–0.10 mm and HS rotor grade prices not found)',
    [src('ferrous.electrical.35W300')], 'ladder', ['mat-m235-35a', 'mat-no27-27a', 'mat-no25-25a', 'mat-no20-20a', 'mat-no15-15a', 'mat-no10-10a',
                                                   'mat-hsno-rotor-700', 'mat-hsno-rotor-960', 'mat-uhsno-1100'], base=UK['mat-m330-35a'], floor_at_anchor=True)
fam('NO electrical steel 0.50 / 0.65 mm', E50, '50W800 non-oriented ¥3,938/t ex-VAT (Sep 2026) × the book\'s premium over M700-65A, floored at 50W800',
    [src('ferrous.electrical.50W800')], 'ladder', ['mat-m700-65a', 'mat-m600-50a', 'mat-m470-50a', 'mat-nogo-m400-50a', 'mat-m250-50a', 'mat-no-semiproc-50'],
    base=UK['mat-m700-65a'], floor_at_anchor=True)
# Foundry: the casting engine adds melt energy, melt loss, line, labour, fettling, overhead and margin — the grade is the CHARGE.
GJS, GJL, WCB, CF8 = v('ferrous.charge.GJS-500-7'), v('ferrous.charge.GJL-250'), v('ferrous.charge.GS-C25'), v('ferrous.charge.CF8')
fam('Ductile / CGI / ADI / SiMo iron (charge)', GJS, f'Treated ductile charge ¥{GJS}/kg (Q10 nodular pig ¥2.80 + heavy scrap ¥2.05 + returns, RE-FeSi nodulariser + inoculant; the mix is an engineering assumption, arithmetic in research) + the book\'s grade premium in £/kg at ¥{FX}/£ (alloy content; ADI\'s austempering, which the casting engine does not add)',
    [src('ferrous.charge.GJS-500-7'), src('ferrous.foundry.pig_iron_nodular_Q10'), src('ferrous.foundry.steel_scrap_heavy')], 'ladder-add',
    ['mat-gjs500', 'mat-gjs400', 'mat-gjs450-ssf', 'mat-gjs500-14', 'mat-gjs600', 'mat-gjs700', 'mat-gjs350-lt', 'mat-simo', 'mat-adi', 'mat-gjv450', 'mat-gjv500'],
    base=UK['mat-gjs500'])
fam('Grey / malleable iron (charge)', GJL, f'Grey-iron charge ¥{GJL}/kg (Z18 casting pig ¥2.61 + heavy scrap + returns; engineering-assumption mix) × the book\'s grade premium over GJL-250',
    [src('ferrous.charge.GJL-250'), src('ferrous.foundry.pig_iron_casting_Z18')], 'ladder', ['mat-gjl250', 'mat-gjl150', 'mat-gjl200', 'mat-gjl300', 'mat-gjl350', 'mat-gjmb350'],
    base=UK['mat-gjl250'])
fam('Cast carbon / low-alloy steel (charge)', WCB, f'Steel-foundry charge ¥{WCB}/kg (heavy melting scrap ¥2.05, Mysteel 45-city, + deoxidation) + the book\'s premium in £/kg (Cr–Mo)',
    [src('ferrous.charge.GS-C25'), src('ferrous.foundry.steel_scrap_heavy')], 'ladder-add', ['mat-gs-c25', 'mat-astm-a216-wcb', 'mat-g20mn5', 'mat-g42crmo4'],
    base=UK['mat-gs-c25'])
fam('Cast stainless (charge)', CF8, f'CF8 charged as 304 scrap ¥{CF8}/kg (304 scrap ¥8.36 + melt trim; virgin-alloy upper bound ¥14.9) + the book\'s premium in £/kg (Mo / Ni / Cr)',
    [src('ferrous.charge.CF8'), src('ferrous.stainless.304_scrap')], 'ladder-add',
    ['mat-ss304-cast', 'mat-cf8m-cast', 'mat-ca6nm-cast', 'mat-cd4mcun-cast', 'mat-gx40crnisi25-20', 'mat-17-4ph-cast'], base=UK['mat-ss304-cast'])
NI = v('nonferrous.ni.spot'); CRK = v('ferrous.foundry.FeCr_HC') * 2   # ¥ per kg Cr contained (HC FeCr ~50% Cr: ¥6.90/kg → ¥13.80/kg Cr)
FESI = v('ferrous.foundry.FeSi75')
fam('Ni-Resist D-2 (charge)', 0.20 * NI + 0.02 * CRK + 0.78 * GJS, f'0.20 × Ni ¥{NI} (Changjiang, 9 Oct) + 0.02 × Cr ¥{CRK:.2f} (HC FeCr) + 0.78 × ductile charge ¥{GJS}',
    [src('nonferrous.ni.spot'), src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-ni-resist-d2'])
fam('Ni-Resist D-5S (charge)', 0.35 * NI + 0.02 * CRK + 0.04 * FESI + 0.59 * GJS, f'0.35 × Ni + 0.02 × Cr + 0.04 kg FeSi75 ¥{FESI} + 0.59 × ductile charge',
    [src('nonferrous.ni.spot')], 'direct', ['mat-ni-resist-d5s'])
fam('High-Cr white iron (charge)', 0.23 * CRK + 0.77 * GJL, f'0.23 × Cr ¥{CRK:.2f} + 0.77 × grey charge ¥{GJL}', [src('ferrous.foundry.FeCr_HC')], 'direct', ['mat-hicr-white'])

# ── NON-FERROUS (SMM / Changjiang / Mysteel, ex-VAT) ─────────────────────────────────────────────────────────────────
ADC12, A356, A00 = v('nonferrous.al.adc12'), v('nonferrous.al.a356'), v('nonferrous.al.a00')
fam('Secondary cast aluminium (ingot)', ADC12, 'SMM ADC12 ¥21,680/t ex-VAT (30 Sep 2026) × the book\'s premium over ADC12 (Mysteel Foshan A380 ¥22.30, 1 Sep, agrees)',
    [src('nonferrous.al.adc12'), src('nonferrous.al.a380')], 'ladder', ['mat-adc12', 'mat-a380', 'mat-a413', 'mat-a319', 'mat-lm4', 'mat-en-ac-46200'],
    base=UK['mat-adc12'], confidence='Medium')
fam('Secondary ADC12', ADC12, 'SMM ADC12 ¥21.68 — the book\'s "secondary" ¥18.12 sat below the market it is', [src('nonferrous.al.adc12')], 'direct', ['mat-adc12-secondary'], confidence='Medium')
fam('A356 / AlSi7Mg', A356, 'SMM A356.2 ingot ¥21,420/t ex-VAT (30 Sep 2026)', [src('nonferrous.al.a356')], 'direct', ['mat-lm25', 'mat-a365'], confidence='Medium')
fam('Primary-based cast aluminium', A356, f'A356 ¥{A356} × the book\'s premium over LM25, floored at A356 (AlSi10Mg, structural HPDC and giga-casting alloy prices not found; A00 ¥{A00})',
    [src('nonferrous.al.a356'), src('nonferrous.al.a00')], 'ladder',
    ['mat-alsi10mg', 'mat-a390', 'mat-a357', 'mat-lm6', 'mat-almg5-cast', 'mat-a206', 'mat-en-ac-45300', 'mat-lm13', 'mat-aural5', 'mat-silafont36',
     'mat-castasil37', 'mat-magsimal59', 'mat-al-hpdc-lowco2', 'mat-htf-gigacast'], base=UK['mat-lm25'], floor_at_anchor=True)
CU = v('nonferrous.cu.spot')
fam('ETP copper bar / sheet (floor)', CU, 'Changjiang 1# copper ¥98,710/t ex-VAT (30 Sep 2026) — the book\'s bar and sheet ¥96.78 were below the copper they contain',
    [src('nonferrous.cu.spot')], 'floor', ['mat-c101-bar', 'mat-c110-copper', 'mat-cu-hairpin'], confidence='Medium')
fam('Free-machining / forging brass rod', v('nonferrous.brass.HPb59-1_rod'), 'HPb59-1 brass rod ¥66,190/t ex-VAT (Ningbo, 29 Sep 2026) — CW614N / CW617N equivalent',
    [src('nonferrous.brass.HPb59-1_rod')], 'direct', ['mat-brass-cz121', 'mat-brass-cz122-forge'], confidence='Medium')
fam('70/30 and 63/37 brass sheet', v('nonferrous.brass.H62_rod'), 'H62 brass rod ¥74,340/t ex-VAT (Ningbo, 29 Sep) × the book\'s premium of CZ108 sheet — H62 is the nearest priced CuZn37',
    [src('nonferrous.brass.H62_rod')], 'direct', ['mat-cz108-brass'])
SN = v('nonferrous.sn.spot')
fam('Phosphor / tin bronze (floor)', 0.89 * CU + 0.105 * SN, f'Metal content 0.89 × Cu ¥{CU} + 0.105 × Sn ¥{SN}', [src('nonferrous.cu.spot'), src('nonferrous.sn.spot')],
    'floor', ['mat-bronze-pb1', 'mat-bronze-c905', 'mat-cusn12-cast'])
fam('Zamak 3', v('nonferrous.zn.zamak3'), 'No.3 zinc alloy ingot ¥24,020/t ex-VAT (SMM, 30 Sep 2026)', [src('nonferrous.zn.zamak3')], 'direct', ['mat-zamak3'], confidence='Medium')
fam('Zamak 5 / 2 / ZA', v('nonferrous.zn.zamak5'), 'No.5 zinc alloy ingot ¥24,520/t ex-VAT (30 Sep 2026); Zamak 2 and ZA-8 / ZA-27 × the book\'s premium over Zamak 5',
    [src('nonferrous.zn.zamak5')], 'ladder', ['mat-zamak5', 'mat-zamak2', 'mat-za8', 'mat-za27'], base=UK['mat-zamak5'], floor_at_anchor=True)
fam('Magnesium die-cast alloys', v('nonferrous.mg.az91d'), f'AZ91D ingot ¥16.02/kg ex-VAT (Jul 2026); Mg ingot ¥{v("nonferrous.mg.ingot")} (Fugu, 9 Oct) agrees; AM60 / AM50 / AE44 × the book\'s premium over AZ91D',
    [src('nonferrous.mg.az91d'), src('nonferrous.mg.ingot')], 'ladder', ['mat-mag-az91', 'mat-mag-am60', 'mat-mag-am50', 'mat-mag-ae44'], base=UK['mat-mag-az91'])

# ── POLYMERS / RUBBER (SunSirs / OilChem / Baiinfo, East / South China, ex-VAT) ─────────────────────────────────────
def pfam(name, key, members, base_id, basis, method='ladder', confidence='Medium', floor=False):
    fam(name, v(key), basis, [src(key)], method, members, base=UK[base_id] if method == 'ladder' else None, floor_at_anchor=floor, confidence=confidence)
pfam('PP family', 'polymer.pp_homo', ['mat-pp-homo', 'mat-pp', 'mat-pp-impact', 'mat-pp-bm', 'mat-pp-ext-sheet', 'mat-ppr-pipe', 'mat-pp-roto', 'mat-pp-tf'],
     'mat-pp-homo', 'PP T30S ¥8.79/kg ex-VAT (SunSirs, 1 Oct 2026) × the book\'s premium over PP homopolymer (copolymer K8003 not found)')
pfam('PE family', 'polymer.hdpe', ['mat-hdpe', 'mat-hdpe-bm', 'mat-hdpe-fuel-coex', 'mat-pe100-pipe', 'mat-pe80-pipe', 'mat-hdpe-profile', 'mat-hdpe-roto',
                                   'mat-xlpe-roto', 'mat-fr-pe-roto', 'mat-foam-pe-roto', 'mat-cond-pe-roto', 'mat-hdpe-tf', 'mat-pex-pipe'],
     'mat-hdpe', 'HDPE ¥9.27/kg ex-VAT (SunSirs, 1 Oct 2026) × the book\'s premium over HDPE')
pfam('LDPE family', 'polymer.ldpe', ['mat-ldpe', 'mat-ldpe-bm', 'mat-ldpe-tube', 'mat-ldpe-tf'], 'mat-ldpe', 'LDPE ¥9.16/kg ex-VAT (Aug 2026) × the book\'s premium over LDPE')
pfam('LLDPE family', 'polymer.lldpe', ['mat-lldpe', 'mat-lldpe-bm', 'mat-lldpe-roto'], 'mat-lldpe', 'LLDPE ¥8.31/kg ex-VAT (1 Oct 2026) × the book\'s premium over LLDPE')
pfam('PVC family', 'polymer.pvc_sg5', ['mat-upvc', 'mat-fpvc', 'mat-pvc-bm', 'mat-upvc-pipe', 'mat-pvc-cable', 'mat-upvc-window-profile', 'mat-pvcp-profile', 'mat-pvc-foam', 'mat-rpvc-tf'],
     'mat-upvc', 'PVC SG-5 resin ¥4.31/kg ex-VAT (5 Oct 2026) × the book\'s premium of each compound over uPVC')
pfam('ABS family', 'polymer.abs', ['mat-abs', 'mat-abs-ext-sheet', 'mat-abs-tf', 'mat-abs-fr'], 'mat-abs', 'ABS ¥10.01/kg ex-VAT (1 Oct 2026) × the book\'s premium over ABS')
pfam('PS', 'polymer.ps', ['mat-gpps', 'mat-hips', 'mat-gpps-ext'], 'mat-gpps', 'PS ¥9.85/kg ex-VAT (5 Oct 2026) × the book\'s premium over GPPS')
pfam('PC family', 'polymer.pc', ['mat-pc', 'mat-pc-glazing', 'mat-pc-bm', 'mat-pc-ext-sheet', 'mat-pc-tf'], 'mat-pc', 'PC ¥11.12/kg ex-VAT (Jul 2026; still falling in Sep) × the book\'s premium over PC')
pfam('PA6 family', 'polymer.pa6_chips', ['mat-pa6', 'mat-pa6-bm', 'mat-pa6-ext-tube'], 'mat-pa6', 'PA6 chips ¥10.47/kg ex-VAT (Jul 2026) × the book\'s premium over PA6')
pfam('PA66', 'polymer.pa66_chips', ['mat-pa66'], 'mat-pa66', 'PA66 chips ¥16.90/kg ex-VAT (producer offers, 22 Sep 2026)', method='direct')
pfam('POM', 'polymer.pom', ['mat-pom', 'mat-pom-rod'], 'mat-pom', 'POM ¥11.54/kg ex-VAT (Jun 2026) × the book\'s premium over POM')
pfam('PBT', 'polymer.pbt', ['mat-pbt'], 'mat-pbt', 'PBT ≤ ¥8.85/kg ex-VAT (Q2 2026: OilChem — trades below ¥10,000/t incl. VAT; a ceiling)', method='direct', confidence='Low')
pfam('PET family', 'polymer.pet_bottle', ['mat-pet-bg', 'mat-pet-preform', 'mat-apet-tf'], 'mat-pet-bg', 'PET bottle chip ¥7.74/kg ex-VAT (1 Oct 2026) × the book\'s premium over PET bottle grade')
pfam('PMMA family', 'polymer.pmma', ['mat-pmma', 'mat-pmma-ext-sheet', 'mat-pmma-tf'], 'mat-pmma', 'PMMA ¥13.36/kg ex-VAT (30 Sep 2026) × the book\'s premium over PMMA')
pfam('TPU family', 'polymer.tpu', ['mat-tpu-shore85', 'mat-tpu-ext-hose'], 'mat-tpu-shore85', 'TPU (Wanhua 1565A) ¥15.75/kg ex-VAT (30 Sep 2026) × the book\'s premium over TPU 85A')
pfam('PEEK family', 'polymer.peek', ['mat-peek', 'mat-peek-ext'], 'mat-peek', 'PEEK ≈ ¥247/kg ex-VAT — 中研股份 FY2025 PEEK revenue ÷ tonnes sold (a domestic producer ASP, derived)', confidence='Low')
fam('Natural rubber (raw)', v('rubber.nr'), 'SCRWF / NR ¥16.90/kg ex-VAT (SunSirs, 6 Oct 2026) for the book\'s raw NR SMR20 line; compounds held', [src('rubber.nr')], 'direct', ['mat-nr'], confidence='Medium')

held = {
    'grain-oriented, cobalt-iron, nickel-iron, amorphous electrical steel': 'No Chinese 2026 price found — held',
    'PH / duplex stainless bar (17-4PH, 15-5PH, 2205)': 'Not found — held',
    'wrought aluminium sheet / plate / forging stock': '5052 conversion fee ¥2.5–2.7k/t is a 2025 figure; 6061 plate fee not found — held (extrusion billets move by the billet premium)',
    'titanium, nickel superalloys': 'TC4 ingot ¥56/kg and sponge ¥39/kg found, but no dated bar price (the book bar ¥324–406 is a conversion product) — held and flagged',
    'aluminium bronze, gunmetal, cast brass': 'Not found — held',
    'filled / FR / blended compounds, TPE / TPV, PPS, PEI, LCP, PA12 and other engineering grades without an anchor': 'Only a branded PA66-GF30 trade article (¥31) — held',
    'rubber compounds (EPDM / NBR / CR / FKM / silicone 70 Shore A …)': 'Raw polymers found (SBR ¥12.2, NBR ¥14.3, EPDM ¥22.8, CR ¥32.7) but a compound is not its polymer — held',
    'composites (prepreg, fabrics, SMC), paint, foam cores, engineering-plastic stock shapes': 'Carbon fibre (2025), epoxy E-51 ¥12.6 and E-glass roving ¥3.16 found; the book lines are fabrics / prepregs / systems — held',
}

# ── LABOUR (NBS 2025 + recruiter data, two 12-h shifts, social insurance at the floor) ────────────────────────────────
def lab(role, std=False):
    key = f'labour.{role}.fullyLoadedCnyPerHr' + ('Std' if std else '')
    return {'localPerHr': v(key), 'basis': R[key]['basis'], 'source': R[key].get('source') or R.get(f'labour.{role}.monthlyGross', {}).get('source', ''), 'research': key}
labour = {
    'categories': {**{c: lab(c) for c in ['skilled', 'semiskilled', 'foundry', 'electronics', 'inspector', 'technician', 'supervisor']},
                   'engineer': lab('engineer', std=True)},
    'grades': {'forge': lab('forge'), 'furnace': lab('furnace'), 'blow': lab('blow'), 'roto': lab('roto'), 'thermoform': lab('thermoform'), 'trim-router': lab('trimRouter')},
    'loadingIncluded': 'pay incl. overtime (150% weekday, 200% rest day) and a 13th month; employer pension 16%, medical, unemployment, injury and housing fund at the city contribution floor; two 12-h shifts = 3,113 productive h/yr (24 days/month × 11 h worked, less 5 days leave)',
    'loadingNotIncluded': 'meal / dorm allowances, training, absenteeism, severance accrual; social insurance on actual pay (≈ +¥1.3/h) — not sourced',
    'short': '4-cluster, 2 × 12 h, social insurance at the floor',
}
for k in ['skilled', 'semiskilled', 'foundry', 'electronics', 'inspector', 'technician', 'supervisor', 'engineer']:
    if not labour['categories'][k]['source']:
        labour['categories'][k]['source'] = 'https://www.stats.gov.cn/'

# ── ENERGY ────────────────────────────────────────────────────────────────────────────────────────────────────────────
energy = {
    'gasLocalPerKwh': v('energy.gas.clusterAvg'),
    'electricityLocalPerKwh': 0.63,
    'basis': 'Gas: non-residential pipeline gas, Shanghai ¥4.12 / Wuxi ¥3.86 / Guangzhou ¥4.47 (2025) / Chongqing ¥3.37 (seasonal mean) / Wuhan ¥3.71 per m³ incl. 9% VAT — cluster mean ¥3.88 ÷ 1.09 ÷ 10 kWh/m³ = ¥0.356/kWh (NDRC 36-city industrial average ¥0.328 agrees); the book had ¥0.27. Electricity HELD at ¥0.63: the national Sep 2026 1–10 kV TOU average for a 24-h two-shift load is ¥0.594 ex-VAT (¥0.672 incl.), Chongqing ¥0.724 — the book sits inside; provincial all-in averages for Shanghai, Jiangsu, Guangdong, Hubei not found',
    'sources': [src('energy.gas.clusterAvg'), src('energy.gas.national36CityIndustrial'), src('energy.electricity.clusterAvg'), src('energy.electricity.Chongqing')],
}

# ── MACHINES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
rent = (v('rent.shanghaiSuzhou') + 19.0) / 2
machines = {
    'hoursPerYear': 6336,
    'hoursBasis': 'two 12-h shifts × 11 h worked × 24 days/month × 12 = 6,336 h (the labour model\'s pattern)',
    'shiftDepreciationFactor': 1.0,
    'shiftBasis': 'PRC straight-line (time-based) depreciation — no shift uplift on held capital',
    'lifeYears': v('life.machinery'),
    'financeRate': v('finance.lpr5y') / 100,
    'financeBasis': 'PBoC 5-year LPR 3.5% (20 Sep 2026; 1-year 3.0%) — the book\'s line build-ups use 4% on half the capex',
    'ukFinanceRate': 0.04,
    'maintenancePctOfCapex': 0.035,
    'maintenanceBasis': 'the library\'s own line build-up rule (3.5% of capex); no Chinese norm found',
    'rentLocalPerM2Month': round(rent, 2),
    'rentBasis': 'JLL Shanghai logistics rent Q2 2026 ¥31.94/m²/month (a ceiling for a factory) and Dongguan factory rents ¥10–28 (midpoint ¥19; estate-agent article, 2025) — mean; Wuhan / Chongqing averages not found (Chongqing listings ¥4–12 suggest this is high for the inland clusters)',
    'ukRentGbpPerM2Yr': 110,
    'capitalHeldFactor': 0.55,
    'groups': [
        {'id': 'cnc-vmc-domestic', 'match': '^(mach-vmc3|mach-haas-vf2|mach-drill)$', 'refId': 'mach-vmc3', 'refCapexLocal': v('capex.mach-vmc3'),
         'basis': 'Haitian Precision 海天精工 2025 VMC average selling price ¥287,817 ex-VAT (¥841M ÷ 2,922 units); delivery, options and installation not in it',
         'source': R['capex.mach-vmc3']['source'], 'confidence': 'Medium'},
        {'id': 'cnc-lathe-domestic', 'match': '^(mach-lathe-cnc|mach-mazak-qt200)$', 'refId': 'mach-lathe-cnc', 'refCapexLocal': v('capex.mach-lathe-cnc'),
         'basis': 'Headman 浙海德曼 2025 slant-bed CNC lathe ¥215,423 (¥609M ÷ 2,827 units produced — an approximation)',
         'source': R['capex.mach-lathe-cnc']['source'], 'confidence': 'Low'},
        {'id': 'cnc-5axis-domestic', 'match': '^(mach-vmc5|mach-dmg-dmu50|mach-haas-umc500)$', 'refId': 'mach-vmc5', 'refCapexLocal': v('capex.mach-vmc5'),
         'basis': 'KEDE 科德数控 2024 five-axis average transaction price ¥2.4251M ex-VAT (its mix runs to large machines — top of range; Nawi IPO ¥2.0M)',
         'source': R['capex.mach-vmc5']['source'], 'confidence': 'Low'},
    ],
    'notRebuiltBasis': 'capex not sourced for China: the book\'s capital (UK × 0.55) is HELD; the China operating model (2 × 12 h hours, straight-line, LPR finance, rent, tariff, support at China wages) is applied',
}

# Al extrusion billet = A00 + the 6063 billet processing fee, over the library's LME (al-extrusion-data AL_MARKET)
LME, USD_PER_GBP = 3240, 1.3285
cny_per_usd = FX / USD_PER_GBP
billet_usd = (A00 + v('nonferrous.al.billet6063_premium')) / cny_per_usd * 1000
cfg = {'asOf': '2026-10-10', 'label': 'China rate book — 4-cluster average (Yangtze / Pearl River deltas, Chongqing, Wuhan), 2 × 12 h',
       'region': 'CN', 'currency': 'CNY', 'currencySymbol': '¥', 'dir': 'scripts/rate-refresh/china-2026-10',
       'snapshot': 'scripts/rate-refresh/china-2026-10/current-china-book.json', 'bookFile': 'src/engine/country-books/cn.ts', 'bookConst': 'CHINA_BOOK',
       'fxPerGbp': FX, 'labour': labour, 'energy': energy, 'machines': machines, 'materialFamilies': families, 'held': held,
       'alBilletPremiumUsdPerT': {'value': round(billet_usd - LME), 'current': -186,
                                  'basis': f'A00 ¥{A00}/kg (Changjiang Sep 2026 avg) + 6063 billet fee ¥{v("nonferrous.al.billet6063_premium")}/kg (Foshan, Sep 2026), ex-VAT = ${billet_usd:.0f}/t at ¥{cny_per_usd:.3f}/$ — over the library LME ${LME}',
                                  **src('nonferrous.al.billet6063_premium')}}
json.dump(cfg, open(os.path.join(HERE, '..', '2026-10-china.json'), 'w'), indent=1, ensure_ascii=False)
print(f'{len(families)} families, {sum(len(f["members"]) for f in families)} grades; billet premium ${cfg["alBilletPremiumUsdPerT"]["value"]}/t; rent ¥{rent:.2f}/m²/month')
