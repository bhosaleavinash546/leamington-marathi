"""Research file for the BMW inverter review (26 Nov 2026): TI.com store prices (rule 10 of the merge script) for the
eight TI parts on the board, read in Chromium on the maker's part-details pages, plus the Digi-Key rows read for the
same parts in the costing's research batches. Run: python3 -I build.py  → ti-store-and-digikey.json"""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(H, '..', '..', 'bmw-rear-inverter-2026-11-26', 'research')
ti = json.load(open(os.path.join(B, 'ti-store.json')))
batches = [i for f in ('batch-a.json', 'batch-b.json') for i in json.load(open(os.path.join(B, f)))['items']]
META = {   # family, description, category, package — from the TI product pages (AEC-Q100 '-Q1' parts)
  'UCC5880QDFCRQ1': ('UCC5880-Q1', 'Isolated functional-safety SiC / IGBT gate driver, AEC-Q100', 'ic_soic', 'SSOP-32'),
  'UCC27282QDRCRQ1': ('UCC27282-Q1', '120 V half-bridge gate driver, AEC-Q100', 'ic_qfn', 'VSON-10 (DRC)'),
  'TPS7B8401QWDRBRQ1': ('TPS7B84-Q1', '40 V 150 mA LDO, AEC-Q100', 'ic_qfn', 'VSON-8 (DRB)'),
  'LM74202QPWPRQ1': ('LM74202-Q1', 'Ideal-diode / eFuse controller, AEC-Q100', 'ic_soic', 'HTSSOP-16 (PWP)'),
  'TLV9004QPWRQ1': ('TLV9004-Q1', 'Quad 1 MHz RRIO op-amp, AEC-Q100', 'ic_soic', 'TSSOP-14 (PW)'),
  'AMC1211AQDWVRQ1': ('AMC1211-Q1', 'Reinforced isolated amplifier, AEC-Q100', 'ic_soic', 'SOIC-8 wide (DWV)'),
  'LM5155QDSSRQ1': ('LM5155-Q1', 'Boost / SEPIC / flyback controller, AEC-Q100', 'ic_qfn', 'WSON-12 (DSS)'),
  'TCAN1057AVDRQ1': ('TCAN1057A-Q1', 'CAN FD transceiver, AEC-Q100', 'ic_soic', 'SOIC-8 (D)'),
}
parts = []
for it in ti['items']:
    mpn = it['found']
    fam, desc, cat, pkg = META[mpn]
    obs = [{'distributor': 'TI.com', 'qty': 1000, 'price': it['price1k'], 'currency': 'USD', 'url': it['url'],
            'date': ti['readOn'], 'evidence': 'page-read'}]
    for b in batches:
        if b.get('found') == mpn:
            for o in b.get('observations') or []:
                obs.append({k: o[k] for k in ('distributor', 'qty', 'price', 'currency', 'url')} | {'date': '2026-11-26'})
    parts.append({'mpn': mpn, 'family': fam, 'mfr': 'Texas Instruments', 'desc': desc, 'category': cat, 'pkg': pkg,
                  'aecq': True, 'observations': obs})
json.dump({'readOn': ti['readOn'], 'method': ti['method'] + '; Digi-Key rows from the costing research batches', 'parts': parts},
          open(os.path.join(H, 'ti-store-and-digikey.json'), 'w'), indent=1)
print(len(parts), sum(len(p['observations']) for p in parts))

# ── The other BMW parts' Digi-Key rows (read for the costing, 26 Nov 2026) — the BOM's code is the entry, the code read
# its alias (merge rule 5a). The XFMRS customer transformer is not merged (its rows are proxies, other parts).
OTHER = {   # BOM code: (orderable read, maker, description, category, package, AEC-Q)
  'SAK-TC389QP-160F300S AE': ('TC389QP160F300SAEKXUMA2', 'Infineon', 'AURIX TC389 32-bit TriCore lockstep MCU, AE step', 'ic_bga', 'LFBGA-516 (25 × 25 mm)', True),
  '74HC4075PW': ('74HC4075PW-Q100J', 'Nexperia', 'Triple 3-input OR gate, AEC-Q100', 'ic_soic', 'TSSOP-14', True),
  'PJQ4548P-AU': ('PJQ4548P-AU_R2_002A1', 'PANJIT', 'Automotive N-channel MOSFET, AEC-Q101', 'ic_soic', 'DFN3333-8', True),
  'PJQ5948-AU': ('PJQ5948-AU_R2_002A1', 'PANJIT', 'Automotive dual N-channel MOSFET, AEC-Q101', 'ic_soic', 'DFN5060B-8', True),
  'A768KE107M1VLAS036': ('A768KE107M1VLAS036', 'KEMET', 'Polymer aluminium capacitor 100 uF 35 V, SMD can', 'passive_1206', 'SMD can 8 mm', False),
  'SMBJ15A': ('SMBJ15AHE3_B/I', 'Vishay', 'TVS diode 600 W 15 V, automotive (HE3)', 'fuse_tvs', 'DO-214AA (SMB)', True),
  'TPSMC33A': ('TPSMC33A', 'Littelfuse', 'TVS diode 1500 W 33 V, AEC-Q101', 'fuse_tvs', 'DO-214AB (SMC)', True),
  'VSSAF3L45': ('VSSAF3L45HM3_A/I', 'Vishay', 'Schottky rectifier 3 A 45 V, automotive (HM3)', 'fuse_tvs', 'DO-221AC SlimSMA', True),
  'SZ1SMA5936BT3G': ('SZ1SMA5936BT3G', 'onsemi', 'Zener diode 30 V 1.5 W, AEC-Q101', 'fuse_tvs', 'DO-214AC (SMA)', True),
  'SZ1SMA5934BT3G': ('SZ1SMA5934BT3G', 'onsemi', 'Zener diode 24 V 1.5 W, AEC-Q101', 'fuse_tvs', 'DO-214AC (SMA)', True),
  'STTH112UFY': ('STTH112UFY', 'STMicroelectronics', 'Ultrafast rectifier 1 A 1200 V, automotive', 'fuse_tvs', 'DO-221AA SMBflat', True),
  'IHLP4040DZER220M': ('IHLP4040DZER220M1A', 'Vishay Dale', 'Power inductor 22 uH, IHLP 4040, automotive', 'passive_1206', 'IHLP 4040 (10.8 x 10.2 mm)', True),
  'B82462G4332M000': ('B82462G4332M000', 'TDK', 'SMD power inductor 3.3 uH, 6.3 x 6.3 mm, AEC-Q200', 'passive_1206', 'SMD 6.3 x 6.3 mm', True),
  'PWR221T-30': ('PWR221T-30-1000F', 'Bourns', 'Power resistor 30 W, TO-220 full pack (100 ohm read)', 'through_hole', 'TO-220 full pack (through-hole)', False),
}
other = []
for b in batches:
    key = next((k for k in OTHER if k.replace(' ', '') in str(b.get('bomPn', '')).replace(' ', '')), None)
    if not key or not b.get('observations'):
        continue
    found, mfr, desc, cat, pkg, aecq = OTHER[key]
    obs = [{k: o[k] for k in ('distributor', 'qty', 'price', 'currency', 'url')} | {'date': '2026-11-26'} for o in b['observations']]
    other.append({'mpn': key, 'family': key, 'mfr': mfr, 'desc': desc, 'category': cat, 'pkg': pkg, 'aecq': aecq,
                  **({'observedMpn': found} if found.replace(' ', '') != key.replace(' ', '') else {}), 'observations': obs})
json.dump({'readOn': '2026-11-26', 'method': 'Digi-Key product / search pages read for the BMW inverter costing (research batches A and B)', 'parts': other},
          open(os.path.join(H, 'bmw-digikey.json'), 'w'), indent=1)
print('other', len(other), sorted(p['mpn'] for p in other))
