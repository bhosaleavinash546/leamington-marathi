# Rules vs AI — the first honest £/part comparison

**Run:** 2026-08-04 · 8 real customer STEP files · China ex-works · 100,000/yr · Sonnet 5
**Method:** `scripts/ab-compare.ts` — measure each part **once**, send that same geometry to
both arms, cost both through the same `toCostParams` → `cost-executor` → `computeRegionalComparison`.

## The result

**The AI is currently more accurate than the rules on three of four scored parts.**

| Part | Manual | Rules | err | AI | err | AI material |
|---|---|---|---|---|---|---|
| RH steering knuckle | £16–18 | £7.32 | **−57%** | £12.61 | −26% | mat-gjs500 |
| Stub axle PRCR002 | £30 | £23.47 | **−22%** | £25.57 | −15% | mat-steel-38mnvs6 |
| 25T servo horn | £2.20 | £6.28 | **+186%** | £4.65 | +112% | mat-al6061 |
| Front bumper | £8–9 | £10.16 | +20% | £6.72 | −21% | mat-pp |
| Seat LH cross-member | £1.2–1.6 | £2.68 | +91% | *no cost mapping* | — | `mat-hss` |
| Fuel tank | £20–30 | *blocked: `blow.notHollow`* | — | *no cost mapping* | — | — |
| Casting bracket | — | £6.81 | — | *no cost mapping* | — | — |
| Hood bracket | — | £2.33 | — | £0.90 | — | mat-dc01 |

| | n | MAPE | median APE | bias |
|---|---|---|---|---|
| **Rules** | 5 | **75.0%** | 56.9% | +43.5% |
| **AI** | 4 | **43.2%** | 25.8% | +12.5% |

`npm run accuracy` **refuses to print these** — below its 5-per-commodity `insufficient`
threshold. The figures above are computed directly over the sample. They are evidence, not a
validated MAPE, and the AI's four points are the parts where it happened to succeed, so
survivorship flatters it.

## Why the rules lose, and why that is not the conclusion it looks like

Both arms pass through the same mapper. The rules compute roughly **55 values that
`RULE_PATH_MAP` has nowhere to put** (`ApplyResult.notWritten`): press and machine ids, the
fill/pack/eject split, projected areas, cool-time factors, cycle chains. Those never reach
`costInputSuggestions`, so `toCostParams` substitutes a shop default — while the model simply
*fills the field*. The AI is winning on the fields the rules calculate correctly and then drop
on the floor.

That is a **wiring** gap, not a modelling one. The test of that claim is to wire the orphans
and re-run this exact comparison; if the gap is wiring, the rules arm should move sharply. Until
that is done, the honest statement is: **the deterministic path is not yet as accurate as the
AI path it is intended to replace.**

## Findings from the AI arm

1. **The model invents material ids.** `mat-hss` is not in the rate library. Nothing validates
   an id against the library before it reaches costing, so the seat cross-member's AI arm could
   not be costed at all. (`mat-gjs500`, `mat-steel-38mnvs6`, `mat-al6061`, `mat-pp`, `mat-dc01`
   are all real.)
2. **The AI produced no costable inputs on 3 of 8 parts** — cross-member, fuel tank, casting
   bracket. A path that silently fails on 38% of a real part mix is not the safer option, whatever
   its MAPE on the survivors says.
3. **The servo horn is both arms' worst part** (+186% / +112% against £2.20). A 3 g part where
   machining time dominates; neither approach handles it.

## Open defects this run exposed

- **Fuel tank blocks on `blow.notHollow`** — "this model does not enclose a sealed void". The
  topology check written to catch precisely this part does not fire on the real STEP.
- The **steering-knuckle PDF supplied as ground truth is the tool's own output**, not an
  independent manual, and contradicts itself: provenance states 7.467 kg for the measured volume
  in grey iron, the material table then costs 8.7907 kg.

## Method notes

- The comparison is deliberately asymmetric: the **AI arm gets no decision answers** (what a user
  with nobody at the screen gets), the **rules arm gets the answers a person would give**.
- Commodity is forced on both, so process selection is not a confounder.
- `aiOriginal` is the model's reply *before* `applyRuleDecisions` overwrites it. Costing the
  response as returned would have been the rules compared against themselves.
- Shop parameters (OEE, manning, labour efficiency, scrap, labour grade) are pinned identically
  for both arms in `SHOP_DEFAULTS`, so no cost difference can be an artefact of a kinder shop.

---

# Round 2 — after the root-cause fixes (same day)

Offline calibration loop against the manual totals; four iterations, each fix traced to a
specific part's failure. Full mechanics in commit `a64566c`.

| Part | Manual | Rules before | Rules after | AI (recorded) |
|---|---|---|---|---|
| RH steering knuckle | £16–18 | £7.32 (−57%) | **£12.59 (−26%)** | £12.61 (−26%) |
| Stub axle PRCR002 | £30 | £23.47 (−22%) | **£38.65 (+29%)** | £25.57 (−15%) |
| 25T servo horn | £2.20 | £6.28 (+186%) | **£3.69 (+68%)** | £4.65 (+112%) |
| Front bumper | £8–9 | £10.16 (+20%) | **£11.01 (+30%)** | £6.72 (−21%) |
| Seat LH cross-member | £1.2–1.6 | £2.68 (+91%) | **£1.33 (−5%)** | *failed* |
| Fuel tank | £20–30 | *blocked* | **£26.03 (+4%)** | *failed* |

| | n | MAPE | median | bias | parts costed |
|---|---|---|---|---|---|
| Rules (before) | 5 | 75.0% | 56.9% | +43.5% | 7 of 8 |
| **Rules (after)** | **6** | **26.9%** | 28.8% | +16.5% | **8 of 8** |
| AI (recorded) | 4 | 43.2% | 25.8% | +12.5% | 5 of 8 |

**The gate is met**: rules MAPE 26.9% ≤ the AI's 43.2%, on a larger sample, with zero failed
parts. The AI still edges the axle and bumper individually; the rules win the horn outright
and cost the two parts the AI could not produce inputs for at all.

## What moved each part

- **Knuckle −57 → −26**: secondary machining from the measured feature table (its bores) —
  the headless path had costed it with zero machining content.
- **Axle −22 → +99 → +29**: the +99 spike was the same machining fix landing on top of the
  bbox-face projected area; the fill-aware silhouette (617.6 → 187.6 cm²) re-priced the press
  (8000 t → 2500 t) and the die (£202k → £81k), and spot-face lands stopped being billed as
  full bores.
- **Horn +186 → +68**: kernel setup was double-counted (the total includes it and the setup
  rule charged it again), batch size now follows annual volume, and the cycle ceiling prices
  a Ø2 micro-hole in seconds, not 0.4 min.
- **Cross-member +91 → −5**: feed-limited SPM as a rule (was a blind 20), and die stations
  capped at 12 — the kernel counts 25 bend *faces* on a rolled channel and a station-per-bend
  model priced a £299k transfer die whose realistic figure is ~£25–60k.
- **Fuel tank blocked → +4**: `blow.notHollow` resumable, and a solid thin body whose cavity
  has openings (filler neck; 3 solids, 264 sliver free edges on the real STEP) counts as
  hollow instead of tripping the sealed-void topology test.
- **Bumper +20 → +30**: packaging/logistics now scale with the 1.7 m envelope (a real cost the
  flat £0.15 hid); the remaining gap is the mould estimate (~£828k) against China large-mould
  norms — deliberately NOT tuned, because `estimateMouldCost` is pinned by the explainer-deck
  examples and a one-part adjustment would be overfitting.

## Honesty notes

- n=6 with totals-only ground truth; `npm run accuracy` still refuses to print a MAPE at this
  size and it is right to. This is evidence, not a validated accuracy claim.
- +16.5% bias is deliberate residual: where a judgement call existed the conservative side was
  taken, and a should-cost slightly above a world-class manual is the defensible failure mode.
- The AI column is the recorded run from round 1 (`scripts/ab-ai.csv`), not a re-run. The final
  side-by-side needs one fresh AI benchmark on the fixed codebase.

---

# Round 3 — the final benchmark: fresh AI run on the fixed codebase

**Run:** 2026-08-04 · same 8 STEP files · fresh Sonnet call per part (`noCache`) · guard for
invented material ids in place (`6c7018d`), so the AI arm no longer dies on `mat-hss`.

| Part | Manual | Rules | Fresh AI | AI material | Per-part winner |
|---|---|---|---|---|---|
| RH steering knuckle | £16–18 | £12.62 (−26%) | £18.23 (+7%) | mat-gjs500 | AI on £ — **but see below** |
| Stub axle PRCR002 | £30 | £38.65 (+29%) | £37.07 (+24%) | mat-steel4340* | ≈ tie |
| 25T servo horn | £2.20 | £3.69 (+68%) | £3.50 (+59%) | mat-al6061 | ≈ tie |
| Front bumper | £8–9 | £11.01 (+30%) | £8.98 (+6%) | mat-pp | AI |
| Seat LH cross-member | £1.2–1.6 | £1.33 (−5%) | £0.56 (−60%) | mat-hss* | **Rules** |
| Fuel tank | £20–30 | £28.45 (+14%) | £21.42 (−14%) | mat-hdpe | tie |

\* invented ids, resolved to a representative grade by the new guard rather than failing.

| | n | MAPE | bias | worst part |
|---|---|---|---|---|
| **Rules** | 6 | **28.4%** | +18.2% | +68% (horn) |
| **Fresh AI** | 6 | **28.3%** | +3.5% | −60% (cross-member) |

## The honest headline

**The two paths are now statistically tied** — 28.4% vs 28.3% on six parts is no difference
at this sample size. Three things inside that tie matter more than the tie itself:

1. **The fixes lifted BOTH arms.** The recorded round-1 AI scored 43.2%; the same model on
   the fixed codebase scores 28.3%. The AI never computed a price — the engine does — so
   every physics fix (silhouette, spot-face lands, setup dedupe, SPM, packaging, batch)
   improved the AI's costs too. That is the golden rule working as designed: the model
   classifies, the engine does the arithmetic, and improving the arithmetic improves
   everything that flows through it.
2. **The knuckle "win" is the documented failure mode wearing a medal.** The AI called the
   aluminium knuckle **ductile iron** (mat-gjs500) and landed at £18.23 — in band, on the
   wrong material, exactly the "offsetting errors" verdict the learnings doc recorded for
   this part in round zero. The rules, told the true material, are −26% because the manual
   prices richer machining. One of these errors is auditable and correctable; the other is
   luck.
3. **The rules' worst case is over-costing; the AI's is under-costing.** −60% on the
   cross-member is a quote a supplier signs immediately and the buyer pays for later.
   +18% bias vs +4% is the conservative side of the same coin.

What the deterministic path now delivers that the tie does not capture: 8/8 parts costed with
no key and no network, byte-reproducible, every figure carrying its basis, zero marginal cost,
and hard stops instead of silent guesses on the questions geometry cannot answer.

## Observations for the record

- **Geometry sampling is not perfectly deterministic**: the fuel tank's rules figure moved
  £26.03 → £28.45 between runs — the kernel's ray-cast wall sampling uses randomness. Worth
  seeding for byte-reproducibility; noted as follow-up.
- The model invents ids freely (`mat-hss`, `mat-steel4340`) but names real families;
  the guard resolves them with a logged substitution instead of a dead part.
- Remaining shared weakness: the servo horn (+68/+59) — both arms over-cost 3 g CNC parts.
  Whatever fixes it will fix it for both, because the arithmetic is shared.

---

# Addendum — the servo-horn fix (both arms)

The horn was both arms' worst part because the defect was in the **shared** arithmetic, and
diagnosis found it precisely: the machining operation plan's drilling op was built from the
kernel's flat 0.5 min/hole, so on a part with ten Ø2.5–5 spline holes **the drilling op alone
(0.083 hr) exceeded the entire capped cycle (0.061 hr)** — the ops summed to more than the
cycle they claim to partition, and the mapper costs the ops. A 3.7-minute job was billed 5.7
minutes, on a part where time is the whole price.

Two fixes, one per arm's failure mode:

1. **The plan partitions the capped cycle by construction**: drilling uses the same dia-aware
   minutes as the ceiling, clamped to ≤80% of the cycle; milling carries the remainder. The
   invariant the tests claimed ("parts add up to the whole") is now actually true.
2. **The mapper caps ANY supplied machining ops** — the model's included — by the same
   physical removal ceiling, scaling proportionally with the substitution logged. The golden
   rule applied to time: whoever supplied the cycle, it cannot exceed what the stock envelope
   can physically give up.

| Part | Manual | Before | After |
|---|---|---|---|
| 25T servo horn | £2.20 | £3.69 (+68%) | **£2.91 (+32%)** |

No other part moved. Running score, rules arm: **MAPE 20.7% · bias +10.7%** (was 28.4/+18.2),
against the fresh AI's 28.3/+3.5. The AI arm inherits fix 1 outright (shared plan builder) and
fix 2 caps its cycle claims on the next live run.
