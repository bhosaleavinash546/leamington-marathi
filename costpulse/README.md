# CostPulse

Local, deterministic cost-analysis agent for should-cost / cost-improvement
engineering (automotive, ICE + EV powertrain). Drop in a messy BoM, quote
summary, or cost breakdown (Excel/CSV) and get an auditable analysis, a
narrative summary, and a self-contained interactive dashboard.

**Architectural law: every number shown to the user comes from deterministic
Python computation (pandas/numpy/scipy) — never from LLM inference.**

```
Excel/CSV → ingestion → cleaning & normalisation → deterministic analysis
engine → insights.json (all numbers) → LLM narrative layer (words only,
figures quoted verbatim) → dashboard (renders only from insights.json)
```

## 5-minute quick start

```bash
# 1. Dependencies (Python 3.11+)
pip install pandas numpy openpyxl scipy pyyaml pyarrow

# 2. Try it on the bundled synthetic messy file
cd costpulse
python tests/make_synthetic.py tests/data/synthetic_messy.xlsx
python costpulse.py analyse tests/data/synthetic_messy.xlsx

# 3. Open the outputs
ls output/<run-id>/
#   insights.json    — every computed figure, with provenance & caveats
#   summary.md       — narrative ([Computed]/[Interpretation] tagged)
#   dashboard.html   — self-contained interactive dashboard (works offline)
#   audit_log.txt    — every transformation, row dropped, check failed
#   dataset.parquet  — the normalised dataset the dashboard binds to
```

Then run it on your own file:

```bash
python costpulse.py analyse path/to/your_bom.xlsx
```

### Mixed currencies

If a file mixes currencies (e.g. one column quoted in EUR), CostPulse
**refuses cross-currency aggregation** unless you provide a rate table:

```yaml
# rates.yaml — units of base currency (default GBP) per 1 unit
EUR: 0.85
USD: 0.79
```

```bash
python costpulse.py analyse quotes.xlsx --currency-rates rates.yaml
```

### Two time periods / quote rounds (cost walk)

```bash
python costpulse.py analyse new_quotes.xlsx --compare old_quotes.xlsx
```

### Narrative via LLM

Set `ANTHROPIC_API_KEY` to get an LLM-written summary. A post-generation
validator extracts every number from the narrative and verifies it exists in
`insights.json` verbatim; orphan figures trigger regeneration (max 2 retries)
and then a deterministic template fallback. Without a key, the template
narrative is used — same figures, plainer prose.

## Column mapping

Messy headers ("P/N", "Qty/yr (EAU)", "Piece Price", "Weight (g)") map to a
canonical schema via `config/schema_map.yaml`. If a column of yours doesn't
map, the run report tells you — add your header to the synonym list rather
than renaming your files. Analyses the data can't support are skipped with an
explicit reason (e.g. "No annual_volume column mapped → spend Pareto
skipped"), never estimated.

## Data quality gate

The profiler checks: negative costs, zero-cost parts with mass, unit-cost
outliers vs commodity peers (IQR), breakdown integrity
(material+process+labour+overhead+SG&A ≈ unit_cost ±2%), and duplicate part
numbers with conflicting costs. A 0–100 trust score is computed; **below 60
the pipeline stops** and the audit log names the exact failing rows.

## Project layout

```
costpulse/
├── costpulse.py            # CLI entry point
├── ingestion/loader.py     # multi-sheet Excel/CSV, header-row auto-detect
├── ingestion/normaliser.py # header mapping, units, currency, subtotals
├── profiling/profiler.py   # data-quality checks + trust score
├── engine/analyses.py      # all deterministic analyses
├── engine/insights.py      # ranking & packaging → insights.json
├── narrative/generator.py  # LLM narrative + number validator + fallback
├── dashboard/builder.py    # injects JSON into the HTML template
├── dashboard/template.html # Plotly dashboard shell
├── config/schema_map.yaml  # column synonym dictionary — extend freely
└── tests/                  # unit tests with hand-calculated expectations
```

## Tests

```bash
python -m pytest tests/
```

Every analysis test states its expected values hand-calculated in comments,
so the engine is verified against independent arithmetic.
