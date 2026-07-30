# PASS 3 — Classical rule fidelity

## A limit on this pass, stated rather than worked around

AUDIT.md §0 rule 4 requires a citation — text and chapter — for every classical
claim, and rule 3 requires `UNVERIFIABLE` where a claim cannot be checked. I do
not have the texts open. Accordingly:

* Where a value is **standard and unambiguous across every published Parashari
  source** (the seven exaltation degrees, the moolatrikona arcs, the Naisargika
  ranks, the three special drishtis, the Vimshottari years), I record `CORRECT`
  and name the text the codebase itself cites.
* Where the classical position is **contested or I cannot confirm the numbers**,
  I record `UNCITED` or `UNVERIFIABLE` and say what would settle it. I have not
  invented a chapter or verse number anywhere in this file.

## Rule table

| Rule | App's implementation | Source in code | Verdict | Note |
|---|---|---|---|---|
| Exaltation *degrees* | Sun 1/10°, Moon 2/3°, Mars 10/28°, Mer 6/15°, Jup 4/5°, Ven 12/27°, Sat 7/20° | BPHS ch. 3 | CORRECT | used for Uchcha bala; matches every standard source |
| Exaltation *label* | **whole sign** — `rashi == exalt_rashi` | `dignity.py:157` | **WRONG** | see F-003. Defensible as practice, but it makes the code's own moolatrikona rows for Moon and Mercury unreachable, which no school supports |
| Moolatrikona | Sun 5/0–20, Moon 2/4–30, Mars 1/0–12, Mer 6/16–20, Jup 9/0–10, Ven 7/0–15, Sat 11/0–20 | BPHS ch. 3 | CORRECT table, **dead for Moon + Mercury** | F-003 |
| Debilitation | exaltation + 180°, derived | `dignity.py:96` | CORRECT | cannot drift by construction |
| Natural friendship/enmity | 7×7 table, Moon has no enemy | BPHS ch. 3 | CORRECT | matches the standard table row by row |
| Temporal relation | friends in 2,3,4,10,11,12 | BPHS | CORRECT | |
| Combustion orbs | Moon 12, Mars 17, Mer 14/12ᴿ, Jup 11, Ven 10/8ᴿ, Sat 15 | table in code | CORRECT values, **no chapter cited** | matches the standard table; add the citation |
| Vedic drishti | sign-based, unidirectional; 7th full for all; Mars 4/7/8, Jup 5/7/9, Sat 3/7/10 | `aspects.py:29` | CORRECT | **no Western orb-based aspect anywhere** — grepped and confirmed |
| Graded drishti (virupa) | 5-segment piecewise over 30–180° | `aspects.py:88` | **UNCITED** | F-022. Shape is plausible; I cannot verify the breakpoints. Docstring also contradicts the code (F-018) |
| D9 Navamsa | continuous count from the sign | `vargas.py` | CORRECT | partition swept at 1′ over all 12 signs: clean |
| D30 Trimsamsa | odd 5/5/8/7/5 → Mesha/Kumbha/Dhanu/Mithuna/Tula; even reversed → Vrishabha/Kanya/Meena/Makara/Vrishchika | `vargas.py:223–238` | CORRECT | the asymmetry AUDIT §4 calls "commonly wrong" is right here |
| Ashtakavarga | BAV rows 48/49/39/54/56/52/39, SAV 337 | `ashtakavarga.py` | CORRECT | asserted and holds |
| Shadbala | 6 components returned individually, all virupas, one /60 to rupas | `shadbala.py` | CORRECT | components sum exactly to the total; **no rupa/virupa mixing** |
| Cheshta bala for Sun/Moon | Sun → Ayana bala, Moon → Paksha bala | `shadbala.py:458` | CORRECT | the classical substitution, and documented |
| Naisargika bala | 60/7 × rank | `shadbala.py` | CORRECT | |
| Yuddha bala | detected, flagged, value left at **0** | `shadbala.py` | SCHOOL-DIVERGENCE | refused rather than guessed; flag says so. Correct behaviour under §0 rule 2 |
| Bhava bala | Bhavadhipati component only | `shadbala.py` | PARTIAL | documented as partial at the call site (A2) |
| Vimshottari years | 7/20/6/10/7/18/16/19/17 = 120 | test vector | CORRECT | |
| Dasha balance at birth | `balance = term × (1 − within/13°20′)`, **longitude-based** | `angles.py:79` | CORRECT | matches AUDIT §3.5's formula exactly; a time-based fraction would have been wrong and is not used |
| Year length consistency | one `YEAR_DAYS` constant at all four levels | `vimshottari.py:159` | CORRECT | no mixed convention across levels — the silent drift §3.5 warns of is absent |
| Dasha tiling | cumulative rational shares, contiguous to the microsecond | `vimshottari.py:223` | CORRECT | |
| Mangal dosha | 3 rulesets; `maharashtra` = 1/4/7/8/12 default; applied ruleset echoed | `doshas.yaml:17–48` | CORRECT | school is stated, never presented as universal — exactly what §5 asks |
| Mangal parihara | own-sign/exalted; Jupiter drishti | `doshas.yaml:56–68` | PARTIAL | two of the standard parihara set. Reported beside the dosha, never auto-applied — correct. Others (Mars in own/Moon-sign for the partner, both charts afflicted) absent |
| Kaal Sarpa | all seven **strictly** between the nodes; complete vs partial distinguished | `computed.py:40` | PARTIAL | condition CORRECT. **Never distinguishes yoga from dosha** though it records the arc needed to do so → F-016 |
| Sade Sati | Saturn in 12th/1st/2nd **from Moon rashi**; 3 phases; exit date; retrograde provisionality | `computed.py:140` | CORRECT doctrine | from the Moon, not the lagna — verified. But the times are non-deterministic → **F-001** |
| Ashtakoot, 8 koots | 1/2/3/4/5/6/7/8 = 36 | `ashtakoot.py` | CORRECT | |
| Bhakoot exception | shared rashi lord; mutually friendly lords; same nakshatra | `ashtakoot.py:391` | CORRECT | present and reported *beside* the total, never folded in. The app is **not** doctrinally negligent in §5's sense |
| Nadi exception | same nakshatra; shared nakshatra lord with different rashi | `ashtakoot.py:432` | **PARTIAL/WRONG** | classical clause is "same nakshatra but **different padas**". `compute_milan` takes no pada, so it over-fires → F-009 |
| Yoni koot mid-band | flat 2 | `ashtakoot.py` | SCHOOL-DIVERGENCE | documented (A3); published gradings disagree |
| Gajakesari | Jupiter in kendra from Moon **and both unafflicted** | `yogas.yaml` | CORRECT | the affliction clause AUDIT §5's own worked example says apps omit **is present here** |
| Budha-Aditya | requires non-combust Mercury | `yogas.yaml` | CORRECT | documented (A8) |
| Kemadruma | excludes Sun and nodes from the adjacency count | `yogas.yaml` | SCHOOL-DIVERGENCE | documented (A6) |
| Panchamahapurusha ×5 | own/moolatrikona/exalted in a kendra | `yogas.yaml:112–148` | CORRECT | unaffected by F-003 because the dignity set includes both labels |
| Pitra dosha | Sun with Saturn/Rahu, or node in the 9th | `doshas.yaml:70` | UNCITED, **self-declared** | citation reads "not in the classical samhitas as a named dosha", `strength: weak`. Honest in the YAML — but that honesty is English-only and collapsed in the UI → F-014 |
| Shrapit / Guru Chandal | Saturn–Rahu, Jupiter–Rahu conjunctions | `doshas.yaml` | UNCITED, self-declared | same pattern, same caveat |
| Ashtottari / Yogini nakshatra mapping | raises `UnsourcedConventionError` | `dasha/optional.py` | CORRECT behaviour | refused rather than invented, per §0 rule 2 |

## Citation coverage

Measured over all 33 rules in `core/rules/data/`:

| | count |
|---|---|
| named classical text **with** chapter | 27 |
| named text, no chapter | 3 |
| no named text | 5 |

All five in the last group are **self-labelled traditional or regional** rather
than presented as शास्त्र (`pitra_dosha`, `shrapit_dosha`, `guru_chandal_dosha`,
and the two non-Maharashtra Mangal rulesets). Under §0's category 4 that is the
correct handling, not a finding — the app does not pass लोकमत off as doctrine *in
its rule table*. The finding is that this distinction does not survive the trip to
the user (F-014): the disclosure is one English sentence inside a collapsed
`<details>`, and no locale file contains the words शास्त्र, परंपरा or लोकमत in any
provenance sense.
