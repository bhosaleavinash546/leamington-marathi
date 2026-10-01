# Bare-board and assembly rates — cross-check against published 2026 figures

1 October 2026. The PCB country rate table (`server/data/pcb-country-rates.ts`)
was checked against what fabricators and EMS guides publish for 2026. Figures
below are from web search of those pages (the sites themselves are not reachable
from the build environment); they are indicative, not quotes. **No rate was
changed on this evidence** — the rates live in the table and move only through
`scripts/pcb-rate-refresh.ts` with a dated config; this note says where the
table sits against the public numbers so a reviewer can argue with it.

## Bare board (China)

| Item | Published 2026 | Tool (China table) | Verdict |
|---|---|---|---|
| 8-layer, 100 × 100 mm, 1,000 pcs | $9–14 per board (RayPCB, AtlasPCB, King Sun) | — | prototype/low-volume band; not the tool's case |
| 8-layer mass production | $100–150 /m² = $1.0–1.5 /dm² (King Sun) — this is the bare laminate-and-process figure, before finish, vias, impedance | base 2L £0.116 + 6 × £0.0738 = £0.56 /dm², × panel waste 1.30 = £0.73 /dm² (= $0.94) | **in band, low end** |
| Radar board, 0.43 dm², 8L, immersion silver, 220 vias, impedance, 250k | — | commercial £0.82 (= £1.91 /dm²); with automotive grade £2.06 (= £4.8 /dm²) | plausible for an IATF fab at volume; the automotive premium is what lifts it from a consumer price to an automotive one |
| ENIG over HASL | +20 to +40 % (AllPCB, AtlasPCB, DX Circuit) | ×1.22 | **matches** |
| Controlled impedance | +15–30 % (±10 %: ×1.15–1.2; ±5 % with TDR: ×1.25–1.35) (King Sun, WellPCB) | +18 % | **matches** |
| High-Tg FR4 | +15–25 % over standard FR4 (King Sun, PCBSync) | automotive laminate premium 40 % × 50 % (8L) = +20 % | **matches** |
| 2 oz copper | +$20–40 /m² (King Sun) | 25 CNY /m² per layer per ½ oz ≈ $3.5 /m² per layer → 8 layers ≈ $28 /m² | **matches** |

What the tool does **not** model that the guides mention: small-batch surcharges
(+20–40 % below ~500 pcs) — irrelevant at programme volume — and TDR coupon
testing per batch ($25–60), which the automotive fab premium covers per panel.

## Assembly (China)

| Item | Published 2026 | Tool (China table) | Verdict |
|---|---|---|---|
| SMT machine placement, volume | $0.001–0.02 per placement (RapidDirect, RayPCB); passives $0.001–0.01 | £11.6/h ÷ 3,600 = £0.0032 (= $0.004) per placement | **in band** |
| BGA handling | +$0.10–0.50 per part + X-ray | X-ray £1.27 per board flat when a BGA is present | **in band** for 1–2 BGAs |
| "All-in" per component, China EMS | $0.01–0.05 (incl. AOI, test); one guide quotes $0.235 (small volume, loaded) | radar board: (£0.72 SMT + £4.27 AOI/X-ray/ICT) ÷ 222 = £0.023 (= $0.029) | **in band** |
| Through-hole, wave | $0.02–0.05 per joint | £0.0095 (= $0.012) per joint | low end; few TH joints on these boards |

## Assembly (UK)

The UK column on the radar run came out at £27.76 assembly per board (vs China
£5.03). The published UK EMS figures are not stated per placement; the gap is
driven by the UK table's flat AOI / X-ray / ICT per-board costs at a UK labour
rate. It is plausible for low volume and high for 250k/yr, where test is
amortised. **Flagged, not changed**: the UK assembly flat costs need one UK EMS
quote at volume before they move.

## Components (summary; detail in `component-catalogue.md`)

| Family | Published, at the break shown | Tool class range (AEC) | Change made |
|---|---|---|---|
| 0402 resistor AEC | $0.0064 @5k (Vishay CRCW) | £0.003–0.012 | estimate 0.0035 → 0.0045 |
| 0402 100 nF AEC | $0.006–0.0087 @10k (Murata GCM) | £0.005–0.025 | floor 0.008 → 0.005 |
| 0603 1 µF AEC | $0.030 @28k | £0.012–0.06 | floor 0.015 → 0.012 |
| 0805 10 µF AEC | $0.113–0.124 @10k | £0.03–0.5 | estimate 0.045 → 0.092; floor raised |
| SOT-23 discretes | BC847 $0.017–0.023, 2N7002 AEC $0.025–0.049, BSS138 $0.045–0.06 @3k | £0.03–0.12 | floor 0.05 → 0.03 |
| Electrolytic 100 µF / 100 V | $1.04 @1k (Nichicon UCD) | £0.2–1.2 | **ceiling 0.60 → 0.90** — the first cap was too tight |
| Chip fuse 0603 | $0.32–0.37 @1–4k (Littelfuse) | £0.15–0.6 | estimate 0.035 → 0.26 |
| Signal relay | $0.61–3.18 @1k (Omron G6K) | £0.8–3.5 | range raised |
| 0603 LED (OSRAM) | $0.10–0.14 @3k | £0.05–0.25 | estimate 0.018 → 0.09 |
| Crystals 3225 | $0.16–0.46 @1–3k | £0.2–0.8 | range raised |
| USB-C receptacle | $0.545–0.572 @1k | — | estimate 0.28 → 0.43 |

Two honest reversals in there: the electrolytic ceiling and the chip-fuse price
were set too low on 29 Sep; the research corrected them upward.
