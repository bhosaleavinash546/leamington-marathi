# Offline component price catalogue

`calculator/server/data/pcb-component-catalogue.json` — 549 parts and families,
GBP unit prices at the 1k / 10k / 100k / 200k / 300k breaks, AEC-Q grade where the part is
automotive, **a source and a date on every entry**. Built 1 October 2026; extended on 6 October 2026
with 106 distributor-priced automotive parts and annual-volume breaks — see
`component-database-2026-10.md` (method, what is derived, what is still to research).

## Where the numbers come from — be clear about this in a review

| Confidence | Count | Meaning |
|---|---|---|
| `distributor` | 77 | A distributor's published price (Digi-Key, Mouser, LCSC, Farnell/Newark, Arrow, Avnet, RS, TME, Rochester) read from the product page on the date shown. Brokers were disregarded. The 10k and 100k breaks are derived from that price by the franchise curve (10k = 1k × 0.85, 100k = 1k × 0.72). |
| `estimate` | 381 | An engineering estimate at 2025/26 distributor levels. Dated, labelled, and the first thing an import replaces. |

The researched parts: 38 ICs and named parts that move an automotive board —  the radar
MCU (S32R294: Arrow $29, Mouser $30.33, Avnet $27.11, Newark $26.54 at 1k), the
AURIX, S32K, RH850 and STM32H7 families, CAN / CAN-SIC / LIN transceivers
(TJA1044, TJA1051, TJA1462, TCAN1044, MCP2562, ATA6560), Ethernet PHYs (TJA1103,
DP83TC812), safety PMICs and SBCs (TLF35584, TLE9261), flash (W25Q32JW,
W25Q128JV, MT25QL256), power (TPS54560, LMR33630, LM5143, BTS7008, UCC27211,
IPB017N06), analog (INA240, TLV9002), protection (SMBJ33A, PESD1CAN), a power
inductor, a crystal and two sealed automotive connectors (AMPSEAL 23-way,
MX150 12-way) — and, added on the same day, 39 commodity parts: 0402/0603/0805/1206/1210 resistors and MLCCs (Vishay CRCW, Panasonic ERJ, Murata GCM/GRM), a ferrite bead and a C0G, a 2512 shunt, SOT-23 transistors and MOSFETs (BC847, 2N7002, BSS138, IRLML6344, SI2301), small diodes (BAT54S, 1N4148WS, SS34, PMEG4010), an NTC, SMD/radial/hybrid electrolytics (Panasonic EEE-FK, Nichicon UCD, Panasonic EEH-ZC), power inductors (Bourns SRN6045, Würth 744043), crystals and an oscillator (TXC, ECS, Abracon ABM8/ABS07, SiTime), connectors (Molex Micro-Fit and Mini-Fit, JST GH, Hirose DF40, GCT USB-C), two relays (Omron G6K, TE V23086), a chip fuse and an OSRAM LED. `rate-cross-check-2026-10.md` lists what they changed.

What this research changed in the tool's named-part ranges (`IC_PRICE_HINTS`):

| Family | Was | Now | Evidence |
|---|---|---|---|
| S32R29x radar MCU | £22–48 | £18–34 | $26.5–30.3 @1k |
| AURIX TC3xx | £35–130 | £15–60 | TC375 $23.84 @500 |
| AURIX TC2xx | £18–55 | £6–30 | TC234 ≈ $9.5 @1k |
| S32K3xx | £12–45 | £6–20 | S32K344 $14.79 @100 |
| S32K1xx | £4.50–15 | £2.50–9 | S32K144 $5.47–6.20 @1k |
| RH850 | £18–80 | £6–30 | F1KM-S1 $8.73, S4 $11.54 @1k |
| TJA110x Ethernet PHY | £3–9 | £1.20–4 | TJA1103 $1.71 @1k |
| TJA104x CAN | £0.80–2.80 | £0.40–1.20 | TJA1044GT/3Z $0.689 @1k |
| TLF3558x safety PMIC | £3.50–9 | £2–6 | $2.54–3.70 @1k |
| BTS70xx PROFET | £1.20–8 | £0.50–3 | BTS7008 $0.71–1.27 @1k |
| AWR radar SoC | £20–75 | £14–40 | AWR1843 $24.91, AWR2944 $27.9–34.6 |

Most of the old ranges were too high — they had been written for the 2021–22
shortage market. That is the single biggest correction in this update: the named
ICs on a board were being held above distributor prices.

## What the catalogue cannot do

- **TEF810x radar transceivers and MAX2043x PMICs are NDA parts** with no public
  price. They are in the catalogue as estimates (£10–14 and £3.50) and say so.
- Distributor list prices at 1k are above what a Tier-1 pays on contract at 250k.
  The 100k break (×0.72) approximates that; the programme-pricing step applies a
  further contract discount. Neither is a quote.
- Passives, discretes and connectors are priced by class (`pcb-class-pricing.ts`)
  unless the exact part is listed; that is how the industry prices them too.

## How a line uses it

Precedence in `pcb-bom-grounding.ts`: live provider → **catalogue** → named-part
range → function range → class table. A catalogue hit prices the line at the
order quantity (log-linear between the breaks, flat above 100k) and writes the
source on the line (`priceNote`), shown as the **CAT** badge and in the PDF's
"Price basis" column. A `distributor` entry counts as priced; an `estimate` entry
on a line worth £1+ is priced but listed "to verify".

## Keeping it current — without a paid API

```bash
# A distributor cart / quote / "my list" export (Digi-Key, Mouser, Farnell, RS, Arrow):
npx tsx scripts/pcb-catalogue-import.ts quote-2026-10.csv --source "Digi-Key quote 2026-10-14" --write

# With Nexar credentials in .env (OCTOPART_CLIENT_ID / OCTOPART_CLIENT_SECRET):
npx tsx scripts/pcb-catalogue-import.ts --nexar TJA1044GT TCAN1044AVDRQ1 TLF35584QVVS2 --write
```

Every imported line becomes a `distributor` entry with the label and today's
date, replacing an estimate of the same part. Purchasing already produces these
exports when it quotes a BOM; feeding them back in is how the catalogue grows
into a real one at no cost. `tests/pcb-component-catalogue.test.ts` checks the
file's shape, provenance and interpolation on every run.
