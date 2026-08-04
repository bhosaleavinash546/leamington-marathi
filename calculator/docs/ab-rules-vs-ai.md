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
