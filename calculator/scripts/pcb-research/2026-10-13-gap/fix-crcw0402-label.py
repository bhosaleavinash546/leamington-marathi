#!/usr/bin/env python3
"""One-off label correction (13 Oct 2026). An earlier round's family match put three listings of the 0 ohm jumper
CRCW04020000Z0ED onto the 10 k CRCW040210K0FKED (the merge rule is fixed). Its price is NOT changed here - thick-film
CRCW0402 AEC-Q200 prices do not depend on the value - but its source must say what the price was read on.
Run after the merge; idempotent."""
import json, os
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../server/data/pcb-component-catalogue.json')
d = json.load(open(p))
e = next(x for x in d['parts'] if x['mpn'] == 'CRCW040210K0FKED')
note = 'Priced on the sibling orderable code CRCW04020000Z0ED (same Vishay CRCW0402 AEC-Q200 series, 0 ohm jumper - thick-film series pricing does not depend on the value; no 10 k listing was recorded). '
if not e['source'].startswith('Priced on the sibling orderable code'):
    e['source'] = note + e['source']
json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False); open(p, 'a').write('\n')
print('labelled', e['mpn'])
