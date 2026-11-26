#!/usr/bin/env python3
"""BMW rear-axle inverter control board (silkscreen "G6-CTRL REV007 5B3AE29-01", BMW roundel) — the reading.

Given (26 Nov 2026): the bill of materials (A2Mac1 teardown: part, maker, quantity, manufacturer part number — 39 rows,
1,189 parts), the PCB characteristics (rigid FR-4, 6 layers, copper 70/35/35/35/35/70 µm, tin finish, 1.6 mm, partial
conformal coating, components on both sides), 400,000 boards a year, built in China, 6-year programme, 12 photos.
The BOM is the parts list: identities and quantities are the BOM's. The photos only split the BOM's unnamed groups by
case size (capacitors, resistors) and give the board size: 280 × 220 mm, measured off the top view with the TC389's
25 × 25 mm LFBGA-516 body as the scale, checked on the SOIC-8 CAN transceivers (4.9 mm body) (±5 %).
Writes reading.json, bom.csv (the BOM as uploaded to the tool) and replies.json (the stand-in model reply the live run replays)."""
import json, os, csv
H = os.path.dirname(os.path.abspath(__file__))
L = []
def add(row, kind, maker, mpn, qty, desc, pkg, pads, split=''):
    L.append(dict(bomRow=row, refDes=row, componentType=kind, manufacturer=maker, partNumber=mpn, qty=qty, description=desc, pkg=pkg, padsEach=pads, split=split))

# ── Named parts (BOM rows with a manufacturer part number)
add('Integrated Circuit 1', 'ic_bga', 'Infineon', 'SAK-TC389QP-160F300S AE', 1, 'AURIX TC389 32-bit TriCore lockstep MCU, AE step (marking read; TC38x data sheet)', 'LFBGA-516 (25 × 25 mm)', 516)
add('Integrated Circuit 2', 'ic_qfn', 'Infineon', 'TLF35584QVVS1', 1, 'Safety power-supply / system basis chip for AURIX (ASIL-D)', 'VQFN-48', 49)
add('Integrated Circuit 3', 'ic_soic', 'Texas Instruments', 'LM74202QPWPRQ1', 1, 'Ideal-diode / eFuse controller, reverse-battery protection', 'HTSSOP-16', 17)
add('Integrated Circuit 4', 'ic_soic', 'Texas Instruments', 'TCAN1057AVDRQ1', 3, 'CAN FD transceiver', 'SOIC-8', 8)
add('Integrated Circuit 5', 'ic_qfn', 'Texas Instruments', 'TPS7B8401QWDRBRQ1', 11, '40 V LDO (gate-driver and sensor supplies)', 'VSON-8 (DRB)', 9)
add('Integrated Circuit 6', 'ic_qfn', 'Texas Instruments', 'UCC27282QDRCRQ1', 2, 'Half-bridge gate driver (isolated-supply push-pull)', 'VSON-10 (DRC)', 11)
add('Integrated Circuit 7', 'ic_soic', 'Texas Instruments', 'TLV9004QPWRQ1', 3, 'Quad op-amp', 'TSSOP-14', 14)
add('Integrated Circuit 8', 'ic_soic', 'NXP', '74HC4075PW', 2, 'Triple 3-input OR gate (marking HC4075 read)', 'TSSOP-14', 14)
add('Integrated Circuit 9', 'ic_soic', 'Texas Instruments', 'AMC1211AQDWVQ1', 1, 'Isolated amplifier (HV DC-link voltage sense)', 'SOIC-8 wide', 8)
add('Integrated Circuit 10', 'ic_soic', 'Analog Devices', 'ADuM4135', 3, 'Isolated gate driver (single channel, desat)', 'SOIC-16 wide', 16)
add('Integrated Circuit 11', 'ic_soic', 'Texas Instruments', 'UCC5880QDFCRQ1', 6, 'Isolated functional-safety SiC / IGBT gate driver (one per switch: HU/HV/HW, LU/LV/LW silkscreen)', 'SSOP-32', 32)
add('Integrated Circuit 12', 'ic_soic', 'Texas Instruments', 'LM2903-Q1', 1, 'Dual comparator', 'SO-8', 8)
add('Integrated Circuit 13', 'ic_qfn', 'Texas Instruments', 'LM5155QDSSRQ1', 1, 'Boost / flyback controller (gate-driver supply)', 'WSON-12', 13)
add('Sensor 1', 'ic_soic', 'Allegro', 'ACS37002', 2, 'Hall-effect current sensor', 'SOIC-16 wide', 16)
add('Sensor 2', 'ic_soic', 'Allegro', 'ACS37601', 2, 'Hall-effect current sensor, through-hole (4 leads)', 'SIP-4 (through-hole)', 0)
add('Transistor 1', 'transistor_mosfet', 'PANJIT', 'PJQ4548P-AU', 1, 'Automotive N-channel MOSFET', 'DFN3333-8', 8)
add('Transistor 2', 'transistor_mosfet', 'PANJIT', 'PJQ5948-AU', 2, 'Automotive dual N-channel MOSFET', 'DFN5060-8', 8)
add('Crystal 1', 'crystal', 'NDK', 'NX3225GA 20MHz', 1, 'Quartz crystal 20 MHz for the AURIX', 'SMD 3225', 4)
add('Diode 1', 'diode_tvs', 'Vishay', 'SMBJ15A', 1, 'TVS diode 600 W 15 V', 'SMB', 2)
add('Diode 2', 'diode_tvs', 'Littelfuse', 'TPSMC33A', 1, 'TVS diode 1500 W 33 V, automotive', 'SMC', 2)
add('Diode 3', 'diode', 'Vishay', 'VSSAF3L45', 1, 'Schottky rectifier 3 A 45 V', 'SMPA (DO-221BC)', 2)
add('Diode 4', 'diode_zener', 'onsemi', 'SZ1SMA5936BT3G', 6, 'Zener diode 30 V 1.5 W, automotive', 'SMA', 2)
add('Diode 5', 'diode_zener', 'onsemi', 'SZ1SMA5934BT3G', 3, 'Zener diode 24 V 1.5 W, automotive', 'SMA', 2)
add('Diode 6', 'diode', 'STMicroelectronics', 'STTH112UFY', 16, 'Ultrafast rectifier 1 A 1200 V, automotive (gate-driver bootstrap / desat)', 'SMBflat', 2)
add('Inductor 1', 'inductor_power', 'Vishay', 'IHLP4040DZER220M', 1, 'Power inductor 22 µH, 10 × 10 mm', 'SMD 10x10 (larger than 1210 case)', 2)
add('Inductor 2', 'transformer', 'XFMRS', 'XFMRS 2539 BMW-8-15T', 8, 'Isolated gate-driver supply transformer, 8 pins (customer part, marking read)', 'SMD 8-pin ~12x10', 8)
add('Inductor 3', 'inductor', 'TDK', 'B82462G4332M000', 1, 'SMD inductor 3.3 mH, 6.3 × 6 mm', 'SMD 6x6 (larger than 1210 case)', 2)
add('Inductor 4', 'inductor_power', 'Coilcraft', 'XEL4030V-472ME', 1, 'Power inductor 4.7 µH, automotive', 'SMD 4x4 (larger than 1210 case)', 2)
add('Capacitor 1', 'capacitor', 'KEMET', 'A768KE107M1VLAS036', 1, 'Polymer aluminium capacitor 100 µF 35 V (marking K 768 35Y06 100 read)', 'SMD can 8 mm', 2)
add('Capacitor 2', 'capacitor', 'Xiamen Faratronic', 'C47S1222K60', 4, 'MKP film safety capacitor 2.2 nF Y1 440 VAC (marking MKP 222K 440~ read), silicone-staked', 'THT box 17.5×12 mm, 15 mm pitch', 0)
add('Resistor 1', 'resistor', 'Bourns', 'PWR221T-30', 2, 'Power resistor (active-discharge / bleed), through-hole', 'TO-220 full pack (through-hole)', 0)

# ── Unnamed BOM groups, split by case size off the zooms (quantities are the BOM's)
add('Capacitor 3 (0402)', 'capacitor', '', '', 220, 'MLCC X7R (BOM "Capacitor 3", 437 in all) — logic and decoupling', '0402', 2, 'Capacitor 3 = 437')
add('Capacitor 3 (0603)', 'capacitor', '', '', 140, 'MLCC X7R (BOM "Capacitor 3")', '0603', 2, 'Capacitor 3 = 437')
add('Capacitor 3 (0805)', 'capacitor', '', '', 45, 'MLCC X7R (BOM "Capacitor 3")', '0805', 2, 'Capacitor 3 = 437')
add('Capacitor 3 (1206)', 'capacitor', '', '', 22, 'MLCC X7R, gate-driver supply arrays (BOM "Capacitor 3")', '1206', 2, 'Capacitor 3 = 437')
add('Capacitor 3 (1210)', 'capacitor', '', '', 10, 'MLCC X7R bulk (BOM "Capacitor 3")', '1210', 2, 'Capacitor 3 = 437')
add('Resistor 2 (0402)', 'resistor', '', '', 280, 'Thick-film chip resistor 1 % (BOM "Resistor 2", 511 in all)', '0402', 2, 'Resistor 2 = 511')
add('Resistor 2 (0603)', 'resistor', '', '', 190, 'Thick-film chip resistor 1 % (BOM "Resistor 2")', '0603', 2, 'Resistor 2 = 511')
add('Resistor 2 (0805)', 'resistor', '', '', 41, 'Thick-film chip resistor 1 % (BOM "Resistor 2")', '0805', 2, 'Resistor 2 = 511')
add('Resistor 3 (1206)', 'resistor', '', '', 32, 'Thick-film chip resistor, HV divider chain (markings 1153, 1151, E511 read) (BOM "Resistor 3", 40 in all)', '1206', 2, 'Resistor 3 = 40')
add('Resistor 3 (2512)', 'resistor', '', '', 8, 'Power / pulse chip resistor (BOM "Resistor 3")', '2512', 2, 'Resistor 3 = 40')
add('Diode 7', 'diode', '', '', 69, 'Small-signal / Schottky diode (BOM "Diode 7")', 'SOD-323', 2)
add('Discrete 3 Pins', 'transistor', '', '', 30, 'Small-signal transistor, MOSFET / BJT (BOM "Discrete 3 Pins")', 'SOT-23', 3)
add('Discretes (4+ pins)', 'transistor', '', '', 7, 'Dual small-signal transistor (BOM "Discretes (4+ pins)")', 'SOT-363', 6)
add('Ferrite 1', 'ferrite', '', '', 2, 'Ferrite bead (BOM "Ferrite 1")', '0603', 2)
add('Inductor 5', 'inductor', '', '', 3, 'Small SMD inductor (BOM "Inductor 5")', 'SMD 1210', 2)

parts = sum(l['qty'] for l in L); joints = sum(l['qty'] * l['padsEach'] for l in L)
assert parts == 1189, parts   # the BOM rows added up
SPEC = {'estimatedLayers': 6, 'widthMm': 280, 'heightMm': 220, 'dimensionsSource': 'estimated', 'surfaceFinish': 'imag', 'solderMaskColour': 'green',
        'silkscreenSides': 2, 'throughVias': 5000, 'blindVias': 0, 'buriedVias': 0, 'microVias': 0, 'bgaDetected': True, 'minTraceSpaceMm': 0.1,
        'technologyType': 'STANDARD', 'hdiStructure': 'none', 'impedanceControlRequired': False, 'copperWeightOz': 2, 'copperOzByLayer': [2, 1, 1, 1, 1, 2],
        'boardWeightG': 0, 'qualityGrade': 'auto_grade1', 'panelUtilisation': 0.75, 'conformalCoating': True}
ASM = {'smtPlacements': parts - 8, 'throughHoleJoints': 20, 'manualJoints': 0, 'bgaCount': 1, 'complexity': 'high', 'reflowSides': 2, 'aoiRequired': True, 'ictTimeSec': 40}
json.dump(dict(board=dict(name='BMW rear-axle inverter control board PCBA — G6-CTRL REV007', text=['G6-CTRL REV007 5B3AE29-01', 'BMW roundel', 'HU HV HW / LU LV LW'],
               spec='Rigid FR-4, 6 layers, copper 70/35/35/35/35/70 µm, tin, 1.6 mm, partial conformal coating, components on both sides (given)',
               size='280 × 220 mm envelope, measured off the top view with the TC389 body (25 mm) as the scale, checked on the SOIC-8s; irregular outline'),
               lines=L, parts=parts, joints=joints, boardSpec=SPEC, assembly=ASM), open(os.path.join(H, 'reading.json'), 'w'), indent=1, ensure_ascii=False)

with open(os.path.join(H, 'bom.csv'), 'w', newline='') as f:
    # No designator column: the BOM's row names ("Capacitor 3") are not designators — the parser would split them into
    # one-part lines. A BOM without designators is taken by its Quantity column (checked by count).
    w = csv.writer(f); w.writerow(['Description', 'Manufacturer', 'MPN', 'Package', 'Quantity'])
    for l in L: w.writerow([f"{l['refDes']}: {l['description']}", l['manufacturer'], l['partNumber'], l['pkg'], l['qty']])

bom = [dict(refDes=l['refDes'], componentType=l['componentType'], description=l['description'], pkg=l['pkg'], value='', voltage='', qty=l['qty'],
            unitPriceGBP=0, moq=0, automotive=True, highCost=l['refDes'] == 'Integrated Circuit 1', partNumber=l['partNumber'], lineConf=0.9 if l['partNumber'] else 0.6,
            ocrExtracted=False, side='both', countMethod='counted') for l in L]
replies = {
 'stage1': {'domain': 'automotive_adas', 'conf': 0.92, 'hints': ['automotive traction inverter control board (rear axle)', 'Infineon AURIX TC389 + TLF35584 safety PMIC', 'six isolated gate drivers (HU/HV/HW, LU/LV/LW)']},
 'asil': {'asilLevel': 'ASIL-D', 'asilRationale': 'Suggestion, not confirmed: a traction-inverter controller with a lockstep AURIX and the TLF35584 safety PMIC — torque safety goals are typically ASIL-C/D.',
          'safetyFunctions': ['Prevention of unintended torque', 'Safe state (active short circuit / freewheel)', 'DC-link voltage and phase-current monitoring']},
 'ocr': {'icMarkings': ['SAK-TC389QP-160F300S AE', 'XFMRS 2539 BMW-8-15T', 'HC4075', 'MKP 222K 440~', 'K 768 35Y06 100'], 'refDesGroups': [], 'connectors': [],
         'boardText': ['G6-CTRL REV007 5B3AE29-01', 'HU', 'HV', 'HW', 'LU', 'LV', 'LW'], 'extractionQuality': 'good'},
 'analysis': {'partName': 'BMW rear-axle inverter control board PCBA — G6-CTRL REV007', 'boardSpec': SPEC, 'bom': bom, 'assembly': ASM,
   'aiInsights': ['Traction-inverter control board: AURIX TC389 with TLF35584 safety supply, six UCC5880-Q1 isolated gate drivers, 8 isolated-supply transformers, current and HV sensing, CAN FD.'],
   'dfmIssues': ['Partial conformal coating (selective).', 'Silicone staking on the 8 gate-drive transformers and the 4 film capacitors.'],
   'highCostComponents': ['AURIX TC389', 'UCC5880-Q1 × 6', 'ADuM4135 × 3', 'TLF35584', 'Gate-drive transformers × 8'],
   'optimisationSuggestions': [], 'confidenceLevel': 'High', 'analysisLimitations': ['Board size measured off a photo (±5 %).']},
 'bomImage': {'rows': []}}
json.dump(replies, open(os.path.join(H, 'replies.json'), 'w'), indent=1, ensure_ascii=False)
print('lines', len(L), 'parts', parts, 'SMT joints', joints)
