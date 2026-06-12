#!/usr/bin/env python3
"""
Add professional PowerPoint animations to CostLens_Management_Presentation.pptx.

Shape-ID mapping verified by inspection:
  Each slide: id=2=bg, id=3=accent_bar  (never animated — always visible)
  All content shapes are animated with entrance effects per slide below.
"""

from pptx import Presentation
from lxml import etree

SRC  = '/home/user/leamington-marathi/CostLens_Management_Presentation.pptx'
DEST = '/home/user/leamington-marathi/CostLens_Management_Presentation.pptx'
NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"


# ── helpers ──────────────────────────────────────────────────────────────────

def fs(ids, base=0, step=0):
    """fade_stagger: [(id, 'fade', delay), ...] with ms stagger."""
    return [(int(sid), 'fade', base + i * step) for i, sid in enumerate(ids)]


def workflow_groups():
    """Slide 4: 5 step boxes each on their own click + bottom strip."""
    groups = []
    for i in range(5):
        base = 6 + i * 8          # card starts at 6, 14, 22, 30, 38
        step_ids = range(base, base + 7)   # 7 shapes per step
        grp = fs(step_ids, 0, 100)
        if i < 4:
            grp.append((base + 7, 'fade', 750))   # arrow after each step except last
        groups.append(grp)
    groups.append(fs([45, 46, 47], 0, 250))        # bottom info strip
    return groups


# ── per-slide animation definition ───────────────────────────────────────────
# Each entry: list of click-groups; each click-group: [(shape_id, effect, delay_ms)]
# effect: 'fade' | 'wipe' | 'appear'

SLIDE_ANIMS = {
    # ── Slide 1: Title  — cascade on one click ───────────────────────────
    0: [
        fs([4, 5, 6], 0, 100)           # deco rect, blue circle, emoji
        + fs([7, 8], 300, 0)            # AUTOMOTIVE tag chip
        + [(9, 'fade', 550)]            # "CostLens" big title (dramatic pause)
        + fs([10, 11, 12], 850, 150)    # subtitle, divider line, date
        + fs([13, 14, 15], 1150, 0)     # KPI chip 1 (all three sub-shapes at once)
        + fs([16, 17, 18], 1400, 0)     # KPI chip 2
        + fs([19, 20, 21], 1650, 0),    # KPI chip 3
    ],

    # ── Slide 2: Problem / Solution  — left then right ───────────────────
    1: [
        # Click 1 → left "BEFORE" panel
        [(7, 'fade', 0)]
        + fs(range(8, 16), 150, 80),    # header + 7 problem bullets staggered
        # Click 2 → right "WITH" panel
        [(16, 'fade', 0)]
        + fs(range(17, 25), 150, 80),   # header + 7 solution lines staggered
    ],

    # ── Slide 3: Feature cards  — row 1 then row 2 ───────────────────────
    2: [
        # Click 1 → top row (cards 1–3)
        fs(range(6,  12), 0,   40)      # card 1 (card-bg, bar, oval, icon, title, desc)
        + fs(range(12, 18), 350, 40)    # card 2
        + fs(range(18, 24), 700, 40),   # card 3
        # Click 2 → bottom row (cards 4–6)
        fs(range(24, 30), 0,   40)      # card 4
        + fs(range(30, 36), 350, 40)    # card 5
        + fs(range(36, 42), 700, 40),   # card 6
    ],

    # ── Slide 4: AI Workflow  — one click per step ───────────────────────
    3: workflow_groups(),

    # ── Slide 5: Benefits  — KPI tiles → top blocks → bottom blocks ──────
    4: [
        # Click 1 → 4 KPI tiles, one tile at a time (300 ms between tiles)
        fs(range(6,  11), 0,   0)
        + fs(range(11, 16), 300, 0)
        + fs(range(16, 21), 600, 0)
        + fs(range(21, 26), 900, 0),
        # Click 2 → top-left and top-right benefit blocks
        fs(range(26, 37), 0,   40)      # block 1 (11 shapes)
        + fs(range(37, 48), 500, 40),   # block 2
        # Click 3 → bottom-left and bottom-right benefit blocks
        fs(range(48, 59), 0,   40)      # block 3
        + fs(range(59, 70), 500, 40),   # block 4
    ],

    # ── Slide 6: Sample Reports  — one click per report column ───────────
    5: [
        # Click 1 → Should-Cost Breakup report
        fs([6, 7, 8, 9], 0, 100)        # card, bar, header, subtitle
        + fs(range(10, 46), 450, 20),   # 36 table row cells
        # Click 2 → Quote Comparison report
        fs([46, 47, 48, 49], 0, 100)
        + fs(range(50, 90), 450, 15),   # 40 table cells (header row + data)
        # Click 3 → AI Analysis report
        fs([90, 91, 92, 93, 94, 95], 0, 100)   # card structure + labels
        + fs(range(96, 112), 650, 40)           # 4 flag entries (4 shapes each)
        + fs([112, 113], 1350, 100),            # recommendations section
    ],

    # ── Slide 7: Tech & Next Steps  — three clicks ───────────────────────
    6: [
        # Click 1 → technology stack panel
        [(5, 'fade', 0), (6, 'fade', 0)]        # card + bar
        + fs(range(7, 25), 150, 80),            # header + 8 tech items × 2 texts
        # Click 2 → roadmap / next-steps panel
        [(25, 'fade', 0), (26, 'fade', 0)]
        + fs(range(27, 40), 150, 80),           # header + 3 phases × 4 texts
        # Click 3 → CTA banner
        fs([40, 41], 0, 200),
    ],
}


# ── XML builder ──────────────────────────────────────────────────────────────

def build_timing(click_groups):
    """Return a <p:timing> lxml element for the given list of click groups."""
    ctr  = [3]   # IDs 1 and 2 are the root cTn and mainSeq
    gctr = [0]   # grpId counter (groups related animations in PowerPoint's model)

    def nid():
        v = ctr[0]; ctr[0] += 1; return v

    def gnid():
        v = gctr[0]; gctr[0] += 1; return v

    def shape_xml(spid, effect, delay_ms, is_first):
        node_type = 'clickEffect' if is_first else 'withEffect'
        grp_id = gnid()
        o, inner, e, s_id, a = nid(), nid(), nid(), nid(), nid()

        if effect == 'wipe':
            pid, pcls, psub, dur, filt = '11', 'entr', '8', 600, 'wipe(left)'
        elif effect == 'appear':
            pid, pcls, psub, dur, filt = '1', 'entr', '0', 1, None
        else:  # fade (default)
            pid, pcls, psub, dur, filt = '10', 'entr', '0', 500, 'fade'

        anim_child = (
            f'<p:animEffect transition="in" filter="{filt}" xmlns:p="{NS_P}">'
            f'<p:cBhvr><p:cTn id="{a}" dur="{dur}"/>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'
            f'</p:cBhvr></p:animEffect>'
        ) if filt else ''

        return (
            f'<p:par xmlns:p="{NS_P}"><p:cTn id="{o}" fill="hold">'
            f'<p:stCondLst><p:cond delay="{delay_ms}"/></p:stCondLst>'
            f'<p:childTnLst><p:par><p:cTn id="{inner}" fill="hold">'
            f'<p:stCondLst><p:cond delay="0"/></p:stCondLst>'
            f'<p:childTnLst><p:par>'
            f'<p:cTn id="{e}" dur="{dur}" presetID="{pid}" presetClass="{pcls}"'
            f' presetSubtype="{psub}" fill="hold" grpId="{grp_id}" nodeType="{node_type}">'
            f'<p:stCondLst><p:cond delay="0"/></p:stCondLst>'
            f'<p:childTnLst>'
            f'<p:set><p:cBhvr>'
            f'<p:cTn id="{s_id}" dur="1" fill="hold"/>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'
            f'<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>'
            f'</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
            f'{anim_child}'
            f'</p:childTnLst></p:cTn>'
            f'</p:par></p:childTnLst></p:cTn>'
            f'</p:par></p:childTnLst></p:cTn></p:par>'
        )

    grp_xmls = []
    for grp in click_groups:
        g = nid()
        shapes = ''.join(
            shape_xml(sid, eff, dly, k == 0)
            for k, (sid, eff, dly) in enumerate(grp)
        )
        grp_xmls.append(
            f'<p:par xmlns:p="{NS_P}"><p:cTn id="{g}" fill="hold">'
            f'<p:stCondLst><p:cond evt="onClick" delay="0"><p:tn/></p:cond></p:stCondLst>'
            f'<p:childTnLst>{shapes}</p:childTnLst>'
            f'</p:cTn></p:par>'
        )

    xml = (
        f'<p:timing xmlns:p="{NS_P}"><p:tnLst><p:par>'
        f'<p:cTn id="1" dur="indefinite" restart="whenNotActive" nodeType="tmRoot">'
        f'<p:childTnLst><p:seq concurrent="1" nextAc="seek">'
        f'<p:cTn id="2" dur="indefinite" nodeType="mainSeq">'
        f'<p:childTnLst>{"".join(grp_xmls)}</p:childTnLst>'
        f'</p:cTn>'
        f'<p:prevCondLst><p:cond evt="onClick" delay="0"><p:tn/></p:cond></p:prevCondLst>'
        f'</p:seq></p:childTnLst></p:cTn>'
        f'</p:par></p:tnLst></p:timing>'
    )
    return etree.fromstring(xml)


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    prs = Presentation(SRC)
    total_shapes = 0

    for slide_idx, groups in SLIDE_ANIMS.items():
        slide = prs.slides[slide_idx]
        # normalise range objects → list of plain ints
        click_groups = [
            [(int(sid), eff, dly) for sid, eff, dly in grp]
            for grp in groups
        ]
        timing = build_timing(click_groups)
        slide.element.append(timing)
        n = sum(len(g) for g in click_groups)
        total_shapes += n
        print(f"  Slide {slide_idx + 1}: {n:3d} shapes animated  "
              f"({len(click_groups)} click group{'s' if len(click_groups) != 1 else ''})")

    prs.save(DEST)
    print(f"\n✅  {total_shapes} animated shapes across 7 slides")
    print(f"   Saved → {DEST}")


if __name__ == '__main__':
    main()
