import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WebP images are accepted'));
  },
});

// POST /api/pcb/analyze-image
router.post('/analyze-image', upload.single('pcbImage'), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No image uploaded' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  const mediaType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
  const base64Data = req.file.buffer.toString('base64');

  const systemPrompt = `You are a world-class PCB engineer and electronics cost analyst with 20+ years experience in automotive and industrial electronics. Analyse PCB images with exceptional accuracy. Return ONLY valid JSON — no markdown, no prose.`;

  const userPrompt = `Analyse this PCB image thoroughly. Detect every visible component, identify board characteristics, and build a complete BOM and should-cost estimate.

COMPONENT TYPE VALUES (use EXACTLY these strings):
- passive_0402  — resistors, capacitors, inductors in 0402 package
- passive_0603  — 0603 package passives
- passive_0805  — 0805 package passives (includes 1206)
- ic_soic       — SOIC, SOT-23, SOT-223, SOP packaged ICs
- ic_qfn        — QFN, DFN, MLF, LGA packaged ICs
- ic_bga        — BGA, μBGA, CSP, FCBGA packaged ICs
- ic_tqfp       — TQFP, LQFP, TSSOP, SSOP packaged ICs
- connector_smt — SMT connectors, edge connectors, sockets
- through_hole  — through-hole components (THT resistors, electrolytics, connectors)
- manual_solder — manually soldered wires, jumpers, special assemblies

PCB TECHNOLOGY VALUES (use EXACTLY):
- FR4_STD    — standard FR4, ≤4 layers, no HDI
- FR4_HTg    — high-Tg FR4, 4–8 layers, no HDI
- HDI_RIGID  — HDI, ≥6 layers with microvias
- RIGID_FLEX — rigid-flex construction visible
- RF_MICRO   — Rogers/PTFE material (RF/microwave)

SURFACE FINISH VALUES: hasl | hasl_lf | enig | osp | hard_gold

QUALITY GRADE VALUES: consumer | industrial | auto_grade2 | auto_grade1 | aerospace

COMPLEXITY VALUES: low | medium | high | very_high

Return EXACTLY this JSON structure:
{
  "partName": string,
  "boardSpec": {
    "estimatedLayers": number,
    "widthMm": number,
    "heightMm": number,
    "surfaceFinish": string,
    "solderMaskColour": string,
    "silkscreenSides": number,
    "throughVias": number,
    "blindVias": number,
    "buriedVias": number,
    "microVias": number,
    "bgaDetected": boolean,
    "minTraceSpaceMm": number,
    "technologyType": string,
    "hdiStructure": string,
    "impedanceControlRequired": boolean,
    "copperWeightOz": number,
    "qualityGrade": string,
    "panelUtilisation": number
  },
  "bom": [
    {
      "refDes": string,
      "componentType": string,
      "description": string,
      "pkg": string,
      "value": string,
      "voltage": string,
      "qty": number,
      "unitPriceGBP": number,
      "moq": number,
      "automotive": boolean,
      "highCost": boolean
    }
  ],
  "assembly": {
    "smtPlacements": number,
    "throughHoleJoints": number,
    "manualJoints": number,
    "bgaCount": number,
    "complexity": string,
    "reflowSides": number,
    "aoiRequired": boolean,
    "ictTimeSec": number
  },
  "costEstimates": {
    "pcbFabGBP": { "min": number, "mid": number, "max": number },
    "totalBOMCostGBP": number,
    "smtAssemblyCostGBP": number
  },
  "aiInsights": [string],
  "dfmIssues": [string],
  "highCostComponents": [string],
  "optimisationSuggestions": [string],
  "confidenceLevel": "High" | "Medium" | "Low",
  "analysisLimitations": [string]
}

INSTRUCTIONS:
- Count all visible components carefully; group identical components (same type+package) into one BOM line
- unitPriceGBP: use realistic 2024 UK pricing (auto-grade parts cost 3–5× consumer equivalents)
- For BGA components, set bgaDetected=true and include each BGA as its own BOM line
- smtPlacements = total quantity of all SMT components (sum of qty for all non-TH, non-manual BOM lines)
- throughHoleJoints = sum of qty×pins for through_hole components
- Estimate board size from visible rulers, component sizes, or connector pitch as reference
- Layer count: 1=single-sided no vias; 2=through vias only; 4+=if buried/blind vias or complex routing density
- Confidence: High=clear HD image with readable silkscreen; Medium=partial visibility; Low=low-res or partial board
- List at least 3 aiInsights, 2 dfmIssues, 3 optimisationSuggestions`;

  const anthropic = new Anthropic({ apiKey });

  let analysis: unknown;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            { type: 'text', text: userPrompt },
          ],
        }],
      });

      const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
      const jsonStr = raw.replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trim();

      try {
        analysis = JSON.parse(jsonStr);
        break;
      } catch {
        if (attempt === 2) {
          res.status(500).json({ error: `AI returned unparseable JSON. Raw: ${raw.slice(0, 300)}` });
          return;
        }
        console.warn('[PCB] JSON parse failed on attempt 1, retrying…');
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PCB] Anthropic API error:', msg);
    res.status(502).json({ error: `AI service error: ${msg}` });
    return;
  }

  res.json({ success: true, analysis });
});

export default router;
