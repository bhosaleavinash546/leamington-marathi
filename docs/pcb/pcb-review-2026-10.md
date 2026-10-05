# PCB Image → BOM → Cost: 360° review, October 2026

**Scope:** the whole feature, from the 8 photos a user uploads to the £ on the screen and in the exports:
- `server/routes/pcb.ts` and the 17 helper modules in `server/utils/pcb-*`;
- the component catalogue and the country rates;
- the PCB screen and exports in `src/ui`.

**Method:** three independent code reviews, one each for:
- photo intake and the AI stages;
- part identity and pricing;
- the money path.

Every reported defect was then checked in the code before it was fixed; two reviewer claims were wrong and are noted below. The arithmetic was recomputed by independent calculation on the radar board. The fixes were proven in a real browser, against a stand-in model that returns the real model's 29 September reading of that board.

---

## 1. Verdict for the demo

**The good news:**
- The costing engine was sound. An independent recalculation reproduced the radar board's fab, assembly, logistics and automotive premiums to the penny.
- The 8-photo upload reached every AI stage except the first.

**The problems, and what was done:**

The weaknesses were in what fed the engine and in what the screen claimed. Five of them would have been visible, or embarrassing, in a president demo. All five are fixed:

| | Before | After |
|---|---|---|
| **Golden rule** | A part the AI named with ≥ 60% confidence, not in the catalogue and under £10, **kept the AI's own price and was counted as "confirmed"**. On a typical board that is most of the BOM. | Every line without a catalogue or distributor hit is priced from the tool's own tables. No line priced by the model alone is left in the total. |
| **"LIVE" badge** | Shown on catalogue prices, 381 of 458 of which are engineering estimates, with no network call made. | **LIVE** only when a distributor was called in this run. **CAT** = dated distributor price. **CAT est.** = engineering estimate. |
| **Re-analyze** | Sent the board as "general" with no chip markings, so the **automotive premiums vanished** from the headline. | The server returns the board domain and the markings itself; a re-analysis keeps them. |
| **What-if scenario** | On an automotive board, any change showed a **false saving** of the automotive premium (−£2.70 per board on the radar). The quantity slider stopped at 25,000. | Same inputs and same grade as the headline: an unchanged scenario shows £0.00, and the slider covers the programme volume. |
| **The route the screen uses** | Never ran the second look at unidentified chips (Stage 3b). It had its own copy of the costing stage, which had drifted from the other two routes. | **One shared costing stage (`runStage4`) for all three routes**, and Stage 3b runs on all of them. |

**What can be said truthfully in the demo:**
- "Every price on this BOM comes from a dated catalogue, a distributor, or the tool's own class table. The AI only reads the board."
- "Every line says where its price and its specification came from."
- "Every figure on the page reconciles to the headline."

**What must not be claimed yet:**
- **A measured photo-reading accuracy.** No labelled board (a photo plus its true BOM) has ever been scored (§5).
- **That specifications are fetched from the internet.** They come from the offline catalogue, or from the photo reading. A distributor API key adds live price, stock and a short description, but not datasheet parameters (§6).

---

## 2. How the feature works now

```
8 photos ─► Stage 1  board type (Haiku)          — now sees ALL photos (was: the first only)
         ─► Stage 1b ASIL level (automotive)
         ─► Stage 2  chip markings (OCR)         — every photo; "?" for unreadable characters, never guessed
         ─► Stage 3  BOM (Sonnet / Opus deep)    — part number ONLY if read on the package; else empty + function
         ─► Stage 3b second look at unread ICs   — returns the marking read, never a price
         ─► Stage 4  runStage4 (deterministic, one implementation for every route)
              1  ground truth: BOM file, measured Gerber/drill data
              2  consolidate: one part = one line across 8 photos, whole-number quantities, designators counted
              3  OCR markings into the BOM; the model's "read off the chip" claims checked against OCR
              4  placements counted from the list, then the board sized from them
              5  volume per line (parts bought = qty × boards); automotive grading
              6  engineer's corrections (re-analysis), including lines the model dropped
              7  price: distributor (if a key) → offline catalogue (every part, at parts bought) → named range → class table
              8  missing board facts defaulted and SAID; cost per country; automotive grade; band; curves; panels
```

---

## 3. Findings and fixes

**Severity:** P0 = misleads in a demo; P1 = accuracy; P2 = polish. All rows below are ✅ fixed unless marked otherwise.

### Photos and AI

| # | Sev | Finding | Fix |
|---|---|---|---|
| A1 | P0 | The screen's route had no Stage 3b and its own drifted Stage 4. | One `runStage4` for all routes; Stage 3b on the stream route. |
| A2 | P0 | Re-analyze lost the board domain and markings, so automotive premiums vanished. | Domain, markings and OCR quality returned by the server and sent back on re-analysis. |
| A3 | P0/P1 | Prompts invited invention. Examples: "best-guess part number", "an empty BOM is not acceptable", "a radar board ALWAYS has a transceiver, price it even if hidden". | A part number only if read on the package; otherwise empty, with the function described. Unread parts are priced by class. |
| A4 | P1 | The OCR prompt's example part numbers (TJA1044, AURIX) would force automotive mode if the model echoed them. | Neutral placeholders. |
| A5 | P1 | Stage 1 saw only the first photo. | All photos. |
| A6 | P1 | A part seen in two photos was counted twice: the only guard was a sentence in the prompt. | `consolidateBom`: duplicate and overlapping designators are counted once, with a warning. |
| A7 | P1 | Quantities 1.5, 0 and −2 were accepted; "R1-R10" with qty 12 was priced as 12. | Whole numbers ≥ 1; quantity follows an explicit designator list. |
| A8 | P1 | The model's "OCR extracted ✓" was taken on its word, and Stage 3b set it for any part number it returned. | Kept only when a marking read by the OCR stage agrees; otherwise withdrawn and shown as "?". |
| A9 | P1 | The cache ignored attached fab files; salvaged (truncated) and half-costed results were cached for ever. | The key covers every input; such results are never cached. A truncated BOM is flagged on screen as **partial**. |
| A10 | P1 | Placements: the board was sized from the AI's count, and assembly was costed from the BOM's. | Counted once from the BOM, before sizing; not-fitted pads excluded. |
| A11 | P2 | Photos over the request size limit were dropped with only a server log line. | A warning lists every photo not read. |
| A12 | P2 | Close-ups were sent at 1,600 px unless Deep analysis was on. | Close-ups always at 2,576 px; top and bottom at 1,600. Whether the API downsizes 2,576 px for these models is unverified. |
| A13 | P2 | A failed OCR or classification stage was silent. | Warnings say so; the board is costed as "general" and stated. |
| A14 | P2 | Error messages told users to send fewer photos. | They now point to a BOM file or close-ups. |

### Identity, specifications and prices

| # | Sev | Finding | Fix |
|---|---|---|---|
| B1 | P0 | **The model's price reached the total and was counted as "confirmed"** (see §1). | Every line is priced by catalogue, distributor or table. The model's estimate is kept for audit and can only choose a point inside the table range (the documented design). |
| B2 | P0 | "LIVE" on offline catalogue lines. | LIVE / CAT / CAT est. as in §1, with the matched catalogue part and its date in the tooltip. |
| B3 | P1 | Prefix matching priced the wrong variant at 0.95 confidence. Examples: a 32 Gb LPDDR4 as the 8 Gb entry; a 470 µH inductor as 10 µH; a 100-way connector as 60-way. | A family entry matches only when what follows the family is an ordering suffix (package, grade). A value or density code is refused. Seven wrong-variant cases are pinned in tests. |
| B4 | P1 | Only the first 20 part numbers were looked up, even in the offline catalogue. | All of them offline. Live distributor calls stay capped at 20 per run (rate limits). |
| B5 | P1 | Three volume bases: class ranges stayed at 100K while everything else was scaled, so a 100-board order was clamped back to 100K prices. | Class and named ranges scale by the same factor. |
| B6 | P1 | Price breaks used the board quantity, not the parts bought (40 × 0402 on 1,000 boards is a 40,000-part buy). | Per line: qty × boards, for the catalogue and the volume table. A live distributor is still asked at the board quantity (one quantity per call). |
| B7 | P1 | Line totals rounded to pence before summing: 200 × £0.002 summed to £0.00. | Four decimals on lines; only totals are rounded. Cheap parts are shown to 4 dp. |
| B8 | P1 | RS took the first search hit, at a single-unit price, and treated it as confirmed. | Must match the part number; flagged "to verify" for a volume buy, with the basis stated. |
| B9 | P1 | "Fetch Live Prices" priced at qty 100, marked lines "OCR extracted", and left the BOM total and headline unchanged. | New `/reprice` endpoint: the whole costing stage runs again with your key, so every figure moves together. |
| B10 | P1 | The "to verify" count did not match the flagged rows. | Counted on the final lines. |
| B11 | P1 | Specifications (value, package, maker) were the model's reading, shown as fact. | Catalogue maker, description, package and date are shown under the line when the catalogue priced it, labelled with their source. Everything else is the photo reading. |
| B12 | P2 | Live prices carried no source or date. | Octopart and RS notes state the offer, the break, stock and the fetch date. |
| B13 | P2 | The BOM file parser read "1.5" as 15. | The first number in the cell, rounded. |
| B14 | — | Reviewer said the catalogue's 1k / 10k / 100k breaks are one observed price plus a fixed curve. | **True**, but disclosed in each entry's source text ("franchise curve"). Stated here so nobody claims three observed breaks. |

### The money path

| # | Sev | Finding | Fix |
|---|---|---|---|
| C1 | P0 | What-if scenario: false saving on automotive boards (§1); it also left out copper, weight, coating and the component price breaks. | Same inputs, same grade, BOM at the scenario quantity. |
| C2 | P0 | Two BOM figures on one screen: £66.84 (distributor) vs £58.82 (China) on the radar run. | The tile shows both, labelled "distributor → in China". The CSV and Excel exports print both plus the headline total (Excel had none). |
| C3 | P1 | The volume curve missed duty on the premiums, kept the BOM fixed at every point, and never included the analysed quantity. | Duty added, BOM re-priced per point, analysed quantity included. The curve now passes exactly through the headline. |
| C4 | P1 | The NPI panel's "production" was BOM + fab (£72.93 against a £70.89 headline), and its saving formula overstated (52% for a real 34%). | Production = the headline; saving = 1 − production / NPI. |
| C5 | P1 | A per-board coating cost was added to the one-time NRE, from a second coating model about 80× apart. | One coating model, in the per-board headline only. |
| C6 | P1 | A "PCB Fabrication" band tile held fab + assembly. | Renamed "Fab + assembly". |
| C7 | P1 | Programme pricing: stacked discounts on a BOM that was not the headline's. | Starts from the headline BOM; labelled "not in the headline". |
| C8 | P1 | Country table columns did not add up to the total (£69.79 shown vs £70.89); the on-screen table had no BOM column. | BOM and "Energy/pack/yield" columns on screen, in the CSV, the Excel export and both PDFs; every row adds up. |
| C9 | P1 | Missing size, layers or vias silently defaulted. A measured via count of 0 became 50. A zero BOM fell back to the fab estimate, costing the fab twice. | Every default is a warning; a measured 0 stays 0; no fallback. |
| C10 | P1 | A board larger than every panel had zero panel waste; utilisation below 40% was silently clamped. | Both are warned. |
| C11 | P2 | The PDF printed the page's quantity field, not the costed quantity. | The costed quantity. |
| C12 | P2 | "Priced" + "to verify" could be a penny off the BOM total. | "To verify" is the remainder. |

**Not fixed (stated):**
- Setup is spread over a year's volume as one batch (£0.35 per board at 1,000 per year with monthly batches; negligible at 250k).
- ICT is a flat charge.
- There is no explicit EMS margin line: the line rates are "fully loaded", which is a judgement to say in the demo.

**Reviewer claims that were wrong:**
- `docs/pcb/traced-example-radar.md` and `component-catalogue.md` "do not exist". They do; they are at the repo root, not under `calculator/`.

---

## 4. The radar board, before and after (same model reading, China, 250k, ASIL-C)

Both runs are the browser test `e2e/pcb-live.ts`, against the stand-in model that returns the real 29 September reading.

| | Previous commit | Now | Why |
|---|---|---|---|
| Fab | £1.53 | £1.53 | — |
| Assembly | £6.91 | £6.91 | — |
| BOM (in China) | £46.68 | £46.32 | Class-table lines now get the same above-100k factor (×0.88) as every other price: TVS/transistors £0.120 → £0.1056; bulk electrolytics £0.900 → £0.792 |
| Logistics + duty | £2.08 | £2.07 | duty on the lower BOM |
| Energy / pack / yield | £0.99 | £0.98 | yield loss is a % of the (lower) board value |
| Automotive fab / assembly premium | £0.71 / £1.89 | £0.71 / £1.89 | — |
| **Headline** | **£58.19** | **£57.82** | −£0.37, all from the volume consistency fix |
| Placements | 222 | 222 | not-fitted pads excluded |

The £70.89 of the 29 September live run predates the offline catalogue (added 1 October). Since then, five chip-marked parts are catalogue-priced: S32R294 £16.29, TEF8105 £10.20, W25Q32 £0.57, MAX20431A £3.06, TCAN1044 £0.30.

`tests/pcb-stage4-trace.test.ts` checks, on this board, by independent arithmetic:
- no line is priced by the model alone;
- BOM = Σ lines, and "priced" + "to verify" = BOM;
- China BOM = BOM × the sourcing factor;
- the headline = the sum of its parts;
- the China row = the volume curve at 250k = NPI production = an unchanged scenario = the headline;
- every country row adds up;
- the verification count = the flagged rows; no designator is counted twice;
- a re-price gives the identical headline.

---

## 5. Photo-reading accuracy is not yet measured

The scoring harness exists:
- `server/utils/pcb-vision-accuracy.ts`: component precision and recall, part-number accuracy, price error and total-cost error;
- `tests/pcb-golden-boards.test.ts`.

But `tests/fixtures/pcb-boards/` holds **no labelled board**. Every test above proves the workflow **after** the model. None proves the model reads a board correctly.

**Before the president demo, do one of these:**

1. Pick 3–5 boards whose real BOM you hold: top, bottom and close-ups of every IC. Run each through the tool with a key. Save the output as `<name>.prediction.json` beside `<name>.truth.json` (template in that folder). The golden-board test then reports precision, recall, part-number accuracy and BOM cost error.
2. Or demo with a **BOM file attached**. The tool then takes identity and quantity from the file, and uses the photos for the board build and gaps only.

---

## 6. "Specifications from the internet": what is true

| Source | Gives | When |
|---|---|---|
| Offline catalogue (458 parts, dated) | Maker, description, package, AEC-Q, 1k / 10k / 100k price | Always; no network |
| Octopart / Nexar (distributor API) | Live price at the break, stock, short description, seller SKU | Needs a Nexar token (server env, or typed on screen) |
| RS Components | Single-unit price, stock, title | Needs an RS key; flagged for a volume buy |
| The photo reading | Value, package, voltage, description | Always; labelled as read, not verified |

Datasheet parameters (tolerance, voltage rating, temperature range) are **not fetched** from any source today. The natural next step is a specs query in the Nexar call. It needs a key to build and test against, so it is not in this change.

---

## 7. Files

| | |
|---|---|
| New | `server/utils/pcb-bom-consolidate.ts`, `src/ui/pcb/attach.ts`, `tests/pcb-review-2026-10.test.ts`, `tests/pcb-stage4-trace.test.ts` |
| Changed | `server/routes/pcb.ts`: `runStage4`, `applyStage3b`, `/reprice`, `/scenario`, prompts, cache key, Stage 1 photos |
| Changed | `server/utils/pcb-bom-grounding.ts`, `pcb-price-catalogue.ts`, `pcb-ocr-reconcile.ts`, `pcb-live-pricing.ts`, `pcb-bom-parser.ts`, `pcb-salvage.ts`, `server/data/pcb-country-rates.ts` |
| Changed | `src/ui/main.ts` (BOM table, tiles, exports, scenario, live prices, uploads), `src/ui/pcb/panels.ts`, `src/ui/pcb/types.ts`, `e2e/pcb-live.ts` |

The engine's commodity modules and the rate tables are unchanged.
