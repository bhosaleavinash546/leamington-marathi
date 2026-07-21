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
(Remaining calibration: the blow moulder is picked as a small 1–5 L bottle EBM, not
a large accumulator-head tank machine — the same "press not sized to the part"
pattern fixed for the IM bumper; and multi-layer barrier HDPE + flash aren't
modelled, so material is ~£11 vs a ~£15–20 real coex tank.)

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
