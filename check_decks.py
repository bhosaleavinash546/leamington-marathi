#!/usr/bin/env python3
"""
Deck geometry and legibility guard.

LibreOffice cannot render in this build environment — it fails identically on
decks nobody has touched — so nothing here has ever been checked by eye. That
makes a structural check the only honest verification available, and it has to
be strict, because the faults it catches are exactly the ones that survive a
casual read of the builder source.

It found, on decks that had been presented:

  * Executive slide 10 — a 4-column grid of 3.88" cards on a 13.33" slide, so
    column 4 began at 12.39" and ended at 16.27". Two whole feature cards were
    off the screen: "Tooling & NRE Amortisation" and "Learning Curve", the two
    the slide's own speaker note tells the presenter to point at.
  * Executive slide 4 — two chips clipped 0.13" below the bottom edge.
  * Agentic slide 15 — "Expected realizable" 0.27" past the right edge.
  * 6.0–6.1 pt body text in two decks, which no projector makes legible.

    python3 check_decks.py            # report
    python3 check_decks.py --strict   # exit 1 on any fault (CI / pre-send)
"""
import sys
import re
from pptx import Presentation
from pptx.util import Emu

DECKS = [
    'CostVision-Workflow-Explained.pptx',
    'CostVision-Agentic-AI-Management-Presentation.pptx',
    'CostVision-Executive-Presentation.pptx',
    'CostVision-Implementation-Blueprint.pptx',
]

# Nothing a director reads across a meeting room should be smaller than this.
MIN_PT = 7.5
# Shapes may sit this far outside the slide before it counts — bleed strips and
# full-width rules are drawn deliberately flush, so a hairline is not a fault.
TOLERANCE_IN = 0.02

EMOJI = re.compile('[\U0001F000-\U0001FAFF☀-➿]')


def audit(path):
    prs = Presentation(path)
    w_in, h_in = Emu(prs.slide_width).inches, Emu(prs.slide_height).inches
    offslide, small, no_notes, emoji_fonts = [], [], [], set()

    for idx, slide in enumerate(prs.slides, 1):
        if not slide.has_notes_slide or not slide.notes_slide.notes_text_frame.text.strip():
            no_notes.append(idx)
        for sh in slide.shapes:
            try:
                l, t = Emu(sh.left).inches, Emu(sh.top).inches
                w, h = Emu(sh.width).inches, Emu(sh.height).inches
            except (TypeError, AttributeError):
                continue          # placeholders without explicit geometry
            r, b = l + w, t + h
            if (r > w_in + TOLERANCE_IN or b > h_in + TOLERANCE_IN
                    or l < -TOLERANCE_IN or t < -TOLERANCE_IN):
                label = sh.text_frame.text[:40].replace('\n', ' ') if sh.has_text_frame else ''
                over = max(r - w_in, b - h_in, -l, -t)
                offslide.append((idx, round(over, 2), label))
            if not sh.has_text_frame:
                continue
            for para in sh.text_frame.paragraphs:
                for run in para.runs:
                    if not run.text.strip():
                        continue
                    if run.font.size and run.font.size.pt < MIN_PT:
                        small.append((idx, round(run.font.size.pt, 1), run.text[:34]))
                    # An emoji run with no explicit emoji font falls back to
                    # whatever the viewing machine offers — which is how a glyph
                    # becomes an empty box on somebody else's laptop.
                    if EMOJI.search(run.text) and (run.font.name or '') != 'Segoe UI Emoji':
                        emoji_fonts.add((idx, run.font.name or '(inherited)'))

    return {
        'slides': len(prs.slides), 'offslide': offslide, 'small': small,
        'no_notes': no_notes, 'emoji_fonts': sorted(emoji_fonts),
    }


def main():
    strict = '--strict' in sys.argv
    faults = 0
    for path in DECKS:
        r = audit(path)
        n_small = len(r['small'])
        n_off = len(r['offslide'])
        n_emoji = len(r['emoji_fonts'])
        faults += n_off + n_small + len(r['no_notes'])
        status = 'OK' if not (n_off or n_small or r['no_notes']) else 'FAULTS'
        print(f"\n{path}  ({r['slides']} slides)  {status}")
        print(f"   off-slide shapes      : {n_off}")
        for s, over, label in r['offslide'][:6]:
            print(f"        slide {s:3d}  +{over}\"  \"{label}\"")
        print(f"   runs below {MIN_PT} pt      : {n_small}")
        for s, pt, txt in r['small'][:6]:
            print(f"        slide {s:3d}  {pt} pt  \"{txt}\"")
        print(f"   slides without notes  : {r['no_notes'] or 'none'}")
        print(f"   emoji runs w/o Segoe  : {n_emoji}"
              + (f"  e.g. {r['emoji_fonts'][:3]}" if n_emoji else ''))

    print(f"\n{'=' * 62}\nTotal hard faults (off-slide + tiny text + missing notes): {faults}")
    if strict and faults:
        print('FAILED — do not present until these are fixed.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
