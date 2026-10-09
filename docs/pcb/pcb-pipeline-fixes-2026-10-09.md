# PCB photo → BOM → cost: fixes, before and after (9 October 2026)

**Branch:** `claude/pcb-ev-boards`.
**Review:** `docs/pcb/pcb-pipeline-review-2026-10-09.md`, 23 findings F1–F23.
**Approval:** the user approved the fix plan and three behaviour changes on 9 Oct 2026:
- remove the country sourcing index;
- remove "Program BOM saving";
- price laminate type and the second reflow side only from sourced figures.

**Method:**
- Each fix is its own commit, with a test in `calculator/tests/pcb-pipeline-fixes.test.ts`.
- The before/after figures come from the same script on the committed radar fixture:
  `npx tsx scripts/pcb-review-2026-10-09/stage4.mts json`.
- Saved snapshots: `scripts/pcb-review-2026-10-09/baseline-before.json` and `baseline-after.json`.

Tags: **Verified** = reproduced by a run; **Likely**; **Unverified**.

## 1. The question: does what the model says move the price?

Radar fixture, China, 200k boards a year. Each case changes ONE thing the model said.

| Model says … | Before | After | What happens now |
|---|---|---|---|
| (nothing changed: baseline) | £53.31 | **£61.83** | See §2 for why the baseline moved |
| Every price estimate = 0 | £57.54 | £61.83 | Estimates are not used |
| Every price estimate = £1,000,000 | £90.40 | £61.83 | Estimates are not used |
| An unread chip is an "ADAS radar processor" at £400 | £384.09 | £67.17 | Held at the unidentified-BGA median; to verify |
| Invented part number "TDA4VH" on an unread chip | £144.57 | £61.83 | Shown as a suggestion, never priced |
| … and claims it read it off the chip | £144.57 | £61.83 | The claim needs an agreeing OCR marking |
| 5,000 micro vias | £417.62 | £61.83 | Vias need a drill file or the user |
| 3,000 blind vias | £180.79 | £61.83 | Same |
| Copper 6 oz on 8 layers | £55.12 | £61.83 | Copper needs board text, fab data or the user |
| Board weight 3 kg | £54.47 | £61.83 | Weight is computed |
| 3,000 hand-soldered joints | £121.07 | £61.83 | Joints are counted from the BOM |
| 5,000 through-hole joints | £116.77 | £61.83 | Same |
| Every line "not automotive" (the ×3.5 uplift) | £70.20 | £61.83 | No effect on any price |
| Board size claimed "measured" at 240 × 240 mm | £95.72 | £103.88 | Now an estimate. **Still moves the price (see §4)** |
| Board size estimated at 220 × 140 mm | £63.33 | £71.86 | **Still moves the price (see §4)** |
| ICT time 3,600 s | £56.55 | £65.08 | Capped at the country table price |
| "R" × 700 with no designators | £59.69 | £67.93 | Kept; listed to verify |
| A C line repeated with no designators | £55.05 | £63.25 | Kept; listed to verify (not merged, see §4) |

The "after" column of every case should be read against the after baseline, £61.83.

## 2. Why the headline moved, fix by fix (radar, CN, 200k)

| Commit | Fix | Headline |
|---|---|---|
| — | Baseline | £53.31 |
| `3b7dd41` | **F1** A part number is priced from the catalogue only with evidence: an agreeing OCR marking, the user's BOM file or image, or the user's correction. Otherwise it is kept as `suggestedPartNumber` (shown, never priced) | £53.31 |
| `7310cfa` | **F2 / F12** Lines without a catalogue hit take the tool's point in their range (the lower-half midpoint) instead of the model's estimate. An unread IC is bounded by its class median. An imager takes the imager rule whatever the model called it | £57.54 (+8 %: the tool's point sits above where the model put the passives, the inductors and the TCXO) |
| `4a8ae68` | **F3 / F4** Size, copper and weight need evidence. Micro and blind vias need a drill file, or an HDI build (bounded). Joints are counted from the BOM | £57.54 |
| `d5813bd` | **F5 / F19** A device variant is not priced as its sibling. A family price is labelled and listed to verify. "DS90UB953" finds its "-Q1" family | £57.54 |
| `19db0c7` | **F6 / F7 / F8** The tables are read as ~10k reel prices and follow the catalogue's own volume curve on the parts bought, continuously and flat above 300k. The EMS material burden is continuous. The volume curve re-prices catalogue lines along their own price breaks | £55.47 |
| `900fc39` | **F13** The unsourced country component-sourcing index is removed (**approved**) | £62.46 |
| `c1d5b5e` | **F20** "Program BOM saving" is removed (**approved**) | £62.46 |
| `c3ccad0` | **F9 / F10** Derived price breaks are labelled. A live distributor price is no longer used as a volume price | £62.46 |
| `ebc5c2d` | **F11** A named range applies to the part number only, not to the model's prose or a vendor name | £62.46 |
| `97163fe`, `fabec29` | **F16 / F17** Quantities that no designator or marking shows are listed to verify. Ranges written "..", "~" or with a spaced dash are counted. Identical no-designator lines are merged | £62.46 |
| `2e3d222` | **F18** A "read off the chip" claim needs a real part token, not a fragment | £62.46 |
| `e2db890` | **F22** ASIL-C/D needs a safety PMIC / SBC named by part number. The radar BOM has none, so it is costed at ASIL-B (no burn-in) | **£61.83** |

**By volume and country:**

| | 99,999 | 100,000 | 100,001 | 200k | 300k |
|---|---|---|---|---|---|
| China, before | £57.18 | £56.19 | £54.76 | £53.31 | £52.57 |
| China, after | £64.27 | £64.27 | £64.27 | £61.83 | £60.62 |
| UK, before | £92.26 | £90.94 | £89.05 | £87.11 | £86.15 |
| UK, after | £78.60 | £78.60 | £78.60 | £76.25 | £75.10 |

- The 4 % cliff at 100,000 boards is gone.
- The UK–China gap is now £14 (it was £34). It comes from fab, assembly, labour, freight and duty only.

## 3. What "pure arithmetic" now means here (Verified)

- **Every line price comes from one of:**
  - a catalogue entry (with distributor URLs, or labelled as an estimate);
  - a named range for an evidenced part number;
  - a class-table point.
- **The model's numbers never set a price.** This covers its price, its "measured" claims, its via and joint counts, its copper and weight, and its automotive flags. Each is kept for audit only, or is used only with evidence.
- **Every derived figure says so.** That means catalogue breaks above the largest published break, a live price moved to volume, and a family price.

## 4. Still open

- **Estimated board size (Verified, P1).** No photo gives the size, and an estimate inside the density bounds still moves fab cost. On this fixture a 220 × 140 mm estimate adds £10. The fix is the fab files or a typed size; the screen says so. A deterministic size rule (from footprint area) would need a sourced routing factor. None was found, so none was invented.
- **Correction to commit `97163fe`.** Its message says the duplicated C line no longer adds twice. It still does (£63.25 against £61.83): the duplicate has no designators but the original lists C1–C90, so they are not identical and are not merged. It is listed to verify.
- **Not done; each needs research or sourced figures:**
  - **F14:** laminate type (Rogers / PTFE) and the second reflow side are not priced. They are shown as not costed.
  - **F21:** the duty rate and the destination are not sourced.
  - **F23:** a second automotive fab factor still feeds the confidence band only.
  - **F15:** the prompts still carry price guidance. It no longer reaches a price.
- **Class tables at ~10k (Likely).** Reading the class tables at ~10k is a stated assumption: their evidence breaks run from 1k to 28k.
- **Accuracy is unmeasured:**
  - The repo holds one real purchase price, the camera board: £17.00 paid. The camera fixture re-run without its BOM picture gives £18.78; the end-to-end run with the picture is in §5.
  - There are no labelled board photos, so photo-reading accuracy is not measured.

## 5. Checks

- `npx vitest run tests/pcb-`: 377 passed.
- Full suite: see the commit that adds this report.
- Build: passes, and `dist` is rebuilt (`6dced5b`).
