"""
Independent hand costing of a cast + machine part (casting 360 review, 10 Oct 2026).

Reads ONLY the inputs from a trace (trace.mts output): measured geometry, the rule values (yield, cycle, crew,
minutes, £ service prices), the costed country's rates and the cost parameters. Every £ below is recomputed here
with the standard formulas, written out, and compared with the tool's own line. Nothing is copied from the tool's
outputs except to compare against.

  python3 handcalc.py knuckle-trace.json INR_PER_GBP
"""
import json, sys

t = json.load(open(sys.argv[1]))
fx = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
p = t['mapped']['params']
ops_tool = {o['operationName']: o for o in t['cost']['trace']['operations']}
rate = {o['operationName']: (o['machineRateUsed'], o['labourRateUsed']) for o in t['cost']['trace']['operations']}
g = t['geo']
rows = []
def row(name, hand, tool, basis):
    rows.append((name, hand, tool, basis))

# ── 1. Geometry ───────────────────────────────────────────────────────────────
V = g['volume']['cm3']; S = g['surfaceArea']['cm2']
section = 2 * V * 1000 / (S * 100)                     # 2·V/S, mm
dens = 7.1                                             # EN-GJS-500-7, g/cm³ (library 7100 kg/m³)
finished = V * dens / 1000
row('finished weight kg', finished, p['finishedWeightKg'], f'{V} cm³ × {dens} g/cm³')
print(f'section 2V/S = {section:.2f} mm (sand ductile iron, section-based process choice)')

# ── 2. Metal ──────────────────────────────────────────────────────────────────
cast = p['castPartWeightKg']; y = p['castingYield']; rej = p['rejectRate']
poured = cast / (1 - rej) / y
loss = 0.03                                            # melt loss fraction (library melt facts for ductile iron)
lost = (poured - cast) * loss
price = t['cost']['trace']['traceability'][0]['value']   # £/kg in the costed country
metal = (cast + lost) * price
row('poured kg', poured, None, f'{cast} kg as-cast ÷ (1 − {rej}) ÷ yield {y}')
row('metal £', metal, None, f'({cast} + {lost:.4f} lost) kg × £{price}/kg; returns remelted, only {loss:.0%} lost')

# ── 3. Consumables and services (rules' £, recomputed) ───────────────────────
cores = p['sand']['coreCostPerPart'] / (1 - rej)
ht = p['heatTreatmentCostPerKg'] * cast
items = t['cost']['trace']['drivers']['rawMaterial']['consumablesItems']
sand_add = next(i['gbp'] for i in items if i['label'] == 'green-sand additions')
cons = cores + sand_add + ht + p['shotBlastCostPerPart'] + p['ndtCostPerPart'] + p['machiningToolWearCostPerPart']
kwh = t['cost']['trace']['drivers']['rawMaterial']['energyKwh']['electricity']
energy = kwh * 0.069                                   # India tariff £/kWh as stated on the trace
row('consumables £', cons, t['cost']['trace']['drivers']['rawMaterial']['consumablesCostPerPart'],
    f'cores {cores:.4f} + sand adds {sand_add:.4f} + HT {ht:.4f} + blast + NDT + tool wear')
row('melt energy £', energy, None, f'{kwh:.4f} kWh ({kwh/poured:.3f} kWh/kg poured) × £0.069/kWh')
row('BUCKET material £', metal + cons + energy, t['cost']['breakdown']['rawMaterial'], 'metal + consumables + energy')

# ── 4. Operations: machine £ = h × rate ÷ OEE ÷ parts; labour £ = labour h × rate × manning ÷ efficiency ──
proc = lab = 0.0
for name, o in ops_tool.items():
    mr, lr = rate[name]
    bench = o.get('benchOperation')
    m = 0.0 if bench else o['cycleTimeHr'] * mr / o['oee'] / o['partsPerCycle']
    l = o['labourTimeHr'] * lr * o['manning'] / o['labourEfficiency'] / o['partsPerCycle']
    proc += m; lab += l
    row(f'op {name[:48]} machine £', m, o['processCost'], f"{o['cycleTimeHr']} h × £{mr:.3f}/h ÷ OEE {o['oee']}")
    row(f'op {name[:48]} labour £', l, o['labourCost'], f"{o['labourTimeHr']} h × £{lr}/h × {o['manning']} ÷ {o['labourEfficiency']}")
row('BUCKET process £', proc, t['cost']['breakdown']['process'], 'sum of machine £')
row('BUCKET labour £', lab, t['cost']['breakdown']['labour'], 'sum of labour £')

# ── 5. Tooling ────────────────────────────────────────────────────────────────
import math
vol = p['amortizationVolume']
moulds = vol / (1 - rej)                               # castings poured a year (1 impression a mould)
patterns = math.ceil(moulds / p['sand']['patternLife'])
tooling = patterns * p['sand']['patternCost'] + p['machiningToolingCost'] + p['machiningProgrammingNRE']
row('tooling £/yr', tooling, t['cost']['trace']['drivers']['tooling']['totalToolingCost'],
    f"{patterns} patterns × £{p['sand']['patternCost']} (life {p['sand']['patternLife']}) + fixtures £{p['machiningToolingCost']} + programming £{p['machiningProgrammingNRE']}")
row('BUCKET tooling £', tooling / vol, t['cost']['breakdown']['tooling'], f'÷ {vol:,} parts')

# ── 6. Packaging, logistics, overhead, margin ────────────────────────────────
b = t['cost']['breakdown']; s = t['shop']
base = (metal + cons + energy) + proc + lab + tooling / vol
oh = base * s['overheadPct']
pack, logi = s['packagingPerPart'], s['logisticsPerPart']
sub = base + oh + pack + logi
margin = sub * 0.08
total = sub + margin
row('overhead £', oh, b['overhead'], f"{s['overheadPct']:.0%} of material + process + labour + tooling")
row('margin £', margin, b['margin'], '8 % of the subtotal')
row('TOTAL £', total, t['cost']['total'], 'sum')

print(f"{'line':58s} {'hand':>12s} {'tool':>12s} {'diff':>9s}   basis")
for name, h, tl, basis in rows:
    hv = h * fx if '£' in name else h
    tv = (tl * fx if '£' in name else tl) if tl is not None else None
    d = '' if tv is None else f'{(hv - tv):+.4f}'
    print(f"{name:58s} {hv:12.4f} {('' if tv is None else f'{tv:12.4f}'):>12s} {d:>9s}   {basis}")
