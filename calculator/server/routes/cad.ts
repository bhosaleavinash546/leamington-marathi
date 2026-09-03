import { Router } from 'express';
import { resolveApiKey } from '../utils/api-key.js';
import multer from 'multer';
import { queueDFMJobFromBuffer } from '../utils/dfm-job-runner.js';
import { GEOMETRIC_DFM_COMMODITIES } from '../../src/engine/dfm-geometry/index.js';
import type { CommodityType } from '../../src/engine/types.js';
import rateLimit from 'express-rate-limit';
import { createAnthropic } from '../utils/ai-client.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { hashUpload, putUploadFile, getUploadFile, putGeometry, getGeometry, sweepUploadFiles } from '../utils/geometry-store.js';
import type Anthropic from '@anthropic-ai/sdk';
import { preprocessCADFile } from '../utils/preprocessor.js';
import { analyzeGeometry, tessellateToSTL } from '../utils/geometry-bridge.js';
import type { OCCTGeometry } from '../utils/geometry-bridge.js';
import { parseSTL } from '../services/stl-parser.js';
import type { STLGeometry } from '../services/stl-parser.js';
import { createAnalysisCache } from '../utils/analysis-cache.js';
import { runCADSanityChecks, type CADGeometryContext, type CADSanityWarning } from '../utils/cad-sanity.js';
import { capNearNetMachiningHr, applyNearNetMachiningCap } from '../utils/cad-machining-guard.js';
import { normalizeFieldConfidences } from '../utils/cad-schema.js';
import { familyFromFilename, proseFamily, promoteHighestConfidence, type MaterialSuggestion } from '../../src/engine/material-family.js';
import { specForCommodity, DETERMINISTIC_COMMODITIES } from '../../src/engine/cost-input-rules/index.js';
import { buildDeterministicAnalysis } from '../../src/engine/cost-input-rules/deterministic.js';
import { diffAnalyses } from '../../src/engine/cost-input-rules/diff.js';
import type { CADAnalysisResult } from '../../src/engine/ai-analysis.js';
import { inferCommodity } from '../../src/engine/cost-input-rules/derive/commodity.js';
import { familyFromMaterialId } from '../../src/engine/cost-input-rules/derive/material.js';
import { systemForFibreId } from '../../src/engine/cost-input-rules/derive/laminate.js';
import { renderCommodityRulesPrompt, runCostInputRules } from '../../src/engine/cost-input-rules/engine.js';
import { applyRuleDecisions, toRuleFields, suppressAIForUndecided, type AISuppression } from '../../src/engine/cost-input-rules/apply.js';
import { RULE_ENGINE_VERSION, type RuleContext, type Decision } from '../../src/engine/cost-input-rules/types.js';

const router = Router();

// Persistent repeatability cache: same CAD file + photo + overrides -> the
// byte-identical analysis, across restarts (same guarantee as the PCB pipeline).
const cadCache = createAnalysisCache('cad_analysis_cache');
// Bump when the prompt/normalisation logic changes so stale cached analyses (which
// are keyed on inputs, not prompt content) are invalidated. v2: filename material
// prior + confidence-inversion promotion.
// v13: cost-ranked machining routing (optimiser picks the machine; basis shows alternatives).
// v14: live-audit fixes — forced-commodity weight family (F2), sheet-metal
//      mass-consistent gauge floor (F4), cast_and_machine operations as data
//      not prose (F7), valid prompt material ids (F5), honest material
//      provenance labels. Bumped so cached pre-fix analyses cannot be served.
// v15: gap closures — AI values suppressed for blocked-rule fields, AI-sourced
//      material keeps the decision open as a blocking confirm, gear hand-off,
//      blocking sanity codes.
// v16: engineer material confirm wins over AI on reanalyse (withAIMaterial),
//      and casting/cast_and_machine emit the material GRADE from the confirmed
//      family (was AI grade on cast-iron mass). Final-verification-run fixes.
const CAD_PROMPT_VERSION = 21;

// Stage-1 commodity pre-selection shape (module-level so the JSON.parse casts
// below get a concrete type instead of `typeof` inference collapsing to never).
type Stage1Selection = { primary: string; conf: number; alt: Array<{ type: string; conf: number }> };

// Model tiering: Sonnet 5 is the standard extraction tier (near-Opus on
// structured analysis, faster, ~40% cheaper); the Deep-analysis toggle
// escalates to Opus 4.8 for complex or high-value parts.
const CAD_MODEL = 'claude-sonnet-5';
const CAD_DEEP_MODEL = 'claude-opus-4-8';
const cadModel = (deep: boolean): string => (deep ? CAD_DEEP_MODEL : CAD_MODEL);
const isDeepReq = (req: { body?: Record<string, unknown> }): boolean =>
  req.body?.deepAnalysis === 'true' || req.body?.deepAnalysis === true;
// Max CAD upload size. Large STEP assemblies routinely exceed the old 50 MB
// cap, so the default is 250 MB and it is env-tunable (CV_MAX_UPLOAD_MB). Note
// the file is buffered in memory (multer.memoryStorage), so this also sets the
// worst-case RSS per in-flight upload — raise the container's memory to match if
// you push it much higher.
const MAX_UPLOAD_MB = parseInt(process.env.CV_MAX_UPLOAD_MB ?? '250', 10) || 250;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
// Every limit stated, because the ones left to busboy's defaults bit us: its
// default 1 MiB per text field contradicted the route's own acceptance of four
// 800 000-char render views and an uncapped part photo, so a phone photo
// failed the whole upload as "Field value too long".
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, fieldSize: 8 * 1024 * 1024, files: 2, fields: 40, parts: 60 },
});
const MAX_DRAWING_PDF_BYTES = 30 * 1024 * 1024;
sweepUploadFiles();

/**
 * Queue the background geometric DFM for an analysed part.
 *
 * Called from EVERY response path in /analyze. The first version only patched
 * the AI path, and the deterministic path — the one that needs no API key and
 * is therefore the one a demo uses — has its own early return, so the feature
 * was dead exactly where it mattered. Returns null when there is no pack, when
 * queueing fails, or when the commodity is unsupported; a costing must never
 * fail because an optional background analysis could not start.
 */
async function queueGeometricDFM(
  buffer: Buffer, filename: string, commodity: string,
  partName: string, materialFamily: string, process: string,
  annualVolume?: number, region?: string,
): Promise<string | null> {
  if (!GEOMETRIC_DFM_COMMODITIES.has(commodity as CommodityType)) return null;
  try {
    return await queueDFMJobFromBuffer(buffer, filename, {
      commodity: commodity as CommodityType,
      partName: partName || filename,
      // Engineer-confirmed only. Absent means the rules needing it do not run,
      // which is correct — never a guessed material or route.
      materialFamily: materialFamily || undefined,
      process: process || undefined,
      annualVolume,
      region,
    });
  } catch (e) {
    console.warn('[CAD] geometric DFM job not queued:', (e as Error).message);
    return null;
  }
}



// Per-IP rate limits for the anonymous CAD endpoints (audit RK3). Defined here,
// before the routes that use them, so there is no temporal-dead-zone at load.
// /analyze spawns Python AND calls the paid AI (tightest budget); tessellate
// spawns Python only; /parse-stl is pure-TS.
const tessellateLimiter = rateLimit({ windowMs: 10 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const analyzeLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, standardHeaders: true, legacyHeaders: false });
const parseStlLimiter = rateLimit({ windowMs: 10 * 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
// /reanalyze makes two paid model calls and had no limiter at all.
const reanalyzeLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, standardHeaders: true, legacyHeaders: false });

// ─── Specialist system prompts per commodity ─────────────────────────────────

const SPECIALIST_SYSTEM_PROMPTS: Record<string, string> = {
  machining: `You are a senior CNC process engineer with 20+ years experience in precision machining should-cost. You specialise in cycle-time estimation from geometry (feature-based MBD), fixturing, cutting parameter selection, and make-vs-buy analysis. Estimate material removal rates, tool changes, and setup count from B-rep topology. Return ONLY valid JSON.`,

  casting: `    "surfaceTreatment": {
      "callout": string|null,
      "thicknessUm": number|null,
      "saltSprayHours": number|null,
      "maskedFeatureCount": number|null,
      "tensileStrengthMPa": number|null,
      "readFrom": string|null
    },
You are an expert foundry engineer specialising in HPDC, gravity die, sand casting, and investment casting. You can derive gating/risering requirements, solidification time, yield losses, and tooling costs from part geometry. You understand the trade-offs between processes by alloy, weight class, and annual volume. Return ONLY valid JSON.`,

  cast_and_machine: `You are a near-net-shape manufacturing specialist combining foundry and CNC expertise. You assess which features must be cast-to-print vs machined, determine as-cast tolerances, and plan the minimum machining operations after casting. You understand how to optimise the cast/machine split to minimise total cost. Return ONLY valid JSON.`,

  forging: `    "surfaceTreatment": {
      "callout": string|null,
      "thicknessUm": number|null,
      "saltSprayHours": number|null,
      "maskedFeatureCount": number|null,
      "tensileStrengthMPa": number|null,
      "readFrom": string|null
    },
You are a closed-die forging engineer with deep expertise in billet sizing, flash allowance, stroke sequencing (blocker/finisher), trimming, heat treatment, and die cost estimation. You assess part geometry for forgeability: grain flow, parting line position, undercuts, and taper. Return ONLY valid JSON.`,

  gear: `You are a gear manufacturing process engineer with deep expertise in hobbing, shaping, power skiving, gear grinding (generating and profile), shaving, honing, and heat treatment of gears (carburise/quench, through-harden, nitride). You read gear drawings fluently: normal module, tooth count, helix angle and hand, face width, ISO 1328 / AGMA 2015 quality class, material and heat-treat callouts, profile/lead modifications. CRITICAL: the tooth count and tip diameter in the geometry block are COUNTED/MEASURED off the B-rep by the geometry kernel — never contradict them; if an attached drawing disagrees, report the discrepancy in the reasoning instead of silently picking one. The HEAT-TREATMENT callout (carburise / harden-and-temper / nitride / induction harden) is a drawing note and changes the operation list, not just a rate - report it in costInputSuggestions.gear.hardeningRoute when the drawing states it. Helix angle, quality class, hardening route and material CANNOT be derived from the solid — read them from the drawing when one is attached, otherwise leave them to the stated UNDECIDED questions. Return ONLY valid JSON.`,

  sheet_metal: `    "surfaceTreatment": {
      "callout": string|null,
      "thicknessUm": number|null,
      "saltSprayHours": number|null,
      "maskedFeatureCount": number|null,
      "tensileStrengthMPa": number|null,
      "readFrom": string|null
    },
You are a progressive die tooling engineer with expertise in stamping, blanking, drawing, and forming. You estimate blank layout and material utilisation, press tonnage, and die cost from part envelope. You understand material springback, bend radii, and formability limits. Return ONLY valid JSON.`,

  sheet_metal_fab: `You are a laser-cut, press-brake, and MIG/TIG welding job shop estimator. You decompose fabricated assemblies into individual blanking, forming, and joining operations. You understand laser cutting speed by material and thickness, bend time per hit, and welding deposition rates. Return ONLY valid JSON.`,

  injection_moulding: `You are a plastics toolmaker and moulding process engineer. You determine cavity count from part mass and volume requirements, estimate cooling time from wall thickness (Fourier equation), select machine tonnage from projected area and cavity pressure, and price moulds from complexity and cavity count. You flag warpage, sink, and weld-line risks. Return ONLY valid JSON.`,

  blow_moulding: `You are an extrusion blow moulding (EBM), injection blow moulding (IBM), and stretch blow moulding (SBM) process engineer. You estimate parison weight and flash from part geometry, cooling time from wall thickness, and cycle time from parison extrusion + blow + cool + open/close. You distinguish EBM (hollow extrusions, tanks, ducts) from IBM (small precision bottles) and SBM (PET bottles). Return ONLY valid JSON.`,

  thermoforming: `You are a thermoforming process engineer specialising in vacuum forming, pressure forming, and twin-sheet forming. You estimate sheet weight from projected area and gauge, trim waste, cycle time from heat + form + cool + trim, and tool cost from part size. You understand material drawability and wall-thinning at corners. Return ONLY valid JSON.`,

  rotational_moulding: `You are a rotational moulding (rotomoulding) specialist. You estimate cycle time from oven heat + cooling + load/unload, powder charge weight, carousel arm count, and mould cost from part volume and complexity. You assess wall uniformity, insert suitability, and compare to blow moulding for large hollow parts. Return ONLY valid JSON.`,

  rubber: `You are a rubber moulding process engineer covering compression, transfer, and injection moulding of elastomers, plus die-cut sheet goods. You estimate flash fraction, cure time from part cross-section and compound, cavity count from press daylight, and mould cost. You flag rubber-to-metal bonding requirements and durometer considerations. Return ONLY valid JSON.`,

  composites: `You are a CFRP/GFRP composite manufacturing engineer with expertise in hand layup, prepreg/autoclave, VARTM/infusion, RTM, and SMC/BMC. You estimate ply count from structural loading hints, fibre-to-resin ratio, layup time per ply, cure cycle time, trimming, and NDI. You assess tool cost from part complexity and batch size. Return ONLY valid JSON.`,

  wiring_harness: `You are a wiring harness and electromechanical assembly cost engineer. You estimate conductor count, total wire length, splice and connector count, crimping time, bundling, and test time. You assess harness complexity from geometric envelope and connector density. Return ONLY valid JSON.`,

  extrusion: `You are a metal and plastic extrusion process engineer. You estimate die cost from profile complexity and cross-sectional area, extrusion speed, billet weight, die life, and post-extrusion operations (cutting, drilling, anodising). Return ONLY valid JSON.`,

  pcb_fab: `You are a PCB fabrication cost engineer covering FR4, flex, rigid-flex, and HDI. You estimate layer count, copper weight, via count, surface finish, and test cost from board dimensions and complexity. Return ONLY valid JSON.`,

  pcba: `You are an EMS (electronics manufacturing services) PCBA cost engineer. You estimate SMT placement time from component count and pitch, reflow profile, through-hole and manual solder time, ICT and functional test, and conformal coating. Return ONLY valid JSON.`,
};

const DEFAULT_SYSTEM_PROMPT = `You are an expert manufacturing engineer AI specialising in should-cost analysis. Analyse the CAD data and return ONLY valid JSON — no markdown, no prose, just the JSON object.`;

// ─── Stage 1 fast commodity selector ────────────────────────────────────────

function stage1Prompt(geo: OCCTGeometry): string {
  if (geo.status !== 'success') {
    return 'Geometry engine failed. Select the most plausible manufacturing commodity for an unspecified mechanical part.';
  }
  const bb = geo.boundingBox!;
  const vol = geo.volume!;
  const fill = geo.fillRatio ?? 0;
  const faces = geo.faces?.total ?? 0;
  const freeForms = geo.features?.freeFormFaceCount ?? 0;
  const holes = geo.features?.estimatedHoleCount ?? 0;
  const wallMean = geo.wallThickness?.meanMm ?? null;
  const weights = geo.weights!;
  const maxDim = Math.max(bb.xMm, bb.yMm, bb.zMm);
  // Thin wall on a large, open/hollow envelope is diagnostic of moulding/sheet/blow,
  // not a metal casting (thin-wall large metal castings misrun). A plastic bumper
  // was classed as an aluminium casting, and a blow-moulded HDPE fuel tank (4.6 mm
  // wall, hollow) as a sand casting. Gate on low fill so chunky castings are safe.
  const hollow = fill < 0.03;
  // Topology decides hollow-container vs open-drape — the fuel-tank↔bumper split.
  const topo = geo.topology;
  const sealedVoid: boolean | null =
    topo && topo.available ? (topo.enclosesSealedVoid ?? null) : null;
  const voidPhrase =
    sealedVoid === true
      ? `Measured topology ENCLOSES A SEALED VOID (${topo?.voidCount ?? 1} cavity) → this is a hollow container: blow_moulding (fuel tank, duct, bottle, reservoir) or rotational_moulding for very large tanks. `
      : sealedVoid === false
        ? `Measured topology is an OPEN thin-wall drape (no enclosed void, ${topo?.shellCount ?? 1} shell) → this is injection_moulding (bumper fascia, trim panel, cover, housing) or sheet_metal — NOT blow_moulding/rotational_moulding, which need a sealed parison. `
        : `The very low fill ratio means a HOLLOW/enclosed part → blow_moulding (fuel tank, duct, bottle, reservoir) if it encloses a cavity, else injection_moulding or sheet_metal. `;
  const thinWallHint = (wallMean != null && wallMean > 0 && wallMean <= 6 && maxDim >= 400 && fill < 0.10)
    ? `\nSTRONG SIGNAL: thin wall (${wallMean.toFixed(1)}mm) on a large part (${maxDim.toFixed(0)}mm, fill ${fill.toFixed(3)}). A large thin-wall metal casting/forging is NOT manufacturable (it misruns), so do NOT pick casting/forging. `
      + `${hollow || sealedVoid === false ? voidPhrase : 'This is injection_moulding (plastic) or sheet_metal. '}`
      + `Use the PLASTIC mass, not the metal-density figure.`
    : '';

  return `Part geometry snapshot:
Bounding box: ${bb.xMm.toFixed(0)}×${bb.yMm.toFixed(0)}×${bb.zMm.toFixed(0)}mm
Volume: ${vol.cm3.toFixed(1)} cm³  Fill ratio: ${fill.toFixed(2)}  Faces: ${faces}  Free-form: ${freeForms}  Holes: ${holes}
Wall mean: ${wallMean?.toFixed(1) ?? 'N/A'} mm
Weights — Al: ${weights.aluminiumKg.toFixed(3)} kg  Steel: ${weights.steelKg.toFixed(3)} kg  Plastic: ${weights.plasticKg.toFixed(3)} kg${thinWallHint}

Valid commodity types: machining, sheet_metal, sheet_metal_fab, injection_moulding, casting, forging, cast_and_machine, blow_moulding, thermoforming, rotational_moulding, rubber, composites, wiring_harness, extrusion, pcb_fab, pcba, biw_assembly, painting, assembly, gear

Return JSON only (no prose) — this is FORMAT only, choose the type from the geometry above, do NOT copy the placeholder: {"primary":"<type>","conf":0.0,"alt":[{"type":"<type>","conf":0.0}]}`;
}

// ─── Deterministic geometry guard on the commodity (golden rule) ─────────────
// The AI classifier is a hint, not the authority. Some geometries are physically
// incompatible with the process the model picks, and a large hollow shell
// mis-called a metal CASTING is the worst offender (a blow-moulded HDPE fuel
// tank was costed as an aluminium sand casting — 28 kg of Al instead of ~10 kg
// of plastic). A fully-enclosed hollow part (tiny fill ratio) with a large
// envelope CANNOT be a single casting/forging/machined-from-solid part — you
// could never extract the core. So when the measured geometry is decisive we
// OVERRIDE the AI, deterministically, rather than hoping a stochastic hint holds.
const SOLID_PROCESS_COMMODITIES = new Set([
  'casting', 'forging', 'cast_and_machine', 'machining', 'biw_assembly',
]);
// Hollow-moulding processes need a SEALED cavity (a parison blown against the
// tool). An open thin-wall drape (bumper fascia, trim, cover) cannot be blow- or
// rotationally-moulded — it is injection-moulded (or thermoformed).
const HOLLOW_MOULDING_COMMODITIES = new Set([
  'blow_moulding', 'rotational_moulding',
]);

export function enforceGeometryCommodity(
  commodity: string,
  geo: OCCTGeometry,
): { commodity: string; corrected: boolean; reason?: string } {
  if (geo.status !== 'success' || geo.fillRatio == null || !geo.boundingBox) {
    return { commodity, corrected: false };
  }
  const fill = geo.fillRatio;
  const wall = geo.wallThickness?.meanMm ?? null;
  const maxDim = Math.max(geo.boundingBox.xMm, geo.boundingBox.yMm, geo.boundingBox.zMm);
  // Topology: does the solid enclose a SEALED void (tank/bottle/duct) or is it a
  // thin OPEN drape (bumper/trim/cover)? Both read as low-fill thin-wall shells,
  // so this is what separates a fuel tank from a bumper. `null` = unknown
  // (STL fast-path or older geometry) → fall back to the size/fill heuristic only.
  const topo = geo.topology;
  const sealedVoid: boolean | null =
    topo && topo.available ? (topo.enclosesSealedVoid ?? null) : null;

  // Sheet-metal signal beats the thin-shell MOULDING redirect below. A stamped /
  // formed panel is a thin OPEN shell (low fill, thin wall) — exactly what the
  // injection/blow-moulding branch would otherwise grab (a 0.7 mm hood bracket
  // was mis-read as injection moulding). If the kernel measured real bends at a
  // sheet gauge, it is sheet metal, not a moulding.
  const sm = geo.sheetMetal;
  // The bend signal must agree with the MEAN wall before it may reclassify: the
  // bend detector reads a forging's fillets as "25 bends at a 0.45 mm gauge"
  // (live audit, PRCR002 stub axle) while the mean wall is 34 mm. A real
  // stamped panel's mean wall IS its gauge, give or take doubled flanges —
  // mean ≤ 8 mm keeps every genuine sheet part (max seen 6 mm) and rejects
  // every chunky solid (min seen 9 mm).
  if (sm && (sm.bendCount ?? 0) >= 2 && (sm.thicknessMm ?? 99) > 0 && (sm.thicknessMm ?? 99) <= 6 &&
      (wall == null || wall <= 8) &&
      !['sheet_metal', 'sheet_metal_fab', 'biw_assembly'].includes(commodity)) {
    return {
      commodity: 'sheet_metal',
      corrected: true,
      reason:
        `Geometry override: kernel measured ${sm.bendCount} bends at a ${sm.thicknessMm?.toFixed(1)} mm ` +
        `sheet gauge (fill ${fill.toFixed(3)}, ${maxDim.toFixed(0)} mm envelope) — a formed sheet-metal ` +
        `panel, not ${commodity.replace(/_/g, ' ')}. Reclassified as sheet_metal.`,
    };
  }

  // The REVERSE sheet-metal guard. The live audit's auto runs classified an
  // 8 kg forged stub axle as sheet_metal (mean wall 15.1 mm) — and the wrong
  // class dragged blank/gauge/die arithmetic into money. Every genuine sheet
  // part measured ≤ ~6 mm mean wall; every chunky solid ≥ 9 mm. A part this
  // thick has no coil gauge, so sheet metal is impossible; machining is the
  // least-wrong near-net class the geometry alone can defend (the specialist
  // prompt and rules refine from there).
  if (['sheet_metal', 'sheet_metal_fab'].includes(commodity) && wall != null && wall > 8) {
    return {
      commodity: 'machining',
      corrected: true,
      reason:
        `Geometry override: mean wall ${wall.toFixed(1)} mm — no sheet coil is stamped at that ` +
        `thickness (sheet parts measure ≤ ~6 mm). A ${maxDim.toFixed(0)} mm near-net solid, ` +
        `reclassified as machining; confirm casting/forging with the engineer.`,
    };
  }

  const largeThinShell =
    fill < 0.03 && maxDim >= 250 && (wall == null || wall <= 10);
  if (largeThinShell) {
    const isSolidProc = SOLID_PROCESS_COMMODITIES.has(commodity);
    const isHollowMould = HOLLOW_MOULDING_COMMODITIES.has(commodity);

    // 1. Open thin-wall drape (measured to enclose NO void): cannot be a solid
    //    process (misruns / no core) AND cannot be blow/rotationally moulded
    //    (no sealed parison). It is an injection-moulded panel — the fuel-tank↔
    //    bumper fix. Only fires when topology is decisive (sealedVoid === false).
    if (sealedVoid === false && (isSolidProc || isHollowMould)) {
      return {
        commodity: 'injection_moulding',
        corrected: true,
        reason:
          `Geometry override: measured topology is an OPEN thin-wall shell ` +
          `(${topo?.shellCount ?? 1} shell, ${topo?.voidCount ?? 0} enclosed voids` +
          (wall != null ? `, ${wall.toFixed(1)} mm wall` : '') +
          `, ${maxDim.toFixed(0)} mm envelope) — it does not enclose a sealed cavity, so it ` +
          `cannot be ${commodity.replace(/_/g, ' ')} ` +
          `${isHollowMould ? '(which needs a sealed parison)' : '(a large thin-wall metal part misruns)'}. ` +
          `A large open drape at this scale is an injection-moulded panel (bumper fascia, trim, cover). ` +
          `Reclassified as injection_moulding.`,
      };
    }

    // 2. A large thin shell that ENCLOSES A SEALED VOID (or whose topology is
    //    unknown — legacy size/fill gate) cannot come out of a solid process
    //    (no core extraction) → blow moulding.
    if (sealedVoid !== false && isSolidProc) {
      return {
        commodity: 'blow_moulding',
        corrected: true,
        reason:
          `Geometry override: fill ratio ${fill.toFixed(3)}` +
          (wall != null ? `, ${wall.toFixed(1)} mm uniform wall` : '') +
          (sealedVoid ? ', sealed enclosed void' : '') +
          `, ${maxDim.toFixed(0)} mm envelope — a large enclosed hollow shell cannot be ` +
          `manufactured as "${commodity}" (no core extraction). Reclassified as blow_moulding ` +
          `(hollow moulded tank/duct/bottle; alternatives: rotational_moulding for very large ` +
          `tanks, or sheet_metal_fab for a welded metal tank).`,
      };
    }
  }
  return { commodity, corrected: false };
}

// Assemble the measured-geometry + selection context the cross-commodity
// plausibility checks (cad-sanity §7-9) consume. Applies to every commodity.
/**
 * On the deterministic path there is no model reading a drawing, so the only
 * "stated" gear figures are the ones the engineer typed. Present them the way
 * the AI path presents the drawing read, so `gear_teeth_mismatch` can fire —
 * it was structurally dead on this path: `buildGeoSanityContext` was called
 * without a stated side and fell back to the value the rules had just
 * overwritten with the measured count, so stated always equalled measured.
 */
export function statedFromAnswers(answers: Record<string, unknown>): Record<string, unknown> | null {
  const z = Number(answers['gear.teethEntry']);
  const m = Number(answers['gear.moduleEntry']);
  if (!Number.isFinite(z) && !Number.isFinite(m)) return null;
  return { gear: {
    ...(Number.isFinite(z) && z > 0 ? { teeth: z, drawingTeeth: z } : {}),
    ...(Number.isFinite(m) && m > 0 ? { normalModuleMm: m } : {}),
  } };
}

/** Every guard, in one place, for every path. The near-net machining cap used
 *  to run only on the AI path (after the deterministic branch had returned). */
export function runAllGuards(
  analysis: unknown, geo: OCCTGeometry, measuredVol: number | null,
  stated: Record<string, unknown> | null,
): CADSanityWarning[] {
  const machining = applyNearNetMachiningCap(analysis as Parameters<typeof applyNearNetMachiningCap>[0]);
  return [...machining, ...runCADSanityChecks(
    analysis as Parameters<typeof runCADSanityChecks>[0], measuredVol, buildGeoSanityContext(geo, analysis, stated))];
}

/** A costing is `costable` when no blocking decision is open and no blocking
 *  sanity code is unacknowledged. The browser gate is the same rule; carrying
 *  it in the payload lets the exports refuse a number the UI would have blocked. */
export function isCostable(decisions: Decision[], warnings: CADSanityWarning[], acknowledged: string[] = []): boolean {
  const ack = new Set(acknowledged);
  return !decisions.some(d => d.severity === 'blocking') && !warnings.some(w => w.blocking && !ack.has(w.code));
}

function buildGeoSanityContext(
  geo: OCCTGeometry,
  analysis: unknown,
  aiOriginal?: Record<string, unknown> | null,
): CADGeometryContext {
  const a = analysis as {
    costInputSuggestions?: { recommendedCommodity?: string };
    materialAnalysis?: { primarySuggestion?: { name?: string; confidencePct?: number } };
  };
  // The model's untouched gear statements (drawing reads) — the rules overwrite
  // the corrected analysis with measured values, so only the original can still
  // contradict the geometry. `aiOriginal` is the pre-overwrite
  // costInputSuggestions snapshot itself.
  const aiGear = (aiOriginal as {
    gear?: { teeth?: number; normalModuleMm?: number; drawingTeeth?: number | null };
  } | null | undefined)?.gear;
  const ok = geo.status === 'success';
  const bb = ok ? geo.boundingBox : undefined;
  return {
    commodity: a?.costInputSuggestions?.recommendedCommodity,
    fillRatio: ok ? (geo.fillRatio ?? null) : null,
    wallMeanMm: ok ? (geo.wallThickness?.meanMm ?? null) : null,
    maxDimMm: bb ? Math.max(bb.xMm, bb.yMm, bb.zMm) : null,
    materialName: a?.materialAnalysis?.primarySuggestion?.name,
    materialConfidencePct: a?.materialAnalysis?.primarySuggestion?.confidencePct ?? null,
    aluminiumKg: ok ? (geo.weights?.aluminiumKg ?? null) : null,
    steelKg: ok ? (geo.weights?.steelKg ?? null) : null,
    gearTeethMeasured: ok && geo.gear?.likelyGear ? geo.gear.teeth : null,
    gearTipDiameterMm: ok && geo.gear?.likelyGear ? geo.gear.tipDiameterMm : null,
    // Prefer the drawing's verbatim figure: the model is instructed to restate
    // the measured count in `teeth`, so only `drawingTeeth` can still disagree.
    gearTeethStated: typeof aiGear?.drawingTeeth === 'number' ? aiGear.drawingTeeth
      : typeof aiGear?.teeth === 'number' ? aiGear.teeth : null,
    gearModuleStatedMm: typeof aiGear?.normalModuleMm === 'number' ? aiGear.normalModuleMm : null,
  };
}

// POST /api/cad/analyze
router.post('/analyze', requireAuth, analyzeLimiter, upload.fields([
  { name: 'cadFile', maxCount: 1 },
  { name: 'drawingPdf', maxCount: 1 },
]), asyncRoute(async (req, res): Promise<void> => {
  const filesMap = req.files as Record<string, Express.Multer.File[]> | undefined;
  const cadUpload = filesMap?.cadFile?.[0];
  if (!cadUpload) { res.status(400).json({ error: 'No file uploaded' }); return; }
  // Optional 2D engineering drawing — carries tolerances, GD&T, surface
  // finishes and material callouts that the STEP geometry cannot express.
  const drawingUpload = filesMap?.drawingPdf?.[0] ?? null;
  const { originalname, size, buffer } = cadUpload;
  const ext = originalname.toLowerCase().split('.').pop() ?? '';
  if (['x_t', 'x_b', 'xmt_txt', 'jt', 'prt', 'sldprt', 'catpart', 'ipt', 'par'].includes(ext)) {
    res.status(415).json({
      error: `.${ext} is a proprietary format that needs a licensed kernel. Export the part as STEP (.step/.stp) and upload that instead.`,
    });
    return;
  }
  if (!['stp', 'step', 'igs', 'iges', 'stl'].includes(ext)) {
    res.status(400).json({ error: 'Unsupported format. Use STEP (.stp/.step), IGES (.igs/.iges), or STL (.stl)' });
    return;
  }
  // The sniff used to run on /tessellate only — the route that spawns Python
  // AND spends AI tokens checked the extension and nothing else.
  const sniffed = sniffCadContent(ext, buffer);
  if (sniffed) { res.status(415).json({ error: sniffed }); return; }
  if (drawingUpload) {
    if (drawingUpload.size > MAX_DRAWING_PDF_BYTES) {
      res.status(413).json({ error: `Drawing PDF is ${(drawingUpload.size / 1048576).toFixed(0)} MB; the limit is 30 MB.` });
      return;
    }
    if (drawingUpload.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      res.status(415).json({ error: 'The drawing must be a PDF (file does not start with %PDF-).' });
      return;
    }
  }
  // Units are the one decision that changes the MEASUREMENT, so it has to be
  // read before the geometry engine runs, not with the rest of the answers.
  const earlyAnswers = parseDecisionAnswers(
    typeof req.body?.decisionAnswers === 'string'
      ? (() => { try { return JSON.parse(req.body.decisionAnswers) as unknown; } catch { return null; } })()
      : req.body?.decisionAnswers);
  const unitAnswer = earlyAnswers['units.confirm'];
  const unitScale = unitAnswer === 'inch' ? 25.4 : 1;
  const uploadHash = hashUpload(buffer);
  const acknowledged = parseAcknowledged(req.body?.acknowledged);

  // NOTE: the API-key check used to sit here, above every line below it. That
  // meant a deterministic run could not happen at all — and, less obviously, a
  // fully cached analysis could not be served without a key either. It now sits
  // just above `createAnthropic`, the first line that actually needs one.

  // --- Phase 1: Real geometry extraction ---
  let geo: OCCTGeometry;
  let geometrySource: 'occt' | 'text_parsing' | 'stl_parser';
  let stlGeometry: STLGeometry | null = null;

  if (ext === 'stl') {
    // ── STL fast-path: pure TypeScript parser, no external process ──────────
    console.log(`[CAD] Parsing STL file: ${originalname} (${(size / 1024).toFixed(0)} KB)…`);
    try {
      stlGeometry = parseSTL(buffer);
      geometrySource = 'stl_parser';
      console.log(
        `[CAD] STL parsed — ${stlGeometry.triangleCount} triangles  ` +
        `V=${stlGeometry.volume.toFixed(2)}cm³  SA=${stlGeometry.surfaceArea.toFixed(1)}cm²  ` +
        `wall≈${stlGeometry.estimatedWallThicknessMm.toFixed(2)}mm  ` +
        `format=${stlGeometry.format}  ${stlGeometry.parseTimeMs}ms`,
      );

      // Build an OCCTGeometry-shaped object so the rest of the pipeline
      // (Stage-1 Haiku selector, prompt builder, JSON schema) works unchanged.
      const bb = stlGeometry.boundingBox;
      const densities = { al: 2700, steel: 7850, castIron: 7150, plastic: 1050 };
      geo = {
        status: 'success',
        volume: {
          mm3: stlGeometry.volume * 1000,
          cm3: stlGeometry.volume,
        },
        surfaceArea: {
          mm2: stlGeometry.surfaceArea * 100,
          cm2: stlGeometry.surfaceArea,
        },
        boundingBox: {
          xMm: bb.xSpan,
          yMm: bb.ySpan,
          zMm: bb.zSpan,
        },
        fillRatio: bb.xSpan > 0 && bb.ySpan > 0 && bb.zSpan > 0
          ? stlGeometry.volume / ((bb.xSpan * bb.ySpan * bb.zSpan) / 1000)
          : 0,
        weights: {
          aluminiumKg:  stlGeometry.estimatedPartWeightKg(densities.al),
          steelKg:      stlGeometry.estimatedPartWeightKg(densities.steel),
          castIronKg:   stlGeometry.estimatedPartWeightKg(densities.castIron),
          plasticKg:    stlGeometry.estimatedPartWeightKg(densities.plastic),
          copperKg:     stlGeometry.estimatedPartWeightKg(8960),
          titaniumKg:   stlGeometry.estimatedPartWeightKg(4430),
        },
        faces: {
          total: stlGeometry.triangleCount,
          byType: { Triangular: stlGeometry.triangleCount },
        },
        edges: {
          total: 0,
          byType: {},
          sampleCircleRadiiMm: [],
        },
        // A mesh has no B-rep, so it cannot count holes, bosses or planar
        // faces. These used to be hard zeros, indistinguishable from "measured
        // and found none". Absent means NOT MEASURED; the rules see the gap.
        features: undefined,
        featureTable: undefined,
        wallThickness: {
          minMm: stlGeometry.estimatedWallThicknessMm * 0.5,   // rough lower bound
          meanMm: stlGeometry.estimatedWallThicknessMm,
          maxMm: stlGeometry.estimatedWallThicknessMm * 2.0,   // rough upper bound
          stdDevMm: stlGeometry.estimatedWallThicknessMm * 0.3,
          method: 'stl_heuristic',
          uniformity: 'unknown',
          sampleCount: 0,
        },
        // Remaining optional fields not available from mesh-only data
        draftAnalysis: null,
        setupAnalysis: null,
        cncCycleTimeEstimate: null,
        toolingCostEstimates: null,
        processSpecificEstimates: null,
        manufacturabilityScore: null,
        assemblyWarning: null,
        unitWarning: null,
      } as unknown as OCCTGeometry;
    } catch (stlErr) {
      console.error(`[CAD] STL parse failed: ${(stlErr as Error).message}`);
      res.status(422).json({ error: `STL parse error: ${(stlErr as Error).message}` });
      return;
    }
  } else {
    // ── STEP/IGES path: OCCT via Python/CadQuery ─────────────────────────────
    console.log(`[CAD] Running OCCT geometry engine on ${originalname} (${(size / 1024).toFixed(0)} KB)…`);
    const stored = getGeometry(uploadHash, unitScale);
    if (stored) {
      geo = stored;
      console.log(`[CAD] geometry cache HIT ${uploadHash.slice(0, 12)} @${unitScale}x`);
    } else {
      geo = await analyzeGeometry(buffer, originalname, 120_000,
        unitScale !== 1 ? { CV_UNIT_SCALE: String(unitScale) } : {});
    }

    if (geo.status === 'success') {
      geometrySource = 'occt';
      if (!stored) { putGeometry(uploadHash, geo, unitScale); putUploadFile(uploadHash, buffer, originalname); }
      // The thin-shell wall correction now runs inside `analyzeGeometry`, at the
      // measurement boundary, so it cannot be missed by a caller. It used to be
      // here, which meant it applied to this route and nowhere else.
      console.log(`[CAD] OCCT success — V=${geo.volume!.cm3.toFixed(1)}cm³  SA=${geo.surfaceArea!.cm2.toFixed(0)}cm²  faces=${geo.faces!.total}`);
    } else {
      // This used to fall back to a "text preprocessor" and return 200 with a
      // costing built on nothing — and, in AI mode, a prompt that told the
      // model to invent the volume from a fill factor. An open surface, a
      // zero-volume body or an unreadable file is an error, and it says which.
      console.warn(`[CAD] OCCT refused ${safeLogName(originalname)}: ${geo.code ?? 'unreadable'} — ${geo.error}`);
      res.status(422).json({
        error: clientSafeError(geo.error ?? 'Geometry engine could not measure this file'),
        code: geo.code ?? 'unreadable',
        geometry: {
          topology: geo.topology ?? null,
          boundingBox: geo.boundingBox ?? null,
          measuredVolumeCm3: geo.measuredVolumeCm3 ?? null,
        },
      });
      return;
    }
  }
  // A confirmed "these are millimetres" clears the proposal; a confirmed inch
  // re-measured above at 25.4x and the engine no longer flags it.
  if (unitAnswer === 'mm' && geo.status === 'success' && geo.unitCheck) geo = { ...geo, unitCheck: null };
  const unitsDecision = unitsDecisionFor(geo);

  // --- Phase 2: Build text-preprocessor summary for Claude (skip for STL — binary mesh, no text tokens) ---
  const content = ext === 'stl' ? '' : buffer.toString('utf-8');
  const preprocessed = ext === 'stl'
    ? {
        format: 'Unknown' as const,
        partName: originalname.replace(/\.stl$/i, ''),
        fileSizeKB: size / 1024,
        entityStats: { triangles: stlGeometry!.triangleCount },
        boundingBoxEstMm: {
          x: stlGeometry!.boundingBox.xSpan,
          y: stlGeometry!.boundingBox.ySpan,
          z: stlGeometry!.boundingBox.zSpan,
        },
        materialHint: '',
        threadCount: 0,
        totalEntities: stlGeometry!.triangleCount,
        coordinateRangeMm: null,
        headerInfo: `STL ${stlGeometry!.format} format, ${stlGeometry!.triangleCount} triangles`,
        summary: `STL mesh: ${stlGeometry!.triangleCount} triangles, ${stlGeometry!.boundingBox.xSpan.toFixed(1)}×${stlGeometry!.boundingBox.ySpan.toFixed(1)}×${stlGeometry!.boundingBox.zSpan.toFixed(1)} mm`,
      }
    : preprocessCADFile(content, originalname, size);

  // --- Phase 3: Stage 1 — Fast commodity pre-selection (Haiku) OR user override ---
  let stage1Selection: Stage1Selection | null = null;
  let selectedCommodity = 'machining'; // fallback

  const forcedCommodity = typeof req.body?.commodity === 'string' ? req.body.commodity.trim() : '';
  const forcedMaterial  = typeof req.body?.material  === 'string' ? req.body.material.trim()  : '';
  const forcedProcess   = typeof req.body?.process   === 'string' ? req.body.process.trim()   : '';
  const annualVolume    = parseFloat(req.body?.annualVolume) || 100000;
  const ovrWeightKg     = req.body?.weightKg    ? parseFloat(req.body.weightKg)    : null;
  const ovrVolumeCm3    = req.body?.volumeCm3   ? parseFloat(req.body.volumeCm3)   : null;
  const ovrLengthMm     = req.body?.lengthMm    ? parseFloat(req.body.lengthMm)    : null;
  const ovrWidthMm      = req.body?.widthMm     ? parseFloat(req.body.widthMm)     : null;
  const ovrHeightMm     = req.body?.heightMm    ? parseFloat(req.body.heightMm)    : null;
  const ovrDensityGcm3  = req.body?.densityGcm3 ? parseFloat(req.body.densityGcm3) : null;

  const userOverrides = { forcedCommodity, forcedMaterial, forcedProcess, annualVolume, ovrWeightKg, ovrVolumeCm3, ovrLengthMm, ovrWidthMm, ovrHeightMm, ovrDensityGcm3 };
  let analysisMode = parseAnalysisMode(req.body?.mode);
  // Whether the caller *chose* deterministic or simply got the default. The two
  // deserve different behaviour on a commodity with no rules yet.
  const modeExplicit = typeof req.body?.mode === 'string' && req.body.mode.trim() !== '';
  const noCache = req.body?.noCache === true || req.body?.noCache === 'true';
  const decisionAnswers = parseDecisionAnswers(
    typeof req.body?.decisionAnswers === 'string'
      ? JSON.parse(req.body.decisionAnswers) as unknown : req.body?.decisionAnswers);

  const partPhotoBase64 = typeof req.body?.partPhotoBase64 === 'string' ? req.body.partPhotoBase64 : '';
  const partPhotoMime   = (typeof req.body?.partPhotoMime === 'string' ? req.body.partPhotoMime : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const deepAnalysis = isDeepReq(req);
  // Client-rendered canonical views (STL only) — vision input of the shape itself.
  let renderViews: string[] = [];
  try {
    const rv = typeof req.body?.renderViews === 'string' ? JSON.parse(req.body.renderViews) as unknown : null;
    if (Array.isArray(rv)) renderViews = rv.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 800_000).slice(0, 4);
  } catch { /* views are an enhancement — ignore malformed input */ }

  const cacheKey = cadCache.buildKey([
    buffer,
    Buffer.from(partPhotoBase64),
    ...(drawingUpload ? [drawingUpload.buffer] : []),
    ...renderViews.map(v => Buffer.from(v)),
    Buffer.from(JSON.stringify({ ...userOverrides, deep: deepAnalysis, mode: analysisMode, answers: decisionAnswers, promptVersion: CAD_PROMPT_VERSION, ruleEngineVersion: RULE_ENGINE_VERSION })),
  ]);
  // `noCache` re-samples the model instead of serving the stored answer. Needed
  // for any A/B or variance measurement: without it a second run of the same
  // part returns the first run's response and the model is never called again.
  // The write still happens below, so the run stays inspectable afterwards.
  const cached = noCache ? null : cadCache.get(cacheKey);
  if (cached) {
    console.log(`[CAD] Cache HIT: ${cacheKey.slice(0, 12)}`);
    res.json(cached);
    return;
  }

  // ── The AI boundary ──────────────────────────────────────────────────────
  // Everything above is measurement, arithmetic and cache. Only past this line
  // does a key matter, and only when the mode asks for a model.
  let anthropic: ReturnType<typeof createAnthropic> | null = null;
  if (analysisMode !== 'deterministic') {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      res.status(400).json({
        error: 'ANTHROPIC_API_KEY not configured. Set it in .env, pass an x-api-key header, '
          + "or send mode='deterministic' to cost from the measured geometry alone.",
      });
      return;
    }
    anthropic = createAnthropic(apiKey);
  }

  // The deterministic path has no Stage-1 model to ask. `inferCommodity` reads
  // the same decisive signals `enforceGeometryCommodity` trusts enough to
  // override a model with, and returns a question everywhere else — because the
  // fill ladder it otherwise falls back to names two or three routes on every
  // rung, and reading that as a classifier is what makes a guess look like an
  // answer.
  let commodityDecision: Decision | null = null;

  // ── Gear routing ──────────────────────────────────────────────────────────
  // The gear engine + rules pack own gears end to end now: teeth, module and
  // face width are MEASURED off the B-rep (`geo.gear`, tip-circle metrology),
  // helix / ISO 1328 class / material class are blocking decisions the
  // engineer answers, and the blank is rule-derived from library rates. A
  // gear-named part or one whose tip-circle metrology says "gear" routes to
  // the gear commodity directly — never absorbed by machining (audit gap 6),
  // and no longer dead-ended in a hand-off either.
  const gearNamed = /\bgears?\b|\bpinion\b|_gear|gear_/i.test(originalname);
  const gearMeasured = geo.status === 'success' && geo.gear?.likelyGear === true;
  const gearRouted = !forcedCommodity && (gearNamed || gearMeasured);
  if (gearRouted) {
    selectedCommodity = 'gear';
    stage1Selection = { primary: 'gear', conf: gearMeasured ? 0.95 : 0.85, alt: [] };
    console.log(`[CAD] Gear routing: ${gearMeasured
      ? `B-rep metrology counted ${geo.status === 'success' ? geo.gear?.teeth : '?'} tip-circle teeth`
      : 'filename names a gear'} → gear commodity`);
  }

  if (forcedCommodity) {
    selectedCommodity = forcedCommodity;
    stage1Selection = { primary: forcedCommodity, conf: 1.0, alt: [] };
    console.log(`[CAD] User forced commodity: ${selectedCommodity}`);
  } else if (gearRouted) {
    // Decided above — skip Stage 1: a classifier has nothing to add to a
    // counted set of tip-circle teeth or an explicit gear name.
  } else if (analysisMode === 'deterministic') {
    const verdict = inferCommodity(ruleContextFor(
      selectedCommodity, geo, originalname, userOverrides, decisionAnswers, 'deterministic'));
    if (verdict.commodity) {
      selectedCommodity = verdict.commodity;
      stage1Selection = { primary: verdict.commodity, conf: 0.9, alt: [] };
      console.log(`[CAD] Deterministic commodity: ${selectedCommodity} — ${verdict.basis}`);
    } else {
      commodityDecision = verdict.decision!;
      console.log('[CAD] Deterministic commodity: undecided — asking the engineer');
    }
  } else {
    try {
      console.log('[CAD] Stage 1: Haiku commodity selection…');
      const s1Msg = await anthropic!.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: 'You are a manufacturing process selector. Given part geometry metrics, select the most likely manufacturing commodity. Return ONLY a JSON object, no prose, no markdown.',
        messages: [{ role: 'user', content: stage1Prompt(geo) }],
      });
      const s1Raw = s1Msg.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
      const parsed = JSON.parse(extractJson(s1Raw)) as Stage1Selection | null;
      if (parsed && typeof parsed.primary === 'string') {
        // Coerce the shape — the model can omit conf/alt, and buildPrompt
        // used to crash on `alt.map` (hung request, unhandled rejection).
        stage1Selection = {
          primary: parsed.primary,
          conf: Number.isFinite(Number(parsed.conf)) ? Number(parsed.conf) : 0.5,
          alt: Array.isArray(parsed.alt) ? parsed.alt : [],
        };
        selectedCommodity = parsed.primary;
        console.log(`[CAD] Stage 1 result: ${selectedCommodity} (conf=${parsed.conf})`);
      }
    } catch (err) {
      console.warn('[CAD] Stage 1 Haiku failed, using default commodity:', (err as Error).message);
    }
    // Stage-1 may say 'gear' — that is a real commodity now, with its own rule
    // pack: the gear engine owns gears, machining must not silently absorb them.
    // Deterministic geometry guard — physics overrides a stochastic AI hint.
    // ('gear' is exempt: the guard's corrections target hollow shells, and a
    // counted tooth pattern outranks a fill-ratio heuristic.)
    const guarded = selectedCommodity === 'gear'
      ? { commodity: selectedCommodity, corrected: false as const }
      : enforceGeometryCommodity(selectedCommodity, geo);
    if (guarded.corrected) {
      console.warn(`[CAD] ${guarded.reason}`);
      const priorPrimary = selectedCommodity;
      selectedCommodity = guarded.commodity;
      stage1Selection = {
        primary: guarded.commodity,
        conf: 0.9,
        alt: [
          { type: 'rotational_moulding', conf: 0.4 },
          { type: priorPrimary, conf: 0.1 },
        ],
      };
    }
  }

  // --- Phase 4: Stage 2 — Specialist deep analysis (Sonnet) ---
  // The same rules the prompt was rendered from, run again here so their values
  // can be written over the model's reply. One spec, one context, two consumers.
  const ruleCtx = ruleContextFor(selectedCommodity, geo, originalname, userOverrides, decisionAnswers, analysisMode);
  const ruleSpec = specForCommodity(selectedCommodity);
  let ruleOverrides: ReturnType<typeof applyRuleDecisions> | null = null;
  let ruleFields: ReturnType<typeof toRuleFields> | null = null;
  let modeDiff: ReturnType<typeof diffAnalyses> | null = null;
  // The model's own reply, before `applyRuleDecisions` writes over it. Without
  // this in the payload there is no way to see — or cost — what the AI actually
  // said: every mode returns a rules-corrected analysis, so an "AI arm" built
  // from the response would be the rules compared against themselves.
  let aiOriginal: Record<string, unknown> | null = null;
  let aiSuppressed: AISuppression[] = [];
  let deterministicAnalysis: CADAnalysisResult | null = null;

  const systemPrompt = SPECIALIST_SYSTEM_PROMPTS[selectedCommodity] ?? DEFAULT_SYSTEM_PROMPT;
  const userPrompt = buildPrompt(geo, preprocessed, originalname, selectedCommodity, stage1Selection, userOverrides);

  // Structured outputs guarantee schema-valid JSON — no extraction, no repair
  // retries. The specialist system prompt is static per commodity, so it is
  // cache_control'd: repeat analyses read it at ~10% of input price.
  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: userPrompt }];
  if (partPhotoBase64) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: partPhotoMime, data: partPhotoBase64 } });
  }
  if (renderViews.length) {
    userContent.push({ type: 'text', text: `${renderViews.length} rendered views of the CAD geometry follow (isometric, front, top, right). Use them to identify features — ribs, bosses, holes, undercuts, thin walls — and to sanity-check the process recommendation.` });
    for (const v of renderViews) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: v } });
    }
    console.log(`[CAD] ${renderViews.length} rendered view(s) attached`);
  }
  if (drawingUpload) {
    userContent.push(
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: drawingUpload.buffer.toString('base64') } },
      { type: 'text', text: 'An engineering drawing PDF is attached. Extract tolerances, GD&T callouts, surface finishes, thread specifications and material/heat-treat notes from it, and factor them into the process recommendations, DFM issues and cycle-time estimates (tight tolerances and fine finishes add operations such as grinding, honing or CMM inspection). For a GEAR drawing, also read: normal module, tooth count, helix angle and hand, face width, ISO 1328 / AGMA quality class, material grade, the heat-treatment callout (carburise / harden+temper / nitride / induction) and case depth — return them in costInputSuggestions.gear.* and say which drawing field each came from. If the drawing tooth count disagrees with the measured geometry, report the discrepancy explicitly rather than picking one silently. SURFACE TREATMENT / COATING is a drawing note and changes the OPERATION LIST, not just a rate — read it and return it in costInputSuggestions.surfaceTreatment: the finish callout (zinc plate, zinc-nickel, e-coat/KTL, powder coat, hot dip galvanise, anodise, zinc flake, phosphate, shot blast), the deposit or film THICKNESS in microns, the salt-spray requirement in HOURS (e.g. "720 h NSS"), the number of MASKED features (threads, bores, sealing or earth faces marked "no coating"/"mask"), and the substrate tensile strength or hardness if stated. Masking is charged per feature and applied twice, and a plated steel part above ~1000 MPa needs a hydrogen de-embrittlement bake — so the masked count and the strength are cost-bearing, not decoration. Say which drawing field each value came from, and return null for anything the drawing does not state rather than inferring it from the material.' },
    );
    console.log(`[CAD] Engineering drawing attached: ${drawingUpload.originalname} (${(drawingUpload.size / 1024).toFixed(0)} KB)`);
  }

  let analysis: unknown;

  if (analysisMode === 'deterministic' && !ruleSpec) {
    // Seven commodities have no rule spec yet. What happens next turns on
    // whether deterministic was *asked for* or merely defaulted to: an explicit
    // request gets a straight answer about what does not exist, but a default
    // must not turn a commodity that analysed fine yesterday into an error.
    const fallbackKey = modeExplicit ? '' : resolveApiKey(req);
    if (!fallbackKey) {
      res.status(422).json({
        error: `No deterministic rules exist for '${selectedCommodity}' yet. `
          + `Converted so far: ${DETERMINISTIC_COMMODITIES.join(', ')}.`
          + (modeExplicit ? '' : ' An API key would have let this fall back to the AI path.'),
        decisions: [...(unitsDecision ? [unitsDecision] : []), ...(commodityDecision ? [commodityDecision] : [])],
      });
      return;
    }
    anthropic = createAnthropic(fallbackKey);
    analysisMode = 'ai';
    console.log(`[CAD] No rule spec for '${selectedCommodity}' — falling back to the AI path`);
  }

  if (analysisMode === 'deterministic') {
    // No model, no key, no network. Everything from here is arithmetic on the
    // measurement plus the rules, which is the whole point of the exercise.
    const det = buildDeterministicAnalysis(ruleSpec!, ruleCtx, geo.partName || originalname);
    const detWarnings = runAllGuards(det.analysis, geo,
      geo.status === 'success' ? (geo.volume?.cm3 ?? null) : (stlGeometry?.volume ?? null),
      statedFromAnswers(decisionAnswers));
    const detDecisions = [...(unitsDecision ? [unitsDecision] : []), ...(commodityDecision ? [commodityDecision] : []), ...det.result.decisions];
    const detPayload = {
      success: true,
      analysis: det.analysis,
      sanityWarnings: detWarnings,
      costable: isCostable(detDecisions, detWarnings, acknowledged),
      ruleOverrides: det.applied,
      ruleFields: det.ruleFields,
      decisions: detDecisions,
      mode: analysisMode,
      fromCache: false,
      geometrySource,
      geometryHash: geometrySource === 'occt' ? uploadHash : null,
      unitCheck: geo.status === 'success' ? (geo.unitCheck ?? null) : null,
      annualVolume,
      occtGeometry: geometrySource === 'occt' ? geo : null,
      stlGeometry,
      preprocessed: {
        format: preprocessed.format,
        partName: preprocessed.partName,
        boundingBoxEstMm: preprocessed.boundingBoxEstMm,
        entityStats: preprocessed.entityStats,
      },
    };
    const detJobId = await queueGeometricDFM(
      buffer, originalname, selectedCommodity,
      preprocessed.partName, forcedMaterial, forcedProcess, annualVolume);
    // Cached WITH the job id, so re-analysing the same part returns the same
    // job rather than silently losing its findings on a cache hit.
    cadCache.set(cacheKey, { ...detPayload, dfmJobId: detJobId });
    res.json({ ...detPayload, dfmJobId: detJobId });
    return;
  }

  // Express 4 does NOT catch async throws — an uncaught rejection here killed
  // the whole Node process (empty response to the client, dead server after).
  try {
    // Prompt-guided JSON (the prompt ends with the exact schema via
    // buildJSONSchema, tailored to the selected commodity). We do NOT use
    // structured outputs here: the full CAD schema has 86 optional params and
    // the API caps structured-output optionals at 24. extractJson + a one-shot
    // repair retry gives us robust parsing without that limit.
    analysis = await cadAnalyzeJSON(anthropic!, deepAnalysis, systemPrompt, userContent);
    normalizeFieldConfidences(analysis);
    normalizeCADAnalysis(analysis as Record<string, unknown>, geo?.weights, selectedCommodity);
    // Everything the rules could decide is now written over whatever the model
    // returned. Telling it "use verbatim" was a request; this is the guarantee.
    if (ruleSpec) {
      // Re-run with the model's own material answer folded in. The prompt left
      // that line UNDECIDED precisely so the model would supply the one thing
      // geometry cannot; now that it has, the engine does the arithmetic
      // downstream of it rather than trusting the model's.
      // Snapshot before the overwrite — `applyRuleDecisions` mutates in place,
      // so a diff taken afterwards would be the rules against themselves.
      aiOriginal = analysisMode === 'both'
        ? structuredClone((analysis as { costInputSuggestions?: Record<string, unknown> }).costInputSuggestions ?? {})
        : null;
      const resolved = runCostInputRules(
        ruleSpec, withAIAnswers(ruleCtx, analysis as Record<string, unknown>));
      ruleOverrides = applyRuleDecisions(
        analysis as Parameters<typeof applyRuleDecisions>[0], resolved);
      // A rule that is ASKING must not let the model answer silently: fields
      // owned by blocked rules are cleared and the clearing is on the record.
      // (Audit gap 2: the model's stock mouldCostGBP=200000 costed the bumper's
      // tooling because the resin question was open and nothing said so.)
      aiSuppressed = suppressAIForUndecided(
        analysis as Parameters<typeof suppressAIForUndecided>[0], resolved, ruleSpec);
      if (aiSuppressed.length) {
        console.log(`[CAD] Suppressed ${aiSuppressed.length} AI value(s) pending decisions: `
          + aiSuppressed.map(x => `${x.field}=${String(x.aiValue)}`).join(', '));
      }
      ruleFields = toRuleFields(resolved);
      const contradicted = ruleOverrides.overridden.filter(o => o.contradicted);
      if (contradicted.length) {
        console.log(`[CAD] Rules overrode ${contradicted.length} field(s) the model disagreed with: `
          + contradicted.map(o => `${o.field} ${String(o.from)}\u2192${String(o.to)}`).join(', '));
      }
      if (analysisMode === 'both') {
        // The audit run: build the deterministic answer independently and diff
        // it against the model's ORIGINAL reply, before the rules overwrote it.
        // Diffing after the overwrite would compare the rules with themselves.
        const det = buildDeterministicAnalysis(ruleSpec, ruleCtx, geo.partName || 'part');
        modeDiff = diffAnalyses(
          det.analysis.costInputSuggestions as unknown as Record<string, unknown>,
          aiOriginal ?? {},
          resolved);
        deterministicAnalysis = det.analysis;
      }
    }
  } catch (err) {
    respondAIError(res, err);
    return;
  }

  // OCCT emits volume as {mm3, cm3} — there is no top-level volumeCm3, so read
  // volume.cm3 or the ground-truth volume check never fires on the STEP/IGES path.
  const measuredVol = stlGeometry?.volume ?? (geo.status === 'success' ? (geo.volume?.cm3 ?? null) : null);
  // Cap near-net (cast/forged) machining time before it drives the cost, then run sanity.
  const sanityWarnings = runAllGuards(analysis, geo, measuredVol, aiOriginal ?? statedFromAnswers(decisionAnswers));
  if (sanityWarnings.length) console.log(`[CAD] Sanity: ${sanityWarnings.length} warning(s): ${sanityWarnings.map(x => x.code).join(', ')}`);

  const aiDecisions = [...(unitsDecision ? [unitsDecision] : []), ...pendingDecisions(ruleSpec, ruleCtx, withAIAnswers(ruleCtx, analysis as Record<string, unknown>), ruleOverrides?.undecided.length ?? 0)];
  const payload = {
    success: true,
    analysis,
    sanityWarnings,
    // What the deterministic rules decided, what the model had said, and what
    // nobody could decide. The report renders this as the provenance trail.
    ruleOverrides,
    // AI values cleared because their owning rule is still asking a question —
    // the consumer must treat these fields as UNANSWERED, not zero.
    aiSuppressed,
    // Every rule value keyed by form field id. The form is the consumer, so this
    // addresses the form directly rather than going through the model's response
    // schema, which has nowhere to put 54 of the 131 values the rules compute.
    ruleFields,
    // mode='both': the deterministic answer alongside the model's, and the diff.
    // Not a merge — a comparison, which is what makes flipping the default a
    // measured decision rather than a preference.
    deterministicAnalysis,
    diff: modeDiff,
    aiOriginal,
    // The AI path has open decisions too — it just answers them itself. Saying
    // which ones it answered is worth more than hiding that it did.
    decisions: aiDecisions,
    costable: isCostable(aiDecisions, sanityWarnings, acknowledged),
    mode: analysisMode,
    fromCache: false,
    geometrySource,
    geometryHash: geometrySource === 'occt' ? uploadHash : null,
    truncated: stlGeometry?.truncated ?? false,
    unitCheck: geo.status === 'success' ? (geo.unitCheck ?? null) : null,
    annualVolume,
    occtGeometry: geo.status === 'success' ? geo : null,
    stlGeometry: stlGeometry
      ? {
          triangleCount: stlGeometry.triangleCount,
          volume: stlGeometry.volume,
          surfaceArea: stlGeometry.surfaceArea,
          boundingBox: stlGeometry.boundingBox,
          estimatedWallThicknessMm: stlGeometry.estimatedWallThicknessMm,
          format: stlGeometry.format,
          parseTimeMs: stlGeometry.parseTimeMs,
        }
      : null,
    preprocessed: {
      format: preprocessed.format,
      partName: preprocessed.partName,
      boundingBoxEstMm: preprocessed.boundingBoxEstMm,
      entityStats: preprocessed.entityStats,
    },
  };
  // Cache set AFTER the queue so a cache hit replays the same job id.

  // ── Queue the deep geometric DFM in the background ───────────────────────
  // Manufacturing asked for this to run unattended and produce a detailed
  // report. The per-face scan is far too slow to sit in this request, so the
  // costing returns now and the analysis runs on. The job id rides in the
  // response so the client can collect the report when it lands.
  //
  // Only for commodities with a rule pack: queueing a job that can only return
  // "no pack exists" wastes a kernel run and a worker slot.
  const dfmJobId = await queueGeometricDFM(
    buffer, originalname, selectedCommodity,
    preprocessed.partName, forcedMaterial, forcedProcess, annualVolume);
  cadCache.set(cacheKey, { ...payload, fromCache: true, dfmJobId });

  res.json({ ...payload, dfmJobId });
}));

// ─── JSON extraction helper ──────────────────────────────────────────────────
// Handles: plain JSON, ```json\n{...}\n```, ```{...}```, "here is json: {...}"
function extractJson(text: string): string {
  let s = text.trim();
  // Strip opening code fence (```json, ```JSON, ``` on same line or followed by newline)
  s = s.replace(/^```(?:json)?\s*/i, '');
  // Strip closing code fence
  s = s.replace(/\s*```\s*$/i, '');
  s = s.trim();
  // Take the first BALANCED object, not first-{ to last-}.
  //
  // The naive span breaks on the commonest real failure: a model that emits a
  // complete object, then a sentence of prose, then a second object. First-to-
  // last then returns `{...} prose {...}`, which fails with "Unexpected
  // non-whitespace character after JSON" at exactly the character where the
  // first object closed — observed live on a gear re-analysis, where even the
  // repair retry then failed because it was handed the same malformed span.
  //
  // Scanning for balance respects strings and escapes, so a brace inside a
  // quoted reason string does not end the object early.
  const first = s.indexOf('{');
  if (first === -1) return s;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = first; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(first, i + 1);
    }
  }
  // Unbalanced (genuinely truncated) — hand back the widest span and let the
  // caller's repair attempt try, rather than failing here with less context.
  const last = s.lastIndexOf('}');
  return last > first ? s.slice(first, last + 1) : s;
}

/**
 * Run the main CAD analysis as prompt-guided JSON (no structured outputs).
 * Parses with extractJson; on parse failure, asks the model once to return
 * only corrected JSON. Throws on a second failure (caller maps to a 502).
 */
async function cadAnalyzeJSON(
  anthropic: Anthropic,
  deepAnalysis: boolean,
  systemPrompt: string,
  userContent: unknown,
): Promise<unknown> {
  const create = (content: unknown) => anthropic.messages.create({
    model: cadModel(deepAnalysis),
    max_tokens: 8192,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  } as Parameters<typeof anthropic.messages.create>[0]);

  const textOf = (m: unknown) => (m as { content: Array<{ type: string; text?: string }> }).content.find(b => b.type === 'text')?.text ?? '';

  const raw = textOf(await create(userContent));
  try {
    return JSON.parse(extractJson(raw));
  } catch {
    // one repair attempt — cheap and usually decisive
    const repair = await create([
      { type: 'text', text: `The following was supposed to be a single valid JSON object but did not parse. Return ONLY the corrected JSON object, no prose, no code fences:\n\n${raw.slice(0, 12000)}` },
    ]);
    return JSON.parse(extractJson(textOf(repair)));
  }
}

/**
 * Defensive normalization of the CAD analysis so a field the model omitted
 * can't crash the renderer (it reads many nested numbers via .toFixed()).
 * Guarantees the top-level sections and their key numerics exist.
 */
/** Measured per-material masses from the OCCT/STL kernel (volume × density) —
 *  the ground truth for net weight. Passed in so the AI's own weight can be
 *  clamped to it and the cast-iron mass is not discarded. */
interface MeasuredWeights { aluminiumKg?: number; steelKg?: number; castIronKg?: number; plasticKg?: number }

// Exported for tests — the live audit found forced-commodity runs taking the
// aluminium default mass because the plastic guard below read only the AI's own
// commodity field (cad-audit/FINDINGS.md F2).
export function normalizeCADAnalysis(
  a: Record<string, unknown>, measured?: MeasuredWeights, selectedCommodity?: string,
): void {
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
  const obj = (v: unknown) => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  a.partName = str(a.partName, 'CAD Part');
  a.aiExplanation = str(a.aiExplanation, '');
  a.confidenceLevel = str(a.confidenceLevel, 'Low');
  a.manufacturabilityScore = num(a.manufacturabilityScore, 60);
  a.detectedFeatures = arr(a.detectedFeatures);
  a.processRecommendations = arr(a.processRecommendations);
  a.manufacturabilityRisks = arr(a.manufacturabilityRisks);
  a.analysisLimitations = arr(a.analysisLimitations);

  const g = obj(a.geometry);
  const bb = obj(g.boundingBoxMm);
  g.boundingBoxMm = { x: num(bb.x, 0), y: num(bb.y, 0), z: num(bb.z, 0) };
  g.estimatedVolumeCm3 = num(g.estimatedVolumeCm3, 0);
  g.estimatedSurfaceAreaCm2 = num(g.estimatedSurfaceAreaCm2, 0);
  const w = obj(g.estimatedWeightKg);
  // Prefer the MEASURED kernel masses (volume × density) over whatever the model
  // echoed — and retain cast iron, which was previously dropped so an iron part
  // fell back to the (heavier) steel mass. Ground truth beats the AI estimate.
  g.estimatedWeightKg = {
    aluminum: num(measured?.aluminiumKg, num(w.aluminum, 0)),
    steel:    num(measured?.steelKg,     num(w.steel, 0)),
    castIron: num(measured?.castIronKg,  num((w as Record<string, unknown>).castIron, 0)),
    plastic:  num(measured?.plasticKg,   num(w.plastic, 0)),
  };
  a.geometry = g;

  const ma = obj(a.materialAnalysis);
  const ps = obj(ma.primarySuggestion);
  ma.primarySuggestion = { materialId: str(ps.materialId, ''), name: str(ps.name, 'Unspecified'), confidencePct: num(ps.confidencePct, 50), ...ps };
  ma.alternatives = arr(ma.alternatives);
  // A more-confident alternative must never sit below the primary (the model
  // returned "PA6-GF 55%" as primary with "Aluminium 6061 65%" as an alternative).
  {
    const alts = (ma.alternatives as MaterialSuggestion[]).map(alt => ({ ...obj(alt), materialId: str(obj(alt).materialId, ''), name: str(obj(alt).name, 'Unspecified'), confidencePct: num(obj(alt).confidencePct, 0) } as MaterialSuggestion));
    const res = promoteHighestConfidence(ma.primarySuggestion as MaterialSuggestion, alts);
    if (res.promoted) {
      ma.primarySuggestion = res.primary;
      ma.alternatives = res.alternatives;
      ma.promotedFromAlternative = true;
    }
  }
  a.materialAnalysis = ma;

  const ci = obj(a.costInputSuggestions);
  ci.recommendedCommodity = str(ci.recommendedCommodity, 'machining');
  // The ROUTE decided the commodity (forced / gear-metrology / stage-1 + guard).
  // The model restating a different one here silently re-aimed the browser at
  // the wrong costing form — a gear came back "forging" and would have been
  // costed as one. The selection is not the model's to change.
  if (selectedCommodity) ci.recommendedCommodity = selectedCommodity;

  // Cost what we RECOMMEND. The model sometimes puts a lower-confidence
  // alternative in costInputSuggestions.materialId (e.g. it costed PP-GF30 while
  // the primary suggestion was unfilled PP/TPO at 78% — inflating the material
  // bucket with a glass-filled grade the analysis did not actually recommend).
  // When the primary has a concrete materialId that differs, and the costed id is
  // only a same-or-lower-confidence alternative, align the costed grade to the
  // primary so the report costs the material it recommends.
  {
    const primary = ma.primarySuggestion as MaterialSuggestion;
    const costedId = str(ci.materialId, '');
    if (primary.materialId && costedId && primary.materialId !== costedId) {
      const altMatch = (ma.alternatives as MaterialSuggestion[]).find(al => al.materialId === costedId);
      const costedConf = altMatch?.confidencePct ?? 0;
      if ((primary.confidencePct ?? 0) >= costedConf) {
        ci.materialAlignedNote =
          `Costed material aligned to the primary suggestion (${primary.materialId}, ${primary.confidencePct}%) ` +
          `instead of ${costedId}${altMatch ? ` (${costedConf}% alternative)` : ''}.`;
        ci.materialId = primary.materialId;
      }
    }
  }
  {
    // Grey cast iron (EN-GJL, flake graphite) is brittle and unsafe for a
    // structural / suspension part — a steering knuckle, stub axle, hub, control
    // arm or upright must be ductile (nodular) iron EN-GJS-500-7 or forged steel.
    // Redirect a grey-iron pick to ductile for those parts.
    const nameBlob = `${str(a.partName, '')} ${String(obj((a.materialAnalysis as Record<string, unknown>)?.primarySuggestion).name ?? '')}`.toLowerCase();
    const structural = /knuckle|stub.?axle|control.?arm|suspension|steering|upright|kingpin|spindle|hub carrier|wishbone|trailing arm|tie.?rod/.test(nameBlob);
    if (structural && /^mat-gjl/.test(str(ci.materialId, ''))) {
      ci.materialSafetyNote =
        'Grey cast iron redirected to ductile iron EN-GJS-500-7 — grey (flake) iron is brittle and unsuitable for a structural/suspension part.';
      ci.materialId = 'mat-gjs500';
      const prim = ma.primarySuggestion as MaterialSuggestion;
      if (/^mat-gjl/.test(str(prim.materialId, ''))) { prim.materialId = 'mat-gjs500'; prim.name = 'EN-GJS-500-7 (Ductile Iron)'; }
    }
  }
  {
    // Default the weight from the material FAMILY the analysis actually picked —
    // an aluminium-always default costed steel parts at ~34% of their true mass.
    const wts = (g.estimatedWeightKg ?? {}) as Record<string, number>;
    const matHint = `${str(ci.materialId, '')} ${String((obj((a.materialAnalysis as Record<string, unknown>)?.primarySuggestion).name) ?? '')}`.toLowerCase();
    // A plastic-moulding commodity is always a plastic part, whatever the material
    // name looks like — so the weight MUST come off the plastic density, never the
    // aluminium default. (An HDPE fuel tank costed at aluminium density read 28 kg
    // instead of ~10 kg.) The name regex also now recognises HDPE/PE/PVC/PET, which
    // it silently missed before — those fell through to the aluminium weight.
    // The SELECTED commodity must participate: on a forced injection-moulding
    // run where the model left recommendedCommodity empty, this guard silently
    // missed and a 2.16 kg PP bumper was weighted as 5.56 kg of aluminium
    // (live audit F2). The engineer's forced choice outranks the model's field.
    const commodityForWeight = selectedCommodity || String(ci.recommendedCommodity ?? '');
    const plasticCommodity = /blow_mould|injection_mould|rotational_mould|thermoform/.test(commodityForWeight);
    // Cast iron (grey OR ductile) must use the cast-iron mass (7.15 g/cm³), not the
    // steel mass (7.85) — the latter over-stated an iron knuckle's weight ~10%.
    const isCastIron = /\biron\b|gjl|gjs|ggg|ductile|nodular|grey cast|gray cast|cast iron/.test(matHint);
    const famWeight =
      plasticCommodity ? wts.plastic
      : isCastIron ? (wts.castIron || wts.steel)
      : /steel|stainless|en8|4140|1045|s355/.test(matHint) ? wts.steel
      : /plastic|polymer|nylon|pa6|pp\b|abs|pom|peek|resin|hdpe|ldpe|polyeth|pe\b|pvc|petg|pet\b|tpe|tpo|acrylic|pmma|delrin/.test(matHint) ? wts.plastic
      : wts.aluminum;
    const measuredNet = famWeight || wts.aluminum || 0;
    // Clamp the AI's netWeightKg to the measured mass. The model is asked to fill
    // netWeightKg and sometimes over-states it (a knuckle came back 8.79 kg vs the
    // measured 7.42 kg cast iron, +18% — inflating the material bucket and even
    // contradicting the report's own provenance line). Never trust an AI mass that
    // exceeds measured volume × density by more than a hair.
    let net = num(ci.netWeightKg, measuredNet);
    if (measuredNet > 0 && net > measuredNet * 1.05) {
      ci.netWeightClampNote =
        `netWeightKg clamped from AI ${net.toFixed(3)} kg to measured ${measuredNet.toFixed(3)} kg (volume × density).`;
      net = measuredNet;
    }
    ci.netWeightKg = net;
  }
  ci.estimatedOperations = arr(ci.estimatedOperations);
  const cr = obj(ci.costRange);
  ci.costRange = { low: num(cr.low, 0), mid: num(cr.mid, 0), high: num(cr.high, 0), currency: str(cr.currency, 'GBP') };
  a.costInputSuggestions = ci;
}

// ─── Prompt builder ─────────────────────────────────────────────────────────

interface UserOverrides {
  forcedCommodity: string;
  forcedMaterial: string;
  forcedProcess: string;
  annualVolume: number;
  ovrWeightKg: number | null;
  ovrVolumeCm3: number | null;
  ovrLengthMm: number | null;
  ovrWidthMm: number | null;
  ovrHeightMm: number | null;
  ovrDensityGcm3: number | null;
}

// Material choices offered to the AI are scoped to the commodity so it picks a
// grade the form can actually use. Forging must offer wrought FORGING BILLETS
// (…-forge / …-bar), not the generic machining/casting grades — otherwise an
// aluminium forging lands on `mat-al6061` (a bar/machining grade) that the
// billet-scoped forge-mat dropdown silently rejects, leaving a steel-billet
// default and the wrong material cost. The billet list spans every alloy family
// (carbon/alloy/microalloy steel, stainless, aluminium, titanium, nickel, brass)
// so a forged part is costed as the metal it actually is.
export const CAD_FORGING_BILLET_MATERIALS =
  'mat-steel1020, mat-steel4340, mat-steel4130, mat-steel-38mnvs6, mat-ss304l-bar, mat-ss316l-bar, mat-al6061-forge, mat-al7075-forge, mat-ti-6al4v-forge, mat-inconel718-forge, mat-brass-cz122-forge';
export const CAD_GENERIC_MATERIALS =
  // Every id here MUST exist in the rate library — this list teaches the model
  // what ids look like, and it repeats what it is taught. `mat-hss` (in no
  // library) lived here for months and came back in live runs, where the form
  // silently dropped it and costed the default grade (audit F5).
  'mat-al6061, mat-al6082-bar, mat-dc01, mat-steel1045, mat-ss316-sheet, mat-brass-cz121, mat-pp, mat-hdpe, mat-pa6, mat-pc, mat-lm25, mat-gjs500, mat-gjs600, mat-gjl350, mat-adi, mat-mag-az91, mat-ss304-bar, mat-bronze-c905';

// Injection moulding needs a real thermoplastic menu, not the 4 resins in the generic
// list. Without this an ABS / POM / PBT / PC-ABS / glass-filled-nylon part gets mapped to
// the nearest of PP/HDPE/PA6/PC — wrong resin price and cool-time. Every id here is a
// Thermoplastic-category grade the imm-mat dropdown accepts, spanning commodity, engineering
// and glass-filled resins so a moulded part is costed as the polymer it actually is.
export const CAD_INJECTION_RESINS =
  'mat-pp, mat-hdpe, mat-abs, mat-pc, mat-pc-abs, mat-pa6, mat-pa66, mat-pa66gf30, mat-pa6-gf30, mat-pom, mat-pbt-gf30, mat-pp-gf30, mat-asa, mat-hips';

/** Comma-separated valid materialId list to offer the AI for a given commodity. */
export function validMaterialsForCommodity(commodity: string): string {
  if (commodity === 'forging') return CAD_FORGING_BILLET_MATERIALS;
  if (commodity === 'injection_moulding') return CAD_INJECTION_RESINS;
  return CAD_GENERIC_MATERIALS;
}

function buildPrompt(
  geo: OCCTGeometry,
  pre: ReturnType<typeof preprocessCADFile>,
  filename: string,
  selectedCommodity: string,
  stage1: { primary: string; conf: number; alt: Array<{ type: string; conf: number }> } | null,
  overrides: UserOverrides = { forcedCommodity: '', forcedMaterial: '', forcedProcess: '', annualVolume: 100000, ovrWeightKg: null, ovrVolumeCm3: null, ovrLengthMm: null, ovrWidthMm: null, ovrHeightMm: null, ovrDensityGcm3: null },
): string {
  const validMaterials = validMaterialsForCommodity(selectedCommodity);
  const validCommodities = 'machining, sheet_metal, sheet_metal_fab, injection_moulding, casting, forging, cast_and_machine, blow_moulding, thermoforming, rotational_moulding, rubber, composites, wiring_harness, extrusion, pcb_fab, pcba, biw_assembly, painting, assembly';
  const validMachines = 'mach-vmc3, mach-lathe-cnc, mach-drill, mach-vmc5, mach-grind, mach-haas-vf2, mach-dmg-dmu50, mach-haas-umc500, mach-mazak-qt200';

  let geometrySection: string;

  if (geo.status === 'success') {
    const bb = geo.boundingBox!;
    const vol = geo.volume!;
    const sa = geo.surfaceArea!;
    const w = geo.weights!;
    const f = geo.features!;
    const faces = geo.faces!;
    const edges = geo.edges!;

    const faceBreakdown = Object.entries(faces.byType)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `  ${k}: ${v} (${((v / faces.total) * 100).toFixed(0)}%)`)
      .join('\n');

    const edgeBreakdown = Object.entries(edges.byType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const fillHint =
      geo.fillRatio! < 0.05 ? 'enclosed hollow shell → blow/rotational-moulded plastic or a fabricated/welded sheet-metal tank/duct — NOT a single casting/forging (a sealed hollow cannot be cored out)'
      : geo.fillRatio! < 0.20 ? 'very sparse/thin-wall → sheet metal, injection moulding, or thin-wall machined'
      : geo.fillRatio! < 0.40 ? 'moderate fill → casting or machined from billet'
      : geo.fillRatio! < 0.65 ? 'semi-solid → forging or heavy section casting'
      : 'near-solid → forging or machined from solid bar';

    const wt = geo.wallThickness;
    const wallThicknessStr = wt
      ? `min=${wt.minMm.toFixed(2)}mm  mean=${wt.meanMm.toFixed(2)}mm  max=${wt.maxMm.toFixed(2)}mm  σ=${wt.stdDevMm.toFixed(2)}mm  [${wt.method}, ${wt.uniformity}, n=${wt.sampleCount}]`
      : 'N/A (ray-cast not available)';

    const da = geo.draftAnalysis;
    const draftStr = da
      ? `undercuts=${da.undercutFaceCount}  zero-draft=${da.zeroDraftFaceCount}  adequate=${da.adequateDraftFaceCount}  range=${da.minPositiveDraftDeg?.toFixed(1) ?? '?'}°–${da.maxPositiveDraftDeg?.toFixed(1) ?? '?'}°  (draw dir=[${da.drawDirectionXYZ.join(',')}])`
      : 'N/A';

    const sa2 = geo.setupAnalysis;
    const setupStr = sa2
      ? `${sa2.estimatedSetupCount} setups  [${sa2.principalDirections.map(d => `${d.directionLabel}:${d.faceCount}f`).join(', ')}]`
      : 'N/A';

    const cnc = geo.cncCycleTimeEstimate;
    const cncStr = cnc
      ? `total=${cnc.estimatedTotalHrs.toFixed(3)} hr (${cnc.estimatedTotalMins.toFixed(1)} min)  setup=${cnc.setupTimeMins.toFixed(1)}min  milling=${cnc.planarMillingTimeMins.toFixed(1)}min  drill/bore=${cnc.drillBoreTimeMins.toFixed(1)}min`
      : 'N/A';

    const tc = geo.toolingCostEstimates;
    const toolingStr = tc
      ? `HPDC die=${tc.hpdcDieCostGBP.toFixed(0)}  Gravity mould=${tc.gravityMouldCostGBP.toFixed(0)}  Sand pattern=${tc.sandPatternCostGBP.toFixed(0)}  IM mould=${tc.imMouldCostGBP.toFixed(0)}  Forge die=${tc.forgeDieCostGBP.toFixed(0)}  Progressive die=${tc.progressiveDieCostGBP.toFixed(0)} (all GBP)`
      : 'N/A';

    const ps = geo.processSpecificEstimates;
    const psStr = ps
      ? `Sand cycle=${ps.sandCycleTimeHr.toFixed(3)}hr  Sand(ferrous)=${ps.sandCycleTimeHrFerrous.toFixed(3)}hr  Forge strokes=${ps.forgeStrokes}  Invest wax=${ps.investWaxCostGBP.toFixed(2)}GBP  Invest shell=${ps.investShellCostGBP.toFixed(2)}GBP`
      : 'N/A';

    const mfgScore = geo.manufacturabilityScore ?? null;

    const warningLines: string[] = [];
    if (geo.assemblyWarning) warningLines.push(`⚠ ASSEMBLY DETECTED: ${geo.assemblyWarning} — cost per component, not per assembly`);
    if (geo.unitWarning)    warningLines.push(`⚠ UNIT WARNING: ${geo.unitWarning}`);

    geometrySection = `=== GEOMETRY (measured by Open CASCADE OCCT — all values are precise) ===
File: ${filename}
Bounding box: ${bb.xMm}mm × ${bb.yMm}mm × ${bb.zMm}mm
True volume: ${vol.cm3} cm³ (${vol.mm3.toFixed(0)} mm³)
True surface area: ${sa.cm2} cm²
Fill ratio: ${geo.fillRatio} → ${fillHint}
${warningLines.length ? '\n' + warningLines.join('\n') + '\n' : ''}
=== WALL THICKNESS ANALYSIS ===
${wallThicknessStr}

=== DRAFT & UNDERCUT ANALYSIS ===
${draftStr}
${da && da.undercutFaceCount > 0 ? `⚠ ${da.undercutFaceCount} undercut faces detected — casting/moulding will require side actions or re-orientation` : 'No undercuts detected'}

=== MACHINING SETUP ESTIMATION ===
${setupStr}

=== CNC CYCLE TIME ESTIMATE (bottom-up) ===
${cncStr}
${cnc ? `  Assumptions: feed=${cnc.assumedFeedRateMm2PerMin}mm²/min, drill=${cnc.assumedDrillBoreMinPerFeature}min/feature, setup=${cnc.assumedSetupTimeMinsPerSetup}min/setup` : ''}

=== COMPUTED MANUFACTURABILITY SCORE ===
${mfgScore !== null ? `Score: ${mfgScore}/100 (geometry-derived — use this value verbatim in manufacturabilityScore field)` : 'N/A — use your own assessment'}

=== PARAMETRIC TOOLING COST ESTIMATES (geometry-derived — use these verbatim) ===
${toolingStr}

=== PROCESS-SPECIFIC ESTIMATES (geometry-derived — use these verbatim) ===
${psStr}
${geo.gear?.likelyGear ? `
=== GEAR METROLOGY (COUNTED/MEASURED off the B-rep — use these verbatim, never contradict them) ===
Teeth: ${geo.gear.teeth} (${geo.gear.teethBasis})
Tip diameter: ${geo.gear.tipDiameterMm} mm · Face width: ${geo.gear.faceWidthMm} mm · Bore: ${geo.gear.boreDiameterMm} mm
Derived normal module (spur-equivalent): ${geo.gear.derivedNormalModuleMm} mm (${geo.gear.moduleBasis})
Helix angle: NOT derivable from the solid — read it from the drawing or leave it to the UNDECIDED question.
` : ''}
Weight at density:
  Aluminium 2.70 g/cm³: ${w.aluminiumKg.toFixed(3)} kg
  Steel 7.85 g/cm³: ${w.steelKg.toFixed(3)} kg
  Cast iron 7.15 g/cm³: ${w.castIronKg.toFixed(3)} kg
  Plastic 1.05 g/cm³: ${w.plasticKg.toFixed(3)} kg
  Copper 8.96 g/cm³: ${w.copperKg.toFixed(3)} kg
  Titanium 4.43 g/cm³: ${w.titaniumKg.toFixed(3)} kg
MATERIAL — do NOT default to the lightest metal. The same solid is ~2.9x heavier in steel than aluminium, so guessing aluminium silently under-costs a steel part. A dense, thick-section solid — especially a drivetrain / suspension / powertrain component (axle, stub axle, knuckle, spindle, hub, shaft, gear, sprocket, crankshaft, connecting rod, yoke, kingpin, lever arm) — is almost always forged or cast STEEL (e.g. EN8, 4140, 42CrMo, cast ductile iron), NOT aluminium, unless there is an explicit aluminium signal: an aluminium hint in the filename/drawing, a thin-wall high-pressure-die-cast wall (2–4 mm uniform), or a lightweighting note. When unsure between aluminium and steel on a solid metal part, prefer steel and say so in the reasoning.

=== FACE TOPOLOGY (B-rep surface classification) ===
Total faces: ${faces.total}
${faceBreakdown}

=== EDGE TOPOLOGY ===
Total edges: ${edges.total}
${edgeBreakdown}
Sample circle edge radii (mm): [${edges.sampleCircleRadiiMm.join(', ')}]

=== DETECTED FEATURES ===
Cylindrical faces: ${f.cylindricalFaceCount} (radii mm: [${f.cylindricalFaceRadiiMm.join(', ')}])
Estimated holes (r < 30mm): ${f.estimatedHoleCount} at radii [${f.holeRadiiMm.join(', ')}] mm
Boss/shaft features (r ≥ 30mm): ${f.bossShaftRadiiMm.length > 0 ? f.bossShaftRadiiMm.join(', ') + ' mm' : 'none detected'}
Threaded features: ${f.threadFeaturesDetected ? 'DETECTED' : 'not detected'}
Planar faces: ${f.planarFaceCount}
Free-form surfaces (B-spline/Bezier): ${f.freeFormFaceCount}`;
  } else {
    geometrySection = `=== GEOMETRY (text-parsed from ${pre.format} file — lower confidence) ===
File: ${filename}  Size: ${pre.fileSizeKB.toFixed(0)} KB
${pre.summary}`;
  }

  // The OCCT CNC estimate times milling as if machined from solid (whole planar
  // area). For a near-net cast/forged part only finish stock is removed, so cap
  // the guidance time to the finish-machining envelope before the AI sees it.
  const cncFromSolidHrs = geo.cncCycleTimeEstimate?.estimatedTotalHrs ?? null;
  // Material is unknown at prompt time, so use the HEAVIEST family weight for a
  // generous guidance ceiling (aluminium-first under-capped steel/iron parts).
  // The authoritative post-process cap re-applies with the AI's actual weight.
  const nearNetWeightKg = Math.max(geo.weights?.aluminiumKg ?? 0, geo.weights?.steelKg ?? 0, geo.weights?.castIronKg ?? 0);
  const cncHrs = cncFromSolidHrs !== null
    ? capNearNetMachiningHr(cncFromSolidHrs, nearNetWeightKg, selectedCommodity).machiningHr
    : null;
  const setupCount = geo.setupAnalysis?.estimatedSetupCount ?? null;
  const undercutCount = geo.draftAnalysis?.undercutFaceCount ?? 0;

  const mfgScore = geo.manufacturabilityScore ?? null;

  // Stage 1 selection context for the specialist
  const stage1Context = stage1
    ? `\n=== STAGE 1 PRE-SELECTION (Haiku fast classifier) ===\nPrimary: ${stage1.primary} (conf=${stage1.conf})\nAlternatives: ${(stage1.alt ?? []).map(a => `${a.type}(${a.conf})`).join(', ')}\nYou are the specialist for: ${selectedCommodity} — focus your analysis accordingly.\n`
    : '';

  // Commodity-specific cost input rules
  const commodityRules = buildCommodityRules(ruleContextFor(selectedCommodity, geo, filename, overrides));

  const baseInstructions = geo.status === 'success'
    ? `IMPORTANT GUIDELINES:
- Use the PRECISE OCCT measurements above — do NOT re-estimate geometry
- Set boundingBoxMm to the exact values from the bounding box above
- Set estimatedVolumeCm3 and estimatedSurfaceAreaCm2 to the exact OCCT values
- Set estimatedWeightKg.aluminum/steel/plastic using the weights above
- Set netWeightKg for the primary material suggestion using its weight from above
- Fill ratio ${geo.fillRatio} and face topology determine process: ${geo.fillRatio! > 0.5 ? 'high fill → likely machined or forged' : 'low fill → likely cast, moulded, or fabricated'}
- ${geo.features!.freeFormFaceCount > (geo.faces!.total * 0.15) ? `High free-form content (${geo.features!.freeFormFaceCount}/${geo.faces!.total} faces) → organic shape → favour casting or 5-axis` : 'Mostly prismatic geometry → favour machining or forging'}
- ${geo.features!.estimatedHoleCount > 8 ? `${geo.features!.estimatedHoleCount} holes detected → significant drilling/boring operations required` : ''}
- ${geo.features!.threadFeaturesDetected ? 'Threads detected → include threading operation' : ''}
- ${cncHrs !== null ? `For machining: use estimatedCycleTimeHr=${cncHrs.toFixed(3)} from bottom-up CNC estimate (do NOT guess)` : ''}
- ${setupCount !== null ? `For machining/CAM: estimatedSetupTimeHr=${((setupCount * (geo.cncCycleTimeEstimate?.assumedSetupTimeMinsPerSetup ?? 45)) / 60).toFixed(3)} (${setupCount} setups)` : ''}
- ${undercutCount > 0 ? `${undercutCount} undercuts detected → add High severity manufacturability risk for casting/moulding; machining may need 5-axis` : 'No undercuts — standard tooling angles acceptable'}
- manufacturabilityScore: ${mfgScore !== null ? `use EXACTLY ${mfgScore} (geometry-derived, do NOT alter)` : '0–100 (100 = easiest); deduct 5–15 pts per undercut, 5 pts per zero-draft cluster'}`
    : `GUIDELINES:
- estimatedVolumeCm3: bbox_cm3 × fill_factor (machined: 0.35–0.55, cast: 0.5–0.7, sheet metal: 0.1–0.25)
- estimatedWeightKg: volume × density (Al 2.70, steel 7.85, plastic 1.05 g/cm³)
- manufacturabilityScore: 0–100
- Populate the appropriate costInputSuggestions sub-object for the recommended process`;

  // Build user overrides block
  const overrideLines: string[] = [];
  if (overrides.forcedCommodity) overrideLines.push(`Manufacturing process: ${overrides.forcedCommodity} [USER-FORCED — use this as recommendedCommodity, do NOT override]`);
  if (overrides.forcedMaterial)  overrideLines.push(`Material: ${overrides.forcedMaterial} [USER-FORCED — use this as materialId exactly]`);
  // Filename material prior — the engineer named the material in the file; do not
  // silently value-engineer it to something cheaper (an "Aluminium…" file was being
  // reclassified as injection-moulded plastic).
  const fnameFam = familyFromFilename(filename);
  if (fnameFam && !overrides.forcedMaterial) {
    const fnameMat = proseFamily(fnameFam);
    overrideLines.push(`FILENAME MATERIAL PRIOR: the source file is named "${filename}", indicating the part material is ${fnameMat}. Treat this as a STRONG prior — classify, select the process for, and cost the part AS ${fnameMat} unless the geometry flatly rules it out. Do NOT substitute a different/cheaper material or "convert to plastic for IM economics": cost the part AS DESIGNED, not as it could be re-engineered. If you genuinely believe another material is correct, keep ${fnameMat} as the primarySuggestion and note the alternative.`);
  }
  if (overrides.forcedProcess)   overrideLines.push(`Casting / process route: ${overrides.forcedProcess} [USER-FORCED — set costInputSuggestions.casting.subtype AND costInputSuggestions.castCAM.subtype to exactly "${overrides.forcedProcess}"; keep cycle time, machine selection and tooling cost consistent with THIS route, not your own preferred one]`);
  if (overrides.ovrWeightKg !== null)    overrideLines.push(`Part weight: ${overrides.ovrWeightKg} kg [USER-PROVIDED — use this as netWeightKg]`);
  if (overrides.ovrVolumeCm3 !== null)   overrideLines.push(`Volume: ${overrides.ovrVolumeCm3} cm³ [USER-PROVIDED — use this as estimatedVolumeCm3]`);
  if (overrides.ovrLengthMm !== null)    overrideLines.push(`Bounding box L: ${overrides.ovrLengthMm} mm [USER-PROVIDED]`);
  if (overrides.ovrWidthMm !== null)     overrideLines.push(`Bounding box W: ${overrides.ovrWidthMm} mm [USER-PROVIDED]`);
  if (overrides.ovrHeightMm !== null)    overrideLines.push(`Bounding box H: ${overrides.ovrHeightMm} mm [USER-PROVIDED]`);
  if (overrides.ovrDensityGcm3 !== null) overrideLines.push(`Material density: ${overrides.ovrDensityGcm3} g/cm³ [USER-PROVIDED — use for weight calculations]`);
  overrideLines.push(`Annual production volume: ${overrides.annualVolume.toLocaleString()} units/year [USE THIS for tooling amortisation and cycle-time-vs-volume optimisation]`);

  const overridesSection = overrideLines.length > 0
    ? `\n=== USER-PROVIDED INPUTS (treat as GROUND TRUTH — do NOT deviate) ===\n${overrideLines.join('\n')}\n`
    : `\n=== PRODUCTION CONTEXT ===\nAnnual production volume: ${overrides.annualVolume.toLocaleString()} units/year [use for tooling amortisation]\n`;

  return `${geometrySection}
${stage1Context}${overridesSection}
Valid materialId values: ${validMaterials}
Valid commodityType values: ${validCommodities}
Valid machineId values: ${validMachines}

${baseInstructions}

${commodityRules}

FIELD CONFIDENCE INSTRUCTIONS:
For each key field you populate, provide a confidence score 0.0–1.0 in fieldConfidences.
Keys should match the form field IDs. Examples:
  "bm-wall": 0.72 (if you estimated from OCCT mean wall)
  "imm-cav": 0.90 (if cavity count is clearly derivable from part mass)
  "cast-hpdc-die-cost": 0.95 (if OCCT parametric estimate used verbatim)
Score 0.9+ only when using OCCT-derived verbatim values. Score 0.5–0.7 for geometry-informed estimates. Score 0.3–0.5 for rule-of-thumb bracket estimates.

DFM ISSUES:
List 2–5 DFM issues specific to the ${selectedCommodity} process. Each should have:
  severity: "Critical"|"High"|"Medium"|"Low"
  area: short feature/area name
  description: what the issue is
  impact: cost or quality impact
  fix: actionable design change

COST RANGE:
Provide a cost range estimate: { "low": number, "mid": number, "high": number, "currency": "GBP" }
  low = optimistic (ideal tooling amortisation, high volume, simple features)
  mid = most likely unit cost
  high = conservative (complex features, low volume, rework allowance)

Return ONLY this JSON structure (no prose, no markdown fences):
${buildJSONSchema(selectedCommodity, geo)}`;
}

// ─── Commodity-specific cost input rules ────────────────────────────────────

/**
 * Per-commodity cost-input rules, rendered into the specialist prompt.
 *
 * This used to be a hundred-line switch of prompt text — the rules stated once
 * here, for the model, and again (differently) in whatever code consumed the
 * model's reply. It is now a rendering of `src/engine/cost-input-rules/`, the
 * same specs the deterministic path runs. There is one set of rules, and the
 * prompt is a report of what they computed rather than a second copy of them.
 *
 * Two consequences worth stating:
 *
 *  - **The numbers changed.** The specs corrected roughly a dozen constants this
 *    text used to carry (casting yield on three of four subtypes, forging yield
 *    and die life, the sheet gauge read off a bend radius, projected area on a
 *    part not modelled along Z). Each correction is behind a test in
 *    `tests/cost-input-rules-*.test.ts`.
 *  - **The block names what nobody can decide.** Where a rule needs an answer
 *    the geometry cannot give — the material family, the three service flags —
 *    the line reads `UNDECIDED` and states the question. That is strictly better
 *    than the old text, which hid the question and let the model quietly guess.
 *    The model may still propose a value; `applyRuleDecisions` then leaves it
 *    alone and labels it as the model's.
 *
 * Commodities with no spec yet (extrusion, painting, BIW, PCB, harness,
 * assembly) fall through to the generic block, unchanged.
 */
export function buildCommodityRules(ctx: RuleContext): string {
  const spec = specForCommodity(ctx.commodity);
  if (spec) return renderCommodityRulesPrompt(spec, ctx);
  return `COST INPUT RULES:
  Populate the sub-object matching the recommended commodity in costInputSuggestions.
  Use OCCT geometry measurements where available.`;
}

/**
 * The answers the AI path can supply on the engineer's behalf.
 *
 * There is nobody at the screen during an `/analyze` call, so a spec that asks
 * "what is this made of?" would block every material-dependent line. Two real
 * answers exist and both are already trusted elsewhere in this file: a material
 * the engineer pinned on the form, and the family named in the file name — the
 * prior added after a file called "Aluminium…" was costed as plastic.
 *
 * Nothing else is invented. The service flags (pressure-tight, tolerance class,
 * safety-critical) genuinely have no source here and stay open.
 */
export function answersFromContext(
  forcedMaterial: string,
  filename: string,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  const family = familyFromFilename(forcedMaterial) ?? familyFromFilename(filename);
  if (family) answers['material.family'] = family;
  return answers;
}

/**
 * Fold the model's material choice back into the rule context.
 *
 * The material is the one question an `/analyze` call has no engineer to answer,
 * so the prompt renders those lines as UNDECIDED and the model fills them. Once
 * it has, everything downstream is arithmetic again — and the rules, not the
 * model, do it.
 *
 * Different commodities ask for it differently: metals want a family, plastics a
 * resin grade, rubber a compound, composites a fibre/resin system. One material
 * id answers all four, so all four are set and each derive module takes the one
 * it recognises.
 */
export function withAIMaterial(ctx: RuleContext, analysis: Record<string, unknown>): RuleContext {
  const ci = analysis.costInputSuggestions as { materialId?: unknown } | undefined;
  const materialId = typeof ci?.materialId === 'string' ? ci.materialId : '';
  if (!materialId) return ctx;

  const answers: Record<string, unknown> = { ...ctx.answers };
  const family = familyFromMaterialId(materialId);
  // THE ENGINEER'S ANSWER WINS. When a material decision has been answered
  // (re-analysis with decisionAnswers), the confirmed family must NOT be
  // clobbered by the model's guess — doing so silently reverted a cast-iron
  // confirmation back to the AI's aluminium on the mode=both/reanalyze path,
  // defeating the whole point of the confirm gate (found in the final
  // verification run). Only fold the model's family in when nobody answered;
  // then it is tagged as the model's, not the engineer's.
  const engineerAnswered = typeof ctx.answers['material.family'] === 'string'
    && (ctx.answers['material.family'] as string).length > 0;
  if (family && !engineerAnswered) {
    answers['material.family'] = family;
    answers['material.familySource'] = 'ai';
  }
  // Grade-level answers for the plastic/rubber/composite specs: only supply
  // these when the engineer has not pinned the grade-level answer either, for
  // the same reason.
  if (typeof ctx.answers['material.resin'] !== 'string') answers['material.resin'] = materialId;
  if (typeof ctx.answers['material.elastomer'] !== 'string') answers['material.elastomer'] = materialId;
  if (typeof ctx.answers['material.laminate'] !== 'string') {
    const laminate = systemForFibreId(materialId);
    if (laminate) answers['material.laminate'] = laminate.value;
  }
  return { ...ctx, answers };
}

/** The gear questions a drawing can answer, and their valid values. */
const GEAR_AI_ANSWERABLE = [
  { id: 'gear.helix', pick: (g: Record<string, unknown>) =>
      typeof g.helixAngleDeg === 'number' && Math.abs(g.helixAngleDeg) < 60
        ? String(g.helixAngleDeg) : null },
  { id: 'gear.qualityClass', pick: (g: Record<string, unknown>) => {
      const q = Number(g.qualityClass);
      return Number.isFinite(q) && q >= 1 && q <= 11 ? String(q) : null;
    } },
  { id: 'gear.effectiveCaseDepthMm', pick: (g: Record<string, unknown>) => {
      // A drawing case-depth read is a real figure and worth using — but it is
      // the MODEL's read, so it is folded in tagged 'ai' with reduced
      // confidence and a basis that says so, never as an engineer's answer.
      const d = Number(g.effectiveCaseDepthMm);
      return Number.isFinite(d) && d > 0 && d < 5 ? String(d) : null;
    } },
  { id: 'gear.hardeningRoute', pick: (g: Record<string, unknown>) =>
      typeof g.hardeningRoute === 'string'
        && ['case_hardening', 'lpc_carburising', 'carbonitriding', 'quench_temper',
             'martempering', 'austempering', 'nitriding', 'fnc', 'induction_hardening', 'none']
             .includes(g.hardeningRoute)
        ? g.hardeningRoute : null },
  { id: 'gear.materialClass', pick: (g: Record<string, unknown>) =>
      typeof g.materialClass === 'string'
        && ['case_hardening_steel', 'through_hardening_steel', 'alloy_steel_prehardened',
            'stainless', 'cast_iron', 'bronze', 'plastic'].includes(g.materialClass)
        ? g.materialClass : null },
] as const;

/**
 * Fold the model's drawing-read gear answers into the rule context.
 *
 * Helix, ISO class and material class are drawing figures the model may have
 * genuinely read off an attached PDF. Same contract as `withAIMaterial`: the
 * engineer's answer always wins, an AI-sourced answer is tagged as the model's,
 * and `pendingDecisions` keeps the question OPEN as a blocking confirm with the
 * model's read as the leaning — one click for the engineer, no silent ingestion
 * of an OCR'd drawing field into money.
 */
export function withAIGearAnswers(ctx: RuleContext, analysis: Record<string, unknown>): RuleContext {
  if (ctx.commodity !== 'gear') return ctx;
  const gg = (analysis.costInputSuggestions as { gear?: Record<string, unknown> } | undefined)?.gear;
  if (!gg) return ctx;
  const answers: Record<string, unknown> = { ...ctx.answers };
  for (const q of GEAR_AI_ANSWERABLE) {
    if (ctx.answers[q.id] !== undefined) continue;       // the engineer answered
    const v = q.pick(gg);
    if (v !== null) { answers[q.id] = v; answers[`${q.id}Source`] = 'ai'; }
  }
  return { ...ctx, answers };
}

/** Compose every AI fold-in. Both /analyze paths call this, not the parts. */
export function withAIAnswers(ctx: RuleContext, analysis: Record<string, unknown>): RuleContext {
  return withAIGearAnswers(withAIMaterial(ctx, analysis), analysis);
}

/**
 * The decision list a costing must still answer.
 *
 * Two sources: rules that stayed blocked even WITH the model's material folded
 * in, and — the audit's Part1 lesson — the material question itself whenever
 * the family was settled ONLY by the model. The same unknown casting came back
 * aluminium LM25 on one run and ductile iron GJS-500 on another (a 2.6x money
 * swing) because geometry cannot decide a material and the fold-in silently
 * accepted whichever way the model guessed. So an AI-sourced family keeps the
 * question OPEN as a blocking confirm, with the model's pick marked as the
 * leaning: one click for the engineer, no silent guess in the money.
 */
function pendingDecisions(
  ruleSpec: ReturnType<typeof specForCommodity>,
  ruleCtx: RuleContext,
  withAI: RuleContext,
  undecidedCount: number,
): Decision[] {
  if (!ruleSpec) return [];
  const aiAnsweredMaterial =
    withAI.answers['material.familySource'] === 'ai' && !ruleCtx.answers['material.family'];
  // Gear drawing-reads the model supplied and the engineer has not confirmed —
  // same Part1 lesson, applied to helix / ISO class / material class.
  const aiGearIds = ['gear.helix', 'gear.qualityClass', 'gear.materialClass', 'gear.hardeningRoute',
                     'gear.effectiveCaseDepthMm']
    .filter(id => withAI.answers[`${id}Source`] === 'ai' && ruleCtx.answers[id] === undefined);
  if (!undecidedCount && !aiAnsweredMaterial && !aiGearIds.length) return [];
  // Re-run WITHOUT the AI answers: these are the questions a person still owns.
  const bare = runCostInputRules(ruleSpec, ruleCtx).decisions;
  let out = bare;
  if (aiAnsweredMaterial) {
    const aiFamily = withAI.answers['material.family'];
    out = out.map(d => d.id !== 'material.family' ? d : {
      ...d,
      why: `${d.why} The model suggests ${String(aiFamily)} — confirm or correct it; `
        + 'the same part has been guessed differently on different runs.',
      options: d.options.map(o => ({ ...o, leaning: o.value === aiFamily })),
    });
  }
  for (const id of aiGearIds) {
    const aiValue = String(withAI.answers[id]);
    out = out.map(d => d.id !== id ? d : {
      ...d,
      why: `${d.why} The model read "${aiValue}" off the drawing/context — confirm or correct it before it reaches the costing.`,
      options: d.options.map(o => ({ ...o, leaning: o.value === aiValue })),
    });
  }
  return out;
}

export type AnalysisMode = 'deterministic' | 'ai' | 'both';

/**
 * Read the requested mode.
 *
 * **`'deterministic'` is now the default.** It was `'ai'` until the evidence
 * arrived, because flipping it had to be a measured decision rather than a
 * preference. The measurement is `tests/cad-six-parts.test.ts`: the six real
 * parts in `docs/cad-to-cost-learnings.md` with independent manual bottom-up
 * costs, run through both paths. On four of the six the AI's material *class*
 * was wrong — a 13.5 kg front bumper (real 4.5 kg) and an 83 kg fuel tank
 * (real 11.1 kg) among them — and each error carried straight into the money:
 * £41.04 against £4.54, and £252.32 against £11.77. The rules read those two
 * off the measured volume and got them right.
 *
 * So the bar the plan set — "rules land closer to the manual than the AI did"
 * — is met, and the AI path becomes the second opinion it should always have
 * been. `'ai'` and `'both'` remain available and are one select away in the UI.
 */
export function parseAnalysisMode(raw: unknown): AnalysisMode {
  return raw === 'ai' || raw === 'both' ? raw : 'deterministic';
}

/**
 * Answers an engineer has given to blocking decisions, from the request body.
 *
 * Keys are `Decision.id`; values are the chosen `DecisionOption.value`. Anything
 * that is not a plain string is dropped rather than trusted — this map feeds
 * straight into the rules.
 */
/**
 * The engine proposes, the engineer confirms. When the magnitudes look like an
 * inch model saved in millimetres (an 80 mm flange reading 3.15 mm), nothing
 * is scaled silently: a BLOCKING decision asks, and the answer re-measures.
 * Getting this wrong is a 25.4³ ≈ 16 387x error on volume and mass.
 */
export function unitsDecisionFor(geo: OCCTGeometry): Decision | null {
  if (geo.status !== 'success' || !geo.unitCheck) return null;
  const uc = geo.unitCheck;
  const bb = geo.boundingBox;
  const dims = bb ? `${bb.xMm} x ${bb.yMm} x ${bb.zMm} mm` : 'a few millimetres';
  return {
    id: 'units.confirm',
    kind: 'units',
    question: `Is this part really ${dims}, or was it modelled in inches?`,
    why: uc.reason,
    options: [
      { value: 'inch', label: `Inches — scale by ${uc.proposedFactor}`, consequence: 'The model is re-measured at 25.4x; every volume, mass and dimension changes.', leaning: true },
      { value: 'mm', label: 'Millimetres — the part really is this small', consequence: 'Measured values are used as they are.' },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

/** Sanity codes the engineer has explicitly accepted, one by one. */
export function parseAcknowledged(raw: unknown): string[] {
  let v: unknown = raw;
  if (typeof v === 'string') { const str = v; try { v = JSON.parse(str) as unknown; } catch { v = str.split(','); } }
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_]{1,64}$/.test(x)).slice(0, 50);
}

export function parseDecisionAnswers(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.length > 0 && v.length < 200) out[k] = v;
  }
  return out;
}

/** Assemble the rule context from what `buildPrompt` already has in scope. */
export function ruleContextFor(
  commodity: string,
  geo: OCCTGeometry,
  filename: string,
  overrides: Pick<UserOverrides, 'annualVolume' | 'forcedCommodity' | 'forcedMaterial'>,
  answers: Record<string, unknown> = {},
  /**
   * Who answers the blocking questions. On the AI path nobody is at the screen,
   * so the service flags resolve to their stated leanings (recorded in every
   * basis). On the deterministic path an engineer IS present and the question
   * must block — `assumeLeanings` used to be true on both, which the type's own
   * contract forbids.
   */
  mode: 'ai' | 'deterministic' | 'both' = 'ai',
): RuleContext {
  const meshOnly = (geo as { wallThickness?: { method?: string } }).wallThickness?.method === 'stl_heuristic';
  return {
    geo,
    geometryQuality: geo.status !== 'success' ? 'text' : meshOnly ? 'stl' : 'occt',
    commodity,
    // A non-empty forcedCommodity means the engineer picked it off the form,
    // which is the answer to the metal-or-plastic question the specs would
    // otherwise ask.
    commoditySource: overrides.forcedCommodity ? 'engineer' : 'inferred',
    // Nobody is at the screen during an AI /analyze call. Assuming the service
    // flags from their stated leanings, and saying so in every basis, beats
    // blocking every casting and forging line — which would leave the model
    // with no rules at all and nothing recorded about what it invented instead.
    // With an engineer present (deterministic), the question blocks instead.
    assumeLeanings: mode === 'ai',
    annualVolume: overrides.annualVolume,
    filename,
    answers: { ...answersFromContext(overrides.forcedMaterial, filename), ...answers },
  };
}

// ─── JSON schema builder ─────────────────────────────────────────────────────

function buildJSONSchema(commodity: string, geo: OCCTGeometry): string {
  // The process-specific sub-object for the selected commodity
  const processSubObjects: Record<string, string> = {
    casting: `    "casting": {
      "subtype": "hpdc"|"sand"|"gravity"|"investment",
      "dieMouldCostGBP": number,
      "dieMouldLife": number,
      "cavities": number,
      "yieldFraction": number,
      "cycleTimeHpdcSec": number,
      "cycleTimeSandGravHr": number
    },`,
    cast_and_machine: `    "casting": {
      "subtype": "hpdc"|"sand"|"gravity"|"investment",
      "dieMouldCostGBP": number,
      "dieMouldLife": number,
      "cavities": number,
      "yieldFraction": number,
      "cycleTimeHpdcSec": number,
      "cycleTimeSandGravHr": number
    },`,
    forging: `    "forging": {
      "flashKg": number,
      "yieldFraction": number,
      "dieCostGBP": number,
      "dieLife": number,
      "strokes": number,
      "timePerBlowSec": number
    },`,
    gear: `    "gear": {
      "teeth": number,
      "normalModuleMm": number,
      "helixAngleDeg": number,
      "faceWidthMm": number,
      "qualityClass": number,
      "materialClass": "case_hardening_steel"|"through_hardening_steel"|"alloy_steel_prehardened"|"stainless"|"cast_iron"|"bronze"|"plastic",
      "caseHardened": true|false,
      "hardeningRoute": "case_hardening"|"lpc_carburising"|"carbonitriding"|"quench_temper"|"martempering"|"austempering"|"nitriding"|"fnc"|"induction_hardening"|"none"|null,
      "effectiveCaseDepthMm": number|null,
      "qualityClass": number|null,
      "drawingTeeth": number|null
    },
    // STRICT TYPES on these three - a value in the wrong shape is DISCARDED by
    // the rules layer, so a drawing figure returned as prose is a figure lost:
    //   hardeningRoute        EXACTLY one of the tokens above, lower_snake_case,
    //                         and NOTHING else. Not a sentence. Not a case depth.
    //                         "CARBURISE + HARDEN"/"CASE HARDEN" -> "case_hardening";
    //                         "NITRIDE" -> "nitriding"; "INDUCTION HARDEN" ->
    //                         "induction_hardening"; "HARDEN AND TEMPER"/"Q&T" ->
    //                         "quench_temper". null when the drawing is silent.
    //   effectiveCaseDepthMm  a NUMBER of millimetres and nothing else. A banded
    //                         callout takes the MID-BAND: "CASE DEPTH 0.6-0.9 mm"
    //                         -> 0.75. Carburising time scales as the SQUARE of
    //                         this, so it materially changes cost. null if absent.
    //   qualityClass          a NUMBER 1-11. "ISO 1328 CLASS 7" -> 7. Not a string.
    // hardeningRoute: read the heat-treatment callout off the drawing. "CARBURISE
    // + HARDEN"/"CASE HARDEN" -> case_hardening; "HARDEN AND TEMPER"/"Q&T" ->
    // quench_temper; "NITRIDE"/"NITRIDED"/"GAS NITRIDE" -> nitriding;
    // "INDUCTION HARDEN"/"FLANK HARDEN" -> induction_hardening. null when the
    // drawing does not say - do NOT infer it from the material grade.
    // drawingTeeth: the tooth count WRITTEN ON THE ATTACHED DRAWING, verbatim,
    // even when it disagrees with the measured count (that disagreement is
    // exactly what the sanity layer needs to see). null when no drawing.
    // teeth/normalModuleMm/faceWidthMm: restate the MEASURED values from the
    // GEAR METROLOGY block verbatim — they are counted off the B-rep and will
    // overwrite whatever you return. helixAngleDeg/qualityClass/materialClass:
    // read them from the attached drawing if one exists (say which field), else
    // omit them — they are the engineer's UNDECIDED questions, not yours.`,
    sheet_metal: `    "sheetMetal": {
      "thicknessMm": number,
      "blankLengthMm": number,
      "blankWidthMm": number,
      "dieCostGBP": number,
      "dieLife": number,
      "numOps": number
    },`,
    sheet_metal_fab: `    "sheetMetal": {
      "thicknessMm": number,
      "blankLengthMm": number,
      "blankWidthMm": number,
      "dieCostGBP": number,
      "dieLife": number,
      "numOps": number
    },`,
    injection_moulding: `    "injectionMoulding": {
      "cavities": number,
      "projectedAreaCm2": number,
      "wallThicknessMm": number,
      "mouldCostGBP": number,
      "mouldLife": number,
      "runnerWeightKg": number
    },`,
    blow_moulding: `    "blowMoulding": {
      "subtype": "ebm"|"ibm"|"sbm",
      "wallThicknessMm": number,
      "flashWeightKg": number,
      "cavities": number,
      "mouldCostGBP": number,
      "mouldLife": number,
      "blowTimeSec": number,
      "openCloseSec": number,
      "barrierMultilayer": true|false
    },
    // barrierMultilayer: true ONLY for coextruded multi-layer barrier walls —
    // automotive fuel tanks and AdBlue/fuel-system ducts need a hydrocarbon/O2
    // barrier (HDPE / tie / EVOH / tie / HDPE, 6-layer). false for mono-layer
    // bottles, containers, water/coolant drums.`,
    thermoforming: `    "thermoforming": {
      "method": "vacuum"|"pressure"|"twin_sheet",
      "sheetWeightKg": number,
      "partWeightKg": number,
      "toolCostGBP": number,
      "heatTimeSec": number,
      "formTimeSec": number,
      "trimTimeSec": number
    },`,
    rotational_moulding: `    "rotationalMoulding": {
      "numArms": number,
      "partsPerArm": number,
      "heatTimeSec": number,
      "coolTimeSec": number,
      "mouldCostGBP": number,
      "mouldLife": number
    },`,
    rubber: `    "rubber": {
      "process": "compression"|"transfer"|"injection"|"extrusion"|"calendering"|"die_cut",
      "flashWeightKg": number,
      "cavities": number,
      "cycleTimeSec": number,
      "mouldCostGBP": number,
      "mouldLife": number
    },`,
    composites: `    "composites": {
      "process": "hand_layup"|"prepreg_autoclave"|"rtm"|"infusion"|"smc"|"wet_layup",
      "fibreFraction": number,
      "wasteFraction": number,
      "areaCm2": number,
      "plies": number,
      "toolCostGBP": number,
      "toolLife": number,
      "cureTimeSec": number
    },`,
  };

  // Include both the primary commodity sub-object plus the four always-present ones
  // so front-end can switch commodity without losing data
  const primarySub = processSubObjects[commodity] ?? '';
  const alwaysSubs = ['casting', 'forging', 'sheet_metal', 'injection_moulding']
    .filter(c => c !== commodity && c !== 'cast_and_machine')
    .map(c => processSubObjects[c] ?? '')
    .join('\n');

  return `{
  "partName": string,
  "geometry": {
    "boundingBoxMm": {"x": number, "y": number, "z": number},
    "estimatedVolumeCm3": number,
    "estimatedSurfaceAreaCm2": number,
    "estimatedWeightKg": {"aluminum": number, "steel": number, "plastic": number}
  },
  "detectedFeatures": [
    {"type": string, "description": string, "count": number, "significance": "High"|"Medium"|"Low"}
  ],
  "materialAnalysis": {
    "fromMetadata": boolean,
    "primarySuggestion": {"materialId": string, "name": string, "confidencePct": number, "reasoning": string},
    "alternatives": [{"materialId": string, "name": string, "confidencePct": number}]
  },
  "processRecommendations": [
    {"process": string, "commodityType": string, "confidencePct": number, "reasoning": string, "estimatedCycleTimeHr": number}
  ],
  "manufacturabilityScore": number,
  "manufacturabilityRisks": [
    {"severity": "High"|"Medium"|"Low", "feature": string, "description": string, "suggestion": string}
  ],
  "costInputSuggestions": {
    "recommendedCommodity": string,
    "netWeightKg": number,
    "materialId": string,
    "estimatedCycleTimeHr": number,
    "estimatedSetupTimeHr": number,
    "estimatedOperations": [
      {"name": string, "machineId": string, "cycleTimeHr": number, "labourId": "lab-uk-skilled", "oee": 0.85, "manning": 1, "labourEfficiency": 0.92}
    ],
${primarySub}
${alwaysSubs}
    "fieldConfidences": [ {"fieldId": string, "confidence": number} ],
    "dfmIssues": [
      {"severity": "Critical"|"High"|"Medium"|"Low", "area": string, "description": string, "impact": string, "fix": string}
    ],
    "costRange": {"low": number, "mid": number, "high": number, "currency": "GBP"},
    "stage1Selection": ${JSON.stringify(geo.status === 'success' ? { primary: 'auto', conf: 0.0, alt: [] } : null)}
  },
  "aiExplanation": string,
  "confidenceLevel": "${geo.status === 'success' ? 'High' : 'Medium'}",
  "analysisLimitations": [string]
}`;
}

// POST /api/cad/tessellate — mesh a STEP/IGES file to binary STL (no AI, no key).
// The client renders canonical views from the returned STL so the vision model
// can see the part; STL uploads skip this and render directly.
//
// Unauthenticated by design, but each call spawns a Python/OCP process — rate
// limiting keeps an anonymous request loop from exhausting the box (the spawn
// semaphore in geometry-bridge caps concurrency independently).
/** Multipart filenames can carry control chars — keep them out of the logs. */
function safeLogName(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, '_').slice(0, 120);
}

/** Lightweight content sniff so a non-CAD blob renamed .step/.iges can't reach
 *  the Python subprocess (audit RK6 — extension-only validation). STEP must
 *  begin with the ISO-10303-21 magic; IGES is 80-column ASCII text, so reject a
 *  header that is mostly non-printable. Not a full validator — OCCT is the final
 *  judge — just enough to stop obvious garbage before we spawn a process. */
function sniffCadContent(ext: string, buf: Buffer): string | null {
  const head = buf.subarray(0, 4096);
  if (ext === 'step' || ext === 'stp') {
    if (!/ISO-10303-21/i.test(head.toString('latin1'))) {
      return 'File does not look like a STEP file (missing ISO-10303-21 header). Re-export the part as STEP.';
    }
    return null;
  }
  if (ext === 'igs' || ext === 'iges') {
    let printable = 0;
    for (let i = 0; i < head.length; i++) {
      const c = head[i];
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable++;
    }
    if (head.length > 0 && printable / head.length < 0.85) {
      return 'File does not look like an IGES text file. Re-export the part as STEP or IGES.';
    }
    return null;
  }
  return null;
}

/** Strip absolute paths and cap length before returning a downstream error to
 *  the client, so Python stderr / tmp paths aren't disclosed (audit RK6). */
function clientSafeError(msg: string): string {
  // Only collapse real filesystem paths (≥2 segments, e.g. /tmp/cv-ab12.stl) —
  // NOT single tokens like "NaN/Infinity" that happen to contain a slash.
  return msg.replace(/(?:\/[\w.-]+){2,}\/?/g, '<path>').slice(0, 300);
}

/** Express 4 does not catch async handler errors — without this wrapper an
 *  async throw becomes an unhandled rejection and the request hangs forever.
 *  Any uncaught error now returns a structured 500 immediately. */
function asyncRoute<T extends (req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]) => Promise<void>>(fn: T) {
  return (req: Parameters<T>[0], res: Parameters<T>[1]): void => {
    fn(req, res).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CAD] Route error:', err instanceof Error ? err.stack ?? msg : msg);
      if (!res.headersSent) res.status(500).json({ error: `CAD analysis failed: ${msg.slice(0, 300)}` });
    });
  };
}

/** Turn an Anthropic SDK error into a helpful JSON response instead of a crash. */
function respondAIError(res: Parameters<Parameters<typeof router.post>[1]>[1], err: unknown): void {
  const e = err as { status?: number; message?: string };
  const msg = e?.message ?? String(err);
  console.error('[CAD] AI call failed:', msg);
  if (e?.status === 401) {
    res.status(401).json({
      error: 'Anthropic rejected the API key (invalid x-api-key). ' +
             'If you typed a key into the form\'s "Claude API Key" field, clear that field — ' +
             'when it is empty the server\'s .env key is used. Otherwise check ANTHROPIC_API_KEY in .env and restart the server.',
    });
    return;
  }
  if (e?.status === 400 && /credit balance/i.test(msg)) {
    res.status(402).json({ error: 'Anthropic account has insufficient credits — add credits at console.anthropic.com → Billing.' });
    return;
  }
  res.status(502).json({ error: `AI service error: ${msg.slice(0, 300)}` });
}

router.post('/tessellate', tessellateLimiter, upload.single('cadFile'), asyncRoute(async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const ext = req.file.originalname.toLowerCase().split('.').pop() ?? '';
  if (['x_t', 'x_b', 'xmt_txt', 'jt', 'prt', 'sldprt', 'catpart'].includes(ext)) {
    res.status(422).json({
      error: `.${ext} is a proprietary format that needs a licensed kernel (Parasolid/JT/native CAD). ` +
             'Export the part as STEP (.step/.stp) — every major CAD tool supports it — and upload that instead.',
    });
    return;
  }
  if (!['stp', 'step', 'igs', 'iges'].includes(ext)) {
    res.status(400).json({ error: 'tessellate accepts STEP/IGES only (STL is already a mesh)' });
    return;
  }
  const sniff = sniffCadContent(ext, req.file.buffer);
  if (sniff) { res.status(422).json({ error: sniff }); return; }
  const wantMeta = req.query.meta === '1' || req.query.meta === 'bin';
  const result = await tessellateToSTL(req.file.buffer, req.file.originalname, { withMeta: wantMeta });
  if (result.status !== 'success') {
    res.status(422).json({ error: clientSafeError(result.error ?? 'tessellation failed') });
    return;
  }
  console.log(`[CAD] Tessellated ${safeLogName(req.file.originalname)}: ${result.triangles} triangles, ${(result.stl.length / 1024).toFixed(0)} KB STL`);

  // ?meta=bin → single binary frame (interactive viewer):
  //   [u32 headerLen][header JSON][raw STL bytes][triFace as u32 array]
  // No base64 (+33%), no giant JSON string, no atob loop client-side.
  if (req.query.meta === 'bin') {
    const triFace = result.meta?.triFace ?? [];
    const header = Buffer.from(JSON.stringify({
      triangles: result.triangles,
      stlBytes: result.stl.length,
      triFaceCount: triFace.length,
      faces: result.meta?.faces ?? [],
      bodies: result.meta?.bodies ?? null,
      skippedFaces: result.meta?.skippedFaces ?? 0,
    }), 'utf-8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(header.length, 0);
    const triBuf = Buffer.from(Uint32Array.from(triFace).buffer);
    res.set('Content-Type', 'application/octet-stream');
    res.send(Buffer.concat([lenBuf, header, result.stl, triBuf]));
    return;
  }
  // ?meta=1 → JSON with base64 mesh + metadata (backward compatible).
  if (req.query.meta === '1') {
    res.json({
      stlBase64: result.stl.toString('base64'),
      triangles: result.triangles,
      meta: result.meta,
    });
    return;
  }
  res.set('Content-Type', 'application/octet-stream');
  res.set('X-Triangle-Count', String(result.triangles));
  res.send(result.stl);
}));

// POST /api/cad/parse-stl — return raw STL geometry without AI analysis
// Accepts: multipart/form-data with field "cadFile" (must be .stl)
router.post('/parse-stl', requireAuth, parseStlLimiter, upload.single('cadFile'), asyncRoute(async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const { originalname, size, buffer } = req.file;
  const ext = originalname.toLowerCase().split('.').pop() ?? '';
  if (ext !== 'stl') {
    res.status(400).json({ error: 'parse-stl endpoint only accepts .stl files' });
    return;
  }

  try {
    // The parse cap is server-fixed (2 M). It is NOT read from the client: a
    // caller-supplied lower cap would silently truncate the mesh and understate
    // volume/weight/cost (audit RK3). Genuine >2 M-triangle files set geo.truncated.
    const geo = parseSTL(buffer, { maxTriangles: 2_000_000 });

    console.log(
      `[CAD/parse-stl] ${originalname} (${(size / 1024).toFixed(0)} KB) — ` +
      `${geo.triangleCount} triangles  V=${geo.volume.toFixed(3)}cm³  ` +
      `SA=${geo.surfaceArea.toFixed(2)}cm²  wall≈${geo.estimatedWallThicknessMm.toFixed(2)}mm  ` +
      `${geo.format}  ${geo.parseTimeMs}ms`,
    );

    res.json({
      success: true,
      filename: originalname,
      fileSizeKB: size / 1024,
      triangleCount: geo.triangleCount,
      volume: geo.volume,                            // cm³
      surfaceArea: geo.surfaceArea,                  // cm²
      boundingBox: geo.boundingBox,                  // mm
      estimatedWallThicknessMm: geo.estimatedWallThicknessMm,
      // Common material weights for convenience
      estimatedWeightKg: {
        aluminium:  geo.estimatedPartWeightKg(2700),
        steel:      geo.estimatedPartWeightKg(7850),
        castIron:   geo.estimatedPartWeightKg(7150),
        plastic:    geo.estimatedPartWeightKg(1050),
        titanium:   geo.estimatedPartWeightKg(4430),
        copper:     geo.estimatedPartWeightKg(8960),
      },
      format: geo.format,
      truncated: geo.truncated,   // true when the file exceeded the 2 M-triangle cap
      parseTimeMs: geo.parseTimeMs,
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[CAD/parse-stl] Error: ${msg}`);
    res.status(422).json({ error: clientSafeError(msg) });
  }
}));

// POST /api/cad/reanalyze — re-run AI analysis using pre-computed (cached) OCCT geometry; no STEP re-upload needed
router.post('/reanalyze', requireAuth, reanalyzeLimiter, asyncRoute(async (req, res): Promise<void> => {
  const filename = (req.body.filename as string) || 'cached_part.step';
  // The geometry is the server's, looked up by the hash /analyze returned. It
  // used to be read from the body and treated as measured truth — the cache
  // key, the clamp reference, all of it — which meant any caller could cost a
  // part against numbers it made up.
  const geometryHash = typeof req.body?.geometryHash === 'string' ? req.body.geometryHash.trim() : '';
  const earlyAnswers = parseDecisionAnswers(req.body?.decisionAnswers);
  const acknowledged = parseAcknowledged(req.body?.acknowledged);
  const unitScale = earlyAnswers['units.confirm'] === 'inch' ? 25.4 : 1;
  let geo: OCCTGeometry | null = geometryHash ? getGeometry(geometryHash, unitScale) : null;
  if (!geo && geometryHash && unitScale !== 1) {
    // Inch confirmed after the first measurement: re-measure from the kept upload.
    const kept = getUploadFile(geometryHash);
    if (kept) {
      const re = await analyzeGeometry(kept.buffer, `part.${kept.ext}`, 120_000, { CV_UNIT_SCALE: String(unitScale) });
      if (re.status === 'success') { putGeometry(geometryHash, re, unitScale); geo = re; }
    }
  }
  if (!geo) {
    res.status(400).json({
      error: geometryHash
        ? 'No measured geometry on this server for that geometryHash — upload the file again.'
        : 'geometryHash is required (returned by /api/cad/analyze). Client-supplied geometry is not accepted.',
    });
    return;
  }
  if (earlyAnswers['units.confirm'] === 'mm' && geo.unitCheck) geo = { ...geo, unitCheck: null };
  const unitsDecision = unitsDecisionFor(geo);

  const forcedCommodity = typeof req.body?.commodity === 'string' ? req.body.commodity.trim() : '';
  const forcedMaterial  = typeof req.body?.material  === 'string' ? req.body.material.trim()  : '';
  const forcedProcess   = typeof req.body?.process   === 'string' ? req.body.process.trim()   : '';
  const annualVolume    = parseFloat(req.body?.annualVolume) || 100000;
  const ovrWeightKg     = req.body?.weightKg    ? parseFloat(req.body.weightKg)    : null;
  const ovrVolumeCm3    = req.body?.volumeCm3   ? parseFloat(req.body.volumeCm3)   : null;
  const ovrLengthMm     = req.body?.lengthMm    ? parseFloat(req.body.lengthMm)    : null;
  const ovrWidthMm      = req.body?.widthMm     ? parseFloat(req.body.widthMm)     : null;
  const ovrHeightMm     = req.body?.heightMm    ? parseFloat(req.body.heightMm)    : null;
  const ovrDensityGcm3  = req.body?.densityGcm3 ? parseFloat(req.body.densityGcm3) : null;
  const partPhotoBase64 = typeof req.body?.partPhotoBase64 === 'string' ? req.body.partPhotoBase64 : '';
  const partPhotoMime   = (typeof req.body?.partPhotoMime === 'string' ? req.body.partPhotoMime : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const userOverrides = { forcedCommodity, forcedMaterial, forcedProcess, annualVolume, ovrWeightKg, ovrVolumeCm3, ovrLengthMm, ovrWidthMm, ovrHeightMm, ovrDensityGcm3 };
  // This is the route the client posts decision answers back to, so it is the
  // one that most needs to work without a key.
  let analysisMode = parseAnalysisMode(req.body?.mode);
  const modeExplicit = typeof req.body?.mode === 'string' && req.body.mode.trim() !== '';
  const noCache = req.body?.noCache === true || req.body?.noCache === 'true';
  const decisionAnswers = parseDecisionAnswers(req.body?.decisionAnswers);

  let anthropic: ReturnType<typeof createAnthropic> | null = null;
  if (analysisMode !== 'deterministic') {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      res.status(400).json({
        error: 'ANTHROPIC_API_KEY not configured. Set it in .env, pass an x-api-key header, '
          + "or send mode='deterministic' to cost from the measured geometry alone.",
      });
      return;
    }
    anthropic = createAnthropic(apiKey);
  }

  const deepAnalysis = isDeepReq(req);
  const cacheKey = cadCache.buildKey([
    Buffer.from(JSON.stringify(geo)),
    Buffer.from(partPhotoBase64),
    Buffer.from(JSON.stringify({ ...userOverrides, deep: deepAnalysis, mode: analysisMode, answers: decisionAnswers, filename, promptVersion: CAD_PROMPT_VERSION, ruleEngineVersion: RULE_ENGINE_VERSION })),
  ]);
  // `noCache` re-samples the model instead of serving the stored answer. Needed
  // for any A/B or variance measurement: without it a second run of the same
  // part returns the first run's response and the model is never called again.
  // The write still happens below, so the run stays inspectable afterwards.
  const cached = noCache ? null : cadCache.get(cacheKey);
  if (cached) {
    console.log(`[CAD/reanalyze] Cache HIT: ${cacheKey.slice(0, 12)}`);
    res.json(cached);
    return;
  }

  let stage1Selection: Stage1Selection | null = null;
  let selectedCommodity = 'machining';

  if (forcedCommodity) {
    selectedCommodity = forcedCommodity;
    stage1Selection = { primary: forcedCommodity, conf: 1.0, alt: [] };
    console.log(`[CAD/reanalyze] User forced commodity: ${selectedCommodity}`);
  } else {
    try {
      console.log('[CAD/reanalyze] Stage 1: Haiku commodity selection from cached geometry…');
      const s1Msg = await anthropic!.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: 'You are a manufacturing process selector. Given part geometry metrics, select the most likely manufacturing commodity. Return ONLY a JSON object, no prose, no markdown.',
        messages: [{ role: 'user', content: stage1Prompt(geo) }],
      });
      const s1Raw = s1Msg.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
      const parsed = JSON.parse(extractJson(s1Raw)) as Stage1Selection | null;
      if (parsed && typeof parsed.primary === 'string') {
        // Coerce the shape — the model can omit conf/alt, and buildPrompt
        // used to crash on `alt.map` (hung request, unhandled rejection).
        stage1Selection = {
          primary: parsed.primary,
          conf: Number.isFinite(Number(parsed.conf)) ? Number(parsed.conf) : 0.5,
          alt: Array.isArray(parsed.alt) ? parsed.alt : [],
        };
        selectedCommodity = parsed.primary;
        console.log(`[CAD/reanalyze] Stage 1 result: ${selectedCommodity} (conf=${parsed.conf})`);
      }
    } catch (err) {
      console.warn('[CAD/reanalyze] Stage 1 Haiku failed, using default commodity:', (err as Error).message);
    }
    // Deterministic geometry guard — physics overrides a stochastic AI hint.
    // This path was missing it entirely: a part correctly redirected to sheet
    // metal or blow moulding on upload could be silently un-redirected the
    // moment anyone re-ran the analysis.
    const guarded = enforceGeometryCommodity(selectedCommodity, geo);
    if (guarded.corrected) {
      console.warn(`[CAD/reanalyze] ${guarded.reason}`);
      const priorPrimary = selectedCommodity;
      selectedCommodity = guarded.commodity;
      stage1Selection = {
        primary: guarded.commodity,
        conf: 0.9,
        alt: [
          { type: 'rotational_moulding', conf: 0.4 },
          { type: priorPrimary, conf: 0.1 },
        ],
      };
    }
  }

  // Minimal PreprocessedCAD stub — not used when geo.status === 'success'
  const preStub = {
    format: 'STEP' as const,
    partName: filename.replace(/\.[^.]+$/, ''),
    fileSizeKB: 0,
    entityStats: {},
    boundingBoxEstMm: null,
    materialHint: '',
    threadCount: 0,
    totalEntities: 0,
    coordinateRangeMm: null,
    headerInfo: '',
    summary: '',
  };

  // The same rules the prompt was rendered from, run again here so their values
  // can be written over the model's reply. One spec, one context, two consumers.
  const ruleCtx = ruleContextFor(selectedCommodity, geo, filename, userOverrides, decisionAnswers, analysisMode);
  const ruleSpec = specForCommodity(selectedCommodity);
  let ruleOverrides: ReturnType<typeof applyRuleDecisions> | null = null;
  let ruleFields: ReturnType<typeof toRuleFields> | null = null;
  let modeDiff: ReturnType<typeof diffAnalyses> | null = null;
  // The model's own reply, before `applyRuleDecisions` writes over it. Without
  // this in the payload there is no way to see — or cost — what the AI actually
  // said: every mode returns a rules-corrected analysis, so an "AI arm" built
  // from the response would be the rules compared against themselves.
  let aiOriginal: Record<string, unknown> | null = null;
  let aiSuppressed: AISuppression[] = [];
  let deterministicAnalysis: CADAnalysisResult | null = null;

  const systemPrompt = SPECIALIST_SYSTEM_PROMPTS[selectedCommodity] ?? DEFAULT_SYSTEM_PROMPT;
  const userPrompt = buildPrompt(geo, preStub as Parameters<typeof buildPrompt>[1], filename, selectedCommodity, stage1Selection, userOverrides);

  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: userPrompt }];
  if (partPhotoBase64) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: partPhotoMime, data: partPhotoBase64 } });
  }

  let analysis: unknown;

  if (analysisMode === 'deterministic' && !ruleSpec) {
    // As on /analyze: an explicit deterministic request is told what does not
    // exist; a defaulted one falls back rather than breaking a commodity that
    // re-analysed fine before the default moved.
    const fallbackKey = modeExplicit ? '' : resolveApiKey(req);
    if (!fallbackKey) {
      res.status(422).json({
        error: `No deterministic rules exist for '${selectedCommodity}' yet. `
          + `Converted so far: ${DETERMINISTIC_COMMODITIES.join(', ')}.`
          + (modeExplicit ? '' : ' An API key would have let this fall back to the AI path.'),
      });
      return;
    }
    anthropic = createAnthropic(fallbackKey);
    analysisMode = 'ai';
    console.log(`[CAD] No rule spec for '${selectedCommodity}' — falling back to the AI path`);
  }

  if (analysisMode === 'deterministic') {
    // The route the client posts decision answers to. Re-running the rules with
    // them is the whole round-trip: no re-upload, no model, no key.
    const det = buildDeterministicAnalysis(ruleSpec!, ruleCtx, geo.partName || filename);
    const detWarnings = runAllGuards(det.analysis, geo, geo.volume?.cm3 ?? null, statedFromAnswers(decisionAnswers));
    const detDecisions = [...(unitsDecision ? [unitsDecision] : []), ...det.result.decisions];
    const detPayload = {
      success: true,
      analysis: det.analysis,
      sanityWarnings: detWarnings,
      costable: isCostable(detDecisions, detWarnings, acknowledged),
      ruleOverrides: det.applied,
      ruleFields: det.ruleFields,
      decisions: detDecisions,
      geometryHash,
      mode: analysisMode,
      fromCache: false,
      geometrySource: 'occt' as const,
      annualVolume,
      occtGeometry: geo,
      preprocessed: null,
    };
    cadCache.set(cacheKey, detPayload);
    res.json(detPayload);
    return;
  }

  // Express 4 does NOT catch async throws — an uncaught rejection here killed
  // the whole Node process (empty response to the client, dead server after).
  try {
    // Prompt-guided JSON (the prompt ends with the exact schema via
    // buildJSONSchema, tailored to the selected commodity). We do NOT use
    // structured outputs here: the full CAD schema has 86 optional params and
    // the API caps structured-output optionals at 24. extractJson + a one-shot
    // repair retry gives us robust parsing without that limit.
    analysis = await cadAnalyzeJSON(anthropic!, deepAnalysis, systemPrompt, userContent);
    normalizeFieldConfidences(analysis);
    normalizeCADAnalysis(analysis as Record<string, unknown>, geo?.weights, selectedCommodity);
    // Everything the rules could decide is now written over whatever the model
    // returned. Telling it "use verbatim" was a request; this is the guarantee.
    if (ruleSpec) {
      // Re-run with the model's own material answer folded in. The prompt left
      // that line UNDECIDED precisely so the model would supply the one thing
      // geometry cannot; now that it has, the engine does the arithmetic
      // downstream of it rather than trusting the model's.
      // Snapshot before the overwrite — `applyRuleDecisions` mutates in place,
      // so a diff taken afterwards would be the rules against themselves.
      aiOriginal = analysisMode === 'both'
        ? structuredClone((analysis as { costInputSuggestions?: Record<string, unknown> }).costInputSuggestions ?? {})
        : null;
      const resolved = runCostInputRules(
        ruleSpec, withAIAnswers(ruleCtx, analysis as Record<string, unknown>));
      ruleOverrides = applyRuleDecisions(
        analysis as Parameters<typeof applyRuleDecisions>[0], resolved);
      // A rule that is ASKING must not let the model answer silently: fields
      // owned by blocked rules are cleared and the clearing is on the record.
      // (Audit gap 2: the model's stock mouldCostGBP=200000 costed the bumper's
      // tooling because the resin question was open and nothing said so.)
      aiSuppressed = suppressAIForUndecided(
        analysis as Parameters<typeof suppressAIForUndecided>[0], resolved, ruleSpec);
      if (aiSuppressed.length) {
        console.log(`[CAD] Suppressed ${aiSuppressed.length} AI value(s) pending decisions: `
          + aiSuppressed.map(x => `${x.field}=${String(x.aiValue)}`).join(', '));
      }
      ruleFields = toRuleFields(resolved);
      const contradicted = ruleOverrides.overridden.filter(o => o.contradicted);
      if (contradicted.length) {
        console.log(`[CAD] Rules overrode ${contradicted.length} field(s) the model disagreed with: `
          + contradicted.map(o => `${o.field} ${String(o.from)}\u2192${String(o.to)}`).join(', '));
      }
      if (analysisMode === 'both') {
        // The audit run: build the deterministic answer independently and diff
        // it against the model's ORIGINAL reply, before the rules overwrote it.
        // Diffing after the overwrite would compare the rules with themselves.
        const det = buildDeterministicAnalysis(ruleSpec, ruleCtx, geo.partName || 'part');
        modeDiff = diffAnalyses(
          det.analysis.costInputSuggestions as unknown as Record<string, unknown>,
          aiOriginal ?? {},
          resolved);
        deterministicAnalysis = det.analysis;
      }
    }
  } catch (err) {
    respondAIError(res, err);
    return;
  }

  const sanityWarnings = runAllGuards(analysis, geo, geo.volume?.cm3 ?? null, aiOriginal ?? statedFromAnswers(decisionAnswers));
  const reDecisions = [...(unitsDecision ? [unitsDecision] : []), ...pendingDecisions(ruleSpec, ruleCtx, withAIAnswers(ruleCtx, analysis as Record<string, unknown>), ruleOverrides?.undecided.length ?? 0)];
  const payload = {
    success: true,
    analysis,
    sanityWarnings,
    // What the deterministic rules decided, what the model had said, and what
    // nobody could decide. The report renders this as the provenance trail.
    ruleOverrides,
    // AI values cleared because their owning rule is still asking a question —
    // the consumer must treat these fields as UNANSWERED, not zero.
    aiSuppressed,
    // Every rule value keyed by form field id. The form is the consumer, so this
    // addresses the form directly rather than going through the model's response
    // schema, which has nowhere to put 54 of the 131 values the rules compute.
    ruleFields,
    // mode='both': the deterministic answer alongside the model's, and the diff.
    // Not a merge — a comparison, which is what makes flipping the default a
    // measured decision rather than a preference.
    deterministicAnalysis,
    diff: modeDiff,
    aiOriginal,
    // The AI path has open decisions too — it just answers them itself. Saying
    // which ones it answered is worth more than hiding that it did.
    decisions: reDecisions,
    costable: isCostable(reDecisions, sanityWarnings, acknowledged),
    geometryHash,
    mode: analysisMode,
    fromCache: false,
    geometrySource: 'occt' as const,
    annualVolume,
    occtGeometry: geo,
    preprocessed: { format: 'STEP', partName: filename },
  };
  cadCache.set(cacheKey, { ...payload, fromCache: true });
  res.json(payload);
}));

// Multer upload errors (e.g. LIMIT_FILE_SIZE at the 50 MB cap) reach the router
// as errors — turn them into a clean JSON 413/400 instead of a generic 500
// (audit RK6). Router-scoped so it only catches this router's uploads.
router.use((err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? `File is too large — the upload limit is ${MAX_UPLOAD_MB} MB. Simplify or compress the model and try again.` : `Upload error: ${err.message}`,
    });
    return;
  }
  next(err);
});

export default router;
