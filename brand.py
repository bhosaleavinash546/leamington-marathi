"""Brand tokens for the Python deck and workbook generators (I5).

One source, shared with the app: calculator/src/brand/brand.json.
    from brand import rgb, hexcol, FONTS
    NAVY = rgb('navy')          # python-pptx RGBColor
    NAVY_HEX = hexcol('navy')   # '16325C' for openpyxl
"""
import json
import pathlib

_B = json.loads((pathlib.Path(__file__).resolve().parent / 'calculator' / 'src' / 'brand' / 'brand.json').read_text())
FONTS = _B['fonts']


def hexcol(name: str) -> str:
    return _B['onLight'][name]


def rgb(name: str):
    from pptx.dml.color import RGBColor
    h = hexcol(name)
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
