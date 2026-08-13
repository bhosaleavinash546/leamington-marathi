/**
 * Surface treatment — the empirical half of the coating cost model.
 *
 * ## Why this file exists
 *
 * `modules/painting.ts` was 107 lines and modelled the PAINT correctly — film
 * build from area, thickness, solids and transfer efficiency — while modelling
 * the LINE as a single "parts per hour" number. Measuring it showed how much
 * that hid: line loading alone moved a painted part 55%, bath chemistry 10% and
 * masking labour 9%, and none of the three had a channel in the model.
 *
 * ## The defect this closes
 *
 * `CoatType` included `'pretreat'`, and a pre-treatment stage entered that way
 * was costed with the paint formula — thickness / solids x price per litre.
 * Phosphating and zirconium conversion have no dry film thickness and no solids
 * content; they are bath chemistry, drag-out, rinse water and effluent, bought
 * per m². A number produced that way is not merely imprecise, it is meaningless
 * — worse than leaving the stage out, because it looks costed.
 *
 * ## Three costing bases, because coating is not one kind of cost
 *
 * A stage is charged per m², per kg or per piece, and which one is not a
 * modelling preference — it is set by what limits the line:
 *
 *   AREA  — chemistry and coating consumed by the part's own wetted surface.
 *   MASS  — throughput set by a kettle, drum or bowl, not by area: shot blast,
 *           mass finishing, hot dip galvanising, resin impregnation, H2 bake.
 *   PIECE — masking, which is per feature and per part and scales with neither.
 *
 * DEPOSITED METAL is always computed per m² even on a MASS stage. This is why
 * hot dip galvanising is quoted per tonne but costs far more per tonne on thin
 * sheet than on heavy forgings: the kettle sets the throughput, the surface
 * sets the zinc.
 *
 * ## Energy is deliberately recorded and deliberately NOT costed
 *
 * `electricityKwhPerUnit` / `gasKwhPerUnit` are carried for the Faraday-law
 * audit in `tests/surface-faraday.test.ts`, NOT for costing. The line's energy,
 * capital, maintenance and overhead are already inside its machine rate in
 * `rate-library.ts`; charging them again here would double-count roughly a
 * third of the conversion cost while looking like a refinement. See the header
 * of `surface-treatment-rate.ts`.
 *
 * ## Status of everything here
 *
 * REPRESENTATIVE, not measured. Every parameter carries its own provenance
 * record so `surfaceDataCoverage()` can count them and the estimate says so on
 * its face, exactly as the gear shop data does. The supplied workbook's own
 * source register is blunt about this: line throughputs, line fills, chemistry
 * costs, energy intensities and shape factors are "engineering estimates by
 * construction", not data.
 */
import type { GearParam } from './gear-shop-data.js';

/**
 * A value with its provenance. Structurally identical to the gear shop data's
 * record — one convention across the tool, aliased rather than duplicated so the
 * two cannot drift apart.
 */
export type ShopParam<T = number> = GearParam<T>;

const USD_PER_GBP = 1.33;
/** Convert once, at transcription, so no runtime FX can move a should-cost. */
const usd = (v: number): number => Math.round((v / USD_PER_GBP) * 1e6) / 1e6;

const OWN = 'Representative surface-treatment value — general automotive line practice, '
  + 'NOT a plant measurement, a supplier quote or a published standard. Replace before quoting.';
const BOOK = 'Surface Treatment & Coating Should-Cost Model workbook (13 Aug 2026), '
  + 'sheet 02_Process_Library. The workbook\'s own source register tags these as engineering '
  + 'estimates by construction, not measured data.';
const RECORDED = '2026-08-13';

const p = (value: number, note?: string): ShopParam => ({
  value, status: 'unverified', source: OWN, recordedAt: RECORDED, ...(note ? { note } : {}),
});
const b = (value: number, note?: string): ShopParam => ({
  value, status: 'unverified', source: BOOK, recordedAt: RECORDED, ...(note ? { note } : {}),
});

/** What kind of cost a stage incurs. Descriptive; `basis` decides how it is charged. */
export type SurfaceStageKind =
  /** Bath chemistry: charged per m² of wetted area, plus tank heating. */
  | 'bath'
  /** Thermal: an oven or a bake. */
  | 'thermal'
  /** Electrochemical: bath chemistry plus rectifier energy, dwell set by
   *  deposit thickness — the plating analogue of case depth. */
  | 'plating'
  /** Manual: charged in operator-seconds per part, not by area. */
  | 'manual'
  /** Media-driven: blasting, peening, vibratory finishing. */
  | 'mechanical'
  /** Paint, powder, e-coat, zinc flake — an applied organic or flake film. */
  | 'organic'
  /** Molten-bath immersion: galvanising, aluminising. */
  | 'hot_dip';

/**
 * What the stage's cost is charged against.
 *
 * Getting this wrong is the single most expensive modelling error in the
 * commodity: costing a coating per kg without stating the product form is wrong
 * by up to 8x between a thin stamping and a heavy forging.
 */
export type SurfaceCostBasis = 'area' | 'mass' | 'piece';

/** Metals this library can deposit. Silver and gold are deliberately absent —
 *  both are flagged "check before every use" and neither belongs on sheet
 *  metal, castings or forgings. */
export type SurfaceMetal =
  'zinc' | 'nickel' | 'copper' | 'tin' | 'aluminium' | 'zinc-nickel' | 'chromium';

/**
 * Deposited metal — split out because it is a live pass-through, not conversion
 * cost. Galvanisers publish an explicit monthly zinc surcharge (recently
 * 33-37%), so burying zinc inside a rate hides a third of the price behind a
 * number that does not move when the LME does.
 */
export interface DepositSpec {
  metal: SurfaceMetal;
  thicknessUm: ShopParam;
  densityKgPerM3: ShopParam;
  /** Fraction of the metal drawn from the bath that ends up on the part —
   *  cathode efficiency for plating, zinc utilisation net of dross and ash for
   *  hot dip. 1.00 means stoichiometric from the bath (electroless). */
  efficiency: ShopParam;
}

export interface SurfaceStage {
  /** Our id. Deliberately NOT the workbook's ST-nn — the two numberings differ
   *  (our rinse is 02, the workbook's 02 is shot blasting), and printing a
   *  colliding id on a report a reader may hold the workbook beside is worse
   *  than an unfamiliar one. `workbookRef` carries the mapping. */
  id: string;
  /** The corresponding process in the supplied workbook, where one exists. */
  workbookRef?: string;
  label: string;
  kind: SurfaceStageKind;
  basis: SurfaceCostBasis;
  /** Chemistry and consumables, GBP per unit of `basis` (m², kg or piece). */
  chemistryGBPPerUnit: ShopParam;
  /** Effluent, sludge and waste disposal, GBP per unit of `basis`. Separated
   *  from chemistry because it is the genuine EU/UK-vs-Asia structural gap and
   *  is regionalised differently. */
  effluentGBPPerUnit: ShopParam;
  /** Installed electrical/thermal load while the part is in the stage, kW.
   *  RECORDED, NOT COSTED — see the file header. */
  powerKw: ShopParam;
  /** True when `powerKw` is burned as GAS rather than electricity. */
  gasFired: boolean;
  /** Energy intensity per unit, for the Faraday audit. NOT COSTED. */
  electricityKwhPerUnit: ShopParam;
  gasKwhPerUnit: ShopParam;
  /** Minutes the part spends in this stage. Drives the throughput cap. */
  dwellMinutes: ShopParam;
  /** Operator-seconds per part. Non-zero only for manual stages. */
  manualSecPerPart: ShopParam;
  /** Installed cost of the stage — tank, oven, rectifier, GBP. RECORDED, NOT
   *  COSTED: capital is inside the line's machine rate. */
  capitalGBP: ShopParam;
  /**
   * Fraction of the available rack, barrel or conveyor area a real load fills.
   *
   * The workbook calls this the single highest-leverage number in its library
   * and it agrees with what we measured independently: at 0.55 fill, every
   * time-based cost per m² is nearly double what nameplate throughput implies.
   */
  lineFill: ShopParam;
  /** Metal actually deposited, where the stage deposits one. */
  deposit?: DepositSpec;
  /**
   * True when the stage holds ONE load at a time, so its dwell caps throughput.
   *
   * A cure oven is long: a dozen racks are inside it at once, so a 20-minute
   * bake does not stop the line running 20 racks an hour. A plating tank is
   * not: one rack is in it, and a 25 um deposit at 0.4 um/min occupies that
   * tank for an hour, so throughput collapses to one rack an hour whatever the
   * conveyor could do. Without this, deposit thickness changed the stated dwell
   * and nothing else — a 25 um spec cost what a 5 um spec cost.
   */
  throughputLimiting: boolean;
  note: string;
}

interface StageOpts {
  workbookRef?: string;
  effluent?: number;
  elecKwh?: number;
  gasKwh?: number;
  lineFill?: number;
  deposit?: DepositSpec;
  throughputLimiting?: boolean;
  /** True when chemistry/effluent came from the workbook rather than from us. */
  fromWorkbook?: boolean;
}

const S = (
  id: string, label: string, kind: SurfaceStageKind, basis: SurfaceCostBasis,
  chemPerUnit: number, powerKw: number, gasFired: boolean,
  dwellMin: number, manualSec: number, capitalGBP: number, note: string,
  opts: StageOpts = {},
): SurfaceStage => {
  const src = opts.fromWorkbook ? b : p;
  return {
    id,
    ...(opts.workbookRef ? { workbookRef: opts.workbookRef } : {}),
    label, kind, basis,
    chemistryGBPPerUnit: src(chemPerUnit),
    effluentGBPPerUnit: src(opts.effluent ?? 0),
    powerKw: p(powerKw),
    gasFired,
    electricityKwhPerUnit: src(opts.elecKwh ?? 0),
    gasKwhPerUnit: src(opts.gasKwh ?? 0),
    dwellMinutes: p(dwellMin),
    manualSecPerPart: p(manualSec),
    capitalGBP: p(capitalGBP),
    lineFill: b(opts.lineFill ?? 0.55,
      'workbook sheet 02 line-fill column; its highest-leverage single input'),
    ...(opts.deposit ? { deposit: opts.deposit } : {}),
    throughputLimiting: opts.throughputLimiting ?? false,
    note,
  };
};

const dep = (
  metal: SurfaceMetal, thicknessUm: number, densityKgPerM3: number, efficiency: number,
  effNote: string,
): DepositSpec => ({
  metal,
  thicknessUm: b(thicknessUm),
  densityKgPerM3: b(densityKgPerM3),
  efficiency: b(efficiency, effNote),
});

/**
 * Stages a route can be built from.
 *
 * Deliberately a LIST the caller assembles, not a fixed recipe: a powder line is
 * degrease -> rinse -> phosphate -> rinse -> dry -> powder -> cure, a casting
 * adds impregnation, a forging starts with shot blast. Hard-coding one recipe is
 * how a cost model ends up unable to price the shop it is pointed at.
 */
export const SURFACE_STAGES: Record<string, SurfaceStage> = {
  // ── Pre-treatment: bath chemistry, NOT a film build ───────────────────────
  degrease: S('SF-01', 'Alkaline degrease', 'bath', 'area',
    usd(0.12), 18, false, 2, 0, 45_000,
    'Removes drawing compound and oil. Tank held at 55-65 degC, so it draws power '
    + 'continuously whether or not a part is in it — the reason line loading matters. '
    + 'Mandatory before every coating, and most routes wash twice.',
    { workbookRef: 'ST-01', effluent: usd(0.08), elecKwh: 0.35, gasKwh: 0.15,
      lineFill: 0.60, fromWorkbook: true }),

  rinse: S('SF-02', 'Rinse (mains / cascade)', 'bath', 'area',
    0.03, 2, false, 1, 0, 12_000,
    'Between every chemical stage. Cheap individually; a line has three or four of them, '
    + 'and the drag-out they handle is what drives effluent volume. Counterflow rinsing '
    + 'cuts water and effluent 60-80% and is the first thing to check in a EU/UK review.',
    { effluent: 0.02, lineFill: 0.60 }),

  pickle: S('SF-03', 'Acid pickle (HCl / H2SO4) + rinse', 'bath', 'area',
    usd(0.18), 12, false, 3, 0, 55_000,
    'Descale and oxide removal on hot-rolled sheet, castings and forgings. SPENT ACID '
    + 'DISPOSAL, not the acid itself, is the cost — and it is 3-5x dearer in the EU and UK '
    + 'than in Asia, which is why the effluent line is separated out and regionalised.',
    { workbookRef: 'ST-05', effluent: usd(0.22), elecKwh: 0.10, gasKwh: 0.10,
      lineFill: 0.60, fromWorkbook: true }),

  phosphate: S('SF-04', 'Zinc phosphate conversion (tri-cation)', 'bath', 'area',
    usd(0.85), 22, false, 3, 0, 70_000,
    'The classic pre-paint conversion coat, 1.5-3.0 g/m² crystalline. Priced per m² of '
    + 'wetted area — it has no dry film thickness and no solids content, so the paint '
    + 'film-build formula cannot cost it. Sludge generation and disposal dominate; being '
    + 'displaced by zirconium chemistry on both cost and EHS grounds.',
    { workbookRef: 'ST-07', effluent: usd(0.35), elecKwh: 0.45, gasKwh: 0.55,
      lineFill: 0.60, fromWorkbook: true }),

  iron_phosphate: S('SF-05', 'Iron phosphate conversion', 'bath', 'area',
    usd(0.38), 14, false, 2, 0, 45_000,
    'The cheapest pre-treatment for powder coating, 0.3-0.8 g/m² amorphous. Lower corrosion '
    + 'performance than zinc phosphate — specify it for indoor duty and it is the right '
    + 'answer; specify it for chassis and it is not.',
    { workbookRef: 'ST-08', effluent: usd(0.20), elecKwh: 0.30, gasKwh: 0.40,
      lineFill: 0.60, fromWorkbook: true }),

  zirconium: S('SF-06', 'Zirconium conversion (Cr-free thin-film)', 'bath', 'area',
    usd(0.52), 8, false, 2, 0, 60_000,
    'Ambient temperature, no sludge, 20-80 mg/m² Zr. Lower energy and waste than phosphate '
    + 'and increasingly the default on mixed-metal bodies. Cheaper to run, dearer per litre.',
    { workbookRef: 'ST-09', effluent: usd(0.12), elecKwh: 0.28, gasKwh: 0.30,
      lineFill: 0.60, fromWorkbook: true }),

  di_rinse: S('SF-07', 'DI water final rinse', 'bath', 'area',
    0.06, 3, false, 1, 0, 25_000,
    'Deionised final rinse before paint. The DI plant and its regeneration are the cost, '
    + 'not the water.',
    { effluent: 0.02, lineFill: 0.60 }),

  // ── Mechanical: media-driven, and MASS-based ──────────────────────────────
  shot_blast: S('SF-08', 'Shot blast (steel shot / grit, tumble or hanger)', 'mechanical', 'mass',
    usd(0.012), 55, false, 4, 0, 260_000,
    'Descale for castings and forgings, Sa 2.5. MASS-DRIVEN, not area-driven: the barrel or '
    + 'hanger sets throughput by weight, and shot consumption plus wear parts dominate the '
    + 'consumable. This supersedes the forging model\'s flat descale cost per kg.',
    { workbookRef: 'ST-02', effluent: usd(0.004), elecKwh: 0.09,
      lineFill: 0.70, fromWorkbook: true }),

  mass_finish: S('SF-09', 'Vibratory / mass finishing (deburr, polish)', 'mechanical', 'mass',
    usd(0.03), 22, false, 45, 0, 135_000,
    'Ra 0.4-1.6 um and an edge break on small castings, forgings and stampings. Media '
    + 'consumption plus long bowl cycles; compound and media are the variable cost. Mass-based '
    + 'because the bowl is filled by weight.',
    { workbookRef: 'ST-04', effluent: usd(0.01), elecKwh: 0.08,
      lineFill: 0.65, fromWorkbook: true }),

  // ── Thermal ────────────────────────────────────────────────────────────────
  dry_off: S('SF-10', 'Dry-off oven', 'thermal', 'area',
    0, 180, true, 8, 0, 120_000,
    'Drives off rinse water before paint. Gas-fired; smaller than the cure oven but it runs '
    + 'on the same continuous basis.',
    { lineFill: 0.55 }),

  flash_off: S('SF-11', 'Flash-off zone', 'thermal', 'area',
    0, 30, false, 5, 0, 40_000,
    'Solvent release before the bake. Low power, real line length.',
    { lineFill: 0.55 }),

  cure_oven: S('SF-12', 'Cure oven', 'thermal', 'area',
    0, 400, true, 20, 0, 350_000,
    'The dominant energy draw on a paint line. Its energy and capital are ALREADY inside the '
    + 'paint line\'s machine rate (£80k/yr of energy against ~580 kW over 3,280 productive '
    + 'hours reconciles as a gas-fired line), so this stage is NOT charged for them again — an '
    + 'earlier version of this model built a second energy chain here and double-counted about '
    + 'a third of the conversion cost. It runs whether or not your part is in it, which is why '
    + 'a densely-racked part should carry less of it.',
    { lineFill: 0.55 }),

  // ── Manual — PIECE basis ───────────────────────────────────────────────────
  masking: S('SF-13', 'Masking / plugging', 'manual', 'piece',
    usd(0.09), 0, false, 0, 45, 3_000,
    'Caps, plugs, tape and lacquer over threads, bores and sealing faces. PER PIECE and per '
    + 'feature, and applied TWICE — mask and de-mask. On a part with six masked threads it can '
    + 'exceed the coating cost itself, and it is the most consistently omitted line in coating '
    + 'quotations. Design it out before you negotiate it down.',
    { workbookRef: 'ST-49', effluent: usd(0.002), lineFill: 0.90, fromWorkbook: true }),

  demask: S('SF-14', 'De-mask and inspect', 'manual', 'piece',
    0, 0, false, 0, 25, 2_000,
    'Faster than masking but not free, and it is where visual rejects are caught.',
    { workbookRef: 'ST-49', lineFill: 0.90 }),

  // ── Electroplating — AREA, with a deposited-metal pass-through ────────────
  zinc_plate: S('SF-15', 'Zinc plate (alkaline non-cyanide, barrel) + Cr(III) passivate',
    'plating', 'area',
    usd(0.55), 45, false, 20, 0, 680_000,
    'The workhorse finish for small steel parts worldwide, 8 um Zn at 96-240 h NSS with a '
    + 'sealer. Dwell is set by deposit thickness at roughly 0.4 um/min — the plating analogue '
    + 'of carburising case depth. Barrel load density is the lever. NOTE: doubling thickness '
    + 'does NOT double the rate — plating is ~48% of a 114-minute 16-stage cycle, so 8 to 16 um '
    + 'raises it about 40-45%, not 100%.',
    { workbookRef: 'ST-15', effluent: usd(0.45), elecKwh: 1.3, gasKwh: 0.2, lineFill: 0.55,
      deposit: dep('zinc', 8, 7140, 0.80, 'cathode efficiency, alkaline non-cyanide zinc'),
      throughputLimiting: true, fromWorkbook: true }),

  zinc_nickel: S('SF-16', 'Zinc-nickel plate (12-15% Ni, alkaline barrel)', 'plating', 'area',
    usd(1.55), 60, false, 27, 0, 1_050_000,
    'Automotive brake, fuel and chassis duty at 720-1000 h NSS. Cathode efficiency of only '
    + '~55% doubles BOTH the nickel content and the rectifier energy against plain zinc, which '
    + 'is why it is dear on two axes rather than one.',
    { workbookRef: 'ST-17', effluent: usd(0.85), elecKwh: 2.6, gasKwh: 0.2, lineFill: 0.55,
      deposit: dep('zinc-nickel', 8, 7300, 0.55, 'low cathode efficiency — the cost driver'),
      throughputLimiting: true, fromWorkbook: true }),

  anodise: S('SF-17', 'Sulphuric anodise Type II + seal', 'plating', 'area',
    usd(1.60), 55, false, 30, 0, 600_000,
    'Aluminium only, 10-25 um clear or dyed. Rectifier energy PLUS a chilling load — the bath '
    + 'must be held at 18-21 degC. Hard anodise (Type III) runs far longer again and needs the '
    + 'bath near 0 degC.',
    { workbookRef: 'ST-28', effluent: usd(0.75), elecKwh: 4.2, gasKwh: 0.45, lineFill: 0.50,
      throughputLimiting: true, fromWorkbook: true }),

  passivate: S('SF-18', 'Trivalent passivate + sealer', 'bath', 'area',
    usd(0.70), 6, false, 3, 0, 165_000,
    'Follows zinc and zinc-alloy plating for corrosion life. Hexavalent chrome is not offered '
    + '— it is on REACH Annex XIV with sunset dates already passed and should not appear in a '
    + 'forward-looking should-cost. Usually bundled inside a plating quote: UNBUNDLE IT, '
    + 'because sealer choice moves salt-spray hours 2-3x at very low cost and is the highest-'
    + 'leverage VAVE item on the line.',
    { workbookRef: 'ST-57', effluent: usd(0.25), elecKwh: 0.25, gasKwh: 0.35,
      lineFill: 0.55, fromWorkbook: true }),

  strip_replate: S('SF-19', 'Strip and re-plate (rework of rejects)', 'plating', 'area',
    usd(2.20), 40, false, 30, 0, 150_000,
    'THE HIDDEN COST OF A PLATING REJECT. Budget this PLUS the full original plating cost '
    + 'again — strip-and-re-plate costs roughly 4-5x a first-pass part, which is why a 3% '
    + 'plating reject is nearer a 12-15% cost adder than a 3% one.',
    { workbookRef: 'ST-58', effluent: usd(1.80), elecKwh: 1.1, gasKwh: 0.1,
      lineFill: 0.45, fromWorkbook: true }),

  // ── Non-electrolytic and hot dip ──────────────────────────────────────────
  zinc_flake: S('SF-20', 'Zinc flake dip-spin (Cr-free, e.g. Geomet / Delta-Tone)',
    'organic', 'area',
    usd(2.40), 35, true, 12, 0, 640_000,
    '2-3 layers at 720-1000 h NSS on fasteners, springs and clips. NO HYDROGEN EMBRITTLEMENT '
    + 'RISK — no applied current — which is why it wins on grade 10.9/12.9 fasteners and '
    + 'springs despite a higher headline rate than zinc plating. Compare routes, not processes: '
    + 'electroplated high-strength steel needs the bake in SF-22.',
    { workbookRef: 'ST-19', effluent: usd(0.10), elecKwh: 0.35, gasKwh: 1.1,
      lineFill: 0.55, fromWorkbook: true }),

  galvanise: S('SF-21', 'Hot dip galvanise, batch kettle (EN ISO 1461)', 'hot_dip', 'mass',
    usd(0.022), 900, true, 6, 0, 2_630_000,
    '85 um mean and a 50-year life on fabrications, heavy sheet and structural work. MASS-BASED '
    + 'because the kettle sets throughput in tonnes per hour — but the ZINC UPTAKE SCALES WITH '
    + 'SURFACE AREA, so a thin section costs far more per tonne than a heavy one. That split is '
    + 'the whole reason deposited metal is a separate line in this model. A grit-blast plus '
    + 'three-coat 250 um paint system tendered 35% dearer than galvanising on a 240-tonne '
    + 'building, so it is the cost benchmark for heavy steel, not the premium option.',
    { workbookRef: 'ST-33', effluent: usd(0.014), elecKwh: 0.012, gasKwh: 0.3, lineFill: 0.50,
      deposit: dep('zinc', 85, 7140, 0.55, 'zinc utilisation net of dross and ash'),
      fromWorkbook: true }),

  // ── Organic coatings — COATING ONLY, pre-treatment is a separate stage ────
  e_coat: S('SF-22', 'Cathodic electrocoat (CED / KTL)', 'organic', 'area',
    usd(0.55), 260, true, 18, 0, 2_410_000,
    'COATING ONLY — add a pre-treatment stage separately or you are comparing a five-stage '
    + 'tunnel against a wipe-down. 18-25 um at 500-1000 h NSS. Paint solids at 20 um are only '
    + 'about £0.19/m²: the cost is capital and cure energy, not paint. UNECONOMIC BELOW ROUGHLY '
    + '150,000 m²/yr, where powder coating beats it despite worse performance.',
    { workbookRef: 'ST-39', effluent: usd(0.30), elecKwh: 1.2, gasKwh: 1.5,
      lineFill: 0.55, fromWorkbook: true }),

  powder_coat: S('SF-23', 'Powder coating, polyester (60-80 um)', 'organic', 'area',
    usd(0.95), 190, true, 15, 0, 530_000,
    'COATING ONLY — pre-treatment must be a separate route step. Powder at 70 um is 0.114 kg/m² '
    + 'net of reclaim, so MATERIAL IS ONLY ABOUT 10% OF THE RATE and line fill is most of the '
    + 'rest. Any negotiation aimed at powder price is aimed at the wrong 12%.',
    { workbookRef: 'ST-40', effluent: usd(0.20), elecKwh: 1.1, gasKwh: 1.6,
      lineFill: 0.55, fromWorkbook: true }),

  // ── Casting- and plating-specific ancillaries, MASS basis ─────────────────
  impregnation: S('SF-24', 'Vacuum resin impregnation (casting porosity seal)', 'bath', 'mass',
    usd(0.11), 30, false, 20, 0, 340_000,
    'Methacrylate resin, cured — pressure tightness on aluminium and iron castings. Cheap per '
    + 'kg, but the pressure-test reject it prevents is not: the value is in avoided scrap, not '
    + 'in the operation. Casting-specific, and absent from the casting model until now.',
    { workbookRef: 'ST-48', effluent: usd(0.012), elecKwh: 0.10,
      lineFill: 0.60, fromWorkbook: true }),

  h2_bake: S('SF-25', 'Hydrogen de-embrittlement bake (post-plate)', 'thermal', 'mass',
    usd(0.001), 90, false, 240, 0, 190_000,
    'MANDATORY on any electroplated steel above roughly 1000 MPa or 31 HRC, per ASTM B850 / '
    + 'ISO 4042, and it must START WITHIN 4 HOURS of plating. 190-230 degC for 4-24 h. Cheap '
    + 'per kg but it adds a shift of lead time and WIP, and its existence is the main reason '
    + 'zinc flake (SF-20) wins on high-strength fasteners.',
    { workbookRef: 'ST-51', effluent: usd(0.001), elecKwh: 0.35,
      lineFill: 0.60, fromWorkbook: true }),
};

/**
 * Deposited-metal prices, GBP/kg, converted once from the workbook's USD.
 *
 * A live pass-through rather than conversion cost: galvanisers publish an
 * explicit monthly zinc surcharge set from the prior month's LME price, with
 * recent surcharges of 33-37%. Held static here deliberately — a should-cost
 * that changes because the market moved overnight is not reproducible. Refresh
 * these knowingly, and note that a metal-led process (tin, and silver/gold which
 * this library excludes) has almost no conversion cost left to negotiate.
 */
export const SURFACE_METAL_PRICES: Record<SurfaceMetal, ShopParam> = {
  zinc: b(usd(3.67), 'LME spot reference Aug 2026, USD 3,672/t'),
  nickel: b(usd(16.31), 'LME 3-month reference Jun-Aug 2026'),
  copper: b(usd(14.62), 'COMEX USD 6.63/lb, Aug 2026'),
  tin: b(usd(50.22), 'LME reference Aug 2026 — metal-led even at 8 um'),
  aluminium: b(usd(3.22), 'LME reference Aug 2026, USD 3,221/t'),
  'zinc-nickel': b(usd(5.57), 'blended 85% Zn / 15% Ni by mass'),
  chromium: b(usd(6.00),
    'effective cost of chromium deposited from CrO3 incl. bath make-up and drag-out — '
    + 'NOT a metal market price. Workbook tags this [Guessing].'),
};

/**
 * Electrochemical constants for the Faraday audit.
 *
 * These are physical constants, not estimates — the one place in this library
 * where a number is checked against a law rather than against judgement. The
 * workbook's own audit caught two real errors with them (hard chrome assumed at
 * 22 kWh/m² when Faraday requires 44 of DC alone; hard anodise at 11.5 against
 * ~13 plus an equal chiller load).
 */
export const FARADAY_CONSTANT_C_PER_MOL = 96_485;

export interface ElectrochemistrySpec {
  molarMassGPerMol: number;
  electrons: number;
  /** Cathode efficiency on an ENERGY basis. For chrome this differs from the
   *  `deposit.efficiency` above, which is a chemical-consumption proxy — do not
   *  confuse the two. */
  cathodeEfficiency: number;
  /** Cell voltage including barrel or rack resistance, V. */
  cellVolts: number;
}

export const ELECTROCHEMISTRY: Partial<Record<SurfaceMetal, ElectrochemistrySpec>> = {
  zinc: { molarMassGPerMol: 65.38, electrons: 2, cathodeEfficiency: 0.80, cellVolts: 4.5 },
  nickel: { molarMassGPerMol: 58.69, electrons: 2, cathodeEfficiency: 0.95, cellVolts: 4.0 },
  copper: { molarMassGPerMol: 63.55, electrons: 2, cathodeEfficiency: 0.95, cellVolts: 3.5 },
  tin: { molarMassGPerMol: 118.71, electrons: 2, cathodeEfficiency: 0.90, cellVolts: 3.0 },
  'zinc-nickel': { molarMassGPerMol: 64.40, electrons: 2, cathodeEfficiency: 0.55, cellVolts: 5.0 },
  chromium: { molarMassGPerMol: 52.00, electrons: 6, cathodeEfficiency: 0.15, cellVolts: 6.0 },
};

/** Deposit rate for the thickness-driven plating stages, micron per minute. */
export const PLATING_DEPOSIT_UM_PER_MIN: Record<string, ShopParam> = {
  zinc_plate: p(0.40, 'alkaline zinc, typical rack current density'),
  zinc_nickel: p(0.30, 'slower deposit than plain zinc'),
  anodise: p(0.50, 'sulphuric, standard duty'),
};

/** The thickness the catalogued dwell times assume, micron. */
export const REFERENCE_DEPOSIT_UM = 8;

/**
 * Line economics — the things a coating line has that a single machine rate
 * cannot express. `REGIONAL_DATA` supplies energy, labour and the capital /
 * overhead multipliers; these are what it has no equivalent for.
 */
export interface SurfaceLineEconomics {
  operatingHoursPerYear: ShopParam;
  oee: ShopParam;
  wacc: ShopParam;
  depreciationLifeYears: ShopParam;
  maintenancePctOfCapital: ShopParam;
  /** Building, extraction, compressed air, effluent plant, supervision. */
  overheadPerLinePerYearGBP: ShopParam;
  /** Operators manning the line as a whole, excluding manual stages which are
   *  costed in their own operator-seconds. */
  lineManning: ShopParam;
  /** Annual coated area below which a capital-heavy line (e-coat, duplex) loses
   *  to powder coating despite better performance. */
  eCoatViableAreaM2PerYear: ShopParam;
}

export const DEFAULT_SURFACE_LINE: SurfaceLineEconomics = {
  operatingHoursPerYear: p(3800, 'two shifts with changeover and maintenance windows'),
  oee: p(0.80),
  wacc: p(0.065),
  depreciationLifeYears: p(12, 'tanks and ovens outlast most machine tools'),
  maintenancePctOfCapital: p(0.045, 'pumps, filters, burners, effluent plant, tank relining'),
  overheadPerLinePerYearGBP: p(140_000,
    'building, extraction and RTO, compressed air, effluent consent, supervision'),
  lineManning: p(2, 'loader and unloader; sprayers are inside the booth stages'),
  eCoatViableAreaM2PerYear: b(150_000,
    'workbook sheet 01: below this, e-coat and duplex lose to powder on cost'),
};

/** Look a stage up by key, by our id, or by the workbook\'s process id. */
export function findSurfaceStage(key: string): SurfaceStage | null {
  return SURFACE_STAGES[key]
    ?? Object.values(SURFACE_STAGES).find(s => s.id === key)
    ?? Object.values(SURFACE_STAGES).find(s => s.workbookRef === key)
    ?? null;
}

/**
 * Parameters carried here that CANNOT move the cost in this model.
 *
 * Three reasons, all deliberate:
 *   - `powerKw`, `electricityKwhPerUnit`, `gasKwhPerUnit` — energy is already
 *     inside the line's machine rate. These exist for the Faraday audit.
 *   - `capitalGBP` and the whole line-economics block — this model does NOT
 *     build a line rate (see the header of `surface-treatment-rate.ts`), so
 *     capital, WACC, depreciation, maintenance and overhead are reference.
 *   - `lineFill` — our throughput is expressed CONCRETELY as parts-per-rack x
 *     racks-per-hour, which already contains the fill. Multiplying by a fill
 *     fraction on top would double-count the same lever, so it is documentation
 *     of the class norm rather than an input.
 *
 * Counting these in the coverage headline overstated it: the report said "252
 * of 252 parameters are representative" when a large share of them could not
 * change the answer whatever they were set to. What a reader needs to know is
 * how much of the DATA THAT MOVES THE COST is real.
 */
const REFERENCE_ONLY_KEYS = new Set([
  'powerKw', 'capitalGBP', 'lineFill', 'electricityKwhPerUnit', 'gasKwhPerUnit',
  'operatingHoursPerYear', 'oee', 'wacc', 'depreciationLifeYears',
  'maintenancePctOfCapital', 'overheadPerLinePerYearGBP',
]);

export interface SurfaceDataCoverage {
  /** Parameters that actually move the cost. */
  total: number; unverified: number; plantSupplied: number; verified: number;
  hasUnverified: boolean;
  /** Carried for reference or for the physics audit; cannot move the cost. */
  referenceOnly: number;
}

/** How much of the COST-BEARING surface data is real. Mirrors `gearDataCoverage`. */
export function surfaceDataCoverage(
  stages: Record<string, SurfaceStage> = SURFACE_STAGES,
  line: SurfaceLineEconomics = DEFAULT_SURFACE_LINE,
): SurfaceDataCoverage {
  const counts = { unverified: 0, 'plant-supplied': 0, verified: 0 };
  let referenceOnly = 0;
  const walk = (o: unknown, key?: string): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if ('value' in rec && 'status' in rec) {
      if (key && REFERENCE_ONLY_KEYS.has(key)) { referenceOnly += 1; return; }
      const s = (rec as unknown as ShopParam).status;
      if (s in counts) counts[s] += 1;
      return;
    }
    for (const [k, v] of Object.entries(rec)) walk(v, k);
  };
  walk(stages); walk(line); walk(PLATING_DEPOSIT_UM_PER_MIN); walk(SURFACE_METAL_PRICES);
  const total = counts.unverified + counts['plant-supplied'] + counts.verified;
  return {
    total, unverified: counts.unverified, plantSupplied: counts['plant-supplied'],
    verified: counts.verified, hasUnverified: counts.unverified > 0, referenceOnly,
  };
}

/** The sentence every surface-treatment estimate carries until a plant replaces
 *  the data. Same contract as `gearDataWarning`. */
export function surfaceDataWarning(): string | null {
  const c = surfaceDataCoverage();
  if (!c.hasUnverified) return null;
  return `${c.unverified} of ${c.total} COST-BEARING surface-treatment parameters are `
    + 'representative values, not plant data (a further ' + c.referenceOnly + ' are carried for '
    + 'reference or for the physics audit and cannot move the cost). Chemistry and effluent costs, '
    + 'dwell times, plating rates and deposited-metal prices were not measured on your line. The '
    + 'structure is right and the number is NOT quotable until the line data is supplied — rack '
    + 'density alone moves it more than 50%.';
}
