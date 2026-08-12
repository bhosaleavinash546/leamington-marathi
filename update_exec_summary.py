#!/usr/bin/env python3
"""
Refresh CostVision-Executive-Summary.pptx with current data.

This deck has no builder. It was assembled in July by subsetting the Platform
Executive Briefing package at the zip level and committed as a binary, so it is
edited in place.

IT MUST NOT BE ROUND-TRIPPED THROUGH python-pptx. Opening and re-saving it with
`Presentation(...).save(...)` emits sixteen DUPLICATE zip entries — slide3.xml,
slide4.xml, slide7.xml and their .rels among them — where the original package
has none. Two parts in the subset package resolve to the same partname, and
python-pptx serialises both. A zip with duplicate members is exactly what
PowerPoint refuses. This is the defect commit a317e69 hit in July ("assembled
via clean.py part-renaming + a python-pptx re-save, which PowerPoint flagged for
repair"); the conclusion then, and now, is to stay at the XML level.

So: read the package, rewrite only the slide XML that needs changing, and copy
every other member through untouched. Idempotent — re-running is a no-op.

What changes, and why each number is what it is:

  * Test count -- "1,005 automated tests across 86 suites" was stale. The true
    figure is 1,777 across 136, from running `npm test` (136 files passed, 1777
    tests passed), not from copying another slide. Three different counts were
    circulating across the four decks; this is the measured one.

  * "19 commodity engines" is CORRECT and is deliberately left alone. Verified
    against src/engine/modules: 19 `compute*Drivers` entry points, gear
    included. (The Executive Presentation says 21 because its grid also counts
    Assembly BOM Rollup and the AI Agent, neither of which is a cost engine.)

  * Slide 8's grid drew only 18 chips under that headline of 19. The missing one
    is gear cutting, which shipped after this deck was built. Adding it makes
    the grid and its own headline agree for the first time.

  * A line each for the three other capabilities added since July: geometric
    DFM, landed cost and customs, and the deterministic self-audit.
"""
import copy
import os
import re
import shutil
import sys
import tempfile
import zipfile

from lxml import etree

DECK = 'CostVision-Executive-Summary.pptx'

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
NS = {'p': P, 'a': A}
EMU = 914400

# ── text replacements: (slide number, exact old <a:t>, new <a:t>) ────────────
REPLACEMENTS = [
    (13,
     '1,005 automated tests across 86 suites, exercised end-to-end — and the '
     'container build is verified in CI.',
     '1,777 automated tests across 136 suites, exercised end-to-end. Every '
     'estimate is re-checked by a deterministic self-audit before anyone sees '
     'it — and the container build is verified in CI.'),
    (13,
     'Accuracy is checked against real geometry and real quotes, and reported '
     'openly — before and after.',
     'Accuracy is checked against real geometry and real quotes, and reported '
     'openly. The DFM layer now opens the 3D model and measures every face, '
     'and every rule it applies cites a published standard.'),
    (10,
     'China −23% ex-works, narrowing to −12% landed once logistics & duty are '
     'added — the model shows both.',
     'China −23% ex-works, narrowing to −12% landed once logistics, duty, the '
     'CBAM carbon levy and incoterms are added — the model shows both.'),
]

# ── slide 8 commodity grid ───────────────────────────────────────────────────
# Each chip is three shapes: panel (w 3.85"), bullet dot (0.14"), label (3.20").
# The three differ in x, so the column carries all three offsets.
COLS = [(0.60, 0.84, 1.10), (4.73, 4.97, 5.23), (8.86, 9.10, 9.36)]
ROW_TOP = 2.05
# Nineteen chips need seven rows. At the original 0.70" pitch row seven would
# run to 6.80" and collide with the "One method under all of them" panel at
# 6.28"; 0.60" puts the last chip's bottom at 6.20".
ROW_PITCH = 0.60
DOT_DY = 0.21
NEW_CHIP = 'Gear cutting — hob · shape · grind'
AFTER = 'CNC machining'          # sits with the other metal-cutting processes


def _texts(sp):
    return [t.text or '' for t in sp.iterfind(f'.//{{{A}}}t')]


def _shape_width(sp):
    ext = sp.find(f'.//{{{A}}}ext')
    return int(ext.get('cx')) / EMU if ext is not None else None


def _shape_top(sp):
    off = sp.find(f'.//{{{A}}}off')
    return int(off.get('y')) / EMU if off is not None else None


def _move(sp, x_in, y_in):
    off = sp.find(f'.//{{{A}}}off')
    off.set('x', str(int(round(x_in * EMU))))
    off.set('y', str(int(round(y_in * EMU))))


def patch_text(xml, old, new):
    """Replace the text of a single <a:t>. Returns (xml, applied|already|None)."""
    root = etree.fromstring(xml)
    for t in root.iterfind(f'.//{{{A}}}t'):
        if t.text == old:
            t.text = new
            return etree.tostring(root, xml_declaration=True,
                                  encoding='UTF-8', standalone=True), 'applied'
        if t.text == new:
            return xml, 'already'
    return xml, None


def patch_grid(xml):
    root = etree.fromstring(xml)
    spTree = root.find(f'.//{{{P}}}cSld/{{{P}}}spTree')

    # Group the grid shapes into (panel, dot, label) triples in document order.
    triples, current = [], None
    for sp in spTree.iterfind(f'{{{P}}}sp'):
        w, top = _shape_width(sp), _shape_top(sp)
        if w is None or top is None or top < ROW_TOP - 0.01 or top > 6.0:
            continue
        if abs(w - 3.85) < 0.01:
            current = [sp]
            triples.append(current)
        elif current is not None and (abs(w - 0.14) < 0.01 or abs(w - 3.20) < 0.01):
            current.append(sp)
    triples = [t for t in triples if len(t) == 3]

    labels = [' '.join(_texts(t[2])).strip() for t in triples]
    if NEW_CHIP in labels:
        return xml, 'already'
    if AFTER not in labels:
        sys.exit(f'FAILED: "{AFTER}" chip not found on slide 8')

    max_id = max(int(c.get('id')) for c in root.iterfind(f'.//{{{P}}}cNvPr'))
    clone = []
    for src in triples[0]:
        el = copy.deepcopy(src)
        max_id += 1
        el.find(f'.//{{{P}}}cNvPr').set('id', str(max_id))
        el.find(f'.//{{{P}}}cNvPr').set('name', f'GearChip{max_id}')
        spTree.append(el)
        clone.append(el)

    # Set the new label, keeping the first run and dropping any others so the
    # cloned formatting is preserved exactly.
    body = clone[2].find(f'.//{{{A}}}p')
    runs = body.findall(f'{{{A}}}r')
    runs[0].find(f'{{{A}}}t').text = NEW_CHIP
    for extra in runs[1:]:
        body.remove(extra)

    i = labels.index(AFTER) + 1
    order = triples[:i] + [clone] + triples[i:]
    for n, (panel, dot, label) in enumerate(order):
        row, col = divmod(n, len(COLS))
        px, dx, lx = COLS[col]
        top = ROW_TOP + row * ROW_PITCH
        _move(panel, px, top)
        _move(dot, dx, top + DOT_DY)
        _move(label, lx, top)

    return etree.tostring(root, xml_declaration=True, encoding='UTF-8',
                          standalone=True), f'{len(order)} chips'


RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
PKG_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'


def slide_parts(parts):
    """Display order -> part name.

    The subset kept the ORIGINAL part names, so display order does not match
    the filenames: display 8 is ppt/slides/slide14.xml. Anything that assumes
    slideN.xml is the Nth slide edits the wrong slide, or none at all.

    (This gap is also what makes python-pptx unsafe here: on save it renumbers
    to slide1..slide15, which collides with the retained slide5, slide6, slide9
    and so on, and both survive into the zip.)
    """
    rels = {r.get('Id'): r.get('Target') for r in
            etree.fromstring(parts['ppt/_rels/presentation.xml.rels'])
            .iterfind(PKG_REL)}
    pres = etree.fromstring(parts['ppt/presentation.xml'])
    return ['ppt/' + rels[s.get(RID)]
            for s in pres.iterfind(f'.//{{{P}}}sldIdLst/{{{P}}}sldId')]


def main():
    with zipfile.ZipFile(DECK) as z:
        members = [(i, z.read(i.filename)) for i in z.infolist()]

    names = [i.filename for i, _ in members]
    assert len(names) == len(set(names)), 'source package already has duplicates'

    parts = {i.filename: d for i, d in members}
    order = slide_parts(parts)
    done = []

    for slide_no, old, new in REPLACEMENTS:
        key = order[slide_no - 1]
        parts[key], state = patch_text(parts[key], old, new)
        if state is None:
            sys.exit(f'FAILED: slide {slide_no} text not found:\n  {old[:70]}...')
        done.append(f'slide {slide_no} ({os.path.basename(key)}): {state}')

    grid = order[7]                                   # display slide 8
    parts[grid], state = patch_grid(parts[grid])
    done.append(f'slide 8 grid ({os.path.basename(grid)}): {state}')

    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(DECK)),
                               suffix='.pptx')
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, 'w') as out:
            for info, _ in members:
                zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                zi.compress_type = info.compress_type
                zi.external_attr = info.external_attr
                out.writestr(zi, parts[info.filename])
        shutil.move(tmp, DECK)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise

    print('Updated ' + DECK)
    for d in done:
        print('  ·', d)


if __name__ == '__main__':
    main()
