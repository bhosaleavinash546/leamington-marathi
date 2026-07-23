import { Router } from 'express';
import { resolveApiKey } from '../utils/api-key.js';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createAnthropic } from '../utils/ai-client.js';
import { preprocessCADFile } from '../utils/preprocessor.js';
import { analyzeGeometry, tessellateToSTL } from '../utils/geometry-bridge.js';
import type { OCCTGeometry } from '../utils/geometry-bridge.js';
import { parseSTL } from '../services/stl-parser.js';
import type { STLGeometry } from '../services/stl-parser.js';
import { createAnalysisCache } from '../utils/analysis-cache.js';
import { runCADSanityChecks } from '../utils/cad-sanity.js';
import { capNearNetMachiningHr, applyNearNetMachiningCap } from '../utils/cad-machining-guard.js';
import { normalizeFieldConfidences } from '../utils/cad-schema.js';
import { familyFromFilename, proseFamily, promoteHighestConfidence, type MaterialSuggestion } from '../../src/engine/material-family.js';
import { correctShellWallMm } from '../../src/engine/geometry-sanity.js';

const router = Router();

// Persistent repeatability cache: same CAD file + photo + overrides -> the
// byte-identical analysis, across restarts (same guarantee as the PCB pipeline).
const cadCache = createAnalysisCache('cad_analysis_cache');
// Bump when the prompt/normalisation logic changes so stale cached analyses (which
// are keyed on inputs, not prompt content) are invalidated. v2: filename material
// prior + confidence-inversion promotion.
const CAD_PROMPT_VERSION = 6;

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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

// Per-IP rate limits for the anonymous CAD endpoints (audit RK3). Defined here,
// before the routes that use them, so there is no temporal-dead-zone at load.
// /analyze spawns Python AND calls the paid AI (tightest budget); tessellate
// spawns Python only; /parse-stl is pure-TS.
const tessellateLimiter = rateLimit({ windowMs: 10 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const analyzeLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, standardHeaders: true, legacyHeaders: false });
const parseStlLimiter = rateLimit({ windowMs: 10 * 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

// ─── Specialist system prompts per commodity ─────────────────────────────────

const SPECIALIST_SYSTEM_PROMPTS: Record<string, string> = {
  machining: `You are a senior CNC process engineer with 20+ years experience in precision machining should-cost. You specialise in cycle-time estimation from geometry (feature-based MBD), fixturing, cutting parameter selection, and make-vs-buy analysis. Estimate material removal rates, tool changes, and setup count from B-rep topology. Return ONLY valid JSON.`,

  casting: `You are an expert foundry engineer specialising in HPDC, gravity die, sand casting, and investment casting. You can derive gating/risering requirements, solidification time, yield losses, and tooling costs from part geometry. You understand the trade-offs between processes by alloy, weight class, and annual volume. Return ONLY valid JSON.`,

  cast_and_machine: `You are a near-net-shape manufacturing specialist combining foundry and CNC expertise. You assess which features must be cast-to-print vs machined, determine as-cast tolerances, and plan the minimum machining operations after casting. You understand how to optimise the cast/machine split to minimise total cost. Return ONLY valid JSON.`,

  forging: `You are a closed-die forging engineer with deep expertise in billet sizing, flash allowance, stroke sequencing (blocker/finisher), trimming, heat treatment, and die cost estimation. You assess part geometry for forgeability: grain flow, parting line position, undercuts, and taper. Return ONLY valid JSON.`,

  sheet_metal: `You are a progressive die tooling engineer with expertise in stamping, blanking, drawing, and forming. You estimate blank layout and material utilisation, press tonnage, and die cost from part envelope. You understand material springback, bend radii, and formability limits. Return ONLY valid JSON.`,

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
  const thinWallHint = (wallMean != null && wallMean > 0 && wallMean <= 6 && maxDim >= 400 && fill < 0.10)
    ? `\nSTRONG SIGNAL: thin wall (${wallMean.toFixed(1)}mm) on a large part (${maxDim.toFixed(0)}mm, fill ${fill.toFixed(3)}). A large thin-wall metal casting/forging is NOT manufacturable (it misruns), so do NOT pick casting/forging. `
      + `${hollow ? 'The very low fill ratio means a HOLLOW/enclosed part → blow_moulding (fuel tank, duct, bottle, reservoir) if it encloses a cavity, else injection_moulding or sheet_metal. ' : 'This is injection_moulding (plastic) or sheet_metal. '}`
      + `Use the PLASTIC mass, not the metal-density figure.`
    : '';

  return `Part geometry snapshot:
Bounding box: ${bb.xMm.toFixed(0)}×${bb.yMm.toFixed(0)}×${bb.zMm.toFixed(0)}mm
Volume: ${vol.cm3.toFixed(1)} cm³  Fill ratio: ${fill.toFixed(2)}  Faces: ${faces}  Free-form: ${freeForms}  Holes: ${holes}
Wall mean: ${wallMean?.toFixed(1) ?? 'N/A'} mm
Weights — Al: ${weights.aluminiumKg.toFixed(3)} kg  Steel: ${weights.steelKg.toFixed(3)} kg  Plastic: ${weights.plasticKg.toFixed(3)} kg${thinWallHint}

Valid commodity types: machining, sheet_metal, sheet_metal_fab, injection_moulding, casting, forging, cast_and_machine, blow_moulding, thermoforming, rotational_moulding, rubber, composites, wiring_harness, extrusion, pcb_fab, pcba, biw_assembly, painting, assembly

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
  // Fully-enclosed hollow shell: fill ratio this low means the solid is a thin
  // skin around a sealed cavity. Physically un-castable / un-forgeable / not
  // machined-from-billet. Gate on size so tiny sparse brackets are untouched,
  // and (when known) on a thin wall so a genuinely chunky sparse lattice is safe.
  const enclosedHollowShell =
    fill < 0.03 && maxDim >= 250 && (wall == null || wall <= 10);
  if (enclosedHollowShell && SOLID_PROCESS_COMMODITIES.has(commodity)) {
    return {
      commodity: 'blow_moulding',
      corrected: true,
      reason:
        `Geometry override: fill ratio ${fill.toFixed(3)}` +
        (wall != null ? `, ${wall.toFixed(1)} mm uniform wall` : '') +
        `, ${maxDim.toFixed(0)} mm envelope — a large enclosed hollow shell cannot be ` +
        `manufactured as "${commodity}" (no core extraction). Reclassified as blow_moulding ` +
        `(hollow moulded tank/duct/bottle; alternatives: rotational_moulding for very large ` +
        `tanks, or sheet_metal_fab for a welded metal tank).`,
    };
  }
  return { commodity, corrected: false };
}

// POST /api/cad/analyze
router.post('/analyze', analyzeLimiter, upload.fields([
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
  if (!['stp', 'step', 'igs', 'iges', 'stl'].includes(ext)) {
    res.status(400).json({ error: 'Unsupported format. Use STEP (.stp/.step), IGES (.igs/.iges), or STL (.stl)' });
    return;
  }

  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Set it in .env or pass as x-api-key header.' });
    return;
  }

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
        features: {
          cylindricalFaceCount: 0,
          cylindricalFaceRadiiMm: [],
          estimatedHoleCount: 0,
          holeRadiiMm: [],
          bossShaftRadiiMm: [],
          threadFeaturesDetected: false,
          planarFaceCount: 0,
          freeFormFaceCount: 0,
        },
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
    geo = await analyzeGeometry(buffer, originalname, 120_000);

    if (geo.status === 'success') {
      geometrySource = 'occt';
      // Correct the ray-cast wall on thin shells (a bumper read 27 mm vs ~2.5 mm),
      // so the moulding cooling time and the process classifier see the real wall.
      if (geo.wallThickness && geo.volume && geo.surfaceArea) {
        const wc = correctShellWallMm(geo.wallThickness.meanMm, geo.volume.cm3, geo.surfaceArea.cm2, geo.fillRatio ?? 1);
        if (wc.corrected) {
          console.log(`[CAD] Wall corrected (thin shell): ${geo.wallThickness.meanMm}mm → ${wc.meanMm}mm (2·V/S)`);
          geo.wallThickness.meanMm = wc.meanMm;
          geo.wallThickness.minMm = Math.min(geo.wallThickness.minMm ?? wc.meanMm, wc.meanMm);
          geo.wallThickness.maxMm = wc.meanMm * 1.4;
          (geo.wallThickness as { method?: string }).method = wc.method;
        }
      }
      console.log(`[CAD] OCCT success — V=${geo.volume!.cm3.toFixed(1)}cm³  SA=${geo.surfaceArea!.cm2.toFixed(0)}cm²  faces=${geo.faces!.total}`);
    } else {
      console.warn(`[CAD] OCCT failed (${geo.error}) — falling back to text preprocessor`);
      geometrySource = 'text_parsing';
      geo = { status: 'error', error: geo.error };
    }
  }

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

  const anthropic = createAnthropic(apiKey);

  // --- Phase 3: Stage 1 — Fast commodity pre-selection (Haiku) OR user override ---
  let stage1Selection: { primary: string; conf: number; alt: Array<{ type: string; conf: number }> } | null = null;
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
    Buffer.from(JSON.stringify({ ...userOverrides, deep: deepAnalysis, promptVersion: CAD_PROMPT_VERSION })),
  ]);
  const cached = cadCache.get(cacheKey);
  if (cached) {
    console.log(`[CAD] Cache HIT: ${cacheKey.slice(0, 12)}`);
    res.json(cached);
    return;
  }

  if (forcedCommodity) {
    selectedCommodity = forcedCommodity;
    stage1Selection = { primary: forcedCommodity, conf: 1.0, alt: [] };
    console.log(`[CAD] User forced commodity: ${selectedCommodity}`);
  } else {
    try {
      console.log('[CAD] Stage 1: Haiku commodity selection…');
      const s1Msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: 'You are a manufacturing process selector. Given part geometry metrics, select the most likely manufacturing commodity. Return ONLY a JSON object, no prose, no markdown.',
        messages: [{ role: 'user', content: stage1Prompt(geo) }],
      });
      const s1Raw = s1Msg.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
      const parsed = JSON.parse(extractJson(s1Raw)) as typeof stage1Selection;
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
    // Deterministic geometry guard — physics overrides a stochastic AI hint.
    const guarded = enforceGeometryCommodity(selectedCommodity, geo);
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
      { type: 'text', text: 'An engineering drawing PDF is attached. Extract tolerances, GD&T callouts, surface finishes, thread specifications and material/heat-treat notes from it, and factor them into the process recommendations, DFM issues and cycle-time estimates (tight tolerances and fine finishes add operations such as grinding, honing or CMM inspection).' },
    );
    console.log(`[CAD] Engineering drawing attached: ${drawingUpload.originalname} (${(drawingUpload.size / 1024).toFixed(0)} KB)`);
  }

  let analysis: unknown;
  // Express 4 does NOT catch async throws — an uncaught rejection here killed
  // the whole Node process (empty response to the client, dead server after).
  try {
    // Prompt-guided JSON (the prompt ends with the exact schema via
    // buildJSONSchema, tailored to the selected commodity). We do NOT use
    // structured outputs here: the full CAD schema has 86 optional params and
    // the API caps structured-output optionals at 24. extractJson + a one-shot
    // repair retry gives us robust parsing without that limit.
    analysis = await cadAnalyzeJSON(anthropic, deepAnalysis, systemPrompt, userContent);
    normalizeFieldConfidences(analysis);
    normalizeCADAnalysis(analysis as Record<string, unknown>);
  } catch (err) {
    respondAIError(res, err);
    return;
  }

  // OCCT emits volume as {mm3, cm3} — there is no top-level volumeCm3, so read
  // volume.cm3 or the ground-truth volume check never fires on the STEP/IGES path.
  const measuredVol = stlGeometry?.volume ?? (geo.status === 'success' ? (geo.volume?.cm3 ?? null) : null);
  // Cap near-net (cast/forged) machining time before it drives the cost, then run sanity.
  const machiningWarnings = applyNearNetMachiningCap(analysis as Parameters<typeof applyNearNetMachiningCap>[0]);
  const sanityWarnings = [...machiningWarnings, ...runCADSanityChecks(analysis as Parameters<typeof runCADSanityChecks>[0], measuredVol)];
  if (sanityWarnings.length) console.log(`[CAD] Sanity: ${sanityWarnings.length} warning(s): ${sanityWarnings.map(x => x.code).join(', ')}`);

  const payload = {
    success: true,
    analysis,
    sanityWarnings,
    fromCache: false,
    geometrySource,
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
  cadCache.set(cacheKey, { ...payload, fromCache: true });
  res.json(payload);
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
  // Extract from first { to last } to discard any surrounding prose
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s;
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
function normalizeCADAnalysis(a: Record<string, unknown>): void {
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
  g.estimatedWeightKg = { aluminum: num(w.aluminum, 0), steel: num(w.steel, 0), plastic: num(w.plastic, 0) };
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
    const plasticCommodity = /blow_mould|injection_mould|rotational_mould|thermoform/.test(String(ci.recommendedCommodity));
    const famWeight =
      plasticCommodity ? wts.plastic
      : /iron|steel|stainless|en8|4140|1045|s355/.test(matHint) ? wts.steel
      : /plastic|polymer|nylon|pa6|pp\b|abs|pom|peek|resin|hdpe|ldpe|polyeth|pe\b|pvc|petg|pet\b|tpe|tpo|acrylic|pmma|delrin/.test(matHint) ? wts.plastic
      : wts.aluminum;
    ci.netWeightKg = num(ci.netWeightKg, famWeight || wts.aluminum || 0);
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

function buildPrompt(
  geo: OCCTGeometry,
  pre: ReturnType<typeof preprocessCADFile>,
  filename: string,
  selectedCommodity: string,
  stage1: { primary: string; conf: number; alt: Array<{ type: string; conf: number }> } | null,
  overrides: UserOverrides = { forcedCommodity: '', forcedMaterial: '', forcedProcess: '', annualVolume: 100000, ovrWeightKg: null, ovrVolumeCm3: null, ovrLengthMm: null, ovrWidthMm: null, ovrHeightMm: null, ovrDensityGcm3: null },
): string {
  const validMaterials = 'mat-al6061, mat-al5052, mat-dc01, mat-hss, mat-stainless-316, mat-brass-crz, mat-pp, mat-hdpe, mat-pa6, mat-pc, mat-lm25, mat-gjl350, mat-az91d, mat-ss304c, mat-bronze-c905';
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

Weight at density:
  Aluminium 2.70 g/cm³: ${w.aluminiumKg.toFixed(3)} kg
  Steel 7.85 g/cm³: ${w.steelKg.toFixed(3)} kg
  Cast iron 7.15 g/cm³: ${w.castIronKg.toFixed(3)} kg
  Plastic 1.05 g/cm³: ${w.plasticKg.toFixed(3)} kg
  Copper 8.96 g/cm³: ${w.copperKg.toFixed(3)} kg
  Titanium 4.43 g/cm³: ${w.titaniumKg.toFixed(3)} kg

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

  const bb = geo.status === 'success' ? geo.boundingBox! : null;
  const bbDimsSorted = bb ? [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a) : null;
  const wallMean = geo.wallThickness?.meanMm ?? null;
  const wallMin  = geo.wallThickness?.minMm ?? null;

  const ps  = geo.processSpecificEstimates;
  const tc  = geo.toolingCostEstimates;
  const mfgScore = geo.manufacturabilityScore ?? null;

  // Stage 1 selection context for the specialist
  const stage1Context = stage1
    ? `\n=== STAGE 1 PRE-SELECTION (Haiku fast classifier) ===\nPrimary: ${stage1.primary} (conf=${stage1.conf})\nAlternatives: ${(stage1.alt ?? []).map(a => `${a.type}(${a.conf})`).join(', ')}\nYou are the specialist for: ${selectedCommodity} — focus your analysis accordingly.\n`
    : '';

  // Commodity-specific cost input rules
  const commodityRules = buildCommodityRules(selectedCommodity, geo, tc, ps, wallMean, wallMin, bbDimsSorted, bb, cncHrs, setupCount, undercutCount, mfgScore);

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

function buildCommodityRules(
  commodity: string,
  geo: OCCTGeometry,
  tc: OCCTGeometry['toolingCostEstimates'],
  ps: OCCTGeometry['processSpecificEstimates'],
  wallMean: number | null,
  wallMin: number | null,
  bbDimsSorted: number[] | null,
  bb: { xMm: number; yMm: number; zMm: number } | null,
  cncHrs: number | null,
  setupCount: number | null,
  undercutCount: number,
  mfgScore: number | null,
): string {
  switch (commodity) {
    case 'machining':
      return `MACHINING COST INPUT RULES:
  estimatedCycleTimeHr: ${cncHrs !== null ? cncHrs.toFixed(3) : 'sum of all operation cycle times'}
  estimatedSetupTimeHr: ${setupCount !== null ? ((setupCount * 45) / 60).toFixed(3) : '0.75 per setup, estimate from geometry complexity'}
  Operations: list each distinct setup as a separate operation (roughing, semi-finish, finish, drilling, threading)
  machineId: choose from mach-vmc3 (3-axis), mach-vmc5 (5-axis), mach-lathe-cnc, mach-drill, mach-grind, mach-haas-vf2`;

    case 'casting':
    case 'cast_and_machine': {
      const hpdcCt = wallMean ? Math.round(45 + wallMean * 3) : 75;
      return `CASTING COST INPUT RULES:
  subtype: "hpdc" if Al/Mg and mean_wall<6mm; "sand" if Fe/iron or >8kg or complex cores; "gravity" if Al/Zn 0.5–5kg moderate; "investment" if precision <0.5kg or >40% free-form faces
  HPDC: cycleTimeHpdcSec=${hpdcCt} (45+3×wall), cavities=1 if >1kg else 2
        dieMouldCostGBP=${tc ? tc.hpdcDieCostGBP.toFixed(0) : '<1kg→60000/1-3kg→110000/>3kg→180000'} (OCCT parametric — use verbatim), dieMouldLife=150000, yieldFraction=0.65
  Sand: cycleTimeSandGravHr=${ps ? ps.sandCycleTimeHr.toFixed(3) : '0.5'} (OCCT — use verbatim)
        dieMouldCostGBP=${tc ? tc.sandPatternCostGBP.toFixed(0) : '6000'} (OCCT — use verbatim), dieMouldLife=8000, yieldFraction=0.78
  Gravity: cycleTimeSandGravHr=0.08, dieMouldCostGBP=${tc ? tc.gravityMouldCostGBP.toFixed(0) : '22000'} (OCCT — use verbatim), dieMouldLife=50000, yieldFraction=0.85
  Investment: cycleTimeSandGravHr=0.40, dieMouldCostGBP=12000, dieMouldLife=5000, yieldFraction=0.90
              (wax≈${ps ? ps.investWaxCostGBP.toFixed(2) : '?'}GBP, shell≈${ps ? ps.investShellCostGBP.toFixed(2) : '?'}GBP per part)
${commodity === 'cast_and_machine' ? `  MACHINING SECTION: estimatedCycleTimeHr=${cncHrs !== null ? cncHrs.toFixed(3) : '0.25–2.0 depending on machined features'}` : ''}`;
    }

    case 'forging':
      return `FORGING COST INPUT RULES:
  flashKg=netWeightKg×0.10, yieldFraction=0.90
  strokes=${ps ? ps.forgeStrokes : '3–5 for simple prismatic, 6–9 for complex'} (OCCT-derived — use verbatim if number given); timePerBlowSec=10
  dieCostGBP=${tc ? tc.forgeDieCostGBP.toFixed(0) : 'simple→25000/medium→55000/complex→120000'} (OCCT — use verbatim), dieLife=20000`;

    case 'sheet_metal':
    case 'sheet_metal_fab':
      return `SHEET METAL COST INPUT RULES:
  thicknessMm=${wallMin ? wallMin.toFixed(1) : '1.5'} (use OCCT min wall thickness)
  blankLengthMm=${bbDimsSorted ? (bbDimsSorted[0] * 1.05).toFixed(0) : '?'} (largest bbox × 1.05)
  blankWidthMm=${bbDimsSorted ? (bbDimsSorted[1] * 1.05).toFixed(0) : '?'} (second-largest × 1.05)
  dieCostGBP=${tc ? tc.progressiveDieCostGBP.toFixed(0) : 'progressive→80000/single→15000/laser+brake→3000'} (OCCT — use verbatim)
  dieLife: progressive→1000000; single-stage→300000; laser+brake→999999
  numOps: 2 for simple bracket, 3–5 for formed, 6–8 for complex progressive`;

    case 'injection_moulding':
      return `INJECTION MOULDING COST INPUT RULES:
  wallThicknessMm=${wallMean ? wallMean.toFixed(1) : '2.5'} (use OCCT mean wall)
  projectedAreaCm2=${bb ? ((bb.xMm * bb.yMm) / 100).toFixed(1) : '?'} (bbox X×Y÷100)
  cavities: >50g→1; 10–50g→2; <10g→4–8
  mouldCostGBP=${tc ? tc.imMouldCostGBP.toFixed(0) : '1-cav small→20000/medium→50000/large→100000'} (OCCT — use verbatim)
  mouldLife=1000000, runnerWeightKg=netWeightKg×0.15 (cold runner) or 0 (hot runner)`;

    case 'blow_moulding':
      return `BLOW MOULDING COST INPUT RULES:
  material: fuel tanks, jerricans, drums, large industrial tanks/ducts → HDPE / HMW-HDPE (mat-hdpe); household & detergent bottles → HDPE; PET/PP bottles → PET or PP. Do NOT default a hollow tank to PP when HDPE is the correct resin.
  subtype: "ebm" for hollow extrusions (cans, tanks, ducts, jerricans); "ibm" for small precision bottles (<250ml); "sbm" for PET/PP bottles (>250ml stretch)
  wallThicknessMm=${wallMean ? wallMean.toFixed(1) : '2.0'} (OCCT mean wall — use verbatim)
  flashWeightKg = partWeightKg × 0.12 (pinch-off + neck trim typical 10–15%)
  cavities: <250ml→2–4; 250ml–2L→1–2; >2L→1
  mouldCostGBP: single-cav EBM blow mould Al → 8000–25000; IBM → 15000–40000; SBM → 20000–60000
  mouldLife: Al EBM → 500000 cycles; steel IBM → 2000000
  blowTimeSec: 3–8s for bottles; 8–20s for large industrial parts
  openCloseSec: 4–8s typical`;

    case 'thermoforming':
      return `THERMOFORMING COST INPUT RULES:
  method: "vacuum" for simple trays/covers; "pressure" for higher detail; "twin_sheet" for hollow double-wall parts
  sheetWeightKg = partWeightKg / (1 - wasteFraction); wasteFraction = 0.25–0.45 depending on draw ratio
  partWeightKg = netWeightKg (OCCT plastic weight: ${geo.weights?.plasticKg.toFixed(3) ?? '?'} kg)
  toolCostGBP: simple Al vacuum tool → 3000–8000; pressure form with detail → 8000–25000; twin-sheet → 15000–40000
  heatTimeSec: 30–90s (depends on gauge and material)
  formTimeSec: 5–20s vacuum; 10–30s pressure
  trimTimeSec: 10–30s per part`;

    case 'rotational_moulding':
      return `ROTATIONAL MOULDING COST INPUT RULES:
  numArms: 3–4 (standard carousel); 2 (large/complex)
  partsPerArm: 1 for large parts (>5L); 2–4 for medium; up to 8 for small
  heatTimeSec: 900–2400s (15–40 min oven time; scales with wall thickness and part volume)
  coolTimeSec: 600–1800s (10–30 min; forced air or water mist)
  mouldCostGBP: simple Al mould → 8000–20000; complex with inserts → 20000–60000
  mouldLife: Al → 3000–10000 cycles; steel → 20000+ cycles`;

    case 'rubber':
      return `RUBBER MOULDING COST INPUT RULES:
  process: "compression" for solid mounts/gaskets; "transfer" for complex cross-sections with inserts; "injection" for high volume precision; "extrusion" for profiles/seals; "die_cut" for flat gaskets
  flashWeightKg = partWeightKg × 0.08 (compression) or 0.03 (transfer/injection)
  cavities: compression → 1–4; transfer/injection → 2–12; die_cut → 6+
  cycleTimeSec: compression 120–600s; transfer 90–300s; injection 45–120s
  mouldCostGBP: compression simple → 2500–8000; transfer → 5000–20000; injection → 10000–40000
  mouldLife: rubber moulds → 200000–1000000 cycles`;

    case 'composites':
      return `COMPOSITES COST INPUT RULES:
  process: "hand_layup" for simple large parts; "prepreg_autoclave" for aerospace CFRP; "rtm" for medium complexity closed-mould; "infusion" for large marine/wind; "smc" for automotive high-volume; "wet_layup" for GFRP marine
  fibreFraction: 0.30–0.45 (hand layup); 0.55–0.65 (prepreg); 0.45–0.60 (RTM/infusion)
  wasteFraction: 0.15–0.30 (hand layup); 0.05–0.15 (prepreg cut/ply)
  areaCm2=${geo.surfaceArea?.cm2.toFixed(0) ?? '?'} (OCCT surface area — use verbatim)
  plies: estimate from structural requirement (typical CFRP 4–16 plies; GFRP 3–8 plies)
  toolCostGBP: GFRP/infusion → 5000–20000; CFRP prepreg → 15000–60000; RTM matched die → 30000–120000
  cureTimeSec: autoclave 7200–14400s (2–4hr); RTM 1800–5400s; infusion 3600–7200s`;

    default:
      return `COST INPUT RULES:
  Populate the sub-object matching the recommended commodity in costInputSuggestions.
  Use OCCT geometry measurements where available.`;
  }
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
router.post('/parse-stl', parseStlLimiter, upload.single('cadFile'), asyncRoute(async (req, res): Promise<void> => {
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
router.post('/reanalyze', asyncRoute(async (req, res): Promise<void> => {
  const geo = req.body.occtGeometry as OCCTGeometry;
  const filename = (req.body.filename as string) || 'cached_part.step';

  if (!geo || typeof geo !== 'object') {
    res.status(400).json({ error: 'occtGeometry is required in the JSON body' });
    return;
  }

  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Set it in .env or pass as x-api-key header.' });
    return;
  }

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
  const anthropic = createAnthropic(apiKey);

  const deepAnalysis = isDeepReq(req);
  const cacheKey = cadCache.buildKey([
    Buffer.from(JSON.stringify(geo)),
    Buffer.from(partPhotoBase64),
    Buffer.from(JSON.stringify({ ...userOverrides, deep: deepAnalysis, filename, promptVersion: CAD_PROMPT_VERSION })),
  ]);
  const cached = cadCache.get(cacheKey);
  if (cached) {
    console.log(`[CAD/reanalyze] Cache HIT: ${cacheKey.slice(0, 12)}`);
    res.json(cached);
    return;
  }

  let stage1Selection: { primary: string; conf: number; alt: Array<{ type: string; conf: number }> } | null = null;
  let selectedCommodity = 'machining';

  if (forcedCommodity) {
    selectedCommodity = forcedCommodity;
    stage1Selection = { primary: forcedCommodity, conf: 1.0, alt: [] };
    console.log(`[CAD/reanalyze] User forced commodity: ${selectedCommodity}`);
  } else {
    try {
      console.log('[CAD/reanalyze] Stage 1: Haiku commodity selection from cached geometry…');
      const s1Msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: 'You are a manufacturing process selector. Given part geometry metrics, select the most likely manufacturing commodity. Return ONLY a JSON object, no prose, no markdown.',
        messages: [{ role: 'user', content: stage1Prompt(geo) }],
      });
      const s1Raw = s1Msg.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
      const parsed = JSON.parse(extractJson(s1Raw)) as typeof stage1Selection;
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

  const systemPrompt = SPECIALIST_SYSTEM_PROMPTS[selectedCommodity] ?? DEFAULT_SYSTEM_PROMPT;
  const userPrompt = buildPrompt(geo, preStub as Parameters<typeof buildPrompt>[1], filename, selectedCommodity, stage1Selection, userOverrides);

  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: userPrompt }];
  if (partPhotoBase64) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: partPhotoMime, data: partPhotoBase64 } });
  }

  let analysis: unknown;
  // Express 4 does NOT catch async throws — an uncaught rejection here killed
  // the whole Node process (empty response to the client, dead server after).
  try {
    // Prompt-guided JSON (the prompt ends with the exact schema via
    // buildJSONSchema, tailored to the selected commodity). We do NOT use
    // structured outputs here: the full CAD schema has 86 optional params and
    // the API caps structured-output optionals at 24. extractJson + a one-shot
    // repair retry gives us robust parsing without that limit.
    analysis = await cadAnalyzeJSON(anthropic, deepAnalysis, systemPrompt, userContent);
    normalizeFieldConfidences(analysis);
    normalizeCADAnalysis(analysis as Record<string, unknown>);
  } catch (err) {
    respondAIError(res, err);
    return;
  }

  const machiningWarnings = applyNearNetMachiningCap(analysis as Parameters<typeof applyNearNetMachiningCap>[0]);
  const sanityWarnings = [...machiningWarnings, ...runCADSanityChecks(analysis as Parameters<typeof runCADSanityChecks>[0], geo.volume?.cm3 ?? null)];
  const payload = {
    success: true,
    analysis,
    sanityWarnings,
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
