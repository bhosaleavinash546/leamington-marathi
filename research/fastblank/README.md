# Developed-blank solver — research prototype

Research for bringing FASTBLANK-style blank development into CostVision.
**Not shipped code.** Python + numpy/scipy, which the Windows package does not
carry; the recommendation is to port the solver to TypeScript (see below).

## What it does

STEP → OCCT solid → skin faces (two-hit ray test) → welded mesh → longest-edge
refinement → hole filling → Tutte embedding → ARAP flatten → optional one-step
inverse on plastic work (von Mises, incompressible, Hencky strain, n = 1).

## What it showed

| case | result |
|---|---|
| L-bracket, r2 t2, one hole (developable) | mid-surface blank **+0.001%** vs hand calc, zero strain |
| Drawn cup Ø80×50, t2, punch r8 | inverse blank **+0.62%** vs area equivalence, mesh-converged 8 → 3.5 mm |
| Same cup, geometry only (no physics) | blank ~13% short — geometry alone is wrong for drawn parts |
| Seat Locking Bracket (real STEP) | outline 490 cm², rectangle 282×210; two skins agree within 0.2–0.7% |
| Seat bracket cut length | 954 mm outline + 985 mm piercing vs 1,012 mm used by the tool |
| L-blank nesting | 2-up interlocked 94.6% utilisation vs 71.7% rectangle 1-up |

## Known gaps

- Strain map not trustworthy on the real bracket: degenerate triangles from
  refinement; needs mesh cleanup before it can be a formability plot.
- Inverse pass too slow on 60k-element real meshes in L-BFGS; needs a Newton
  solver with a proper injectivity barrier.
- Bend neutral axis at K = 0.5 (mid-surface); real K is 0.3–0.45 for bends.
- BUMPER in cad-audit is a PP moulding, not a stamping — not a blank case.

## Reproduce

    python -m venv venv && venv/bin/pip install cadquery-ocp-novtk==7.9.3.1.1 numpy scipy pillow
    venv/bin/python validate.py      # L-bracket + cup
    venv/bin/python cup2.py          # convergence study
    venv/bin/python nest.py          # strip nesting
    venv/bin/python arapstats.py     # seat bracket (needs cad-audit/parts)
