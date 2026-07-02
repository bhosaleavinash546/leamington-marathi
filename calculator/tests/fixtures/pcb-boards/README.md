# PCB vision accuracy fixtures

Drop labelled boards here to turn the PCB Image-to-Cost accuracy from an
*assertion* into a *measured number* (Rec #4).

## How to add a board

For each board, add two files:

- `myboard.image.jpg` — the PCB photo (top, and ideally bottom + angled views)
- `myboard.truth.json` — the hand-verified ground-truth BOM:

```json
{
  "board": "Acme Motor Controller rev C",
  "widthMm": 80, "heightMm": 60, "layers": 4,
  "bom": [
    { "refDes": "U1", "partNumber": "STM32F407VGT6", "componentType": "MCU",   "unitPriceGBP": 5.10, "qty": 1 },
    { "refDes": "U2", "partNumber": "TJA1051T",       "componentType": "CAN PHY", "unitPriceGBP": 0.62, "qty": 1 },
    { "refDes": "C1", "partNumber": "GRM188R61A106",  "componentType": "MLCC",  "unitPriceGBP": 0.013, "qty": 8 }
  ]
}
```

`partNumber`, `unitPriceGBP` and `qty` are optional but enable the part-number-
accuracy, price-MAPE and total-cost-error metrics respectively.

## How it scores

`scoreBom(predicted, truth)` (in `server/utils/pcb-vision-accuracy.ts`) matches
components by reference designator and reports:

| Metric | Meaning |
|---|---|
| `componentPrecision` | of detected components, fraction that are real (catches hallucinations/duplicates) |
| `componentRecall` | of real components, fraction detected (catches misses) |
| `componentF1` | harmonic mean of the two |
| `partNumberAccuracy` | of matched components, fraction with the correct MPN |
| `priceMAPE` | mean absolute % price error on matched priced items |
| `totalCostError` | error on the headline board cost |

Use `aggregateScores([...])` to macro-average across the whole fixture set and
track the numbers release-over-release.

## Running against the live pipeline

The unit tests in `pcb-vision-accuracy.test.ts` verify the *scoring* with
synthetic data (no network). To measure the *live* model you also need a running
server with an `ANTHROPIC_API_KEY`; POST each fixture image to
`/api/pcb/analyze-image`, then `scoreBom(response.analysis.bom, truth.bom)`.
That step is intentionally not in CI (it costs API calls and is non-hermetic).
