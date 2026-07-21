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

### 4. Report defensibility (make the estimate auditable)
The report now carries: geometry-provenance box, key-assumptions header, a
**per-feature machining audit** (every detected feature with a Costed? flag),
machine-rate derivation note, alloy/spec DFM callout, a "what's excluded" panel, the
part render, and a confidence-driver line. Rates are correctly localised to the
region (verified China machine rates are ~0.55× UK, not a UK rate leaking through).

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
