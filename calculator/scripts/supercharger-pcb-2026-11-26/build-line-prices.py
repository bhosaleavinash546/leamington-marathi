#!/usr/bin/env python3
"""Line prices from the research (research/parts.json, read 26 Nov 2026) for the lines whose identity the research settled or
whose package the shared China reel list does not cover. A distributor break is carried to the parts bought a year on the
franchise curve P(Q) = P(break) x (Q / break)^-0.0706 — the CostVision catalogue's default slope (no second break was found
for these parts). Writes research/line-prices.json, read by manual.py."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
B = 0.0706; EUR = 1.1965
def curve(p, brk, q): return p * (q / brk) ** -B
CURVE = 'carried to the parts bought a year on the catalogue franchise curve (slope 0.0706, see §3)'
DK = 'Digi-Key UK, read 26 Nov 2026'
L = {}
def put(ref, unit, basis, url, lo=None, hi=None):
    L[ref] = dict(unitGBP=round(unit, 5), kind='distributor + curve', basis=basis, url=url, rangeLow=lo, rangeHigh=hi)
mcu_curve = curve(8.72738, 480, 100000)
put('U1', 3.55, 'Given by the engineer (26 Nov 2026): GBP 3.55 at 100,000 a year for S912ZVMC25F1WKK, the standard twin of SC667506WKK '
    '(NXP customer build of the S12ZVMC256: errata S12ZVMC256_1N00R names mask 1N00R; WKK = -40 to 150 C, 80 LQFP-EP), with reference to '
    'Mouser UK and Digi-Key. For comparison: Digi-Key UK GBP 8.72738 at 480 (tray), carried to 100,000 on the catalogue curve = GBP '
    f'{mcu_curve:.2f}. Not Valeo\'s contract price.',
    'https://www.mouser.co.uk/en/ProductDetail/NXP-Semiconductors/S912ZVMC25F1WKK?qs=xIeDRCTlTgFilfDw8lumtw%3D%3D ; https://www.digikey.com/en/products/detail/nxp-usa-inc/S912ZVMC25F1WKK/6556971',
    lo=3.55, hi=round(mcu_curve, 4))
L['U1']['kind'] = 'given'
t1 = curve(4.24294 / EUR, 1960, 100000)
put('T1', t1, f'TDK/EPCOS ordering code B78xxxA2363A003 is in no public listing (customer part). Stand-in B78307A2338A003, TDK E10 EM SMD flyback transformer, AEC-Q200: '
    f'EUR 4.24294 at 1,960 (Digi-Key Finland, 26 Nov 2026) at EUR {EUR}/GBP, {CURVE} = GBP {t1:.4f}', 'https://www.digikey.fi/en/products/detail/tdk/B78307A2338A003/13531824', lo=1.36, hi=round(4.24294 / EUR, 4))
c100 = curve(0.24258, 5000, 100000)
put('C bulk 100 uF', c100, f'Marking "hJ 100 VHJ" not decoded. Stand-in EEH-ZC1V101P Panasonic 100 uF 35 V hybrid, 8 mm, AEC-Q200: GBP 0.24258 at 5,000, {DK}, {CURVE}',
    'https://www.digikey.co.uk/en/products/detail/panasonic-industry/EEH-ZC1V101P/10292389', lo=0.10666, hi=0.2807)
c22 = curve(0.15573, 10000, 200000)
put('C bulk 22 uF pair', c22, f'Marking "22 JZC 6X6" not decoded ("ZC" matches Panasonic EEH-ZC). Stand-in EEH-ZC1V220R 22 uF 35 V hybrid, AEC-Q200: GBP 0.15573 at 10,000, {DK}, {CURVE}',
    'https://www.digikey.co.uk/en/products/detail/panasonic-industry/EEH-ZC1V220R/3088094', hi=0.19314)
ldo = curve(0.71664, 5000, 200000)
put('U7, U8', ldo, f'De-marked SOT-223 regulator. Analogue TPS7B6933QDCYRQ1 TI 40 V 150 mA LDO, AEC-Q100: GBP 0.71664 at 5,000, {DK}, {CURVE}',
    'https://www.digikey.co.uk/en/products/result?keywords=TPS7B6933QDCYRQ1', lo=0.2807, hi=0.71664)
q1 = curve(0.56662, 4500, 100000)
put('Q1', q1, f'De-marked LFPAK56 MOSFET on a 48 V board. Analogue BUK7Y4R8-60EX Nexperia 60 V, AEC-Q101: GBP 0.56662 at 4,500, {DK}, {CURVE}',
    'https://www.digikey.co.uk/en/products/result?keywords=BUK7Y4R8-60EX', lo=0.2368, hi=0.56662)
L = {k: v for k, v in L.items() if v.get('kind') == 'given'}   # the stand-in prices above are kept as reference in research/parts.json
json.dump(dict(readOn='2026-11-26', slope=B, eurPerGbp=EUR, lines=L), open(os.path.join(H, 'research', 'line-prices.json'), 'w'), indent=1)
for k, x in L.items(): print(f"{k:20} £{x['unitGBP']:.4f}")
