# Drawing fixtures for the offline 2D drawing reader (`server/drawing/`)

Two sets, reported apart by `scripts/drawings/accuracy.ts`:

## Public drawings (`nist-*`)

| File | Source | What it is |
|---|---|---|
| `nist-ftc-07.pdf` | https://www.nist.gov/document/nist-cad-model-ftc-07 (`nist_ftc_07_asme1_rd.pdf`) | NIST PMI fully-toleranced test case 7, four annotated views, plotted from AutoCAD Mechanical 2016: **selectable text**, feature-control frames on isometric annotation planes, symbol font AIGDT |
| `nist-ctc-01.pdf` | https://www.nist.gov/document/nist-cad-model-ctc-01 (`nist_ctc_01_asme1_rd.pdf`) | NIST PMI combined test case 1: every annotation **drawn as curves** on an isometric view |
| `nist-ctc-02.pdf` | https://www.nist.gov/document/nist-cad-model-ctc-02 (`nist_ctc_02_asme1_rc.pdf`) | Three sheets, notes as text and annotation as curves (a **mixed** sheet). Used for the content-class tests only: no truth file |
| `nist-am-artifact.pdf` | https://www.nist.gov/document/engineeringdrawingpdf (`EngineeringDrawing.pdf`) | NIST additive-manufacturing test artifact: a 2D drawing stored as **raster images** in a PDF |

The first three come from the NIST *MBE PMI Validation and Conformance Testing Project*
(https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-validation),
the fourth from the NIST additive-manufacturing test artifact page. Downloaded 9–10 Nov 2026, unmodified.

**Licence.** Works of the US National Institute of Standards and Technology are not subject to copyright protection in
the United States (17 U.S.C. § 105). NIST's notice: "With the exception of material marked as copyrighted, information
presented on these pages is considered public information and may be distributed or copied. Use of appropriate
byline/photo/image credits is requested." Credit: National Institute of Standards and Technology. Use here does not
imply NIST's recommendation or endorsement.

**Truth files** (`nist-*.truth.json`) were written by hand: each sheet was rendered to an image at 110–300 dpi and every
annotation read off the picture during development (10 Nov 2026, by the developer of the reader looking at the
rendered image) — not produced by the reader, and written before the reader's output was compared with it.
`nist-am-artifact` is checked on sheet 1 only (`"sheets": [1]`); its geometric-tolerance frames carry the placeholder
"xx" instead of a value and are not in the truth.

What these public sheets are NOT: none is a production 2D drawing with a title block. They are annotated model views
(NIST) and one research artifact drawing. They test selectable-text extraction, frames on turned planes, text as
curves and a raster drawing; title blocks, notes blocks and specification text are tested on the generated set.

Tried and not available from this build environment: `smstestbed.nist.gov` (the NIST MTC technical data package —
gateway could not connect); its drawings in `github.com/usnistgov/smstestbed` are 3D PDFs (a poster image over a 3D
annotation), not 2D drawings, and were not used.

## Generated drawings (`gen-*`)

Written by `scripts/drawings/make-fixture-drawings.ts` (re-run it to regenerate; the output is deterministic). One
sheet per commodity family — casting, forging, machined, sheet metal, injection moulding, rubber, gear, aluminium
extrusion, composites — with a frame, zone grid, title block (three layouts; English and German), numbered notes,
revision table, gear data table, dimensioned views and feature-control frames. Sheet-metal is drawn turned 90° on a
portrait page. For each:

- `gen-<name>.pdf` — vector PDF with selectable text
- `gen-<name>.curves.pdf` — the same sheet with every string drawn as glyph outlines (no text layer)
- `gen-<name>.scan200.pdf` — rendered at 200 dpi, turned by a skew of −0.5° … +0.9°, blurred, with paper tone, grain
  and specks, stored as a JPEG in a PDF (`casting` and `gear` also at 300 dpi; `moulding` also as a bare `.jpg`)
- `gen-<name>.truth.json` — what the sheet states, typed by hand in the generator beside the drawing content

**The generated truth is circular for text reading** — we wrote the text — so accuracy on this set says how well the
layout, grammar and re-assembly work on controlled content, not how well real drawings are read.

Fonts embedded as subsets in the generated PDFs: DejaVu Sans (Bitstream Vera Fonts licence — free to embed and
redistribute) for text; GNU FreeSerif for the ISO 1101 symbols DejaVu lacks (GPLv3 with the GNU font-embedding
exception: "if you create a document which uses this font, and embed this font or unaltered portions of this font into
the document, this font does not by itself cause the resulting document to be covered by the GNU General Public
License"). The fonts are read from the system by the generator; neither is part of the product.

## Truth file format

```json
{ "drawing": "gen-casting", "origin": "generated" | "public",
  "complete": ["title block", "material", …],   // groups listed in full: an extra reading there is WRONG
  "sheets": [1],                                  // optional: only these sheets were checked
  "files": { "x.pdf": "vector" | "curves" | "scan" },   // optional, else from the file name
  "expect": [ { "name": "material.designation", "value": "EN-GJS-500-7" },
              { "name": "thread", "match": { "designation": "M10x1.5-6H", "count": 4, "depth": 20 } },
              { "name": "note.manufacturing", "contains": "PRESSURE TEST AT 6 bar" },
              { "name": "gdt.frame", "match": { … }, "partial": { "tolerance": 0.02, "datums": ["A", "B"] } } ] }
```

`partial` is accepted only from a reading the reader itself marks `needs-validation` (a frame whose symbol is drawn as
geometry): it is counted apart — neither correct nor wrong — and still counts against recall.
