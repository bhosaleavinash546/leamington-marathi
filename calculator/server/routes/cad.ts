import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { preprocessCADFile } from '../utils/preprocessor.js';
import { analyzeGeometry } from '../utils/geometry-bridge.js';
import type { OCCTGeometry } from '../utils/geometry-bridge.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/cad/analyze
router.post('/analyze', upload.single('cadFile'), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const { originalname, size, buffer } = req.file;
  const ext = originalname.toLowerCase().split('.').pop() ?? '';
  if (!['stp', 'step', 'igs', 'iges'].includes(ext)) {
    res.status(400).json({ error: 'Unsupported format. Use STEP (.stp/.step) or IGES (.igs/.iges)' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Set it in .env or pass as x-api-key header.' });
    return;
  }

  // --- Phase 1: Real geometry extraction (OCCT via Python/CadQuery) ---
  let geo: OCCTGeometry;
  let geometrySource: 'occt' | 'text_parsing';

  console.log(`[CAD] Running OCCT geometry engine on ${originalname} (${(size / 1024).toFixed(0)} KB)…`);
  geo = await analyzeGeometry(buffer, originalname, 120_000);

  if (geo.status === 'success') {
    geometrySource = 'occt';
    console.log(`[CAD] OCCT success — V=${geo.volume!.cm3.toFixed(1)}cm³  SA=${geo.surfaceArea!.cm2.toFixed(0)}cm²  faces=${geo.faces!.total}`);
  } else {
    // Fall back to fast text-based preprocessing
    console.warn(`[CAD] OCCT failed (${geo.error}) — falling back to text preprocessor`);
    geometrySource = 'text_parsing';
    geo = { status: 'error', error: geo.error }; // keep for response
  }

  // --- Phase 2: Build text-preprocessor summary for Claude (always computed as context) ---
  const content = buffer.toString('utf-8');
  const preprocessed = preprocessCADFile(content, originalname, size);

  // --- Phase 3: Build Claude prompt with real measurements when available ---
  const anthropic = new Anthropic({ apiKey });
  const systemPrompt = `You are an expert manufacturing engineer AI specialising in should-cost analysis. Analyse the CAD data and return ONLY valid JSON — no markdown, no prose, just the JSON object.`;
  const userPrompt = buildPrompt(geo, preprocessed, originalname);

  // --- Phase 4: Call Claude, retry once on malformed JSON ---
  let analysis: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const jsonStr = raw.replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trim();

    try {
      analysis = JSON.parse(jsonStr);
      break;
    } catch {
      if (attempt === 2) {
        res.status(500).json({ error: `AI returned unparseable JSON after 2 attempts. Raw: ${raw.slice(0, 300)}` });
        return;
      }
      console.warn('[CAD] JSON parse failed on attempt 1, retrying…');
    }
  }

  res.json({
    success: true,
    analysis,
    geometrySource,
    occtGeometry: geo.status === 'success' ? geo : null,
    preprocessed: {
      format: preprocessed.format,
      partName: preprocessed.partName,
      boundingBoxEstMm: preprocessed.boundingBoxEstMm,
      entityStats: preprocessed.entityStats,
    },
  });
});

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildPrompt(
  geo: OCCTGeometry,
  pre: ReturnType<typeof preprocessCADFile>,
  filename: string,
): string {
  const validMaterials = 'mat-al6061, mat-al5052, mat-dc01, mat-hss, mat-stainless-316, mat-brass-crz, mat-pp, mat-pa6, mat-pc, mat-lm25, mat-gjl350, mat-az91d, mat-ss304c, mat-bronze-c905';
  const validCommodities = 'machining, sheet_metal, injection_moulding, casting, forging, cast_and_machine';
  const validMachines = 'mach-vmc3, mach-lathe-cnc, mach-drill, mach-5ax, mach-haas-vf2, mach-dmg-dmu50, mach-haas-umc500, mach-mazak-qt200';

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
      geo.fillRatio! < 0.20 ? 'very sparse/hollow → sheet metal, casting, or thin-wall machined'
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

    geometrySection = `=== GEOMETRY (measured by Open CASCADE OCCT — all values are precise) ===
File: ${filename}
Bounding box: ${bb.xMm}mm × ${bb.yMm}mm × ${bb.zMm}mm
True volume: ${vol.cm3} cm³ (${vol.mm3.toFixed(0)} mm³)
True surface area: ${sa.cm2} cm²
Fill ratio: ${geo.fillRatio} → ${fillHint}

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
    // Fallback: use text-preprocessor data
    geometrySection = `=== GEOMETRY (text-parsed from ${pre.format} file — lower confidence) ===
File: ${filename}  Size: ${pre.fileSizeKB.toFixed(0)} KB
${pre.summary}`;
  }

  const cncHrs = geo.cncCycleTimeEstimate?.estimatedTotalHrs ?? null;
  const setupCount = geo.setupAnalysis?.estimatedSetupCount ?? null;
  const undercutCount = geo.draftAnalysis?.undercutFaceCount ?? 0;

  const instructions = geo.status === 'success'
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
- ${cncHrs !== null ? `For machining: use estimatedCycleTimeHr=${cncHrs.toFixed(3)} from the bottom-up CNC estimate above (do NOT guess)` : ''}
- ${setupCount !== null ? `For machining: estimatedSetupTimeHr=${((setupCount * (geo.cncCycleTimeEstimate?.assumedSetupTimeMinsPerSetup ?? 45)) / 60).toFixed(3)} (${setupCount} setups × assumed mins/setup)` : ''}
- ${undercutCount > 0 ? `${undercutCount} undercuts detected → add manufacturability risk (High severity) for casting/moulding; machining may need 5-axis` : 'No undercuts — standard tooling angles acceptable'}
- manufacturabilityScore: 0–100 (100 = easiest); deduct 5–15 pts per undercut, 5 pts per zero-draft face cluster`
    : `GUIDELINES:
- estimatedVolumeCm3: bbox_cm3 × fill_factor (machined: 0.35–0.55, cast: 0.5–0.7, sheet metal: 0.1–0.25)
- estimatedWeightKg: volume × density (Al 2.70, steel 7.85, plastic 1.05 g/cm³)
- manufacturabilityScore: 0–100`;

  return `${geometrySection}

Valid materialId values: ${validMaterials}
Valid commodityType values: ${validCommodities}
Valid machineId values: ${validMachines}

${instructions}

Return ONLY this JSON structure (no prose, no markdown fences):
{
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
    ]
  },
  "aiExplanation": string,
  "confidenceLevel": "${geo.status === 'success' ? 'High' : 'Medium'}",
  "analysisLimitations": [string]
}`;
}

export default router;
