#!/usr/bin/env python3
"""The engineer's given prices (26 Nov 2026) for the supercharger board. Writes research/line-prices.json, read by manual.py.
The identity and price research behind the board's other lines is in research/parts.json."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
L = {'U1': dict(unitGBP=3.55, kind='given',
    basis='£3.55 a part at 100,000 a year, given by the engineer for S912ZVMC25F1WKK — the standard NXP part of which SC667506WKK is the '
          'customer build (S12ZVMC256, mask set 1N00R, 80 LQFP-EP, −40 to 150 °C). Not Valeo\'s contract price.',
    sources=[dict(mpn='S912ZVMC25F1WKK', maker='NXP', grade='−40 to 150 °C, AEC-Q100', seller='Mouser UK', quote='volume pricing', date='26 Nov 2026',
                  url='https://www.mouser.co.uk/en/ProductDetail/NXP-Semiconductors/S912ZVMC25F1WKK?qs=xIeDRCTlTgFilfDw8lumtw%3D%3D'),
             dict(mpn='S912ZVMC25F1WKK', maker='NXP', grade='−40 to 150 °C, AEC-Q100', seller='Digi-Key', quote='volume pricing', date='26 Nov 2026',
                  url='https://www.digikey.com/en/products/detail/nxp-usa-inc/S912ZVMC25F1WKK/6556971')])}
json.dump(dict(readOn='2026-11-26', lines=L), open(os.path.join(H, 'research', 'line-prices.json'), 'w'), indent=1, ensure_ascii=False)
print('U1 £3.55 (given)')
