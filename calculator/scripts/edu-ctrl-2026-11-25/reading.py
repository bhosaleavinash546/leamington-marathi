#!/usr/bin/env python3
"""Reading of the Dana TM4 'PCBA Gemini CTRL C-Sample' (PC-10465018-D, label 10559212 REV H) from the user's 20 photos,
25 Nov 2026. Written by hand from the photos — it stands in for the tool's AI reading (Stage 1 classifier, OCR, ASIL,
Stage 3 parts list); the tool then prices, assembles and reports from it. NO PRICE here is used by the tool: a model's
unitPriceGBP is audit only (class ranges / catalogue set every price). Evidence per line in `basis`:
  READ     = a marking or value read on the part in a photo
  COUNTED  = parts counted in a photo
  EST      = estimated: the count comes from the highest designators seen (R1291, C627, L53, U70, Q71, D70, Z37, TP58)
             less an assumed share not fitted; the function from the layout. Confirm against the real BOM.
Photo numbers are the order the user sent them (1-2 AURIX close-ups, 3 and 9 whole top, 10 whole bottom, 11 and 17 the
discharge bank, 16 the customer connector, 19 the flyback transformer).
Writes replies.json (stand-in replies) and reading.json (the same lines for the manual costing)."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))

L = []   # (refDes, componentType, description, pkg, value, voltage, qty, partNumber, basis, automotive)
def add(ref, ct, desc, pkg, qty, value='', voltage='', pn='', basis='EST', conf=0.5):
    L.append(dict(refDes=ref, componentType=ct, description=desc, pkg=pkg, value=value, voltage=voltage, qty=qty, partNumber=pn,
                  basis=basis, lineConf=conf))

# ── ICs ────────────────────────────────────────────────────────────────────────────────────────────────────────────
add('AURIX pair', 'ic_bga', 'Infineon AURIX TC387QP 32-bit lockstep automotive microcontroller, one per motor channel (board zones UC1 and UC2)', 'LFBGA-292', 2,
    pn='SAK-TC387QP-160F300S AE', basis='READ: marking SAK-TC387QP-160F300S AE on both MCUs (photos 1-2)', conf=0.95)
add('U39, U40', 'ic_qfn', 'Safety power-management IC (PMIC / system basis chip) for the AURIX, multi-rail with watchdog, beside the 5V_PMIC, INT_PMIC, ROT_PMIC and V_PREREG silkscreen labels — marking not read', 'VQFN-48 7x7', 2,
    basis='COUNTED 2 (one per MCU zone); function from the adjacent PMIC silkscreen labels; marking not legible', conf=0.6)
add('DC-DC group', 'ic_qfn', 'DC-DC converter IC (buck pre-regulator and resolver-excitation boost, beside L29 22 uH and L34) — marking not read', 'QFN-16', 4,
    basis='EST 4 from the converter inductors seen (22 uH, 4R7, resolver boost x2)')
add('LDO group', 'ic_soic', 'LDO linear regulator', 'SOT-23-5', 6, basis='EST')
add('CAN group', 'ic_soic', 'CAN FD transceiver (vehicle and private bus; CAN common-mode chokes L39 / L41 at the customer connector)', 'SOIC-8', 4,
    basis='EST 4 (two CAN chokes seen, two MCUs)')
add('U8, U15, U61', 'ic_soic', 'Isolated amplifier / isolated HV-bus voltage sense across the creepage slots (U8 footprint shared with U50)', 'SOIC-8 wide', 3,
    basis='COUNTED 3 SO-8 parts in the HV area (U61 between the two slots, U15, U8/U50)', conf=0.6)
add('Flyback ctrl', 'ic_soic', 'Flyback controller for the HV-to-LV auxiliary supply (transformer T1, VAUXSAFE)', 'SOIC-8', 1, basis='EST: one HV auxiliary flyback (T1) seen')
add('U12, U16, U17', 'ic_soic', 'Dual operational amplifier (resolver excitation / sense, current-sense conditioning), channel 1', 'SOIC-8', 3,
    basis='COUNTED 3 SO-8 op-amp footprints in channel 1', conf=0.6)
add('Dual op-amp group, channel two', 'ic_soic', 'Dual operational amplifier, channel 2 (same layout as channel 1)', 'SOIC-8', 3, basis='EST by symmetry with channel 1')
add('Quad op-amp group', 'ic_soic', 'Quad operational amplifier (resolver interface beside the MOTOR connectors)', 'TSSOP-14', 4,
    basis='COUNTED 2 TSSOP beside J2 MOTOR, x2 channels', conf=0.55)
add('U35, U36', 'ic_soic', 'Interface IC near VAUXSAFE (digital isolator or transceiver) — marking not read', 'TSSOP-20', 2, basis='COUNTED 2', conf=0.55)
add('U20, U22, U43', 'ic_qfn', 'Small mixed-signal IC (sensor interface / monitor) — marking not read', 'QFN-20 4x4', 3, basis='COUNTED 3', conf=0.5)
add('Comparator group', 'ic_soic', 'Comparator / voltage supervisor', 'SOT-23-5', 6, basis='EST')
add('Logic group', 'ic_soic', 'Single-gate logic / buffer', 'SC-70-5', 8, basis='EST')
add('Ref group', 'ic_soic', 'Voltage reference / temperature sensor IC', 'SOT-23', 4, basis='EST')
add('U63, U64, U65, U66, U67, U68', 'ic_soic', 'ESD protection array on the motor-connector signal lines', 'SOT-23', 6,
    basis='COUNTED 3 per motor connector on the bottom side (U63/U65/U67, U64/U66/U68)', conf=0.7)
add('EEPROM group', 'ic_soic', 'Serial EEPROM (calibration / fault memory)', 'SOIC-8', 2, basis='EST: one per MCU (not seen marked)')
# ── Discretes ──────────────────────────────────────────────────────────────────────────────────────────────────────
add('Q62', 'transistor_mosfet', 'HV power transistor (MOSFET or IGBT, bus-voltage rated) switching the active bus discharge (BUS DISCHARGE HOT ZONE), 7-lead D2PAK — marking not read', 'TO-263-7', 1,
    basis='COUNTED 1 (photo 7)', conf=0.6)
add('Q3', 'transistor_mosfet', 'HV power transistor (MOSFET or IGBT, bus-voltage rated), 3-lead D2PAK in the discharge zone — marking not read', 'TO-263', 1, basis='COUNTED 1', conf=0.6)
add('Q63', 'transistor_mosfet', 'HV power transistor (MOSFET or IGBT, bus-voltage rated) under polyimide tape beside the bottom thermal pad (flyback / discharge)', 'TO-263-7', 1, basis='COUNTED 1 (bottom)', conf=0.5)
add('Power MOSFET group', 'transistor_mosfet', 'Power MOSFET (low-voltage switching, reverse-polarity)', 'DPAK / LFPAK56', 4, basis='EST')
add('Q small-signal group', 'transistor', 'Small-signal MOSFET / BJT', 'SOT-23', 58, basis='EST from Q71 highest designator less those counted above')
add('K1, K2', 'relay', 'PhotoMOS solid-state relay (HV isolation / discharge enable)', 'SOP-4', 2, basis='COUNTED 2 (K1, K2 beside Q62)', conf=0.6)
add('D small-signal group', 'diode', 'Small-signal / Schottky diode', 'SOD-323 / SOT-23', 44, basis='EST')
add('D rectifier group', 'diode', 'Rectifier / Schottky diode', 'SMA / SMB', 8, basis='EST')
add('D34, D35', 'diode', 'Power diode (supply OR-ing / reverse protection), channel 1', 'SMC', 2, basis='COUNTED 2', conf=0.65)
add('Power diode pair, channel two', 'diode', 'Power diode (supply OR-ing / reverse protection), channel 2', 'SMC', 2, basis='EST by symmetry')
add('Z4, Z6, Z8, Z10, Z12, Z14', 'diode_tvs', 'TVS diode on the gate-signal lines G2-G6', 'SMB', 6, basis='COUNTED 6 (photo 4)', conf=0.75)
add('TVS SMA group', 'diode_tvs', 'TVS diode', 'SMA', 4, basis='EST')
add('Zener group', 'diode_zener', 'Zener diode', 'SOD-123', 24, basis='EST from Z37 highest designator')
add('LED group', 'led', 'Status LED (the D33 type)', '0603', 4, basis='COUNTED 2 + EST 2')
# ── Passives ───────────────────────────────────────────────────────────────────────────────────────────────────────
add('Bus-discharge bank (10 x 18 grid)', 'resistor', 'Thick-film chip resistor 46.4 kOhm 1% (marking 4642), bus-discharge bank on the bottom thermal pad', '1206', 180,
    value='46.4k', basis='COUNTED 10 columns x 18 rows (photos 11, 17); marking 4642 READ', conf=0.85)
add('R 0402 group', 'resistor', 'Thick-film chip resistor 1%', '0402', 540, basis='EST: 1,160 resistors from R1291 less 10% not fitted, split by size from the photos')
add('R 0603 group', 'resistor', 'Thick-film chip resistor 1% (EIA-96 marked, e.g. 01B / 01C / 01D)', '0603', 345, basis='EST; markings READ on several')
add('R 0805 group', 'resistor', 'Thick-film chip resistor', '0805', 40, basis='EST')
add('R 1206 group', 'resistor', 'Thick-film chip resistor, HV divider / gate (markings 2551, 59R0, 122, 751 read)', '1206', 40, basis='EST; markings READ on several')
add('R 2512 group', 'resistor', 'Power / pulse chip resistor', '2512', 15, basis='EST')
add('NTC group', 'resistor_ntc', 'NTC thermistor (board temperature)', '0603', 4, basis='EST')
add('PTC thermistor group', 'through_hole', 'PTC thermistor, leaded disc, silicone-coated (marking BC 1K5 read; R999, R915 and two more), 2 pins', 'radial THT', 4, basis='COUNTED 4 on the bottom (photo 16)', conf=0.7)
add('C 0402 group', 'capacitor', 'MLCC X7R', '0402', 300, basis='EST: 565 capacitors from C627 less 10% not fitted, split by size')
add('C 0603 group', 'capacitor', 'MLCC X7R', '0603', 150, basis='EST')
add('C 0805 group', 'capacitor', 'MLCC X7R', '0805', 50, basis='EST')
add('C 1206 group', 'capacitor', 'MLCC X7R', '1206', 35, basis='EST')
add('C 1210 group', 'capacitor', 'MLCC X7R, high voltage / bulk', '1210', 22, basis='EST; several large MLCCs seen beside the converters and on the bottom (C607-C624)')
add('Hybrid 100 uF group', 'capacitor', 'Hybrid polymer aluminium electrolytic 100 uF 50 V, 125 C (Nichicon GYC, marking 100H read; C165, C626, C629 and one more)', 'SMD 8x10', 4,
    value='100uF', voltage='50V', basis='COUNTED 2 top + 2 bottom; marking READ', conf=0.85)
add('Hybrid 330 uF pair', 'capacitor', 'Hybrid polymer aluminium electrolytic 330 uF 25 V, 125 C (Nichicon GYC, marking 330E read)', 'SMD 10x10', 2,
    value='330uF', voltage='25V', basis='COUNTED 2; marking READ', conf=0.85)
add('Film capacitor (bottom)', 'through_hole', 'Film capacitor, rectangular, Y / X safety or snubber, beside the flyback transformer, 2 pins', 'radial THT', 1, basis='COUNTED 1 (bottom)', conf=0.6)
add('Motor-line filter inductors', 'inductor', 'SMD inductor, signal-line filter at the motor connectors (L42-L53, 12 fitted)', '1812 (larger than 1210 case)', 12,
    basis='COUNTED 6 per motor connector on the bottom (L44 / L46 / L48 / L50 footprints empty)', conf=0.75)
add('L39, L41', 'transformer', 'Common-mode choke for the vehicle bus lines', 'SMD 4.5x3.2', 2, basis='COUNTED 2 at the customer connector', conf=0.7)
add('Coupled choke group', 'transformer', 'Common-mode / coupled choke ~7x7 mm (marking 701 read; L16, L19, L22, L25 and two more)', 'SMD 7x7', 6, basis='COUNTED 5-6 (photo 4); marking READ', conf=0.65)
add('Small choke group', 'inductor', 'Small SMD inductor / choke', '1210', 6, basis='EST from photo 4')
add('Power inductor 4.7 uH group', 'inductor_power', 'Shielded power inductor 4.7 uH (marking 4R7 read; L15, L38 and one more)', 'SMD 6x6 (larger than 1210 case)', 3, value='4.7uH', basis='COUNTED 3; marking READ', conf=0.8)
add('10 uH pair', 'inductor_power', 'Shielded power inductor 10 uH (marking 100 read)', 'SMD 6x6 (larger than 1210 case)', 2, value='10uH', basis='COUNTED 2; marking READ', conf=0.8)
add('L35, L36', 'inductor_power', 'Shielded power inductor 3.3 uH, AURIX core supply on the 1V25 rail (marking 3R3 read)', 'SMD 4x4 (larger than 1210 case)', 2, value='3.3uH', basis='COUNTED 2; marking READ', conf=0.8)
add('L29', 'inductor_power', 'Shielded power inductor 22 uH (marking 22uH 3010Y read)', 'SMD 10x10 (larger than 1210 case)', 1, value='22uH', basis='COUNTED 1; marking READ', conf=0.85)
add('Resolver boost inductor pair', 'inductor_power', 'Power inductor for the excitation boost converter (L34 and its channel-2 twin)', 'SMD 4x4 (larger than 1210 case)', 2, basis='COUNTED 1 + EST 1')
add('Ferrite bead group', 'ferrite', 'Ferrite bead', '0603', 11, basis='EST')
add('Large choke (top edge)', 'through_hole', 'Large common-mode choke, through-hole, HV area (L1 / L2), 4 pins', 'THT ~12x12', 1, basis='COUNTED 1', conf=0.6)
add('T1', 'transformer', 'Flyback power transformer for the HV-to-LV auxiliary supply (triple-insulated winding), through-hole 10 pins', 'THT EFD/EP ~25', 1, basis='COUNTED 1 (bottom, photo 19)', conf=0.7)
add('Y1, Y2', 'crystal', 'Quartz crystal for the AURIX (one per MCU)', 'SMD 3225', 2, basis='COUNTED 1 (Y2) + 1 by symmetry', conf=0.7)
# ── Connectors and hardware ────────────────────────────────────────────────────────────────────────────────────────
add('J12 CUSTOMER', 'connector', 'Sealed automotive 34-way header with flange and three bolt inserts, press-fit (CUSTOMER, CONNECTOR PUSH ZONE)', 'press-fit 34-way', 1,
    basis='COUNTED 1 (photos 10, 16)', conf=0.75)
add('J2, J3 MOTOR', 'connector', 'Motor / resolver connector 20-way, 2 rows, right angle, press-fit (MOTOR)', 'press-fit 20-way', 2, basis='COUNTED 2', conf=0.75)
add('J22, J23', 'connector', 'Board-to-board connector to the power stage, SMD', 'SMD ~30-way', 2, basis='COUNTED 2 (bottom corners, photo 10)', conf=0.6)
add('J1', 'through_hole', 'HVIL connector header, 3 pins, through-hole', 'THT 3-way', 1, basis='COUNTED 1', conf=0.7)
add('J4, J5', 'through_hole', 'Wire-to-board connector header, white, 7 pins (5 contacts + 2 pegs), through-hole', 'THT 5-way 2.5 mm', 2, basis='COUNTED 2', conf=0.75)
add('J6, J7', 'through_hole', 'Pin header 2x4, 8 pins (debug / programming), through-hole', 'THT 2x4 2.54 mm', 2, basis='COUNTED 2', conf=0.75)
add('J10, J11', 'switch', 'Tactile switch / jumper (one per MCU zone)', 'SMD', 2, basis='COUNTED 2', conf=0.5)
add('J15-J21', 'mechanical', 'Single press-fit / solder pin (sense or probe)', 'THT pin', 7, basis='COUNTED J15-J21', conf=0.6)
add('TP group', 'testpoint', 'SMD test point (metal loop terminal)', 'SMD', 50, basis='EST from TP58 (most seen fitted)')
add('Earth lug pair', 'mechanical', 'Earth lug, stamped, soldered', 'THT', 2, basis='COUNTED 2 at the customer connector', conf=0.7)
add('Bus terminals (+ / -)', 'mechanical', 'Press-in nut for the HV bus terminals', 'press-in M5', 2, basis='COUNTED 2', conf=0.6)

# The assembly the parts imply.
smt = sum(l['qty'] for l in L if not any(k in l['pkg'] for k in ('THT', 'press-fit', 'press-in', 'radial')) and l['componentType'] not in ('mechanical',))
tht_joints = 10 + 2 + 4 * 2 + 4 + 3 + 2 * 7 + 2 * 8 + 7 + 2 * 2      # T1, film, PTCs, choke, J1, J4/J5 (+ pegs), J6/J7, pins, lugs
pressfit_pins = 34 + 20 * 2
assembly = dict(smtPlacements=smt, throughHoleJoints=tht_joints + pressfit_pins, manualJoints=0, bgaCount=2, complexity='high', reflowSides=2,
                aoiRequired=True, ictTimeSec=90)
boardSpec = dict(estimatedLayers=6, widthMm=395, heightMm=215, dimensionsSource='estimated', surfaceFinish='hasl_lf', solderMaskColour='green',
                 silkscreenSides=2, throughVias=4500, blindVias=0, buriedVias=0, microVias=0, bgaDetected=True, minTraceSpaceMm=0.1,
                 technologyType='STANDARD', hdiStructure='none', impedanceControlRequired=True, copperWeightOz=1, copperOzByLayer=[],
                 boardWeightG=0, qualityGrade='auto_grade2', panelUtilisation=0.75, conformalCoating=True)

bom = [dict(refDes=l['refDes'], componentType=l['componentType'], description=l['description'], pkg=l['pkg'], value=l['value'], voltage=l['voltage'],
            qty=l['qty'], unitPriceGBP=0, moq=0, automotive=True, highCost=l['componentType'] == 'ic_bga', partNumber=l['partNumber'],
            lineConf=l['lineConf'], ocrExtracted=l['partNumber'] != '') for l in L]
analysis = dict(
    partName='EDU control board PCBA — Dana TM4 Gemini CTRL (PC-10465018-D)',
    boardSpec=boardSpec, bom=bom, assembly=assembly,
    aiInsights=['Dual-channel EV drive-unit (inverter) control board: two AURIX TC387QP MCUs (UC1, UC2), one per motor channel, each with a safety PMIC.',
                'High-voltage section: active bus-discharge switch (Q62) driving a 180-resistor bank on the bottom thermal pad; isolated HV-bus sensing across creepage slots; HV-to-LV flyback auxiliary supply (T1).',
                'Interfaces: sealed 34-way customer connector, two 20-way motor / resolver connectors (press-fit), HVIL, two board-to-board connectors to the power stage.'],
    dfmIssues=['Press-fit connectors (J2, J3, J12) need a press operation and press tooling; not a solder joint.',
               'Conformal coating on the whole board both sides, with masked connector and test areas.',
               'Silicone staking / potting on four leaded PTC thermistors and the transformer.'],
    highCostComponents=['AURIX TC387QP x2', 'Safety PMIC x2', 'Customer 34-way sealed connector', 'Bare board 395 x 215 mm'],
    optimisationSuggestions=[], confidenceLevel='Medium',
    analysisLimitations=['Only the two AURIX markings are legible; every other IC is identified by package and position and priced by class.',
                         'Part counts for resistors, capacitors, discretes and test points are estimated from the highest designators seen, less 10% not fitted.',
                         'Layer count, copper weight and via count cannot be seen in photos: 6 layers, 1 oz, 4,500 through vias estimated.'])
stage1 = dict(domain='automotive_adas', conf=0.9, hints=['EV traction inverter / drive-unit control board', 'dual AURIX TC387 lockstep MCU', 'HV bus discharge, HVIL, resolver interface'])
ocr = dict(icMarkings=['SAK-TC387QP-160F300S AE', 'SAK-TC387QP-160F300S AE'], refDesGroups=[], connectors=[],
           boardText=['PC-10465018-D', 'PCBA Gemini CTRL C-Sample', 'DANA TM4', '10559212 REV H', 'CE-104643', 'BUS DISCHARGE HOT ZONE', 'MOTOR', 'CUSTOMER',
                      'HVIL', 'RESOLVER BOOST', 'THERMAL PAD', 'CONNECTOR PUSH ZONE', 'UC1', 'UC2'], extractionQuality='good')
asil = dict(asilLevel='ASIL-D', asilRationale='Traction inverter control for an EV drive unit: unintended or loss of torque and failure of the HV active discharge are hazardous; dual lockstep MCUs with safety PMICs indicate an ASIL-C/D design.',
            safetyFunctions=['Torque control / prevention of unintended torque', 'Safe state (active short circuit / freewheel)', 'HV DC-link active discharge'])
json.dump(dict(stage1=stage1, asil=asil, ocr=ocr, analysis=analysis, bomImage=dict(rows=[])), open(os.path.join(H, 'replies.json'), 'w'), indent=1)
json.dump(dict(lines=L, assembly=assembly, boardSpec=boardSpec), open(os.path.join(H, 'reading.json'), 'w'), indent=1)
print('lines', len(L), 'parts', sum(l['qty'] for l in L), 'SMT placements', smt, 'THT joints', tht_joints, 'press-fit pins', pressfit_pins)
