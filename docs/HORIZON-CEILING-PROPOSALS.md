# Horizon — adoption-ceiling proposals for sign-off

**Status: PROPOSAL. Not applied to the register.** These ceilings change the
forecast dates on screen, so they need cost-engineering approval first.
Record decisions in `HORIZON-CEILING-PROPOSALS.csv` (column *DECISION*). The
approved rows are then written into the register as curated `ceiling` values.

## What a ceiling is

A ceiling is the long-run maximum share of the **applicable** segment a
technology can reach. It is not a dated forecast. Without a curated value the
model assumes 90% of the segment. That over-projects niche, premium-only and
ICE-only technologies. On screen this is disclosed as "ceiling not curated".

## The 119 proposals

| Basis | Count |
|---|---|
| Sourced forecast (a published penetration figure, cited) | 6 |
| Structural limit (who can use it: BEV-only, premium-only, mandated, …) | 25 |
| Engineering judgement (labelled as such) | 88 |

Confidence: 5 high, 30 medium, 84 low.
6 entries keep 90 on purpose, for example a mandated technology or a
development process rather than vehicle content.

**Caveat on sources.** The network proxy blocked most publisher pages, so the
quoted figures are search-result text, marked as such. "Sourced" here means a
published figure exists. Even then, those figures are dated forecasts (2030,
2035) that were extrapolated into a ceiling, not ceilings someone published.

## Read this before approving: the lane effect

Horizon files a technology in a lane by **when it reaches a quarter of its
own ceiling**: that is when it stops being exotic within its own segment. A
lower ceiling is reached sooner, so approving these values would move
**33 technologies from Horizon 2 to Horizon 1** ("adopt/quote now").

That is correct for a niche technology that already has a real foothold in
its niche. It is wrong where the niche itself is blocked. For example, ADS
marker lamps would move to H1 at a 5% ceiling, although China has barred them
on new type approvals.

Decide for each such row whether the lane move is right. If many are not, the
lane rule should measure the quarter of the ceiling against the **whole**
segment for low-ceiling technologies. That is a model change to decide
separately, not by tuning ceilings.

## Questions the research raised

- **Segment scope:** NACS (North America only, ~10–15% if global); battery
  passport (EU only, ~50 if global); recycled plastics (an EU mandate treated
  as global pull).
- **Not vehicle fitment:** direct recycling (share of recycling throughput);
  dry electrode (share of cell-factory capacity).
- **Source quality:**
  - The lithium-12V anchor is from Eurobat, a lead-acid industry body.
  - The 4D imaging-radar figure is a share of radar units, not of vehicles.
  - The silicon-anode ceiling of 15 may be generous: engineered Si is only
    2.9% of anode supply by 2035 (Benchmark Minerals).
- **Linked ceilings to approve together:** LFP / LMFP / ultra-fast LFP;
  EESM / inductive excitation; EMB brakes / one-box brakes.

## Full table

Columns:
- **+8y**: modelled adoption in 8 years, today (default 90%) → with the
  proposal.
- **Lane**: today → with the proposal.

| id | commodity | now % | ceiling % | segment | basis | conf. | +8y | lane | flag |
|---|---|---|---|---|---|---|---|---|---|
| 48v-battery-nextgen | Battery | 5 | **70** | 48V MHEV batteries | engineering judgement | low | 69.7 → 55.8 | H2 → H1 |  |
| 800v-pack | Battery | 15 | **50** | new BEVs | engineering judgement | medium | 79 → 46.5 | H1 → H1 |  |
| battery-passport | Battery | 5 | **90** | EV batteries placed on the EU market (BEV + PHEV) | structural limit | high | 69.7 → 69.7 | H1 → H1 | Segment = batteries sold in the EU; for global production ~50. |
| cell-46xx | Battery | 5 | **20** | new BEV traction packs | engineering judgement | low | 69.7 → 18.3 | H2 → H1 |  |
| cell-contacting-fpc | Battery | 35 | **85** | new BEV + PHEV traction packs | engineering judgement | medium | 85.5 → 81 | H1 → H1 |  |
| ctp-ctb | Battery | 25 | **75** | new BEV traction packs | engineering judgement | medium | 83.1 → 70.4 | H1 → H1 |  |
| direct-recycling | Battery | 5 | **70** | end-of-life EV battery tonnage processed (not vehicle fitment) | engineering judgement | low | 69.7 → 55.8 | H2 → H1 | Segment is recycling throughput, not vehicle fitment. |
| dry-electrode | Battery | 2 | **40** | Li-ion cell production capacity for EVs (process share) | engineering judgement | low | 64.1 → 30.6 | H2 → H2 | Segment is cell-factory capacity, not vehicle fitment. |
| fire-barriers | Battery | 30 | **90** | new BEV + PHEV traction packs | structural limit | high | 84.4 → 84.4 | H1 → H1 |  |
| hv-1000v | Battery | 1 | **10** | new BEVs | structural limit | low | 61.6 → 8.3 | H2 → H1 |  |
| lfp-mainstream | Battery | 40 | **60** | new BEV + PHEV traction packs (by vehicle) | engineering judgement | medium | 86.3 → 58.9 | H1 → H1 |  |
| lmr-cathode | Battery | 0 | **15** | new BEV traction packs | engineering judgement | low | None → None | H2 → H2 |  |
| m3p-lmfp | Battery | 3 | **25** | new BEV + PHEV traction packs | engineering judgement | low | 66.2 → 21.2 | H2 → H1 |  |
| pyrofuse-bdu | Battery | 25 | **85** | new BEV + PHEV traction packs | engineering judgement | medium | 83.1 → 78.9 | H1 → H1 |  |
| second-life-storage | Battery | 2 | **25** | end-of-life BEV/PHEV packs (share reused before recycling) | engineering judgement | low | 64.1 → 20.2 | H1 → H1 |  |
| silicon-anode | Battery | 1 | **15** | new BEVs + PHEVs (cell GWh) | engineering judgement | low | 61.6 → 11.9 | H2 → H2 | Benchmark Minerals: engineered Si only 2.9% of anode supply by 2035 — 15 may be generous. |
| solid-state | Battery | 0 | **15** | new BEV traction packs | sourced forecast | low | None → None | H3 → H3 |  |
| ultra-fast-lfp | Battery | 8 | **40** | new BEVs | engineering judgement | low | 73.5 → 35.8 | H1 → H1 |  |
| wbms | Battery | 3 | **25** | new BEV + PHEV traction packs | engineering judgement | low | 66.2 → 21.2 | H2 → H1 |  |
| 3d-roll-forming | BIW | 2 | **15** | all new light vehicles (steel rockers/rails) | engineering judgement | low | 64.1 → 12.8 | H2 → H1 |  |
| adhesive-first-joining | BIW | 10 | **35** | new BEVs | structural limit | low | 75.5 → 32.4 | H1 → H1 |  |
| al-recycled-closed-loop | BIW | 15 | **60** | new vehicles with aluminium sheet closures/structures | engineering judgement | low | 79 → 54.9 | H1 → H1 |  |
| gigacasting | BIW | 8 | **40** | new BEVs | engineering judgement | low | 73.5 → 35.8 | H1 → H1 |  |
| green-steel | BIW | 3 | **40** | all new light vehicles (share of vehicles with a material low-CO2 steel content) | engineering judgement | low | 66.2 → 32 | H1 → H1 |  |
| low-temp-ecoat | BIW | 3 | **60** | all new light-vehicle BIW production (by paint-shop volume) | engineering judgement | low | 66.2 → 45.9 | H2 → H2 |  |
| mpi-hot-stamped-underbody | BIW | 1 | **15** | all new light vehicles | engineering judgement | low | 61.6 → 11.9 | H2 → H2 |  |
| phs-2000 | BIW | 5 | **35** | all new light vehicles (steel-bodied crash cells) | engineering judgement | low | 69.7 → 30.2 | H1 → H1 |  |
| sill-crash-extrusions | BIW | 20 | **55** | new BEVs | engineering judgement | medium | 81.4 → 52 | H1 → H1 |  |
| structural-battery-biw | BIW | 5 | **40** | new BEVs | engineering judgement | low | 69.7 → 34 | H2 → H1 |  |
| tailored-soft-zones | BIW | 15 | **65** | all new light vehicles (steel-bodied) | engineering judgement | medium | 79 → 59 | H1 → H1 |  |
| active-damping-cheap | Chassis | 12 | **40** | new passenger cars (C-segment and above) | engineering judgement | low | 77.1 → 37.2 | H1 → H1 |  |
| coated-brake-discs | Chassis | 3 | **45** | all new light vehicles (global; EU Euro 7 type approvals are the hard driver) | engineering judgement | low | 66.2 → 35.6 | H1 → H1 |  |
| corner-module | Chassis | 0 | **5** | all new light vehicles | engineering judgement | low | None → None | H3 → H3 |  |
| emb-brakes | Chassis | 1 | **30** | new BEV + PHEV | engineering judgement | low | 61.6 → 22.1 | H1 → H1 |  |
| high-output-eps-hd | Chassis | 5 | **85** | new heavy pickups, LCVs and heavy BEVs only | structural limit | medium | 69.7 → 66.2 | H2 → H2 |  |
| intelligent-tyres | Chassis | 2 | **30** | all new light vehicles | engineering judgement | low | 64.1 → 23.7 | H1 → H1 |  |
| one-box-brakes | Chassis | 45 | **80** | all new light vehicles | engineering judgement | medium | 86.9 → 77.8 | H1 → H1 |  |
| redundant-eps | Chassis | 3 | **40** | all new light vehicles | structural limit | low | 66.2 → 32 | H2 → H1 |  |
| steer-by-wire | Chassis | 3 | **30** | all new light vehicles | engineering judgement | low | 66.2 → 24.8 | H2 → H1 |  |
| cv-composite-shaft | Driveline | 3 | **15** | ICE + PHEV vehicles with longitudinal propshafts (RWD/AWD) | structural limit | low | 66.2 → 13.4 | H2 → H1 |  |
| dht-transmission | Driveline | 15 | **60** | new PHEV + full-hybrid production | engineering judgement | medium | 79 → 54.9 | H1 → H1 |  |
| disconnect-units | Driveline | 10 | **35** | new BEVs | structural limit | medium | 75.5 → 32.4 | H1 → H1 |  |
| high-ratio-reducer | Driveline | 5 | **60** | new BEVs | engineering judgement | low | 69.7 → 48.7 | H2 → H1 |  |
| hollow-halfshafts | Driveline | 5 | **50** | all new light vehicles (driven axles) | engineering judgement | low | 69.7 → 41.4 | H2 → H1 |  |
| tv-dual-motor | Driveline | 20 | **40** | new BEVs | structural limit | medium | 81.4 → 38.6 | H1 → H1 |  |
| 8in1 | EDU | 15 | **45** | new BEVs | engineering judgement | low | 79 → 42.2 | H1 → H1 |  |
| dsc-power-module | EDU | 10 | **35** | new BEV + PHEV traction inverters | engineering judgement | low | 75.5 → 32.4 | H1 → H1 |  |
| eesm | EDU | 8 | **20** | new BEV traction motors | engineering judgement | low | 73.5 → 19 | H1 → H1 |  |
| gan-inverter | EDU | 1 | **35** | BEV + PHEV power electronics (OBC/DC-DC first, then traction) | engineering judgement | low | 61.6 → 25.4 | H2 → H2 |  |
| hairpin-xpin | EDU | 20 | **50** | new traction-motor stators (BEV/PHEV/MHEV) | engineering judgement | low | 81.4 → 47.6 | H1 → H1 |  |
| inductive-excitation | EDU | 0 | **10** | new BEVs (subset: EESM-equipped) | structural limit | low | None → None | H2 → H2 |  |
| inverter-boost-charging | EDU | 5 | **30** | new BEVs | structural limit | low | 69.7 → 26.3 | H2 → H1 |  |
| magnet-recycling | EDU | 1 | **25** | NdFeB magnet feedstock for new EV motors (recycled share) | engineering judgement | low | 61.6 → 18.7 | H2 → H2 |  |
| oem-inhouse-power-modules | EDU | 15 | **35** | new BEVs + PHEVs (by volume) | structural limit | low | 79 → 33.5 | H1 → H1 |  |
| oil-cooling-edu | EDU | 30 | **75** | new BEV + PHEV traction motors | engineering judgement | medium | 84.4 → 71.4 | H1 → H1 |  |
| sic-mainstream | EDU | 35 | **70** | new BEV traction inverters | engineering judgement | medium | 85.5 → 67.6 | H1 → H1 |  |
| sintered-power-packaging | EDU | 15 | **60** | new BEV + PHEV traction inverters | structural limit | low | 79 → 54.9 | H1 → H1 |  |
| thin-gauge-lamination | EDU | 12 | **60** | new traction-motor stator/rotor stacks | engineering judgement | low | 77.1 → 53.7 | H1 → H1 |  |
| ultra-high-rpm | EDU | 3 | **25** | new BEV traction motors | engineering judgement | low | 66.2 → 21.2 | H2 → H1 |  |
| 48v-lv-net | Electrical | 1 | **30** | new BEVs | engineering judgement | low | 61.6 → 22.1 | H2 → H2 |  |
| al-flat-harness | Electrical | 5 | **50** | all new light vehicles | engineering judgement | low | 69.7 → 41.4 | H2 → H1 |  |
| automotive-ethernet | Electrical | 20 | **85** | all new light vehicles | engineering judgement | medium | 81.4 → 77.3 | H1 → H1 |  |
| bidirectional-obc | Electrical | 10 | **70** | new BEVs + PHEVs | engineering judgement | low | 75.5 → 60.4 | H1 → H1 |  |
| chiplet-hpc | Electrical | 0 | **30** | new BEVs + PHEVs with a central computer | engineering judgement | low | None → None | H3 → H3 |  |
| dms-standard | Electrical | 40 | **85** | all new light vehicles | structural limit | medium | 86.3 → 81.8 | H1 → H1 |  |
| e-compressor-800v | Electrical | 20 | **50** | new BEVs | structural limit | low | 81.4 → 47.6 | H1 → H1 |  |
| e2e-ai-driving | Electrical | 5 | **60** | all new light vehicles with L2+ ADAS | engineering judgement | low | 69.7 → 48.7 | H2 → H1 |  |
| heat-pump-standard | Electrical | 55 | **85** | new BEVs | engineering judgement | medium | 88 → 83.4 | H1 → H1 |  |
| imaging-radar-4d | Electrical | 5 | **55** | all new light vehicles (share of front/corner radar units) | sourced forecast | low | 69.7 → 45.1 | H2 → H1 | Source figure is a share of radar UNITS in a China-focused report, not vehicles. |
| integrated-thermal-module | Electrical | 15 | **75** | new BEVs | engineering judgement | medium | 79 → 67.1 | H1 → H1 |  |
| interior-radar-uwb | Electrical | 4 | **60** | all new light vehicles | engineering judgement | low | 68.1 → 47.4 | H2 → H2 |  |
| l3-hands-off | Electrical | 8 | **60** | all new light vehicles | sourced forecast | medium | 73.5 → 51.4 | H1 → H1 |  |
| lidar-cost-collapse | Electrical | 6 | **40** | new BEVs + PHEVs (effectively L2+/NOA-equipped trims) | engineering judgement | low | 71.1 → 34.7 | H2 → H1 |  |
| lifepo4-12v | Electrical | 8 | **50** | new BEVs + PHEVs | engineering judgement | low | 73.5 → 43.7 | H1 → H1 | Anchor (3% by 2030) is from Eurobat, a lead-acid industry body — possible bias. |
| nacs-consolidation | Electrical | 30 | **90** | new North-American BEVs + PHEVs only | structural limit | high | 84.4 → 84.4 | H1 → H1 | Segment = North American sales only; against global sales the ceiling should be ~10-15%. |
| pre-crash-active | Electrical | 10 | **70** | all new light vehicles | engineering judgement | low | 75.5 → 60.4 | H1 → H1 |  |
| r744-propane | Electrical | 2 | **40** | new BEVs | engineering judgement | low | 64.1 → 30.6 | H1 → H1 | Raise if the EU PFAS restriction bans R1234yf. |
| riscv-auto | Electrical | 0 | **40** | all new light vehicles (vehicles whose main MCU/SoC sourcing includes RISC-V cores) | engineering judgement | low | None → None | H3 → H3 |  |
| sdv-stack | Electrical | 10 | **80** | new BEV + PHEV | engineering judgement | medium | 75.5 → 68 | H1 → H1 |  |
| solid-state-efuse | Electrical | 3 | **60** | all new light vehicles | engineering judgement | low | 66.2 → 45.9 | H2 → H2 |  |
| uwb-digital-key | Electrical | 20 | **60** | all new light vehicles | engineering judgement | low | 81.4 → 56.3 | H1 → H1 |  |
| vehicle-ai-hpc | Electrical | 8 | **50** | new BEVs + PHEVs | engineering judgement | low | 73.5 → 43.7 | H1 → H1 |  |
| virtual-ecus | Electrical | 5 | **70** | all new light vehicles | engineering judgement | low | 69.7 → 55.8 | H2 → H1 |  |
| virtual-validation | Electrical | 10 | **90** | new vehicle programmes (development process, not fitted content) | engineering judgement | medium | 75.5 → 75.5 | H1 → H1 | A development process, not vehicle content — 90 retained. |
| zonal-architecture | Electrical | 8 | **80** | new BEV + PHEV | sourced forecast | medium | 73.5 → 66.3 | H1 → H1 |  |
| acoustic-glazing-trickle | Exterior | 15 | **50** | new BEV + PHEV | engineering judgement | low | 79 → 46.5 | H1 → H1 |  |
| adb-fmvss108-us | Exterior | 2 | **40** | new US light vehicles | engineering judgement | low | 64.1 → 30.6 | H1 → H1 |  |
| ads-marker-lamps | Exterior | 1 | **5** | all new light vehicles (in practice only L3+ ADS-equipped vehicles in markets that permit them) | structural limit | medium | 61.6 → 4.5 | H2 → H1 |  |
| aero-wheels | Exterior | 20 | **60** | new BEVs | engineering judgement | low | 81.4 → 56.3 | H1 → H1 |  |
| flush-handles | Exterior | 15 | **20** | new BEV + PHEV | structural limit | medium | 79 → 19.8 | H1 → H1 |  |
| hd-matrix-uledge | Exterior | 3 | **20** | all new light vehicles | engineering judgement | low | 66.2 → 17.4 | H2 → H1 |  |
| illuminated-front-panel | Exterior | 8 | **30** | new BEV + PHEV | engineering judgement | low | 73.5 → 27.6 | H1 → H1 |  |
| micro-optics-slim-lamps | Exterior | 1 | **30** | all new light vehicles | engineering judgement | low | 61.6 → 22.1 | H2 → H2 |  |
| recycled-exterior | Exterior | 8 | **75** | all new light vehicles | structural limit | medium | 73.5 → 62.6 | H1 → H1 | Treats an EU mandate as global pull. |
| seamless-glazing | Exterior | 6 | **40** | new BEVs | engineering judgement | low | 71.1 → 34.7 | H2 → H1 |  |
| signature-oled-rear | Exterior | 6 | **20** | all new light vehicles | engineering judgement | low | 71.1 → 18.6 | H2 → H1 |  |
| smart-actuated-aero | Exterior | 4 | **30** | new BEVs | engineering judgement | low | 68.1 → 25.7 | H2 → H1 |  |
| thermoplastic-tailgates | Exterior | 10 | **35** | all new light vehicles (tailgate body styles: SUV/hatch/estate) | structural limit | low | 75.5 → 32.4 | H1 → H1 |  |
| ambient-projection | Interior | 5 | **30** | all new light vehicles | engineering judgement | low | 69.7 → 26.3 | H2 → H1 |  |
| ar-hud-phud | Interior | 4 | **35** | all new light vehicles | sourced forecast | low | 68.1 → 29.4 | H2 → H1 |  |
| capacitive-hod-wheel | Interior | 10 | **60** | all new light vehicles | engineering judgement | low | 75.5 → 52.7 | H1 → H1 |  |
| farside-airbags | Interior | 25 | **70** | all new light vehicles | engineering judgement | medium | 83.1 → 66 | H1 → H1 |  |
| interior-anc | Interior | 6 | **50** | new BEVs | engineering judgement | low | 71.1 → 42.3 | H2 → H1 |  |
| leather-free-premium | Interior | 20 | **50** | premium/luxury new vehicles | structural limit | low | 81.4 → 47.6 | H1 → H1 |  |
| mono-material-acoustics | Interior | 5 | **40** | all new light vehicles | engineering judgement | low | 69.7 → 34 | H2 → H1 |  |
| p2p-display | Interior | 10 | **40** | new BEVs + PHEVs | engineering judgement | low | 75.5 → 36.6 | H1 → H1 |  |
| recycled-interior-plastics | Interior | 10 | **75** | all new light vehicles | structural limit | medium | 75.5 → 64.2 | H1 → H1 | Treats an EU mandate as global pull. |
| seat-lightweighting | Interior | 3 | **25** | all new light vehicles | engineering judgement | low | 66.2 → 21.2 | H2 → H1 |  |
| smart-surfaces | Interior | 3 | **35** | all new light vehicles | engineering judgement | low | 66.2 → 28.5 | H2 → H1 |  |
| speakerless-audio | Interior | 2 | **20** | new BEVs | engineering judgement | low | 64.1 → 16.6 | H2 → H1 |  |
| voice-llm-hmi | Interior | 8 | **85** | all new light vehicles | sourced forecast | medium | 73.5 → 69.9 | H1 → H1 |  |
| 48v-mhev-decontent | Powertrain | 30 | **75** | new vehicles with an ICE that are not full/plug-in hybrids | engineering judgement | medium | 84.4 → 71.4 | H1 → H1 |  |
| cylinder-deactivation | Powertrain | 15 | **35** | new multi-cylinder ICE + MHEV engines | structural limit | low | 79 → 33.5 | H1 → H1 |  |
| dhe-engines | Powertrain | 15 | **60** | engines in new full hybrids, PHEVs and EREVs | engineering judgement | low | 79 → 54.9 | H1 → H1 |  |
| diesel-aftertreatment | Powertrain | 90 | **90** | new light-duty diesels in Euro 6d/7-class regulated markets | structural limit | high | 90 → 90 | H1 → H1 |  |
| gdi-500bar | Powertrain | 5 | **35** | new GDI engines | engineering judgement | low | 69.7 → 30.2 | H1 → H1 |  |
| gpf-standard | Powertrain | 70 | **90** | new GDI engines (incl. hybrids) in regulated markets | structural limit | high | 89.1 → 89.1 | H1 → H1 |  |
| pre-chamber | Powertrain | 3 | **12** | spark-ignition ICE/hybrid engines in new vehicles | engineering judgement | low | 66.2 → 11 | H2 → H1 |  |
| smart-thermal-ice | Powertrain | 30 | **70** | new ICE/hybrid engines | engineering judgement | medium | 84.4 → 66.9 | H1 → H1 |  |
