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

// ── JSON extraction — robust multi-strategy parser ─────────────────────────
function extractJSON(text: string): string {
  // Strategy 1 (most robust): find outermost { … } by bracket counting
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) return text.slice(start, i + 1);
    }
  }
  // Strategy 2: strip code fences (handles ```json…``` wrapping)
  return text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
    .replace(/\s*```[\s\S]*$/i, '')
    .trim();
}

const systemPrompt = `You are a world-class PCB engineer and electronics cost analyst with 20+ years of experience. Analyse PCB images with exceptional accuracy.

CRITICAL: Return ONLY a single valid JSON object. No markdown. No code fences. No explanations. No text before or after the JSON. Start your response with { and end with }.`;

const userPrompt = `Analyse this PCB image thoroughly. Detect every visible component, identify board characteristics, and return a complete JSON BOM and cost estimate.

COMPONENT TYPE — use EXACTLY one of these strings:
  passive_0402   resistors/caps/inductors in 0402
  passive_0603   0603 package passives
  passive_0805   0805 package passives (includes 1206)
  ic_soic        SOIC, SOT-23, SOT-223, SOP packaged ICs
  ic_qfn         QFN, DFN, MLF, LGA packaged ICs
  ic_bga         BGA, uBGA, CSP, FCBGA packaged ICs
  ic_tqfp        TQFP, LQFP, TSSOP, SSOP packaged ICs
  connector_smt  SMT connectors, edge connectors, sockets
  through_hole   THT resistors, electrolytics, TH connectors
  manual_solder  hand-soldered wires, jumpers, specials

TECHNOLOGY TYPE — use EXACTLY one of:
  FR4_STD   standard FR4, up to 4 layers, no HDI
  FR4_HTg   high-Tg FR4, 4-8 layers, no HDI
  HDI_RIGID HDI, 6+ layers with microvias
  RIGID_FLEX rigid-flex construction
  RF_MICRO  Rogers/PTFE (RF/microwave boards)

SURFACE FINISH — use EXACTLY one of:
  hasl  hasl_lf  enig  osp  enepig  iteq

HDI STRUCTURE — use EXACTLY one of:
  none  1plus_n_plus1  2plus_n_plus2  any_layer

QUALITY GRADE — use EXACTLY one of:
  consumer  industrial  auto_grade2  auto_grade1  aerospace

COMPLEXITY — use EXACTLY one of:
  low  medium  high  very_high

CONFIDENCE LEVEL — use EXACTLY one of:
  High  Medium  Low

Return this exact JSON structure (no TypeScript syntax, just JSON):
{
  "partName": "descriptive board name",
  "boardSpec": {
    "estimatedLayers": 2,
    "widthMm": 100,
    "heightMm": 80,
    "surfaceFinish": "enig",
    "solderMaskColour": "green",
    "silkscreenSides": 2,
    "throughVias": 50,
    "blindVias": 0,
    "buriedVias": 0,
    "microVias": 0,
    "bgaDetected": false,
    "minTraceSpaceMm": 0.15,
    "technologyType": "FR4_STD",
    "hdiStructure": "none",
    "impedanceControlRequired": false,
    "copperWeightOz": 1,
    "qualityGrade": "industrial",
    "panelUtilisation": 0.75
  },
  "bom": [
    {
      "refDes": "R1-R10",
      "componentType": "passive_0402",
      "description": "10k resistor",
      "pkg": "0402",
      "value": "10k",
      "voltage": "",
      "qty": 10,
      "unitPriceGBP": 0.008,
      "moq": 5000,
      "automotive": false,
      "highCost": false
    }
  ],
  "assembly": {
    "smtPlacements": 100,
    "throughHoleJoints": 20,
    "manualJoints": 0,
    "bgaCount": 0,
    "complexity": "medium",
    "reflowSides": 1,
    "aoiRequired": true,
    "ictTimeSec": 60
  },
  "costEstimates": {
    "pcbFabGBP": { "min": 5.0, "mid": 8.0, "max": 12.0 },
    "totalBOMCostGBP": 25.0,
    "smtAssemblyCostGBP": 10.0
  },
  "aiInsights": [
    "Insight 1",
    "Insight 2",
    "Insight 3"
  ],
  "dfmIssues": [
    "DFM issue 1",
    "DFM issue 2"
  ],
  "highCostComponents": [
    "High-cost component 1"
  ],
  "optimisationSuggestions": [
    "Suggestion 1",
    "Suggestion 2",
    "Suggestion 3"
  ],
  "confidenceLevel": "Medium",
  "analysisLimitations": [
    "Limitation 1"
  ]
}

INSTRUCTIONS:
- Replace all example values above with actual values from the image
- Group identical components (same type + package) into one BOM line
- unitPriceGBP: realistic 2024 UK pricing (auto-grade parts cost 3-5x consumer)
- smtPlacements = total qty of all SMT components
- throughHoleJoints = sum of qty x pins for through_hole components
- Estimate board dimensions from component sizes, connector pitch, or visible rulers
- List at least 3 aiInsights, 2 dfmIssues, 3 optimisationSuggestions, 1 analysisLimitation
- IMPORTANT: Return ONLY the JSON — nothing else`;

// POST /api/pcb/analyze-image
router.post('/analyze-image', upload.single('pcbImage'), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No image uploaded' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Add it in Settings or set the environment variable.' });
    return;
  }

  const mediaType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
  const base64Data = req.file.buffer.toString('base64');
  const anthropic = new Anthropic({ apiKey });

  let analysis: unknown;
  let lastRaw = '';
  let lastError = '';

  try {
    // ── Attempt 1: Full vision analysis ────────────────────────────────────
    const msg1 = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: userPrompt },
        ],
      }],
    });

    lastRaw = msg1.content[0]?.type === 'text' ? msg1.content[0].text : '';

    try {
      analysis = JSON.parse(extractJSON(lastRaw));
    } catch (e1) {
      lastError = String(e1);
      console.warn('[PCB] Attempt 1 JSON parse failed:', lastError);
      console.warn('[PCB] Raw (first 500):', lastRaw.slice(0, 500));

      // ── Attempt 2: Send raw response back to Claude for JSON repair ──────
      const repairPrompt = `The following text was supposed to be a valid JSON object but it may be malformed, truncated, or wrapped in code fences. Extract and return ONLY the valid JSON object. Fix any syntax errors. Start your response with { and end with }. Do not add any other text.

Text to fix:
${lastRaw}`;

      const msg2 = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: 'You are a JSON repair assistant. Return ONLY valid JSON — nothing else. Start with { and end with }.',
        messages: [{ role: 'user', content: repairPrompt }],
      });

      lastRaw = msg2.content[0]?.type === 'text' ? msg2.content[0].text : '';

      try {
        analysis = JSON.parse(extractJSON(lastRaw));
      } catch (e2) {
        lastError = String(e2);
        console.error('[PCB] Attempt 2 JSON repair also failed:', lastError);
        console.error('[PCB] Repair raw (first 500):', lastRaw.slice(0, 500));

        // ── Attempt 3: Minimal fallback prompt (text-only, no image) ─────
        const fallbackPrompt = `A PCB image was analysed and the result should have been JSON. The analysis failed. Return a minimal valid JSON object with these exact fields filled with reasonable defaults, and set confidenceLevel to "Low" and include an analysisLimitation explaining the parse failure.

${userPrompt}`;

        const msg3 = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
              { type: 'text', text: fallbackPrompt },
            ],
          }],
        });

        lastRaw = msg3.content[0]?.type === 'text' ? msg3.content[0].text : '';

        try {
          analysis = JSON.parse(extractJSON(lastRaw));
        } catch (e3) {
          res.status(500).json({
            error: `PCB analysis failed after 3 attempts. The AI could not produce valid JSON. Parse error: ${String(e3)}. Raw response preview: ${lastRaw.slice(0, 400)}`,
          });
          return;
        }
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
