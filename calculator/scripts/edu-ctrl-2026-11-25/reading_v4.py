#!/usr/bin/env python3
"""Reading v4 of the EDU control board — the recount from all 22 photos (25 Nov 2026), after the engineers said the quantities
did not match. Built from v1 (reading.json / replies.json) with every change stated and its photo evidence. The bottom side is
COUNTED part by part from the close-ups; the top side is the designator range less the share NOT FITTED measured on nine
full-resolution tiles (about 5–15 % in the UC cores, 30 % near the motor connector and the resolver boost, 55 % below UC1:
taken as 20 % overall, range 10–30 %). Each zoomed photo was matched to its area on the whole-board views; a part is counted once.
Writes reading-v4.json and replies-v4.json."""
import json, os, copy
H = os.path.dirname(os.path.abspath(__file__))
rd = json.load(open(os.path.join(H, 'reading.json'))); rp = json.load(open(os.path.join(H, 'replies.json')))
CHANGES = []
def by(ref): return next(l for l in rd['lines'] if l['refDes'] == ref)
def setq(ref, q, why):
    l = by(ref); CHANGES.append(dict(refDes=ref, was=l['qty'], now=q, why=why)); l['qty'] = q; l['basis'] = f"v4: {why}"
def drop(ref, why):
    l = by(ref); CHANGES.append(dict(refDes=ref, was=l['qty'], now=0, why=why)); rd['lines'].remove(l)
def add(ref, ct, desc, pkg, qty, why, pn='', conf=0.5):
    rd['lines'].append(dict(refDes=ref, componentType=ct, description=desc, pkg=pkg, value='', voltage='', qty=qty, partNumber=pn, basis=f'v4: {why}', lineConf=conf))
    CHANGES.append(dict(refDes=ref, was=0, now=qty, why=why))

# ── ICs: the composition, from the top-side tile inventory (U1–U70 less the empty footprints U23?, U26, U42, U43, U50, U62, U69)
drop('Quad op-amp group', 'the two 14-pin ICs beside J2 MOTOR are NXP TJA1463A CAN transceivers (marking read, photo 2 / tile); the "x2 channels" copy has no parts beside J3')
drop('Dual op-amp group, channel two', 'not fitted: the UC2 side beside J3 has U14 (SSOP-24), U11 (MSOP-8) and empty pads — no SO-8 op-amp row (whole-top tile 7)')
drop('CAN group', 'replaced by the two TJA1463A read beside J2 (the four TJA1044 were an estimate)')
add('U5, U6', 'ic_soic', 'NXP TJA1463A CAN FD SIC transceiver (marking TJA1463A read on both), beside J2 MOTOR', 'SO-14', 2,
    'READ: marking TJA1463A on both parts (photo 2 close-up)', pn='TJA1463AT/0Z', conf=0.85)
setq('U8, U15, U61', 2, 'U8 (SO-8 wide, "U8 OR U50") on top and U61 between the slots on the bottom; U15 is a 6-pin SOT, not an isolated amplifier')
by('U8, U15, U61')['refDes'] = 'U8, U61'
setq('U20, U22, U43', 2, 'U43 is an EMPTY QFN footprint (four bare pads, tile below UC1); U20 and U22 fitted')
by('U20, U22, U43')['refDes'] = 'U20, U22'
_u = by('U20, U22'); _u['pkg'] = 'MSOP-8 / TSSOP-16'; _u['componentType'] = 'ic_soic'
_u['description'] = 'Small ICs U20 (TSSOP-16, UC2 core) and U22 (MSOP-8, UC1 core) — markings not read'
CHANGES.append(dict(refDes='U20, U22', was='QFN-20', now='MSOP-8 / TSSOP-16', why='package seen on the full-resolution tiles (U22 MSOP-8 beside L21; U20 TSSOP)'))
add('U3', 'ic_soic', 'Large IC, 28-pin TSSOP with exposed pad, at the 8V7_BU supply (BU7 area) — multi-output supply / driver controller, marking not read', 'HTSSOP-28', 1, 'COUNTED (tile 6)')
add('U14', 'ic_soic', 'IC in SSOP-24 beside J3 MOTOR (UC2 channel interface) — marking not read', 'SSOP-24', 1, 'COUNTED (tiles 6-7)')
add('U41, U44', 'ic_soic', 'IC pair in TSSOP-16 beside the D50 / D62 supply diodes (UC1 side) — marking not read', 'TSSOP-16', 2, 'COUNTED (tile 9)')
add('U11, U19, U21, U24', 'ic_soic', 'Small ICs in MSOP-8 / MSOP-10 / TSSOP-20 (U11 by J3, U19 by TP10, U21 and U24 in the UC2 core) — markings not read', 'MSOP-8', 4, 'COUNTED (tiles 5-7, photo 5)')

# ── Magnetics
setq('Coupled choke group', 5, 'five "701" chokes on the top (L8, L16, L19, L22, L25 — photo 2 and tile 0/4), not six')

# ── Passives and discretes: bottom counted, top = designator range less 20 % not fitted
R_BOTTOM, C_BOTTOM = 220, 88          # counted on the bottom close-ups (grid 180 + 40 R; two clusters of ~31 C, filters 21, U61 block 5)
R_TOP = round(0.80 * (1019 + 10 - 4)); C_TOP = round(0.80 * 531)   # R1–R1019 + R1282–R1291 less the 4 PTCs; C1–C531
R_new = R_TOP + R_BOTTOM - 180        # non-grid resistors
R_old = sum(by(r)['qty'] for r in ['R 0402 group', 'R 0603 group', 'R 0805 group', 'R 1206 group', 'R 2512 group'])
C_new = C_TOP - 4 + C_BOTTOM          # C_TOP holds the 4 top hybrid caps (their own lines); C_BOTTOM excludes the 2 bottom hybrids and the film cap
C_old = sum(by(r)['qty'] for r in ['C 0402 group', 'C 0603 group', 'C 0805 group', 'C 1206 group', 'C 1210 group'])
for refs, new, old, what in [(['R 0402 group', 'R 0603 group', 'R 0805 group', 'R 1206 group', 'R 2512 group'], R_new, R_old, 'resistors'),
                             (['C 0402 group', 'C 0603 group', 'C 0805 group', 'C 1206 group', 'C 1210 group'], C_new, C_old, 'MLCCs')]:
    k = new / old; left = new
    for i, ref in enumerate(refs):
        q = round(by(ref)['qty'] * k) if i < len(refs) - 1 else None
        if q is None: q = new - sum(by(r)['qty'] for r in refs[:-1])
        setq(ref, q, f'{what}: bottom counted, top = designator range less 20 % not fitted (measured on 9 tiles) — {new} in all (v1 {old}, "less 10 %")')
setq('Q small-signal group', 52, 'Q1–Q72: top less 20 % not fitted (Q66, Q67 empty on the bottom), bottom Q65 / Q68 / Q69 / Q72 counted')
setq('D small-signal group', 41, 'D1–D70: top less 20 % (D9, D10 empty), bottom D62 / D63 / D66 counted')
setq('Zener group', 21, 'Z1–Z37 less the six seen empty (Z26–Z29, Z33, Z34) and the 10 TVS on their own lines')

# ── Assembly: placements recounted
smt = sum(l['qty'] for l in rd['lines'] if l['componentType'] not in ('through_hole', 'mechanical'))
rd['assembly']['smtPlacements'] = smt
json.dump(rd, open(os.path.join(H, 'reading-v4.json'), 'w'), indent=1)
# Stand-in replies: same lines in the model's format
v1 = {l['refDes']: l for l in rp['analysis']['bom']}
bom = []
for l in rd['lines']:
    base = copy.deepcopy(v1.get(l['refDes']) or {'unitPriceGBP': 0, 'moq': 0, 'automotive': True, 'highCost': False, 'ocrExtracted': False})
    base.update({k: l[k] for k in ('refDes', 'componentType', 'description', 'pkg', 'value', 'voltage', 'qty', 'partNumber', 'lineConf')})
    if l['refDes'] == 'U5, U6': base['ocrExtracted'] = True
    bom.append(base)
rp['analysis']['bom'] = bom
rp['analysis']['assembly']['smtPlacements'] = smt
rp['ocr']['icMarkings'] = ['SAK-TC387QP-160F300S AE', 'SAK-TC387QP-160F300S AE', 'TJA1463A', 'TJA1463A']
json.dump(rp, open(os.path.join(H, 'replies-v4.json'), 'w'), indent=1)
json.dump(CHANGES, open(os.path.join(H, 'reading-v4-changes.json'), 'w'), indent=1)
tot = sum(l['qty'] for l in rd['lines'])
print('lines', len(rd['lines']), 'parts', tot, 'smt', smt, 'R non-grid', R_new, 'was', R_old, 'C', C_new, 'was', C_old)
for c in CHANGES: print(f"{c['refDes'][:30]:30} {c['was']:5} -> {c['now']:5}")
