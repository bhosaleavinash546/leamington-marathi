#!/usr/bin/env python3
"""
Post-processing for python-pptx output, so PowerPoint will open it.

python-pptx cannot declare the notes master. When you first touch
`slide.notes_slide` it creates `ppt/notesMasters/notesMaster1.xml` and relates
it from the presentation part — but it never writes the matching

    <p:notesMasterIdLst><p:notesMasterId r:id="..."/></p:notesMasterIdLst>

into `ppt/presentation.xml`. `CT_Presentation` (pptx/oxml/presentation.py) maps
only sldMasterIdLst, sldIdLst and sldSz; `p:notesMasterIdLst` appears there just
as an ordering successor, so the library has no way to add it. See
pptx/parts/presentation.py, `notes_master_part` — it calls `relate_to()` and
stops.

The result is a package where every notes slide depends on a master that is
related but never declared. LibreOffice ignores that and renders the deck
perfectly. PowerPoint validates it and refuses to open the file.

This bit us for real: three of the four demo decks would not open, while the one
built with pptxgenjs did. Rendering them to PDF — the check we relied on — could
not see it, because the renderer is exactly the tolerant one.

    from pptx_fixup import finalise
    prs.save(path)
    finalise(path)

Safe to call unconditionally and safe to re-run: it is a no-op on a deck that
already declares its notes master, or that has no notes master at all.
"""
import os
import re
import shutil
import tempfile
import zipfile
import xml.etree.ElementTree as ET

PRESENTATION = 'ppt/presentation.xml'
PRESENTATION_RELS = 'ppt/_rels/presentation.xml.rels'
_PKG_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'

# Required child order for CT_Presentation. notesMasterIdLst goes immediately
# after sldMasterIdLst — putting it anywhere else is its own schema violation.
_AFTER = '</p:sldMasterIdLst>'


def _notes_master_rid(zf):
    """rId of the presentation's notes-master relationship, or None.

    Read from the .rels rather than hardcoded: python-pptx assigns it in
    creation order, so it is rId8 in these decks but that is not a contract.
    """
    try:
        rels = ET.fromstring(zf.read(PRESENTATION_RELS))
    except KeyError:
        return None
    for rel in rels.findall(_PKG_REL):
        if (rel.get('Type') or '').rsplit('/', 1)[-1] == 'notesMaster':
            return rel.get('Id')
    return None


def _patch_presentation_xml(xml, rid):
    """Insert the notesMasterIdLst declaration; drop the stale 4:3 claim."""
    changed = []

    if rid and b'<p:notesMasterIdLst>' not in xml:
        decl = ('<p:notesMasterIdLst><p:notesMasterId r:id="%s"/>'
                '</p:notesMasterIdLst>' % rid).encode('utf-8')
        anchor = _AFTER.encode('utf-8')
        if anchor in xml:
            xml = xml.replace(anchor, anchor + decl, 1)
            changed.append('notesMasterIdLst')

    # python-pptx's default template is 4:3; setting slide_width/height leaves
    # the type attribute behind, so PowerPoint reports a 13.33x7.5in deck as
    # "On-screen Show (4:3)". cx/cy are authoritative and type is optional.
    xml, n = re.subn(rb'(<p:sldSz\b[^>]*?)\s+type="screen4x3"', rb'\1', xml, count=1)
    if n:
        changed.append('sldSz type')

    return xml, changed


def finalise(path):
    """Make a python-pptx file openable in PowerPoint. Returns what it changed."""
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        if not any(n.startswith('ppt/notesSlides/notesSlide') for n in names):
            return []                      # no speaker notes, nothing to declare
        rid = _notes_master_rid(zf)
        original = zf.read(PRESENTATION)
        patched, changed = _patch_presentation_xml(original, rid)
        if not changed:
            return []
        items = [(i, zf.read(i.filename)) for i in zf.infolist()]

    # Rewrite via a temp file in the same directory, then replace, so an
    # interrupted run cannot leave a half-written deck where the deck used to be.
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)),
                               suffix='.pptx')
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, 'w') as out:
            for info, data in items:
                if info.filename == PRESENTATION:
                    data = patched
                # Preserve each entry's own compression rather than forcing one.
                zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                zi.compress_type = info.compress_type
                zi.external_attr = info.external_attr
                out.writestr(zi, data)
        shutil.move(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return changed


def declares_notes_master(path):
    """True if the package is self-consistent about its notes master.

    A deck with notes slides whose presentation.xml does not declare the master
    is the exact shape PowerPoint refuses to open.
    """
    with zipfile.ZipFile(path) as zf:
        has_notes = any(n.startswith('ppt/notesSlides/notesSlide')
                        for n in zf.namelist())
        if not has_notes:
            return True
        return b'<p:notesMasterIdLst>' in zf.read(PRESENTATION)


if __name__ == '__main__':
    import sys
    for p in sys.argv[1:]:
        print(f'{p}: {finalise(p) or "already fine"}')
