import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import {
  computeAllCountryCosts,
  computePCBCountryCost,
  computeVolumeCurve,
  computeComplexityScore,
  PCB_COUNTRY_RATES,
  COUNTRY_DISPLAY_ORDER,
  type PCBCostInput,
} from '../data/pcb-country-rates.js';
import { fetchLivePrices, type LivePricingProvider } from '../utils/pcb-live-pricing.js';
import { parseBOMFile, type ParsedBOMLine } from '../utils/pcb-bom-parser.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // pcbImages (array) must be images; bomFile accepts csv/xml/txt text formats.
    if (file.fieldname === 'bomFile') {
      if (/\.(csv|xml|txt)$/i.test(file.originalname) || /^(text\/|application\/(xml|csv|vnd\.ms-excel))/i.test(file.mimetype)) cb(null, true);
      else cb(new Error('BOM file must be .csv, .xml or .txt'));
      return;
    }
    if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WebP images are accepted'));
  },
});

// Slot labels sent from the frontend (Top side, Bottom side, Additional 1…3)
const DEFAULT_IMAGE_LABELS = ['Top side', 'Bottom side', 'Additional 1', 'Additional 2', 'Additional 3'];

/** Build Claude content blocks for one or more PCB images, with optional label text prefixes. */
function buildImageContentBlocks(
  files: Express.Multer.File[],
  labels: string[],
  includeLabels: boolean,
): Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'text'; text: string }> {
  return files.flatMap((f, i) => {
    const base64 = f.buffer.toString('base64');
    const mtype = f.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
    const blocks: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'text'; text: string }> = [];
    if (includeLabels) blocks.push({ type: 'text', text: `**${labels[i] ?? `Image ${i + 1}`}:**` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: mtype, data: base64 } });
    return blocks;
  });
}

// Build the user-provided BOM context block injected into the Stage 3 prompt.
function buildParsedBOMContext(lines: ParsedBOMLine[]): string {
  const rows = lines.slice(0, 400).map(l => `${l.refDes} | ${l.partNumber} | ${l.description} | Qty:${l.qty}`).join('\n');
  return `\n=== USER-PROVIDED BOM FILE (${lines.length} lines — treat as ground truth for part numbers) ===
${rows}

Instructions: Use the above as authoritative part numbers. Your BOM output should match these
reference designators exactly. Focus your image analysis on: board dimensions, layer count,
surface finish, via count, DFM issues, component pricing and optimisation insights.\n`;
}

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

// ── Stage 1: Board domain classification prompt ────────────────────────────
function stage1Prompt(): string {
  return `Classify this PCB image into one application domain and return JSON only:
{"domain":"automotive_adas"|"rf_microwave"|"industrial_power"|"industrial_control"|"consumer_iot"|"medical"|"general","conf":0.0-1.0,"hints":["visual clue 1","visual clue 2"]}

Clues per domain:
- automotive_adas: CAN/LIN connectors, AEC markings, heat spreaders, ADAS SoCs (TDA, EyeQ)
- rf_microwave: Rogers/PTFE substrate, SMA connectors, RF shielding cans, spiral inductors
- industrial_power: large capacitors/inductors, IGBTs/MOSFETs, optocouplers, heatsinks
- industrial_control: DIN rail mount, fieldbus connectors (RJ45 banks, DB9), industrial MCUs
- consumer_iot: tiny form factor, WiFi/BT antenna area, USB-C, MEMS sensors, coin cell
- medical: isolated power section, isolation barriers, medical-grade connectors
- general: none of the above or unclear`;
}

// ── Stage 2: OCR text extraction prompt ───────────────────────────────────
const stage2Prompt = `Examine this PCB image carefully. Extract every piece of readable text you can see:
- IC chip markings (manufacturer + part number, e.g. "STM32F407VGT6", "TJA1044GT/3", "AURIX TC297")
- Reference designators visible on silkscreen (e.g. "U1", "R1-R10", "C47")
- Connector labels or markings (e.g. "J1 CAN", "P2 PWR")
- Board text (revision, title, manufacturer, date codes)

Return JSON only:
{"icMarkings":["exact text from chip 1","exact text from chip 2"],"refDesGroups":["U1","R1-R10","C1-C20"],"connectors":["J1: appears to be CAN connector","P2: power input"],"boardText":["PCB REV 2.1","MADE IN UK"],"extractionQuality":"high"|"medium"|"low"}`;

// ── Specialist system prompts ──────────────────────────────────────────────
const SPECIALIST_SYSTEM_PROMPTS: Record<string, string> = {
  automotive_adas: 'You are a senior automotive electronics engineer with 20+ years in Tier-1 automotive PCB design and PCBA cost engineering. You specialise in ASIL-rated systems, AEC-Q qualified components, CAN/LIN/Ethernet-AVB networks, and ADAS SoC selection. You understand automotive-grade pricing premiums (3–8× consumer price), functional safety requirements, and PPAP documentation costs. When pricing components, always apply automotive grade multipliers. You know NXP S32K/S32G, Infineon AURIX, TI TDA4VM/TDA2x, Renesas RH850/V4H pricing intimately. Return ONLY valid JSON.',
  rf_microwave: 'You are an RF/microwave PCB design and cost engineer with expertise in Rogers/PTFE substrates, impedance-controlled layouts, and RF component selection. You understand PA/LNA/PLL/filter/balun component pricing, the cost premium of RF substrates (Rogers 4350B: 8–12×), controlled-impedance PCB fab, and RF module pricing from suppliers like Mini-Circuits, Würth, and Murata. Return ONLY valid JSON.',
  industrial_power: 'You are a power electronics PCB cost engineer specialising in motor drives, power converters, UPS, and industrial power supplies. You know IGBT/SiC MOSFET pricing, gate driver ICs, isolated DC-DC converter modules, high-capacitance bulk capacitors, current sensor ICs, and thermal management components. You understand that industrial-grade components cost 2–4× consumer parts. Return ONLY valid JSON.',
  industrial_control: 'You are an industrial control and automation PCB cost engineer with expertise in PLCs, motion controllers, fieldbus nodes (EtherCAT, PROFIBUS, CANopen, Modbus), and industrial Ethernet switches. You know Siemens/Beckhoff/Rockwell component choices, ruggedised connector pricing, industrial-grade MCU/DSP costs, and conformal coating requirements. Return ONLY valid JSON.',
  consumer_iot: 'You are a consumer electronics and IoT PCB cost engineer specialising in connected devices, wearables, and smart home products. You know WiFi/BT SoC pricing (ESP32, CC2340, nRF52840), MEMS sensor costs, PMIC selection, USB-C connector and PD IC pricing, and how to optimise BOM cost for high-volume consumer applications. You target the lowest reasonable BOM cost while meeting spec. Return ONLY valid JSON.',
  medical: 'You are a medical device PCB cost engineer with expertise in IEC 60601-1, ISO 13485, and patient-safety isolation requirements. You understand reinforced/basic isolation requirements, medical-grade component sourcing, IEC 60601-compliant isolation transformer and optocoupler selection, and the significant cost premium of medical-certified components (3–10× consumer). Return ONLY valid JSON.',
  general: 'You are a world-class PCB engineer and electronics cost analyst with 20+ years of experience across multiple industries. You analyse PCB images with exceptional accuracy and provide realistic component pricing based on 2025/2026 UK production-volume market data. For should-cost analysis at 1K+ volumes, always use the lower half of the given price ranges for standard/generic parts. Return ONLY valid JSON.',
};

// ── Pricing reference table ────────────────────────────────────────────────
const PRICING_TABLE = `COMPONENT PRICING REFERENCE — UK 2025/2026, production volume 1K–10K units. These are HARD ANCHORS.
CRITICAL PRICING RULE: Default to the LOWER HALF of each range for standard/generic components at ≥1K volumes. Use the upper end only for premium/high-spec/automotive-grade variants. DO NOT use the upper bound as a default.
passive_0402: resistors £0.001–0.006, caps £0.002–0.030 (X5R/X7R); auto-grade: 3–6× above
passive_0603: resistors £0.002–0.009, caps £0.005–0.070, inductors £0.010–0.100
passive_0805: resistors £0.004–0.016, caps £0.010–0.300, inductors £0.030–1.00
crystal_osc: HC-49 crystal £0.07–0.28; SMD crystal £0.12–0.55; TCXO £0.80–4.00; OCXO £9–50; auto-grade 3×
power_module: DC-DC SIP/DIP module £1.80–9; isolated module £6–28; automotive £16–65
transformer: SMD signal transformer £0.60–2.80; SMD power transformer £1.50–10; common-mode choke £0.18–1.80
led: SMD indicator 0603/0805 £0.02–0.10; RGB LED £0.08–0.40; high-power LED £0.35–3.00
relay_switch: SMD relay SPDT £0.22–1.50; high-current relay £1.50–7.50; tactile switch £0.03–0.35
fuse_tvs: SMD polyfuse £0.05–0.22; SMD fuse £0.03–0.18; TVS diode £0.05–0.35; TVS array £0.18–0.90
ic_soic: logic gate £0.05–0.40; op-amp general £0.15–1.80; op-amp precision £0.80–6; driver IC £0.20–2.80; LDO regulator £0.12–1.80; comparator £0.10–1.00
ic_qfn: simple MCU (8/32-bit low-end) £0.28–2.50; complex MCU £2–12; PMIC £1.00–9; RF IC £1.50–16; industrial MCU £2.50–20
ic_bga: FPGA small £8–50; FPGA large £40–320; SoC/Application CPU £25–200; DDR memory £2–15; automotive SoC £30–250; ADAS processor £80–500
ic_tqfp: MCU 32-bit mid-range £1.50–9; DSP £4–24; CPLD £2.50–16; automotive MCU £6–50
connector_smt: 0.5mm FPC/FFC £0.10–0.65; 1.0mm FPC £0.08–0.45; USB-C £0.15–1.00; SMA/RF £0.35–2.50; DF17 board-to-board £0.90–5.00; automotive connector (Kostal/Amphenol) £1.50–12
through_hole: electrolytic cap (small) £0.08–0.60; electrolytic cap (large) £0.35–4.00; TH connector 2-row £0.18–2.50; power connector £0.60–6.00; TO-220 transistor £0.20–4.00
manual_solder: wire/jumper £0.04–0.35; heat-shrink joint £0.03–0.20`;

// ── IC price hints from OCR markings ──────────────────────────────────────
function buildICPriceHints(markings: string[], _domain: string): string {
  return markings.map(marking => {
    const m = marking.toUpperCase();
    if (m.includes('STM32')) return `${marking} — STM32 microcontroller — £1.50–9 depending on variant`;
    if (m.includes('TJA')) return `${marking} — NXP TJA CAN/LIN transceiver — £0.60–3.00`;
    if (m.includes('AURIX') || m.includes('TC2') || m.includes('TC3')) return `${marking} — Infineon AURIX MCU — £20–100 automotive grade`;
    if (m.includes('TDA4') || m.includes('TDA2')) return `${marking} — TI TDA4/2 ADAS SoC — £60–280`;
    if (m.includes('S32K') || m.includes('S32G')) return `${marking} — NXP S32 automotive MCU/SoC — £6–75`;
    if (m.includes('NRF') || m.includes('NRF')) return `${marking} — Nordic Semiconductor nRF MCU/SoC — £1.00–6.00`;
    if (m.includes('ESP32') || m.includes('ESP8')) return `${marking} — Espressif ESP32/ESP8266 WiFi SoC — £0.70–3.00`;
    if (m.includes('BCM') || m.includes('LAN')) return `${marking} — Broadcom/Microchip Ethernet IC — £1.00–12`;
    if (m.includes('MAX') || m.includes('LM') || m.includes('TLV')) return `${marking} — Analog/TI op-amp or PMIC — £0.18–6.00`;
    return `${marking} — price from pricing table above`;
  }).join('\n');
}

// ── Stage 3: Build user prompt for specialist analysis ─────────────────────
interface Stage1Result { domain: string; conf: number; hints: string[] }
interface OCRResult { icMarkings: string[]; refDesGroups: string[]; connectors: string[]; boardText: string[]; extractionQuality: string }

function buildUserPrompt(ocr: OCRResult, stage1: Stage1Result, domain: string): string {
  return `=== STAGE 1 CLASSIFICATION ===
Board domain: ${domain} (confidence: ${stage1.conf})
Visual hints: ${stage1.hints.join(', ')}

=== OCR EXTRACTION RESULTS ===
IC chip markings found: ${ocr.icMarkings.join(', ') || 'none clearly readable'}
Reference designators: ${ocr.refDesGroups.join(', ') || 'not visible'}
Connectors: ${ocr.connectors.join('; ') || 'none identified'}
Board text: ${ocr.boardText.join(', ') || 'none'}
OCR quality: ${ocr.extractionQuality}

IMPORTANT: Use the IC markings above to identify exact component part numbers and price them accurately.
${ocr.icMarkings.length > 0 ? `Known IC identifications to use:\n${buildICPriceHints(ocr.icMarkings, domain)}` : ''}

${PRICING_TABLE}

=== COMPONENT TYPES (use EXACTLY one per BOM line) ===
passive_0402, passive_0603, passive_0805
crystal_osc, power_module, transformer, led, relay_switch, fuse_tvs
ic_soic, ic_qfn, ic_bga, ic_tqfp
connector_smt, through_hole, manual_solder

=== BOARD TECHNOLOGY ===
technologyType: FR4_STD | FR4_HTg | HDI_RIGID | RIGID_FLEX | RF_MICRO
surfaceFinish: hasl | hasl_lf | enig | osp | enepig | iteq
hdiStructure: none | 1plus_n_plus1 | 2plus_n_plus2 | any_layer
qualityGrade: consumer | industrial | auto_grade2 | auto_grade1 | aerospace
complexity: low | medium | high | very_high
confidenceLevel: High | Medium | Low

Analyse this PCB image thoroughly. Group identical components. Return ONLY this JSON structure (replace all example values with actual values from the image):
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
      "highCost": false,
      "partNumber": "",
      "lineConf": 0.9,
      "ocrExtracted": false
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
  "aiInsights": ["Insight 1", "Insight 2", "Insight 3"],
  "dfmIssues": ["DFM issue 1", "DFM issue 2"],
  "highCostComponents": ["High-cost component 1"],
  "optimisationSuggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"],
  "confidenceLevel": "Medium",
  "analysisLimitations": ["Limitation 1"],
  "stage1Classification": {"domain": "${domain}", "conf": ${stage1.conf}, "hints": ${JSON.stringify(stage1.hints)}},
  "ocrExtraction": {"icMarkings": ${JSON.stringify(ocr.icMarkings)}, "extractionQuality": "${ocr.extractionQuality}"}
}

INSTRUCTIONS:
- Replace all example values above with actual values from the image
- Group identical components (same type + package) into one BOM line
- unitPriceGBP: use the COMPONENT PRICING REFERENCE above as hard anchors; default to the LOWER HALF of each range for standard/generic components at production volumes ≥1K units
- For IC components identified from OCR markings, set partNumber to the exact marking, lineConf to 1.0, and ocrExtracted to true
- For other components, set partNumber to best-guess part number or empty string, lineConf to 0.5–0.9, ocrExtracted to false
- smtPlacements = total qty of all SMT components
- throughHoleJoints = sum of qty x pins for through_hole components
- Estimate board dimensions from component sizes, connector pitch, or visible rulers
- List at least 3 aiInsights, 2 dfmIssues, 3 optimisationSuggestions, 1 analysisLimitation
- IMPORTANT: Return ONLY the JSON — nothing else`;
}

// ── JSON repair prompt ─────────────────────────────────────────────────────
function buildRepairPrompt(raw: string): string {
  return `The following text was supposed to be a valid JSON object but it may be malformed, truncated, or wrapped in code fences. Extract and return ONLY the valid JSON object. Fix any syntax errors. Start your response with { and end with }. Do not add any other text.

Text to fix:
${raw}`;
}

// POST /api/pcb/analyze-image
router.post('/analyze-image', upload.fields([
  { name: 'pcbImages', maxCount: 5 },   // up to 5 images: top, bottom, + 3 additional
  { name: 'bomFile', maxCount: 1 },
]), async (req, res): Promise<void> => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFiles = files?.pcbImages ?? [];
  const primaryImage = imageFiles[0];
  const bomFileUpload = files?.bomFile?.[0];
  if (!primaryImage) { res.status(400).json({ error: 'No image uploaded' }); return; }

  // Parse slot labels sent from the frontend
  let imageLabels: string[] = DEFAULT_IMAGE_LABELS;
  try {
    const raw = req.body?.pcbImageLabels as string | undefined;
    if (raw) imageLabels = JSON.parse(raw) as string[];
  } catch { /* use defaults */ }

  const multiImage = imageFiles.length > 1;

  // Optional user-provided BOM file — parsed and injected as ground truth.
  let parsedBOM: ParsedBOMLine[] = [];
  if (bomFileUpload) {
    try {
      parsedBOM = parseBOMFile(bomFileUpload.buffer.toString('utf-8'), bomFileUpload.originalname);
      console.log(`[PCB] BOM file parsed: ${parsedBOM.length} lines from ${bomFileUpload.originalname}`);
    } catch (err) {
      console.warn('[PCB] BOM file parse failed:', err instanceof Error ? err.message : String(err));
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Add it in Settings or set the environment variable.' });
    return;
  }

  const mediaType = primaryImage.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
  const base64Data = primaryImage.buffer.toString('base64');
  const anthropic = new Anthropic({ apiKey });
  console.log(`[PCB] ${imageFiles.length} image(s) received: ${imageLabels.slice(0, imageFiles.length).join(', ')}`);

  // ── Stage 1: Board domain classification (Haiku) ───────────────────────
  let stage1Result: Stage1Result = { domain: 'general', conf: 0.5, hints: [] };
  try {
    const s1Msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: 'You are a PCB classification expert. Identify the board\'s application domain from visual cues. Return ONLY JSON.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: stage1Prompt() },
        ],
      }],
    });
    const s1Raw = s1Msg.content[0]?.type === 'text' ? s1Msg.content[0].text : '';
    const s1Parsed = JSON.parse(extractJSON(s1Raw)) as Stage1Result;
    stage1Result = {
      domain: s1Parsed.domain ?? 'general',
      conf: typeof s1Parsed.conf === 'number' ? s1Parsed.conf : 0.5,
      hints: Array.isArray(s1Parsed.hints) ? s1Parsed.hints : [],
    };
    console.log(`[PCB] Stage 1: ${stage1Result.domain} (conf=${stage1Result.conf})`);
  } catch (err) {
    console.warn('[PCB] Stage 1 failed, using defaults:', err instanceof Error ? err.message : String(err));
  }

  const domain = stage1Result.domain;

  // ── Stage 2: OCR text extraction (Haiku) — uses ALL images ──────────
  let ocrResult: OCRResult = { icMarkings: [], refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'low' };
  try {
    const s2MultiNote = multiImage
      ? `\n\nNOTE: ${imageFiles.length} PCB photos provided (${imageLabels.slice(0, imageFiles.length).join(', ')}). Extract text from ALL images — the bottom side and additional photos often expose component markings not visible from the top.`
      : '';
    const s2Msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: 'You are an expert at reading text from PCB images. Extract all readable text. Return ONLY JSON.',
      messages: [{
        role: 'user',
        content: [
          ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
          { type: 'text', text: stage2Prompt + s2MultiNote },
        ],
      }],
    });
    const s2Raw = s2Msg.content[0]?.type === 'text' ? s2Msg.content[0].text : '';
    const s2Parsed = JSON.parse(extractJSON(s2Raw)) as OCRResult;
    ocrResult = {
      icMarkings: Array.isArray(s2Parsed.icMarkings) ? s2Parsed.icMarkings : [],
      refDesGroups: Array.isArray(s2Parsed.refDesGroups) ? s2Parsed.refDesGroups : [],
      connectors: Array.isArray(s2Parsed.connectors) ? s2Parsed.connectors : [],
      boardText: Array.isArray(s2Parsed.boardText) ? s2Parsed.boardText : [],
      extractionQuality: s2Parsed.extractionQuality ?? 'low',
    };
    console.log(`[PCB] Stage 2: ${ocrResult.icMarkings.length} IC markings, extraction quality=${ocrResult.extractionQuality}`);
  } catch (err) {
    console.warn('[PCB] Stage 2 failed, using defaults:', err instanceof Error ? err.message : String(err));
  }

  // ── Stage 3: Full BOM analysis with specialist persona (Sonnet) ────────
  console.log(`[PCB] Stage 3: Sonnet specialist analysis (${imageFiles.length} image(s))...`);
  const specialistSystem = SPECIALIST_SYSTEM_PROMPTS[domain] ?? SPECIALIST_SYSTEM_PROMPTS['general'];
  const multiImageNote = multiImage
    ? `\n\nNOTE: ${imageFiles.length} PCB photos provided (${imageLabels.slice(0, imageFiles.length).join(', ')}). Use ALL images together for maximum accuracy — top side for component placement, bottom side for assembly type and solder joints, additional photos for close-up markings or specific areas of interest.`
    : '';
  const userPromptText = buildUserPrompt(ocrResult, stage1Result, domain) + multiImageNote +
    (parsedBOM.length > 0 ? buildParsedBOMContext(parsedBOM) : '');

  let analysis: unknown;
  let lastRaw = '';
  let lastError = '';

  try {
    // ── Attempt 1: Full vision analysis (all images) ─────────────────────
    const msg1 = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: specialistSystem,
      messages: [{
        role: 'user',
        content: [
          ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
          { type: 'text', text: userPromptText },
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

      // ── Attempt 2: Send raw response back to Claude for JSON repair ────
      const msg2 = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: 'You are a JSON repair assistant. Return ONLY valid JSON — nothing else. Start with { and end with }.',
        messages: [{ role: 'user', content: buildRepairPrompt(lastRaw) }],
      });

      lastRaw = msg2.content[0]?.type === 'text' ? msg2.content[0].text : '';

      try {
        analysis = JSON.parse(extractJSON(lastRaw));
      } catch (e2) {
        lastError = String(e2);
        console.error('[PCB] Attempt 2 JSON repair also failed:', lastError);
        console.error('[PCB] Repair raw (first 500):', lastRaw.slice(0, 500));

        // ── Attempt 3: Minimal fallback prompt ───────────────────────────
        const fallbackPrompt = `A PCB image was analysed and the result should have been JSON. The analysis failed. Return a minimal valid JSON object with these exact fields filled with reasonable defaults, and set confidenceLevel to "Low" and include an analysisLimitation explaining the parse failure.

${userPromptText}`;

        const msg3 = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: specialistSystem,
          messages: [{
            role: 'user',
            content: [
              ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
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

  // ── Stage 4: Country-aware cost breakdown ─────────────────────────────
  const selectedCountry = (req.body?.country as string | undefined) ?? 'cn';
  const orderQty = parseInt(req.body?.orderQty as string ?? '100', 10) || 100;

  let countryComparison: ReturnType<typeof computeAllCountryCosts> = [];
  let selectedCountryBreakdown: ReturnType<typeof computePCBCountryCost> | null = null;
  let volumeCurves: Record<string, ReturnType<typeof computeVolumeCurve>> = {};
  let complexityScore: ReturnType<typeof computeComplexityScore> | null = null;

  try {
    const a = (analysis as Record<string, unknown>);
    const boardSpec = a?.boardSpec as Record<string, unknown> ?? {};
    const assemblyData = a?.assembly as Record<string, unknown> ?? {};
    const costEst = a?.costEstimates as Record<string, unknown> ?? {};
    const pcbFabGBP = costEst?.pcbFabGBP as { mid?: number } | undefined;

    const costInput: PCBCostInput = {
      widthMm:              Number(boardSpec.widthMm)             || 100,
      heightMm:             Number(boardSpec.heightMm)            || 80,
      layers:               Number(boardSpec.estimatedLayers)     || 2,
      surfaceFinish:        String(boardSpec.surfaceFinish        || 'enig'),
      throughVias:          Number(boardSpec.throughVias)         || 50,
      blindVias:            Number(boardSpec.blindVias)           || 0,
      microVias:            Number(boardSpec.microVias)           || 0,
      hdiStructure:         String(boardSpec.hdiStructure         || 'none'),
      impedanceControlled:  Boolean(boardSpec.impedanceControlRequired),
      smtPlacements:        Number(assemblyData.smtPlacements)    || 0,
      throughHoleJoints:    Number(assemblyData.throughHoleJoints)|| 0,
      manualJoints:         Number(assemblyData.manualJoints)     || 0,
      bgaCount:             Number(assemblyData.bgaCount)         || 0,
      aoiRequired:          Boolean(assemblyData.aoiRequired),
      ictTimeSec:           Number(assemblyData.ictTimeSec)       || 0,
      conformalCoatAreaCm2: 0,
      totalBOMCostGBP:      Number(costEst?.totalBOMCostGBP)      || pcbFabGBP?.mid || 0,
      orderQuantity:        orderQty,
    };

    countryComparison = computeAllCountryCosts(costInput);
    const resolvedCountry = PCB_COUNTRY_RATES[selectedCountry] ? selectedCountry : 'cn';
    selectedCountryBreakdown = computePCBCountryCost(costInput, resolvedCountry);

    // Volume sensitivity curves for cheapest, selected, and UK.
    const sorted = [...countryComparison].sort((x, y) => x.totalPerBoard - y.totalPerBoard);
    const cheapestId = sorted[0]?.countryId ?? 'cn';
    const volumeQtys = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];
    volumeCurves = {
      [cheapestId]: computeVolumeCurve(costInput, cheapestId, volumeQtys),
      [resolvedCountry]: computeVolumeCurve(costInput, resolvedCountry, volumeQtys),
      gb: computeVolumeCurve(costInput, 'gb', volumeQtys),
    };

    // PCB complexity score (Feature 11).
    complexityScore = computeComplexityScore(boardSpec, assemblyData);

    console.log(`[PCB] Stage 4: Country costs computed for ${COUNTRY_DISPLAY_ORDER.length} countries`);
  } catch (err) {
    console.warn('[PCB] Stage 4 country cost computation failed:', (err as Error).message);
  }

  res.json({
    success: true,
    analysis,
    selectedCountry,
    selectedCountryBreakdown,
    countryComparison,
    volumeCurves,
    complexityScore,
  });
});

// ── Helper: build correction context for Stage 3 user prompt ──────────────
function buildCorrectionContext(
  correctedSpec: Record<string, unknown> | null,
  correctedBOM: unknown[] | null,
  correctedAssembly: Record<string, unknown> | null,
): string {
  const parts: string[] = [];
  parts.push('=== USER CORRECTIONS — AUTHORITATIVE GROUND TRUTH ===');
  parts.push('The user has verified and corrected the following values from the original AI analysis.');
  parts.push('Your JSON output MUST match these exactly. Generate FRESH insights, DFM issues, and');
  parts.push('optimisation suggestions for this exact configuration.\n');

  if (correctedSpec) {
    parts.push('=== CORRECTED BOARD SPEC ===');
    parts.push(JSON.stringify(correctedSpec, null, 2));
    parts.push('');
  }
  if (correctedAssembly) {
    parts.push('=== CORRECTED ASSEMBLY DATA ===');
    parts.push(JSON.stringify(correctedAssembly, null, 2));
    parts.push('');
  }
  if (correctedBOM && correctedBOM.length > 0) {
    parts.push('=== CORRECTED BOM ===');
    parts.push(JSON.stringify(correctedBOM, null, 2));
    parts.push('');
  }
  parts.push('IMPORTANT: Use the corrected values above verbatim in your boardSpec, assembly, and bom');
  parts.push('output fields. Only generate new content for: aiInsights, dfmIssues, highCostComponents,');
  parts.push('optimisationSuggestions, confidenceLevel, analysisLimitations, partName, and costEstimates.\n');
  return parts.join('\n');
}

// POST /api/pcb/reanalyze — skip Stages 1 & 2, run Stage 3+4 with corrected values
router.post('/reanalyze', upload.fields([
  { name: 'pcbImages', maxCount: 5 },
]), async (req, res): Promise<void> => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFiles = files?.pcbImages ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Add it in Settings or set the environment variable.' });
    return;
  }

  // Parse corrected values from body
  let correctedSpec: Record<string, unknown> | null = null;
  let correctedBOM: unknown[] | null = null;
  let correctedAssembly: Record<string, unknown> | null = null;
  let ocrMarkings: string[] = [];

  try { correctedSpec = JSON.parse(req.body?.correctedSpec as string ?? 'null') as Record<string, unknown>; } catch { /* keep null */ }
  try { correctedBOM = JSON.parse(req.body?.correctedBOM as string ?? 'null') as unknown[]; } catch { /* keep null */ }
  try { correctedAssembly = JSON.parse(req.body?.correctedAssembly as string ?? 'null') as Record<string, unknown>; } catch { /* keep null */ }
  try { ocrMarkings = JSON.parse(req.body?.ocrMarkings as string ?? '[]') as string[]; } catch { /* keep empty */ }

  const domain = (req.body?.domain as string | undefined) ?? 'general';

  let imageLabels: string[] = DEFAULT_IMAGE_LABELS;
  try {
    const raw = req.body?.pcbImageLabels as string | undefined;
    if (raw) imageLabels = JSON.parse(raw) as string[];
  } catch { /* use defaults */ }

  const multiImage = imageFiles.length > 1;

  // Build Stage 1 and OCR stubs from supplied values
  const stage1Result: Stage1Result = { domain, conf: 1.0, hints: [] };
  const ocrResult: OCRResult = {
    icMarkings: ocrMarkings,
    refDesGroups: [],
    connectors: [],
    boardText: [],
    extractionQuality: 'high',
  };

  const anthropic = new Anthropic({ apiKey });
  console.log(`[PCB/reanalyze] domain=${domain}, ${imageFiles.length} image(s), correction context provided`);

  // ── Stage 3: Specialist analysis with corrections injected ─────────────
  const specialistSystem = SPECIALIST_SYSTEM_PROMPTS[domain] ?? SPECIALIST_SYSTEM_PROMPTS['general'];
  const correctionContext = buildCorrectionContext(correctedSpec, correctedBOM, correctedAssembly);
  const basePrompt = buildUserPrompt(ocrResult, stage1Result, domain);
  const userPromptText = correctionContext + '\n' + basePrompt;

  let analysis: unknown;
  let lastRaw = '';

  try {
    // ── Attempt 1: Full analysis with correction context ─────────────────
    const contentBlocks: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'text'; text: string }> =
      imageFiles.length > 0 ? buildImageContentBlocks(imageFiles, imageLabels, multiImage) : [];

    const msg1 = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: specialistSystem,
      messages: [{
        role: 'user',
        content: [
          ...contentBlocks,
          { type: 'text', text: userPromptText },
        ],
      }],
    });

    lastRaw = msg1.content[0]?.type === 'text' ? msg1.content[0].text : '';

    try {
      analysis = JSON.parse(extractJSON(lastRaw));
    } catch (e1) {
      console.warn('[PCB/reanalyze] Attempt 1 JSON parse failed:', String(e1));

      // ── Attempt 2: JSON repair ────────────────────────────────────────
      const msg2 = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: 'You are a JSON repair assistant. Return ONLY valid JSON — nothing else. Start with { and end with }.',
        messages: [{ role: 'user', content: buildRepairPrompt(lastRaw) }],
      });

      lastRaw = msg2.content[0]?.type === 'text' ? msg2.content[0].text : '';

      try {
        analysis = JSON.parse(extractJSON(lastRaw));
      } catch (e2) {
        console.error('[PCB/reanalyze] Attempt 2 JSON repair failed:', String(e2));

        // ── Attempt 3: Minimal fallback ───────────────────────────────
        const fallbackContentBlocks: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'text'; text: string }> =
          imageFiles.length > 0 ? buildImageContentBlocks(imageFiles, imageLabels, multiImage) : [];

        const msg3 = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: specialistSystem,
          messages: [{
            role: 'user',
            content: [
              ...fallbackContentBlocks,
              { type: 'text', text: `A PCB was re-analysed with user corrections and the result should have been JSON. Return a minimal valid JSON object with these fields filled using the user corrections below, set confidenceLevel to "Low".\n\n${userPromptText}` },
            ],
          }],
        });

        lastRaw = msg3.content[0]?.type === 'text' ? msg3.content[0].text : '';

        try {
          analysis = JSON.parse(extractJSON(lastRaw));
        } catch (e3) {
          res.status(500).json({
            error: `PCB re-analysis failed after 3 attempts. Parse error: ${String(e3)}. Raw response preview: ${lastRaw.slice(0, 400)}`,
          });
          return;
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PCB/reanalyze] Anthropic API error:', msg);
    res.status(502).json({ error: `AI service error: ${msg}` });
    return;
  }

  // ── Stage 4: Country-aware cost breakdown ─────────────────────────────
  const selectedCountry = (req.body?.country as string | undefined) ?? 'cn';
  const orderQty = parseInt(req.body?.orderQty as string ?? '100', 10) || 100;

  let countryComparison: ReturnType<typeof computeAllCountryCosts> = [];
  let selectedCountryBreakdown: ReturnType<typeof computePCBCountryCost> | null = null;
  let volumeCurves: Record<string, ReturnType<typeof computeVolumeCurve>> = {};
  let complexityScore: ReturnType<typeof computeComplexityScore> | null = null;

  try {
    const a = (analysis as Record<string, unknown>);
    const boardSpec = a?.boardSpec as Record<string, unknown> ?? {};
    const assemblyData = a?.assembly as Record<string, unknown> ?? {};
    const costEst = a?.costEstimates as Record<string, unknown> ?? {};
    const pcbFabGBP = costEst?.pcbFabGBP as { mid?: number } | undefined;

    const costInput: PCBCostInput = {
      widthMm:              Number(boardSpec.widthMm)             || 100,
      heightMm:             Number(boardSpec.heightMm)            || 80,
      layers:               Number(boardSpec.estimatedLayers)     || 2,
      surfaceFinish:        String(boardSpec.surfaceFinish        || 'enig'),
      throughVias:          Number(boardSpec.throughVias)         || 50,
      blindVias:            Number(boardSpec.blindVias)           || 0,
      microVias:            Number(boardSpec.microVias)           || 0,
      hdiStructure:         String(boardSpec.hdiStructure         || 'none'),
      impedanceControlled:  Boolean(boardSpec.impedanceControlRequired),
      smtPlacements:        Number(assemblyData.smtPlacements)    || 0,
      throughHoleJoints:    Number(assemblyData.throughHoleJoints)|| 0,
      manualJoints:         Number(assemblyData.manualJoints)     || 0,
      bgaCount:             Number(assemblyData.bgaCount)         || 0,
      aoiRequired:          Boolean(assemblyData.aoiRequired),
      ictTimeSec:           Number(assemblyData.ictTimeSec)       || 0,
      conformalCoatAreaCm2: 0,
      totalBOMCostGBP:      Number(costEst?.totalBOMCostGBP)      || pcbFabGBP?.mid || 0,
      orderQuantity:        orderQty,
    };

    countryComparison = computeAllCountryCosts(costInput);
    const resolvedCountry = PCB_COUNTRY_RATES[selectedCountry] ? selectedCountry : 'cn';
    selectedCountryBreakdown = computePCBCountryCost(costInput, resolvedCountry);

    const sorted = [...countryComparison].sort((x, y) => x.totalPerBoard - y.totalPerBoard);
    const cheapestId = sorted[0]?.countryId ?? 'cn';
    const volumeQtys = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];
    volumeCurves = {
      [cheapestId]: computeVolumeCurve(costInput, cheapestId, volumeQtys),
      [resolvedCountry]: computeVolumeCurve(costInput, resolvedCountry, volumeQtys),
      gb: computeVolumeCurve(costInput, 'gb', volumeQtys),
    };

    complexityScore = computeComplexityScore(boardSpec, assemblyData);

    console.log(`[PCB/reanalyze] Stage 4: Country costs computed for ${COUNTRY_DISPLAY_ORDER.length} countries`);
  } catch (err) {
    console.warn('[PCB/reanalyze] Stage 4 country cost computation failed:', (err as Error).message);
  }

  res.json({
    success: true,
    analysis,
    selectedCountry,
    selectedCountryBreakdown,
    countryComparison,
    volumeCurves,
    complexityScore,
  });
});

// POST /api/pcb/live-pricing  — optional live component pricing
router.post('/live-pricing', async (req, res): Promise<void> => {
  const { partNumbers, provider, apiKey, qty } = req.body as {
    partNumbers?: string[];
    provider?: string;
    apiKey?: string;
    qty?: number;
  };

  if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
    res.status(400).json({ error: 'partNumbers array is required' });
    return;
  }
  // Rate limiting: max 20 part numbers per request.
  const limitedPartNumbers = partNumbers.slice(0, 20);
  if (!provider || !['octopart', 'rs', 'farnell'].includes(provider)) {
    res.status(400).json({ error: 'provider must be one of: octopart, rs, farnell' });
    return;
  }
  const resolvedApiKey = apiKey || (
    provider === 'octopart' ? process.env.OCTOPART_API_KEY :
    provider === 'rs'       ? process.env.RS_API_KEY :
    process.env.FARNELL_API_KEY
  );
  if (!resolvedApiKey) {
    res.status(400).json({ error: `No API key for provider "${provider}". Pass apiKey in body or set ${provider.toUpperCase()}_API_KEY env var.` });
    return;
  }

  try {
    const prices = await fetchLivePrices(
      limitedPartNumbers,
      provider as LivePricingProvider,
      resolvedApiKey,
      qty ?? 100,
    );
    res.json({ success: true, provider, prices, count: prices.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PCB/live-pricing] Error:', msg);
    res.status(502).json({ error: `Live pricing fetch failed: ${msg}` });
  }
});

// GET /api/pcb/countries  — returns the country rate database for the UI
router.get('/countries', (_req, res) => {
  const summary = COUNTRY_DISPLAY_ORDER.map(id => {
    const r = PCB_COUNTRY_RATES[id];
    return {
      id: r.id,
      name: r.name,
      shortName: r.shortName,
      flag: r.flag,
      region: r.region,
      qualityIndex: r.qualityIndex,
      leadTimeWeeks: r.leadTimeWeeks,
      bestFor: r.bestFor,
      certifications: r.certifications,
    };
  });
  res.json({ countries: summary });
});

// POST /api/pcb/scenario  — what-if recompute for the scenario builder (Feature 10)
router.post('/scenario', (req, res): void => {
  const b = (req.body ?? {}) as Partial<PCBCostInput> & { country?: string };
  const countryId = PCB_COUNTRY_RATES[b.country ?? ''] ? (b.country as string) : 'cn';

  const input: PCBCostInput = {
    widthMm:              Number(b.widthMm)             || 100,
    heightMm:             Number(b.heightMm)            || 80,
    layers:               Number(b.layers)              || 2,
    surfaceFinish:        String(b.surfaceFinish        || 'enig'),
    throughVias:          Number(b.throughVias)         || 0,
    blindVias:            Number(b.blindVias)           || 0,
    microVias:            Number(b.microVias)           || 0,
    hdiStructure:         String(b.hdiStructure         || 'none'),
    impedanceControlled:  Boolean(b.impedanceControlled),
    smtPlacements:        Number(b.smtPlacements)       || 0,
    throughHoleJoints:    Number(b.throughHoleJoints)   || 0,
    manualJoints:         Number(b.manualJoints)        || 0,
    bgaCount:             Number(b.bgaCount)            || 0,
    aoiRequired:          Boolean(b.aoiRequired),
    ictTimeSec:           Number(b.ictTimeSec)          || 0,
    conformalCoatAreaCm2: Number(b.conformalCoatAreaCm2) || 0,
    totalBOMCostGBP:      Number(b.totalBOMCostGBP)     || 0,
    orderQuantity:        Number(b.orderQuantity)       || 100,
  };

  try {
    const breakdown = computePCBCountryCost(input, countryId);
    res.json({ success: true, breakdown });
  } catch (err) {
    res.status(400).json({ error: `Scenario compute failed: ${(err as Error).message}` });
  }
});

export default router;
