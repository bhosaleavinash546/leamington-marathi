# Casting & forging materials — review, October 2026

This follows the extrusion review. It checks two things:

- whether the casting and forging routes cover the material grades industry buys;
- whether a part can actually be costed in the grade it is made of.

It found five defects and 35 missing grades. All are fixed and pinned by `tests/casting-forging-materials.test.ts`.

The real-parts baseline was re-recorded and no recorded cost moved. The new grade question is advisory: a part costs at the same grade as before until the question is answered or the file declares a grade.

## 1. Findings

| # | Finding | Effect | Fix |
|---|---|---|---|
| 1 | **The grade was never asked.** Casting and forging resolved only the family, then priced one representative grade. Every steel forging was 38MnVS6 at £1.15/kg; every cast iron was GJL-250. | A 34CrNiMo6, 316L or Inconel forging could not be costed in its own metal. The steel billet range alone is £0.82–£9.90/kg. | New advisory question **`material.grade`** (`derive/grade.ts`). The representative grade is costed until it is answered. An answered or declared grade carries its own £/kg, its own density into the mass, and its own alloy into the advisor: grey v ductile iron, stainless, superalloy, alloy v carbon steel. |
| 2 | **A grade pinned on the CAD panel was lost.** It reached the rules only as the family its id text suggested. | "Pin & Recalculate" with a grade did not price that grade. | A pinned library id now answers the grade question, and its category names the family (`answersFromContext`). |
| 3 | **Zinc and nickel alloys could not be reached.** The library held Zamak 3/5, ZA-8/27, Inconel 718/625, Waspaloy, Hastelloy and Monel, but no family led to them. | No Zamak die casting or superalloy part could be costed from CAD. | Two families added: **zinc** (casting) and **nickel alloy** (casting and forging). Magnesium is now offered for forging too. Machining data was added for both new families. |
| 4 | **The CAD panel's material list was mislabelled.** For example, "LM25 / A356 (Gravity/Sand)" pointed at wrought 6061 bar. Each forging option pointed at machining bar. "EPDM" pointed at PP, "Silicone" at HDPE, and "GFRP" at an id (`mat-al5052`) that does not exist. | A pinned grade left the form on its first option, so the part was costed in the wrong material. | Casting, cast + machine and forging now list the library's own grades in each form's scope. Composites and rubber use real grades. A test checks every id on every list exists. |
| 5 | **The forging drop-down offered the 30 aluminium extrusion logs.** Its scope `/Billet/` matched "Aluminium Extrusion Billet". | Forging stock could be priced as an extrusion log. | Scope now `^(?!.*Extrusion).*Billet`. |
| 6 | **4340 is priced below 4130.** It is £1.45/kg against £1.60, although 4340 carries 1.8 % Ni. On the same alloy-content method it would be about £1.85. | 4340 forgings under-costed by about £0.40/kg. | **Reported, not changed.** Rates move only through `scripts/rate-refresh.ts` and a dated config. Correct it in the next refresh. |

## 2. Grades added, with rates

Every rate is the library's **sibling grade** plus the change in alloy content, at the 2026-09 refresh's metal prices. This is the same method the refresh uses. Each note shows its own arithmetic.

**Metal prices** ($1.324/£):

| Element | Price | Source |
|---|---|---|
| Cu | £10.77/kg | LME $14,257/t |
| Ni | £12.38/kg | LME $16,388/t |
| Sn | £41.20/kg | LME $54,550/t |
| Zn | £2.91/kg | LME $3,857/t |
| Al | £2.85/kg | $3,772/t |
| Pb | £1.44/kg | LME $1,904.5/t |
| Mg | £1.77/kg | SMM $2,348/t |
| Cr | £1.94/kg | HC ferrochrome $1.13–1.20/lb Cr, cif Europe (Fastmarkets, September 2026) |
| Mo | £59.78/kg | $79.15/kg, 4 September 2026 |
| Mn | £0.83/kg | **ESTIMATE** — no FeMn index |
| Nb | ~£35/kg | **ESTIMATE** |

**Stainless:** cast 316 v 304 uses Aperam's September 2026 alloy surcharges: 316 at €3,788/t against 304 at €2,521/t, so +£1.09/kg.

### Casting — 19 grades

| Grade | £/kg | Built from |
|---|---|---|
| LM6 / EN AC-44100 (AlSi12) | 2.92 | LM25 −4 % Al +5 % Si |
| LM4 / AlSi5Cu3 (secondary) | 2.91 | ADC12 +6 % Al −6 % Si +0.5 % Cu |
| EN AC-51300 (AlMg5, marine) | 3.08 | LM25 +3 % Al −7 % Si +5 % Mg |
| A206 / AlCu4.5MgTi | 3.64 | A357 +1 % Al −7 % Si +4.5 % Cu |
| Zamak 2 / ZL0430 | 3.43 | Zamak 3 −3 % Zn +3 % Cu |
| EN-GJS-450-10 (SSF ductile) | 0.83 | GJS-400 +1.2 % Si |
| Ni-Resist D-2 (EN-GJSA-XNiCr20-2) | 3.15 | GJS-400 +20 % Ni +2 % Cr, less displaced iron |
| EN-GJMB-350-10 (blackheart malleable) | 0.66 | GJL-250 + low-Si charge (estimate) |
| High-Cr white iron (A532 IIIA) | 1.25 | GJL-250 +25 % Cr +0.5 % Mo, less displaced iron |
| G20Mn5 (QT cast steel) | 2.10 | GS-C25 +0.5 % Mn |
| G42CrMo4 (low-alloy cast steel) | 2.24 | GS-C25 +1 % Cr +0.2 % Mo |
| G-X120Mn12 (Hadfield) | 2.20 | GS-C25 +12 % Mn (Mn estimate) |
| CF8M (cast 316) | 6.26 | CF8 + the Aperam 316−304 surcharge |
| CA6NM (13Cr-4Ni) | 4.99 | CF8 −5.5 % Cr −4 % Ni +0.7 % Mo |
| CD4MCuN (duplex) | 6.51 | CF8 +7 % Cr −2.5 % Ni +2 % Mo +3 % Cu |
| Inconel 713C | 43.59 | IN718 +21 % Ni −3 % Nb (Nb estimate) |
| LG2 gunmetal (CuSn5Zn5Pb5) | 11.44 | C905 −3 % Cu −5 % Sn +3 % Zn +5 % Pb |
| AB2 (CuAl10Fe5Ni5) | 9.54 | C905 → Al-bronze content |
| CC754S brass (CuZn39Pb1Al-C) | 7.88 | CZ121 +2 % Cu −1.5 % Pb |

### Forging — 16 grades

| Grade | £/kg | Built from |
|---|---|---|
| C35 / 1035 | 0.85 | 1020 + SBQ extra (estimate) |
| C45 / 1045 / CK45 | 0.86 | 1020 + SBQ extra (estimate) |
| C70S6 (fracture-split con-rods) | 0.92 | 1020 + grade extra (estimate) |
| ASTM A105 (flanges, valves) | 0.84 | 1020 + certification extra (estimate) |
| 30MnVS6 / 46MnVS3 | 1.15 | as 38MnVS6 |
| 42CrMo4 / 4140 | 1.61 | 4130 +0.1 % Cr +0.02 % Mo |
| 34CrNiMo6 | 1.81 | 4130 +0.55 % Cr +1.5 % Ni |
| 18CrNiMo7-6 | 1.87 | 4130 +0.7 % Cr +1.55 % Ni +0.1 % Mo |
| 16MnCr5 | 1.48 | 20MnCr5 −0.1 % Mn −0.2 % Cr |
| 41Cr4 / 5140 | 1.48 | 4130 −0.2 % Mo |
| F22 (2.25Cr-1Mo) | 2.10 | 4130 +1.3 % Cr +0.8 % Mo |
| 420 stainless | 3.64 | 410 +0.5 % Cr |
| 431 stainless | 3.95 | 410 +3.5 % Cr +2 % Ni |
| 2205 duplex (F51) | 6.41 | 316L +5 % Cr −5 % Ni +1 % Mo |
| 2014 aluminium forging | 3.59 | 6082 forge +4.4 % Cu |
| CW307G Al-bronze forging | 10.00 | AB2 + bar premium (as CZ122) |

### Coverage now

| Route | Grades | By family |
|---|---|---|
| Casting | 61 | aluminium 20, cast iron 15, steel and stainless 9, copper 6, zinc 5, magnesium 4, nickel 2. Two of the copper six are machining bar (CZ121, PB1), which share the "Copper Alloy" category — an existing scope overlap. |
| Forging | 45 | alloy steel 12, stainless 8, carbon 6, aluminium 6, nickel 5, titanium 3, microalloyed 2, copper 2, magnesium 1. The 30 extrusion logs are now excluded. |

## 3. How the grade is decided

1. **The engineer** — the grade question, or a grade pinned on the CAD panel.
2. **A material designation declared in the CAD file** — the designer's own STEP property. It is applied as the default, and the basis says so.
3. **The grade read off a drawing or photo** by the identification step, and the part names — a **leaning only**. For example, the modelled hub flange's STEP name "HUB FLANGE FORGING C45" leans C45 but costs 38MnVS6 until answered.

A grade from another family is refused. Aluminium castings list only the alloys of their route: die-cast alloys for HPDC, gravity/sand alloys otherwise.

**Effect on the modelled hub flange forging** (UK, 50,000/yr):

| Grade | Cost |
|---|---|
| 38MnVS6 (default) | £31.76 |
| 42CrMo4 | £35.74 |
| 34CrNiMo6 | £36.78 |
| 316L | £58.41 |
| Inconel 718 | £261.39 |

**Effect on the casting bracket, cast then machined:**

| Grade | Cost |
|---|---|
| GJL-250 (default) | £30.04 |
| GJS-500 | £30.82 |
| Ni-Resist D-2 | £38.66 |
| Zamak 3 | £32.65 |
| CF8M | £57.07 |

**Live browser parity** on the modelled hub flange:

- With 34CrNiMo6 answered, the screen gives £36.78, the same as headless.
- Left to its pre-selected leaning (C45, from the STEP name, confirmed with Apply), the screen gives £30.27. Headless with C45 also gives £30.27.

## 4. Still open

- **Estimates.** The Mn, Nb, SBQ and certification extras, and the malleable charge, are labelled estimates. No 2026 engineering-steel alloy surcharge for 42CrMo4, 34CrNiMo6 or 16MnCr5 was found, so those come from alloy content.
- **Process data.**
  - Titanium castings have no casting alloy family in the advisor.
  - The malleablising anneal is not modelled as a process step.
  - Ni-Resist and high-Cr white iron melt as their base iron.
- **Iron charge.** The library's pig-iron and scrap index has not been refreshed since June 2026; the 2026-09 refresh notes it as not sourced.
- **4340.** Its rate (finding 6) awaits the next refresh.

## Sources

- **Stainless surcharges:** Aperam September 2026 alloy surcharges — 316 €3,788/t (Yieh / Kallanish) and 304 €2,521/t (2026-09 refresh config).
- **Chrome:** Fastmarkets ferro-chrome high carbon, cif Europe, $1.13–1.20/lb Cr, September 2026.
- **Molybdenum:** $79.15/kg, 4 September 2026 (critical-minerals-news / tradingeconomics).
- **Cu, Ni, Sn, Zn, Pb, Al, Mg:** `scripts/rate-refresh/2026-09.json`, each with its source in the config.
