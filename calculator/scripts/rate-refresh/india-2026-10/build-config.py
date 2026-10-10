"""
India rate book, October 2026 — assemble the dated config from the research files.

  python3 scripts/rate-refresh/india-2026-10/build-config.py   # writes scripts/rate-refresh/2026-10-india.json

Every figure in the config is either a research item (its key, value, URL and date are copied from research/*.json)
or arithmetic on research items written out in `basis`. The mapping below — which grade takes which anchor, and how —
is the only judgement here, and each family says what it is. `scripts/country-book.ts` turns the config into the
engine's India book; it computes nothing that is not written here.

Pricing methods, per grade:
  direct  — the grade IS the research item (or its stated arithmetic).
  ladder  — India anchor × (the book's UK price of this grade ÷ the book's UK price of the family's base grade): the
            India market level, the book's grade premium. Used where India grade extras were not found.
  floor   — the book's India price was below the metal the grade contains; raised to that metal content.
  held    — no India evidence, or the evidence agrees with the book: unchanged, with the reason (the push-back).
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}
for f in ['labour-energy', 'machines', 'materials-ferrous', 'materials-nonferrous', 'materials-polymer']:
    d = json.load(open(os.path.join(HERE, 'research', f + '.json')))
    for it in d['items']:
        R[it['key']] = it
cur = json.load(open(os.path.join(HERE, 'current-india-book.json')))
UK = {m['id']: m['ukGbpPerKg'] for m in cur['materials']}
FX = 127.2   # £1 = ₹127.2: the FX the India book's £ figures are held at (REGIONAL_DATA.IN.fxToGBP), asserted by the generator

def src(key):
    it = R[key]
    return {'research': key, 'source': it.get('source'), 'date': it.get('date')}

families = []
def fam(name, anchor_inr, anchor_basis, sources, method, members, base=None, floor_at_anchor=False, confidence='Low', note='', proxies=None):
    families.append({'family': name, 'anchorInrPerKg': round(anchor_inr, 2), 'anchorBasis': anchor_basis, 'sources': sources,
                     'method': method, 'base': base, 'floorAtAnchor': floor_at_anchor, 'members': members,
                     'confidence': confidence, 'note': note, 'proxies': proxies or {}})

# ── FERROUS ───────────────────────────────────────────────────────────────────
CR = R['ferrous.anchor.crc_0.63mm_jpc_retail_4metro']['value'] / 1000
HR = R['ferrous.anchor.hrc_2mm_jpc_retail_4metro']['value'] / 1000
GP = R['ferrous.anchor.gp_0.63mm_jpc_retail_4metro']['value'] / 1000
HRPO = R['ferrous.anchor.hrpo_derived']['value']
fam('CR coil (commodity CRCA)', CR, 'JPC / Ministry of Steel retail, Sep 2026, 4-metro average, CR coil 0.63 mm, ₹84,972/t incl. GST ÷ 1.18',
    [src('ferrous.anchor.crc_0.63mm_jpc_retail_4metro')], 'direct', ['mat-dc01', 'mat-dc04'], confidence='Medium',
    note='DC01 and DC04 both at the commodity CR price: the book had DC01 ₹103 ABOVE the deeper-drawing DC04 ₹87.')
fam('CR automotive grades', CR, 'CR anchor (JPC Sep 2026) × the book\'s grade premium over its DC01/DC04 mean (£0.84/kg UK); India grade extras for IF / HSLA / DP / TRIP / CP / MS / PHS not found',
    [src('ferrous.anchor.crc_0.63mm_jpc_retail_4metro'), src('ferrous.extra.flat.automotive_grades')], 'ladder',
    ['mat-dc05', 'mat-dc06', 'mat-if-dx56', 'mat-if-hs260', 'mat-bh260', 'mat-greensteel-dc01', 'mat-hsla340', 'mat-hsla420',
     'mat-hsla550', 'mat-dp600', 'mat-dp780', 'mat-dp980', 'mat-dp1000', 'mat-trip780', 'mat-cp800', 'mat-ms1200', 'mat-ms1300',
     'mat-ms1500', 'mat-qp980', 'mat-medmn1180', 'mat-22mnb5', 'mat-usibor1500', 'mat-usibor2000', 'mat-c67s-spring'],
    base=0.84, floor_at_anchor=True)
fam('HR pickled & oiled', HRPO, 'HR coil JPC Sep 2026 ₹64.48 + HRPO extra ₹6.70 (Tata Nexarc Mumbai HRPO May 2026 − BigMint HRC May 2026)',
    [src('ferrous.anchor.hrpo_derived'), src('ferrous.extra.flat.hrpo_over_hrc')], 'direct', ['mat-hrpo'], confidence='Medium')
fam('HR structural', HR, 'HR coil JPC Sep 2026 (₹76,085/t incl. GST ÷ 1.18) × the book\'s premium over HRPO; S355MC / S420MC extras not found',
    [src('ferrous.anchor.hrc_2mm_jpc_retail_4metro')], 'ladder', ['mat-s355mc', 'mat-s420mc'], base=UK['mat-hrpo'], floor_at_anchor=True)
fam('Coated sheet', GP, 'GP sheet 0.63 mm JPC Sep 2026 (₹94,148/t incl. GST ÷ 1.18) × the book\'s premium over DC01 GI; coating-grade extras not found',
    [src('ferrous.anchor.gp_0.63mm_jpc_retail_4metro')], 'ladder',
    ['mat-dc01-gi', 'mat-dc03-ga', 'mat-dc01-ze', 'mat-znni-eg', 'mat-zm-coated', 'mat-tinplate-etp'], base=UK['mat-dc01-gi'], floor_at_anchor=True)
BAR = R['ferrous.anchor.en8_c45_round_bar_black']['value']
fam('Carbon / alloy bar and forging stock', BAR, 'BigMint EN8 / C45 black round bar 110–150 mm ex-Mumbai ₹72,750/t (22 Apr 2026, latest found) × the book\'s grade premium over C45 billet; alloy-bar and bright-bar extras not found',
    [src('ferrous.anchor.en8_c45_round_bar_black'), src('ferrous.extra.long.alloy_bar_grades')], 'ladder',
    ['mat-en8', 'mat-steel1045', 'mat-steel-c45', 'mat-steel-c35', 'mat-steel1020', 'mat-steel-a105', 'mat-steel-c70s6', 'mat-steel1141',
     'mat-steel-en3-bar', 'mat-steel-11smnpb30', 'mat-steel-30mnvs6', 'mat-steel-38mnvs6', 'mat-steel-42crmo4', 'mat-steel4140',
     'mat-steel4340', 'mat-steel4130', 'mat-steel8620', 'mat-steel-20mncr5', 'mat-steel-16mncr5', 'mat-steel-41cr4',
     'mat-steel-34crnimo6', 'mat-steel-18crnimo7-6', 'mat-steel-52100', 'mat-steel-f22', 'mat-steel-300m'],
    base=UK['mat-steel-c45'], floor_at_anchor=True, proxies={'mat-steel4140': 'mat-steel-42crmo4'},
    note='mat-steel4140 (bar) takes the 42CrMo4 premium: the book held the same grade at ₹137 and ₹182.')
SS316B = R['ferrous.anchor.ss316l_black_round_bar_mumbai']['value']
fam('Stainless forging bar', SS316B, 'BigMint SS 316L black round bar ex-Mumbai ₹340,000/t (~Jun 2026) × the book\'s grade premium over 316L forging bar; other stainless bar prices not found in India',
    [src('ferrous.anchor.ss316l_black_round_bar_mumbai')], 'ladder',
    ['mat-ss316l-bar', 'mat-ss304l-bar', 'mat-ss410-bar', 'mat-ss420-bar', 'mat-ss431-bar', 'mat-ss17-4ph-bar', 'mat-ss15-5ph-bar', 'mat-ss2205-bar'],
    base=UK['mat-ss316l-bar'])
fam('Stainless machining bar', SS316B, 'BigMint SS 316L black round bar ₹340/kg (~Jun 2026) × the book\'s premium over its 316L machining bar',
    [src('ferrous.anchor.ss316l_black_round_bar_mumbai')], 'ladder',
    ['mat-ss316l', 'mat-ss304-bar', 'mat-ss303', 'mat-ss416-bar'], base=UK['mat-ss316l'])
fam('316L sheet', R['ferrous.anchor.ss316_hrc_mumbai']['value'], 'BigMint 316 HR coil ex-Mumbai ₹395,000/t (~Jun 2026); CR extra not found',
    [src('ferrous.anchor.ss316_hrc_mumbai')], 'direct', ['mat-ss316-sheet'])
SS304 = (215 + 224) / 2
fam('304L sheet', SS304, '304 CR coil narrow Mumbai ₹215/kg (Nexizo, 1 Jul 2026) and a stockist ₹224/kg — mean; aggregator evidence, low confidence',
    [src('ferrous.anchor.ss304_crc_narrow_mumbai')], 'direct', ['mat-ss304-sheet'])
fam('301 spring strip', SS304, '304L sheet ₹219.5 × the book\'s premium of 301 spring strip over 304L sheet',
    [src('ferrous.anchor.ss304_crc_narrow_mumbai')], 'ladder', ['mat-ss301-spring'], base=UK['mat-ss304-sheet'])
FERR = R['ferrous.anchor.ss430_409l_china_reference']['value']
f430 = sum(FERR['430_2B']) / 2 * 1.0825
f409 = sum(FERR['409L_2B/2D']) / 2 * 1.0825
fam('430 ferritic sheet', f430, f'China 430 2B ₹{sum(FERR["430_2B"])/2:.1f}/kg (9 Sep 2026 reference, before freight) × 1.0825 (BCD 7.5% + SWS 0.75%) — import parity, freight not added',
    [src('ferrous.anchor.ss430_409l_china_reference')], 'direct', ['mat-aisi430'])
fam('409L / 441 ferritic sheet', f409, f'China 409L ₹{sum(FERR["409L_2B/2D"])/2:.1f}/kg × 1.0825 duty — import parity; 441 at the book\'s premium over 409L',
    [src('ferrous.anchor.ss430_409l_china_reference')], 'ladder', ['mat-ss409l-sheet', 'mat-ss441-sheet'], base=UK['mat-ss409l-sheet'])
# Foundry: the casting module prices the METAL CHARGE; melt energy, melt labour, melt loss, line, fettling, overhead and
# margin are added by the engine. The book's casting £/kg was a delivered foundry price ("index + alloying + melt/cast/
# finish stockholder margin", CASTING PRICING BASIS) — that margin was counted twice.
GJS = R['ferrous.charge.gjs500_7']['value'][1]
fam('Ductile / CGI / ADI / SiMo iron (charge)', GJS, 'Metallic charge for GJS-500-7, mix A (60% pig iron ₹47.05 + steel scrap ₹39.8 + returns at charge cost; KTU ductile charge study) = ₹46.01/kg, the upper of the two mixes; FeSiMg and inoculant not priced (not found) × the book\'s grade premium over GJS-500-7',
    [src('ferrous.charge.gjs500_7'), src('ferrous.anchor.pig_iron_foundry_grade'), src('ferrous.anchor.scrap_cr_busheling_lowmn')], 'ladder',
    ['mat-gjs500', 'mat-gjs400', 'mat-gjs450-ssf', 'mat-gjs500-14', 'mat-gjs600', 'mat-gjs700', 'mat-gjs350-lt', 'mat-simo', 'mat-adi', 'mat-gjv450', 'mat-gjv500'],
    base=UK['mat-gjs500'])
GJL = R['ferrous.charge.gjl250']['value']
fam('Grey / malleable iron (charge)', GJL, 'Metallic charge for GJL-250 ₹42.6/kg (40% steel scrap + 20% pig iron + returns; the mix is a CostVision engineering assumption — no Indian grey-iron charge mix found) × the book\'s grade premium over GJL-250',
    [src('ferrous.charge.gjl250')], 'ladder', ['mat-gjl250', 'mat-gjl150', 'mat-gjl200', 'mat-gjl300', 'mat-gjl350', 'mat-gjmb350'], base=UK['mat-gjl250'])
WCB = R['ferrous.charge.wcb_gs_c25']['value']
fam('Cast carbon / low-alloy steel (charge)', WCB, 'Steel-foundry charge ₹38.25/kg (melting scrap: Chennai foundry plate ₹38.6, Alang HMS ₹36.5 + deoxidation) × the book\'s premium over GS-C25',
    [src('ferrous.charge.wcb_gs_c25')], 'ladder', ['mat-gs-c25', 'mat-astm-a216-wcb', 'mat-g20mn5', 'mat-g42crmo4'], base=UK['mat-gs-c25'])
fam('Hadfield Mn steel (charge)', R['ferrous.charge.hadfield_mn12']['value'], '12% Mn via HC FeMn 70% (₹79.2) + steel scrap', [src('ferrous.charge.hadfield_mn12')], 'direct', ['mat-hadfield'])
fam('High-Cr white iron (charge)', R['ferrous.charge.hicr_white_iron']['value'], '23% Cr via HC FeCr 60% (₹122.2) + grey-iron metallic charge', [src('ferrous.charge.hicr_white_iron')], 'direct', ['mat-hicr-white'])
fam('Ni-Resist D-2 (charge)', R['ferrous.charge.ni_resist_d2']['value'], '20% Ni at MCX nickel ₹1,625.5 + 2% Cr + iron units', [src('ferrous.charge.ni_resist_d2')], 'direct', ['mat-ni-resist-d2'])
fam('Ni-Resist D-5S (charge)', R['ferrous.charge.ni_resist_d5s']['value'], '35% Ni at MCX nickel + Cr + Si + iron units', [src('ferrous.charge.ni_resist_d5s')], 'direct', ['mat-ni-resist-d5s'])
fam('Cast stainless (charge)', R['ferrous.charge.cf8']['value'], 'CF8 charged as 304 scrap ₹145/kg DAP Delhi (SMM, 21 Aug 2026) × the book\'s premium over CF8',
    [src('ferrous.charge.cf8'), src('ferrous.anchor.ss304_scrap_delhi')], 'ladder',
    ['mat-ss304-cast', 'mat-cf8m-cast', 'mat-ca6nm-cast', 'mat-cd4mcun-cast', 'mat-gx40crnisi25-20', 'mat-17-4ph-cast'], base=UK['mat-ss304-cast'])

# ── NON-FERROUS ───────────────────────────────────────────────────────────────
ADC12 = (R['nonferrous.anchor.aluminium.ADC12.mumbai']['value'] + R['nonferrous.anchor.aluminium.ADC12.delhi']['value']) / 2 / 1000
fam('Cast aluminium alloys', ADC12, 'ADC12 alloy ingot, SMM 7 Oct 2026: Mumbai ₹305,000/t, Delhi ₹304,750/t (an automaker bought at ₹304,500/t) — mean; ADC12, A380 and secondary ADC12 are the same Indian market (made from scrap). Other alloys × the book\'s premium over ADC12 (India LM6 / LM25 / A356 / AlSi10Mg ingot prices not found)',
    [src('nonferrous.anchor.aluminium.ADC12.mumbai'), src('nonferrous.anchor.aluminium.ADC12.delhi')], 'ladder',
    ['mat-adc12', 'mat-a380', 'mat-alsi10mg', 'mat-a365', 'mat-a413', 'mat-a319', 'mat-a390', 'mat-a357', 'mat-lm25', 'mat-lm6', 'mat-lm4',
     'mat-almg5-cast', 'mat-a206', 'mat-en-ac-46200', 'mat-en-ac-45300', 'mat-lm13', 'mat-aural5', 'mat-silafont36', 'mat-castasil37',
     'mat-magsimal59', 'mat-al-hpdc-lowco2', 'mat-htf-gigacast'], base=UK['mat-adc12'], confidence='Medium')
fam('Secondary ADC12', ADC12, 'Same Indian ADC12 market (SMM 7 Oct 2026): Indian ADC12 is scrap-based — the book\'s ₹248 "secondary" sat ₹57 below it',
    [src('nonferrous.anchor.aluminium.ADC12.mumbai')], 'direct', ['mat-adc12-secondary'], confidence='Medium')
CU = R['nonferrous.anchor.copper.oct2026Derived']['value']
fam('ETP copper bar / sheet (floor)', CU, 'Copper cathode ₹1,385/kg (MCX ₹1,384.75, 11 Sep 2026; Oct ≈ $6.49/lb) — the book\'s ETP bar ₹1,370 and sheet ₹1,336 were below the copper they contain; conversion premium not found, so floored at metal',
    [src('nonferrous.anchor.copper.oct2026Derived'), src('nonferrous.anchor.copper.mcx')], 'floor', ['mat-c101-bar', 'mat-c110-copper'])
fam('Aluminium bronze AB2 (floor)', R['nonferrous.check.AB2_CuAl10Ni5Fe5.metalContent']['value'], 'Metal content of CuAl10Ni5Fe5 ≈ ₹1,225/kg (Cu + Al + Ni + Fe at the anchors) — the book\'s AB2 casting ₹1,183 was below it',
    [src('nonferrous.check.AB2_CuAl10Ni5Fe5.metalContent')], 'floor', ['mat-ab2-cast', 'mat-ab2-forge'])

# ── POLYMERS / RUBBER ─────────────────────────────────────────────────────────
PP = (R['polymer.anchor.pp_raffia.delhi_exgodown.2026-09-25']['value'] + R['polymer.anchor.pp.india_index.2026-09']['value']) / 2
fam('PP family', PP, 'PP: Delhi ex-godown ₹131.0 (Credco, 25 Sep 2026) and India index ₹127.7 (IMARC, Sep 2026) — mean; grades × the book\'s premium over PP homopolymer',
    [src('polymer.anchor.pp_raffia.delhi_exgodown.2026-09-25'), src('polymer.anchor.pp.india_index.2026-09')], 'ladder',
    ['mat-pp-homo', 'mat-pp', 'mat-pp-impact', 'mat-pp-bm', 'mat-pp-ext-sheet',
     'mat-ppr-pipe', 'mat-pp-roto', 'mat-pp-tf'], base=UK['mat-pp-homo'], confidence='Medium')
HDPE = (135.5 + 136.5) / 2
fam('PE family', HDPE, 'HDPE: Delhi ex-godown GAIL ₹135.5, Haldia ₹136.5 (Credco, 25 Sep 2026) — mean; LDPE / LLDPE / blow / pipe / roto / sheet grades × the book\'s premium over HDPE',
    [src('polymer.anchor.hdpe_raffia.delhi_exgodown.2026-09-25')], 'ladder',
    ['mat-hdpe', 'mat-ldpe', 'mat-lldpe', 'mat-hdpe-bm', 'mat-hdpe-fuel-coex', 'mat-ldpe-bm', 'mat-lldpe-bm', 'mat-pe100-pipe', 'mat-pe80-pipe',
     'mat-hdpe-profile', 'mat-ldpe-tube', 'mat-hdpe-roto', 'mat-lldpe-roto', 'mat-xlpe-roto', 'mat-fr-pe-roto', 'mat-foam-pe-roto',
     'mat-cond-pe-roto', 'mat-hdpe-tf', 'mat-ldpe-tf', 'mat-pex-pipe'], base=UK['mat-hdpe'], confidence='Medium')
PVC = (108.0 + 96.5) / 2
fam('PVC family', PVC, 'PVC K67: Delhi ex-godown ₹108.0 and Hygain ₹96.5 (Credco, 25 Sep 2026) — mean; compounds × the book\'s premium over uPVC',
    [src('polymer.anchor.pvc_k67.delhi_exgodown.2026-09-25')], 'ladder',
    ['mat-upvc', 'mat-fpvc', 'mat-pvc-bm', 'mat-upvc-pipe', 'mat-pvc-cable', 'mat-upvc-window-profile', 'mat-pvcp-profile', 'mat-pvc-foam', 'mat-rpvc-tf'],
    base=UK['mat-upvc'], confidence='Medium')
fam('PET', R['polymer.anchor.pet_bottle.india_index.2026-09']['value'], 'PET bottle chip, India index ₹104.5 (Sep 2026)',
    [src('polymer.anchor.pet_bottle.india_index.2026-09')], 'ladder', ['mat-pet-bg', 'mat-pet-preform', 'mat-apet-tf'], base=UK['mat-pet-bg'])
fam('ABS family', R['polymer.anchor.abs.india_index.2026-09']['value'], 'ABS India index ₹165.4 (Business Analytiq, Sep 2026)',
    [src('polymer.anchor.abs.india_index.2026-09')], 'ladder', ['mat-abs', 'mat-abs-ext-sheet', 'mat-abs-tf'], base=UK['mat-abs'])
PC = R['polymer.anchor.pc.cif_india.2026-07']['value'] * 1.0825
fam('PC family', PC, 'PC CIF India ₹200.2 (Jul 2026) × 1.0825 (BCD 7.5% + SWS, back in force from 1 Jul 2026); domestic May average ₹211 agrees',
    [src('polymer.anchor.pc.cif_india.2026-07'), src('polymer.import_duty.chapter39')], 'ladder',
    ['mat-pc', 'mat-pc-glazing', 'mat-pc-bm', 'mat-pc-ext-sheet', 'mat-pc-tf'], base=UK['mat-pc'])
PA6 = R['polymer.anchor.pa6.cif_india.2026-06']['value'] * 1.0825
fam('PA6 family', PA6, 'PA6 CIF India ₹193.4 (Jun 2026, Plastemart) × 1.0825 duty; a second source reads higher (₹259) — the lower, dated figure is used',
    [src('polymer.anchor.pa6.cif_india.2026-06'), src('polymer.import_duty.chapter39')], 'ladder',
    ['mat-pa6', 'mat-pa6-bm', 'mat-pa6-ext-tube'], base=UK['mat-pa6'])
PA66 = R['polymer.anchor.pa66.cif_india.2026-06']['value'] * 1.0825
fam('PA66 family', PA66, 'PA66 CIF India ₹266.0 (Jun 2026, Plastemart) × 1.0825 duty',
    [src('polymer.anchor.pa66.cif_india.2026-06'), src('polymer.import_duty.chapter39')], 'ladder',
    ['mat-pa66'], base=UK['mat-pa66'])
fam('PBT family', R['polymer.anchor.pbt.india_index.2026-09']['value'], 'PBT India index ₹248.6 (Business Analytiq, Sep 2026); moderate confidence',
    [src('polymer.anchor.pbt.india_index.2026-09')], 'ladder', ['mat-pbt'], base=UK['mat-pbt'])
fam('Natural rubber (raw)', R['rubber.nr_rss4.kottayam.2026-09-26']['value'], 'RSS-4 Kottayam ₹278/kg (Rubber Board figure, 26 Sep 2026) for the book\'s raw NR SMR20 line; compounds (70 Shore A) held',
    [src('rubber.nr_rss4.kottayam.2026-09-26')], 'direct', ['mat-nr'], confidence='Medium')

# ── HELD (the push-back register: no India evidence, or the evidence agrees) ──────────────────────────────────────
held = {
    'electrical steel (25 grades)': 'Only a 2025 CRNO CFR-India print and an unspecified IMARC figure — no 2026 India grade prices; held',
    'wrought aluminium sheet / bar / forging stock': 'P1020 ₹352–362/kg (Hindalco Aug 2026; Oct derived) is below every book grade (conversion premium ₹20–90/kg); India rolling / extrusion premiums not found; held',
    'brass, bronze, gunmetal': 'Brass honey scrap ₹810/kg (Jun 2026) sits below the book\'s brass ₹955–1,044 (a rod conversion margin); no bronze prices found; held',
    'zinc (Zamak / ZA)': 'HZL SHG zinc ₹376/kg (Jun 2026) vs Zamak 3 ₹396 — consistent (alloy margin); held',
    'magnesium alloys': 'Imported 99.9% Mg lands at ~₹230/kg before freight and alloy premium; the book\'s AZ91D ₹473 looks high but the alloy premium was not found — held and flagged',
    'titanium, nickel alloys, superalloys': 'No India bar / casting prices found (marketplace listings only); held',
    'filled / FR compounds (GF, LGF, talc, mineral, FR grades of PP, PA6, PA66, PC, ABS, PBT)': 'No India compound price found; the book\'s UK compound premium (e.g. PA66-GF30 1.64× unfilled) would carry a UK figure into India — held',
    'polymers without an anchor (POM, PMMA, PS, TPU/TPE/TPV, PEEK, PEI, PPS, LCP, PPA, PSU, PA12, PLA, recycled grades)': 'Not found in India sources this round; held',
    'rubber compounds (70 Shore A EPDM / NBR / CR / FKM / silicone …)': 'Raw NBR ₹209 and listing cross-checks only; a compound price is not the polymer price; held',
    'composites, paint, masterbatch': 'Only marketplace listings (not prices under the rules); held',
}

# ── LABOUR ────────────────────────────────────────────────────────────────────
def lab(key):
    return {'inrPerHr': R[key]['value'], 'basis': R[key]['basis'], 'source': R[key.replace('fullyLoadedInrPerHr', 'monthlyGross')]['source'], 'research': key}
labour = {
    'categories': {
        'skilled': lab('labour.skilledMachinist.fullyLoadedInrPerHr'),
        'semiskilled': lab('labour.semiskilledOperator.fullyLoadedInrPerHr'),
        'engineer': lab('labour.processEngineer.fullyLoadedInrPerHr'),
        'foundry': lab('labour.foundryOperative.fullyLoadedInrPerHr'),
        'electronics': lab('labour.smtOperator.fullyLoadedInrPerHr'),
        'inspector': lab('labour.qualityInspector.fullyLoadedInrPerHr'),
        'technician': lab('labour.maintenanceTechnician.fullyLoadedInrPerHr'),
        'supervisor': lab('labour.productionSupervisor.fullyLoadedInrPerHr'),
    },
    'grades': {
        'forge': lab('labour.forgeOperator.fullyLoadedInrPerHr'),
        'furnace': lab('labour.furnaceOperator.fullyLoadedInrPerHr'),
        'blow': lab('labour.plasticsOperator.fullyLoadedInrPerHr'),
        'roto': lab('labour.plasticsOperator.fullyLoadedInrPerHr'),
        'thermoform': lab('labour.plasticsOperator.fullyLoadedInrPerHr'),
        'trim-router': lab('labour.plasticsOperator.fullyLoadedInrPerHr'),
    },
    'loadingIncluded': 'employer PF 12% + EDLI/admin 1% (PF wage ≤ ₹15,000), ESI 3.25% (gross ≤ ₹21,000), statutory bonus 8.33%, gratuity 4.81%, basic = 50% of gross (Code on Wages); 2,264 productive h/yr (312 paid days − 29 leave/holiday days)',
    'loadingNotIncluded': 'night-shift allowance, canteen / transport / uniform, group insurance, labour-agency margin on contract workers (~half of auto employment), bonus above 8.33% — not found in any source this round',
}

# ── ENERGY (held — the evidence agrees) ───────────────────────────────────────
energy = {
    'electricityInrPerKwh': 8.78, 'gasInrPerKwh': 3.82,
    'decision': 'held',
    'basis': 'HT industrial all-in: Maharashtra ₹11.80 (incl. 7.5% duty + ToSE), Tamil Nadu ₹8.81 and Haryana ₹7.72 (ex-tax), Karnataka energy charge ₹6.60 (demand charge not found); 3-cluster ex-tax mean ₹9.08 (+3.4% on the book\'s ₹8.78, inside the spread; Karnataka would lower it) — held. Gas: Gujarat Gas industrial PNG ₹44.68/SCM = ₹3.84/kWh at 10,000 kcal/SCM — the book\'s ₹3.82 agrees — held.',
    'sources': [src('energy.electricity.maharashtra.allInInrPerKwh'), src('energy.electricity.tamilnadu.allInInrPerKwh'), src('energy.electricity.haryana.allInInrPerKwh'), src('energy.gas.industrialPNG.inrPerKwh')],
}

# ── MACHINES ──────────────────────────────────────────────────────────────────
rent_inr_sqft_month = R['rent.fourClusterAverage']['value']
machines = {
    'hoursPerYear': R['hours.threeShift']['value'],
    'hoursBasis': '3 shifts × 8 h × 300 working days (Indian cost-accounting convention)',
    'scheduleIIShiftFactor': 2.0 / 1.5,
    'scheduleIIBasis': 'Companies Act 2013 Schedule II: depreciation +50% for double shift, +100% for triple — a held (2-shift) capital charge × 2.0 / 1.5 at 3 shifts',
    'lifeYears': R['depreciation.tripleShiftEffectiveLife']['value'],
    'financeRate': R['finance.rate']['value'],
    'financeBasis': '1-year MCLR 8.70–8.80% (SBI, BoB, BoI, Jul–Oct 2026); the book\'s line build-ups use 4% on half the capex',
    'ukFinanceRate': 0.04,
    'maintenancePctOfCapex': 0.035,
    'maintenanceBasis': 'the library\'s own line build-up rule (3.5% of capex); no Indian norm found',
    'rentInrPerSqftMonth': rent_inr_sqft_month,
    'rentBasis': 'Knight Frank H1 2026 industrial / warehousing rent: Pune 28.7, Chennai 25.7, Bengaluru 23.5, NCR 22.3 ₹/sq ft/month — mean',
    'ukRentGbpPerM2Yr': 110,
    'capitalHeldFactor': 0.52,
    'groups': [
        {'id': 'cnc-machining-domestic', 'match': '^(mach-vmc3|mach-haas-vf2|mach-lathe-cnc|mach-mazak-qt200|mach-drill)$', 'refId': 'mach-vmc3',
         'refCapexInr': R['capex.vmc3.domestic']['value'],
         'basis': 'Jyoti CNC average realisation per machine sold ₹34.56 lakh (Q1 FY27; domestic VMC / turning-centre maker); an Indian-built machine of the class — an imported HAAS / Mazak costs more (not found)',
         'research': 'capex.vmc3.domestic', 'source': R['capex.vmc3.domestic']['source'], 'confidence': 'Medium'},
    ],
    'notRebuiltBasis': 'capex not sourced for India: the book\'s capital (UK × 0.52) is HELD; the India operating model (3-shift hours, Schedule II, finance, rent, tariff, support at India wages) is applied',
    'sources': [src('hours.threeShift'), src('depreciation.scheduleII.extraShift'), src('finance.rate'), src('rent.fourClusterAverage'), src('capex.vmc3.domestic')],
}

cfg = {'asOf': '2026-10-10', 'label': 'India rate book — 4-cluster average (Pune, Chennai, Bengaluru, Delhi NCR), 3-shift', 'fxInrPerGbp': FX,
       'labour': labour, 'energy': energy, 'machines': machines, 'materialFamilies': families, 'held': held,
       'alBilletPremiumUsdPerT': {'value': R['nonferrous.anchor.aluminium.billet6063.premiumOverLme3m']['value'],
                                  'basis': 'Hindalco AA6063 billet (P1020 + ₹17,600/t, Aug 2026) over LME 3M, Oct 2026 derived; May measured $803–842/t — the book held $550',
                                  **src('nonferrous.anchor.aluminium.billet6063.premiumOverLme3m')}}
out = os.path.join(HERE, '..', '2026-10-india.json')
json.dump(cfg, open(out, 'w'), indent=1, ensure_ascii=False)
n = sum(len(f['members']) for f in families)
print(f'wrote {os.path.normpath(out)}: {len(families)} families, {n} grades priced; labour {len(labour["categories"])}+{len(labour["grades"])}; machine groups {len(machines["groups"])}')
