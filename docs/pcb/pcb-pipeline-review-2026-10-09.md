# PCB photo → BOM → should-cost: pipeline review

Date: 9 Oct 2026 · Repo: `/home/user/leamington-marathi` (commit `ebdb084`) · Read-only review. No repo file was changed.

**Question asked:** is "PCB image → BOM cost" pure arithmetic, accurate, and free of hallucinations?

**Short answer: not yet.** The model no longer types the price into a line. But it still decides most of the headline through four channels:

1. **Which part number it writes.** Any part number the model writes is looked up in the catalogue and counted as *confirmed*, whether or not OCR (the separate chip-reading step) saw it.
2. **Where its own estimate sits inside a class range.** The ranges are 3× to 15× wide, and the model's description picks which range applies.
3. **Board numbers with weak or no limits.** Board size, micro vias, blind vias, through-hole and hand-soldered joints are taken from the model with little or no checking.
4. **Flags.** The model's automotive and ASIL flags, and its claim that a size was "measured", switch premiums on and switch checks off.

On the radar board at 200k/yr in China, the baseline headline is **£53.31**. Changing only what the model says moves it as follows (measured, F1–F4):

| Change to the model's answer | Headline |
|---|---|
| Every price estimate at its range floor, or at its range ceiling | £57.54 to £90.40 |
| One invented part number (`TDA4VH`) | £144.57 |
| `microVias: 5000` | £417.62 |
| A "measured" 240 × 240 mm board | £95.72 |

The volume arithmetic reproduces by hand to the penny. Its weak points are the inputs:

- Most catalogue volume breaks are extrapolated from a single 1k distributor listing using one assumed slope.
- The class ranges are 1k–28k distributor prices labelled as 100K prices.
- There is a 4 % cliff at exactly 100,000 boards.
- The volume curve disagrees with the headline at other volumes.

Accuracy is still unmeasured. There is one real purchase price: the camera board, estimated at £15.26 against £17.00 actually paid. There is no labelled board for photo reading.

**How this was checked.** The code was read end to end. Throwaway scripts were run against the real code: `runStage4` on the committed radar fixture `e2e/fixtures/pcb-radar-replies.json` (China, ASIL-C, automotive) with one model field changed at a time, `catalogueEntry` over every catalogue part with one letter or digit changed, and an independent hand calculation in Python. The scripts are in this folder: `stage4.mts`, `match1.ts`, `match2.ts`, `misc.mts`, `hints.mts`, `imager.mts`, `famconf.mts`, `cliff.mts`, `autoflag.mts`, `handcalc.py`. `npx vitest run tests/pcb-` passes: 345 tests.

Tags: **Verified** = reproduced with a run, numbers shown. **Likely** = confirmed by reading the code, not run (for example, needs a live distributor key). **Unverified** = a judgement that needs outside data.

---

## 1. Findings

### P1 — the model still sets the number

| id | sev | tag | where | what goes wrong (input → wrong output) | proposed fix | test that proves it |
|---|---|---|---|---|---|---|
| F1 | P1 | Verified | `server/routes/pcb.ts:1667-1696` (all part numbers sent to the catalogue); `server/utils/pcb-bom-grounding.ts:58-120` (match on `line.partNumber`, `lineConf` raised to 0.95, `needsVerification` false for a distributor entry); `server/utils/pcb-ocr-reconcile.ts:145-158` (withdraws only the OCR *flag*, keeps the part number) | **A part number the model invents is priced from the catalogue and counted as confirmed.** Radar U2 (an unread MMIC) given `partNumber: "TDA4VH"`, `ocrExtracted: false` → priced £104.15 as `catalogue`, not flagged to verify. Headline £53.31 → **£144.57**. With `AWR2944` instead: £58.33, also "confirmed". Claiming `ocrExtracted: true` changes nothing: the claim is withdrawn but the price stays. `tests/pcb-accuracy-grounding.test.ts:50` currently asserts this behaviour. | Allow a catalogue price only when the identity has evidence: an OCR marking agrees, a supplied BOM file, a user edit, or a Stage 3b reading that matches a Stage 2 marking. Otherwise keep the part number as "model suggestion — not read" and price the line from its class or function range, flagged to verify. | Radar fixture + `partNumber:'TDA4VH', ocrExtracted:false` on U2 → U2 `priceSource !== 'catalogue'`, `needsVerification === true`, headline equal to baseline. |
| F2 | P1 | Verified | `pcb-bom-grounding.ts:236-280` (`est = unit`, `priced = clamp(unit, lo, ceiling)`); `pcb-class-pricing.ts:29-151` (ranges such as `ic_bga.adas` £60–400, `ic_bga.soc` £18–160, `connector_smt.sealed` £3–18, `ic_qfn.any` £2–15) | **The model's `unitPriceGBP` still chooses the price inside wide ranges, and its free-text description chooses the range.** Radar at 200k, every unconfirmed estimate → 0: £57.54; → 1e6: **£90.40** (baseline £53.31). Class-range lines are £19.16 of the £50.88 BOM. Calling the unread U2 "ADAS radar processor" (`ic_bga`) gives **£94.94 even with the model saying £1** (row floor £60 × 0.88) and **£384.09** with £400. Words like "adas", "processor", "fpga" in the description move the row. | Price a range line at a deterministic point: `classDefaultPrice` or, better, a sourced median per row. Ignore `unitPriceGBP` entirely (keep it only for audit). Choose the row from evidence (package and measured size from the photo, ref-des letter) rather than adjectives. Split the very wide rows (ADAS, SoC, unidentified BGA) or flag them always. | Property test: on the radar fixture, randomise every line's `unitPriceGBP` over 0…1e6 → headline unchanged. |
| F3 | P1 | Verified | `server/utils/pcb-boardspec-stabilise.ts:99-116` (an estimated size is clamped only into `[placements/(30·sides), placements/0.4]`; a model `dimensionsSource:'measured'` skips the clamp); `server/utils/pcb-analysis-schema.ts:28`; prompt `pcb.ts:1411` | **Board size, the main driver of fab cost, is the model's guess.** The allowed band is 75× wide (150× double-sided), and the model can switch even that off by saying "measured". Radar at 200k: model says 220 × 140 "estimated" → **+£10.02**. Model says 240 × 240 "measured" → **+£42.41** (fab £1.53 → £41.23). The file header still says this module "stabilises the headline". | Only the server may mark a size as measured: fab data (`applyFabMeasurement`) or a user edit, stored in a server-owned field. Drop the model's `measured`. For an estimated size, cost the density anchor (placements ÷ a stated density by domain) and give a stated ± band. | Radar + `{widthMm:240,heightMm:240,dimensionsSource:'measured'}` with no fab files → size not kept, a warning is raised, headline within the band of the anchor. |
| F4 | P1 | Verified | `pcb-boardspec-stabilise.ts:133-134` (`microVias`, `blindVias` only rounded and kept ≥ 0); `pcb.ts:303` (`throughHoleJoints` kept when the model's is > 0); `pcb.ts:1735-1741` (`manualJoints`, `ictTimeSec`, `copperOzByLayer`, `weightKg` taken as given); `pcb-country-rates.ts:1163-1206` | **Model numbers with no upper bound go straight into fab and assembly £.** Radar at 200k: `microVias 5000` → **+£364.31**; `blindVias 3000` → **+£127.48**; `manualJoints 3000` → **+£67.76**; `throughHoleJoints 5000` → **+£63.46**; `ictTimeSec 3600` → +£3.24 (capped by the table); `copperOzByLayer` 8 × 6 oz → +£1.81; `boardWeightG 3000` → +£1.16. | Through-hole joints from the BOM's `through_hole` lines × pins by package; manual joints 0 unless the BOM has `manual_solder` lines. Blind and micro vias only from fab data; otherwise 0 plus a "via structure unknown" warning, or bounded by density as through vias are. ICT time from a table by placements. Copper and weight only from a board-data source. | Each of the seven inputs above, set to an absurd value with no fab files → headline within 1 % of baseline and a warning raised. |
| F5 | P1 | Verified | `server/utils/pcb-price-catalogue.ts:58` (every family/MPN key ≥ 4 characters with a digit becomes a prefix), `:90`, `:102-107` (`orderingSuffix`: any 1–6 character tail that starts with a letter and has ≤ 1 digit); `pcb-bom-grounding.ts:105,115` (`catalogueExact` is computed but never makes the line need verification) | **Letter-variant devices are priced as the base part, at catalogue confidence.** `TDA4VEN` and `TDA4VEN-Q1` → `TDA4VE88TGAALZRQ1` (£41.04 at 100k, £39.08 at 200k, *confirmed*). `S32K144W` → `S32K144`. `TCAN1042A` → `TCAN1042HGV`. `SJA1110C` → the `SJA1110` estimate (£9.27) while `SJA1110B` is catalogued at £6.98. `MAX96717K` → `MAX96717`. `L9963A…Z` → `L9963` (£4.06) though `L9963T` is £2.16. **The general cause:** a family key that ends in a *letter* (`TDA4VE`, `SJA1110`… after a digit) accepts any further letter as a "package suffix". Across the whole catalogue, a family plus any one letter resolves 23,252 times out of 24,285 (96 %). In 145 of those cases a catalogued sibling with a different letter differs by > 15 % in price. 750 of 3,890 orderables with their last character changed still resolve. Changing a digit almost never fools it (59 of 9,360), so the digit rule works. | (a) A non-exact (`catalogueExact:false`) hit is always `needsVerification` and labelled "family price". (b) Accept a tail only after a known suffix grammar: package/temperature/reel codes per maker (TI `…DRQ1`, NXP `T/3`, `HN/0Z`, ST `VGT6`…) or an explicit alias list. Reject a letter straight after a letter-ending family stem. (c) Never treat a `family` that equals another entry's MPN stem as a prefix for a different device letter. | `catalogueEntry('TDA4VEN')` is null or flagged; `catalogueEntry('SJA1110C')?.mpn` is not `SJA1110`; a sweep test asserting that every non-exact match carries `needsVerification`. |

### P2 — arithmetic or volume is wrong or inconsistent, or a number is unsourced and large

| id | sev | tag | where | what goes wrong | proposed fix | test |
|---|---|---|---|---|---|---|
| F6 | P2 | Verified | `pcb.ts:1822-1830` (`bomAtQty` rescales every line, catalogue lines included, by the generic `getVolumeMultiplier` ratio); `:52-58` | **The volume curve disagrees with the headline at other volumes.** A run at 100k gives £56.19. The 200k run's curve says £58.21 at 100k; the 300k run's curve says £57.40 at 100k. The cause: a qty-1 catalogue line is scaled by 1/0.88 (+13.6 %), while its own catalogue break ratio is 16.29/15.51 (+5 %). | Store each line's price basis (catalogue MPN, class row, range) and re-price it at `qty × q` with the same functions Stage 4 uses. | For q in {100k, 200k, 300k}: the curve point from the 200k run equals `runStage4` at q, within 1p. |
| F7 | P2 | Verified | `pcb.ts:47-58` (`VOLUME_BOM_MULTIPLIERS`: 1.00 at ≤ 100,000 parts, 0.88 above, flat up to 10M); `pcb-country-rates.ts:1140-1142` (`materialBurdenFor`: 7 % → 5 % at 100,000 boards) | **Cliffs and flat zones.** Headline: 99,999 boards £57.18; 100,000 £56.19; 100,001 £54.76 (−4.2 % for two boards). Of the drop, £1.00 is the burden step and £1.43 the class-range step. From 200k to 300k, class-range lines (£19 of BOM) do not move at all; the only movers are 4 catalogue lines. A 4-off part at 100k boards already sits on the flat ≥ 300k break. | Use a continuous log-linear slope for class rows (the catalogue's own `b`) on parts bought. Make the burden a continuous or sourced curve. State the flat zone on screen. | Headline continuous: +1 board changes it by < 0.1 %. Class lines strictly fall from 200k to 300k. |
| F8 | P2 | Likely | `pcb-class-pricing.ts:11-14` ("indicative GBP unit prices at 100K") versus its own evidence comments at `:34,39,45,55,70,74,81,139` ("@1k", "@3k", "@10k", "@28k"); `pcb.ts:1156` | **Class ranges are 1k–28k distributor prices treated as 100K prices.** `k` = 1.00 at 100k parts and 0.88 above. The catalogue's own data puts 100k at a median 0.72 × the 1k price and 300k at 0.925 × the 100k price. So class lines at 100k–300k are probably 25–35 % high against the catalogue's own volume model. | Restate each row at its evidence break, then apply the part slope to parts bought. | Unit test: class row at 100k parts = row at 1k × 100^−b; radar class lines fall by ~28 %. |
| F9 | P2 | Verified (data) | `server/data/pcb-component-catalogue.json` (`basis`, `volumeModel`) | **Most "distributor" volume breaks are derived, not published.** 474 of 764 distributor entries use the assumed "franchise curve" (10k = 1k × 0.85, b = 0.0706) for every break from 10k to 300k. 331 entries have no volume model at all (FS32R294KCMJD: "1k → 10k ×0.85, 100k ×0.72"). FX is a fixed 0.78. At 300k a part is priced at 0.67 × its 1k listing with no quote behind it, and the screen badges it as a distributor price. | Label 10k+ breaks as "derived from the 1k listing", show the slope, and carry a wider band on them. Research real volume quotes for the top-£ parts (S32R294, TEF8105, MAX20431, TDA4). | Audit test: every entry with `volumeModel.basis` starting "franchise" is badged "derived" in the line note. |
| F10 | P2 | Likely | `pcb.ts:1682-1696` (live provider first; the catalogue only for misses; `orderQty` — boards, not parts — passed as the break quantity); `server/utils/pcb-live-pricing.ts:203-215` (deepest break ≤ qty), `:261-312` (RS: a qty-1 price) | **Live prices replace the catalogue's volume price with a small-quantity break and stay in the headline.** With `RS_API_KEY` set, every matched part takes a single-unit price at 300k/yr and is merely flagged. Octopart/Nexar picks the deepest published break (≤ 10k in practice) with no adjustment to parts bought, and can pick a non-franchised seller. "Fetch Live Prices" therefore *raises* the BOM at programme volume. | At volume, use `min(live break price scaled to parts bought by the part's slope, catalogue)`, or keep the live price as a reference column only. Pass `partsBought`. Filter to authorised sellers. | Mock an RS hit at £1.00 for TJA1044GT (catalogue £0.29 at 300k) → headline uses ≤ the catalogue price, with the live figure as a reference. |
| F11 | P2 | Verified | `pcb.ts:1255-1262` (`icKnownRange`), `IC_PRICE_HINTS` `pcb.ts:1182-1252` (substring regexes over part number + description) | **Named ranges match substrings and mislabel parts on the OCR-confirmed and BOM-file paths.** BOM-file line `ROHM RB751` (Schottky diode) → "Rohm BD automotive PMIC £2–8" → **£3.50**. `IPD50N04S4L-08` (MOSFET; catalogue £0.30) → "AUIPS power switch" £2.63. `SK4BL` → "Samsung LPDDR" £7.25. TLF35585 described "for AURIX MCUs" → AURIX TC3xx £15–60. MAX9286 / MAX96712 / 96724 / 96792 GMSL serdes → "Maxim interface IC £0.30–4.50" (catalogued at £9.9–26.5). In the catalogue, 225 parts hit a named range and 23 of them are priced more than 2× outside it. | Anchor each regex to the part number only (`^`, word boundaries). Drop vendor-name rows (ROHM, MAX[0-9]{4}). Generate named ranges from catalogue min/max per family instead of prose. | Sweep test: every catalogued part that hits a named range has its q100k inside it; `icKnownRange({partNumber:'ROHM RB751'})` is null. |
| F12 | P2 | Verified | `pcb-class-pricing.ts:189-190` (`tableTypeOf` returns the model's `componentType` before the imager check); `pcb-bom-grounding.ts:233-253` (a named range wins over the imager rule); `IC_PRICE_HINTS` Sony/OmniVision rows | **The imager rule depends on the model's component type and wording, and named Sony/OmniVision sensors bypass it.** At 200k: AR0233AT `ic_bga` → £13.20; `ic_qfn` → **£3.52**; `ic_soic` → £3.08. OCR-read IMX390 → **£30.00** (named range £8–35, not the £3–15 imager rule of the 9 Oct decision). "camera chip, 2MP, CSP" (no "image sensor" words) → £15.84, the unidentified-BGA *floor*, which is above the imager *ceiling*. Because the model's estimate (≈ the listing) exceeds the ceiling, every named imager lands at the range top. | Decide "imager" from catalogue category / `IMAGER_RE` / OCR family before `componentType`. Route Sony/OmniVision hint rows to the imager rule. Deterministic point (see F2). | `groundAndSplit` on AR0233AT with ct `ic_qfn` gives the same price as `ic_bga`; IMX390 OCR uses the imager row. |
| F13 | P2 | Verified | `pcb-country-rates.ts:94-102`, `:1215-1217` (`components.priceMultiplier` on the whole BOM) | **An unsourced "component sourcing index" multiplies every component** — distributor catalogue prices and class ranges alike — by 0.88 (CN) up to 1.22 (UK) / 1.20 (JP). Radar at 200k: GB headline £87.11 against CN £53.31. About £18 of that gap is the index on the BOM alone. The comment calls it "Shenzhen sourcing discount / distributor premium" with no source. | Source it or remove it. Components for an EMS programme are bought globally. If anything differs by country it is freight and duty, already modelled. | Radar in gb vs cn: BOM after burden differs only by burden, not by the index. |
| F14 | P2 | Verified | `pcb-boardspec-stabilise.ts:137` writes `technologyType`; `pcb-country-rates.ts:1144-1300` never reads it, nor `reflowSides` | **Laminate technology and double-sided reflow are never costed.** A Rogers/PTFE RF board (`RF_MICRO`; the rf prompt itself says "Rogers 4350B: 8–12×") is priced as FR4. High-Tg appears only inside the automotive laminate premium. A double-sided board pays no second reflow pass, stencil or set-up. | Add a laminate multiplier table (sourced) keyed by `technologyType`, and a second-side assembly term. | `computePCBCountryCost` with `technologyType:'RF_MICRO'` > FR4; `reflowSides:2` > 1. |
| F15 | P2 | Verified | `pcb.ts:1146` (automotive system prompt: "ICs: 3–8× consumer", its own ranges), `:1301-1302` ("Apply 3–8× consumer price for all ICs"); `pcb.ts:608-648` (`enforceAutomotiveGrading` ×3.5 / ×2.5 / ×3 / ×2 on lines the model marked `automotive:false`) | **The automotive prompts push the model's estimate — which still picks the point (F2) — to the top of each range, and the prompt ranges contradict the tool's own tables.** TJA1044 £0.80–2.80 in the prompt vs catalogue £0.39; S32K3xx £12–45 vs hint £6–20; TDA4VM £85–220 vs catalogue £64. Separately, every line marked `automotive:false` is multiplied ×3.5 before clamping. On the radar board that alone is **+£16.89**. | Remove all price guidance from Stage 3 prompts (the schema already keeps prices out of the cost). Delete the ×3.5 uplift: the AEC row is already selected by the board domain. | Radar with all lines `automotive:false` → headline equal to baseline. |
| F16 | P2 | Verified | `server/utils/pcb-bom-consolidate.ts:253-271`; `server/utils/pcb-vision-accuracy.ts` (`expandRefDes`) | **Model quantities stand wherever designators cannot be counted.** A single designator with qty 90 (`C47`, 90) stays 90. Two lines with no designators (the same MLCC read from two photos) both stay. Two lines with the same part number are not merged. `C1..C90` and `C1~C90` expand to 0; `C1 - C90` expands to 2. Radar: refDes `R` with qty 700 → +£6.38 (BOM and placements); a duplicated C line with no refs → +£1.74. | Treat a qty without countable designators as unverified: check it against OCR `refDesGroups`, dedupe by (type, value, package) when no designators, merge same-MPN lines, support `..` and `~`. Flag every change. | `consolidateBom` on those five inputs. |

### P3 — labelling, consistency, side panels

| id | sev | tag | where | what goes wrong | fix | test |
|---|---|---|---|---|---|---|
| F17 | P3 | Verified | `pcb-ocr-reconcile.ts:109-131` | A marking attached "by function" ignores package and keeps the model's qty. One MAX20431A marking → U6,U7 qty 2, both priced. "TI 1044AV" (SOIC-8/VSON-8) attached to a "QFN-24" line. It is flagged by `crossCheckWithOcr` but not corrected. | Check the package matches; set qty to the OCR chip count when attached by function. | Radar: U6/U7 qty 1 or a package warning. |
| F18 | P3 | Verified | `pcb-ocr-reconcile.ts:145-158` | `verifyOcrClaims` accepts fragments: "FS32", "R294", "S32R2" all pass against "NXP FS32R294KCMJD…". It rejects true TI top marks: `TCAN1044AVDRQ1` vs "TI 1044AV" is revoked. | Require core ≥ 6 characters, or agreement through a catalogue alias. | The table above. |
| F19 | P3 | Verified | catalogue family keys `DS90UB953-Q1`, `AR0233AT`; `normaliseMPN` keeps `-Q1` | Common short forms miss: `DS90UB953` → null, `AR0233` → null. They fall to class ranges. | Index the family without `-Q1` as an alias. | `catalogueEntry('DS90UB953')`. |
| F20 | P3 | Verified | `pcb.ts:973-993`; `src/ui/pcb/panels.ts:288-322`; `src/ui/main.ts:9450-9458` (PDF) | "Program BOM saving 40 %" (×0.60 at ≥ 200k, ×0.72 at ≥ 50k) is printed on screen and in the PDF, on top of catalogue prices that are already at 200k/300k breaks. It double-counts volume, has no source, and is a rule-of-thumb % printed as money. | Delete it, or source it and start from 1k prices. | n/a |
| F21 | P3 | Unverified | `pcb-country-rates.ts:74 (field), 1229-1233` | Import duty (CN 3.7 %, also charged on the components) is charged as a UK import whatever the destination, with no source for the rate. It is the largest non-BOM line: £1.88 of £53.31 at 200k. | Source the HS-code rate. Make destination an input; no duty when built in the destination country. | n/a |
| F22 | P3 | Verified | `pcb-asil-guard.ts:31` (`SAFETY_HW` includes `\bS32R\d`, `\bS32K3\d`, `\bTC[23]\d{2}`) | The ASIL-C/D guard is satisfied by *any* S32R / S32K3 / AURIX part. So every radar board with an S32R keeps the classifier's ASIL-C and pays burn-in (£0.61 a board in CN), and the claim is never checked further. | Burn-in only from an engineer answer or a safety SBC/PMIC in the BOM, not from the MCU family. | Radar ASIL-C without a safety PMIC → costed ASIL-B. |
| F23 | P3 | Verified | `pcb-boardspec-stabilise.ts:172`; `pcb.ts:1619-1623` | `stableFabMid` uses its own ×1.30 automotive factor, while the headline premium is +86 % on the radar fab. It feeds only the confidence band, which is then re-anchored, but it is a second model of the same thing. | Use `applyAutomotiveGrade` once. | n/a |

---

## 2. Every model number that can move the headline £

Δ is the headline change on the radar fixture, CN, 200k/yr, ASIL-C (baseline £53.31), when only that field is changed.

| Model output | Path to £ | Bounded? By what | Measured Δ |
|---|---|---|---|
| `partNumber` (Stage 3, Stage 3b) | catalogue price, counted confirmed | **No** identity check (F1); prefix matching (F5) | +£91.26 (TDA4VH) |
| `unitPriceGBP` | picks the point inside the class / function / named range | Range limits only; rows up to 15× wide (F2) | −£… to +£37.09 over all lines; +£330 on one "ADAS processor" line |
| `description` words, `componentType`, `pkg` | choose class row, discrete row, named range, imager rule, description caps | Regex tables (F2, F11, F12) | £3.08 → £13.20 for the same imager |
| `automotive` per line | AEC row selection; ×3.5 uplift when `false` | Clamped to the row afterwards (F15) | +£16.89 (all false) |
| `ocrExtracted`, `lineConf` | identity "confirmed" → named range; confidence band | `verifyOcrClaims` (loose, F18); band is display only | small on this board |
| `qty`, `refDes` | BOM line total, SMT placements → assembly, fab size anchor | Only when designators expand (F16) | +£6.38 (R ×700) |
| `widthMm`, `heightMm`, `dimensionsSource` | fab area, panel, freight weight, coating | 75–150× density band; **none** if "measured" (F3) | +£10.02 / +£42.41 |
| `estimatedLayers` | fab layer adder, automotive laminate %, coupon test, energy, weight | Rounded to a standard count 2–16 | −£0.53 (4L) / +£0.73 (14L) here; scales with area |
| `throughVias` | via adder | 0.3–4 × density norm | −£0.35 / +£2.78 |
| `microVias`, `blindVias` | via adders | **None** (F4) | +£364.31 / +£127.48 |
| `hdiStructure`, `impedanceControlRequired`, `surfaceFinish` | +35 % / +18 % / finish multiplier on base + layers | Table multipliers | +£0.15 / −£0.09 / +£0.21 |
| `copperWeightOz`, `copperOzByLayer` | heavy-copper adder | **None** | +£1.81 |
| `boardWeightG` | freight weight | **None** | +£1.16 |
| `conformalCoating` | coating area × rate | Boolean | +£0.14 |
| `aoiRequired`, `ictTimeSec` | AOI / ICT station time | Capped at the country table price | −£0.10 / +£3.24 |
| `throughHoleJoints`, `manualJoints` | per-joint rates | **None** when the model's figure is > 0 (F4) | +£63.46 / +£67.76 |
| `bgaCount` | X-ray on / off | max(model, BOM count) | 0 here |
| `reflowSides` | stabiliser band only (not costed, F14) | — | 0 |
| Stage 1 `domain` + `conf` (≥ 0.7) | automotive rows, premiums, NRE | `looksAutomotiveSilicon`, `AUTOMOTIVE_FROM_BOM` (evidenced codes only) | −£1.72 (general) |
| Stage 1b ASIL | burn-in, coating rate, NRE tier | `guardAsil` (weak, F22) | QM/B −£0.63, D +£0.31 |
| BOM-image transcription (part number, qty) | as a BOM file (`bomSource:'image'`), catalogue priced | qty corrected only when missing; `lineConf −0.1` | — |

Fully deterministic once the inputs are fixed:

- the country tables and catalogue breaks
- `setDeterministicCostEstimates` (the model's own cost guesses are kept under `aiFirstPass` only)
- placements counted from the priced lines
- AOI / X-ray / ICT amortisation
- the automotive premiums
- duty, energy, packaging and yield

---

## 3. Worked example at three annual volumes (radar fixture, China, ASIL-C, automotive)

Each line is priced at **parts bought = qty per board × boards**.

| Line | qty | basis | 100k | 200k | 300k |
|---|---|---|---|---|---|
| U1 S32R294 (OCR) | 1 | catalogue FS32R294KCMJD, breaks 16.2864 / 15.5088 / 15.0713 | 16.2864 | 15.5088 | 15.0713 |
| U2 TEF8105 (attached by function) | 1 | catalogue *estimate* | 10.2000 | 9.7130 | 9.4390 |
| U3 W25Q32JW (OCR "25Q32JWNSM") | 1 | catalogue | 0.5712 | 0.5439 | 0.5286 |
| U6,U7 MAX20431A | 2 | catalogue *estimate*, priced at 2× boards → 200k / 400k / 600k (flat ≥ 300k) | 5.8278 | 5.6634 | 5.6634 |
| U8 "1044AV" → TCAN1044AVDRQ1 | 1 | catalogue | 0.3033 | 0.2888 | 0.2807 |
| U4,U5 LDO | 2 | class `ic_soic.ldo.auto` £0.30–3 × k; AI £1.40 × k | 2.4640 | 2.4640 | 2.4640 |
| U9 QFN unidentified | 1 | class £2–15, median ceiling £4, × k; AI £3.20 | 3.2000 | 2.8160 | 2.8160 |
| U10 SOIC unidentified | 1 | class £0.25–5, ceiling £3.50; AI £1.20 | 1.2000 | 1.0560 | 1.0560 |
| D/Q discretes | 10 | £0.03–0.12 × 0.88 (AI £0.20 → ceiling) | 1.0560 | 1.0560 | 1.0560 |
| C_bulk electrolytic | 2 | `elec_l` with electrolytic cap £0.90 × 0.88 | 1.5840 | 1.5840 | 1.5840 |
| Y1 TCXO | 1 | £1.8–8 × k; AI £2.00 | 2.0000 | 1.7600 | 1.7600 |
| R1-R70 | 70 | AI £0.006 × 0.88 | 0.3696 | 0.3696 | 0.3696 |
| C1-C90 | 90 | AI £0.015 × 0.88 | 1.1880 | 1.1880 | 1.1880 |
| C91-C120 | 30 | AI £0.03 × 0.88 | 0.7920 | 0.7920 | 0.7920 |
| L1-L10 | 10 | AI £0.09 × 0.88 | 0.7920 | 0.7920 | 0.7920 |
| J1 sealed connector | 1 | £3–18 × k; AI £6 | 6.0000 | 5.2800 | 5.2800 |
| J2,J3 pads | 2 | not fitted | 0 | 0 | 0 |
| **BOM (raw)** | | | **53.83** | **50.88** | **50.14** |

Here k = `getVolumeMultiplier(parts bought)`: 1.00 at ≤ 100,000 parts, 0.88 above. That is why qty-1 class lines (U9, U10, Y1, J1) drop 12 % from 100k to 200k and then stay flat.

### The board build-up

China rates. Area 0.4293 dm², 30-up on a 480 × 350 mm panel, utilisation 0.767, so waste ×1.304. 8 layers, immersion silver ×1.10, 220 through vias, impedance +18 %.

**Fab**

- base 0.0649
- layers (6 × 0.07379) 0.2478
- finish 0.0313
- vias 0.4173
- impedance 0.0563
- set-up £12.65 / Q

Total **£0.818** at every volume.

**Assembly**

| Item | Formula | £ at 100k / 200k / 300k |
|---|---|---|
| SMT | 222 / 3600 × £11.6 + £18.97 / Q | 0.7155 / 0.7154 / 0.7154 |
| Through-hole | 4 × 0.009487 | 0.0379 |
| AOI | min(0.3689, 20 s × 2 × £6.64/h + £200 / Q) | 0.0758 / 0.0748 / 0.0744 |
| X-ray | min(1.265, 0.0738 + £300 / Q) | 0.0768 / 0.0753 / 0.0748 |
| ICT | min(2.635, 90 s × 2 × £6.64/h + £5,000 / Q) | 0.382 / 0.357 / 0.349 |
| **Total** | | **1.288 / 1.260 / 1.251** |

**Automotive premiums (ASIL-C)**

- Fab: 0.18 F + 0.40 × 0.50 F + 8 × 0.4227 / 30 + 20 × 0.4227 / 30 = **0.706**
- Assembly: 0.25 A + 0.05 × 0.4159 + 180 × 0.4227 × 4 / 500 = **0.952 / 0.944 / 0.942** (burn-in alone is £0.609)

**Components sourced**

BOM × 0.88 (sourcing index) × 1.05 (burden at ≥ 100k) = **£49.74 / £47.01 / £46.33**.

**Other**

| Item | Formula | £ at 100k / 200k / 300k |
|---|---|---|
| Freight | 0.0962 kg × £0.40 sea | 0.038 |
| Duty | 3.7 % × (fab + assembly + BOM + premiums) | 1.980 / 1.877 / 1.852 |
| Energy | 1.010 kWh × CN tariff | 0.07 |
| Packaging | — | 0.063 |
| Yield | λ = 222 × 800 ppm = 0.178; 0.95 rework + 0.05 scrap of (fab + assembly + BOM) | 0.536 / 0.509 / 0.501 |

**Headline**

| | 100k | 200k | 300k |
|---|---|---|---|
| Hand calculation (`handcalc.py`) | £56.19 | £53.29 | £52.57 |
| Code (`runStage4`) | **£56.19** | **£53.31** | **£52.57** |

The 2p at 200k comes from rounding plus the approximated CN tariff in the hand script. The arithmetic chain itself is sound.

### What does not scale correctly

- **The 100,000-board cliff (F7).** 99,999 boards £57.18 → 100,001 boards £54.76. Burden 7 % → 5 %, and qty-1 class lines go k 1.00 → 0.88.
- **No class-range movement above 100k parts (F7, F8).** From 200k to 300k only the four catalogue lines move: −£0.74 of BOM.
- **Multi-off parts reach the flat ≥ 300k break early.** U6/U7 (qty 2) is already on it at 200k boards; a 10-off part reaches it at 30k boards.
- **Fab does not scale with volume** beyond the £12.65 set-up per order. The only volume terms in assembly are line set-up, AOI/X-ray programme and the ICT fixture (£5,000 / Q).
- **The volume curve disagrees with the headline at other volumes (F6).**
- **Program pricing prints a further −40 % at 200k/300k (F20).** That double-applies volume (side panel and PDF only).
- **No double application of grading or volume on `/reprice`.** `rawBom` is replayed and the trace test checks it.

---

## 4. Board cost — formulas and sources

- **Fab** (`computePCBCountryCost`, `pcb-country-rates.ts:1144-1183`): £/dm² base for 2 layers + per-layer adder, × panel waste (best of 3 panel sizes, utilisation floor 40 %); finish multiplier; via adders per 100 through / per 10 blind / per 10 micro; HDI % and impedance %; set-up ÷ order; heavy copper at 25 CNY/m² per ½ oz per layer. The header cites "IPC Market Research Report 2025, CBRE Global EMS Labour Benchmarks 2025, Prismark Q4-2025, published EMS contracts" and an FX re-base by `scripts/pcb-rate-refresh.ts`. **No individual figure carries its own citation.** `docs/pcb/rate-cross-check-2026-10.md` checks the CN fab and assembly rates against web guides ("in band") and flags the UK assembly flat costs as unverified. Labour, energy and FX are overlaid from `REGIONAL_DATA`, so there is one country source.
- **Assembly**: placements ÷ 3,600 per hour × line £/h (a single throughput figure for every line and part size); joint rates; AOI / X-ray / ICT as station time at 2 × the labour rate + programme or fixture ÷ order, capped at the table's small-batch price; conformal coat £/cm².
- **Automotive**: IATF +18 % fab / +20 % assembly, laminate 40 % × (35 % or 50 %), class 3 inspection, coupon testing per panel, serialisation, IPC class 3 +5 %, burn-in shifts — all engineering figures, scaled by `countryFactor`.
- **Laminate type is not costed (F14).**

---

## 5. Unsourced constants that reach the headline (or a printed figure)

**Volume**
- `VOLUME_BOM_MULTIPLIERS` (`pcb.ts:47`): 8.0 … 1.00, 0.88
- `volumeScaleFrom10k` steps (`pcb-price-catalogue.ts:143`)
- Catalogue "franchise curve" 10k = 1k × 0.85 (b = 0.0706) on 474 entries, plus "100k ×0.72" on entries with no volume model
- Catalogue FX 0.78 USD → GBP

**Components**
- Class ranges in `pcb-class-pricing.ts` (some rows cite @1k–28k evidence; the ADAS £60–400, SoC £18–160, FPGA, OCXO, power module, transformer, relay, mechanical rows cite none)
- `CLASS_MEDIAN` caps (`pcb-price-catalogue.ts:155`)
- `POWER_INDUCTOR_CAP_GBP` 1.80 (cites an internal anchor)
- `HIGH_VALUE_UNMATCHED_GBP` 10
- `classDefaultPrice` lower-quartile point 0.25
- `IC_PRICE_HINTS` ranges (about half carry a dated distributor comment; the rest are prose)
- `enforceAutomotiveGrading` ×3.5 / 2.5 / 3.0 / 2.0
- Component sourcing index 0.88 – 1.22 per country
- `materialBurdenFor` 10 / 7 / 5 % (cites "Venture Outsource, EMSNow" in a comment, no figures)

**Board size and vias**
- `PLACEMENT_DENSITY_PER_CM2` 1.6, `MAX_DENSITY_PER_SIDE_CM2` 30, `MIN_DENSITY_CM2` 0.4
- Via norm 0.9 /cm²/layer with band 0.3–4×

**Assembly and test**
- SMT throughput 3,600 placements/h
- `AOI_SECONDS_PER_BOARD` 20, `AOI_PROGRAM_GBP` 200
- `XRAY_SECONDS_PER_BOARD` 20, `XRAY_SETUP_GBP` 300
- `ICT_FIXTURE_GBP` 5,000
- Station cost = 2 × the labour rate

**Automotive premiums**
- IATF 18 % fab / 20 % assembly
- Laminate 0.40 × 0.35 / 0.50
- Class 3 inspection £8–45 per panel, coupon £5–35 per panel
- IPC class 3 +5 %
- Serialisation £0.05 / £0.80
- Burn-in £180 a shift, 4 / 6 shifts, 500 boards a shift
- Conformal coat £0.12 / £0.20 per cm² (side figure) versus the table's £0.0026 /cm² (headline)

**Logistics and overheads**
- Import duty fractions per country
- Freight weight 0.028 kg/dm²/layer
- Energy 0.9 + 0.15 kWh/dm²/layer, 0.06 + 0.0008 kWh per placement
- Yield split 95 % rework (20 % of assembly + ½ ICT) / 5 % scrap; dppm per country; λ cap 0.30

**Printed side figures**
- Program pricing 0.85 / 0.72 / 0.60 / 0.50
- NRE tiers (two disagreeing models: `computeAutomotiveNRE` and the country table's `NRE_DATA`)
- Missing-passive £0.012 each; ratios 3.2 / 0.8 / 0.4 / 0.3 per IC
- Confidence band 0.80 / 1.15–1.50 / 0.70 / 1.40
- NPI stencil £120–220, FAI £280, prototype +38 %

---

## 6. Tests — what is pinned, what is not

**Pinned (all pass, 345 tests):**
- `tests/pcb-stage4-trace.test.ts`: the radar fixture at 250k. No line carries a model-only `priceSource`; Σ lines = BOM; headline = sum of parts; country row, curve point *at the analysed qty* and NPI figure equal the headline; `/reprice` is idempotent; 222 placements.
- `tests/pcb-headline-trace.test.ts`: the fab, assembly, duty and automotive formulas rebuilt by hand.
- `tests/pcb-review-2026-10.test.ts`: suffix rules for `MT53E…`, `744043…`, `DF40C…`; a sub-£10 unread part number is priced from the table.
- `tests/pcb-imager-volume-rule.test.ts`: the imager rule for `ic_bga` lines.
- `tests/pcb-class-range-review.test.ts`, `tests/pcb-ground-truth.test.ts`, `tests/pcb-adas-catalogue.test.ts` and the catalogue audit.

**Not tested (each finding above names its test):**
- Headline invariance to `unitPriceGBP` (F2). The trace tests only check the *label* `priceSource`, so the model still moving the point inside a range passes.
- A catalogue match on an unevidenced part number (F1). `tests/pcb-accuracy-grounding.test.ts:50` asserts the opposite.
- Non-exact or prefix matches (F5); only digit-suffix rejection is tested.
- Model `dimensionsSource:'measured'` and unbounded micro/blind vias and joints (F3, F4).
- Volume curve against a re-run at another quantity (F6); continuity at 100k (F7).
- Named-range regex collisions (F11); imager with a non-BGA `componentType` or a Sony/OV hint (F12).
- The live-pricing volume basis (F10). Laminate and second-side reflow (F14).
- Accuracy itself:
  - `tests/fixtures/pcb-boards/` has no labelled board, so the golden-board harness scores 0 pairs.
  - `scripts/actuals/pcb-actuals.csv` has one row: the camera board, £15.26 estimate vs £17.00 actual, −10 %.
