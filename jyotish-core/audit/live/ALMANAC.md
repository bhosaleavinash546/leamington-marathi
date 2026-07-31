# ALMANAC — the acquired दाते पंचांग and what was transcribed from it

The owner supplied a scanned copy of **दाते पंचांग, शालिवाहन शक १९४०
(विलंबीनामसंवत्सर), इसवी सन 2018-19, विक्रम संवत् 2074-75** — 296 pages,
image-only scan (no text layer), pages stored landscape-rotated. This document
records what the copy contains, how values were transcribed, and every value
used as evidence, so each claim traces to a page.

**What this edition is and is not.** It is the named authority's own
publication, so it settles *conventions* (ayanamsa family, node type, month
naming, table formats) at its epoch, 2018-19. It is **not** the 1947 issue: any
claim about the reference birth's own almanac page (Shaka 1869 adhika Shravana,
1947 printed values) remains open until a 1947 page is sourced.

## Page map (PDF page ↔ book page ≈ PDF + 5)

| PDF | book | content |
|---|---|---|
| 1–2 | cover | शालिवाहन शक १९४०, इ.स. 2018-19 |
| 26 | (२९) | जन्मपत्रिका mail-order form (referenced from every month page) |
| 27–85 (odd) | (३२)–(९०) | monthly spreads, one per paksha: **left** page daily panchang (tithi/nakshatra/yoga/karana with क.मि. end-times, दिनविशेष, सूर्योदय — मुंबई convention per the TOC footnote), **right** page सोलापुरचे दैनिक लग्न समाप्ति समय + the daily ग्रहस्पष्ट table |
| 33–36 | (३८)–(४१) | अधिक ज्येष्ठ, मे–जून 2018 |
| 43–44 | (४८)–(४९) | आषाढ कृष्णपक्ष, जुलै–ऑग 2018 |
| 45–46 | (५०)–(५१) | श्रावण शुक्लपक्ष, ऑगस्ट 2018 |

Each **left** (daily-panchang) page prints in its top-right corner: हिजरी year,
संवत् year, रात्रिमान, and **अयनांश** in अंश।कला।विकला. On most pages of this
scan the विकला digits run into the gutter; pages (४८) and (५०) are fully
legible.

Each **right** page's lower table is headed **«सकाळी ५।३० चे दैनिक ग्रह
चंद्रक्रांति व ग्रीनिच ० ची सांपातिक वेळ»** — every graha's position at
05:30 IST = 00:00 GMT, one row per civil date, columns रवि (राशि।अंश।कला।विकला),
चंद्र (राशि।अंश।कला।विकला), क्रांति, मंगळ…शनि (राशि।अंश।कला), राहु, हर्षल,
नेपचून, प्लुटो, सांपा.वेळ (Greenwich sidereal time), with the note «राहूमध्ये
६ राशि मिळविल्यावर केतु मिळतो».

## Transcription discipline

- Every value below was read from a ≥300 dpi render of the stated PDF page
  (`pdftoppm -r 300`), cropped and zoomed; nothing was taken from the 150 dpi
  survey renders.
- **Typeface trap:** in this metal typeface **५ prints as a Latin-'4'-like
  glyph** and ४ as an '8'-like glyph. The key was anchored on the चंद्र cell of
  16 मे (०१।०७।५२।५५), which matches the engine to the *second* under the
  ५-as-'4' reading and is gibberish under the alternative; all other cells were
  then read with the same key.
- Where a digit is clipped by the gutter it is written here with `_` and never
  used as evidence.

## Transcribed values

### अयनांश (monthly corner, अंश।कला।विकला)

| page (book) | month | printed | engine Lahiri over that paksha (05:30 IST daily) |
|---|---|---|---|
| PDF 43 (४८) | आषाढ कृष्ण, 28 जुलै–11 ऑग 2018 | **२४।०६।४८** | 24°06′46.6″ → 48.5″; 48.0″ on 9 ऑग |
| PDF 45 (५०) | श्रावण शुक्ल, 12–26 ऑग 2018 | **२४।०६।५०** | 24°06′48.6″ → 50.1″; 50.0″ on 25 ऑग |
| PDF 33 (३८) | अ. ज्येष्ठ शुक्ल, 16–29 मे 2018 | २४।०६।३_ (clipped) | 24°06′34.6″ → 36.6″ — consistent, not evidence |

Both legible values sit inside the engine's range for their own fortnight and
match the engine at the paksha's close to ≤0.5″. The four candidate families
are separated by far more than the print precision at these dates — True Chitra
−1′, KP −5′, Raman −2°26′ — so the printed values discriminate decisively:
**दाते पंचांग's ayanamsa is the Lahiri/Chitrapaksha value with nutation, which
is exactly the engine's pinned `SE_SIDM_LAHIRI` configuration.**

### Daily ग्रहस्पष्ट, PDF 34 (३९), rows 16–17 मे 2018 (= 05:30 IST = 0h GMT)

Engine: `build_ephemeris(EngineOptions(ayanamsa="lahiri"))`, positions at
JD of 2018-05-16/17T00:00Z. Format राशि।अंश।कला(।विकला).

| column | printed 16 मे | engine 16 मे | printed 17 मे | engine 17 मे | delta |
|---|---|---|---|---|---|
| रवि | ०१।००।५९।०० | 01\|00\|58\|58 | ०१।०१।५६।५२ | 01\|01\|56\|49 | 2–3″ |
| चंद्र | ०१।०७।५२।५५ | 01\|07\|52\|55 | ०१।२२।३२।१० | 01\|22\|32\|10 | **0″ both days** |
| मंगळ | ०९।०५।४९ | 09\|05\|49 | ०९।०६।१२ | 09\|06\|12 | 0′ |
| बुध | ००।०९।४८ | 00\|09\|48 | ००।११।२६ | 00\|11\|26 | 0′ |
| गुरु | ०६।२३।२२ | 06\|23\|22 | ०६।२३।१४ | 06\|23\|14 | 0′ |
| शुक्र | ०२।०१।३८ | 02\|01\|38 | ०२।०२।५० | 02\|02\|50 | 0′ |
| शनि | ०८।१४।२५ | 08\|14\|25 | ०८।१४।२३ | 08\|14\|23 | 0′ |
| राहु | ०३।१४।३९ | true 03\|14\|39 · mean 03\|15\|38 | ०३।१४।३० | true 03\|14\|30 · mean 03\|15\|35 | **true: 0′ · mean: ~1°** |
| हर्षल | ००।०५।५५ | 00\|05\|55 | ००।०५।५८ | 00\|05\|58 | 0′ |
| नेपचून | १०।२२।०४ | 10\|22\|04 | १०।२२।०५ | 10\|22\|05 | 0′ |
| प्लुटो | ०८।२६।४७ | 08\|27\|03 (Moshier) | ०८।२६।४६ | 08\|27\|02 (Moshier) | **16′ — see note** |
| सांपा.वेळ | १५।३४।३८ | 15:34:38 | १५।३८।३५ | 15:38:34 | 0–1 s |

Three deliberate observations, none silently absorbed:

1. **राहु is the true node.** Printed राहु matches Swiss `TRUE_NODE` to the
   printed minute on both days and moves −9′/day, which the mean node cannot do
   (constant −3′11″/day). The engine's *default* is the mean node
   (CLAUDE.md §3.3). Registered as **F-027** — a spec-vs-authority conflict for
   the owner, not silently changed.
2. **प्लुटो disagrees by ~16′ — this is our fallback ephemeris, not दाते.**
   The engine runs Swiss Ephemeris in Moshier mode (no data files); Moshier's
   Pluto is an analytic approximation with arcminute-level error. Every body
   Moshier computes rigorously matches the print. Informational only: Pluto is
   not one of the nine grahas and appears nowhere in ChartFacts.
3. **रवि's 2–3″ and सांपा.वेळ's ≤1 s** are at the print's own computational
   precision (a 1950s-lineage drik ganit vs modern Swiss); both are ~50× below
   the arcminute the sheet prints for every other body.

### Month naming at epoch

Page headers name the months **अधिक ज्येष्ठ (मे–जून)**, निज ज्येष्ठ, आषाढ,
श्रावण for 2018. The engine's `lunar_month_at` classifies 2018-05-20 as
`jyeshtha, adhika=True`, 2018-06-20 `jyeshtha, adhika=False`, 2018-07-30
`ashadha`, 2018-08-15 `shravana` — agreement on the adhika placement and
naming *at this epoch*. The 1947 अधिक श्रावण classification for the reference
birth remains its own open check (REFERENCE_BIRTH.md).

## What this unlocks, in order

1. **F-008 — resolved** (see FINDINGS.md): the ayanamsa family is verified
   against the authority's own print, by two independent routes (printed
   अयनांश; daily longitudes).
2. **Golden cases** for 2018-19 dates are now ordinary transcription: the
   monthly left pages carry tithi/nakshatra/yoga/karana end-times to the
   minute, and the year contains an adhika month (§9.1's hardest requirement).
3. **F-007 / O1 (sunrise conventions)** — the left pages print daily सूर्योदय
   (Mumbai convention per the TOC footnote) and राहूकाळ; `tools/settle.py`
   can now be run against real printed values. Not yet done.
4. A 1947 issue remains the only direct check for the reference birth's own
   almanac page.
