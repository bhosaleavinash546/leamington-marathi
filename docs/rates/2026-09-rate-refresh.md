# Rate refresh — September 2026

Library **2.2.0**, rates as of **29 September 2026** (was 2.1.0, 16 June 2026).
Applied by `calculator/scripts/rate-refresh.ts` from `calculator/scripts/rate-refresh/2026-09.json`,
which holds every number below with its source. Re-running it changes nothing; the
next refresh is a new config file.

## How the rates moved — in one line each

- **Materials**: a price moves by what the material *contains* — kg of commodity per
  kg × the change in that commodity's £/kg (FX included). Mill, alloy and small-lot
  premiums are held. Example: DC01 +£0.049/kg = 1 kg of cold-rolled coil, €781→€835/t.
- **Floor**: nothing may cost less than the metal it contains. Five grades were below
  that at today's prices and are floored there (see *Check these*).
- **Labour**: £/hr × one quarter of local wage growth × the exchange-rate move since 30 June.
- **Machines**: every build-up rebuilt — depreciation × machinery PPI, maintenance ×
  ½PPI+½wages, energy × electricity tariff, floor space × rent, support × wages,
  finance × cost of capital.
- **Energy**: UK and EU gas carry the wholesale move; UK power too. Regulated tariffs
  (Korea, Vietnam, Thailand, Turkey) unchanged in local currency; FX only.
- **IDs**: none changed. 328 materials, 178 machines, 42 labour grades.

## Per country (all 20)

| Country | £ per local unit (was → now) | Skilled £/hr | Semi-skilled £/hr | Engineer £/hr | Electricity £/kWh | Gas £/kWh | Local wage growth used |
|---|---|---|---|---|---|---|---|
| United Kingdom | — | 26.00 → 26.19 (+0.7%) | 19.80 → 19.94 | 42.50 → 42.80 | 0.23 → 0.268 | 0.04 → 0.067 | 0.72% |
| Germany | 1.16 → 1.165 EUR | 40.50 → 40.77 (+0.7%) | 32.00 → 32.21 | 65.00 → 65.43 | 0.2 → 0.199 | 0.047 → 0.068 | 1.01% |
| France | 1.16 → 1.165 EUR | 30.00 → 30.07 (+0.2%) | 23.00 → 23.05 | 48.00 → 48.11 | 0.16 → 0.159 | 0.07 → 0.091 | 0.57% |
| Italy | 1.16 → 1.165 EUR | 24.00 → 24.08 (+0.3%) | 18.00 → 18.06 | 42.00 → 42.14 | 0.26 → 0.259 | 0.09 → 0.111 | 0.67% |
| Spain | 1.16 → 1.165 EUR | 19.00 → 19.08 (+0.4%) | 14.50 → 14.56 | 34.00 → 34.13 | 0.19 → 0.189 | 0.07 → 0.091 | 0.74% |
| Poland | 5.05 → 5.096 PLN | 12.00 → 11.90 (-0.8%) | 9.00 → 8.92 | 20.00 → 19.83 | 0.14 → 0.137 | 0.06 → 0.08 | 1.44% |
| Czech Republic | 29.5 → 28.43 CZK | 13.00 → 13.08 (+0.6%) | 10.00 → 10.06 | 22.00 → 22.13 | 0.13 → 0.129 | 0.05 → 0.07 | 1.56% |
| Romania | 5.8 → 6.151 RON | 7.50 → 7.45 (-0.7%) | 5.80 → 5.76 | 13.00 → 12.92 | 0.11 → 0.109 | 0.05 → 0.07 | 0.45% |
| Hungary | 450 → 428.2 HUF | 9.50 → 9.30 (-2.1%) | 7.50 → 7.34 | 17.00 → 16.63 | 0.12 → 0.115 | 0.05 → 0.069 | 1.82% |
| Sweden | 13.8 → 13.21 SEK | 40.00 → 39.31 (-1.7%) | 32.00 → 31.45 | 62.00 → 60.93 | 0.09 → 0.088 | 0.04 → 0.06 | 0.79% |
| Netherlands | 1.16 → 1.165 EUR | 34.00 → 34.13 (+0.4%) | 27.00 → 27.10 | 52.00 → 52.19 | 0.22 → 0.219 | 0.08 → 0.101 | 0.72% |
| Turkey | 42 → 64.86 TRY | 6.50 → 6.62 (+1.8%) | 5.00 → 5.09 | 12.00 → 12.22 | 0.09 → 0.086 | 0.04 → 0.038 | 7.00% |
| China | 9.05 → 8.88 CNY | 7.90 → 8.08 (+2.3%) | 5.50 → 5.62 | 18.00 → 18.40 | 0.07 → 0.071 | 0.03 → 0.03 | 0.98% |
| India | 109.5 → 127.2 INR | 5.10 → 5.14 (+0.8%) | 3.50 → 3.52 | 12.00 → 12.08 | 0.07 → 0.069 | 0.03 → 0.03 | 2.30% |
| Mexico | 25.5 → 23.84 MXN | 7.50 → 7.39 (-1.5%) | 5.80 → 5.71 | 12.00 → 11.82 | 0.08 → 0.078 | 0.04 → 0.039 | 1.44% |
| United States | 1.27 → 1.324 USD | 34.00 → 34.25 (+0.7%) | 26.00 → 26.19 | 58.00 → 58.43 | 0.1 → 0.1 | 0.04 → 0.04 | 0.81% |
| Thailand | 45.5 → 44.52 THB | 5.80 → 5.74 (-1.0%) | 4.20 → 4.15 | 10.00 → 9.89 | 0.08 → 0.079 | 0.04 → 0.04 | 0.00% |
| Vietnam | 33800 → 34350 VND | 3.80 → 3.92 (+3.2%) | 2.80 → 2.89 | 7.50 → 7.73 | 0.06 → 0.061 | 0.03 → 0.03 | 1.73% |
| Brazil | 6.85 → 6.916 BRL | 8.50 → 8.44 (-0.7%) | 6.50 → 6.45 | 16.00 → 15.88 | 0.11 → 0.109 | 0.05 → 0.05 | 0.00% |
| South Korea | 1790 → 1798 KRW | 22.00 → 25.44 (+15.6%) | 17.00 → 19.66 | 38.00 → 43.94 | 0.13 → 0.148 | 0.06 → 0.068 | 1.44% |


The biggest mover is **South Korea (+15.6%)** — the won strengthened from about 1,559 to
1,360 per US dollar between June and 29 September (semiconductor export surge), so the
same Korean wage costs more in pounds. **Turkey and India** had been stored at stale
exchange rates (42 and 109.5 per £; now 64.9 and 127.2) — corrected; the £ rates were
June benchmarks, so they move by the June→September FX change, not the stale gap.

## Commodity indices used

| Index | Old → now (source units) | £/kg (old → now) | Source |
|---|---|---|---|
| al | 3698 → 3772 USD per t | £2.910 → £2.849 (-2.1%) | old: library anchor LME Al 3M $3,398/t + EU duty-paid premium ~$300/t at USD→GBP 0.787 (rate-library PRICING BASIS). now: LME Al cash $3,238.83/t 29 Sep 2026 (tradingeconomics.com/commodity/aluminum) + Rotterdam duty-paid premium $533/t 23 Sep 2026 (CRU). |
| cu | 13322 → 14257 USD per t | £10.070 → £10.768 (+6.9%) | old: LME Cu 3M close 29 Jun 2026 $13,322/t. now: LME Cu average 28 Aug–28 Sep 2026 €12,550/t (topcable.com/metalprices) × EUR/USD 1.136 = $14,257/t. |
| zn | 2750 → 3857 USD per t | £2.164 → £2.913 (+34.6%) | old: library anchor LME Zn ~$2,750/t at 0.787 (a 2025 level — June 2026 traded $3,435–3,641/t, so zinc alloys were under-priced). now: LME Zn $3,856.85/t 29 Sep 2026. |
| ni | 16275 → 16388 USD per t | £12.302 → £12.378 (+0.6%) | old: LME Ni cash 30 Jun 2026 $16,275/t. now: LME Ni September 2026 month-to-date average $16,388/t. |
| sn | 50553 → 54550 USD per t | £38.211 → £41.201 (+7.8%) | LME Sn 26 Jun 2026 $50,553/t → 25 Sep 2026 $54,550/t. |
| pb | 1907.5 → 1904.5 USD per t | £1.442 → £1.438 (-0.2%) | LME Pb 26 Jun 2026 $1,907.5/t → 29 Sep 2026 $1,904.5/t. |
| mg | 2505 → 2348 USD per t | £1.972 → £1.773 (-10.0%) | old: library anchor SMM Mg ~$2,505/t at 0.787. now: SMM Fugu 99.9% Mg ingot 15,700–15,800 CNY/t late Sep 2026 (news.metal.com) ÷ CNY/USD 6.708 = $2,348/t. |
| ti | 7141 → 6606 USD per t | £5.398 → £4.989 (-7.6%) | SMM grade-0 Ti sponge: 48,000–49,000 CNY/t on 1 Jul 2026 ÷ 6.792 = $7,141/t → $6,606/t on 4 Sep 2026 (metal.com). |
| hrc | 691 → 745 EUR per t | £0.591 → £0.639 (+8.2%) | old: library anchor Fastmarkets EU HRC €691/t end-May 2026 at EUR→GBP 0.855. now: Fastmarkets HRC index domestic exw Northern Europe €745/t 28 Sep 2026 (eurometal.net). |
| crc | 781 → 835 EUR per t | £0.668 → £0.717 (+7.3%) | CRC = HRC + €90/t, the library's own spread (anchor €691+90 at 0.855 → €745+90 on 28 Sep 2026). |
| hdg | 781 → 835 EUR per t | £0.668 → £0.717 (+7.3%) | No public HDG index found; coated sheet moves with its CRC substrate (coating extra held). |
| ss_sur | 2365 → 2521 EUR per t | £2.037 → £2.164 (+6.2%) | Aperam European alloy surcharge, 304 (1.4301): €2,365/t June 2026 (ChemAnalyst) → €2,521/t September 2026 (Aperam). Same mill both ends; Outokumpu Sep: €2,192/t. |
| nr | 2245 → 2562 USD per t | £1.697 → £1.935 (+14.0%) | Natural rubber TSR20: 224.5 US c/kg 10 Jun 2026 → 256.2 US c/kg 28 Sep 2026 (tradingeconomics.com). |
| ethylene | 1167.5 → 970 EUR per t | £1.006 → £0.833 (-17.2%) | European ethylene contract (FD NWE): Sep 2026 €970/t (−€40, polymers.com.ua/polymerupdate); Aug +€42.5; Jul −€200 ⇒ June €1,167.5/t. Polyethylene contract prices follow the monomer settlement. |
| propylene | 1000 → 865 EUR per t | £0.861 → £0.742 (-13.8%) | European propylene contract: Jul 2026 −€190/t, Aug +€55/t (ChemOrbis, ecoplasticsinpackaging). September not found — June→August change used. Level nominal (only the change is sourced). |
| styrene | 1500 → 1379 EUR per t | £1.292 → £1.184 (-8.4%) | European styrene reference contract: Jul 2026 −€270/t, Aug +€149/t (ecoplasticsinpackaging). September not found — June→August change used. Level nominal (only the change is sourced). |
| pvc | 525.375 → 436.5 EUR per t | £0.453 → £0.375 (-17.2%) | PVC moves with its ethylene content (~0.45 kg ethylene per kg PVC; the chlorine share is not indexed). |
| abs | 900 → 827.4 EUR per t | £0.775 → £0.710 (-8.4%) | ABS/SAN/ASA move with their styrene content (~0.6 kg per kg; acrylonitrile/butadiene not indexed). |
| pp | 1118.4 → 1150 EUR per t | £0.960 → £0.987 (+2.8%) | Re-anchored to the market level: old = the library's reference grade mat-pp-homo £0.96/kg (what this family was priced on); now = PlasticPortal/myCEPPI weekly polymer prices, Central & Eastern Europe delivered, week 36/2026: PPH IM €1,150/t, HDPE film €1,220/t, LDPE film €1,266/t, GPPS €1,595/t (plasticportal.eu/price-reports). Each grade keeps its premium over the reference. |
| hdpe | 1234.9 → 1220 EUR per t | £1.060 → £1.047 (-1.2%) | Re-anchored to the market level: old = the library's reference grade mat-hdpe £1.06/kg (what this family was priced on); now = PlasticPortal/myCEPPI weekly polymer prices, Central & Eastern Europe delivered, week 36/2026: PPH IM €1,150/t, HDPE film €1,220/t, LDPE film €1,266/t, GPPS €1,595/t (plasticportal.eu/price-reports). Each grade keeps its premium over the reference. |
| ldpe | 1013.6 → 1266 EUR per t | £0.870 → £1.087 (+24.9%) | Re-anchored to the market level: old = the library's reference grade mat-ldpe £0.87/kg (what this family was priced on); now = PlasticPortal/myCEPPI weekly polymer prices, Central & Eastern Europe delivered, week 36/2026: PPH IM €1,150/t, HDPE film €1,220/t, LDPE film €1,266/t, GPPS €1,595/t (plasticportal.eu/price-reports). Each grade keeps its premium over the reference. |
| lldpe | 1083.5 → 1220 EUR per t | £0.930 → £1.047 (+12.6%) | Re-anchored to the market level: old = the library's reference grade mat-lldpe £0.93/kg (what this family was priced on); now = PlasticPortal/myCEPPI weekly polymer prices, Central & Eastern Europe delivered, week 36/2026: PPH IM €1,150/t, HDPE film €1,220/t, LDPE film €1,266/t, GPPS €1,595/t (plasticportal.eu/price-reports). No LLDPE quote — HDPE film level used. Each grade keeps its premium over the reference. |
| gpps | 1165 → 1595 EUR per t | £1.000 → £1.369 (+36.9%) | Re-anchored to the market level: old = the library's reference grade mat-gpps £1.0/kg (what this family was priced on); now = PlasticPortal/myCEPPI weekly polymer prices, Central & Eastern Europe delivered, week 36/2026: PPH IM €1,150/t, HDPE film €1,220/t, LDPE film €1,266/t, GPPS €1,595/t (plasticportal.eu/price-reports). Each grade keeps its premium over the reference. |
| hips | 1130 → 1595 EUR per t | £0.970 → £1.369 (+41.2%) | Re-anchored to the market level: old = the library's reference grade mat-hips £0.97/kg (what this family was priced on); now = PlasticPortal/myCEPPI weekly polymer prices, Central & Eastern Europe delivered, week 36/2026: PPH IM €1,150/t, HDPE film €1,220/t, LDPE film €1,266/t, GPPS €1,595/t (plasticportal.eu/price-reports). No HIPS quote — GPPS level used. Each grade keeps its premium over the reference. |

FX: fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api).

Machine drivers: depreciation: ONS PPI basic metals/fabricated metal/machinery +4.9% y/y Jul 2026 → ~1.2% a quarter; maintenance: half PPI, half wages; energy: UK tariff 0.23→0.268; floor: Cushman & Wakefield UK industrial rents +3.9% y/y Q2 2026, one quarter; indirect: ONS AWE manufacturing +2.9% y/y, one quarter; finance: Bank Rate 3.75% unchanged (BoE MPC Jun and Sep 2026).

## Held — no sourced June→September move

These indices were paywalled or unpublished, so the materials that depend only on them
are **unchanged** and their notes say so: bar, butadiene, carbonblack, cf, co, coatings, crno, epdm, epoxy, fecr, gf, mo, nbr, pa6, pa66, pbt, pc, pet, pigiron, pmma, pom, pps, sbr, scrap, si, silicone, tio2, tpu, upr.
That covers cast iron (pig iron, scrap), electrical steel, PET, engineering resins
(PC, PA, POM, PBT, PMMA), synthetic rubbers, composites, and paint. Carbon/alloy bar is
held on purpose — Kallanish reported wire rod flat from June to September.

## Check these (floored at their metal content)

- Phosphor bronze PB1 and C905 — tin is $54,550/t; they were priced below their copper+tin.
- C110 copper sheet and CZ108 brass — below their copper(+zinc) value at $14,257/t Cu.
- A319 casting alloy — below its aluminium+copper content.

Get a supplier quote for these; the floor is a minimum, not an estimate of the premium.

## What moved on the pinned parts

| Part | Before | After |
|---|---|---|
| Reference machined bracket | £24.34 | £24.79 |
| Casting bracket | £37.61 | £38.53 |
| PRCR002 housing | £52.67 | £53.38 |
| Part1 (machined) | £38.93 | £39.07 |
| Seat locking bracket | £4.96 | £5.00 |
| Steering knuckle (forged) | £32.16 | £32.75 |
| Spur gear m3 z38 | £25.50 | £26.18 |
| Painted reference part | £4.5936 | £4.6583 |

No route changed. Engine arithmetic still matches the hand calculation to <0.01%.

## Caveat

Most figures were read from search-result summaries because the source pages
could not be opened from the build environment; each is cited to its page. FX is
from dated daily snapshots. Treat the commodity moves as index-grade, and replace any
of them with JLR's own rate card through the Rate Converter when it is available.
