# Offline 2D drawing intelligence (10 Nov 2026)

An engineering drawing attached to a CAD to COST part is now read **on the server, with no AI and no network**, shown to
the engineer for review, and — only for the readings the engineer confirms — used to answer the questions the cost
engine already asks. Plan and architecture assessment: `docs/plans/offline-2d-drawing-intelligence-plan-2026-11.md`.

**What did not change:** the cost engine, every cost formula, the rule packs, the kernel. With no drawing attached,
every response, every cost and every report is what it was (section 8).

**What is not measured:** accuracy on real production drawings. Every figure in section 5 is on drawings we wrote or
on four public NIST sheets. Section 6 is how the customer measures it on their own drawings, inside their network.

## 1. The four layers

```
Layer 1  3D CAD kernel (unchanged)                         → measured geometry
Layer 2  server/drawing/            the offline reader     → DrawingExtraction (parameters + where each was read)
Layer 3  src/engine/engineering-data/                      → one dataset: duplicates merged, conflicts flagged,
                                                             missing listed, the engineer's decisions recorded
adapter  answersFromEngineeringData                        → answers to the engine's EXISTING questions
Layer 4  rule engine + cost engine (unchanged)             ← the same `answers` an engineer gives by clicking
```

- Layer 2 imports nothing from the cost engine except the data contract. It never produces a £.
- Layer 3 holds no cost formula. The adapter is the only bridge.
- Layer 4 is not told a drawing exists.

## 2. What is read

File types: PDF (vector, text-as-curves, scanned), PNG, JPEG, TIFF, ASCII DXF. DWG and binary DXF are refused with a
message naming what to export. Limit 30 MB, 40 sheets.

| Group | Readings | Used in the cost today? |
|---|---|---|
| Identity | part number, name, drawing number, revision, date, scale, sheet, units | No — cross-checked against the CAD file's own names |
| Material | designation as written, standard, company specification code, temper / condition, stock thickness, stated mass | Yes: material family, rate-book grade, resin, compound, laminate system, wrought alloy and temper, aluminium casting temper |
| Tolerances | general tolerance (ISO 2768, ISO 8062 DCTG, DIN 16742 …), tightest toleranced dimension, dimensions, ISO 286 fits, GD&T frames and datums | The general class only (casting, forging, gear routes). The rest: specified, not costed |
| Finish | coating / plating / paint note, coating route, thickness, masked features, general and per-face roughness, edge condition | Coating route (finish question); thickness and masked features (the form's finish block). Roughness: not costed |
| Heat treatment | process words, hardening route, hardness, case depth | Gear hardening route and case depth; aluminium casting temper. Hardness: not costed |
| Threads & holes | thread callouts, hole callouts, counts | No — cross-checked against the hole table measured on the model |
| Quality | leak / pressure test, safety-critical marking, impregnation, NDT, inspection, cleanliness, marking | Leak-tight, safety-critical, impregnation. NDT / inspection / cleanliness: not costed |
| Gear | teeth, module, pressure angle, helix angle and hand, profile shift, face width, quality class | Helix, ISO 1328 class. Teeth / module / face width only where the kernel could not measure them |
| Notes | every numbered note, welding notes | No |

How a value is obtained is always stated: `exact text` (a vector PDF's own text), `OCR nn %` (read off pixels, with the
engine's own confidence), `DXF text`, `interpreted from "…"` (a table turned what is written into the engine's
vocabulary — every table row states its source or says "engineering judgement"), `measured on the 3D model`,
`typed by the engineer`.

## 3. How the review works

### On the server

1. `POST /api/cad/analyze` takes the optional drawing in the field `drawingPdf` (the name is kept; any supported type).
   The reader starts in a worker thread beside the geometry measurement.
2. **Exact text first.** The file is read with OCR off. A CAD-exported PDF is complete after this pass (about a second
   in a fresh worker) and is in the first response.
3. **OCR only where a sheet has no usable text**, queued **one at a time** (`services/drawing-service.ts`; an A0 sheet
   at 300 dpi is a 40-megapixel image and the VM has 2 GB). The costing never waits: the response carries
   `drawing.status: 'reading'` and a `jobId`; the screen polls `GET /api/drawing/jobs/:id` and re-runs the rules when
   the reading is complete. Six scans may wait; a seventh is told to try again (429).
4. One read per file: the extraction is kept under the SHA-256 of the drawing's bytes and the reader's version (a
   week, in SQLite). `/reanalyze`, `compare-routes` and `option-costs` name the drawing by `drawingHash` — they never
   take readings from the request. A drawing the server no longer holds is refused (`409 DRAWING_GONE`); the part is
   never costed silently without it.
5. `services/drawing-context.ts::drawingContextFor` — the one join, called by all four routes:
   `consolidate` (CAD + drawing, for the route's commodity) → `replayReview` (the engineer's decisions, below) →
   `answersFromEngineeringData` (given the engine's open questions built **without** any drawing answer).
6. The answers a costing runs on are `{ …drawing answers, …the engineer's own answers }`. An answer the engineer
   clicked, typed or pinned always wins; a confirmed drawing value that differs is reported (`drawingCosting.overridden`)
   and not used.
7. The response gains three keys — `drawing`, `engineeringData`, `drawingCosting` — **only when a drawing is attached**.

`POST /api/drawing/read` is the drawing on its own: the extraction and its consolidation with no CAD, and no costing.
`GET /api/drawing/:hash/sheet/:n` serves a sheet as a PNG for the panel. Every route needs a session.

### The review is a list of decisions

The page never sends a dataset. It sends `drawingReview: { ops: [...] }` — `confirm`, `correct` (a typed value, reason
optional), `reject`, `resolve` (a conflict: choose a side or type the value), `reopen` — each with who and when. The
server sanitises the list and replays it on **its own** fresh consolidation (`engineering-data/review-state.ts`). A
decision that no longer applies — the route changed, so a reading interpreted for the old route is not in this
dataset — is **skipped and listed** on the panel; it is never matched to another reading.

Rules the layer keeps (`overrides.ts`):

- confirming a reading does not confirm what was interpreted from it — each interpreted value is confirmed itself;
- correcting a reading re-runs its interpretation; rejecting it rejects what was derived from it;
- a conflict ends only when the engineer chooses. The precedence table suggests a side ("suggested"); it is never applied;
- `missing` is a list, never a value: the question stays open exactly as without a drawing.

### On the screen (CAD to COST, AI off or on)

- **Part step:** "Attach drawing" sits with the part and the volume (it used to be inside "More options"), with the line
  *Read on this server — no AI, nothing leaves it*.
- **Confirm step — "From the drawing":** rows grouped as in section 2. Each row: label, value, a source badge (CAD /
  Drawing / Derived / Typed), where it was read (sheet, zone, block, exact text or OCR), a status **word** (Read, Needs
  checking, Missing, Conflict, Confirmed, Corrected, Rejected, Inferred), what it would answer and what that answer does,
  and Confirm / Correct / Reject / Undo. The sheet is shown beside the rows; focusing a row outlines the reading on it.
- **Confirm all read exactly** confirms only readings that are exact text, need no checking, are in no conflict and
  answer a question. Never an OCR reading, never an interpretation that needs checking.
- **Confirming a grade** offers its family with it (one button), because the grade question follows the family question.
- An **unconfirmed** reading appears on the matching question as a note with a link to its row. It never ticks an option.
- A **confirmed** reading is applied when the rules are next run — at **Get cost** (the flow re-runs before anything is
  applied) or **Apply the review**. There is no re-run per click: a sheet has dozens of rows, and on the AI-led mode a
  re-run is a model call. Applied answers show as chips tagged *from drawing*; their button opens the row.
- **Conflicts** are a block at the top with both sides, the suggested one marked, and "Use this value" / "type the value".
- **Specified on the drawing — not in the cost model yet** is a collapsed list. Nothing in it changes the cost.
- The review is saved with the part (a `cad_drawing_review` project, per engineer). Opening the same part and drawing
  again restores it, says so, and offers "Start the review again".

### Finish thickness and masked features

No question exists for either: they are fields of the costing form's surface-treatment block. When confirmed, the
adapter bounds them with the existing `boundDrawingCoating` (ISO 2081 / 19598 / 7599 thickness windows; masks no more
than the holes and bosses measured) and the server writes them on the analysis's `surfaceFinish`
(`applyDrawingFinishFields`). The screen fills its two fields from there; the headless chain reads the same two values
(`BulkRunOptions.finishFields`) — so screen = headless holds with a drawing. A thickness given as a range, or on a
route not priced by deposit (e-coat, powder), is not used and the panel says why.

## 4. Reports

One model, `src/export/drawing-spec-report.ts`, built from the review **as applied to the costing on screen**:

- core PDF, section 3 — "Drawing specification": what was confirmed and used, the conflicts, counts of the rest;
- audit pack, §9c — every reading with source (file, sheet, zone, how read), status and use; conflicts and how each
  was settled; what the route expected and the drawing does not state; the not-costed list; the reader's notes;
- workbook, sheet `10-Drawing` — the same tables;
- the reproducibility stamp gains `drawing reader v1.0.0 · <file> <first 8 of its hash>`.

No drawing: no section, no sheet, the stamp as before.

## 5. Measured accuracy

`npx tsx scripts/drawings/accuracy.ts` — re-run on 10 Nov 2026 on the committed fixtures (`tests/fixtures/drawings/`).
Precision = correct ÷ (correct + wrong); recall = correct ÷ (correct + partial + missed).

```
PUBLIC drawings — vector (1 file)
group               found  correct  partial  wrong  missed  precision  recall
title block             1        1        0      0       0      100 %   100 %
general tolerance       1        1        0      0       0      100 %   100 %
dimensions             14       13        0      1       1       93 %    93 %
GD&T                   25        5       18      2       7       71 %    17 %
notes                   6        6        0      0       0      100 %   100 %
ALL                    47       26       18      3       8       90 %    50 %

PUBLIC drawings — curves (1 file)
group               found  correct  partial  wrong  missed  precision  recall
dimensions              1        0        0      1       9        0 %     0 %
GD&T                    0        0        0      0       9        –       0 %
ALL                     1        0        0      1      18        0 %     0 %

PUBLIC drawings — scan (1 file)
group               found  correct  partial  wrong  missed  precision  recall
dimensions              6        6        0      0      26      100 %    19 %
ALL                     6        6        0      0      26      100 %    19 %

GENERATED drawings — vector (9 files)
group               found  correct  partial  wrong  missed  precision  recall
title block            74       74        0      0       0      100 %   100 %
material               29       29        0      0       0      100 %   100 %
general tolerance      15       15        0      0       0      100 %   100 %
roughness               7        7        0      0       0      100 %   100 %
coating                21       21        0      0       0      100 %   100 %
heat treatment         13       13        0      0       0      100 %   100 %
threads                12       12        0      0       0      100 %   100 %
dimensions             61       61        0      0       0      100 %   100 %
fits                    9        9        0      0       0      100 %   100 %
GD&T                   16       16        0      0       0      100 %   100 %
notes                  57       57        0      0       0      100 %   100 %
quality                16       16        0      0       0      100 %   100 %
welds                   3        3        0      0       0      100 %   100 %
gear                    8        8        0      0       0      100 %   100 %
ALL                   341      341        0      0       0      100 %   100 %

GENERATED drawings — curves (9 files)
group               found  correct  partial  wrong  missed  precision  recall
title block            69       67        0      2       7       97 %    91 %
material               27       26        0      1       3       96 %    90 %
general tolerance      15       15        0      0       0      100 %   100 %
roughness               4        4        0      0       3      100 %    57 %
coating                21       20        0      1       1       95 %    95 %
heat treatment         13       13        0      0       0      100 %   100 %
threads                12        9        0      3       3       75 %    75 %
dimensions             35       22        0     13      39       63 %    36 %
fits                    3        3        0      0       6      100 %    33 %
GD&T                    0        0        0      0      16        –       0 %
notes                  49       45        0      4      12       92 %    79 %
quality                15       15        0      0       1      100 %    94 %
welds                   3        3        0      0       0      100 %   100 %
gear                    8        8        0      0       0      100 %   100 %
ALL                   274      250        0     24      91       91 %    73 %

GENERATED drawings — scan (12 files)
group               found  correct  partial  wrong  missed  precision  recall
title block            88       81        0      7      18       92 %    82 %
material               38       37        0      1       0       97 %   100 %
general tolerance      19       18        0      1       2       95 %    90 %
roughness               5        5        0      0       5      100 %    50 %
coating                26       25        0      1       1       96 %    96 %
heat treatment         19       18        0      1       1       95 %    95 %
threads                15        8        0      7       8       53 %    50 %
dimensions             42       25        0     17      55       60 %    31 %
fits                    4        4        0      0       9      100 %    31 %
GD&T                    0        0        0      0      22        –       0 %
notes                  45       41        0      4      37       91 %    53 %
quality                22       21        0      1       3       95 %    88 %
welds                   3        3        0      0       0      100 %   100 %
gear                   16       15        0      1       1       94 %    94 %
ALL                   342      301        0     41     162       88 %    65 %

REAL-PART drawings — vector (3 files)
group               found  correct  partial  wrong  missed  precision  recall
title block             9        9        0      0       0      100 %   100 %
material                4        4        0      0       0      100 %   100 %
general tolerance       3        3        0      0       0      100 %   100 %
roughness               0        0        0      0       0        –       –  
coating                 6        6        0      0       0      100 %   100 %
heat treatment          0        0        0      0       0        –       –  
threads                 2        2        0      0       0      100 %   100 %
dimensions              2        2        0      0       0      100 %   100 %
notes                   0        0        0      0       0        –       –  
quality                 5        5        0      0       0      100 %   100 %
ALL                    31       31        0      0       0      100 %   100 %
```

`partial` = a reading the reader itself marked as needing validation that matches part of the truth (a GD&T frame
whose symbol is drawn as geometry): neither correct nor wrong, and it counts against recall. The REAL-PART set is the
three sheets drawn for real parts of `cad-audit/parts/` (section 8, test C) — written by us, so circular like the
generated set.

| Set | Class | Files | Precision | Recall |
|---|---|---|---|---|
| Public (NIST) | vector | 1 | 90 % | 50 % |
| Public (NIST) | curves | 1 | 0 % (1 found, wrong) | 0 % |
| Public (NIST) | scan | 1 | 100 % | 19 % |
| Generated | vector | 9 | 100 % | 100 % |
| Generated | curves | 9 | 91 % | 73 % |
| Generated | scan | 12 | 88 % | 65 % |
| Real-part | vector | 3 | 100 % | 100 % |

**How to read these numbers — the honest limits:**

- **The generated and real-part sets are circular for text reading**: we wrote the text. They show that layout, grammar
  and re-assembly work on controlled content. They are not evidence about production drawings.
- **The public set is four NIST sheets**, none of them a production drawing with a title block.
- On a **vector PDF** the text is exact; what goes wrong is structure (which cell a value belongs to, which callout a
  tolerance belongs to).
- On **text drawn as curves and on scans**, title block, material, coating, heat treatment and quality notes read well;
  dimensions, fits and threads read poorly (about a third of dimensions). Every OCR value is `needs validation`.
- **GD&T, roughness and weld symbols are not read from pixels** (recall 0 on curves and scans). On the NIST vector sheet
  the symbols are drawn as geometry: the frames are found, the symbol is unread, and the frame is flagged.
- **Accuracy on real production drawings: unmeasured.**

## 6. The customer's own accuracy run (inside their network)

Nothing leaves the machine: there is no network code in the reader.

```bash
# one drawing, as a person reads it — or the whole extraction as JSON
npx tsx server/drawing/cli.ts <drawing.pdf> [--json] [--ocr auto|off|force] [--lang eng+deu] [--dpi 300] [--text]

# a folder of drawings with truth files → precision and recall per field group, vector / curves / scan apart
npx tsx scripts/drawings/accuracy.ts <folder> [--verbose] [--only <substring>] [--json]
```

For each drawing `X.pdf` (also `X.curves.pdf`, `X.scan200.pdf`, `X.png` …) put `X.truth.json` beside it:

```json
{ "drawing": "X", "origin": "public",
  "complete": ["title block", "material"],
  "sheets": [1],
  "files": { "X.pdf": "vector" },
  "expect": [
    { "name": "material.designation", "value": "EN-GJS-500-7" },
    { "name": "thread", "match": { "designation": "M10x1.5-6H", "count": 4, "depth": 20 } },
    { "name": "note.manufacturing", "contains": "PRESSURE TEST AT 6 bar" },
    { "name": "gdt.frame", "match": { "characteristic": "position", "tolerance": 0.2 }, "partial": { "tolerance": 0.2, "datums": ["A", "B"] } }
  ] }
```

- `name` is a parameter name of the dictionary (`src/engine/engineering-data/dictionary.ts`).
- `value` matches the whole value; `match` the listed fields of a structured value; `contains` a substring.
- `complete` lists the groups whose `expect` rows are the whole truth — an extra reading there counts as **wrong**.
- `sheets` limits the check to those sheets; `files` names each file's class when the file name does not say it.
- `partial` is accepted only from a reading the reader itself marks `needs-validation`; it counts against recall.

The truth must be typed by a person looking at the sheet, before the reader's output is seen. Only the counts need to
come back.

## 7. The company specification table (`spec-lookup.json`)

A drawing often states a material or finish as a company code. The table says what each code means; **a code that is
not in it is never given a meaning** — the reading is shown as needing a lookup and the material questions stay open.

Read from `CV_SPEC_LOOKUP_FILE`, else `<CV_DATA_DIR>/spec-lookup.json` when it exists, else the bundled
`server/data/spec-lookup.json` (which ships **empty**). It is re-read when the file changes; its content is part of
every cache key.

```json
{ "schemaVersion": 1,
  "entries": {
    "EXAMPLE.CODE.0001": {
      "designation": "EN-GJS-500-7",
      "standard": "EN 1563",
      "note": "illustration only",
      "source": "Materials Engineering specification register, rev 12, 2026-11"
    } } }
```

- The code is matched ignoring case, spaces and punctuation.
- `designation` (required) is read exactly as a designation written on the drawing would be.
- `source` (required): who says so and when. **A row without a source is ignored.**
- `standard` and `note` are optional.

## 8. Proof that nothing else moved

| The brief's test | Where it is proven |
|---|---|
| A / H — 3D only unchanged | real-parts baseline "No drift" (40 parts); the existing suite; `drawing-integration-routes.test.ts` §A/H: no drawing key in any response, costs equal to the headless chain |
| B — drawing only | same file §B: `POST /api/drawing/read` returns readings and a consolidation, `costing: null`, and the route imports no costing code |
| C — combined | §C on three real parts with matching drawings (gear, casting bracket, seat bracket): confirmed readings cost exactly what the same answers typed by hand cost; an independent re-add from the trace closes to ½ p |
| D — conflict | §D: the wrong gear drawing (z 40 v 38) — conflict, nothing chosen, cost unchanged before and after it is settled |
| E — missing | §E: the drawing with no material — "missing", the material question identical to the no-drawing question |
| F — offline | `drawing-integration-offline.test.ts`: the server path with every outbound connection blocked, `AIR_GAPPED=1`, no key — 0 attempts (the reader is run in the test's thread so the block covers it) |
| G — commodities | §G: nine pack families, each with a real part — the confirmed values reach that route's own questions |
| Unconfirmed = no drawing; engineer's answer wins; cache; save / reopen; OCR job | the same file |
| The screen | `e2e/drawing-live.ts` (`npm run test:e2e:drawing`): 5 scenarios in a real browser with AI off, axe on the panel |

## 9. Limits

- **GD&T, roughness and weld symbols drawn as geometry are not read** (frames are found and flagged). Symbol fonts
  that map to Unicode are read.
- **OCR does not read symbols** (Ø, ⌖, roughness ticks): a scanned "Ø25 H7" may read as "25 H7" or not at all.
- **DWG is not read** (no open offline reader). Export PDF or DXF.
- **Hand-marked or poor scans** are not reliable; every OCR value needs validation.
- **Linking a dimension to a 3D feature** is done for holes and threads by diameter and count when the match is unique;
  linear dimensions are not linked.
- **The drawing never chooses the process.** The route is measured or answered; the drawing's values are consolidated
  for that route, and a review made on one route is replayed — not transplanted — on another.
- **A scanned drawing's sheet picture and file are kept for a day** (`CV_DRAWING_FILE_DIR`, default the temp folder);
  the readings for a week.
- **Reading time:** exact text about 1 s (most of it starting the worker); OCR 5–7 s a sheet at 300 dpi on this machine.

## 10. Specified on the drawing — not in the cost model yet

Captured, consolidated, shown, printed — and priced by no rule: per-feature dimensions and tolerances, ISO 286 fits,
GD&T frames and datums, general and per-face roughness, thread callouts (tapping is inferred from the drill size on the
model), weld notes and symbols, NDT and inspection requirements, cleanliness, part marking, hardness values, edge
condition, masking instructions as text, and every general note. Each needs a cost rule with sourced data (for example a
tolerance grade → a finishing or grinding operation) and is proposed one at a time.

On a given route a reading can also be "not readable into the question this route asks" (the question stays open) or
"no question on this route takes it" (for example a casting tolerance grade on a machined part). The panel and the
reports print which.

## 11. Settings

| Variable | Default | What it does |
|---|---|---|
| `CV_DRAWING_FILE_DIR` | `<temp>/cv-drawing-files` | where a drawing's bytes and sheet pictures are kept (a day) |
| `CV_DRAWING_OCR_INLINE_MS` | 2500 | how long a costing request waits for an OCR pass before answering "reading" |
| `CV_DRAWING_READ_WAIT_MS` | 20000 | the same for `POST /api/drawing/read` |
| `CV_SPEC_LOOKUP_FILE` | — | the company specification table |
| `CV_TESSDATA_DIR` | — | extra OCR language data (`<lang>.traineddata`); English and German are bundled |

## 12. Packaging

- All reader libraries are runtime dependencies with prebuilt binaries: `pdfjs-dist`, `@napi-rs/canvas` (Windows x64,
  Linux glibc and musl), `tesseract.js-core` (WebAssembly), `@tesseract.js-data/eng` and `/deu`, `utif2`. None runs an
  install script. `npm ci` in `Dockerfile.cad` and in `scripts/package-windows.mjs` installs them
  (`tests/windows-package.test.ts`).
- `tesseract.js` (whose default language source is a CDN) is not a dependency.
- The unused Tesseract builds in `tesseract.js-core` (about 30 MB of the 44 MB) are **not** pruned from the Windows
  folder: a prune cannot be verified without a Windows build, and the saving is small beside the kernel.

## 13. Fixture fonts

The generated fixture PDFs embed DejaVu Sans (Bitstream Vera licence) and a three-glyph symbol font drawn by
`scripts/drawings/make-symbol-font.py` (position, maximum-material modifier, perpendicularity — our own outlines,
CC0). The first set embedded a GNU FreeSerif subset for those three symbols; it was regenerated without it. The reading
did not change: the same counts as before on vector, curves and scans. See `tests/fixtures/drawings/README.md`.
