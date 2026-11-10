# A (the tool) v B (independent reference) — driver decomposition

Conditions: UK, 200,000/yr × 5 yr, EXW, overhead 12 % / margin 8 % on both sides, same rate-book ids. A = `current/*.json` (the tool's headless chain, `costMeasuredPart`); B = `reference/<part>.json` `cost_lines`. Each side is split into the same drivers; Σ drivers = the total on each side (re-added; B's printed totals are rounded to 3 dp, the residual is shown). Gap = A − B; % is of B's total. "AvA" = assumption v assumption (both sides unsourced).

The machining driver is split by probe P10: A re-costed with its fixed per-feature approach allowances zeroed (`ALLOWANCE_MIN`, in memory), then OEE 0.8 → 1 and skilled £27.95 ÷ 0.92 → semi-skilled £24.65 at 100 % (B's basis) analytically; the remainder is feature content, cutting rates, handling and the lathe op.

## Casting_Braket — A £9.98 v B £8.36: gap £1.62 (19.4 %)

- A as recorded (baseline ANSWERS: steel, sand GS-C25 on a DISA line): £9.8108 — not comparable with B (aluminium gravity).
- A re-run with B's answers (material.family aluminium, material.grade mat-lm25, casting.processChoice gravity, casting.heatTreat T6, casting.impressions 2): £9.9790 — used below.
- Same with 1 impression (the tool's default): £10.8382.

| Driver | A £ | B £ | Gap £ | Gap % of B | Cause | Gap id | Who looks right |
|---|---:|---:|---:|---:|---|---|---|
| Metal bought (net of melt loss / incl. bar kerf) | 2.958 | 2.905 | +0.053 | 0.6 | A as-cast 0.965 kg (1.5 mm gravity stock on 8 face rows = 18,166 mm² + 12.7 cm³ drilled holes) + 3 % loss on returns → 0.993 kg; B raw 0.926 kg (ISO 8062 RMA E 1.1 + CT8/4 = 1.55 mm on 4 faces = 7,444 mm²) + 2.5 % dross of poured → 0.975 kg. Same £2.98/kg. | CF-01, CF-02 | B — B uses a size-dependent ISO 8062 allowance on the faces it judges machined; A puts stock on the 8 largest planar areas (CF-01). Neither is checked against a drawing. |
| Scrap credits (swarf, flash, wad, crop) | 0.000 | -0.037 | +0.037 | 0.5 | A credits nothing on a casting (lossIsNotScrap); B credits 0.068 kg swarf at £0.54/kg. | CF-14 | B — Aluminium swarf is sold. |
| Melt / billet-heating energy + foundry indirect (melt-shop fixed, sand, bentonite, sand plant) (AvA) | 0.196 | 0.169 | +0.027 | 0.3 | A: melt + plant electricity kWh on 1.66 kg poured (yield 0.6) at £0.182; B: 600 kWh/t gas melter (StrikoWestofen, sourced) at £0.046 + holding + £20/t melt-shop fixed + treatment on 1.97 kg poured (yield 0.5). | CF-10 | neither — Electric v gas melting is a plant choice; both yields are assumptions. |
| Casting / forge cell (machine + crew, incl. melt crew) (AvA) | 0.759 | 1.125 | -0.366 | -4.4 | A die cycle 3.22 min / 2 impressions (mass / section correlation with cited anchors), crew 0.25, OEE 0.8; B 240 s / 2, crew 0.5 + melt crew 1/6, no OEE. | CF-16 | neither — Die cycle and crew are assumptions on both sides; B's 240 s is ~25 % longer than A's. |
| Primary tooling (die / pattern, maintenance, die change) (AvA) | 0.078 | 0.163 | -0.085 | -1.0 | A gravity die £12,988 (179 toolroom h + 70 kg H13) × 6 sets; B £24,552 (290 h + 260 kg H13 + 2 core pulls) × 6 + £0.03/shot maintenance. | CF-16 | neither — Both toolroom build-ups are judgement; B adds die maintenance A omits. |
| Fettling (AvA) | 0.919 | 0.407 | +0.512 | 6.1 | A 2 min bench fettling at the foundry rate ÷ 0.92 (flat for gravity aluminium, "engineering-typical, not sourced"); B 45 s + band saw. | CF-16 | B — A flat 2 min on a 0.9 kg casting looks high; both unsourced. |
| Heat treatment (AvA) | 0.393 | 0.583 | -0.190 | -2.3 | A T6 station ESTIMATE £0.41/kg (0.948 kWh/kg + operator h/kg + capital £0.0078/kg); B furnace hours (8 h solution + 7 h age) × £15.97/h ÷ 400 kg charge = £0.63/kg. | CF-13 | neither — No toll price on either side; A's capital charge (£0.0078/kg) looks low. |
| Shot blast / descale (AvA) | 0.100 | 0.038 | +0.061 | 0.7 | A £0.10 floor (CostVision heuristic); B 10 min a 150 kg load. | CF-13 | neither — Both unsourced. |
| Inspection and NDT | 0.000 | 0.334 | -0.334 | -4.0 | A none beyond the 0.5-min gauge check inside "deburr"; B visual 12 s + X-ray 1 in 50 + in-process gauging 15 s + CMM audit 1 in 250. | CF-12 | B (partly) — In-process gauging and a CMM audit are normal; an X-ray audit on a non-safety bracket is B's own assumption. |
| Machining — non-cutting time: A fixed per-feature allowances + handling v B per-operation non-cut (AvA) | 1.480 | 0.686 | +0.795 | 9.5 | A: 2.62 min of fixed allowances (0.2 min a face, 0.15 a hole, 0.25 a bore pass, 0.1 blind, 0.1 tap; "engineering-typical, not sourced") + 0.12 min handling / pallet change = 2.74 min; B: 1.50 min non-cut (tool changes, approaches, probing, indexing, pallet change). A at B's OEE / operator basis. A 3.67 min on the HMC (8 faces × (0.2 min + one finish pass) + 6 hole works at 0.15–0.25 min approach + 0.1 blind + tap, pallet change 7.1 s) v B 1.74 min (0.24 cut + 1.50 non-cut over OP10/OP20). | CF-19 (new) | B (more plausible) — Both are assumptions; B builds non-cut per operation from tool changes, approaches, probing and indexing; A adds 9–15 s per feature. Neither is a timed cycle. |
| Machining — cutting time (feature set, passes, cutting data) | 0.475 | 0.108 | +0.367 | 4.4 | A 0.93 min cutting (incl. 2.2 s tool changes and any lathe op) v B 0.24 min, both at B's basis, split by minutes. A faces its 8 largest planar areas (18,166 mm²) with a finish face mill at the catalogue rate; B faces 4 (7,444 mm²) with a PCD mill at vc 1,000 m/min and drills at vc 200 m/min. | CF-01, CF-06 | neither — The face set is not drawing-backed on either side (CF-01); cutting data are sourced on both. |
| Machining — OEE 0.8 on machine time (A) v none (B) (AvA) | 0.066 | 0.000 | +0.066 | 0.8 | A divides machine time by OEE 0.8 (core.ts:247); B applies no availability / performance loss. | CF-16 | A — A dedicated cell still loses availability; B is optimistic. A's 0.8 is unsourced. |
| Machining — operator grade and efficiency (AvA) | 0.063 | 0.000 | +0.063 | 0.8 | A: skilled machinist £27.95 ÷ 0.92 efficiency, 0.5 crew; B: semi-skilled £24.65 at 100 %, 0.5 crew. | CF-16 | neither — A production-cell loader is semi-skilled; a 0.92 efficiency is a plant figure. Both assumptions. |
| Cutting-tool wear | 0.142 | 0.009 | +0.133 | 1.6 | Same rate (tool-wear.aluminium £0.04/min). A charges it on 3.55 "cutting" min — which include the fixed approach allowances; B on 0.24 min of chip-making. | CF-20 (new) | B — Tools do not wear during positioning. |
| Machining setup, fixtures, CNC programming | 0.043 | 0.030 | +0.013 | 0.1 | A 3 hydraulic fixtures (one a machine the capacity implies) + £175 programming; B 2 fixtures (OP10 + OP20). Setup per part equal. | CF-05 | B — B has 2 clampings (OP10/OP20) — the geometry needs them (probe 3); A costs 1. |
| Deburr / wash after machining (AvA) | 0.496 | 0.235 | +0.260 | 3.1 | A 0.5 + 0.004 × faces + 0.5 gauge ≈ 1.1 min ÷ 0.92; B 30 s + £0.03 wash. | CF-16 | neither — Both unsourced. |
| Scrap adjustments (casting-scrap secondary, 1 % machining scrap) | 0.000 | 0.064 | -0.064 | -0.8 | A charges no machining scrap and no secondary spent on rejected castings; B 1 % machining scrap + 6 % casting scrap on fettle/HT/blast. | CF-09 | B — Scrap at machining is real; B's rates are assumptions. |
| Packaging (AvA) | 0.090 | 0.100 | -0.010 | -0.1 | A £0.09 (rule by size); B £0.10 assumption. | — | neither — Both unsourced. |
| Overhead 12 % | 0.980 | 0.818 | +0.162 | 1.9 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Margin 8 % | 0.739 | 0.619 | +0.120 | 1.4 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Rounding (B total printed to 3 dp; 4-dp rounding of the rows) | 0.000 | 0.000 | +0.000 | 0.0 | arithmetic | — | n/a |
| **Total** | **9.979** | **8.357** | **1.622** | **19.4** | | | |

## Part1 — A £13.82 v B £11.87: gap £1.95 (16.4 %)

- A as run before (gravity LM25 T6, 1 impression = the tool default): £14.6049.
- A with B's 2 impressions (casting.impressions 2): £13.8192 — used below.

| Driver | A £ | B £ | Gap £ | Gap % of B | Cause | Gap id | Who looks right |
|---|---:|---:|---:|---:|---|---|---|
| Metal bought (net of melt loss / incl. bar kerf) | 4.132 | 4.392 | -0.260 | -2.2 | A as-cast 1.348 kg (1.5 mm stock) v B 1.399 kg (ISO 8062 for a 270 mm part: RMA E 1.8 + CT8/4 = 2.35 mm on 5 faces + cored-bore stock). | CF-02 | B — ISO 8062 RMA grows with the largest dimension; A keeps 1.5 mm for any gravity casting. |
| Scrap credits (swarf, flash, wad, crop) | 0.000 | -0.136 | +0.136 | 1.1 | A none; B 0.249 kg swarf × £0.54. | CF-14 | B — Swarf is sold. |
| Melt / billet-heating energy + foundry indirect (melt-shop fixed, sand, bentonite, sand plant) (AvA) | 0.274 | 0.255 | +0.019 | 0.2 | As the bracket: A electric melt + plant kWh on 2.32 kg poured; B gas melter + holding + fixed £20/t + treatment on 2.98 kg poured (yield 0.5 v 0.6). | CF-10 | neither — Yield and melt-shop fixed cost are assumptions on both sides. |
| Casting / forge cell (machine + crew, incl. melt crew) (AvA) | 0.891 | 1.265 | -0.374 | -3.1 | A die cycle 3.71 min / 2, crew 0.25; B 270 s / 2, crew 0.5 + 1/6 melt crew. | CF-16 | neither — Assumptions both sides. |
| Primary tooling (die / pattern, maintenance, die change) (AvA) | 0.215 | 0.215 | +0.001 | 0.0 | A die £35,853 × 6; B £33,104 × 6 + maintenance — close. | — | neither — Agree within £0.01. |
| Fettling (AvA) | 0.919 | 0.427 | +0.492 | 4.1 | A 2 min flat; B 45 s. | CF-16 | B — A flat 2 min unsourced. |
| Heat treatment (AvA) | 0.549 | 0.881 | -0.332 | -2.8 | A £0.41/kg station ESTIMATE v B £0.63/kg furnace hours. | CF-13 | neither — No toll price. |
| Shot blast / descale (AvA) | 0.112 | 0.058 | +0.053 | 0.5 | A heuristic throughput; B 10 min / 150 kg. | CF-13 | neither — Both unsourced. |
| Inspection and NDT | 0.000 | 0.334 | -0.334 | -2.8 | A none; B visual + X-ray audit + gauging + CMM. | CF-12 | B (partly) — As the bracket. |
| Machining — non-cutting time: A fixed per-feature allowances + handling v B per-operation non-cut (AvA) | 2.638 | 1.052 | +1.586 | 13.4 | A: 4.55 min of fixed allowances (0.2 min a face, 0.15 a hole, 0.25 a bore pass, 0.1 blind, 0.1 tap; "engineering-typical, not sourced") + 0.12 min handling / pallet change = 4.67 min; B: 2.30 min non-cut (tool changes, approaches, probing, indexing, pallet change). A at B's OEE / operator basis. A 6.02 min v B 3.35 min (1.05 cut + 2.30 non-cut). | CF-19 (new) | B (more plausible) — Both are assumptions; B builds non-cut per operation from tool changes, approaches, probing and indexing; A adds 9–15 s per feature. Neither is a timed cycle. |
| Machining — cutting time (feature set, passes, cutting data) | 0.617 | 0.480 | +0.137 | 1.2 | A 1.35 min cutting (incl. 2.2 s tool changes and any lathe op) v B 1.05 min, both at B's basis, split by minutes. A 14 faces (22,761 mm²) v B 5 faces (11,663 mm²); B also cuts the two 3 mm slits with a saw. | CF-01, CF-06 | neither — As the bracket. |
| Machining — OEE 0.8 on machine time (A) v none (B) (AvA) | 0.092 | 0.000 | +0.092 | 0.8 | A divides machine time by OEE 0.8 (core.ts:247); B applies no availability / performance loss. | CF-16 | A — A dedicated cell still loses availability; B is optimistic. A's 0.8 is unsourced. |
| Machining — operator grade and efficiency (AvA) | 0.070 | 0.000 | +0.070 | 0.6 | A: skilled machinist £27.95 ÷ 0.92 efficiency, 0.5 crew; B: semi-skilled £24.65 at 100 %, 0.5 crew. | CF-16 | neither — A production-cell loader is semi-skilled; a 0.92 efficiency is a plant figure. Both assumptions. |
| Cutting-tool wear | 0.236 | 0.042 | +0.194 | 1.6 | Same £0.04/min; A on 5.9 min incl. allowances, B on 1.05 min. | CF-20 (new) | B — Wear on positioning time. |
| Machining setup, fixtures, CNC programming | 0.067 | 0.045 | +0.022 | 0.2 | A 5 fixtures (4.18 HMCs) in 1 clamping; B 3 fixtures (2 OP10 machines + 1 OP20). | CF-05 | B — Part1 needs ≥ 2 clampings (probe 3). |
| Deburr / wash after machining (AvA) | 0.522 | 0.304 | +0.219 | 1.8 | A ~1.1 min ÷ 0.92; B 40 s + wash. | CF-16 | neither — Both unsourced. |
| Scrap adjustments (casting-scrap secondary, 1 % machining scrap) | 0.000 | 0.092 | -0.092 | -0.8 | A none; B 1 % machining scrap + casting scrap on secondary. | CF-09 | B |
| Packaging (AvA) | 0.100 | 0.120 | -0.020 | -0.2 | A £0.10; B £0.12. | — | neither — Both unsourced. |
| Overhead 12 % | 1.360 | 1.165 | +0.195 | 1.6 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Margin 8 % | 1.024 | 0.879 | +0.144 | 1.2 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Rounding (B total printed to 3 dp; 4-dp rounding of the rows) | 0.000 | 0.000 | +0.001 | 0.0 | arithmetic | — | n/a |
| **Total** | **13.819** | **11.870** | **1.949** | **16.4** | | | |

## PRCR002 — A £25.79 v B £16.20: gap £9.59 (59.2 %)

- Same route and grade (sand, EN-GJS-500-7, DISA-class vertical line). A re-run with casting.processChoice sand + material.grade mat-gjs500 gives the identical £25.7885.
- Impressions differ and cannot be answered on the sand route: A 4 a mould (60 % plate rule), B 2 (assumption). Cores: A band £3.00 (32 undercut faces), B 2 shell cores built up.

| Driver | A £ | B £ | Gap £ | Gap % of B | Cause | Gap id | Who looks right |
|---|---:|---:|---:|---:|---|---|---|
| Metal bought (net of melt loss / incl. bar kerf) | 3.408 | 3.563 | -0.155 | -1.0 | A as-cast 9.084 kg (3.0 mm on 8 face rows + cored bores + 3 mm turning stock on the 226 cm² spindle) + 2 % loss on returns → 9.261 kg × £0.368; B raw 9.278 kg (3.6 mm = RMA F 2.5 + CT10/4 on faces + spindle) + 2 % remelt loss + inoculant £0.10. | CF-02 | B — Size-dependent ISO 8062 allowance; B also prices the inoculant A leaves out. |
| Scrap credits (swarf, flash, wad, crop) | 0.000 | -0.290 | +0.290 | 1.8 | A none; B 1.91 kg swarf × £0.15. | CF-14 | B — Iron borings are sold. |
| Melt / billet-heating energy + foundry indirect (melt-shop fixed, sand, bentonite, sand plant) (AvA) | 2.710 | 3.031 | -0.321 | -2.0 | A: melt + plant electricity (455 kWh/t good, ESTIMATE) + ladle gas + dust on 14.98 kg poured (yield 0.625) + new sand £11/t = £2.71; B: 620 kWh/t (sourced range) on 16.28 kg poured (yield 0.6) + £30/t fixed + sand 5:1 × 5 % + bentonite + £15/t sand plant = £3.03. | CF-10 | neither — B's fixed £/t, sand ratio and bentonite are assumptions; A's plant electricity is a grade-D estimate. |
| Casting / forge cell (machine + crew, incl. melt crew) (AvA) | 0.815 | 0.524 | +0.291 | 1.8 | A DISA line 1/280 moulds/h ÷ 4 impressions (60 % plate rule), crew 3, + melt shop 1.5 operator-h/t (£0.60); B 300 moulds/h × 2 impressions, crew 8 covering melt, pour, cores, shake-out. | CF-16 | neither — A's impressions follow the DISA plate rule (sourced); B's 2 impressions and crew 8 are assumptions; A's melt crew is heavier. |
| Cores | 3.093 | 0.324 | +2.769 | 17.1 | A £3.00 band for "32 undercut faces — complex multi-core" × 1.03; B 2 shell cores Ø30.8 × 100 mm built up (0.224 kg × £0.45/kg + 2 × 10 s shooting). | CF-11 | B — B is a build-up from the cored features; A is an unsourced band keyed to a face count. B's inputs are assumptions too. |
| Primary tooling (die / pattern, maintenance, die change) (AvA) | 0.049 | 0.057 | -0.008 | -0.1 | A pattern £16,483 × 3 sets; B £19,058 × 3 — close. | — | neither — Agree. |
| Fettling (AvA) | 0.437 | 0.357 | +0.080 | 0.5 | Both 40 s on the robot cell; A × reject uplift and OEE 0.8. | — | neither — Same assumption (Malleable Castings time study). |
| Shot blast / descale (AvA) | 0.752 | 0.290 | +0.462 | 2.9 | A 9.08 kg ÷ 600 kg/h × (machine + full operator); B ÷ 1,000 kg/h, crew 0.25. | CF-13 | neither — Both unsourced. |
| Inspection and NDT (AvA) | 0.767 | 0.547 | +0.220 | 1.4 | A MPI 75 s + RT 1 in 50 × £5 (safety-critical); B visual 10 s + MPI 30 s + ultrasonic 8 s + gauging 15 s + CMM audit. | CF-12 | neither — MPI 75 s v 30 s — both assumptions; B adds in-process gauging A lacks. |
| Machining — non-cutting time: A fixed per-feature allowances + handling v B per-operation non-cut (AvA) | 3.183 | 1.637 | +1.546 | 9.6 | A: 4.51 min of fixed allowances (0.2 min a face, 0.15 a hole, 0.25 a bore pass, 0.1 blind, 0.1 tap; "engineering-typical, not sourced") + 1.32 min handling / pallet change = 5.83 min; B: 3.70 min non-cut (tool changes, approaches, probing, indexing, pallet change). A at B's OEE / operator basis. A 12.46 min (HMC faces/holes/bores + lathe spindle 1.72 + lathe load 1.2) v B 8.52 min (4.82 cut + 3.70 non-cut; rough + finish king-pin bores, OP30). | CF-19 (new) | B (more plausible) — Both are assumptions; B builds non-cut per operation from tool changes, approaches, probing and indexing; A adds 9–15 s per feature. Neither is a timed cycle. |
| Machining — cutting time (feature set, passes, cutting data) | 3.117 | 2.131 | +0.986 | 6.1 | A 6.63 min cutting (incl. 2.2 s tool changes and any lathe op) v B 4.82 min, both at B's basis, split by minutes. A includes the lathe spindle op (1.72 min) and one pass per face and bore; B turns the spindle between centres (1.90 min cut) and rough + finish bores the king-pins (OP10 + OP30). | CF-01, CF-06 | B — B's rough + finish bore structure follows stock and tolerance (CF-06). |
| Machining — OEE 0.8 on machine time (A) v none (B) (AvA) | 0.465 | 0.000 | +0.465 | 2.9 | A divides machine time by OEE 0.8 (core.ts:247); B applies no availability / performance loss. | CF-16 | A — A dedicated cell still loses availability; B is optimistic. A's 0.8 is unsourced. |
| Machining — operator grade and efficiency (AvA) | 0.437 | 0.000 | +0.437 | 2.7 | A: skilled machinist £27.95 ÷ 0.92 efficiency, 0.5 crew; B: semi-skilled £24.65 at 100 %, 0.5 crew. | CF-16 | neither — A production-cell loader is semi-skilled; a 0.92 efficiency is a plant figure. Both assumptions. |
| Cutting-tool wear | 1.114 | 0.482 | +0.632 | 3.9 | Same rate (£0.10/min cast iron). A 11.1 "cutting" min incl. allowances; B 4.8 min of chip-making. | CF-20 (new) | B — Wear charged on positioning time. |
| Machining setup, fixtures, CNC programming | 0.107 | 0.091 | +0.016 | 0.1 | A 2 HMC + 1 lathe fixtures; B 3 HMC (OP10) + 3 lathe (OP20) + 2 HMC (OP30) fixtures. | CF-05, CF-08 | B — B sequences OP10 / OP20 (between centres) / OP30 (king-pins from the turned spindle); A has 1 HMC clamping. |
| Deburr / wash after machining (AvA) | 0.544 | 0.265 | +0.279 | 1.7 | A ~1.2 min ÷ 0.92; B 30 s + wash / RP oil. | CF-16 | neither — Both unsourced. |
| Scrap adjustments (casting-scrap secondary, 1 % machining scrap) | 0.000 | 0.158 | -0.158 | -1.0 | A none; B 1 % machining scrap £0.12 + casting scrap on secondary. | CF-09 | B |
| Packaging (AvA) | 0.360 | 0.250 | +0.110 | 0.7 | A £0.36 (size rule); B £0.25. | — | neither — Both unsourced. |
| Overhead 12 % | 2.520 | 1.580 | +0.940 | 5.8 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Margin 8 % | 1.910 | 1.200 | +0.711 | 4.4 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Rounding (B total printed to 3 dp; 4-dp rounding of the rows) | 0.000 | 0.000 | +0.000 | 0.0 | arithmetic | — | n/a |
| **Total** | **25.788** | **16.197** | **9.591** | **59.2** | | | |

## steering_knuckle_RH — A £12.53 v B £9.16: gap £3.37 (36.8 %)

- A as recorded = closed-die forging in 38MnVS6: £18.7363 (route note: B estimates forging at +£5–8 over its £9.16 casting, i.e. £14–17, without costing it).
- A re-run as cast + machine, EN-GJS-400-15 (material.grade mat-gjs400), sand, safety-critical yes: £12.5294 — used below. A still adds its near-net "spindle" lathe op (CF-07).

| Driver | A £ | B £ | Gap £ | Gap % of B | Cause | Gap id | Who looks right |
|---|---:|---:|---:|---:|---|---|---|
| Metal bought (net of melt loss / incl. bar kerf) | 1.083 | 1.064 | +0.019 | 0.2 | A as-cast 3.238 kg (3.0 mm sand stock on its 8 face rows and the cored Ø68 bore, plus turning stock on the 71 cm² "spindle") v B 3.097 kg (3.0 mm, RMA F 2.0 + CT10/4, 9 faces); same £0.328/kg + B inoculant. | CF-07 | B — A adds turning stock for a lathe op the knuckle does not have (CF-07). |
| Scrap credits (swarf, flash, wad, crop) | 0.000 | -0.086 | +0.086 | 0.9 | A none; B 0.57 kg swarf × £0.15. | CF-14 | B |
| Melt / billet-heating energy + foundry indirect (melt-shop fixed, sand, bentonite, sand plant) (AvA) | 0.966 | 1.012 | -0.046 | -0.5 | A £0.97 on 5.34 kg poured; B £1.01 on 5.43 kg poured — close in total, split differently. | CF-10 | neither |
| Casting / forge cell (machine + crew, incl. melt crew) (AvA) | 0.386 | 0.524 | -0.139 | -1.5 | A 5 impressions a mould (plate rule), crew 3 + melt shop 1.5 op-h/t; B 2 impressions, crew 8. | CF-16 | neither — Assumptions both sides. |
| Cores | 0.773 | 0.000 | +0.773 | 8.4 | A £0.75 band for "1 undercut face — a small core or loose piece"; B no core (1 undercut face; bore formed by the mould halves). | CF-11 | B — One undercut face does not justify a core; A's band fires on any count ≥ 1. |
| Primary tooling (die / pattern, maintenance, die change) (AvA) | 0.035 | 0.044 | -0.009 | -0.1 | A £11,639 × 3; B £14,627 × 3. | — | neither — Close. |
| Fettling (AvA) | 0.437 | 0.357 | +0.080 | 0.9 | Both 40 s robot cell. | — | neither — Same assumption. |
| Shot blast / descale (AvA) | 0.268 | 0.097 | +0.172 | 1.9 | A 600 kg/h + full operator; B 1,000 kg/h, crew 0.25. | CF-13 | neither — Both unsourced. |
| Inspection and NDT (AvA) | 0.767 | 0.547 | +0.220 | 2.4 | A MPI 75 s + RT 1/50; B visual + MPI 30 s + US + gauging + CMM. | CF-12 | neither — Both assumptions. |
| Machining — non-cutting time: A fixed per-feature allowances + handling v B per-operation non-cut (AvA) | 2.014 | 1.334 | +0.681 | 7.4 | A: 2.95 min of fixed allowances (0.2 min a face, 0.15 a hole, 0.25 a bore pass, 0.1 blind, 0.1 tap; "engineering-typical, not sourced") + 0.72 min handling / pallet change = 3.67 min; B: 2.92 min non-cut (tool changes, approaches, probing, indexing, pallet change). A at B's OEE / operator basis. A 7.37 min incl. a lathe "spindle" op 0.82 min + load 0.6 min (CF-07) v B 6.70 min (3.78 cut incl. rough + finish faces and an H7 bore, 2.92 non-cut). | CF-19 (new) | B (more plausible) — Both are assumptions; B builds non-cut per operation from tool changes, approaches, probing and indexing; A adds 9–15 s per feature. Neither is a timed cycle. |
| Machining — cutting time (feature set, passes, cutting data) | 1.734 | 1.729 | +0.005 | 0.1 | A 3.70 min cutting (incl. 2.2 s tool changes and any lathe op) v B 3.78 min, both at B's basis, split by minutes. Equal in total, but A's includes a lathe "spindle" op (0.82 min) the knuckle does not have (CF-07); on the HMC A cuts ≈ 2.9 min v B 3.8 min because B roughs + finishes faces and bores the H7 seat (CF-06). | CF-06, CF-07 | B — A adds a lathe op the part does not need and omits B's rough / finish passes. |
| Machining — OEE 0.8 on machine time (A) v none (B) (AvA) | 0.261 | 0.000 | +0.261 | 2.8 | A divides machine time by OEE 0.8 (core.ts:247); B applies no availability / performance loss. | CF-16 | A — A dedicated cell still loses availability; B is optimistic. A's 0.8 is unsourced. |
| Machining — operator grade and efficiency (AvA) | 0.239 | 0.000 | +0.239 | 2.6 | A: skilled machinist £27.95 ÷ 0.92 efficiency, 0.5 crew; B: semi-skilled £24.65 at 100 %, 0.5 crew. | CF-16 | neither — A production-cell loader is semi-skilled; a 0.92 efficiency is a plant figure. Both assumptions. |
| Cutting-tool wear | 0.665 | 0.378 | +0.287 | 3.1 | Same £0.10/min; A 6.6 min incl. allowances and the lathe op; B 3.8 min. | CF-20 (new), CF-07 | B |
| Machining setup, fixtures, CNC programming | 0.078 | 0.090 | -0.012 | -0.1 | A 4 HMC + 1 lathe fixture; B 4 + 2 HMC fixtures (OP10, OP20). | CF-05 | B — B has 2 clampings; the geometry needs ≥ 2 (probe 3). |
| Deburr / wash after machining (AvA) | 0.509 | 0.255 | +0.254 | 2.8 | A ~1.1 min ÷ 0.92; B 30 s + wash. | CF-16 | neither |
| Scrap adjustments (casting-scrap secondary, 1 % machining scrap) | 0.000 | 0.095 | -0.095 | -1.0 | A none; B 1 % machining scrap + casting scrap on secondary. | CF-09 | B |
| Packaging (AvA) | 0.160 | 0.150 | +0.010 | 0.1 | A £0.16; B £0.15. | — | neither |
| Overhead 12 % | 1.226 | 0.893 | +0.333 | 3.6 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Margin 8 % | 0.928 | 0.679 | +0.249 | 2.7 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Rounding (B total printed to 3 dp; 4-dp rounding of the rows) | 0.000 | 0.000 | +0.000 | 0.0 | arithmetic | — | n/a |
| **Total** | **12.529** | **9.161** | **3.368** | **36.8** | | | |

## FORGE_Hub_Flange (MODELLED part) — A £13.37 v B £10.44: gap £2.93 (28.1 %)

- MODELLED part. Both closed-die 38MnVS6, controlled cooled, no heat treatment. A: 1,600 t press, trim 100 t, 2 hits; B: 2,500 t press, trim + pierce 400 t, takt 7.5 s. A answers safetyCritical "no" → no MPI; B charges 100 % MPI (an assumption for a wheel-end part) — the tool offers the answer, not changed so A stays as recorded.

| Driver | A £ | B £ | Gap £ | Gap % of B | Cause | Gap id | Who looks right |
|---|---:|---:|---:|---:|---|---|---|
| Metal bought (net of melt loss / incl. bar kerf) | 5.638 | 4.788 | +0.851 | 8.2 | A billet = as-forged 3.185 kg ÷ 0.675 (unsourced band; 25.7 % of the billet "scale, crop, wad" not itemised) = 4.716 kg + kerf → 4.903 kg bar; B billet 3.947 kg = raw 3.425 + flash 0.348 (20 × 3 mm land, assumption) + wad 0.145 + scale 0.75 % + excess 3 % → 4.10 kg bar. Same £1.15/kg. | CF-04 | B — B itemises every loss term; A's yield band is unsourced and constant. B's flash land, scale % and excess are still assumptions. Note A's as-forged weight is LOWER (3.185 v 3.425 kg) — B adds EN 10243-1 minus tolerance and 3°/5° drafts; it is A's billet ratio (1.48 v 1.15) that drives the gap. |
| Scrap credits (swarf, flash, wad, crop) | -0.331 | -0.390 | +0.059 | 0.6 | A credits flash + un-itemised loss + kerf (1.65 kg × £0.20) but no swarf; B credits flash, wad, kerf, crop (0.71 kg) and 1.24 kg swarf, not scale. | CF-14, CF-04 | B — Scale is not recoverable; swarf is. |
| Melt / billet-heating energy + foundry indirect (melt-shop fixed, sand, bentonite, sand plant) | 0.350 | 0.292 | +0.059 | 0.6 | Same 0.4 kWh/kg (SMS Elotherm); A heats a 4.72 kg billet, B 3.95 kg. | CF-04 | B — Consequence of the billet mass. |
| Casting / forge cell (machine + crew, incl. melt crew) (AvA) | 0.875 | 0.662 | +0.213 | 2.0 | A 1,600 t press, takt 3 s + 2 hits × 4 s = 11 s, crew 2 + trim 1, OEE 0.8; B 2,500 t press, takt 7.5 s, crew 3, no OEE. | CF-16 | neither — Takt and crew unsourced on both sides; A picks a smaller press, B a faster takt. |
| Primary tooling (die / pattern, maintenance, die change) (AvA) | 0.531 | 0.603 | -0.072 | -0.7 | A die set £25,447 ÷ 47,955 forgings (fractional); B insert pairs by life + holder + die change £0.06. | CF-16 | neither — Both build-ups are judgement. |
| Shot blast / descale (AvA) | 0.390 | 0.089 | +0.300 | 2.9 | A £0.12/kg × forging (unsourced); B 1,200 kg/h blast. | CF-13 | B — A's £/kg is ~4× B's build-up; neither sourced. |
| Inspection and NDT | 0.000 | 0.362 | -0.362 | -3.5 | A none (safety-critical answered "no" in ANSWERS); B 100 % MPI 25 s (its assumption for a wheel-end part) £0.22 + gauging + CMM £0.14. | CF-12 (gauging / CMM); MPI = a route choice | B (gauging / CMM) — The MPI is an answer difference, not method: the modelled part is stated not safety-critical. |
| Machining — non-cutting time: A fixed per-feature allowances + handling v B per-operation non-cut (AvA) | 1.317 | 0.694 | +0.624 | 6.0 | A: 1.15 min of fixed allowances (0.2 min a face, 0.15 a hole, 0.25 a bore pass, 0.1 blind, 0.1 tap; "engineering-typical, not sourced") + 1.20 min handling / pallet change = 2.35 min; B: 1.72 min non-cut (tool changes, approaches, probing, indexing, pallet change). A at B's OEE / operator basis. A 4.11 min (lathe op10/op20 1.45 + 1 load 0.6; holes + Ø60 bore on a 5-axis 1.46 + load 0.6) v B 4.08 min (two lathe chuckings + VMC drilling). | CF-19 (new) | B (more plausible) — Both are assumptions; B builds non-cut per operation from tool changes, approaches, probing and indexing; A adds 9–15 s per feature. Neither is a timed cycle. |
| Machining — cutting time (feature set, passes, cutting data) | 0.911 | 0.955 | -0.044 | -0.4 | A 1.76 min cutting (incl. 2.2 s tool changes and any lathe op) v B 2.36 min, both at B's basis, split by minutes. A turns outside + faces in one lathe op (1.45 min) and drills / bores on a 5-axis; B turns op 10 and op 20 (2.07 min cut) and drills on a VMC. | CF-06, CF-07 | B — B's op 10 / op 20 structure holds the bore-to-OD datum (CF-08). |
| Machining — OEE 0.8 on machine time (A) v none (B) (AvA) | 0.169 | 0.000 | +0.169 | 1.6 | A divides machine time by OEE 0.8 (core.ts:247); B applies no availability / performance loss. | CF-16 | A — A dedicated cell still loses availability; B is optimistic. A's 0.8 is unsourced. |
| Machining — operator grade and efficiency (AvA) | 0.199 | 0.000 | +0.199 | 1.9 | A: skilled machinist £27.95 ÷ 0.92 efficiency, 0.5 crew; B: semi-skilled £24.65 at 100 %, 0.5 crew. | CF-16 | neither — A production-cell loader is semi-skilled; a 0.92 efficiency is a plant figure. Both assumptions. |
| Cutting-tool wear | 0.349 | 0.284 | +0.066 | 0.6 | Same £0.12/min; A 2.9 min incl. allowances; B 2.36 min. | CF-20 (new) | B |
| Machining setup, fixtures, CNC programming | 0.029 | 0.048 | -0.019 | -0.2 | A lathe fixture + 1 5-axis fixture; B 2 + 2 soft-jaw sets + 1 VMC fixture + jaw replacement. | CF-08 | B — B turns op 10 / op 20 in two chuckings; A charges one. |
| Deburr / wash after machining | 0.464 | 0.050 | +0.413 | 4.0 | A ~1.04 min ÷ 0.92; B wash only (chamfers in OP30). | CF-16 | A — B charges no deburr of 6 drilled holes — optimistic. |
| Scrap adjustments (casting-scrap secondary, 1 % machining scrap) | 0.000 | 0.083 | -0.083 | -0.8 | A none; B 1 % machining scrap. | CF-09 | B |
| Packaging (AvA) | 0.180 | 0.120 | +0.060 | 0.6 | A £0.18; B £0.12. | — | neither |
| Overhead 12 % | 1.307 | 1.022 | +0.285 | 2.7 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Margin 8 % | 0.990 | 0.773 | +0.217 | 2.1 | Same rate on both sides (12 % of the factory base; 8 % of the subtotal incl. packaging) — the gap is the rate × the other gaps. | follows | n/a |
| Rounding (B total printed to 3 dp; 4-dp rounding of the rows) | 0.000 | 0.000 | +0.000 | 0.0 | arithmetic | — | n/a |
| **Total** | **13.368** | **10.435** | **2.933** | **28.1** | | | |


## Systematic causes across the five parts (Σ gap £19.46; pre-overhead except the last cause)

| Cause | Bracket | Part1 | PRCR002 | Knuckle (cast) | Hub (modelled) | All |
|---|---:|---:|---:|---:|---:|---:|
| Non-cutting time: A's fixed per-feature allowances + handling v B's per-operation non-cut (CF-19) | +0.79 | +1.59 | +1.55 | +0.68 | +0.62 | **+5.23** |
| Secondary-operation constants: cores, fettling, blast, deburr, heat treatment (CF-11, CF-13, CF-16) | +0.64 | +0.43 | +3.59 | +1.28 | +0.71 | **+6.66** |
| Machining OEE 0.8 and skilled operator ÷ 0.92 v B's semi-skilled at 100 % (CF-16) | +0.13 | +0.16 | +0.90 | +0.50 | +0.37 | **+2.06** |
| Tool wear charged on minutes that include the allowances (CF-20) | +0.13 | +0.19 | +0.63 | +0.29 | +0.07 | **+1.31** |
| Material balance, scrap credits, melt / heating energy (CF-02, CF-04, CF-10, CF-14) | +0.12 | −0.11 | −0.19 | +0.06 | +0.97 | **+0.85** |
| Cutting time: feature set, passes, cutting data, lathe op (CF-01, CF-06, CF-07) | +0.37 | +0.14 | +0.99 | +0.01 | −0.04 | **+1.45** |
| Inspection and scrap provisions only B carries (CF-12, CF-09) | −0.40 | −0.43 | +0.06 | +0.12 | −0.45 | **−1.08** |
| Casting / forge cell, primary tooling, fixtures, packaging, rounding | −0.45 | −0.37 | +0.41 | −0.15 | +0.18 | **−0.38** |
| Overhead 12 % and margin 8 % on all of the above (same rates both sides) | +0.28 | +0.34 | +1.65 | +0.58 | +0.50 | **+3.36** |
| **Total A − B** | **+1.62** | **+1.95** | **+9.59** | **+3.37** | **+2.93** | **+19.46** |

Reading: the machining driver is split by minutes at B's basis (OEE 1, semi-skilled £24.65 at 100 %): non-cutting time (A's fixed per-feature allowances — £8.94 of A's cost in total — plus its handling, v B's per-operation non-cut) and cutting time. A's non-cut is 2.35–5.83 min a part v B's 1.50–3.70 min; A's cutting minutes are above B's on the bracket, Part1 and PRCR002 (larger face set; the lathe op) and equal or below on the knuckle and hub (B's rough + finish passes).

**Correction (10 Nov 2026):** an earlier version of this file compared A's cut + handling with B's cut + non-cut and concluded "A cuts less than B on all five parts (−£2.26)". That comparison mixed non-cut into B's side; with both sides split by minutes the cutting-time difference is +£1.45 and the non-cutting difference +£5.23.

## Where B looks wrong or optimistic

- No OEE anywhere in B (casting cells, press and machining at 100 %).
- Bracket machining 1.74 min with 0.24 min cutting; B's non-cut values (tool change 3 s, approach 2 s, probe 12 s, index 2 s) are its own assumptions, swung ×0.7 / ×1.4 in its range. B machines 4 faces, A 8; neither is drawing-backed.
- Foundry inputs are assumptions: 60 % ductile-iron yield, melt-shop fixed £30/t, sand plant £15/t, bentonite £0.01/kg, sand 5 : 1, crew 8.
- X-ray audits on non-safety aluminium parts; 100 % MPI on a hub flange stated not safety-critical (£0.22, a route choice).
- Hub flange: no deburr of 6 drilled holes. CT8 assumed for permanent mould; EN 10243-1 tolerance estimated (table not read).
- Die and pattern costs are toolroom-hour judgements on both sides.
