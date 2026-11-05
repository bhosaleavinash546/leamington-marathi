/**
 * The built-in Services & toolroom rates (rates flow R2, Nov 2026) — every UK £ figure the rules and modules price a
 * service, a toolroom hour, a tool material, a bought-out tool component, a fixture, tool wear, a foundry consumable or an
 * NRE item with. Each figure used to be a literal in the file that used it; it is now a row here (the built-in book's
 * `services` table, the template's "Services & toolroom" sheet) and the code reads it through the active book
 * (`serviceUk` in service-rates.ts) — never the literal.
 *
 * Every value is EXACTLY the literal it replaced (no cost moves on the built-in book). `basis` is the country basis the
 * code applies to the figure in a country with no row of its own (regional-services.ts `countryFactor`) — the same one
 * the site always used. A company row with a `country` is that country's own figure and is used as given.
 *
 * Pure data: no imports beyond types (rate-library.ts reads it at module load).
 *
 * NOT here, and why (one stated source each):
 *  - parametric tool-price curves (a mould / die / pattern priced as base + £/cm² or £/mm of the part — casting, roto,
 *    rubber, thermoforming, extrusion and aluminium-extrusion dies, composite tools): they are fitted price models, not a
 *    rate; they follow the country by the toolroom factor, and a tool quote typed into the form replaces them;
 *  - gear tools and NRE: the gear shop data document (`gear-shop-data.ts`, `loadGearShopData`) is their source;
 *  - PCB service prices: the PCB country rates (`server/data/pcb-country-rates.ts`, admin-editable per country);
 *  - EV battery / e-motor parts: the parts list in `ev-data.ts`, each line with its own basis (bought-in parts, not services);
 *  - the forms' £ field defaults (index.html, `country-money-defaults.ts`): a person's starting figure, a quote once typed.
 */
import type { ServiceRate } from './types.js';

type Row = Omit<ServiceRate, 'effectiveDate' | 'confidence'> & Partial<Pick<ServiceRate, 'effectiveDate' | 'confidence'>>;

const TOOLROOM_SRC = 'UK toolroom fully-loaded benchmarks Jun 2026 (58/52/58/48/45/85 £/h) moved to Sep 2026 by one quarter of UK '
  + 'manufacturing wage growth (ONS AWE +2.9 % y/y → ×1.0072) — engineering benchmark, not a quote';
const TOOL_STEEL_SRC = 'Tool material £/kg delivered, Jun 2026; held at the Sep 2026 refresh — no public tool-steel (P20 / H13) price '
  + 'index was sourced; refresh by supplier quote';
const BOUGHT_OUT_SRC = 'Catalogue-typical bought-out tool component, Jun 2026; held at the Sep 2026 refresh — refresh by supplier quote';
const FIXTURE_SRC = 'Engineering-typical toolroom build, not sourced (CostVision)';
const WEAR_SRC = 'Perishable cutting tools (inserts, end mills, drills) per minute of cutting — engineering-typical, not sourced';
const ET = 'CostVision engineering-typical, not sourced';

const rows: Row[] = [
  // ── Toolroom £/h (toolmaking.ts) — × the country's toolroom factor ──────────────────────────────────────────────────
  { id: 'toolroom.design', label: 'Toolroom — tool design & CAM', value: 58.42, unit: '£/h', basis: 'toolroom', sourceNote: TOOLROOM_SRC },
  { id: 'toolroom.cnc', label: 'Toolroom — CNC machining', value: 52.37, unit: '£/h', basis: 'toolroom', sourceNote: TOOLROOM_SRC },
  { id: 'toolroom.edm', label: 'Toolroom — EDM', value: 58.42, unit: '£/h', basis: 'toolroom', sourceNote: TOOLROOM_SRC },
  { id: 'toolroom.fitting', label: 'Toolroom — fitting & spotting', value: 48.35, unit: '£/h', basis: 'toolroom', sourceNote: TOOLROOM_SRC },
  { id: 'toolroom.polish', label: 'Toolroom — polishing', value: 45.32, unit: '£/h', basis: 'toolroom', sourceNote: TOOLROOM_SRC },
  { id: 'toolroom.tryout-press', label: 'Toolroom — tryout press', value: 85.61, unit: '£/h', basis: 'toolroom', sourceNote: TOOLROOM_SRC },

  // ── Tool materials £/kg (toolmaking.ts) — traded, no country factor ───────────────────────────────────────────────
  { id: 'tool-steel.p20', label: 'Tool steel P20', value: 6.8, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },
  { id: 'tool-steel.p20-hard', label: 'Tool steel P20 pre-hard / H13-class production', value: 8.2, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },
  { id: 'tool-steel.h13', label: 'Tool steel H13', value: 9.5, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },
  { id: 'tool-steel.hammer-1.2714', label: 'Die-block steel 1.2714 (hammer / press dies)', value: 5.8, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },
  { id: 'tool-steel.premium-pm', label: 'Premium powder-metallurgy tool steel', value: 14.0, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },
  { id: 'tool-steel.al-7075', label: 'Tooling aluminium 7075', value: 7.5, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },
  { id: 'tool-steel.cast-iron', label: 'Tooling cast iron', value: 2.8, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },
  { id: 'tool-steel.plate-steel', label: 'Plate steel (bolsters, bases)', value: 1.9, unit: '£/kg', basis: 'global', sourceNote: TOOL_STEEL_SRC },

  // ── Bought-out tool components £ each (toolmaking.ts) ─────────────────────────────────────────────────────────────
  { id: 'tool-bought.hot-runner-drop', label: 'Hot-runner drop', value: 3800, unit: '£ each', basis: 'global', sourceNote: BOUGHT_OUT_SRC },
  { id: 'tool-bought.hot-runner-controller', label: 'Hot-runner controller', value: 5500, unit: '£ each', basis: 'global', sourceNote: BOUGHT_OUT_SRC },
  { id: 'tool-bought.core-pull-cylinder', label: 'Core-pull cylinder', value: 1450, unit: '£ each', basis: 'global', sourceNote: BOUGHT_OUT_SRC },
  { id: 'tool-bought.guide-ejection-small', label: 'Guide and ejection set, small tool', value: 650, unit: '£ each', basis: 'global', sourceNote: BOUGHT_OUT_SRC },
  { id: 'tool-bought.guide-ejection-large', label: 'Guide and ejection set, large tool', value: 2400, unit: '£ each', basis: 'global', sourceNote: BOUGHT_OUT_SRC },
  { id: 'tool-bought.texturing-per-tool', label: 'Texturing (photo-etch) per tool', value: 3500, unit: '£ per tool', basis: 'process', sourceNote: `${BOUGHT_OUT_SRC}; an etch-house service (process basis)` },

  // ── Fixtures £ each (machining-time.ts) — toolroom-built where the part is made ───────────────────────────────────
  { id: 'fixture.modular', label: 'Modular work holding, per fixturing (short programme)', value: 500, unit: '£ each', basis: 'toolroom', sourceNote: FIXTURE_SRC },
  { id: 'fixture.dedicated', label: 'Dedicated fixture, per fixturing', value: 2500, unit: '£ each', basis: 'toolroom', sourceNote: FIXTURE_SRC },
  { id: 'fixture.soft-jaws', label: 'Soft jaws, per lathe chucking', value: 300, unit: '£ a set', basis: 'toolroom', sourceNote: FIXTURE_SRC },
  { id: 'fixture.hydraulic', label: 'Dedicated hydraulic fixture on a tombstone (volume cell)', value: 12000, unit: '£ each', basis: 'toolroom', sourceNote: FIXTURE_SRC },

  // ── Cutting-tool wear £ per minute of cut (machining-time.ts) — traded tools ──────────────────────────────────────
  { id: 'tool-wear.aluminium', label: 'Tool wear — aluminium', value: 0.04, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.magnesium', label: 'Tool wear — magnesium', value: 0.04, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.plastic', label: 'Tool wear — plastic', value: 0.02, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.copper-alloy', label: 'Tool wear — copper alloy', value: 0.06, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.cast-iron', label: 'Tool wear — cast iron', value: 0.10, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.steel', label: 'Tool wear — steel', value: 0.12, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.titanium', label: 'Tool wear — titanium', value: 0.35, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.zinc', label: 'Tool wear — zinc', value: 0.04, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },
  { id: 'tool-wear.nickel-alloy', label: 'Tool wear — nickel alloy', value: 0.50, unit: '£/min of cut', basis: 'global', sourceNote: WEAR_SRC },

  // ── Heat treatment £/kg (casting / forging advisors) — × the heat-treat factor ────────────────────────────────────
  { id: 'heat-treat.casting-stress-relieve', label: 'Casting stress relieve / normalise (cast steel)', value: 0.35, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'heat-treat.forging-normalise', label: 'Forging normalise', value: 0.30, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'heat-treat.forging-quench-temper', label: 'Forging quench and temper', value: 0.65, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'heat-treat.forging-anneal', label: 'Forging anneal', value: 0.35, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'heat-treat.forging-solution-age', label: 'Forging solution + age (Ti / superalloy / PH)', value: 1.20, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'heat-treat.al-furnace-set', label: 'Aluminium T6 furnace set (solution + quench + age), installed', value: Math.round((40_000 + 60_000) / 2 / 1.3344),
    unit: '£ a set', basis: 'global',
    sourceNote: 'US$40,000–60,000 a set (scripts/research/2026-11-gravity-lpdc/data.json rows H1–H3); the midpoint at the research FX £1 = US$1.3344 — a traded machine, at par in every book' },

  // ── HIP £/kg (casting advisor) — a batch-furnace service ──────────────────────────────────────────────────────────
  { id: 'hip.aluminium', label: 'HIP — aluminium', value: 3.0, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.magnesium', label: 'HIP — magnesium', value: 3.5, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.zinc', label: 'HIP — zinc', value: 3.0, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.copper', label: 'HIP — copper alloy', value: 3.5, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.grey-iron', label: 'HIP — grey iron', value: 3.5, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.ductile-iron', label: 'HIP — ductile iron', value: 3.5, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.carbon-steel', label: 'HIP — carbon steel', value: 4.0, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.stainless-steel', label: 'HIP — stainless steel', value: 4.5, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },
  { id: 'hip.superalloy', label: 'HIP — superalloy', value: 9.0, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },

  // ── NDT / NDI (casting, forging, composites) — × the inspection factor ────────────────────────────────────────────
  { id: 'ndt.casting-xray', label: 'Casting 2D radiograph, per part', value: 5.0, unit: '£/part', basis: 'inspection', sourceNote: ET },
  { id: 'ndt.casting-ct', label: 'Casting industrial CT, per part', value: 32.0, unit: '£/part', basis: 'inspection', sourceNote: ET },
  { id: 'ndt.forging-mpi', label: 'Forging magnetic particle, per part (form / advisor flat rate)', value: 2.5, unit: '£/part', basis: 'inspection', sourceNote: ET },
  { id: 'ndt.forging-ut', label: 'Forging ultrasonic, per part', value: 6.0, unit: '£/part', basis: 'inspection', sourceNote: ET },
  { id: 'ndt.forging-ct', label: 'Forging industrial CT, per part', value: 32.0, unit: '£/part', basis: 'inspection', sourceNote: ET },
  { id: 'ndt.mpi-bench', label: 'MPI bench (wet fluorescent, UV, ink) — equipment', value: 4, unit: '£/h', basis: 'inspection', sourceNote: `${ET} (a ~£25k unit)` },
  { id: 'ndt.rtr-cabinet', label: 'Real-time X-ray cabinet with manipulator — equipment', value: 20, unit: '£/h', basis: 'inspection',
    sourceNote: `${ET} (a ~£250k unit over 13 yr at 6,000 h, maintenance and tube included)` },
  { id: 'ndi.cscan-cell', label: 'Robot phased-array C-scan cell — equipment', value: 15, unit: '£/h', basis: 'inspection',
    sourceNote: `${ET} (a ~£400k robot PAUT cell over 10 yr at 4,000 h, + 50 % for maintenance, couplant and power)` },

  // ── Bought-in process services (casting / forging) — × the process-service factor ───────────────────────────────
  { id: 'casting.impregnation', label: 'Vacuum resin impregnation, per casting', value: 0.90, unit: '£/part', basis: 'process', sourceNote: ET },
  { id: 'casting.shot-blast-flat', label: 'Casting shot blast, flat per part (advisor)', value: 0.35, unit: '£/part', basis: 'process', sourceNote: ET },
  { id: 'casting.blast-min-charge', label: 'Casting shot blast, minimum charge per casting', value: 0.10, unit: '£/part', basis: 'process', sourceNote: 'CostVision engineering heuristic' },
  { id: 'forging.descale', label: 'Forging descale / pickle', value: 0.12, unit: '£/kg', basis: 'process', sourceNote: ET },
  { id: 'forging.shot-blast', label: 'Forging shot blast, per part', value: 0.35, unit: '£/part', basis: 'process', sourceNote: ET },
  { id: 'forging.coining', label: 'Forging coining / sizing / straighten, per part', value: 0.55, unit: '£/part', basis: 'process', sourceNote: ET },

  // ── Foundry consumables (casting rules) ──────────────────────────────────────────────────────────────────────────
  { id: 'casting.core-small', label: 'Sand core — small core or loose piece (1–5 undercut faces)', value: 0.75, unit: '£/part', basis: 'global 0.3 + process', sourceNote: `${ET} — the form's simple-core band £0.50–2` },
  { id: 'casting.core-simple', label: 'Sand core — simple cavity core (6–19 undercut faces; also the unmeasured default)', value: 1.5, unit: '£/part', basis: 'global 0.3 + process', sourceNote: `${ET} — the form's simple-core band £0.50–2` },
  { id: 'casting.core-complex', label: 'Sand core — complex multi-core (≥ 20 undercut faces)', value: 3, unit: '£/part', basis: 'global 0.3 + process', sourceNote: `${ET} — the form's complex-core band £2–8` },
  { id: 'casting.core-enclosed', label: 'Sand core — enclosed cavity', value: 6, unit: '£/part', basis: 'global 0.3 + process', sourceNote: `${ET} — the form's complex-core band £2–8` },
  { id: 'casting.invest-wax-per-cm2', label: 'Investment wax pattern, per cm² of surface', value: 0.015, unit: '£/cm²', basis: 'global 0.35 + process', sourceNote: `${ET} (kernel estimate)` },
  { id: 'casting.invest-wax-min', label: 'Investment wax pattern, minimum per part', value: 0.30, unit: '£/part', basis: 'global 0.35 + process', sourceNote: `${ET} (kernel estimate)` },
  { id: 'casting.invest-shell-per-cm2', label: 'Investment ceramic shell, per cm² of surface', value: 0.045, unit: '£/cm²', basis: 'global 0.35 + process', sourceNote: `${ET} (kernel estimate)` },
  { id: 'casting.invest-shell-min', label: 'Investment ceramic shell, minimum per part', value: 0.80, unit: '£/part', basis: 'global 0.35 + process', sourceNote: `${ET} (kernel estimate)` },
  { id: 'foundry.new-sand', label: 'New silica sand + disposal of the same tonnage, per tonne of sand', value: (45 + 43) / 1.1965, unit: '£/t of sand',
    basis: 'global 0.5114 + process',
    sourceNote: 'EU JRC SF BREF 2024 Tables 3.21–3.22 (DE UBA 2014: new sand €45/t, disposal €43/t; 2014 prices not escalated) at the book FX €1.1965/£; '
      + 'the sand is the traded share (€45 of €88), the disposal a local service' },

  // ── Tool heat treatment and core boxes (casting-tooling.ts, forging-advisor.ts) ───────────────────────────────────
  { id: 'casting-die.heat-treat-fixed', label: 'Die-casting die stress relief + nitride — fixed part', value: 2500, unit: '£ a die', basis: 'heatTreat', sourceNote: ET },
  { id: 'casting-die.heat-treat-per-cm2', label: 'Die-casting die stress relief + nitride — per cm² of cavity', value: 4, unit: '£/cm²', basis: 'heatTreat', sourceNote: ET },
  { id: 'casting-die.shot-sleeve-set', label: 'Die-casting shot sleeve + biscuit block (wear set)', value: 4500, unit: '£ a die', basis: 'global', sourceNote: 'Catalogue wear set (engineering-typical, not sourced)' },
  { id: 'casting.soluble-core-box', label: 'Soluble-core box, each', value: 1200, unit: '£ each', basis: 'toolroom', sourceNote: `${ET} — made in a toolroom` },
  { id: 'forge-die.harden-fixed', label: 'Forging die blocks harden + temper — fixed part', value: 2500, unit: '£ a die set', basis: 'heatTreat', sourceNote: ET },
  { id: 'forge-die.harden-per-kg', label: 'Forging die blocks harden + temper — per kg of die steel', value: 2.2, unit: '£/kg', basis: 'heatTreat', sourceNote: ET },

  // ── Sheet metal ──────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'sheet.fab-programming', label: 'Laser + brake route: nest and brake programming, first-off', value: 1500, unit: '£ a part number', basis: 'engineer',
    sourceNote: `${ET} (advisor band £500–3k)` },
  { id: 'sheet.twb-laser-weld', label: 'Tailor-welded blank laser weld service', value: 0.006, unit: '£/mm of weld', basis: 'process', sourceNote: ET },
  { id: 'sheet.assist-gas-nitrogen', label: 'Laser assist gas — nitrogen (bulk liquid)', value: 9.00, unit: '£/h of cut', basis: 'global',
    sourceNote: 'High-pressure fusion cutting 20–90 Nm³/h; bulk liquid N₂ £0.15–0.30/m³ → £5–18/h; £9/h the bulk-liquid mid-point (engineering-typical)' },
  { id: 'sheet.assist-gas-oxygen', label: 'Laser assist gas — oxygen', value: 1.80, unit: '£/h of cut', basis: 'global', sourceNote: 'Mild-steel oxidation cutting 2–5 m³/h at < 6 bar → £1–3/h bulk (engineering-typical)' },
  { id: 'sheet.assist-gas-air', label: 'Laser / plasma assist — compressed air', value: 0.40, unit: '£/h of cut', basis: 'global', sourceNote: 'Compressor amortisation + energy (engineering-typical)' },
  { id: 'sheet.waterjet-abrasive', label: 'Waterjet garnet abrasive + orifice wear', value: 18.00, unit: '£/h of cut', basis: 'global',
    sourceNote: 'Garnet 80-mesh 20–27 kg/h at £0.60–0.85/kg → £12–20/h + orifice / mixing-tube wear £2–4/h (UK, 2026, engineering-typical)' },

  // ── Moulding and other routes ────────────────────────────────────────────────────────────────────────────────────
  { id: 'imm.wear-coating', label: 'Injection mould wear coating (nitride / PVD on gate + shut-off), high-volume tool', value: 6000, unit: '£ a tool', basis: 'heatTreat', sourceNote: ET },
  { id: 'roto.grinding', label: 'Rotomoulding powder grinding adder', value: 0.25, unit: '£/kg', basis: 'process', sourceNote: ET },
  { id: 'roto.vent', label: 'Roto mould vent / insert, each', value: 250, unit: '£ each', basis: 'toolroom', sourceNote: ET },
  { id: 'roto.insulation', label: 'Roto mould insulation', value: 500, unit: '£ a mould', basis: 'toolroom', sourceNote: ET },
  { id: 'rubber.insert-nest', label: 'Rubber mould insert nest, each', value: 1200, unit: '£ each', basis: 'toolroom', sourceNote: ET },
  { id: 'al-ext.slug-prep', label: 'Impact extrusion slug prep (saw / punch, anneal, lubricate)', value: 0.42, unit: '£/kg', basis: 'process', sourceNote: 'ESTIMATE (aluminium extrusion build, Oct 2026)' },
  { id: 'al-ext.die-nitride', label: 'Aluminium extrusion die nitride, per treatment', value: 180, unit: '£ a treatment', basis: 'heatTreat', sourceNote: 'ESTIMATE (aluminium extrusion build, Oct 2026)' },
  { id: 'al-ext.anodise-consumables', label: 'Anodising line consumables (acid, seal, power excluded)', value: 0.35, unit: '£/m²', basis: 'global', sourceNote: 'ESTIMATE (aluminium extrusion build, Oct 2026)' },
  { id: 'al-ext.powder-consumables', label: 'Powder-coating line consumables (powder, pretreat)', value: 0.72, unit: '£/m²', basis: 'global', sourceNote: 'ESTIMATE (aluminium extrusion build, Oct 2026)' },
  { id: 'al-ext.ecoat-consumables', label: 'E-coat / conversion-coat line consumables', value: 0.28, unit: '£/m²', basis: 'global', sourceNote: 'ESTIMATE (aluminium extrusion build, Oct 2026)' },
  { id: 'al-ext.bend-tool-first', label: 'Stretch-bend form block — first sweep', value: 15_000, unit: '£ a part', basis: 'global 0.2 + toolroom', sourceNote: 'ESTIMATE (extrusion review, Oct 2026)' },
  { id: 'al-ext.bend-tool-extra', label: 'Stretch-bend form block — each further bend', value: 5_000, unit: '£ a bend', basis: 'global 0.2 + toolroom', sourceNote: 'ESTIMATE (extrusion review, Oct 2026)' },
];

/** The built-in Services & toolroom rows (UK). */
export const SERVICE_RATES: ServiceRate[] = rows.map(r => ({ effectiveDate: '2026-11-05', confidence: 'Low', ...r }));
