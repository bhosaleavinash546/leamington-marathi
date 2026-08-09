/**
 * Gear shop data — the empirical half of the gear cost model, replaceable without a release.
 *
 * ## Why this is a separate, dated, replaceable file
 *
 * `gear-cycle.ts` computes cycle time from gear generation kinematics, which is
 * arithmetic and needs no source. Everything it CONSUMES is empirical: the
 * cutting speed a PM-HSS hob holds in 20MnCr5, the axial feed a quality grade
 * permits, how many cuts a module 6 gear needs, what a hob costs and how many
 * gears it cuts between regrinds. Those are properties of a particular shop with
 * particular machines, tools and coolant, and no amount of arithmetic derives
 * them.
 *
 * The defaults below are REPRESENTATIVE VALUES, not verified ones. They were not
 * taken from AGMA/ISO tolerance tables, machine-builder catalogues or tooling
 * data sheets, because the build environment's egress proxy reaches package
 * registries and nothing else. Stating that plainly is the point: an estimate
 * built on them is directionally useful and is NOT a defensible quote, and the
 * engine says so on every output until the table is replaced.
 *
 * Replacing it is a file, not a code change. `loadGearShopData()` takes a JSON
 * document with the same shape, every record carrying its own provenance, and
 * from then on `resolveGearParam` reports `status: 'plant-supplied'` and the
 * warnings stop. That is the same contract `tariff-snapshot.ts` uses for duty
 * rates, and for the same reason: data decays, code does not, and the two should
 * not share a release cycle.
 *
 * ## What to ask the plant for
 *
 * In rough order of how much each moves the number:
 *   1. Machine list — class, max module, max diameter, max face width, £/hr.
 *   2. Cutting speed and axial feed by material and module, roughing/finishing.
 *   3. Hob / cutter / wheel price, and parts between regrinds or dresses.
 *   4. Heat treat £/kg and the grinding stock it leaves.
 *   5. Load/unload and inspection times.
 */

/** How much a value can be trusted, and therefore whether the estimate can be quoted. */
export type GearDataStatus =
  /** A representative value. Directionally useful; not quotable. */
  | 'unverified'
  /** Supplied by the plant that will make the part. Quotable. */
  | 'plant-supplied'
  /** From a published standard or machine-builder datasheet, with a URL. */
  | 'verified';

export interface GearParam<T = number> {
  value: T;
  status: GearDataStatus;
  /** Where it came from. Mandatory — a value with no provenance cannot ship. */
  source: string;
  /** ISO date the value was recorded. */
  recordedAt: string;
  note?: string;
}

/** Material families the gear model distinguishes. Cutting behaviour, not chemistry. */
export type GearMaterialClass =
  | 'case_hardening_steel'    // 20MnCr5, 8620 — the automotive default
  | 'through_hardening_steel' // 42CrMo4, EN19
  | 'alloy_steel_prehardened'
  | 'stainless'
  | 'cast_iron'
  | 'bronze'
  | 'plastic';

/** Cutting parameters for one material class at one module band. */
export interface GearCuttingParams {
  materialClass: GearMaterialClass;
  /** Inclusive lower bound of the normal-module band this row covers, mm. */
  moduleFromMm: number;
  moduleToMm: number;
  hobSpeedMPerMin: GearParam;
  hobFeedMmPerRev: GearParam;
  hobCuts: GearParam;
  skiveSpeedMPerMin: GearParam;
  skiveFeedMmPerRev: GearParam;
  skiveCuts: GearParam;
  shaperStrokesPerMin: GearParam;
  shaperCircularFeedMmPerStroke: GearParam;
  shaperPasses: GearParam;
}

export interface GearToolParams {
  /** Hob price and life. */
  hobCostGBP: GearParam;
  hobPartsBetweenRegrinds: GearParam;
  hobRegrindCostGBP: GearParam;
  hobRegrindsBeforeScrap: GearParam;
  /** Skiving cutter — carbide, dearer and shorter-lived than a hob. */
  skivingCutterCostGBP: GearParam;
  skivingCutterPartsBetweenRegrinds: GearParam;
  skivingCutterRegrindCostGBP: GearParam;
  skivingCutterRegrindsBeforeScrap: GearParam;
  /** Shaper cutter. */
  shaperCutterCostGBP: GearParam;
  shaperCutterPartsBetweenRegrinds: GearParam;
  shaperCutterRegrindCostGBP: GearParam;
  shaperCutterRegrindsBeforeScrap: GearParam;
  /** Grinding wheel. Dressed rather than reground, so life is in parts per wheel. */
  grindingWheelCostGBP: GearParam;
  grindingWheelPartsPerWheel: GearParam;
}

export interface GearFinishingParams {
  /** Volumetric grinding rate, mm³ per mm of wheel width per second. */
  gearGrindSpecificRateMm3PerMmSec: GearParam;
  gearGrindWheelWidthMm: GearParam;
  gearGrindDressingSecPerPart: GearParam;
  /** Stock left per flank for grinding after heat treat, mm. Distortion-driven. */
  grindingStockPerFlankMm: GearParam;
  /** Honing, after grinding, for NVH. Seconds per part. */
  honingSecPerPart: GearParam;
  /** Shaving, before heat treat, as an alternative to grinding. Seconds per part. */
  shavingSecPerPart: GearParam;
}

export interface GearAncillaryParams {
  /** Carburise + quench + temper, £/kg of gear. */
  caseHardenCostPerKgGBP: GearParam;
  /** Chamfer and deburr, seconds per part. */
  deburrSecPerPart: GearParam;
  /** Inspection on a gear checker, seconds per part, amortised over the sample rate. */
  inspectionSecPerPart: GearParam;
  /** Load, clamp, index and unload on a cutting machine, seconds. */
  loadUnloadSec: GearParam;
}

export interface GearShopData {
  schemaVersion: 1;
  dataId: string;
  generatedAt: string;
  /** Whose shop this describes. 'representative' means nobody's. */
  shop: string;
  cutting: GearCuttingParams[];
  tools: GearToolParams;
  finishing: GearFinishingParams;
  ancillary: GearAncillaryParams;
}

// ─── Representative defaults ─────────────────────────────────────────────────

const UNVERIFIED = 'Representative value — NOT from a standard, catalogue or plant. Replace before quoting.';
const RECORDED = '2026-08-09';

const p = (value: number, note?: string): GearParam => ({
  value, status: 'unverified', source: UNVERIFIED, recordedAt: RECORDED, ...(note ? { note } : {}),
});

/**
 * Three module bands for the automotive default material, and one coarse band.
 *
 * Deliberately sparse. A dense table of invented numbers looks more authoritative
 * than a sparse one and is no more true; the bands that exist are the ones a
 * transmission gear actually falls in, and `resolveCutting` says plainly when a
 * gear falls outside them rather than extrapolating.
 */
export const DEFAULT_GEAR_SHOP_DATA: GearShopData = {
  schemaVersion: 1,
  dataId: 'representative-2026-08',
  generatedAt: RECORDED,
  shop: 'representative (no plant data supplied)',
  cutting: [
    {
      materialClass: 'case_hardening_steel', moduleFromMm: 0, moduleToMm: 3,
      hobSpeedMPerMin: p(160, 'PM-HSS, coated, dry'), hobFeedMmPerRev: p(2.2), hobCuts: p(1),
      skiveSpeedMPerMin: p(180), skiveFeedMmPerRev: p(0.35), skiveCuts: p(3),
      shaperStrokesPerMin: p(900), shaperCircularFeedMmPerStroke: p(0.35), shaperPasses: p(2),
    },
    {
      materialClass: 'case_hardening_steel', moduleFromMm: 3, moduleToMm: 6,
      hobSpeedMPerMin: p(140), hobFeedMmPerRev: p(2.6), hobCuts: p(1),
      skiveSpeedMPerMin: p(160), skiveFeedMmPerRev: p(0.30), skiveCuts: p(4),
      shaperStrokesPerMin: p(700), shaperCircularFeedMmPerStroke: p(0.30), shaperPasses: p(3),
    },
    {
      materialClass: 'case_hardening_steel', moduleFromMm: 6, moduleToMm: 12,
      hobSpeedMPerMin: p(110), hobFeedMmPerRev: p(3.0), hobCuts: p(2, 'rough + finish'),
      skiveSpeedMPerMin: p(120), skiveFeedMmPerRev: p(0.25), skiveCuts: p(5),
      shaperStrokesPerMin: p(450), shaperCircularFeedMmPerStroke: p(0.25), shaperPasses: p(4),
    },
    {
      materialClass: 'through_hardening_steel', moduleFromMm: 0, moduleToMm: 6,
      hobSpeedMPerMin: p(120), hobFeedMmPerRev: p(2.2), hobCuts: p(1),
      skiveSpeedMPerMin: p(140), skiveFeedMmPerRev: p(0.28), skiveCuts: p(4),
      shaperStrokesPerMin: p(650), shaperCircularFeedMmPerStroke: p(0.28), shaperPasses: p(3),
    },
    {
      materialClass: 'cast_iron', moduleFromMm: 0, moduleToMm: 12,
      hobSpeedMPerMin: p(180), hobFeedMmPerRev: p(3.0), hobCuts: p(1),
      skiveSpeedMPerMin: p(190), skiveFeedMmPerRev: p(0.35), skiveCuts: p(3),
      shaperStrokesPerMin: p(800), shaperCircularFeedMmPerStroke: p(0.35), shaperPasses: p(2),
    },
  ],
  tools: {
    hobCostGBP: p(1400), hobPartsBetweenRegrinds: p(1200),
    hobRegrindCostGBP: p(180), hobRegrindsBeforeScrap: p(12),
    skivingCutterCostGBP: p(3200), skivingCutterPartsBetweenRegrinds: p(2500),
    skivingCutterRegrindCostGBP: p(400), skivingCutterRegrindsBeforeScrap: p(8),
    shaperCutterCostGBP: p(900), shaperCutterPartsBetweenRegrinds: p(800),
    shaperCutterRegrindCostGBP: p(140), shaperCutterRegrindsBeforeScrap: p(15),
    grindingWheelCostGBP: p(1100), grindingWheelPartsPerWheel: p(3000),
  },
  finishing: {
    gearGrindSpecificRateMm3PerMmSec: p(2.5), gearGrindWheelWidthMm: p(25),
    gearGrindDressingSecPerPart: p(8),
    grindingStockPerFlankMm: p(0.08, 'post-carburise distortion allowance'),
    honingSecPerPart: p(45), shavingSecPerPart: p(35),
  },
  ancillary: {
    caseHardenCostPerKgGBP: p(1.60, 'carburise + quench + temper, batch furnace'),
    deburrSecPerPart: p(25), inspectionSecPerPart: p(20), loadUnloadSec: p(18),
  },
};

// ─── Active data, loading, and honesty ───────────────────────────────────────

let ACTIVE: GearShopData = DEFAULT_GEAR_SHOP_DATA;

/**
 * Install plant data. Validated defensively: a malformed document must fail
 * loudly rather than silently reverting to representative values, because a
 * silent revert is exactly the failure this module exists to prevent.
 */
export function loadGearShopData(doc: unknown): GearShopData {
  const d = doc as GearShopData;
  if (!d || typeof d !== 'object') throw new Error('Gear shop data: not an object');
  if (d.schemaVersion !== 1) {
    throw new Error(`Gear shop data: unsupported schemaVersion ${String((d as { schemaVersion?: unknown }).schemaVersion)} (expected 1)`);
  }
  if (!d.dataId || !d.generatedAt || !d.shop) {
    throw new Error('Gear shop data: dataId, generatedAt and shop are required');
  }
  if (!Array.isArray(d.cutting) || d.cutting.length === 0) {
    throw new Error('Gear shop data: cutting[] missing or empty');
  }
  for (const row of d.cutting) {
    if (!(row.moduleToMm > row.moduleFromMm)) {
      throw new Error(`Gear shop data: ${row.materialClass} band ${row.moduleFromMm}-${row.moduleToMm} is not ascending`);
    }
  }
  // Provenance is mandatory on every leaf, not just the header.
  const walk = (o: unknown, path: string): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if ('value' in rec && 'status' in rec) {
      const gp = rec as unknown as GearParam;
      if (!gp.source || !gp.recordedAt) {
        throw new Error(`Gear shop data: ${path} has no source/recordedAt — provenance is mandatory`);
      }
      if (typeof gp.value !== 'number' || !Number.isFinite(gp.value) || gp.value < 0) {
        throw new Error(`Gear shop data: ${path} has a non-finite or negative value`);
      }
      return;
    }
    for (const [k, v] of Object.entries(rec)) walk(v, `${path}.${k}`);
  };
  walk(d.cutting, 'cutting');
  walk(d.tools, 'tools');
  walk(d.finishing, 'finishing');
  walk(d.ancillary, 'ancillary');

  ACTIVE = d;
  return d;
}

export function activeGearShopData(): GearShopData {
  return ACTIVE;
}

/** Revert to representative values. Used by tests, and by "what if I had no data". */
export function resetGearShopData(): void {
  ACTIVE = DEFAULT_GEAR_SHOP_DATA;
}

/**
 * Cutting parameters for a material and module.
 *
 * Returns `null` when the gear falls outside every band rather than
 * extrapolating off the end of the table. An extrapolated feed is a fabricated
 * input, and a fabricated input produces a fabricated cycle time — the caller's
 * job is to stop and say the gear is outside the data, not to guess.
 */
export function resolveCutting(
  materialClass: GearMaterialClass,
  normalModuleMm: number,
  data: GearShopData = ACTIVE,
): GearCuttingParams | null {
  return data.cutting.find(r =>
    r.materialClass === materialClass
    && normalModuleMm >= r.moduleFromMm
    && normalModuleMm <= r.moduleToMm) ?? null;
}

export interface GearDataCoverage {
  total: number;
  unverified: number;
  plantSupplied: number;
  verified: number;
  /** True when ANY value the estimate could touch is still representative. */
  hasUnverified: boolean;
  shop: string;
  dataId: string;
}

/** Count the provenance of every leaf, so the report can state it in one line. */
export function gearDataCoverage(data: GearShopData = ACTIVE): GearDataCoverage {
  const counts = { unverified: 0, 'plant-supplied': 0, verified: 0 };
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if ('value' in rec && 'status' in rec) {
      const s = (rec as unknown as GearParam).status;
      if (s in counts) counts[s] += 1;
      return;
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(data.cutting); walk(data.tools); walk(data.finishing); walk(data.ancillary);
  const total = counts.unverified + counts['plant-supplied'] + counts.verified;
  return {
    total,
    unverified: counts.unverified,
    plantSupplied: counts['plant-supplied'],
    verified: counts.verified,
    hasUnverified: counts.unverified > 0,
    shop: data.shop,
    dataId: data.dataId,
  };
}

/**
 * The sentence that must appear on any estimate built on representative values.
 *
 * Returned rather than logged, so the caller has to put it somewhere a person
 * will read. Null when every value carries real provenance.
 */
export function gearDataWarning(data: GearShopData = ACTIVE): string | null {
  const c = gearDataCoverage(data);
  if (!c.hasUnverified) return null;
  return `${c.unverified} of ${c.total} gear shop parameters are representative values, not `
    + `verified data (source set: "${c.shop}"). Cutting speeds, feeds, tool life and heat-treat `
    + `rates were not taken from a standard, a machine-builder catalogue or your plant. This `
    + `estimate shows the right structure and is NOT a quotable number until the shop data is `
    + `replaced.`;
}
