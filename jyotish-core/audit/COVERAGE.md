# COVERAGE — Workstream B (REVIEW-360 §2)

Every row: `FULL` / `PARTIAL` / `MISSING` / `NOT PLANNED`, with files and — for
every FULL — a passing test named. Nothing is FULL on memory.

> **The caveat over the whole B1 table:** FULL means *implemented and pinned by
> passing unit/invariant tests*. It does **not** mean verified against
> दाते पंचांग — 0 of 62 golden cases are transcribed
> (`docs/GOLDEN_FILES.md`), so minute-level agreement with the authority is
> unverified for every value below. That is one shared gap, not a per-row one,
> and Workstream C step 5 is its gate.

## B1 — Panchang

| Item | Status | Where | Passing test |
|---|---|---|---|
| तिथी — index, paksha, start/end, kshaya/vriddhi tithi | **FULL** | `core/panchang/limbs.py`, `day.py` | `test_tithi_key_table_and_amavasya_substitution`, `test_tithi_anomaly_classification`, `test_tithi_at_birth_may_differ_from_tithi_at_sunrise` |
| वार — sunrise day boundary | **FULL** | `core/panchang/day.py` | `test_vara_counts_sunday_as_zero`, `test_pre_dawn_birth_rolls_back_one_hindu_day`, `test_post_sunrise_birth_does_not_roll` |
| नक्षत्र — index, pada, lord, start/end | **FULL** | `core/panchang/limbs.py` | `test_panchang_day_lists_every_limb_touching_the_day`, `test_first_mahadasha_balance_matches_the_nakshatra_remainder` |
| योग — all 27 | **FULL** | `core/panchang/limbs.py` | `test_limb_divisions_have_plausible_durations`, `test_a_yoga_end_time_discriminates_the_ayanamsa_and_a_tithi_end_time_does_not`; 27 keys enforced by the locale audit |
| करण — 11 names over 60 half-tithis | **FULL** | `core/panchang/limbs.py` | `test_karana_name_mapping_covers_all_sixty_half_tithis` |
| Sunrise / sunset / moonrise / moonset | **PARTIAL** | `core/panchang/solar.py` | Sun events: `test_sunrise_is_plausible_without_asserting_an_authority_value`, `test_disc_convention_moves_sunrise_by_minutes`. **Moon events are computed and surfaced but no passing test pins one** — only the pending golden scaffolds assert them |
| दिनमान / रात्रीमान | **FULL** | `core/panchang/ishtakaal.py` | `test_dinamana_and_ratrimana_are_computed_and_printed` |
| राहूकाळ / गुलिक काळ / यमगंड | **FULL** | `core/panchang/kaal.py` | `test_kaal_tables_are_permutations_of_the_eight_parts`, `test_kaal_parts_tile_the_daylight_span`, `test_rahu_kaal_is_the_weekday_indexed_part` |
| अभिजित मुहूर्त | **FULL** | `core/panchang/kaal.py` | `test_abhijit_is_the_eighth_of_fifteen_and_straddles_midday` |
| Amanta month + अधिक/क्षय month detection | **PARTIAL** | `core/panchang/month.py` | Adhika verified against published years (`test_adhika_shravana_2023_is_detected_and_named`, `test_other_published_adhika_months`). **Kshaya-month detection is implemented but untested against a real occurrence** — they are rare, and no historical case is pinned |
| शालिवाहन शक year | **FULL** | `core/panchang/month.py` | `test_gudi_padwa_opens_chaitra_and_the_shaka_year`, `test_shaka_year_turns_over_at_gudi_padwa` |
| ऋतू / अयन / संक्रांती | **FULL** | `core/panchang/ritu.py`, `solar.py` | `test_ritu_pairs_consecutive_lunar_months`, `test_ayana_boundaries_are_makara_and_karka`, `test_makar_sankranti_falls_in_mid_january` |
| इष्टकाल in ghati–pala | **FULL** | `core/panchang/ishtakaal.py` | `test_ishtakaal_units`, `test_proportional_ghati_differs_from_the_fixed_one_off_the_equinox` |
| Chandra rashi for the day | **MISSING** | — | The natal Moon rashi exists in the chart (birth time required); the panchang block never states the day's Moon rashi. A panchang column a Maharashtrian reader expects |
| Festival and vrat list (Maharashtra observance) | **MISSING** | — | — |
| Daily / monthly / yearly panchang views | **PARTIAL** | `api/main.py` `/v1/panchang` | A single day is computable over the API; there is no panchang *view* in the UI at all, and no month/year assembly |
| Muhurta finder | **MISSING** | — | — |
| Choghadiya | **MISSING** | — | — (see B3: NOT PLANNED) |

## B2 — Kundali

| Item | Status | Where | Passing test |
|---|---|---|---|
| लग्न + its nakshatra/pada | **FULL** | `core/chart/assemble.py` | `tests/invariants/test_cross_implementation.py` (lagna cross-check; found D13), ChartFacts schema validation in `test_facts.py` |
| Nine grahas: longitude, rashi, degree, nakshatra, pada | **FULL** | `core/chart/assemble.py` | `test_chart_has_all_nine_grahas_with_shadbala_only_for_seven`, `test_all_longitudes_in_range` |
| वक्री and अस्त flags | **FULL** | `core/chart/assemble.py`, `dignity.py` | `test_mean_nodes_are_always_retrograde`, `test_true_node_retrogression_is_not_assumed`, `test_combustion_orbs_and_exemptions`, `test_combustion_wraps_across_zero_degrees` |
| Whole-sign bhava + Bhava Chalit (Sripati) | **FULL** | `core/chart/houses.py` | `test_sripati_houses_tile_the_circle`, `test_sripati_house_lookup_agrees_with_the_boundaries`, `test_whole_sign_houses_cover_all_twelve` |
| चंद्र कुंडली / सूर्य कुंडली | **PARTIAL** | `core/chart/assemble.py` (`rotate_chart`) | Engine full and tested (`test_chandra_and_surya_kundali_are_rotations`); **rendered nowhere** — not on the web sheet, not in the PDF |
| All 16 vargas | **FULL** | `core/chart/vargas.py` | `test_all_sixteen_vargas_are_present`, `test_varga_partitions_every_sign`, `test_d9_navamsa_known_values`, `test_d30_arcs_are_contiguous_and_cover_the_sign` |
| ग्रहस्पष्ट in rashi-degree-minute | **FULL** | `web/components/GrahaSpashta.tsx`, `render/pdf.py` | `test_web_degree_formatter_matches_the_engine`, `test_pdf_renders_and_its_text_survives_extraction`, Playwright `practitioner density: the dense sections default open` |
| Dignities by exact degree | **PARTIAL** (by decision) | `core/chart/dignity.py` | Moolatrikona is degree-ranged (`test_moolatrikona_arcs`); exaltation/debilitation are whole-sign with परमोच्च recorded — a documented school decision (D19), not an omission. The row's "exact degree" is deliberately not met for exaltation |
| Vedic aspects incl. Mars/Jupiter/Saturn specials | **FULL** | `core/chart/aspects.py` | `test_every_graha_aspects_its_seventh_fully`, `test_special_aspects_are_full_and_not_reciprocal` |
| Bhinnashtakavarga + Sarvashtakavarga | **FULL** | `core/chart/ashtakavarga.py` | `test_bav_table_row_total`, `test_sav_table_grand_total` |
| Shadbala, itemised | **PARTIAL** | `core/chart/shadbala.py` | Components itemised and summed (`test_shadbala_totals_are_the_sum_of_their_components`); **Yuddha bala deliberately reported 0 with a flag** pending a sourced winner convention (`test_yuddha_bala_is_reported_as_zero_not_guessed`) |
| Yogas with evidence + classical citations | **PARTIAL** | `core/rules/` | Evidence is FULL (`test_every_match_carries_evidence`); citations are present on the rules but **optional in the loader** (`engine.py:427` defaults to `""`) and F-022/F-023 remain open on two of them. Provenance, by contrast, is required (`test_a_rule_without_a_provenance_band_fails_to_load`) |
| Vimshottari 4 levels + balance at birth | **FULL** | `core/dasha/vimshottari.py` | `test_vimshottari_years_total_120`, `test_subperiods_are_contiguous_and_close_exactly_on_the_parent`, `test_first_mahadasha_balance_matches_the_nakshatra_remainder`, `test_dasha_is_four_levels_deep` |
| Ashtottari / Yogini | **PARTIAL** (blocked) | `core/dasha/optional.py` | Period tables implemented and total-checked; the nakshatra→lord mapping **raises `UnsourcedConventionError`** because published tables disagree — blocked on a sourced 27-entry table, per CLAUDE.md 11's "do not pick one silently" |
| Gochar (transits over natal) | **MISSING** | — | Sade Sati is the only transit computed |
| साडेसाती — phase and exit date | **FULL** | `core/doshas/computed.py` | `test_sade_sati_phases_and_dates`, `test_sade_sati_transit_instants_do_not_depend_on_when_they_are_asked` |
| मंगळ दोष — named school + परिहार | **FULL** | `core/rules/data/doshas.yaml` | `test_mangal_dosha_has_one_rule_per_school`, `test_house_sets_differ_between_schools_by_the_second_house`; cancellation rules ship and are localised |
| Kaal Sarpa, Pitra, Nadi dosha | **FULL** | `core/doshas/computed.py`, rules YAML | `test_kaal_sarpa_detects_a_synthetic_complete_case`, `test_kaal_sarpa_refuses_the_yoga_dosha_classification`, `test_nadi_dosha_is_information_with_evidence` |
| गुण मेलन 36 + Bhakoot/Nadi exceptions | **FULL** | `core/milan/ashtakoot.py` | `test_koot_maxima_sum_to_thirty_six`, `test_milan_never_returns_a_bare_total`, `test_nadi_exception_needs_a_different_pada`, `test_bhakoot_exceptions_are_reported_not_folded_in` |
| Namakaran syllables per nakshatra-pada | **FULL** | `core/name/` | `test_syllable_table_is_complete`, `test_namakaran_match_is_information_not_a_defect`, `test_namakaran_reaches_the_printed_sheet` |
| Varshaphal / annual chart | **MISSING** | — | — |
| Prashna | **MISSING** | — | — (see B3: proposed out of scope) |
| Birth-time rectification | **MISSING** | — | — |
| PDF patrika export, three locales | **FULL** | `render/pdf.py` | `test_pdf_renders_and_its_text_survives_extraction`, `test_pdf_carries_the_disclaimer_and_the_evidence`, `test_the_web_and_pdf_fonts_are_the_same_file` |
| Chart comparison / saved profiles | **MISSING** | — | The DPDP record store (`api/storage.py`) persists birth inputs for consent/export/delete; there is no profile UX on top of it |

## B3 — Scope decisions

Judged against `docs/POSITIONING.md`: the primary user is the **practitioner**,
the occasion is **a handed birth**. A different positioning would reorder these —
festivals and muhurta would be fatal for the household; they are not fatal for
the practitioner's first session.

**v1 gaps (must fix before the positioning claim is honest):**

| Gap | Why fatal for the practitioner | Size |
|---|---|---|
| चंद्र कुंडली not rendered | A Marathi patrika conventionally shows it; the engine already computes it — this is a rendering gap, not a build | Small–medium |
| Chandra rashi of the day absent from the panchang block | A standard panchang column; also the honest fallback for unknown birth times (CLAUDE.md 4.6) | Small |
| Moon rise/set untested | Printed on the sheet with no test behind it — the only figures on the patrika in that state | Small (test-only; fully verified only via goldens) |
| Kshaya-month detection untested | A wrong month name on a kshaya year is exactly the error a practitioner catches | Small (find + pin one historical case) |
| Rule citations optional in the loader | An uncited rule contradicts the positioning's "traceable to a classical citation"; provenance is already mandatory, citation should match | Small |

**v2 (real, not fatal at practitioner-first launch):** festival/vrat list ·
muhurta finder · daily/monthly/yearly panchang views · gochar over natal ·
saved profiles/comparison · Varshaphal · birth-time rectification ·
Ashtottari/Yogini (blocked on a sourced table, not on effort).

**Explicitly out of scope (proposed — owner may override):**

- **Choghadiya** — [Likely] not a core Maharashtra convention (the brief's own
  note); the sheet already carries राहूकाळ/गुलिक/यमगंड/अभिजित, which is the
  Maharashtra day-division vocabulary.
- **Prashna** — a different consultation type with its own chart semantics; a
  natal-patrika tool that half-does prashna would read as a toy to exactly the
  practitioner this product serves.

**Not a row, but the two absences that outrank every row:** agreement with दाते
पंचांग (0/62 goldens; Workstream C) and the narrative layer never having
produced a real sentence. Both are recorded at the top of `CLAUDE.md` and gate
the positioning claims, not just a feature line.
