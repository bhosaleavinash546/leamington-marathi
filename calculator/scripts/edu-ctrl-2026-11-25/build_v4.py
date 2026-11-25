#!/usr/bin/env python3
"""v4 inputs: manual-prices-v4.json (the v4 reading's lines and quantities, priced as v1 / v3 did, new lines at the tool's
sourced class point or the catalogue) and corrections-v4.json (v3's corrections + China volume prices).
Price rule for v4: a line takes the LOWEST SOURCED price at volume — our catalogue / page-read figure or the China
distributor's own-stock reel price read on the page (szlcsc, ex-VAT; xcheck/china-volume.json). A sourced figure replaces an
engineering estimate whichever way it moves. ICs keep v3's figures where the published China reel is dearer (it is a reel
catalogue price; a 20k–30k-a-year EMS buys on contract). Usage: python3 build_v4.py <china-volume.json> <tool reprice.json>"""
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__))
cv = json.load(open(sys.argv[1])); tool = json.load(open(sys.argv[2]))
rd = json.load(open(os.path.join(H, 'reading-v4.json')))
mp1 = {l['refDes']: l for l in json.load(open(os.path.join(H, 'manual-prices.json')))}
RENAMED = {'U8, U61': 'U8, U15, U61', 'U20, U22': 'U20, U22, U43'}
toolLine = {l['refDes']: l for l in tool['analysis']['bom']}
out = []
for l in rd['lines']:
    src = mp1.get(RENAMED.get(l['refDes'], l['refDes']))
    if src:
        n = dict(src); n['refDes'] = l['refDes']; n['qty'] = l['qty']; n['pkg'] = l['pkg']; n['description'] = l['description']; n['basis'] = l['basis']
    else:
        t = toolLine[l['refDes']]
        n = dict(refDes=l['refDes'], description=l['description'], pkg=l['pkg'], qty=l['qty'], unitGBP=float(t['unitPriceGBP']),
                 priceKind='catalogue analogue' if t.get('priceSource') == 'catalogue' else 'class point',
                 priceNote=str(t.get('priceNote', ''))[:240], priceSource=str(t.get('catalogueMpn') or 'tool class range (catalogue p10–p90)'), basis=l['basis'])
    if l['refDes'] == 'U20, U22':   # unidentified: the tool's sourced class point, not v1's £1.00 estimate
        t = toolLine[l['refDes']]; n.update(unitGBP=float(t['unitPriceGBP']), priceKind='class point', priceNote=str(t.get('priceNote', ''))[:240], priceSource='tool class range (catalogue p10–p90)')
    n['lineGBP'] = round(n['qty'] * n['unitGBP'], 6)
    out.append(n)
json.dump(out, open(os.path.join(H, 'manual-prices-v4.json'), 'w'), indent=1, ensure_ascii=False)

# China volume prices, by our line
cvl = {}
for i in cv['items']:
    cvl.setdefault(i['line'], i)
def C(key): return cvl[key]
qitem = next(i for i in cv['items'] if i['line'].startswith('Small-signal Q'))
MAP = {   # our refDes : (china line key, unit £ to use or None = the China figure, label)
 'C 0603 group': ('0603 MLCC 100nF 50V X7R auto', None, ''), 'C 1206 group': ('1206 MLCC 4.7uF 50V X7R auto', None, ''),
 'C 1210 group': ('1210 MLCC 10uF 50V auto (X7S substitute', None, 'substitute: 10 µF 50 V X7S (no 1210 X7R automotive part listed)'),
 'R 0402 group': ('R0402 thick film 1% auto', None, ''), 'R 0603 group': ('R0603 thick film 1% auto', None, ''), 'R 0805 group': ('R0805 thick film 1% auto', None, ''),
 'R 1206 group': ('R1206 thick film 1% auto', None, ''), 'Bus-discharge bank (10 x 18 grid)': ('R1206 46.4k 1% auto', None, 'stock 0 at the reading — a listed price'),
 'R 2512 group': ('R2512 thick film 1% auto', None, 'replaces an engineering estimate (higher)'),
 'NTC group': ('NTC 0603 10k NCP18XH103F03RB', None, ''), 'Q small-signal group': (None, 0.00445, 'mean of 2N7002,215 and BC847C,215 at reel'),
 'D small-signal group': ('BAV99 auto', None, ''), 'Zener group': ('BZT52C5V1 auto SOD-123', None, ''),
 'Z4, Z6, Z8, Z10, Z12, Z14': ('SMBJ24CA', None, 'grade not stated on the listing'), 'TVS SMA group': ('SMAJ33A (SMA TVS)', None, 'grade not stated on the listing'),
 'D rectifier group': ('Schottky SOD-128 PMEG6030ELP (rectifier)', None, 'standard grade (the -Q part £0.29, stock 9)'),
 'D34, D35': ('Schottky SMC NRVBS340 / SS34 (SMC)', None, 'MBRS340T3G — standard twin of NRVBS340'), 'Power diode pair, channel two': ('Schottky SMC NRVBS340 / SS34 (SMC)', None, 'MBRS340T3G — standard twin of NRVBS340'),
 'U63, U64, U65, U66, U67, U68': ('PESD2CANFD24V', None, ''), 'LED group': ('0603 LED auto', None, ''),
 'Power inductor 4.7 uH group': ('4.7uH shielded ~6x6 auto', None, 'replaces an engineering estimate'), '10 uH pair': ('10uH ~6x6 auto', None, 'replaces an engineering estimate'),
 'L29': ('22uH ~10x10 auto', None, 'replaces an engineering estimate; stock 0 at the reading (SPM10065VT £0.33 in stock)'),
 'L35, L36': ('3.3uH ~4x4', None, 'consumer-grade listing (SPM4020T); an automotive part may be dearer — replaces an engineering estimate'),
 'Resolver boost inductor pair': ('3.3uH ~4x4', None, '4×4 mm power inductor at the same listing — replaces an engineering estimate'),
 'Coupled choke group': ('7x7 coupled / common-mode choke', None, 'TDK ACM70V-701 (marking 701) — replaces an engineering estimate'),
 'L39, L41': ('CAN CMC DLW43SH510XK2L / ACT45B', None, ''), 'Hybrid 100 uF group': ('Hybrid 100uF 50V EEH-ZA1H101P', None, ''),
 'Hybrid 330 uF pair': ('Nichicon GYC 330uF 25V', None, 'replaces an engineering estimate (higher)'),
 'U12, U16, U17': ('LM2904BQDRQ1', None, ''), 'Logic group': ('74LVC1G08-Q100', None, ''), 'Ref group': ('TL431 auto', None, ''),
 'EEPROM group': ('M95256-DRMN3TP/K', None, ''),
 'TP group': ('SMD test-point loop (Keystone 5015 or eq', None, 'Chinese substitute RH-5015 (Keystone 5015 £0.081 at the same seller)'),
 'J6, J7': ('2x4 2.54 mm pin header', None, 'standard grade'), 'J4, J5': ('5-pin 2.5 mm wire-to-board header (XH)', None, 'JST B5B-XH-A, standard grade'),
}
cur = {l['refDes']: l for l in out}
v3 = json.load(open(os.path.join(H, 'corrections-v3.json'))); v2 = json.load(open(os.path.join(H, 'corrections-v2.json')))
prior = {**v2['lines'], **v3['lines']}
lines = {}; kept = []
for ref, (key, fixed, label) in MAP.items():
    if ref not in cur: continue
    it = qitem if fixed is not None else next(v for k, v in cvl.items() if k.startswith(key))
    china = fixed if fixed is not None else float(it['unitGBP'])
    ours = prior.get(ref, {}).get('unitGBP', cur[ref]['unitGBP'])
    estimate = cur[ref]['priceKind'] == 'engineering estimate' and ref not in prior
    use = china if (estimate or china < ours) else ours
    if use == ours and not estimate:
        kept.append(dict(refDes=ref, ours=ours, china=china, part=it['part'])); continue
    lines[ref] = dict(unitGBP=round(use, 5), note=f"China volume (szlcsc own stock, whole reel of {it['qty']:,}, ex-VAT, read 25 Nov 2026): {it['part']} {it.get('maker', '')} £{china:.5f}{'; ' + label if label else ''}; was £{ours:.5f}",
                      url=it['url'])
# lines whose name changed in v4 keep their v3 corrections
lines.setdefault('U8, U61', dict(unitGBP=2.1157, note='TI.com $2.687 at 1,000 = £2.12 (AMC1311BQDWVRQ1); China reel £3.29 is dearer — kept', url='https://www.ti.com/product/AMC1311-Q1'))
corr = dict(_about='v4 (25 Nov 2026): v3 + the recount from all 22 photos (reading-v4.json) + China volume prices (xcheck/china-volume.json). Rule: the lowest SOURCED price at volume; a sourced figure replaces an engineering estimate whichever way it moves; ICs keep v3 where the China reel is dearer.',
            version='v4', basedOn='v3', basedOnFile='corrections-v3.json', pricesFile='manual-prices-v4.json', readingFile='reading-v4.json',
            usdPerGbp=1.27, lines=lines, keptOurs=kept, linesChecked=v3['linesChecked'], burden=v3['burden'], board=v3['board'], assembly=v3['assembly'])
json.dump(corr, open(os.path.join(H, 'corrections-v4.json'), 'w'), indent=1, ensure_ascii=False)
print('lines', len(out), 'parts', sum(l['qty'] for l in out), 'china-priced', len(lines), 'kept ours', len(kept))
for k in kept: print('  kept', k)
