# CAD-to-Cost — Learnings from real-part verification

A running log of what breaks when the CAD-to-Cost pipeline meets real automotive
STEP files, and the fixes shipped for each. The method for every part: measure the
STEP with the same OCCT engine the tool uses (ground truth), run the **live** AI
pipeline, do an independent manual bottom-up should-cost, then compare line-by-line
and fix what's wrong. All money is deterministic in `src/engine/`; the AI only
*classifies* (material family, process route, feature interpretation).

## The one principle everything else follows from

**CAD geometry is ground truth for SHAPE, but says nothing about MATERIAL or
PROCESS.** The same solid can be plastic, aluminium, or steel (an ~8× mass range),
and a shape can be cast, forged, moulded or machined. Material and process are AI
*classification* — inherently uncertain from geometry alone — so they must be:
1. **sanity-checked** against measured geometry and physics,
2. **flagged** when inferred from shape alone, and
3. **overridable** by the engineer (who supplies the one thing CAD can't).

Every bug below is a variation on the tool trusting an AI classification it should
have questioned, or a geometry measurement that was physically implausible.

## Parts tested (China · GBP · ex-works · 100k/yr)

| Part | Reality | Tool's first answer | Manual | Verdict |
|---|---|---|---|---|
| RH steering knuckle | Al casting (safety-critical) | £16.21, right ballpark | ~£16–18 | offsetting errors (weight over, machining under) |
| Stub axle (PRCR002) | forged **steel** 8.14 kg | £41.97 as **aluminium** 2.8 kg | ~£30 | material family wrong (chose lightest metal) |
| 25T servo horn | **aluminium** CNC, 3 g | £1.27 as **injection-moulded plastic** | ~£2.2 | material CLASS wrong (metal→plastic), £333 feature card |
| Front bumper | **plastic** injection moulding | £29.18 as **Al gravity-die casting** | ~£8–9 | material CLASS wrong (plastic→metal), 27 mm bogus wall |
| Seat LH cross-member | **steel** sheet-metal stamping | £2.84 as PA6 injection moulding | ~£1.4 | sheet-metal↔plastic ambiguous from geometry; crash on missing AI field |
| Fuel tank | **plastic** blow-moulded coex HDPE | £216.97 as sand **casting** (83 kg metal) | ~£20–30 | thin-wall hollow → casting; then bottle-sized machine + no barrier |

## Bug taxonomy + fixes

### 1. Material-family / class misclassification (the dominant failure)
Geometry can't distinguish materials, so the AI guesses — and guessed wrong in 3 of
4 parts, each time in a way that moved cost 2–3×:
- Stub axle: picked the **lightest** metal (Al 2.8 kg) though its own payload
  carried `steelKg: 8.14`.
- Servo horn: reclassified an **"Aluminium"-named** file to plastic "for IM economics."
- Bumper: costed a thin-wall **plastic** part as a 5.5 kg **aluminium casting**.

**Fixes shipped:**
- **Material-ambiguity flag** (`main.ts` `cadMaterialAmbiguityAsk`): when material is
  inferred from shape alone (no photo/metadata/filename), name the candidate weights
  (Plastic X · Aluminium Y · Steel Z) and what the cost assumes; fire even at High AI
  confidence. Extended to **plastic↔metal class**, not just metal↔metal.
- **Filename material prior** (`cad.ts` `familyFromFilename` → prompt): if the file is
  named for a material ("Aluminium…"), treat it as a strong prior; don't
  value-engineer it away. Flag a filename↔material **contradiction** in the UI.
- **Confidence-inversion guard** (`promoteHighestConfidence`): never let an
  alternative outrank the primary (PA6-GF 55% had "Aluminium 6061 65%" as an alt).
- **Empty-material fallback**: when the AI returns the right commodity but a blank
  `materialId`, fill the filename-family default grade.
- **Material/process override + lock** (Stage 3): the engineer pins grade + route;
  it survives re-analysis. The definitive fix — the human supplies the material.

### 2. Geometry measurement traps
- **Wall thickness on thin shells** — ray-cast fires from the few planar faces across
  the whole cavity to the far wall, reporting local depth (bumper: **27 mm** vs the
  real **2.5 mm**). A wrong wall corrupts injection-moulding cooling time (∝ wall²)
  and makes a mouldable part look castable.
  **Fix:** `geometry-sanity.ts` `correctShellWallMm` — prefer `2·V/S` on genuinely
  thin, open shells (low fill ratio); leave chunky solids untouched. Feeds the prompt
  + display. Plus a Stage-1 hint: *thin uniform wall on a large envelope ⇒ moulding/
  sheet, not a metal casting.*
- **Silent OCCT-vs-text-parse fallback** — the shipped Alpine container has no
  cadquery, so STEP silently falls back to a text/heuristic weight.
  **Fix:** `geometrySource` provenance rides into the report (MEASURED vs ESTIMATED),
  widens the confidence band, and a badge counts measured vs AI-estimated fields.
- **Thread false-positives** on organic surfaces (bumper reported threads). *Known,
  low-impact; noted for the geometry engine.*

### 3. Machining time over-counts on small / thin parts
- **Feature-cost card** billed every B-rep face as a milling op — 266 min / £333 on a
  3 g servo horn (96 planar + 24 free-form faces).
- **Headline OCCT cycle** was 0.836 hr (~50 min) of cutting for the same 3 g part.
  **Fix:** `physicalRemovalCeilingMin` — machining time can't exceed what the stock
  envelope allows (removed volume ÷ MRR + surface finishing, × material factor).
  Applied to both the card and the headline cycle. Servo horn headline £39 → £6.4.
  *Caveat:* the envelope cap uses the bbox as stock, so it doesn't bind on a thin
  shell in a huge bbox — a feature-count machining view is misleading for a moulded
  part regardless (it's a machining lens on a non-machined process).

### 3b. Process/tooling not sized to the part (calibration)
The bumper, once correctly classified as injection moulding, still costed £5.68:
- **Press not sized to tonnage** — it stayed on a small default press (£11/hr) though
  a bumper needs ~3900 T (projected area 1.09 m² × 35 MPa). Process was £0.09.
  **Fix:** added 2000 T + 3500 T presses; `pickIMMPressId(tonnage)` sizes the press
  from `estimateClampingTonnage(projectedArea, cavityPressure)` in the CAD apply.
  Process £0.09 → £1.12 (3500 T @ £136/hr UK).
- **Flat packaging** (£0.15) is wrong for a 1.7 m bumper and a 3 g part alike.
  **Fix:** `estimatePackagingPerPart(bboxVolume, weight)` scales with the shipping
  envelope. Bumper £0.15 → £0.95; servo horn stays £0.05.
- The **mould £ itself was fine** for China (~£2/part) — the apparent "tooling
  gap" was actually the press rate. Result: bumper £5.68 → **£7.79**, on the
  manual £8–9. (Note: tooling amortises over *annual* volume, not tool life; for a
  1-year view that's conservative but defensible.)

### 4. Report defensibility (make the estimate auditable)
The report now carries: geometry-provenance box, key-assumptions header, a
**per-feature machining audit** (every detected feature with a Costed? flag),
machine-rate derivation note, alloy/spec DFM callout, a "what's excluded" panel, the
part render, and a confidence-driver line. Rates are correctly localised to the
region (verified China machine rates are ~0.55× UK, not a UK rate leaking through).

### 3c. Tooling amortisation not synced to annual volume (calibration)
Applying a CAD part sets the per-commodity amortisation-volume field to the user's
annual volume — but only for machining/casting/cast+machine/IM/forging. Sheet
metal, sheet-metal-fab, extrusion, thermoforming, rotomoulding and composites were
**missing from that map**, so their die/tool amortised over the 500k form default.
On the seat cross-member (pinned to sheet-metal steel) a £25k progressive die read
£0.05/part (£25k ÷ 500k) instead of £0.25/part (£25k ÷ 100k). **Fix:** added the six
commodities to the amort-sync map. Pinned seat £0.87 → £1.11 (tooling £0.05 → £0.25),
on the ~£1.2-1.6 manual. (Convention: amortise over annual volume — a conservative
1-year view — consistently across every commodity.)

### 1b. Thin-wall classifier hint — widen + detect hollow (blow moulding)
The thin-wall Stage-1 hint (rules out casting for large thin-wall parts) originally
gated on wall ≤ 4 mm, so a blow-moulded HDPE fuel tank (4.6 mm wall, 1.5 m, hollow)
slipped past it and was classed as a **sand casting at £216.97** (metal, 83 kg).
**Fix:** widened to ≤ 6 mm with a low-fill gate (chunky castings stay safe), and
added a HOLLOW branch — when the fill ratio is very low the part encloses a cavity,
so `blow_moulding` (tank/duct/bottle/reservoir) is called out alongside injection
moulding/sheet metal. Live: Stage-1 flipped casting 0.84 → blow_moulding 0.82;
tank £216.97 → £16.12, material metal £108 → HDPE £11. `CAD_PROMPT_VERSION → 4`.

### 3d. Blow-moulder not sized to the shot; barrier wall + flash not modelled (calibration)
Same two patterns the IM bumper hit, now for EBM. On the 11.1 kg fuel tank:
- **Machine not sized to the shot** — the form defaulted to a small 1–5 L bottle
  head (`blow-ebm-2head`), and the old apply code selected on a `bm-ebm` prefix
  that never matched the real `blow-ebm-*` ids, so a 13.6 kg parison stayed on the
  bottle machine (process £0.92 UK). **Fix:** `pickEBMMachineId(grossWeightKg)`
  (mirrors `pickIMMPressId`) picks by shot weight — ≥6 kg → the accumulator head
  (`blow-ebm-large`, 20–200 L). The apply now matches on the exact id. Process
  £0.92 → £2.25 (2.45×), the right machine for a tank.
- **Pinch-off flash not size-aware** — a big accumulator-head parison sheds far
  more than a bottle. **Fix:** flash floored to 22% of net for parts >3 kg (12%
  below), so gross (and material, charged on gross) reflects the real scrap.
  Tank flash 1.34 → 2.45 kg.
- **Multi-layer barrier wall not modelled** — an automotive fuel tank is a 6-layer
  coextruded HDPE/tie/EVOH/tie/HDPE structure, not mono-HDPE. **Fix:** the AI now
  *classifies* the wall (`barrierMultilayer` in the Stage-2 schema/prompt); the
  engine prices it on the real coex grade already in the rate library
  (`mat-hdpe-fuel-coex`, £1.55/kg) via `barrierMaterialId()` — bounded, so a "fuel
  tank" label can't inflate material without limit, and a barrier PP/PET keeps its
  own resin. A large HDPE accumulator shot is treated as barrier when the flag is
  absent (old cache / air-gapped). Material £13.8 (PP) / £11 (mono-HDPE) → £20.8
  (coex), landing a real coex tank in the £15–20+ range. `CAD_PROMPT_VERSION → 5`.
  (Verified deterministically through the engine; the golden rule holds — the AI
  only classifies barrier vs mono, the £/kg is fixed catalogue data.)

### 3e. Generalising the lessons across commodities (Phase 1 — agentic accuracy)
The per-part fixes above were the right corrections but landed as point patches on
one or two commodities. Two of them were promoted to universal mechanisms so a new
commodity (or a future one) inherits them for free:
- **Tooling amortises over annual volume for EVERY commodity.** The old code had a
  partial 11-commodity allow-list *and* six commodity cases that hard-coded their
  amort volume *after* the sync — silently clobbering it (blow/thermoforming/roto/
  rubber/composites/harness amortised over a stale form default). **Fix:** one
  `COMMODITY_AMORT_FIELD` map (all 18 commodities); per-case defaults apply only
  when no annual volume is given. Verified live: thermoforming 50k default → 100k.
- **Machine sized to the part for every size-tiered commodity.** "Size the machine
  to the part" (fuel-tank bottle machine, bumper press) was live only for IM + EBM.
  **Fix:** `engine/machine-sizing.ts` — one `sizeProcessMachine(commodity, params)`
  dispatcher + a `SIZE_TIERED_COMMODITIES` registry (the single place the self-audit
  layer will ask "is the machine sized to this part?"), reusing existing tonnage
  physics: IM clamp (`estimateClampingTonnage`), EBM shot weight, forging die-fill
  (`estimateForgingTonnage`), sheet-metal blanking (`estimateTonnageTonnes`), HPDC
  clamp (casting + cast+machine). `applyCADToForm` now sizes forge-mach, sm-press,
  cast-hpdc-mach, cam-hpdc-mach from geometry+material. Verified live: forging →
  forge-press-1600t, sheet-metal → press-100t, casting → hpdc-800t, cast+machine →
  hpdc-1600t. The picker only *selects* a rate-library machine id — £/hr stays
  deterministic (golden rule). Rubber / rotomoulding / extrusion are intentionally
  absent: they are process-variant tiered (compression vs injection, arm style,
  screw line), not part-size tiered, so forcing a tonnage ladder would be wrong.

### 4b. Robustness — a missing AI field must never crash the calculation
The seat cross-member's AI response omitted `mouldLife`/`runnerWeightKg` from the
injection-moulding sub-object (the bumper's included them — pure response variance).
`setNumericField(id, undefined)` then threw `undefined.toFixed()` and blanked the
whole result. **Fix:** `setNumericField` skips non-finite values (keeps the form
default). Principle: the AI response is untrusted input — every field it can omit
must degrade gracefully, never crash.

### 4c. Sheet-metal vs plastic is genuinely ambiguous from geometry
A thin uniform wall rules out casting/machining, but does NOT distinguish a steel
STAMPING from a plastic MOULDING — both are thin-wall. The seat cross-member (1.5 mm
uniform steel, formed bead + flanges) was classified as PA6 injection moulding
(£2.84) vs a ~£1.4 steel-stamping manual. There is no reliable geometry-only signal;
the safety nets are the material-ambiguity flag (fires: Plastic 35 g · Aluminium
89 g · Steel 260 g — "assumes plastic") and the material/process override (pin
steel + sheet_metal). Filename terms like "cross member / rail / reinforcement"
hint at structural metal, but that's a weak prior, not a rule.

### 5. Caching gotcha
The analysis cache is SQLite-backed and keyed on **inputs, not prompt content**, so
prompt/normalisation changes didn't invalidate already-analysed parts.
**Fix:** `CAD_PROMPT_VERSION` in the cache key — bump it whenever the prompt or
normalisation logic changes.

### 5b. The self-audit agent — lessons as automated pre-flight checks (Phase 2)
The lessons above were promoted from "things to remember" to a deterministic layer
that runs on EVERY estimate. `engine/should-cost-audit.ts` (`runShouldCostAudit`)
encodes each lesson as a detector that recomputes what the physics/geometry demand
and flags disagreement, ranked by severity, with a bounded correction where safe:
- **machine-undersized** — recompute the required machine via `sizeProcessMachine`;
  flag an under-capacity selection → correction is the sized machine id.
- **thin-hollow-not-cast** — a thin enclosed shell on a large envelope costed as a
  casting/forging (the fuel-tank error).
- **machining-over-envelope** — machine time > 2× the stock-removal ceiling
  (`physicalRemovalCeilingMin`) (the servo-horn over-count).
- **wall-exceeds-bbox / wall-over-measured** — impossible or 3×-too-thick shell wall.
- **weight-geometry-mismatch** — net weight vs measured volume × material density.
- **amort-not-annual** — tooling amortised over a stale default → correction is the
  annual volume.
Wired into the live flow: after every Calculate a "Self-Audit" panel surfaces the
findings at the top of the breakdown with one-click **Apply fix** for the safe
corrections (a rate-library machine id or the amort volume — never a £), and a
"✓ Self-audit" pass chip when clean. The audit *re-derives independently* from the
form + geometry, so it catches a user override or a future regression, not just the
original bug. Golden rule intact — the audit flags and proposes bounded corrections;
it never sets a price. A new commodity added to `SIZE_TIERED_COMMODITIES` inherits
the machine check automatically.

### 5c. Closing the loop — learned calibration + drift, surfaced on every estimate (Phase 3)
The platform already records real PO/quote actuals per **commodity × material × region**
and learns a hierarchical bias correction + conformal band from them
(`calibration.ts`, "Log Actual £"). Phase 3 made that learning **visible and
actionable on every estimate** and added drift detection:
- **`segmentDrift(records, segment)`** — splits a segment's actuals oldest→newest and
  compares the bias of each half; flags when the recent quotes diverge from the older
  ones beyond a threshold (the market moved or the model went stale → re-calibrate).
- **`calibrationCoverage(records)`** — the per-segment coverage map (where the model
  has learned vs where it hasn't).
- The **Self-Audit panel** (Phase 2) now also carries a "Model learning" strip: the
  calibrated status + calibrated figure when the segment has ≥3 actuals, a **⚠ Drift**
  warning when `segmentDrift` fires, and an **Uncalibrated → Log actual £** CTA when
  the segment has no correction yet. So the two agentic layers — deterministic physics
  audit and learned calibration — sit together on the money screen, on every costing.
  Golden rule intact: calibration adjusts the confidence band and shows a *separate*
  calibrated figure; the headline stays the deterministic, defensible number.

## Checklist for the next real part
1. Measure with `cad-geometry-engine.py`; sanity-check volume/weight vs the picture,
   and wall thickness vs `2·V/S`.
2. Run live; check the **classification** (commodity + material family) before the £.
3. Manual bottom-up; compare composition, not just the total (right total for the
   wrong reasons is still wrong).
4. Ask: did the tool trust an AI guess it should have questioned? Is the geometry
   measurement physically plausible? Is the over/under-count visible to the user?
5. Fix at the right depth: a pure, tested engine helper + a UI/report surface + a
   prompt/cache change if the AI reasoning is involved. Bump `CAD_PROMPT_VERSION`.
