# Casting grade gap review (Oct 2026)

**Question:** are we missing casting grades?

**Answer:** yes — 11 common automotive grades. They are now in the library, priced in all 39 countries, offered by the grade question and the picker, and recognised when a CAD file declares them. The review also found and fixed two workflow bugs.

Tests: `tests/casting-grade-gap.test.ts`. The real-parts baseline did not move: the grade stays advisory, and no recorded part is CGI.

## 1. What was missing

The library held 59 casting grades. Checking them against what automotive and general-engineering foundries pour, these were absent:

| Grade | Where it is used | Why it matters |
|---|---|---|
| **EN AC-46200** (AlSi8Cu3) | Gravity / low-pressure cylinder heads, housings | The workhorse European secondary gravity alloy; only LM4 (AlSi5Cu3) was close |
| **EN AC-45300** (AlSi5Cu1Mg, C355) | Cylinder heads, T6 | Heads could only be costed as A356 |
| **LM13 / EN AC-48000** (AlSi12CuNiMg) | Pistons | No piston alloy at all |
| **EN-GJL-150** | Covers, bases, counterweights | The lowest grey grade; the ladder started at GJL-200 |
| **EN-GJS-350-22-LT** | Wind hubs, impact-tested parts | No low-temperature ductile grade |
| **EN-GJS-500-14** (SSF) | Knuckles, carriers (replacing GJS-500-7) | Only the SSF 450-10 was stocked |
| **EN-GJV-500** | High-output diesel blocks and heads | Only CGI 450 |
| **Ni-Resist D-5S** (EN-GJSA-XNiSiCr35-5-2) | Turbo housings, exhaust manifolds | No high-temperature Ni-Resist |
| **ASTM A216 WCB** | Valve bodies, pump casings | The standard US valve steel |
| **GX40CrNiSi25-20 / 1.4848** (EN 10295) | Petrol turbo housings, manifolds | No heat-resistant cast steel |
| **CC483K / CuSn12-C** | Worm wheels, gear rims | No gear bronze |

## 2. Prices (UK, £/kg, 2026-09 basis)

Each grade is its library **sibling** plus the change in alloy content, at the 2026-09 refresh's metal prices. This is the method the casting & forging review used, and each grade's note shows its arithmetic.

**Metal prices used:**
- Al £2.85
- Si £1.00
- Cu £10.77
- Ni £12.38
- Mg £1.77
- Cr £1.94
- Sn £41.20
- Zn £2.91

| Grade | £/kg | Built from |
|---|---:|---|
| EN AC-46200 | 2.85 | LM4 £2.91 −3 % Al +3 % Si |
| EN AC-45300 | 3.11 | LM25 £2.98 −2 % Si +1.2 % Cu +0.15 % Mg +0.65 % Al |
| LM13 | 3.08 | LM6 £2.92 +1 % Cu +1 % Ni +1 % Mg −3 % Al |
| EN-GJL-150 | 0.56 | GJL-200 £0.60 − one ladder step (**estimate**) |
| EN-GJS-350-22-LT | 0.87 | GJS-400 £0.82 + high-purity, low-Mn charge and anneal (**estimate**, +£0.05) |
| EN-GJS-500-14 | 0.84 | GJS-450-10 £0.83 +0.6 % Si |
| EN-GJV-500 | 1.15 | GJV-450 £1.12 +0.3 % Cu (pearlite promoter) |
| Ni-Resist D-5S | 4.89 | D-2 £3.15 +15 % Ni +3 % Si − iron displaced (18 % of £0.82) |
| ASTM A216 WCB | 2.10 | GS-C25 £2.10 — the same chemistry class, priced equal |
| GX40CrNiSi25-20 / 1.4848 | 6.65 | CF8 £5.17 +6 % Cr +11 % Ni |
| CuSn12-C | 14.43 | C905 £13.66 +2 % Sn −2 % Zn |

## 3. Every country

A metal grade is priced per country by the same rule as every other library metal (`buildRegionalLibrary`):

- **Iron and steel** (including stainless and Ni-Resist) move by the country's `materialMultiplier`.
- **Aluminium and copper alloys** (exchange-traded) move by its near-flat exchange factor.

The table below is generated from the engine, not typed. `tests/casting-grade-gap.test.ts` §3 checks every grade in every country.

| Country | AC-46200 | AC-45300 | LM13 | GJL-150 | GJS-350-LT | GJS-500-14 | GJV-500 | Ni-Resist D-5S | WCB | 1.4848 | CuSn12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| United Kingdom (UK) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Germany (DE) | 2.87 | 3.13 | 3.10 | 0.58 | 0.90 | 0.87 | 1.18 | 5.04 | 2.16 | 6.85 | 14.55 |
| France (FR) | 2.86 | 3.13 | 3.10 | 0.57 | 0.89 | 0.86 | 1.17 | 4.99 | 2.14 | 6.78 | 14.50 |
| Italy (IT) | 2.86 | 3.13 | 3.10 | 0.57 | 0.89 | 0.86 | 1.17 | 4.99 | 2.14 | 6.78 | 14.50 |
| Spain (ES) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Poland (PL) | 2.83 | 3.09 | 3.06 | 0.54 | 0.84 | 0.81 | 1.12 | 4.74 | 2.04 | 6.45 | 14.33 |
| Czech Republic (CZ) | 2.83 | 3.09 | 3.06 | 0.54 | 0.84 | 0.81 | 1.12 | 4.74 | 2.04 | 6.45 | 14.33 |
| Romania (RO) | 2.82 | 3.08 | 3.05 | 0.54 | 0.84 | 0.81 | 1.10 | 4.69 | 2.02 | 6.38 | 14.29 |
| Hungary (HU) | 2.83 | 3.09 | 3.06 | 0.54 | 0.84 | 0.81 | 1.12 | 4.74 | 2.04 | 6.45 | 14.33 |
| Sweden (SE) | 2.88 | 3.14 | 3.11 | 0.58 | 0.90 | 0.87 | 1.20 | 5.09 | 2.18 | 6.92 | 14.57 |
| Netherlands (NL) | 2.86 | 3.13 | 3.10 | 0.57 | 0.89 | 0.86 | 1.17 | 4.99 | 2.14 | 6.78 | 14.50 |
| Turkey (TR) | 2.78 | 3.03 | 3.00 | 0.50 | 0.78 | 0.76 | 1.03 | 4.40 | 1.89 | 5.99 | 14.07 |
| China (CN) | 2.76 | 3.02 | 2.99 | 0.46 | 0.72 | 0.70 | 0.95 | 4.06 | 1.74 | 5.52 | 14.00 |
| India (IN) | 2.78 | 3.03 | 3.00 | 0.50 | 0.77 | 0.75 | 1.02 | 4.35 | 1.87 | 5.92 | 14.07 |
| Mexico (MX) | 2.82 | 3.07 | 3.04 | 0.53 | 0.83 | 0.80 | 1.09 | 4.65 | 1.99 | 6.32 | 14.26 |
| United States (US) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Thailand (TH) | 2.80 | 3.06 | 3.03 | 0.52 | 0.81 | 0.78 | 1.07 | 4.55 | 1.95 | 6.18 | 14.18 |
| Vietnam (VN) | 2.81 | 3.06 | 3.03 | 0.53 | 0.82 | 0.79 | 1.08 | 4.60 | 1.97 | 6.25 | 14.21 |
| Brazil (BR) | 2.86 | 3.13 | 3.10 | 0.57 | 0.89 | 0.86 | 1.17 | 4.99 | 2.14 | 6.78 | 14.50 |
| South Korea (KR) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Austria (AT) | 2.87 | 3.13 | 3.10 | 0.58 | 0.90 | 0.87 | 1.18 | 5.04 | 2.16 | 6.85 | 14.55 |
| Belgium (BE) | 2.86 | 3.13 | 3.10 | 0.57 | 0.89 | 0.86 | 1.17 | 4.99 | 2.14 | 6.78 | 14.50 |
| Portugal (PT) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Slovakia (SK) | 2.83 | 3.09 | 3.06 | 0.54 | 0.84 | 0.81 | 1.12 | 4.74 | 2.04 | 6.45 | 14.33 |
| Slovenia (SI) | 2.83 | 3.09 | 3.06 | 0.54 | 0.84 | 0.81 | 1.12 | 4.74 | 2.04 | 6.45 | 14.33 |
| Lithuania (LT) | 2.83 | 3.09 | 3.06 | 0.54 | 0.84 | 0.81 | 1.12 | 4.74 | 2.04 | 6.45 | 14.33 |
| Bulgaria (BG) | 2.82 | 3.08 | 3.05 | 0.54 | 0.84 | 0.81 | 1.10 | 4.69 | 2.02 | 6.38 | 14.29 |
| Serbia (RS) | 2.82 | 3.08 | 3.05 | 0.54 | 0.84 | 0.81 | 1.10 | 4.69 | 2.02 | 6.38 | 14.29 |
| Morocco (MA) | 2.78 | 3.03 | 3.00 | 0.50 | 0.78 | 0.76 | 1.03 | 4.40 | 1.89 | 5.99 | 14.07 |
| Tunisia (TN) | 2.78 | 3.03 | 3.00 | 0.50 | 0.78 | 0.76 | 1.03 | 4.40 | 1.89 | 5.99 | 14.07 |
| Egypt (EG) | 2.78 | 3.03 | 3.00 | 0.50 | 0.78 | 0.76 | 1.03 | 4.40 | 1.89 | 5.99 | 14.07 |
| South Africa (ZA) | 2.86 | 3.13 | 3.10 | 0.57 | 0.89 | 0.86 | 1.17 | 4.99 | 2.14 | 6.78 | 14.50 |
| Japan (JP) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Taiwan (TW) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Malaysia (MY) | 2.80 | 3.06 | 3.03 | 0.52 | 0.81 | 0.78 | 1.07 | 4.55 | 1.95 | 6.18 | 14.18 |
| Indonesia (ID) | 2.80 | 3.06 | 3.03 | 0.52 | 0.81 | 0.78 | 1.07 | 4.55 | 1.95 | 6.18 | 14.18 |
| Philippines (PH) | 2.81 | 3.06 | 3.03 | 0.53 | 0.82 | 0.79 | 1.08 | 4.60 | 1.97 | 6.25 | 14.21 |
| Singapore (SG) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |
| Canada (CA) | 2.85 | 3.11 | 3.08 | 0.56 | 0.87 | 0.84 | 1.15 | 4.89 | 2.10 | 6.65 | 14.43 |

## 4. Workflow changes

| Where | Change |
|---|---|
| `rate-library.ts` | The `CASTING_GAP_GRADES` block, 11 grades with their arithmetic notes. |
| `casting-material-taxonomy.ts` | All 11 filed in the picker. New standards: **ASTM A216 (valves, pressure parts)** and **Heat-resistant — EN 10295 (GX…)**. |
| Grade question (`derive/grade.ts`) | Offered automatically by category. The gravity alloys are not offered on HPDC. |
| **Bug fixed — declared designations** | Grade names were matched on keys of at most 3 tokens. "EN-GJS-500-7" therefore tied with the new "EN-GJS-500-14" on "en gjs 500", and the cheaper grade won. Keys now run to 4 tokens, so the full designation wins. A bare "GJS-500" goes to the base grade, 500-7. |
| **Bug fixed — CGI had no melt data** | `castingAlloyOf` did not recognise "Compacted Graphite Iron". **EN-GJV-450 was costed with no melt loss, no melt energy and no advisor alloy.** CGI is now treated as ductile iron, its nearest family: Mg-treated, poured the same way. |
| `CAD_PROMPT_VERSION` | 51, because the grade question options and CGI melt changed. |
| Safety-critical check | GJL-150 is grey iron, so it is flagged brittle on a safety-critical part, like every GJL grade. |

## 5. Still open (reported, not changed)

- **Rate refresh:**
  - These 11 grades fall under the refresh config's catch-all rule and are **held** at their 2026-09 price. So are the 19 grades from the casting & forging review.
  - The next refresh config should give them alloy drivers instead. For example:
    - LM13: al 0.85, si 0.12, cu 0.01, ni 0.01;
    - D-5S: ni 0.35, pigiron, scrap;
    - 1.4848: ss_sur plus ni;
    - CuSn12: cu 0.88, sn 0.12.
  - I did not add them to the September config, because re-running it would apply the June→September deltas to prices already at September.
- **Ni-Resist by country:** Ni-Resist (D-2 and D-5S, 20–35 % Ni) is categorised as ductile iron, so it moves with each country's steel factor. Its nickel is exchange-traded and near-flat. The spread is therefore overstated where steel is cheap:
  - D-5S is £4.06 in China (−17 %) and £4.35 in India (−11 %), against £4.89 in the UK and £5.04 in Germany;
  - yet about £4.40 of the £4.89 is alloy (35 % Ni alone is £4.33), which costs much the same everywhere.

  Classing the Ni-Resist grades as exchange metal, or splitting the alloy from the iron, would correct this. That changes D-2 too, so it belongs in the next rate refresh.
- **Estimates:** the GJL-150 ladder step and the GJS-350-22-LT charge premium are estimates, labelled and set to Low confidence.
- **Not added:**
  - Titanium castings (Ti-6Al-4V investment cast) need a titanium casting route and advisor family. That is a build, not a grade.
  - High-carbon brake-disc grey iron (GJL-HC with Cr/Mo) needs a sourced chemistry.
