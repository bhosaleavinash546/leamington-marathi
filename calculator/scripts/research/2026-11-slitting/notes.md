# Slitting-saw cutting data — sourced research (5 Nov 2026)

Scope: Part1 review phase 3, item 4. The costing found two 3 mm clamp slits on Part1 (geometric DFM, `slits.ts`) and could
not time them: the cutting catalogue (`src/engine/cutting-catalogue.ts`) had no slitting-saw row. Every figure used is in
`data.json` (row, URL, date read, exact quote). Pages were read with plain HTTPS fetches; nothing behind a bot check was
read and no check was bypassed.

## 1. What was read and used

| Source | What it gives | Used for |
|---|---|---|
| ZPS-FN a.s. (Czech maker of HSS cutters) — product pages "Metal slitting saws, type W, DIN 1838, HSS" and "type H, DIN 1837, HSS" (`zps-fn.cz/en/saws/...`) | Cutting conditions by ISO material group: vc (m/min) and fz (mm/tooth) — P.1, P.2, P.4 steels, K.1 cast iron ≤ 240 HB, N.1 aluminium (Si ≤ 6 %), N.2 cast Al (Si ≤ 12 %); every body D × S × d × Z | vc, fz, teeth, diameter — all four per material |
| ZPS-FN Ø80 × 3 type W single-product page | the same table and the Ø80 × 3 body (Z 40) | cross-check of the family table |

How the costing reads them (`CATALOGUE[*].slit` in cutting-catalogue.ts):

- **Material row**: steel → P.4 heat treatable steels ≤ 900 N/mm² (the steel catalogue row is the C45 / 42CrMo4 class);
  cast iron → K.1 (≤ 240 HB, which holds GJS-500); aluminium → N.1 (Si ≤ 6 %, the slower of the two aluminium rows —
  the family covers wrought and cast; N.2 cast Al-Si ≤ 12 % is 120–200 m/min).
- **The point in the range**: the MIDDLE of the maker's vc and fz range (the maker gives a range, not a point; the
  middle is the costing's choice — engineering-typical, not sourced, printed so).
- **Saw type**: W (coarse) for steel and aluminium, H (fine) for cast iron — the maker's own guidance by chip form.
- **Teeth**: the listed body at the slit's width (2 / 2.5 / 3 mm; a narrower slit takes the 2 mm row, stated).
- **Diameter**: the smallest listed (Ø63 / 80 / 100) whose radius less an arbor collar reaches the slit's length. The
  collar Ø (2 × the saw's bore) is an ASSUMPTION — engineering-typical, not sourced.

## 2. What was NOT obtained (and therefore not used)

- **Sandvik CoroMill 331**: the Sandvik Main Catalogue (D) Milling 2006 extract (Directools copy) gives bodies (Ø80–315,
  width ≥ 6 mm) and an fz range 0.05–0.40 mm but no vc table; the 2017 CoroMill 331 cutting-data sheet on a distributor
  (ludwigmeister.de) returned HTTP 410; the 2019 flyer gives one stainless customer case only. Widths ≥ 6 mm do not cut a 3 mm slit anyway.
- **ISCAR** (SGSF / TGSF slitting cutters): the catalogue pages sit behind a bot check (HTTP 403 "Just a moment…") — not
  read, not bypassed. The ISCAR T290-05 insert sheet that is readable is a Ø8–16 slot mill, not a slitting saw.
- **Mitsubishi, Kennametal**: no slitting-saw cutting-data page found in the time (searches returned face / end mills
  and T-slot cutters only).
- **Carbide saws**: KYOCERA SGS's general table (`data.json` last row) gives carbide-saw speeds (cast Al 640–1615 m/min,
  grey iron 35–145 m/min) but no fz and no teeth — kept as a cross-check only. It shows the HSS figures used are the
  slow end of what a production cell could run.

## 3. The time model (`slitMinutes`, cutting-catalogue.ts)

n = 1000·vc / (π·D); vf = n·Z·fz (the makers' milling formulas, as the other rows). The saw is fed along the slit's root
(through the depth it crosses) at full radial depth = the slit's length; it travels depth + its entry chord √(ae·(D − ae))
+ 2 × 5 mm clearance (the face-milling clearance, ASSUMED). Minutes = travel ÷ vf, one approach a slit; one tool change
(2.2 s, the catalogue's chip-to-chip) for the operation. Part1 (LM25 → aluminium N.1, Ø100 × 3 W Z 40, vc 125, fz 0.05):
n 397.9 rev/min, vf 795.8 mm/min; travel 35 + √(20 × 80) + 10 = 85 mm → 0.107 min a slit; 2 slits + one tool change
= 0.25 min.
