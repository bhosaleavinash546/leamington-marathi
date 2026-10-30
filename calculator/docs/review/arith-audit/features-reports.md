# Arithmetic audit — cross-commodity features and reports (`features-reports`, 30 Oct 2026)

## 1. Scope

**Files owned:** `src/engine/core.ts`, `regional-rates.ts` (comparison functions, `LANDED_ADDERS`, shop defaults — no
rate values), `regional-comparison.ts` (`computeRegionalComparisonExact`), `uncertainty.ts`, `calibration.ts`,
`quote-teardown.ts`, `quote-teardown-detailed.ts`, `causal-model.ts`, `scenario.ts`, `sensitivity.ts`, `carbon.ts`,
`part-similarity.ts`, `drift-monitor.ts`, `design-to-cost.ts`, `route-feasibility.ts`, `landed-cost*.ts` (spot check
only), `src/export/*.ts`, `server/services/route-compare.ts`.

**Parts:** FORGE_Hub_Flange (forging), PRCR002 (cast + machine), IM_ECU_Cover (injection moulding),
Seat_Locking_Bracket (sheet metal), AL_Battery_Rail (aluminium extrusion), COMP_Hat_Stiffener (composites) — UK book,
50,000 a year, 5 years, the baseline's answers.

**Reproduce:**

```bash
cd calculator
npx tsx scripts/arith-audit/dump.ts <dumpDir>                       # the dump (the lead's)
npx tsx scripts/arith-audit/features-reports.ts <dumpDir>           # shadow model + reports, ~2 min; --no-routes / --no-reports
npx vitest run tests/arith-audit-features-reports.test.ts
```

The script writes the PDFs, workbooks, PDF text and route comparisons to `<dumpDir>/features-reports/`.

Note: other auditors moved several parts while this ran (the dump is stale for FORGE £17.2495 → £17.0451, PRCR002
£42.31 → £42.78, Seat bracket £1.557 → £1.624, AL rail £33.94 → £33.52, COMP £98.69 → £73.55 — the composites NDI
went from £25 to £0.86). Sections A–I check the dump's own `stackInput` → `result` (internally consistent); the route
comparison and the country "whole chain" figures are checked against the part costed **now**.

## 2. Sequence

The features take the costed operations as given; the sequence of each part is the commodity auditors' remit. What
this group checks is that every feature carries the operations exactly as costed:

| Feature | What it takes from the costing | Verdict |
|---|---|---|
| 8 buckets (`core.ts`) | ops, material, tooling, pack/log, OH %, margin % | correct on all 6 parts to < ½ p |
| Route re-add (`auditRow`) | the trace's stackInput + result | closes on all 6; latent sign bug with a learning curve (F10) |
| Country rows (`computeRegionalComparisonExact`) | the stack input re-priced in each book | arithmetic correct; overhead default disagreed with the country costing (F8); fallback rows not flagged (F8) |
| Band (`uncertainty.ts`) | drivers by provenance | reproduces the headline at zero spread; spreads were not printed (F6) |
| Sensitivity | each driver ±10 % | every driver re-costed here to < 0.05 p |
| DtC drivers | each driver through the stack | Σ drivers = headline on all 6 |
| Quote teardown | the costing's detail | margin left packaging + logistics out (F1) |
| Causal model | the material bucket | read consumables / energy as index-driven metal (F5) |
| Carbon | net / gross kg, commodity | arithmetic correct; 85 % credit unprinted (F7) |
| Reports | result + input | every bucket, total, band and country row printed equals the costing |

Observed outside this group (for the lead, not changed): the FORGE costing's CNC lathe is £7.79/h and the drill
£6.64/h machine-only — low for a CNC lathe; COMP_Hat_Stiffener's tooling is £6.34 M (500 replacement tools for a 400 mm
stiffener). Commodity / rate-book auditors own these.

## 3. One part by hand — FORGE_Hub_Flange (dump, UK)

| Line | Arithmetic | £ |
|---|---|---|
| Gross steel | 2.9000 kg net ÷ 0.675498 = 4.29313 kg | |
| Metal | 4.29313 × £1.15 = 4.93710 − scrap 1.39313 kg × £0.20 = 0.27863 | 4.65847 |
| Consumables | descale 0.50487 + tool wear 1.35920 | 1.86407 |
| Energy | 1.47254 kWh × £0.182 | 0.26800 |
| **Material** | | **6.79055** |
| Forging | 91.6905 £/h × 0.0031184 h ÷ 0.8 = 0.35741; labour 25.15 × 2 × 0.0031184 ÷ 0.92 = 0.17049 | |
| Flash trim | 15.2089 × 0.0031184 ÷ 0.8 = 0.05928; 25.15 × 1 × 0.0031184 ÷ 0.92 = 0.08525 | |
| Turning | 7.78688 × 0.130333 ÷ 0.8 = 1.26861; 27.95 × 0.5 × 0.130333 ÷ 0.92 = 1.97979 | |
| Drilling | 6.64156 × 0.05845 ÷ 0.8 = 0.48525; 27.95 × 0.5 × 0.05845 ÷ 0.92 = 0.88787 | |
| Load / unload | 6.64156 × 0.0309 ÷ 0.8 = 0.25653; 27.95 × 1 × 0.0309 ÷ 0.92 = 0.93876 | |
| **Process / Labour** | Σ | **2.42708 / 4.06216** |
| **Tooling** | £140,263.20 ÷ 250,000 | **0.56105** |
| Overhead base | 6.79055 + 2.42708 + 4.06216 + 0.56105 | 13.84084 |
| **Overhead** | 12 % × 13.84084 | **1.66090** |
| Packaging + logistics | 0.17 + 0.30 | 0.47000 |
| Subtotal | 13.84084 + 0.47 + 1.66090 | 15.97174 |
| **Margin** | 8 % × 15.97174 | **1.27774** |
| **Total** | | **17.24948 → £17.25** |

Then: band P10 £15.60 / P90 £19.09 (± 10.1 % = (19.09 − 15.60) / 2 ÷ 17.25); India row £7.6588 = the stack re-priced in
the India book with tooling × the toolroom factor, overhead 9 % (12 × 0.72 rounded), packaging × 0.65, logistics × 1.50;
Poland £11.2127; carbon 6.53 + 2.88 + 0.06 = 9.47 kgCO2e; £ per 1 % steel = metal 4.65847 × 1 % × 1.12 × 1.08 =
£0.0563 (the screen wires the whole bucket: £0.0821, F5); the PDF prints £17.25 and every bucket above; the Excel
summary's cells re-add to 17.249478.

## 4. Shadow model — result

Final run: **754 PASS · 0 FAIL · 6 OPEN** (the OPEN items are F1's main.ts half, proposed P1). Before the fixes: 651
PASS · 67 FAIL (the same checks without section K; with K, 2 more FAIL — the §7 basis line on both PDFs).

| Part | A buckets + ops | B auditRow | C countries | D band | E sens. | F carbon | G DtC | H teardown | I causal | J routes | K reports |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FORGE_Hub_Flange | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS (+1 OPEN) | PASS | 5 rows PASS | PDF + xlsx PASS |
| PRCR002 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS (+1 OPEN) | silent (iron) | 3 rows PASS | — |
| IM_ECU_Cover | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS (+1 OPEN) | silent (resin) | 2 rows PASS | PDF + xlsx PASS |
| Seat_Locking_Bracket | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS (+1 OPEN) | PASS | 1 row PASS | — |
| AL_Battery_Rail | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS (+1 OPEN) | PASS | 3 rows PASS | — |
| COMP_Hat_Stiffener | PASS | PASS | PASS | PASS | PASS | n/a (no mass) | PASS | PASS (+1 OPEN) | n/a (direct) | 1 row PASS | — |

Country rows, the stack re-price fallback against the part costed through the whole chain in that country (the screen's
row), on the part costed now: FORGE IN +3.8 % / PL +1.4 %; **PRCR002 IN +32.1 %** / PL +7.9 %; IM_ECU −3.5 / −1.8 %;
Seat −5.8 / −2.6 %; AL rail −1.1 / −0.6 %; COMP +9.8 / +2.3 %. The legacy linear scaling (`computeRegionalComparison`,
used only with no rate book) is off by up to 23 %. The fallback carries the UK's services, consumables and a
module-priced material — F8 now marks those rows and says so.

## 5. Constant register (constants that move £ or a printed figure)

| File:line | Value | Meaning | Class | Effect |
|---|---|---|---|---|
| core.ts | — | the stack formula only | — | — |
| regional-rates.ts `regionalShopDefaults` | 12 %, £0.15, £0.25 | overhead / packaging / logistics defaults | LABELLED (`shopDefaultsBasis`, printed) | 12 % of base on every part |
| regional-rates.ts `toolroomFactorFor` | 0.5 skilled + 0.5 machine | toolroom £ factor | LABELLED-ESTIMATE (doc; §9 says "tooling by its toolroom rate") | IN tooling × 0.54 |
| regional-rates.ts `LANDED_ADDERS` | duty 0–6.5 %, shipping 1.8–7 % of ex-works | screen "Landed Cost" toggle | UNLABELLED on screen (code comment "indicative") | +13.5 % on a China row when ON — PROPOSED P5 |
| uncertainty.ts `CV_BY_CONFIDENCE`, `DRIVER_CV`, ×1.8, ×0.6 | 0.01–0.25 | band spreads | was UNLABELLED → LABELLED (F6) | band width only |
| uncertainty.ts band words | CV < 6 % tight, < 14 % moderate | the word printed | UNLABELLED, presentation (L) | none |
| pdf.ts §7 `baseCvOverride: 0.28` | 0.28 | spread when geometry is estimated | was UNLABELLED → printed (F6) | band only |
| calibration.ts `cvFromMape` | × 1.25, clamp 0.03–0.35 | MAPE → CV (≈ √(π/2), normal MAD→σ) | engineering (no actuals logged — never fires) | none today |
| quote-teardown.ts `COMMERCIAL_BENCHMARK` | OH 8–18 %, margin 5–12 % of quote | reference flags | was printed as "norm" → LABELLED heuristic (F3) | flags only |
| quote-teardown.ts RAG / severity | 5 / 15 %, 8 / 20 % | colour words | presentation (L) | none |
| causal-model.ts `scenarioPortfolioDrift` defaults | 12 % / 8 % | pass-through when a case lacks its own | UNLABELLED fallback (L) — main.ts passes 0.12 / 0.08 literally (P2) | ≤ 2 % of a what-if |
| carbon.ts factor tables, 0.85, 1.35, 0.40, 0.08, 3.0 | | CO2e factors | LABELLED-ESTIMATE (PDF §10 + notes, F7) | no £ |
| design-to-cost.ts 0.9 | 90 % | most of an op a lever may remove | LABELLED when it bites (basis says "capped at 90 %") | — |
| route-compare.ts `VOLUME_LADDER`, trials 4000 / 1000, `CLOSE_GBP` ½ p | | method | stated in the report text | — |
| landed-cost.ts insurance 0.3 %, clearance £65, freight £/kg | | landed adders | each adder carries `status: 'estimate'` + basis | not audited further |
| part-similarity / drift-monitor thresholds (0.55, 15 %, 8 %, 90 d) | | when a note fires | heuristics, no £ (L) | none |
| pdf.ts `utilisationBenchmarkNote` | 55–95 % bands | reference text | LABELLED "CostVision engineering estimate" | none |

## 6. Findings register

| ID | Sev | File:line | Evidence | Status | £ before → after |
|---|---|---|---|---|---|
| F1 | H | quote-teardown-detailed.ts (commercial block) | margin = margin % × (factory + OH) — packaging and logistics left out of the margin base and of "our total"; a supplier quoting our own figures line for line showed a margin gap of −8 % × (pack + log) and our total short of the should-cost (FORGE £16.76 v £17.25); overhead ignored bought-in | FIXED (`packagingPerPart` / `logisticsPerPart` / `boughtInGBP` / `boughtInHandlingPct` on `PartDetail`, `shopBasis`); main.ts half PROPOSED P1 | FORGE margin £1.24 → £1.28, total £16.76 → £17.25 once P1 lands |
| F2 | H | quote-teardown.ts headline | a quote 30 % BELOW should-cost read "within 30 % of should-cost — competitive; hold and confirm" while the RAG was red | FIXED: "x % below should-cost — check the scope …" | text |
| F3 | M | quote-teardown.ts `COMMERCIAL_BENCHMARK`, `PLAYBOOK`; negotiation-report.ts:172, :485 | "above the 8–18 % norm", "sector norms", "Cap overhead at the sector benchmark" — no source exists | FIXED: "CostVision heuristic range, not a sourced benchmark"; playbook names the should-cost's own %; main.ts:1759 PROPOSED P4 | text |
| F4 | M | quote-teardown.ts attribution levers | a total-only quote printed "Raw Material · £X/yr" — the gap apportioned by should-cost share, stated nowhere | FIXED: the lever says it is apportioned and by what share | text |
| F5 | M | causal-model.ts; main.ts:1688 | £ per 1 % index move took the WHOLE material bucket (descale, tool wear, energy) as index-driven: FORGE £0.0821 v £0.0563 re-costed (+46 %); main.ts passes 12 % / 8 % literally; "~X % above today's index" — the costing holds a dated rate-book price, not today's index | FIXED: `metalCostOf` (exact on 3 parts), text "more than the material price this should-cost uses"; wiring PROPOSED P2 | FORGE £0.082 → £0.056 per 1 % |
| F6 | M | uncertainty.ts; pdf.ts §7 | the band's spreads (0.01 … 0.25, ×1.8, ×0.6, 0.28) set its width and were printed nowhere ("each driver varied by where it came from") | FIXED: `UNCERTAINTY_BASIS` / `UNCERTAINTY_BUCKET_BASIS` generated from the constants, printed in §7; main.ts text PROPOSED P3 | none |
| F7 | L | carbon.ts notes | 85 % scrap re-melt credit applied but not stated; factor tables unlabelled in the notes | FIXED | none |
| F8 | M | regional-comparison.ts; pdf.ts §9 | (a) the fallback scaled 12 % × multiplier (IN 8.64 %) while the country costing uses `regionalShopDefaults` (9 %); (b) §9 said every row is "the part re-costed with that country's rates" — a stack re-price row carries the UK's services, consumables and module-priced material (PRCR002 India +32 %) | FIXED: default → that country's default; rows carry `basis`; §9 marks re-priced rows † and says what they carry | FORGE IN row £7.6355 → £7.6588; PL £11.2321 → £11.2127 |
| F9 | L | decision-text.ts `toolingAmortisationBasis` | "the amortisation volume typed on the form" printed beside a CAD costing's 250,000 = 50,000 × 5 (headless input holds no annual volume) | FIXED | text |
| F10 | M | route-compare.ts programme / payback | "piece cost without tooling" = total − tooling/part left the tooling's overhead and margin (×0.2096) in the piece price; the programme spend counted it on top of the tool investment; payback used the same | FIXED: − tooling × (1+OH)(1+margin) | programme: FORGE −£29.4k (0.7 %), IM_ECU −£8.7k (2.7 %), Seat −£24.6k (6.3 %), COMP −£1.33 M (7.2 %) |
| F11 | M (latent) | route-compare.ts `auditRow` | learning-curve saving (signed, negative) was SUBTRACTED, so a learning-curve row could never close; overhead base read the engine's own `overheadBase` | FIXED (tested) | none on these parts |
| F12 | L | sensitivity.ts | "Costed weight (measured volume + stated stock)" printed on typed-form costings too | FIXED: "Costed net weight (before utilisation)" | text |
| F13 | L | core.ts comment | "industry benchmark of 10–15 %" | FIXED (comment) | none |
| F14 | L | route-compare.ts `RouteBand` doc | "± as % of the median" — it is % of the point estimate | FIXED (doc) | none |

Real parts whose cost moves: **none** (no headline changes). The country table rows move (F8: FORGE IN +£0.023,
PL −£0.019) and the route comparison's programme spend / payback move (F10). `tests/real-parts-baseline.test.ts` and the
rules-prompt snapshot are not affected by these fixes.

Tests: `tests/arith-audit-features-reports.test.ts` (17 tests; every block uses an export or behaviour added here).
Existing tests updated: `tests/causal-model.test.ts` expected the "above today" wording (F5). Failures seen in
`cad-phase2`, `country-rates` §5 / §13, `route-compare-review` §3 and `cad2c-report-audit` X13 are baseline drift from
other auditors' cost changes (knuckle £23.03 → £22.88, pattern-equipment label, casting bracket) — not from these files.

### PROPOSED (outside this group's files)

**P1 — main.ts `buildPartDetail` (≈ line 649)**: pass what the stack charged.

```ts
    overheadPct: input.overheadPct,
    marginPct: input.marginPct,
    annualVolume: input.annualVolume,
    total: result.total,
    packagingPerPart: input.packagingPerPart,
    logisticsPerPart: input.logisticsPerPart,
    boughtInGBP: Math.max(0, input.rawMaterial.boughtIn?.cost ?? 0),
    boughtInHandlingPct: input.rawMaterial.boughtIn?.handlingPct ?? 0,
```

and `src/ui/negotiation-model.ts::makeDemoParts`: `const marginGBP = (factory + overheadGBP + r.pkg + r.log) * r.mg;` and
add `packagingPerPart: r.pkg, logisticsPerPart: r.log` to `part`. `shouldBreakdownFor` (TYPICAL_SHARES) invents a
breakdown for a history record with none — print "shares assumed, not this part's costing" beside it or refuse the
detailed teardown for such records.

**P2 — main.ts ≈ 1688 (`buildCausalModel`)**:

```ts
const causal = buildCausalModel({ partTotal: shouldCost, materialCostGBP: lastResult && lastInput ? metalCostOf(lastResult, lastInput) : shouldBreakdown.rawMaterial,
  materialFamily: family, overheadPct: lastInput?.overheadPct ?? 0.12, marginPct: lastInput?.marginPct ?? 0.08, indices: commodityIndices() });
```

**P3 — main.ts `buildCadReportMeta` (≈ 18265)**: replace the uncalibrated text with `UNCERTAINTY_BASIS` (import from
`../engine/uncertainty.js`) and print it on the screen's band card the same way.

**P4 — main.ts:1759**: `` `${g.benchmark.sharePct}% vs ${g.benchmark.loPct}–${g.benchmark.hiPct}% heuristic range (not sourced)` ``.

**P5 — main.ts ≈ 16968 (regional table caption)**: "Per-region should-cost using 2025 Q2 labour, energy and rate
benchmarks … Tooling fixed" is false on both counts (2026-10 books; tooling is re-costed / scaled). Replace with:
"Each row is the part costed with that country selected (rows marked † re-price this costing's operations in that
country's book). Indicative — confirm with RFQ." When Landed is ON, add: "Landed adds import duty and freight as a
fixed % of ex-works per country (`LANDED_ADDERS`: indicative, not a tariff look-up — the Landed Cost panel has the
sourced duty)." Also decide what bucket 6 is: `regionalShopDefaults` calls logistics "delivery to the UK" while §9 says
rows exclude cross-border freight — with Landed ON the shipping % may count freight twice.

**P6 — main.ts ≈ 16961**: "Cost structure is within industry benchmarks" (no benchmark exists) → "No observation fired
on this costing." `cad-workspace.ts:394`: "a part excluding tooling" → "a part excluding tooling and its overhead /
margin" (F10). `src/engine/insights.ts:627` "above average" and `idea-levers.ts:481` "typically pays back inside a year"
are unsourced claims printed in the PDF (§11 / §12) — owned by whoever holds those files.

## 7. Not checked, and why

- `route-feasibility.ts` limits: each check carries its own source string; the values were not re-researched.
- `landed-cost*.ts`, `tariff-snapshot.ts`: spot-checked only (every adder carries `status` + `basis`; duty from the
  tariff snapshot with verification flags) — a full audit is a separate job.
- DtC design levers (`dfmLevers`) need a DFM job's findings; the drivers and `findingVariant` arithmetic were checked,
  the per-rule £ pricers belong to the commodity groups.
- The Excel route sheet (8-Routes) and the PDF route section were not regenerated headlessly (they print
  `cadMeta.routeComparison`, which the script checked at source).
- `calibration.ts` / `part-similarity.ts` / `drift-monitor.ts` fire only on logged actuals and saved cases — none exist.
- Non-£ report currency: the reports were generated in GBP only.
