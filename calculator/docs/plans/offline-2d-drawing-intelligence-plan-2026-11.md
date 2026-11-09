# Offline 2D drawing intelligence — architecture assessment and plan (9 Nov 2026)

**Status: assessment and design only. No code has been changed.** This is the Stage 1–2 deliverable the brief asks for
before implementation. Everything under "Existing" was read in the code on 9 Nov 2026; nothing is assumed from file names.

**The constraint:** drawings are read on the server with no AI, no model call and no network. The cost stays the existing
engine's arithmetic. Nothing here needs an API key.

## 1. Existing software architecture (verified)

| Part | What it is | Where |
|---|---|---|
| Frontend | Vite + TypeScript single-page app, three.js viewer | `src/ui/` (`main.ts` + modules) |
| Backend | Express + SQLite (`better-sqlite3`), JWT sign-in | `server/` |
| 3D CAD reader | Python + OpenCASCADE (OCP) process, spawned per file; STL in pure TypeScript | `server/utils/cad-geometry-engine.py`, `geometry-bridge.ts`, `services/stl-parser.ts` |
| Rule engine | Turns measured geometry + the engineer's answers into cost inputs, each with a basis and confidence | `src/engine/cost-input-rules/` |
| Cost engine | Commodity modules → `computeUniversalStack` (8 buckets) | `src/engine/modules/`, `core.ts` |
| Tests | vitest (5,160 tests), Playwright end-to-end, real-parts baseline, 13 independent re-calculation models | `tests/`, `e2e/`, `scripts/arith-audit/` |
| Packaging | Docker image with the CAD kernel; Windows folder with embedded Python | `Dockerfile.cad`, `scripts/package-windows.mjs` |

## 2. Existing 3D CAD-to-Cost data flow

1. Upload to `POST /api/cad/analyze` with three file fields: `cadFile`, `drawingPdf`, `blankDxf` (`server/routes/cad.ts:744`).
2. The kernel measures the model → `OCCTGeometry` (volume, faces, holes, walls, silhouettes) plus `cadMetadata` (names
   and any material the STEP file declares).
3. The rule engine runs with a `RuleContext` (`cost-input-rules/types.ts:115`): geometry, country rate book, volume, and
   **`answers`** — the engineer's replies to the engine's questions.
4. What geometry cannot settle becomes a **Decision** (a question, blocking or advisory). The engineer answers on the
   Confirm step; answers show as chips.
5. `toCostParams` → the commodity module → `computeUniversalStack` → result, PDF, Excel.

**Three findings that shape the design:**

- **The drawing upload already exists, but only the AI reads it.** `drawingPdf` is accepted and size-checked, then sent to
  the model on the AI path. On the no-AI path it is ignored (`cad.ts:616`: "there is no model reading a drawing").
- **The engine already asks, by hand, for what a drawing carries.** `derive/service-context.ts` opens with "the three
  facts a drawing carries and a CAD file does not". The questions that exist today:

  | Drawing information | Existing question the engine already costs from |
  |---|---|
  | Material family, grade, resin, elastomer, laminate, aluminium alloy and temper | `material.family`, `material.grade`, resin / elastomer / laminate / alloy / temper questions |
  | General tolerance class | `service.toleranceClass` (casting, forging, gear) |
  | Leak / pressure requirement | `service.pressureTight` |
  | Safety-critical marking | `service.safetyCritical` |
  | Coating, plating, paint | `service.finish` (+ thickness and masks via `coating-drawing-read.ts`) |
  | Heat treatment | casting / aluminium heat-treat questions, gear hardening |
  | Gear data table (quality, helix, hardening) | gear quality / helix / hardening questions |
  | Container capacity, ply count | capacity and laminate questions |

- **Some drawing information has no place in the cost model today**: per-feature tolerances, GD&T, roughness per face,
  explicit thread callouts (tapping is inferred from the drill size), weld symbols, inspection plans, hardness values.

## 3. Proposed four-layer architecture

```
Layer 1  3D CAD intelligence (existing, unchanged)      →  OCCTGeometry
Layer 2  2D drawing intelligence (new, independent)     →  DrawingExtraction
                         both feed ↓
Layer 3  Unified engineering data layer (new)           →  ConsolidatedEngineeringData
                         adapter ↓  (confirmed parameters only)
Layer 4  Existing rule engine + cost engine (unchanged) ←  RuleContext.answers
```

- **Layer 2** imports nothing from the cost engine. It turns a file into parameters with a source location. It never
  produces a £.
- **Layer 3** is pure data logic: names, units, comparison, conflicts, status, overrides. It contains no cost formula.
- **The adapter** is the only bridge. It converts *confirmed* parameters into answers to the existing questions.
- **Layer 4** is not told a drawing exists. It receives answers exactly as if the engineer had clicked them.

## 4. Exact integration points

| # | Point | File | Change |
|---|---|---|---|
| 1 | Drawing arrives | `server/routes/cad.ts` `/analyze` (`drawingPdf` field) | On the no-AI path, hand the file to Layer 2 instead of ignoring it. Add image / DXF types to the accepted list. |
| 2 | CAD data into Layer 3 | new read-only mapper over `OCCTGeometry` + `cadMetadata` | None to the kernel. |
| 3 | Costing boundary | `RuleContext.answers` (the same channel `answersFromContext` uses, `cad.ts:2127`) | The adapter adds confirmed drawing parameters as answers. |
| 4 | Unconfirmed drawing reads | the existing `leaning` on a Decision | Shown as a suggestion with its drawing location — never pre-ticked, never costed until confirmed. |
| 5 | Review screen | the Confirm step (`src/ui/cad-workspace.ts`) | A "From the drawing" panel: value, source, status, accept / correct. |
| 6 | Reports | `cadMeta` → PDF and Excel | A drawing-specification table with sources; anything specified but not costed is listed as such. |
| 7 | Cache | the analyze cache key already includes the drawing bytes (`cad.ts:1078`) | Add the Layer 2 version. |

## 5. New modules and files (proposed)

```
server/drawing/                      Layer 2 — independent
  ingest.ts          file type, pages, vector / scanned / text-as-curves detection
  pdf-vector.ts      exact text + positions + line work from vector PDFs
  raster/            render, deskew, clean-up, OCR (behind one interface)
  layout.ts          border, zones, title block, notes block, tables
  extract/           title-block, material, notes, heat-treat, coating, finish, threads,
                     dimensions, tolerances, gdt, welds  (one module each, testable alone)
  dxf.ts             DXF text and dimension entities (reuses the parser in server/utils/dxf-blank.ts)
  index.ts           → DrawingExtraction
src/engine/engineering-data/         Layer 3 — pure TypeScript, no cost formulas
  model.ts           EngineeringParameter, provenance, status
  dictionary.ts      canonical parameter names and units
  from-cad.ts        OCCTGeometry → parameters
  reconcile.ts       duplicates, conflicts, missing, precedence (configurable per parameter)
  overrides.ts       manual corrections with history
  to-costing.ts      THE adapter: confirmed parameters → answers to existing Decisions
  commodity/         commodity rule packs: which parameters matter, how to read them
server/data/spec-lookup.json         company / standard specification → library grade (data, admin-maintained)
tests/fixtures/drawings/             drawings + hand-checked truth files
```

## 6. Existing files that need modification

Small and additive: `server/routes/cad.ts` (hand the drawing to Layer 2; return the consolidated data),
`src/ui/cad-workspace.ts` + `main.ts` glue (review panel), `src/export/` (drawing table in PDF / Excel),
`Dockerfile.cad` and the Windows package script (offline libraries), `server/db.ts` (store overrides with the project).
**No change** to `core.ts`, the commodity modules, the rule packs or the kernel in the first release.

## 7. Data structures and interfaces

```ts
interface EngineeringParameter {
  name: string;                 // canonical, e.g. 'material.grade', 'hole.diameter', 'finish.coating'
  value: string | number | boolean;
  unit?: string;                // normalised: mm, µm, HRC, …
  rawText?: string;             // exactly what was read
  source: 'cad' | 'drawing' | 'derived' | 'manual';
  sourceFile: string;
  location?: { sheet: number; zone?: string; bbox: [number, number, number, number] };
  method: 'pdf-text' | 'ocr' | 'dxf-entity' | 'kernel' | 'rule' | 'typed';
  kind: 'extracted' | 'interpreted' | 'inferred';
  status: 'extracted' | 'needs-validation' | 'missing' | 'conflict' | 'confirmed' | 'corrected';
  reliability?: number;         // only where measurable (OCR word confidence, exact-text = 1)
  appliesTo?: { featureId?: string; faceIds?: number[] };
  history?: Array<{ by: string; at: string; from: unknown; to: unknown; reason?: string }>;
}
```

- **Default precedence, per parameter and configurable:** geometry (volume, area, envelope) → CAD; tolerances, finish,
  heat treatment, coating, notes → drawing; material grade → drawing over the STEP declaration over a file name. A
  difference between sources is **always shown as a conflict**; precedence only pre-selects the suggestion.
- **Missing is never zero.** A missing parameter leaves the existing question open, exactly as today.
- **Only `confirmed` and `corrected` parameters reach the adapter.**

## 8. Backward compatibility

- No drawing uploaded → Layer 3 holds CAD data only → the adapter adds no answers → the costing is byte-for-byte today's.
- Proof, not a claim: full test suite, the real-parts baseline ("No drift") and the 13 re-calculation models, before and
  after; plus a new test that an uploaded-but-unconfirmed drawing changes no cost.
- Saved projects keep opening: the consolidated data is an optional field.

## 9. Testing strategy

| Brief's test | How it is proven |
|---|---|
| A, H — 3D-only unchanged | real-parts baseline + shadow models + full suite, before v after |
| B — drawing only | extraction route returns parameters and runs no costing |
| C — combined | end-to-end on real parts with a matching drawing; cost re-added independently |
| D — conflict | CAD Ø25 v drawing Ø24 fixture → flagged, nothing chosen silently |
| E — missing | spec removed from a fixture → "missing", question stays open, no invented value |
| F — offline | server run with outbound network blocked and `AIR_GAPPED=1`; a test fails on any socket opened |
| G — commodities | one fixture per commodity rule pack; adding a pack touches no core file |

**Accuracy is measured, not asserted:** every fixture drawing has a hand-checked truth file; each release prints
precision and recall per field (material, heat treatment, coating, tolerance class, threads, dimensions, GD&T), split by
vector PDF and scan.

## 10. Technical risks, honest limits and mitigation

| Capability | Vector PDF (CAD export) | Scanned / image | Mitigation |
|---|---|---|---|
| Title block, notes, material, heat treatment, coating, general tolerance, general roughness | Reliable — the text is exact | Good on clean scans; always "needs validation" | Zone detection + dictionaries + patterns |
| Thread callouts, dimension and tolerance values | Reliable to read | Moderate | Parsed by grammar; ISO fit tables give the limits |
| Linking a dimension to the 3D feature | Diameters, threads, radii: by value match, when unique. Linear dimensions: partial | Same | Ambiguous links go to the engineer |
| GD&T frames | Feasible, but font- and CAD-system-specific | Limited | Needs sample drawings; symbol templates; flagged |
| Roughness and weld *symbols* (graphics, not text) | Feasible with patterns from samples | Low | Manual confirmation |
| View / section recognition, 2D feature recognition | Low value — the 3D model already gives geometry | Low | Only as far as needed to place annotations |
| Text drawn as curves (some CAD exports) | Behaves like a clean scan | — | High-resolution render + OCR |
| Hand-marked or poor scans | — | Not reliable | Stated; manual entry |
| DWG | No good open offline reader | — | Ask for PDF or DXF; a licensed converter is a JLR decision |
| Company specification codes | Read reliably as text | — | Their meaning needs a JLR-supplied lookup table; never guessed |

**Dependencies (all offline; none installed in the product today):**

| Need | Candidate | Licence | Note |
|---|---|---|---|
| Vector PDF text and line work | `pdfjs-dist` (Node) or `pdfplumber` (Python) | Apache-2.0 / MIT | Avoid PyMuPDF: AGPL |
| OCR | Tesseract | Apache-2.0 | See the decision below |
| Image clean-up | OpenCV (headless) | Apache-2.0 | Adds ~50 MB to the image |
| DXF | existing in-house parser, or `ezdxf` | — / MIT | |

**Decision needed on OCR.** Tesseract's standard recogniser (versions 4 and 5) is a small neural network that runs
locally. The brief names Tesseract as acceptable and also rules out local machine-learning models without approval. The
choices: (a) approve Tesseract's standard recogniser — fully offline, best accuracy; (b) use only its older
pattern-matching recogniser — no neural network, visibly lower accuracy on small text. Vector PDFs need no OCR either way.

**What is not costed in the first release.** Per-feature tolerances, GD&T, roughness per face, weld symbols, inspection
plans and hardness are captured, reconciled, shown and printed as "specified on the drawing — not in the cost model".
Each needs a new cost rule with sourced data (for example a tolerance grade → a finishing or grinding operation) and is
proposed one at a time for approval, as the brief requires.

**Confidentiality of the development itself.** This work is being built in a cloud session. Confidential JLR drawings
must not be uploaded to it. Development uses public or made-up drawings drawn in the same layout; the final accuracy run
is done by JLR on JLR's machine with the offline tool, and only the counts come back.

**A third source worth planning for.** If JLR's STEP files are AP242 with embedded PMI (tolerances and notes attached to
the 3D model), the kernel could read them offline as another input to Layer 3. The kernel does not read PMI today.

## 11. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| 1 | This assessment | Agreed |
| 2 | Layer 3: model, dictionary, CAD mapper, reconcile, overrides, adapter | CAD-only costing unchanged to the penny; adapter unit-tested per question |
| 3 | Ingestion: vector PDF text; file-type detection; raster render + OCR | Text and positions extracted on fixtures; offline test passes |
| 4 | Specifications: title block, material, notes, heat treatment, coating, general tolerance and roughness | Measured precision / recall per field |
| 5 | Dimensions, tolerances, threads; selected GD&T | Parsed values match truth files; limits from ISO fit tables |
| 6 | CAD-to-drawing reconciliation | Conflict, missing and duplicate fixtures behave as specified |
| 7 | Review panel on the Confirm step | Accept / correct / reject; statuses; accessible (axe clean) |
| 8 | Costing integration through the adapter; reports | Combined flow end-to-end; cost re-added independently |
| 9 | Commodity rule packs | One fixture per commodity; no core change per pack |
| 10 | Validation, performance, packaging (Docker + Windows) | All eight tests of the brief; accuracy table published |

## 12. Needed before Phase 2 starts

1. **OCR decision** (section 10).
2. **Sample drawings** that are safe to share: 10–20 across commodities, in JLR's sheet layout but with non-confidential
   or dummy content — or agreement to build on public drawings and validate inside JLR.
3. **What JLR drawings are**: mostly CAD-exported PDFs (CATIA / NX) or scans; whether text is selectable in the PDF.
4. **Specification lookup**: who can provide the table of JLR / standard material and finish specifications → grades.
5. **AP242 PMI**: whether JLR's STEP exports carry it.
