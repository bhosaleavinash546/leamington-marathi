# PCB board set — measuring the Image-to-BOM tool

Two kinds of file, per board. Nothing here is ever tuned to: a board is a measurement, not a target.

## 1. `<board>.board.json` — the tool's figure against the price paid (EDU v6, Nov 2026)

```json
{
  "board": "name / revision",
  "analysis": { "file": "e2e/fixtures/pcb-camera-replies.json", "kind": "replies", "useBomImage": true },
  "country": "cn", "annualVolume": 250000, "domain": "automotive_adas", "asil": "Unknown",
  "pricePaid": { "gbp": 17.00, "basis": "delivered-uk", "date": "2026-10-06", "source": "who paid it, to whom, on what terms" },
  "reference": { "gbp": 150.56, "basis": "ex-works", "kind": "manual should-cost — NOT a price paid", "source": "" }
}
```

- `analysis` is a STORED reading: a model-replies fixture (`kind: replies`, as `e2e/fixtures/`) or the analysis the screen
  held after the engineer's edits (`kind: analysis` — save it from a live run's `reprice.json`). Photos are not stored here
  (customer hardware); keep them with the board's owner.
- `pricePaid.basis`: `delivered-uk` (the tool's headline) or `ex-works` (headline less freight and duty). Say who the
  seller is — a Tier-1 or distributor margin sits inside a price paid.
- `reference` is printed beside the tool but never counts as accuracy.

`npm run accuracy:pcb` runs every board through Stage 4 (no model, no network) and prints the error per board, MAPE and
bias over the boards with a price paid. Below five prices paid the verdict is "insufficient".

## 2. `<board>.truth.json` — counting against the real BOM

The real BOM from the schematic / BOM file — never from the photo (`truth.template.json`). With it, the board is also scored
for counting: part-count error (Σ predicted qty ÷ Σ true qty − 1), designator recall / precision and part-number accuracy
(`server/utils/pcb-vision-accuracy.ts`). `tests/pcb-golden-boards.test.ts` scores `<board>.truth.json` against a saved
`<board>.prediction.json`.

## What to add first

Boards your team has bought, with the price paid and its terms, and the real BOM: five or more turn "insufficient" into a
measured MAPE and bias. The camera board (£17.00 delivered) is the only price paid today.
