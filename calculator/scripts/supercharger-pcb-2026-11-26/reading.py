#!/usr/bin/env python3
"""Reading of the supercharger control board (Valeo B112235-B, PCB by Dynamic Electronics, UL KM1-V0) from 15 photos
(26 Nov 2026): two whole-board views a side, six zooms, the board text and the controller's marking.

Given by the engineer: 100,000 boards a year, built in China, 6-year programme, board 120 x 100 mm, conformal coating on the
component areas, main controller NXP SC667506WKK. The close-up of the controller shows three lines on ONE chip:
SC667506WKK (part number), 1N00R (mask set), ZRAA2635A (trace / lot code) — ZRAA2635A is not a second part.

Every other IC marking is scratched off (de-marked) or unreadable: those ICs are identified by package and position and are
priced by class. Counts: ICs, magnetics, electrolytics, power parts and discretes COUNTED on the zooms; resistors and MLCCs
counted on the zooms where the photo is sharp and estimated elsewhere (range stated). Writes reading.json and replies.json."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))

L = []
def add(ref, ct, desc, pkg, qty, how, side, pn='', conf=0.5, lo=None, hi=None, ocr=False, value=''):
    L.append(dict(refDes=ref, componentType=ct, description=desc, pkg=pkg, value=value, voltage='', qty=qty, partNumber=pn,
                  countMethod=how, side=side, qtyLow=lo if lo is not None else qty, qtyHigh=hi if hi is not None else qty,
                  lineConf=conf, ocrExtracted=ocr))

# ── ICs (top unless stated)
add('U1', 'ic_tqfp', 'NXP S12 MagniV motor-control MCU with integrated gate-drive unit and CAN physical layer — customer build SC667506WKK of the S12ZVMC256 (mask set 1N00R, trace code ZRAA2635A), the board controller',
    'LQFP-80 EP 12x12', 1, 'counted', 'top', pn='SC667506WKK', conf=0.95, ocr=True)
add('U2', 'ic_soic', 'IC in SO-16 beside transformer T1 — transformer / isolated-supply driver for the gate-drive rails, marking removed', 'SO-16', 1, 'counted', 'top', conf=0.5)
add('U3', 'ic_soic', 'SO-8 signal IC at the top-right corner beside the connector pins (op-amp / comparator / driver), marking removed — not a CAN transceiver: the MCU carries its own CAN physical layer', 'SO-8', 1, 'counted', 'top', conf=0.45)
add('U4, U5', 'ic_soic', 'SO-8 signal ICs in the sensing area (current / voltage sense amplifier or dual op-amp), marking removed', 'SO-8', 2, 'counted', 'top', conf=0.5)
add('U6', 'ic_soic', 'Small IC in MSOP-10 on the bottom beside the shaft opening (sensor interface / amplifier), marking not read', 'MSOP-10', 1, 'counted', 'bottom', conf=0.45)
add('U7, U8', 'ic_soic', 'Linear voltage regulator (LDO), automotive, SOT-223 with tab (one beside T1, one beside the MCU)', 'SOT-223', 2, 'counted', 'top', conf=0.6)

# ── Power and discretes
add('Q1', 'transistor_mosfet', 'Power MOSFET in a 5x5 mm leadless power package (reverse-battery / supply switch) beside the bulk MLCCs', 'LFPAK56 / PowerPAK SO-8', 1, 'counted', 'top', conf=0.55)
add('Q small-signal group', 'transistor', 'Small-signal MOSFET / BJT', 'SOT-23', 17, 'counted', 'both', lo=14, hi=20, conf=0.55)
add('D small-signal group', 'diode', 'Small-signal / Schottky diode', 'SOD-323 / SOD-123', 9, 'counted', 'both', lo=7, hi=12, conf=0.5)
add('Zener group', 'diode_zener', 'Zener diode', 'SOD-123', 4, 'counted', 'both', lo=3, hi=6, conf=0.45)
add('D rectifier group', 'diode', 'Rectifier / Schottky diode (three stacked on the bottom-left supply path, one beside them)', 'SMA', 4, 'counted', 'bottom', conf=0.6)
add('TVS SMB group', 'diode_tvs', 'TVS diode on the supply input (load-dump / transient protection)', 'SMB', 2, 'counted', 'bottom', conf=0.6)

# ── Magnetics
add('T1', 'transformer', 'SMD transformer, EPCOS (TDK) marked, 10-pin gull-wing — isolated auxiliary / gate-drive supply', 'SMD 10-pin ~13x7', 1, 'counted', 'top', conf=0.7)
add('L1', 'inductor_power', 'Shielded power inductor ~6x6 mm (supply filter / buck)', 'SMD 6x6 (larger than 1210 case)', 1, 'counted', 'top', conf=0.6)
add('L2', 'transformer', 'Common-mode choke for the CAN bus lines (small wound choke, bottom)', 'SMD 4.5x3.2', 1, 'counted', 'bottom', conf=0.5)

# ── Electrolytics and crystal
add('C bulk 100 uF', 'capacitor', 'Aluminium electrolytic SMD 100 uF (marking "hJ 100 VHJ"), 125 C automotive', 'SMD 6.3x7.7', 1, 'counted', 'top', conf=0.7, value='100uF')
add('C bulk 22 uF pair', 'capacitor', 'Aluminium electrolytic SMD 22 uF (marking "22 JZC 6X6"), 125 C automotive', 'SMD 6.3x5.8', 2, 'counted', 'top', conf=0.7, value='22uF')
add('Y1', 'crystal', 'Quartz crystal / resonator for the MCU clock (beside U1)', 'SMD 5x3.2', 1, 'counted', 'top', conf=0.6)

# ── Passives: top ~160 (140–180), bottom ~110 (90–130); split read off the zooms (marked 0805 / 1206 values legible: 2R2, 4R7, 6R8,
#    270, 2700, 102, 104, 1003, 2R20; most small parts 0603)
add('R 0603 group', 'resistor', 'Thick-film chip resistor 1%', '0603', 85, 'estimated', 'both', lo=72, hi=98, conf=0.45)
add('R 0805 group', 'resistor', 'Thick-film chip resistor (marked values 4R7, 6R8, 2R2, 104 legible)', '0805', 35, 'estimated', 'both', lo=28, hi=42, conf=0.5)
add('R 1206 group', 'resistor', 'Thick-film chip resistor (marked values 270, 102, 1003, 2R2 legible)', '1206', 24, 'estimated', 'both', lo=20, hi=28, conf=0.5)
add('R 2512 group', 'resistor', 'Power / pulse chip resistor (2R20 x3, 270 x2, 2700 on the bottom)', '2512', 6, 'counted', 'bottom', conf=0.65)
add('C 0603 group', 'capacitor', 'MLCC X7R', '0603', 60, 'estimated', 'both', lo=50, hi=70, conf=0.45)
add('C 0805 group', 'capacitor', 'MLCC X7R', '0805', 34, 'estimated', 'both', lo=28, hi=40, conf=0.45)
add('C 1206 group', 'capacitor', 'MLCC X7R', '1206', 14, 'counted', 'both', lo=12, hi=16, conf=0.5)
add('C 1210 group', 'capacitor', 'MLCC X7R, bulk / supply (the large brown parts beside Q1, L1 and the 22 uF pair)', '1210', 12, 'counted', 'both', lo=10, hi=14, conf=0.55)

smt = sum(l['qty'] for l in L)
reading = {
  'board': {'name': 'Supercharger control board PCBA — Valeo B112235-B', 'pcbMaker': 'Dynamic Electronics (logo "dynamic", UL file KM1-V0, 94V-0)',
            'boardText': ['VALEO', 'B112235-B', 'LOT', '2663504', 'dynamic', 'KM1-V0', '94V-0', 'B1', '26 13'],
            'outline': '120 x 100 mm envelope (given) with a shaft opening (semicircle ~R20) and a ~30 x 45 mm window; six gold-ringed screw holes',
            'throughHoles': '~32 plated holes in five rows (6, 6, 4, 4, 3 + 3 + 2 + 4) carrying pins soldered at module assembly — cut / desoldered on this sample; NO connector is fitted on the board',
            'testPads': 'ENIG test pads on the bottom (bed-of-nails ICT) and a laser-marked 2D code area on the top'},
  'lines': L,
  'assembly': {'smtPlacements': smt, 'throughHoleJoints': 0, 'manualJoints': 0, 'bgaCount': 0, 'complexity': 'medium', 'reflowSides': 2,
               'aoiRequired': True, 'ictTimeSec': 30},
  'boardSpec': {'estimatedLayers': 4, 'widthMm': 118, 'heightMm': 98, 'dimensionsSource': 'estimated', 'surfaceFinish': 'enig',
                'solderMaskColour': 'green', 'silkscreenSides': 2, 'throughVias': 700, 'blindVias': 0, 'buriedVias': 0, 'microVias': 0,
                'bgaDetected': False, 'minTraceSpaceMm': 0.15, 'technologyType': 'STANDARD', 'hdiStructure': 'none',
                'impedanceControlRequired': False, 'copperWeightOz': 1, 'copperOzByLayer': [], 'boardWeightG': 0,
                'qualityGrade': 'auto_grade1', 'panelUtilisation': 0.75, 'conformalCoating': True},
}
json.dump(reading, open(os.path.join(H, 'reading.json'), 'w'), indent=1)

bom = [dict(refDes=l['refDes'], componentType=l['componentType'], description=l['description'], pkg=l['pkg'], value=l['value'],
            voltage='', qty=l['qty'], unitPriceGBP=0, moq=0, automotive=True, highCost=l['refDes'] == 'U1', partNumber=l['partNumber'],
            lineConf=l['lineConf'], ocrExtracted=l['ocrExtracted'], side=l['side'], countMethod=l['countMethod']) for l in L]
replies = {
  'stage1': {'domain': 'automotive_adas', 'conf': 0.85,
             'hints': ['automotive (the tool\'s automotive class) — 48 V electric supercharger (eSC) motor-controller logic board', 'NXP S12ZVMC256 motor-control MCU (customer build SC667506WKK), LQFP-80 EP', 'CAN, isolated gate-drive supply (T1)']},
  'asil': {'asilLevel': 'QM', 'asilRationale': 'Suggestion only, not confirmed: boost-assist on a combustion engine; the board shows no safety PMIC / SBC and a single MCU, so no ASIL-C/D architecture is evident.',
           'safetyFunctions': ['Motor torque / speed control of the compressor', 'Over-current and over-temperature shut-down']},
  'ocr': {'icMarkings': ['SC667506WKK'], 'refDesGroups': [], 'connectors': [], 'boardText': reading['board']['boardText'], 'extractionQuality': 'partial'},
  'analysis': {
    'partName': 'Supercharger control board PCBA — Valeo B112235-B',
    'boardSpec': reading['boardSpec'], 'bom': bom, 'assembly': reading['assembly'],
    'aiInsights': ['Logic / control board of a 48 V electric supercharger: one NXP S12ZVMC256 motor-control MCU (customer build SC667506WKK, LQFP-80 EP) with its own gate-drive unit and CAN physical layer, sense amplifiers, LDOs and an isolated auxiliary supply (EPCOS transformer T1 + SO-16 driver).',
                   'No connector is fitted: about 32 plated holes take pins that are soldered when the board is built into the housing.',
                   'Conformal coating on the component areas of both sides.'],
    'dfmIssues': ['Selective conformal coating on the component areas, both sides, with masked test pads and pin holes.',
                  'Irregular outline with a shaft opening and a window: routed out of the panel, lower panel utilisation.'],
    'highCostComponents': ['NXP SC667506WKK (S12ZVMC256) MCU', 'EPCOS transformer T1', 'Bare board 120 x 100 mm, 4 layers, ENIG'],
    'optimisationSuggestions': [], 'confidenceLevel': 'Medium',
    'analysisLimitations': ['Only the MCU marking is legible; every other IC is de-marked and priced by package class.',
                            'Resistor and MLCC counts are estimated from the zooms (range given per line).',
                            'Layer count, copper weight and via count cannot be seen: 4 layers, 1 oz, ~700 through vias estimated.']},
  'bomImage': {'rows': []},
}
json.dump(replies, open(os.path.join(H, 'replies.json'), 'w'), indent=1)
print('lines', len(L), 'SMT placements', smt, 'low', sum(l['qtyLow'] for l in L), 'high', sum(l['qtyHigh'] for l in L))
