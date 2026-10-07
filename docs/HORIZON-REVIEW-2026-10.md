# Horizon — 360° accuracy review, October 2026

Purpose: a demo to the company President. The requirement was zero
hallucinations, so the review covered the data, the engine, the AI layers and
the live workflow, and fixed what it found.

## How it was reviewed

| Stream | Method | Findings |
|---|---|---|
| Register facts | Five reviewers fact-checked all 180 technologies and 15 regulations against the live web, by commodity. Each correction needed a source URL and quote; claims that could not be sourced were softened, never replaced with a guess. | 104 |
| Engine and API | Code review plus runs of the engine over the full register and 11 realistic queries. | 23 |
| Research path | Code review plus offline runs with a stubbed model and a fake fetch, using adversarial pages. | 25 |
| Live workflow | Browser walk-through of a prediction: modelled projection, patents, panel, ledger, BOM and PDF export. | 6 |

Limits:
- Many publisher pages were blocked by the network proxy, so some source
  quotes are search-result text (marked in the review notes).
- One reviewer exhausted its search budget, leaving nine EDU, Powertrain and
  Driveline claims unchecked (listed at the end).

## What was wrong, and what changed

### Data (104 corrections, in two commits)

**Regulations**
- The **US EPA vehicle GHG standards were repealed** (final rule Feb 2026).
  They were shown as "under revision". There is now a `repealed` status that
  never pulls a lane.
- **EU 2035** is now "under revision": the December 2025 proposal to cut the
  target to −90% is in co-decision.
- **Euro NCAP** is a consumer test protocol, not law. It is now `protocol` and
  no longer pulls V2X, night vision or cabin radar into "adopt now".
- Corrected dates:
  - Euro 7 tyre limits apply from July 2028.
  - The battery-passport carbon declaration has no fixed date yet.
  - The ELV recast steps are 15% → 25%.

**Production firsts that were wrong**
- Axial flux has been in series since the Ferrari SF90 (2019). TRL 7 → 9.
- The first camera-mirror car was the Lexus ES (2018).
- The first pillar-to-pillar dash was the Honda e (2020).
- Full-active suspension: the Audi A8 (2018) came before the Panamera and U9.
- The first M3P car was the Luxeed S7 (2023).
- The first mass-produced fuel-cell car was the ix35 Fuel Cell (2013).
- Tesla oil cooling dates from the Model 3 (2017).
- The Dana eS9000r is a 2020 Class 4-5 truck axle.

**False facts removed**
- The Yangwang U8 has no multi-chamber air springs and no built-in oxygen
  system.
- China does not mandate C-V2X.
- The 3rd-gen Qilin is NCM, not LFP: the 3 min 44 s charging figure belongs
  to Shenxing.
- Lucid is not a 25–30k rpm player.
- Tesla is not a disconnect supplier.

**Out of date:** Stegra and HYBRIT dates, NIO swap-station count, Li-Cycle
(now Glencore), Continental → AUMOVIO.

### Engine (`foresight.mjs`)

| Was | Now |
|---|---|
| A regulation pulled a TRL-6, never-produced technology into "adopt/quote now" | The maturity floor holds after a pull |
| 76% of entries wore COMMITTED (any law link or any programme string, at any TRL) | COMMITTED needs TRL ≥ 7 plus binding law or real series production; reviews, pilots and announcements don't count; a stalled launch can't be committed |
| Low-share technologies' cost index fell to 0.15 in 8 years; "flat" fell 21% | Learning base of 3 years of output; per-trend floor (a stated bound, not a fit); flat is flat |
| Fuel cells (in production since 2013, 0% share) projected to "half its ceiling by 2031" | Stalled technologies get no projection; lane "track, don't commit" |
| Single-point adoption forecasts on an uncurated 90% ceiling | q ±25% band on every share; an uncurated ceiling is flagged on the card |
| Forward-looking years in prose ("watch … 2026-27") counted as fresh evidence | Plan words in prose are not evidence |
| Commodity words ("battery", "edu") scored like part names; "steering wheel" led with tyres; "HVAC heat pump" demoted the e-compressor; "brakes" became "brak" | Generic words are weak evidence for part queries; phrase leaks are context; phrase matches set the domain; plural fix; regression tests on demo queries |

### AI layers

- **Analyst briefing.** It was asked for "a price threshold" and nothing
  checked its numbers.
  - The request for a figure is gone.
  - Every number in the briefing and in each signal is checked against the
    cards in code, and offending sentences are removed and counted on screen.
  - Context cards are tagged as "not the queried part".
- **Deep research.**
  - **Quote check:** the old rule needed only 70% of a quote's words in a
    row, so edited quotes passed. It now needs 90%, every number in the
    quote must sit in the matched text, and `1,200` equals `1200`.
  - **Figures:** a claim's figure must appear in its own quote.
  - **Report:** the prose is checked sentence by sentence. Citations to
    claims that don't exist are removed, and so is any sentence whose numbers
    are not in the claims it cites.
  - **False disagreements fixed:** thousands separators, and $/kWh
    previously compared against kWh.
  - **Corroboration:** inferred claims no longer corroborate or contradict,
    and "independently corroborated" is relabelled "carried by N domains".
  - **Redirects:** redirected pages are no longer discarded.
  - **Untrusted data:** page text is fenced as untrusted.
  - **Visibility:** the claims behind every [cN] are shown on screen and in
    the PDF; report failures are explained; the PDF carries the "not
    peer-reviewed" status.
- **Forward research.**
  - **Opt-in:** it was blocking predictions for up to about 100 s and now
    runs only when asked.
  - **Candidates:** quotes, figures, production years and players are shown
    only when found in the evidence text.
- **Promotion to the shared register.**
  - It is now curator-only (`ADMIN_EMAILS`).
  - It no longer invents a cost trend or all four powertrains, and drops
    generic match words.
- **Patents.** The search uses all words rather than any word, and the list
  is labelled as a keyword match with relevance not reviewed.

### UI and PDF

- The projection no longer prints "(2026–2026)".
- The ¼ and ½ milestones are explained at any ceiling below 100%.
- The PDF cover adds up: lane tiles count direct matches only.
- The COMMITTED definition appears on hover and in the PDF legend.
- The light-theme export menu is fixed.
- A React hook-order bug in the adoption sparkline is fixed.

## Demo checklist

1. **Keys on the demo machine** (`.env`): `ANTHROPIC_API_KEY`,
   `BRAVE_API_KEY`, `PATENTSVIEW_API_KEY`. Check that `npm run horizon:deep`
   prints "search: Brave · patents: PatentsView".
2. **Keep promotion clean.** Leave `ADMIN_EMAILS` unset, or set it to the
   curator only, so nobody promotes on stage. Also check
   `SELECT count(*) FROM foresight_promoted` on the demo database.
3. **Scripted queries** (strong curated coverage):
   - "BEV HV battery" (29 exact)
   - "air suspension" (14)
   - "48V MHEV battery" (30)
   - "HVAC heat pump" (5)
   - "wiring harness" (5)
   - "EDU stator assembly" (3 exact plus labelled landscape)
4. **Formerly thin queries are now covered** (7 Oct follow-up): inverter
   (7 exact), lighting (6), steering (4), BIW underbody (4), headlamps (3).
   "Steering wheel" (2) and "tail lamp" (2) are still sparse.
5. **Deep research takes 2–10 minutes.** Run it before the meeting and open
   the cached result.

## Still open (not fixed in this pass)

**Register curation**
- 107 entries have no curated saturation ceiling. They use the default 90%,
  disclosed on the card.
- 118 entries carry curation flags (stale or single-region evidence).
- The nine unchecked EDU/PT/DL claims:
  - hairpin origin;
  - Niron pilot timing;
  - Hyundai "Uni Wheel";
  - in-wheel motor TRL;
  - hollow-halfshaft mass saving;
  - cylinder-deactivation CO2 figure;
  - GaN players;
  - BEV low-range players;
  - Hyundai's NA EREV date.

**Research path (S2/S3)**
- Brave errors still fall back to DuckDuckGo, though the docs now say so.
- The older per-card "deep-dive" path still synthesises from search snippets.
- The patent claims heading for "Claims (N)" is not detected.
- Syndicated copy is not detected; corroboration is labelled "carried by N
  domains" until it is.

**Engine (S3)**
- Ledger snapshots are taken on the static register.
- The stale-evidence tooltip uses the browser clock.

## Follow-up, 7 October 2026 (pending items 1–7)

| # | Item | Done |
|---|---|---|
| 1 | Search failures visible | Brave errors are named and counted in every research report ("k of n searches fell back: Brave 429"). Brave calls are spaced to about 1 per second, with one retry on a 429. |
| 2 | Older snippet paths | The per-card deep-dive and part research keep a finding only if its numbers are in the snippet it cites, and prose only if its numbers are in the evidence. URLs are safety-checked, results are labelled "snippet-level, not page-verified", and the verdict is marked as an AI judgement. |
| 3 | Syndicated copy | Agreeing claims with near-identical quotes (3-gram Jaccard ≥ 0.6) count as one origin (`syndicatedCopies`). |
| 4 | Ledger snapshot | The snapshot uses the merged register and the BOM commodity hint. An immediate revisit shows no drift (integration test). |
| 5 | Small fixes | The stale tooltip age is taken from the register vintage. Patent and catalogue failures now show messages. The Google Patents "Claims (N)" heading is detected. Deep-sweep URLs are http(s) only. The invented "60+" placeholder count is gone. |
| 6 | 9 unchecked claims | 7 corrected and 1 confirmed correct. Ninth claim (in-wheel motors): TRL 6 → 7, with Lordstown and Lightyear stated as limited, failed series use. Other corrections: hairpin origin (Delco Remy; GM two-mode 2008); Niron (pilot 2024, Sartell 2027); Hyundai Mobis e-Corner (not Uni Wheel); halfshaft and cylinder-deactivation figures softened; Magna supplies the G 580 low-range drives (not ZF/BorgWarner); Hyundai's NA EREV is the Santa Fe in H1 2027. |
| 7 | Thin coverage | 12 new sourced entries:<br>• inverter: double-sided cooling, silver-sinter packaging, boost charging, OEM in-house modules;<br>• BIW: hot-stamped mega-blank underbody, low-temp e-coat;<br>• lighting: US ADB, ADS marker lamps, micro-optics;<br>• steering: redundant EPS, capacitive hands-on wheels, high-output EPS.<br>Weakly sourced players were dropped. Adoption shares are conservative estimates (none was published). |

Quotes for the new entries and for the nine checks are mostly search-result
text, because the proxy blocked the pages. Click the `evidenceUrl` links
before the demo.

The self-audit gate moved 118 → 131: +2 from honest corrections, +11 from the
new entries, whose first production is genuinely 2021–22.

Still open:
- adoption ceilings for the uncurated entries (needs engineering sign-off);
- refreshing the worst stale entries;
- a US FMVSS 108 ADB regulatory anchor (it does not exist in REG_ANCHORS yet).

## Follow-up, 7 October 2026 (items 5–7)

- **7. US FMVSS 108 ADB anchor.**
  - New in-force anchor `us-fmvss108-adb`: final rule 87 FR 9916 (22 Feb
    2022), with reconsideration petitions denied in Dec 2024.
  - It is recorded as an ENABLING rule (it permits ADB, it does not mandate
    it).
  - The ADB technology cites it.
- **6. Stale evidence: the 20 highest-momentum stale entries were researched.**
  - **Refreshed (14)** with sourced 2024–26 programmes, for example the BMW
    Neue Klasse iX3 (cell-to-pack, 800 V), BYD's 12-in-1 drive, Rivian Gen 2
    quad-motor, the Tesla Model Y refresh, Stellantis e-DCS6, and China
    one-box and CDC fitment.
  - **Note corrections (3):**
    - LFP is >40% cheaper than NMC (IEA 2026), not 20–30%.
    - Heat pumps are still an option on some volume models.
    - Air suspension has reached the RMB 200–250k band in China (5.6% fitment).
  - **Skipped (4)**, because the evidence was a plan, a regulation or a
    certification rather than production: ElringKlinger CCS, Eaton Breaktor,
    Euro 7, CCC digital-key.
  - **No new evidence (2):** 800 V e-compressor, terrain AI. They stay flagged.
  - Curation debt fell from 131 to 117 (stale from 70 to 56) and the gate is
    ratcheted.
- **5. Adoption ceilings.**
  - 119 proposals are in `docs/HORIZON-CEILING-PROPOSALS.md` and `.csv`:
    6 sourced, 25 structural, 88 engineering judgement.
  - **Not applied**: they await cost-engineering sign-off.
  - Key finding: approving them moves 33 technologies from H2 to H1, because
    the lane rule uses a quarter of each technology's *own* ceiling. Decide
    that model question together with the values.

## BEV battery update, 7 October 2026

All 29 Battery entries were refreshed against 2025–26 sources and four
technologies were added. The Battery commodity now has 33 entries.

- **Shares and maturity:**
  - LFP is 55% of EV batteries deployed globally in 2025 (IEA GEVO 2026;
    was 40%) and is more than 40% cheaper than NMC.
  - Sodium-ion is 0.1% (CATL guides 10–20k Na-ion EVs in 2026). The Changan
    Nevo A06 is the first mass-produced Na-ion car.
  - Semi-solid TRL 6 → 8 (SAIC MG4 QingTao deliveries, Dec 2025).
  - Dry electrode TRL 7 → 8 (Tesla fully dry 4680 in volume, Q4 2025).
- **Programmes:**
  - BYD Blade 2.0 / CTB 2.0 and 1.5 MW flash charging (11,586 stations by
    Sep 2026).
  - BYD 1000 V Super e-Platform.
  - Rivian R2 4695 deliveries (Jun 2026).
  - NIO 4,090 swap stations; CATL Choco-swap at 2,000 stations.
  - GB 38031-2025 dates: new types Jul 2026, existing types Jul 2027.
- **Players:**
  - Group14 owns its former SK JV.
  - Sila's Moses Lake plant is online.
  - SES AI has left EV cells.
  - Ford is out of V2G (F-150 Lightning ended).
  - Zeekr is out of 1000 V (its platform is 900 V).
  - GM no longer uses the "Ultium" brand.
- **New entries:**
  - in-pack thermal-runaway gas and pressure sensing (anchored to GB 38031);
  - high-voltage mid-nickel single-crystal NCM;
  - dual-chemistry packs (CATL Freevoy Na+Li; NIO NCM+LFP);
  - VW's unified prismatic cell.
- **Removed or skipped:**
  - an unsourced claim about GM's LFP plans (LMR entry);
  - Blade 2.0 as LMFP (the source is conditional);
  - market-research-only player additions;
  - an ambiguous future housing SOP;
  - debond-on-demand adhesives (no production vehicle).
- **Engine fix:** production evidence is now judged per programme. One
  discontinued or planned item no longer hides a live series programme in
  the same list. This corrected 7 entries to COMMITTED, each with a real
  series programme.

As before, page fetches were blocked by the proxy, so the quotes are
search-result text. Open the `evidenceUrl` links before the demo.
