# Optimal-choice coverage — where every commodity stands

The principle (from the stub-axle challenge): **the should-cost models the most efficient
plausible supplier, so the tool takes every supplier-side choice it can verify — and every
suggestion it still makes is priced arithmetic, never a critique of its own output.**

Status per choice, per commodity. Three states:
- **COST-RANKED** — alternatives priced, cheapest capable wins, losers in the trace.
- **SIZED + AUDITED** — smallest machine that covers the physics (= cheapest on a monotonic
  rate ladder); deviations in EITHER direction now flagged with the £/part delta.
- **ADVISOR/RULE** — chosen by engineering rules or spec constraints; not yet cost-ranked.

| Commodity | Machine / process choice | Status |
|---|---|---|
| machining | routing + machine (split vs 5-axis vs turned) | **COST-RANKED** (routing-optimiser.ts) |
| cast_and_machine | machining half | **COST-RANKED**; casting half: HPDC machine **SIZED + AUDITED** |
| injection_moulding | press | **SIZED + AUDITED** (clamp → smallest press; over/undersize flagged in £/part) |
| injection_moulding | cavity count | **COST-RANKED** (cavitation-optimiser.ts — machine+labour+mould NRE per candidate, clamp-feasible set, losers priced in the trace) |
| blow_moulding | machine | **SIZED** by shot weight; undersize audited; oversize NOT priced (ids not tonnage-tiered) |
| forging | press | **SIZED + AUDITED** |
| sheet_metal | press | **SIZED + AUDITED** |
| sheet_metal | die type (progressive/transfer/stage) | **ADVISOR/RULE** — candidate for volume-ranked costing |
| casting | HPDC machine | **SIZED + AUDITED** |
| casting | subtype (sand/gravity/HPDC/investment) | **ADVISOR** (spec-constrained: pressure-tight, tolerance, safety) — cost ranking within the feasible set is a candidate |
| thermoforming / roto / rubber / extrusion | process variant | **ADVISOR/RULE** (process-variant, not size-tiered) |

## What changed in this pass (all commodities)

- **`machine-oversized` audit check** (should-cost-audit.ts): the machining-routing lesson
  generalised. The deterministic path always picks the smallest tier that covers the physics —
  the cost optimum — but an AI- or hand-picked machine a tier too big used to sail through.
  Now every size-tiered commodity flags it WITH the per-part delta ("imm-800t £78/hr where
  imm-200t £25/hr suffices → £0.62/part the part does not need") and a one-click correction.
  Undersize was already flagged; both directions are now covered.

## Honest limits / staged next steps

1. ~~IM cavitation~~ — **done** (`cavitation-optimiser.ts`): candidates [1,2,4,8] clamp-
   filtered, each priced as machine+labour (both divide by n) + level-calibrated mould NRE
   amortised the way the mapper charges it; ranked table rides the cavities basis. The
   runner-per-shot under-count at n>1 was fixed in the same pass. Follow-up flagged: the
   dfm-dfa "consider multi-cavity tooling" generic advice should be suppressed or replaced
   with this optimiser's priced delta, in the style of the §14 Re-quote fix.
2. **Sheet-metal die type** — progressive vs stage is a volume-economics decision currently
   made by rule.
3. **Casting subtype** — the advisor constrains by spec; within the feasible set, cost ranking
   (yield × cycle × tooling) is not yet done.
4. **Blow oversize pricing** — machine ids are not capacity-parsed, so the oversize audit
   cannot price the delta; needs capacity metadata on the blow tiers.
