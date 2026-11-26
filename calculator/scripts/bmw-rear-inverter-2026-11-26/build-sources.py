#!/usr/bin/env python3
"""The price source of every BOM line of the BMW inverter control board: the part priced (maker, part number, grade), the
seller's own figure (price, currency, quantity, date, page) and the £ base at its break. Named BOM parts are priced as
themselves (research/batch-a.json, batch-b.json — read 26 Nov 2026 — or the CostVision component catalogue); unnamed BOM
groups as a named analogue of the same case (szlcsc China own-stock reels, read 25 Nov 2026, or the catalogue).
`brk` = the quantity the base price is quoted at (manual.py carries it to the parts bought a year); None = the base is the
catalogue's figure at its 300k break already. Writes research/line-sources.json."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
USD, EUR, CNY = 1.27, 1.1965, 8.88
A = {i['bomPn']: i for i in json.load(open(os.path.join(H, 'research', 'batch-a.json')))['items']}
B = {i['bomPn']: i for i in json.load(open(os.path.join(H, 'research', 'batch-b.json')))['items']}
def bget(pn): return next((v for k, v in B.items() if pn in k), None)
CAT = 'CostVision component catalogue (distributor, sourced)'
def s(mpn, maker, grade, seller, quote, date, url): return dict(mpn=mpn, maker=maker, grade=grade, seller=seller, quote=quote, date=date, url=url)
def sz(mpn, maker, cny, reel, url, grade): return s(mpn, maker, grade, 'szlcsc (China)', f'¥{cny:.5f} ex-VAT a part, reel of {reel:,}', '25 Nov 2026', url)
L = {}
def put(ref, base, brk, kind, sources, note=''): L[ref] = dict(base=base, brk=brk, kind=kind, sources=sources, note=note)
def dk(i, k=0):
    o = A[i]['observations'][k]
    return o, s(A[i]['found'].split(' ')[0], A[i].get('maker') or '', A[i].get('grade') or '', o['distributor'], f"US${o['price']} at {o['qty']:,}", '26 Nov 2026', o['url'])

# ── Named ICs and semiconductors (batch A / catalogue)
o, src = dk('SAK-TC389QP-160F300S AE')
oc = A['SAK-TC389QP-160F300S AE']['observations'][2]
put('Integrated Circuit 1', o['price'] / USD, o['qty'], 'distributor', [src, s('TC389QP160F300SAEKXUMA2', 'Infineon', 'AURIX, −40 to 125 °C', 'Digi-Key China', '¥221.77 ex-VAT at 500', '26 Nov 2026', oc['url'])],
    'package LFBGA-516 (every TC389QP orderable); not BMW\'s contract price')
put('Integrated Circuit 2', 2.0483, None, 'catalogue', [s('TLF35584QVVS2XUMA2', 'Infineon', 'AEC-Q100', 'Mouser', 'US$3.75 at 2,500', '6 Oct 2026', 'https://www.mouser.com/c/?q=TLF35584QVVS2')],
    'sibling orderable of the BOM\'s TLF35584QVVS1; £2.0483 at 300k (catalogue)')
for ref, pn in [('Integrated Circuit 3', 'LM74202QPWPRQ1'), ('Integrated Circuit 5', 'TPS7B8401QWDRBRQ1'), ('Integrated Circuit 6', 'UCC27282QDRCRQ1'),
                ('Integrated Circuit 7', 'TLV9004QPWRQ1'), ('Integrated Circuit 9', 'AMC1211AQDWVQ1'), ('Integrated Circuit 13', 'LM5155QDSSRQ1'),
                ('Transistor 1', 'PJQ4548P-AU'), ('Transistor 2', 'PJQ5948-AU')]:
    o, src = dk(pn); put(ref, o['price'] / USD, o['qty'], 'distributor', [src], 'reel code of the BOM\'s tube code' if pn == 'AMC1211AQDWVQ1' else '')
o, src = dk('74HC4075PW', 1); put('Integrated Circuit 8', o['price'] / USD, o['qty'], 'distributor', [dict(src, mpn='74HC4075PW')])
put('Integrated Circuit 4', 0.2442, None, 'catalogue', [s('TCAN1057AVDRQ1', 'Texas Instruments', 'AEC-Q100', 'Digi-Key', 'US$0.4316 at 5,000', '6 Oct 2026', 'https://www.digikey.com/en/products/detail/texas-instruments/TCAN1057AVDRQ1/15857088')], '£0.2442 at 300k (catalogue)')
put('Integrated Circuit 10', 2.541, None, 'catalogue', [s('ADUM4135WBRWZ', 'Analog Devices', 'automotive (W)', 'Digi-Key', 'US$5.02 at 1,034', '6 Oct 2026', 'https://www.digikey.com/en/products/detail/analog-devices-inc/ADUM4135BRWZ/5441084')], '£2.541 at 300k (catalogue)')
put('Integrated Circuit 11', 3.1819, None, 'catalogue', [s('UCC5880QDFCRQ1', 'Texas Instruments', 'AEC-Q100', 'Digi-Key', 'US$6.00 at 2,000', '6 Oct 2026', 'https://www.digikey.com/en/products/detail/texas-instruments/UCC5880QDFCRQ1/22539588')], '£3.1819 at 300k (catalogue)')
put('Integrated Circuit 12', 0.11959, 2500, 'china-reel', [sz('LM2903BQDRQ1', 'Texas Instruments', 1.06195, 2500, 'https://item.szlcsc.com/4226854.html', 'AEC-Q100')], 'the -Q1 dual comparator')
put('Sensor 1', 1.7749, None, 'catalogue', [s('ACS37002LMABTR-050B5', 'Allegro', 'AEC-Q100', 'Digi-Key', 'US$3.5148 at 1,000', '6 Oct 2026', 'https://www.digikey.com/en/products/detail/allegro-microsystems/ACS37002LMABTR-050B5/13560511')], '£1.7749 at 300k (catalogue)')
put('Sensor 2', 1.2983, None, 'catalogue', [s('ACS37612LLUATR-015B5', 'Allegro', 'AEC-Q100', 'Digi-Key', 'US$2.64278 at 4,000', '13 Oct 2026', 'https://www.digikey.com/en/products/detail/allegro-microsystems/ACS37612LLUATR-015B5/12093264')],
    'ACS37601 (4-pin SIP) is sample-only on Allegro\'s page, no distributor price: priced as its family member ACS37612, £1.2983 at 300k (catalogue)')
put('Crystal 1', 0.0642, None, 'catalogue', [s('NX3225GA-25.000M-STD-CRG-2', 'NDK', 'AEC-Q200', 'LCSC', 'US$0.1169 at 6,000', '9 Oct 2026', 'https://www.lcsc.com/product-image/C438901.html')], 'the 25 MHz sibling of the BOM\'s 20 MHz part; £0.0642 at 300k (catalogue)')

# ── Named passives, diodes and magnetics (batch B)
def from_b(ref, pn, fallback):
    i = bget(pn)
    obs = [o for o in (i or {}).get('observations', []) if o.get('price') and o.get('qty')]
    if not obs: return put(ref, *fallback)
    o = max(obs, key=lambda o: o['qty'])
    cur = str(o.get('currency', 'USD')).upper()
    base = o['price'] / (USD if cur.startswith('USD') else EUR if cur.startswith('EUR') else CNY if cur.startswith('CNY') else 1)
    if cur.startswith('CNY') and 'incl' in cur.lower(): base /= 1.13
    sym = {'USD': 'US$', 'EUR': '€', 'GBP': '£', 'CNY': '¥'}.get(cur[:3], cur[:3] + ' ')
    put(ref, base, o['qty'], 'distributor', [s(i.get('found') or pn, i.get('maker') or '', i.get('grade') or '', o['distributor'], f"{sym}{o['price']} at {o['qty']:,}", '26 Nov 2026', o['url'])],
        (i.get('note') or '') if isinstance(i.get('note'), str) else '')
FB = lambda base, brk, note: (base, brk, 'estimate', [], note)
from_b('Capacitor 1', 'A768KE107M1VLAS036', FB(0.30, None, 'no price read: estimate'))
put('Capacitor 2', 0.08 / USD, 5000, 'estimate', [s('C47S1222K60C000', 'Xiamen Faratronic', 'Y1 440 VAC, MKP, through-hole', 'LCSC (search snapshot — page price not read)', 'about US$0.08 at 5,000', '26 Nov 2026', 'https://www.lcsc.com/product-detail/C5452141.html')],
    'through-hole film capacitor, 15 mm pitch, 17.5 × 12 × 6 mm; price from LCSC\'s search snapshot, unverified')
from_b('Diode 1', 'SMBJ15A', FB(0.04, None, 'no price read: estimate'))
from_b('Diode 2', 'TPSMC33A', FB(0.15, None, 'no price read: estimate'))
from_b('Diode 3', 'VSSAF3L45', FB(0.08, None, 'no price read: estimate'))
from_b('Diode 4', 'SZ1SMA5936BT3G', FB(0.06, None, 'no price read: estimate'))
from_b('Diode 5', 'SZ1SMA5934BT3G', FB(0.06, None, 'no price read: estimate'))
from_b('Diode 6', 'STTH112UFY', FB(0.10, None, 'no price read: estimate'))
from_b('Inductor 1', 'IHLP4040DZER220M', FB(0.32, None, 'no price read: estimate'))
from_b('Inductor 3', 'B82462G4332M000', FB(0.25, None, 'no price read: estimate'))
put('Inductor 4', 0.5504, None, 'catalogue', [s('XEL4030-102MEB', 'Coilcraft', 'XEL4030 family', 'Mouser', 'US$1.09 at 1,000', '9 Oct 2026', 'https://www.trustedparts.com/en/part/coilcraft/XEL4030-102MEC')],
    'XEL4030V-472ME (the automotive V version) not listed by any page that opened: priced as its catalogued family member, £0.5504 at 300k (catalogue)')
from_b('Resistor 1', 'PWR221T-30', FB(1.00, None, 'no price read: estimate'))
xf = B[next(k for k in B if 'XFMRS' in k)]['observations']
put('Inductor 2', 1.63819 / USD, 4900, 'distributor', [
    s('PM2180.034NLT', 'Pulse', 'push-pull, 8.1 × 7.1 mm, AEC-Q200 series', 'Digi-Key', 'US$1.63819 at 4,900', '26 Nov 2026', next(o['url'] for o in xf if abs(o['price'] - 1.63819) < 1e-4)),
    s('750319835', 'Würth', 'WE-AGDT, AEC-Q200', 'Digi-Key', 'US$1.856 at 500', '26 Nov 2026', next(o['url'] for o in xf if abs(o['price'] - 1.856) < 1e-4)),
    s('HCTSM8', 'Bourns', 'push-pull, 12.3 × 10.8 mm', 'Digi-Key', 'US$3.30422 at 2,500', '26 Nov 2026', next((o['url'] for o in xf if abs(o['price'] - 3.30422) < 1e-4), ''))],
    'XFMRS customer part (BMW-8-15T), no public price: the middle of three catalogued SMD gate-drive transformers carried to volume (Würth £0.93, Pulse £0.97, Bourns £1.86)')

# ── Unnamed BOM groups: named analogues (resistors and capacitors carried to the millions break by manual.py)
F, SL = 300000, 0.0706
put('Capacitor 3 (0402)', 0.00448, 10000, 'china-reel', [sz('GCM155R71C104KA55D', 'Murata', 0.03982, 10000, 'https://item.szlcsc.com/87033.html', 'GCM, automotive')], '100 nF X7R')
put('Capacitor 3 (0603)', 0.00287, 4000, 'china-reel', [sz('GCM188R71H104KA57D', 'Murata', 0.02549, 4000, 'https://item.szlcsc.com/87040.html', 'GCM, automotive')], '100 nF 50 V X7R')
put('Capacitor 3 (0805)', (0.0152 + 0.0214) / 2, F, 'mix', [
    s('KAM21BR71H104KT', 'Kyocera AVX', 'AEC-Q200', 'Digi-Key', 'US$0.0289 at 12,000', '22 Nov 2026', 'https://www.digikey.com/en/products/result?keywords=KAM21BR71H104KT'),
    s('GCM21BR71H105KA03L', 'Murata', 'GCM, AEC-Q200', 'LCSC', 'US$0.0235 at 9,000', '6 Oct 2026', 'https://www.lcsc.com/product-detail/C126592.html')],
    'value mix (judgement): half 100 nF, half 1 µF, 50 V — £0.0152 and £0.0214 at 300k (catalogue)')
c47 = 0.06766 * (F / 2000) ** -SL
put('Capacitor 3 (1206)', (0.0197 + c47) / 2, F, 'mix', [
    s('C1206C104K5RACAUTO', 'KEMET', 'AEC-Q200', 'Digi-Key', 'US$0.03711 at 12,000', '22 Nov 2026', 'https://www.digikey.com/en/products/detail/kemet/C1206C104K5RACAUTO/3315001'),
    sz('CGA5L1X7R1H475KT0Y0N', 'TDK', 0.6008, 2000, 'https://item.szlcsc.com/370048.html', 'CGA, AEC-Q200')],
    f'value mix (judgement): half 100 nF (£0.0197 at 300k), half 4.7 µF 50 V (£0.06766 a reel of 2,000 → 300k = £{c47:.4f})')
put('Capacitor 3 (1210)', 0.09857, 1000, 'china-reel', [sz('GCM32EC71H106KA03L', 'Murata', 0.87531, 1000, 'https://item.szlcsc.com/137892.html', 'GCM, automotive')], '10 µF 50 V bulk')
put('Resistor 2 (0402)', 0.00054, 10000, 'china-reel', [sz('AC0402FR-0710KL', 'Yageo', 0.00478, 10000, 'https://item.szlcsc.com/156139.html', 'AC series, AEC-Q200')])
put('Resistor 2 (0603)', 0.00075, 5000, 'china-reel', [sz('AC0603FR-0710KL', 'Yageo', 0.00664, 5000, 'https://item.szlcsc.com/117931.html', 'AC series, AEC-Q200')])
put('Resistor 2 (0805)', 0.00185, 5000, 'china-reel', [sz('AC0805FR-0710KL', 'Yageo', 0.01646, 5000, 'https://item.szlcsc.com/152196.html', 'AC series, AEC-Q200')])
put('Resistor 3 (1206)', 0.00484, 5000, 'china-reel', [sz('AC1206FR-0710KL', 'Yageo', 0.04301, 5000, 'https://item.szlcsc.com/155852.html', 'AC series, AEC-Q200')])
put('Resistor 3 (2512)', 0.06194, 4000, 'china-reel', [sz('AC2512FK-0710RL', 'Yageo', 0.55, 4000, 'https://item.szlcsc.com/476216.html', 'AC series, AEC-Q200')])
put('Diode 7', 0.00329, 3000, 'china-reel', [sz('BAV99,215', 'Nexperia', 0.0292, 3000, 'https://item.szlcsc.com/2877.html', 'AEC-Q101')])
put('Discrete 3 Pins', 0.00445, 3000, 'china-reel', [sz('2N7002,215', 'Nexperia', 0.0477, 3000, 'https://item.szlcsc.com/66260.html', 'AEC-Q101'),
                                                    sz('BC847C,215', 'Nexperia', 0.03142, 3000, 'https://item.szlcsc.com/9163.html', 'AEC-Q101')], 'mean of the MOSFET and the BJT')
put('Discretes (4+ pins)', 2 * 0.00445, 3000, 'estimate', [sz('2N7002,215', 'Nexperia', 0.0477, 3000, 'https://item.szlcsc.com/66260.html', 'AEC-Q101')],
    'dual transistor in SOT-363: two small-signal dies (2 × the SOT-23 mean) — estimate')
put('Ferrite 1', 0.01953, 4000, 'china-reel', [sz('BLM18KG601SH1D', 'Murata', 0.17345, 4000, 'https://item.szlcsc.com/748751.html', 'automotive (SH1)')])
put('Inductor 5', 0.0664, None, 'catalogue', [s('VLS252012HBX-1R0M-1', 'TDK', 'AEC-Q200', 'Digi-Key', 'US$0.10906 at 14,000', '9 Oct 2026', 'https://www.digikey.com/en/products/detail/tdk-corporation/VLS252012HBX-1R0M-1/5147063')],
    'small SMD power inductor, 2520; £0.0664 at 300k (catalogue)')

# ── Texas Instruments' own store price at 1,000+ (research/ti-store.json, read 26 Nov 2026) — the maker's price, below the
# distributors' at their largest breaks; the distributor figure stays on the line as a reference.
TIS = {i['found']: i for i in json.load(open(os.path.join(H, 'research', 'ti-store.json')))['items']}
for ref, pn in [('Integrated Circuit 11', 'UCC5880QDFCRQ1'), ('Integrated Circuit 6', 'UCC27282QDRCRQ1'), ('Integrated Circuit 5', 'TPS7B8401QWDRBRQ1'),
                ('Integrated Circuit 3', 'LM74202QPWPRQ1'), ('Integrated Circuit 7', 'TLV9004QPWRQ1'), ('Integrated Circuit 9', 'AMC1211AQDWVRQ1'),
                ('Integrated Circuit 13', 'LM5155QDSSRQ1'), ('Integrated Circuit 4', 'TCAN1057AVDRQ1')]:
    t = TIS[pn]; old = L[ref]
    L[ref] = dict(base=t['price1k'] / USD, brk=1000, kind='maker', note='reel code of the BOM\'s tube code' if pn == 'AMC1211AQDWVRQ1' else '',
                  sources=[s(pn, 'Texas Instruments', 'AEC-Q100', 'TI.com (maker)', f"US${t['price1k']:.3f} at 1,000+ ({t['quote']})", '26 Nov 2026', t['url'])] + old['sources'])
# A catalogue figure is the catalogue's 300k break: carried on from there to the parts bought a year.
for v in L.values():
    if v['brk'] is None: v['brk'] = 300000
json.dump(dict(readOn='2026-11-26', lines=L), open(os.path.join(H, 'research', 'line-sources.json'), 'w'), indent=1, ensure_ascii=False)
print(len(L), 'lines;', 'batch B', 'present' if B else 'NOT YET', '; estimates:', [k for k, v in L.items() if v['kind'] == 'estimate'])
