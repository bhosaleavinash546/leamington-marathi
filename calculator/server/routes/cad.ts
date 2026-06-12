import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { preprocessCADFile } from '../utils/preprocessor.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/cad/analyze
router.post('/analyze', upload.single('cadFile'), async (req, res): Promise<void> => {
  // Validate file
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { originalname, size, buffer } = req.file;
  const ext = originalname.toLowerCase().split('.').pop() ?? '';
  if (!['stp', 'step', 'igs', 'iges'].includes(ext)) {
    res.status(400).json({ error: 'Unsupported file format. Use STEP (.stp/.step) or IGES (.igs/.iges)' }); return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) { res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Set it in .env or pass as x-api-key header.' }); return; }

  // Preprocess
  const content = buffer.toString('utf-8');
  const preprocessed = preprocessCADFile(content, originalname, size);

  // Build Claude prompt
  const anthropic = new Anthropic({ apiKey });
  const systemPrompt = `You are an expert manufacturing engineer AI specializing in should-cost analysis. You analyze preprocessed CAD file data and extract manufacturing-relevant information. Always respond with valid JSON only — no markdown, no explanatory text, just the JSON object.`;

  const userPrompt = buildAnalysisPrompt(preprocessed, originalname);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON (strip any accidental markdown fences)
    const jsonStr = responseText.replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trim();
    const analysis = JSON.parse(jsonStr);

    res.json({ success: true, analysis, preprocessed: { format: preprocessed.format, partName: preprocessed.partName, boundingBoxEstMm: preprocessed.boundingBoxEstMm, entityStats: preprocessed.entityStats } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Analysis failed: ${msg}` });
  }
});

function buildAnalysisPrompt(p: import('../utils/preprocessor.js').PreprocessedCAD, filename: string): string {
  return `Analyze this preprocessed ${p.format} CAD file and provide manufacturing cost estimation inputs.

File: ${filename}
Size: ${p.fileSizeKB.toFixed(0)} KB

=== EXTRACTED CAD DATA ===
${p.summary}

Valid materialId values: mat-al6061, mat-al5052, mat-dc01, mat-hss, mat-stainless-316, mat-brass-crz, mat-pp, mat-pa6, mat-pc, mat-lm25, mat-gjl350, mat-az91d, mat-ss304c, mat-bronze-c905
Valid commodityType values: machining, sheet_metal, injection_moulding, casting, forging, cast_and_machine
Valid machineId values for operations: mach-vmc3, mach-lathe-cnc, mach-drill, mach-5ax, mach-haas-vf2, mach-dmg-dmu50, mach-haas-umc500, mach-mazak-qt200

Return ONLY this JSON structure:
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
  "confidenceLevel": "High"|"Medium"|"Low",
  "analysisLimitations": [string]
}

Guidelines:
- boundingBoxMm: from coordinate data if available, else estimate from part complexity
- estimatedVolumeCm3: bounding_box_cm3 × fill_factor (machined parts: 0.35-0.55, castings: 0.5-0.7)
- netWeightKg: volume × density (Al: 2.70 g/cm3, steel: 7.85, plastic: 1.05)
- Multiple cylindrical surfaces + planes + fillets → CNC machining (high confidence)
- B-spline surfaces dominant → casting or 5-axis machining
- Thin flat shapes with bends → sheet metal
- manufacturabilityScore: 0-100 (100=easily manufacturable)
- Be specific in aiExplanation about what entity types drove your conclusions`;
}

export default router;
