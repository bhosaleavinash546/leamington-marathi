import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import { buildRateCorpus, groundingBlock } from '../../src/engine/rag-retrieval.js';
import { executeCalculateCost, type CostToolInput } from '../services/cost-executor.js';

const router = Router();

// ─── Anthropic tool definition: calculate_cost ───────────────────────────────

const CALCULATE_COST_TOOL: Anthropic.Tool = {
  name: 'calculate_cost',
  description: `Run the deterministic manufacturing cost engine for a part.
Returns an 8-bucket cost breakdown (rawMaterial, process, labour, tooling, packaging, logistics, overhead, margin), total cost, and DFM opportunities.
Call this whenever you need actual cost numbers. You can call it multiple times to compare scenarios or test DFM improvements.
Always call this before interpreting costs or making recommendations.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      commodity: {
        type: 'string',
        enum: [
          'machining', 'sheet_metal', 'sheet_metal_fab', 'injection_moulding',
          'blow_moulding', 'extrusion', 'thermoforming', 'rotational_moulding',
          'casting', 'forging', 'painting', 'biw_assembly', 'pcb_fab', 'pcba',
          'cast_and_machine', 'rubber', 'composites', 'wiring_harness',
        ],
      },
      params: {
        type: 'object',
        description: 'Commodity-specific parameters',
      },
      partName:         { type: 'string' },
      overheadPct:      { type: 'number', description: 'Default 0.12' },
      marginPct:        { type: 'number', description: 'Default 0.08' },
      packagingPerPart: { type: 'number', description: 'Default 0.15' },
      logisticsPerPart: { type: 'number', description: 'Default 0.25' },
    },
    required: ['commodity', 'params'],
  },
};

// ─── Robust JSON extractor ───────────────────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  if (start === -1) return { chat: text, needsInput: null, action: null, confidence: 0.5 };

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) return { chat: text, needsInput: null, action: null, confidence: 0.5 };

  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { chat: text, needsInput: null, action: null, confidence: 0.5 };
  }
}

// ─── Zod schema for agent response ───────────────────────────────────────────

const AgentActionSchema = z.object({
  type: z.literal('populate_form'),
  commodity: z.string(),
  data: z.record(z.unknown()),
}).nullable();

const AgentResponseSchema = z.object({
  chat: z.string(),
  needsInput: z.array(z.string()).nullable().optional(),
  action: AgentActionSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  insights: z.array(z.string()).optional(),
  dfcRecommendations: z.array(z.string()).optional(),
});

// ─── Valid rate library ID sets (built once at module load) ───────────────────

// RAG grounding corpus — built once from the rate library so the agent answers
// from real rates (with citable [kind:id] tags), not parametric memory.
const _ragCorpus = buildRateCorpus(DEFAULT_RATE_LIBRARY);

const VALID_MATERIAL_IDS = new Set(DEFAULT_RATE_LIBRARY.materials.map(m => m.id));
const VALID_MACHINE_IDS  = new Set(DEFAULT_RATE_LIBRARY.machines.map(m => m.id));
const VALID_LABOUR_IDS   = new Set(DEFAULT_RATE_LIBRARY.labour.map(l => l.id));

const ID_FIELDS = {
  materialId: VALID_MATERIAL_IDS,
  machineId:  VALID_MACHINE_IDS,
  labourId:   VALID_LABOUR_IDS,
  cureMachineId:  VALID_MACHINE_IDS,
  cureLabourId:   VALID_LABOUR_IDS,
  layupLabourId:  VALID_LABOUR_IDS,
  trimMachineId:  VALID_MACHINE_IDS,
  trimLabourId:   VALID_LABOUR_IDS,
  testMachineId:  VALID_MACHINE_IDS,
  testLabourId:   VALID_LABOUR_IDS,
  forgeId:    VALID_MACHINE_IDS,
};

function validateAgentResponse(raw: Record<string, unknown>): {
  response: Record<string, unknown>;
  idWarnings: string[];
} {
  const idWarnings: string[] = [];

  // Schema validation
  const parsed = AgentResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[agent] Response failed schema validation:', parsed.error.issues.map(i => i.message).join('; '));
    return {
      response: { chat: typeof raw.chat === 'string' ? raw.chat : 'I had trouble formatting my response. Please try again.', needsInput: null, action: null, confidence: 0.5 },
      idWarnings: [],
    };
  }

  const response = parsed.data as Record<string, unknown>;

  // Validate IDs in action.data against rate library
  const actionData = (response.action as { data?: Record<string, unknown> } | null | undefined)?.data;
  if (actionData && typeof actionData === 'object') {
    for (const [field, validSet] of Object.entries(ID_FIELDS)) {
      const val = actionData[field];
      if (typeof val === 'string' && val && !validSet.has(val)) {
        idWarnings.push(`"${field}": "${val}" is not in the rate library`);
        // Null out invalid ID so the form doesn't silently use a non-existent rate
        actionData[field] = null;
      }
    }

    if (idWarnings.length > 0) {
      const listStr = idWarnings.join('; ');
      console.warn(`[agent] Unknown rate library IDs in response: ${listStr}`);
      // Append warning to chat so user knows what happened
      response.chat = (response.chat as string) +
        `\n\n⚠️ Note: Some suggested IDs were not found in the current rate library (${listStr}). ` +
        `Those fields have been cleared — please select them manually from the dropdowns.`;
      response.confidence = Math.min((response.confidence as number ?? 0.8) - 0.15, 0.7);
    }
  }

  return { response, idWarnings };
}

// ─── Circuit breaker: 30-second timeout on Anthropic API calls ───────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Agent request timed out after ${ms / 1000}s`)), ms)),
  ]);
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Unified Should-Cost Orchestrator AI Agent for an advanced manufacturing cost estimation platform.

## Primary Objective
Provide accurate, transparent, engineering-grade should-cost estimates for manufactured parts across all commodities using structured reasoning, geometry analysis, cost-driver extraction, and Design-for-Cost (DFM/DFC) recommendations.

## Supported Commodities (18 total)
machining, sheet_metal, sheet_metal_fab, injection_moulding, blow_moulding, extrusion, thermoforming, rotational_moulding, casting, forging, painting, biw_assembly, pcb_fab, pcba, cast_and_machine, rubber, composites, wiring_harness

## Manufacturing Regions (20)
UK, DE, FR, IT, ES, PL, CZ, RO, HU, SE, NL, TR, CN, IN, MX, US, TH, VN, BR, KR

### Regional Cost Index (UK = 100 baseline)
| Region | Labour Factor | Machine Factor | Typical Use |
|--------|-------------|----------------|-------------|
| UK     | 1.00 | 1.00 | Baseline |
| DE     | 1.58 | 1.05 | Precision engineering |
| US     | 1.05 | 1.02 | North America |
| PL     | 0.46 | 0.72 | EU nearshore |
| CZ     | 0.44 | 0.70 | EU nearshore |
| CN     | 0.18 | 0.52 | High-volume |
| IN     | 0.12 | 0.50 | High-volume machining |
| MX     | 0.22 | 0.60 | North America nearshore |
| VN     | 0.10 | 0.52 | Lowest cost |
| TH     | 0.18 | 0.58 | SE Asia |
| BR     | 0.28 | 0.68 | South America |
| KR     | 0.65 | 0.80 | Electronics/precision |
| TR     | 0.32 | 0.65 | EU proximity |

When a user specifies a manufacturing region, factor in lower labour/machine rates and adjust DFM recommendations accordingly.

## Input Handling Rules
1. Validate commodity from description or photo — report your confidence (0.0–1.0).
2. If no photo/CAD, proceed from text description but note assumptions.
3. Ask for missing critical inputs: material, annual volume, region, key dimensions.
4. Infer geometry from photo or description to estimate cycle times and complexity.
5. Select the correct internal cost model and manufacturing route.
6. NEVER invent material prices or machine rates — use the parameter IDs below.

## Verified Material IDs

### Machining / Forging Metals
mat-al6061, mat-al7075 (use mat-al6061 as proxy), mat-steel1045, mat-steel4140, mat-steel4340, mat-ss316l, mat-ti6al4v

### Sheet Metal
mat-dc01, mat-dc01-gi, mat-dc03-ga, mat-dp600, mat-hsla340, mat-22mnb5, mat-aa5182, mat-aa5052, mat-aa5083, mat-aa6082-sheet, mat-ss304-sheet, mat-ss316-sheet, mat-dc01-ze, mat-aisi430, mat-hsla420

### Forging Billets
mat-steel1020, mat-steel4340, mat-al6061

### Thermoplastics (Injection / Blow / Extrusion / Thermoform)
mat-pp, mat-pp-homo, mat-pp-impact, mat-abs, mat-pa6, mat-pa6-gf30, mat-pa66, mat-pa66gf30, mat-pc, mat-pc-abs, mat-hdpe, mat-ldpe, mat-lldpe, mat-pom, mat-pbt-gf30, mat-tpu-shore85, mat-pet-bg, mat-pet-gf30, mat-upvc, mat-fpvc, mat-gpps, mat-hips, mat-peek, mat-peek-gf30

### Casting Alloys
mat-adc12, mat-a380, mat-lm25, mat-gjl250, mat-gjl350, mat-gjs400, mat-gjs600, mat-bronze-c905, mat-mag-az91, mat-ss304-cast, mat-zamak3, mat-zamak5, mat-alsi10mg, mat-a365, mat-adc12-secondary

### Paint / Coating
mat-paint-ecoat, mat-paint-primer, mat-paint-basecoat, mat-paint-clearcoat, mat-paint-powder

### Rubber / Elastomers
mat-epdm, mat-nbr, mat-silicone-hcr, mat-lsr, mat-nr, mat-viton-fkm

### Composites
mat-cfrp-prepreg-t700, mat-gfrp-prepreg-e, mat-cf-dry-3k, mat-gf-dry-e, mat-epoxy-infusion, mat-vinylester-rtm, mat-aramid-k49

### PCB / PCBA
mat-virtual (use for directCost-based modules: painting, BIW, PCB, PCBA, wiring harness, composites)

## Verified Machine IDs

### CNC Machining
mach-lathe-cnc (£8.75/hr), mach-vmc3 (£15.25/hr), mach-vmc5 (£35.40/hr), mach-drill (£5.35/hr), mach-grind (£20.50/hr)
mach-haas-vf2 (£45/hr 3-axis), mach-dmg-dmu50 (£95/hr 5-axis), mach-haas-umc500 (£75/hr 5-axis), mach-mazak-qt200 (£50/hr turning)

### Sheet Metal Presses (Stamping)
press-100t (£16/hr), press-200t (£24/hr), press-400t (£42/hr), press-630t (£65/hr)
press-schuler-400t (£150/hr), press-aida-200t (£120/hr)

### Sheet Metal Fab
laser-trumpf-3030 (£85/hr), laser-bystronic-3015 (£70/hr)
punch-amada-emz3610 (£65/hr), punch-trumpf-5000 (£75/hr)
brake-amada-hfe100 (£55/hr), brake-trumpf-5230 (£70/hr)
robot-spotweld-kuka (£90/hr), mig-welder-manual (£7/hr), tig-welder-manual (£9/hr)
rollform-dimeco-20st (£110/hr)

### Injection Moulding
imm-100t, imm-200t, imm-400t, imm-800t

### Blow Moulding
blow-ebm-100l (up to 5L), blow-ebm-500l (5–100L tanks)

### Extrusion
extruder-75mm (75mm SSE), extruder-150mm (150mm TSE)

### Thermoforming
thermoform-small, thermoform-large

### Rotational Moulding
rotomould-biaxial (3-arm carousel)

### Plastic Joining
ultrasonic-welder, hot-plate-welder, vibration-welder

### Casting
hpdc-160t (zinc/small Al), hpdc-500t, hpdc-800t, hpdc-1600t
sand-cast-line, grav-die-cast-std, invest-cast-furnace
heat-treat-furnace

### Forging
forge-press-500t (500T press), forge-hammer-5t (5T pneumatic hammer)

### Paint / BIW / Assembly
paint-line-std, robot-weld-station, bench-assembly

### PCB / PCBA
smt-line (£43/hr), smt-high-speed-line (£150/hr), laser-drill-75um (£120/hr), xray-bga-inspection (£90/hr), ict-automotive (£110/hr)

### Rubber
compression-mould-std, transfer-mould-std, lsr-injection-machine, cure-oven-rubber, extruder-rubber-60mm

### Composites
autoclave-1200mm, oven-composite-cure, rtm-press-std, waterjet-5ax-composite

### Harness
bench-assembly, harness-test-sys

## Verified Labour IDs
lab-uk-skilled (£24/hr), lab-uk-semiskilled (£18.50/hr), lab-uk-engineer (£40/hr)
lab-uk-foundry (£17/hr), lab-uk-inspector (£26/hr), lab-uk-electronics (£16.50/hr)
lab-de-skilled (£38/hr), lab-pl-skilled (£11/hr), lab-in-skilled (£4.80/hr)
lab-cn-skilled (£7.50/hr), lab-mx-skilled (£7/hr)

## Response Format — ALWAYS return valid JSON

{
  "chat": "<Engineering-grade markdown response. Technical, concise. Include routing table or DFM bullets where relevant.>",
  "needsInput": null | ["annual_volume", "material", "wall_thickness", ...],
  "confidence": 0.0–1.0,
  "action": null | {
    "type": "populate_form",
    "commodity": "<commodity string>",
    "partName": "<inferred or given part name>",
    "params": { <commodity-specific parameters — see schemas below> }
  }
}

Set action to null when: more information is needed, user provides cost results for interpretation, or request is conversational.
Set confidence to reflect your certainty about commodity classification and parameter estimates (0.9+ = very certain, 0.6–0.9 = reasonable estimate, <0.6 = low confidence — flag key assumptions).

## Commodity Parameter Schemas

### machining
{
  "materialId": "mat-al6061",
  "netWeightKg": 0.45,
  "stockWeightKg": 0.82,
  "materialUtilization": 0.55,
  "toleranceMm": 0.05,
  "rejectRate": 0.02,
  "operations": [
    {
      "name": "Face Mill + Pocket",
      "type": "milling_3ax",
      "machineId": "mach-vmc3",
      "labourId": "lab-uk-skilled",
      "cycleTimeHr": 0.10,
      "partsPerCycle": 1,
      "oee": 0.85,
      "manning": 1,
      "labourTimeHr": 0.10,
      "labourEfficiency": 0.92
    }
  ],
  "setup": {
    "setupTimeHr": 0.5,
    "batchSize": 50,
    "machineId": "mach-vmc3",
    "labourId": "lab-uk-skilled"
  },
  "programmingNRE": 800,
  "toolingCost": 600,
  "amortizationVolume": 10000
}

### sheet_metal (progressive / transfer die stamping)
{
  "materialId": "mat-dc01",
  "partWeightKg": 0.35,
  "materialUtilization": 0.72,
  "machineId": "press-400t",
  "labourId": "lab-uk-semiskilled",
  "cycleTimeHr": 0.00028,
  "partsPerCycle": 1,
  "oee": 0.85,
  "manning": 1,
  "labourTimeHr": 0.00028,
  "labourEfficiency": 0.90,
  "rejectRate": 0.02,
  "dieCost": 35000,
  "dieLife": 500000,
  "amortizationVolume": 100000
}

### sheet_metal_fab (laser/punch + press brake bending)
{
  "materialId": "mat-dc01",
  "partWeightKg": 0.35,
  "materialUtilization": 0.72,
  "blankingMethod": "laser",
  "blankingMachineId": "laser-trumpf-3030",
  "blankingLabourId": "lab-uk-semiskilled",
  "blankingCycleTimeSec": 45,
  "assistGas": "nitrogen",
  "bendCount": 4,
  "timePerBendSec": 20,
  "toolChangeCount": 2,
  "toolChangeTimeSec": 60,
  "bendMachineId": "brake-amada-hfe100",
  "bendLabourId": "lab-uk-semiskilled",
  "oee": 0.85,
  "manning": 1,
  "labourEfficiency": 0.90,
  "toleranceMm": 0.5,
  "rejectRate": 0.02,
  "toolingCost": 500,
  "amortizationVolume": 10000
}

### injection_moulding
{
  "materialId": "mat-pp",
  "partWeightKg": 0.08,
  "runnerWeightKg": 0.015,
  "regrindFraction": 0.80,
  "runnerSystem": "cold",
  "cavities": 4,
  "projectedAreaCm2": 48,
  "cavityPressureMPa": 30,
  "wallThicknessMm": 2.5,
  "coolTimeFactorSPerMm2": 3.16,
  "fillTimeSec": 2,
  "packTimeSec": 5,
  "ejectTimeSec": 4,
  "machineId": "imm-200t",
  "labourId": "lab-uk-semiskilled",
  "oee": 0.85,
  "manning": 1,
  "labourEfficiency": 0.90,
  "mouldCost": 12000,
  "mouldLife": 500000,
  "amortizationVolume": 50000,
  "toleranceMm": 0.2,
  "surfaceFinishGrade": "standard",
  "rejectRate": 0.02
}

### blow_moulding
{
  "materialId": "mat-hdpe",
  "partWeightKg": 0.15,
  "flashWeightKg": 0.03,
  "wallThicknessMm": 2.0,
  "coolTimeFactorSPerMm2": 3.5,
  "blowTimeSec": 8,
  "openCloseSec": 5,
  "parisonExtrusionTimeSec": 6,
  "machineId": "blow-ebm-100l",
  "labourId": "lab-uk-semiskilled",
  "cavities": 1,
  "oee": 0.82,
  "manning": 1,
  "labourEfficiency": 0.90,
  "mouldCost": 8000,
  "mouldLife": 200000,
  "amortizationVolume": 20000,
  "rejectRate": 0.03
}

### extrusion
{
  "materialId": "mat-upvc",
  "profileWeightKgPerM": 0.42,
  "partLengthM": 2.4,
  "lineRateKgPerHr": 180,
  "extruderId": "extruder-75mm",
  "labourId": "lab-uk-semiskilled",
  "oee": 0.82,
  "manning": 1,
  "labourEfficiency": 0.90,
  "startupScrapFraction": 0.04,
  "dieCost": 2800,
  "amortizationVolume": 50000
}

### thermoforming
{
  "materialId": "mat-hips",
  "sheetWeightKg": 2.8,
  "partsPerSheet": 6,
  "partWeightKg": 0.38,
  "method": "vacuum",
  "machineId": "thermoform-large",
  "labourId": "lab-uk-semiskilled",
  "heatTimeSec": 35,
  "formTimeSec": 12,
  "trimTimeSec": 28,
  "indexTimeSec": 15,
  "oee": 0.80,
  "manning": 1,
  "labourEfficiency": 0.90,
  "toolCost": 4500,
  "amortizationVolume": 30000,
  "rejectRate": 0.03
}

### rotational_moulding
{
  "materialId": "mat-lldpe",
  "partWeightKg": 4.5,
  "powderCostAdderPerKg": 0.25,
  "numArms": 3,
  "partsPerArm": 1,
  "heatingTimeSec": 1200,
  "coolingTimeSec": 1500,
  "loadUnloadTimeSec": 240,
  "machineId": "rotomould-biaxial",
  "labourId": "lab-uk-semiskilled",
  "oee": 0.75,
  "manning": 2,
  "labourEfficiency": 0.88,
  "mouldCost": 6000,
  "mouldLife": 80000,
  "amortizationVolume": 5000
}

### casting (ALL 4 subtypes)

#### HPDC
{
  "subtype": "hpdc",
  "materialId": "mat-adc12",
  "partWeightKg": 1.40,
  "castingYield": 0.72,
  "rejectRate": 0.04,
  "labourId": "lab-uk-foundry",
  "oee": 0.80,
  "manning": 1,
  "labourEfficiency": 0.88,
  "amortizationVolume": 50000,
  "hpdc": {
    "machineId": "hpdc-500t",
    "cycleTimeSec": 45,
    "cavities": 1,
    "dieCost": 45000,
    "dieLife": 100000
  }
}

#### Sand Casting
{
  "subtype": "sand",
  "materialId": "mat-gjl250",
  "partWeightKg": 8.50,
  "castingYield": 0.68,
  "rejectRate": 0.06,
  "labourId": "lab-uk-foundry",
  "oee": 0.75,
  "manning": 2,
  "labourEfficiency": 0.85,
  "amortizationVolume": 5000,
  "sand": {
    "mouldLineId": "sand-cast-line",
    "cycleTimeHr": 0.25,
    "patternCost": 8000,
    "patternLife": 20000,
    "coreCostPerPart": 0.85
  }
}

#### Gravity Die
{
  "subtype": "gravity",
  "materialId": "mat-lm25",
  "partWeightKg": 2.20,
  "castingYield": 0.82,
  "rejectRate": 0.03,
  "labourId": "lab-uk-foundry",
  "oee": 0.78,
  "manning": 1,
  "labourEfficiency": 0.88,
  "amortizationVolume": 10000,
  "gravity": {
    "machineId": "grav-die-cast-std",
    "cycleTimeHr": 0.10,
    "mouldCost": 12000,
    "mouldLife": 30000
  }
}

#### Investment Casting
{
  "subtype": "investment",
  "materialId": "mat-ss304-cast",
  "partWeightKg": 0.45,
  "castingYield": 0.88,
  "rejectRate": 0.04,
  "labourId": "lab-uk-foundry",
  "oee": 0.80,
  "manning": 2,
  "labourEfficiency": 0.90,
  "amortizationVolume": 5000,
  "investment": {
    "waxCostPerPart": 0.35,
    "shellBuildCostPerPart": 1.20,
    "pourLabourId": "lab-uk-foundry",
    "pourCycleHr": 0.05,
    "pourMachineId": "invest-cast-furnace",
    "waxDieCost": 8000
  }
}

### forging — CRITICAL: use EXACT field names below
{
  "materialId": "mat-steel1020",
  "partWeightKg": 1.80,
  "flashAndScaleKg": 0.45,
  "yieldFraction": 0.92,
  "forgeId": "forge-press-500t",
  "labourId": "lab-uk-skilled",
  "strokesToForm": 3,
  "cycleTimeHr": 0.008,
  "oee": 0.80,
  "manning": 2,
  "labourEfficiency": 0.92,
  "heatingEnergyKwhPerKg": 0.40,
  "dieLife": 50000,
  "dieCost": 60000,
  "amortizationVolume": 100000,
  "rejectFraction": 0.02,
  "heatTreatCostPerKg": 0.65
}

### painting
{
  "surfaceAreaM2": 0.80,
  "coats": [
    {
      "coatType": "e_coat",
      "materialId": "mat-paint-ecoat",
      "dftMicrons": 20,
      "solidsPct": 0.20,
      "transferEfficiency": 0.95,
      "paintDensityKgPerL": 1.30,
      "pricePerL": 4.55
    },
    {
      "coatType": "basecoat",
      "materialId": "mat-paint-basecoat",
      "dftMicrons": 15,
      "solidsPct": 0.35,
      "transferEfficiency": 0.70,
      "paintDensityKgPerL": 1.25,
      "pricePerL": 10.25
    },
    {
      "coatType": "clearcoat",
      "materialId": "mat-paint-clearcoat",
      "dftMicrons": 45,
      "solidsPct": 0.55,
      "transferEfficiency": 0.80,
      "paintDensityKgPerL": 1.10,
      "pricePerL": 14.00
    }
  ],
  "lineId": "paint-line-std",
  "labourId": "lab-uk-semiskilled",
  "lineRatePartsPerHr": 60,
  "oee": 0.82,
  "manning": 4,
  "labourEfficiency": 0.90,
  "rejectReworkPct": 0.03,
  "toolingCost": 5000,
  "amortizationVolume": 100000
}

### biw_assembly
{
  "subPartTotalCost": 45.00,
  "joining": [
    { "type": "spot_weld", "count": 120, "costPerJoint": 0.05 },
    { "type": "adhesive_m", "count": 0.8, "costPerJoint": 1.20 }
  ],
  "stations": [
    {
      "stationName": "Framing Station",
      "machineId": "robot-weld-station",
      "labourId": "lab-uk-skilled",
      "cycleTimeHr": 0.0167,
      "oee": 0.85,
      "manning": 1,
      "labourEfficiency": 0.92
    }
  ],
  "fixturingToolingCost": 80000,
  "amortizationVolume": 50000
}

### pcb_fab
{
  "layers": 4,
  "boardAreaCm2": 50,
  "panelUtilization": 0.72,
  "panelAreaCm2": 3000,
  "technology": "FR4_STD",
  "qualityGrade": "industrial",
  "baseMaterialTg": 130,
  "copperWeightOz": 1,
  "viaCount": 200,
  "microViaCount": 0,
  "surfaceFinish": "enig",
  "minTraceSpaceMm": 0.15,
  "fabYield": 0.96,
  "testablePct": 0.5,
  "nreCost": 800,
  "basePanelPriceGBP": 18,
  "amortizationVolume": 10000
}

PCB technology values: FR4_STD, FR4_HTg, HDI_RIGID, RIGID_FLEX, FLEX, RF_MICRO, MCPCB, CERAMIC
Quality grades: consumer, industrial, auto_grade2, auto_grade1, aerospace

### pcba
{
  "boardAreaCm2": 50,
  "qualityGrade": "industrial",
  "assemblyComplexity": "medium",
  "components": [
    { "type": "passive_0402",  "count": 120, "costEach": 0.002 },
    { "type": "sot_sop",       "count": 24,  "costEach": 0.08  },
    { "type": "qfn_dfn",      "count": 4,   "costEach": 0.35  },
    { "type": "tht_standard",  "count": 8,   "costEach": 0.12  }
  ],
  "smtLines": 1,
  "dualSided": false,
  "xrayBGA": false,
  "ictTest": true,
  "functionalTest": true,
  "conformalCoating": false,
  "reworkBudgetPct": 0.03,
  "nreStencil": 280,
  "nreIctFixture": 1800,
  "nreProgramming": 400,
  "amortizationVolume": 5000,
  "labourId": "lab-uk-electronics",
  "machineId": "smt-line"
}

Component types: passive_0402, passive_0201, passive_0603, sot_sop, qfn_dfn, bga, tht_standard, tht_relay, manual_solder
Assembly complexity: low, medium, high, very_high
Quality grades: consumer, industrial, auto_grade2, auto_grade1, aerospace

### cast_and_machine
{
  "castingSubtype": "hpdc",
  "materialId": "mat-adc12",
  "castPartWeightKg": 2.20,
  "finishedWeightKg": 1.95,
  "castingYield": 0.72,
  "rejectRate": 0.04,
  "castingLabourId": "lab-uk-foundry",
  "castingOee": 0.80,
  "castingManning": 1,
  "castingLabourEfficiency": 0.88,
  "hpdc": {
    "machineId": "hpdc-500t",
    "cycleTimeSec": 45,
    "cavities": 1,
    "dieCost": 55000,
    "dieLife": 100000
  },
  "geometryComplexity": 3,
  "machiningOps": [
    {
      "name": "Face Mill Datum",
      "type": "milling_3ax",
      "machineId": "mach-vmc3",
      "labourId": "lab-uk-skilled",
      "cycleTimeHr": 0.05,
      "partsPerCycle": 1,
      "oee": 0.85,
      "manning": 1,
      "labourTimeHr": 0.05,
      "labourEfficiency": 0.92
    }
  ],
  "machiningSetup": {
    "setupTimeHr": 0.5,
    "batchSize": 50,
    "machineId": "mach-vmc3",
    "labourId": "lab-uk-skilled"
  },
  "machiningToolingCost": 2500,
  "machiningProgrammingNRE": 800,
  "amortizationVolume": 50000,
  "heatTreatmentCostPerKg": 0.65,
  "shotBlastCostPerPart": 0.25,
  "deburringCostPerPart": 0.15
}

### rubber
{
  "materialId": "mat-epdm",
  "partWeightKg": 0.050,
  "flashAndRunnerWeightKg": 0.010,
  "process": "compression_mould",
  "machineId": "compression-mould-std",
  "labourId": "lab-uk-semiskilled",
  "cycleTimeSec": 120,
  "cavities": 4,
  "oee": 0.80,
  "manning": 1,
  "labourEfficiency": 0.90,
  "rejectRate": 0.03,
  "mouldCost": 5000,
  "mouldLife": 200000,
  "amortizationVolume": 50000
}

Rubber processes: extrusion_vulcanise, compression_mould, transfer_mould, injection_mould_lsr, calendering
Rubber machines: compression-mould-std, transfer-mould-std, lsr-injection-machine, cure-oven-rubber (optional second op), extruder-rubber-60mm
Rubber materials: mat-epdm, mat-nbr, mat-silicone-hcr, mat-lsr, mat-nr, mat-viton-fkm
Optional fields: cureTimeSec (>0 adds cure oven op), cureOvenMachineId, bondingPrimerCostPerPart

### composites
{
  "fibrePricePerKg": 32.00,
  "resinPricePerKg": 0,
  "fibreWeightFraction": 0.60,
  "partWeightKg": 1.80,
  "wasteFraction": 0.20,
  "process": "prepreg_layup",
  "areaM2": 0.65,
  "plies": 8,
  "layupLabourId": "lab-uk-skilled",
  "layupTimeHrPerPart": 3.5,
  "oee": 0.78,
  "manning": 2,
  "labourEfficiency": 0.90,
  "cureMachineId": "autoclave-1200mm",
  "cureLabourId": "lab-uk-skilled",
  "cureTimeHr": 4.0,
  "partsPerCureCycle": 4,
  "trimMachineId": "waterjet-5ax-composite",
  "trimLabourId": "lab-uk-semiskilled",
  "trimTimeHr": 0.50,
  "ndiCostPerPart": 25.00,
  "rejectRate": 0.04,
  "toolingCost": 18000,
  "toolingLife": 400,
  "amortizationVolume": 2000
}

Composite processes: hand_layup, prepreg_layup, rtm, vartm, filament_winding, pultrusion
Cure types: autoclave-1200mm (autoclave), oven-composite-cure (oven), rtm-press-std (press/RTM)

### wiring_harness
{
  "wires": [
    { "crossSectionMm2": 0.5,  "lengthM": 3.2, "pricePerM": 0.10 },
    { "crossSectionMm2": 1.5,  "lengthM": 1.4, "pricePerM": 0.18 },
    { "crossSectionMm2": 4.0,  "lengthM": 0.6, "pricePerM": 0.40 }
  ],
  "connectors": [
    { "count": 4, "costEach": 1.20, "circuitsPerConnector": 6, "terminationTimeSec": 10 },
    { "count": 2, "costEach": 2.80, "circuitsPerConnector": 12, "terminationTimeSec": 10 }
  ],
  "spliceCount": 6,
  "spliceCostEach": 0.08,
  "conduitLengthM": 2.0,
  "conduitCostPerM": 0.35,
  "tapeMetres": 5.0,
  "tapeCostPerM": 0.12,
  "labourId": "lab-uk-semiskilled",
  "assemblyTimeHr": 0.45,
  "oee": 0.85,
  "manning": 1,
  "labourEfficiency": 0.90,
  "testMachineId": "harness-test-sys",
  "testLabourId": "lab-uk-semiskilled",
  "testTimeHr": 0.05,
  "rejectRate": 0.02,
  "boardingBoardCost": 800,
  "boardingBoardLife": 20000,
  "amortizationVolume": 10000
}

## When Cost Results Are Provided
When the user message contains [Cost Engine Result: ...], interpret as follows:
1. **Summary**: Is this cost reasonable? Benchmark against industry norms for the commodity and volume.
2. **Key Cost Drivers**: Which of the 8 buckets dominate, and why? Use specific £ values.
3. **DFM/DFC Recommendations**: Top 3 concrete actions to reduce cost (cite specific buckets and expected savings %).
4. **Regional What-If**: If manufacturing in [region], estimate the cost delta — quantify using regional labour and machine multipliers.
5. **What-If Scenarios**: 2–3 parameter changes with estimated impact.
6. **Confidence Assessment**: Flag assumptions and their impact.

## Routing Table Format
| Step | Operation | Machine | Est. Cycle Time |
|------|-----------|---------|-----------------|
| 1 | Face Mill Datum | VMC 3-axis | 8 min |
| 2 | Pocket Rough | VMC 3-axis | 12 min |
| **Total** | | | **20 min** |

Always be technically precise. Never invent material prices or machine rates.`;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface AgentRequest {
  message: string;
  photoBase64?: string;
  photoMime?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  costResult?: Record<string, unknown>;
  region?: string;
}

// ─── Helper: build messages array ────────────────────────────────────────────

function buildMessages(
  message: string,
  photoBase64: string | undefined,
  photoMime: string | undefined,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  costResult: Record<string, unknown> | undefined,
  region: string | undefined,
): Anthropic.MessageParam[] {
  const visionMimes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

  let msgText = message;
  if (region && region !== 'UK') {
    msgText = `[Manufacturing Region: ${region}]\n${msgText}`;
  }
  if (costResult) {
    msgText = `${msgText}\n\n[Cost Engine Result: ${JSON.stringify(costResult, null, 2)}]`;
  }
  // RAG grounding: retrieve the most relevant rates for this query and prepend them
  // so the model quotes real library figures (and cites the [kind:id] tag).
  try {
    const grounding = groundingBlock(message, _ragCorpus, 6);
    if (grounding) msgText = `${grounding}\n\n${msgText}`;
  } catch { /* grounding is best-effort */ }

  const userContent: Anthropic.MessageParam['content'] =
    photoBase64 && photoMime && visionMimes.has(photoMime)
      ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: photoMime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: photoBase64,
            },
          },
          { type: 'text', text: msgText },
        ]
      : msgText;

  return [
    ...history.map(h => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
    { role: 'user', content: userContent },
  ];
}

// ─── Route: standard (full response) — agentic loop with tool_use ────────────

router.post('/chat', async (req, res): Promise<void> => {
  const { message, photoBase64, photoMime, history = [], costResult, region } = req.body as AgentRequest;

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured.' });
    return;
  }

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = buildMessages(
    message, photoBase64, photoMime, history, costResult, region,
  );

  try {
    let finalResponse: Record<string, unknown> | null = null;
    const MAX_ITER = 5;

    for (let i = 0; i < MAX_ITER; i++) {
      const apiResp = await withTimeout(
        anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          tools: [CALCULATE_COST_TOOL],
          tool_choice: { type: 'auto' },
          system: SYSTEM_PROMPT,
          messages,
        }),
        45_000,
      );

      if (apiResp.stop_reason === 'tool_use') {
        // Append assistant message with tool_use blocks to the conversation
        messages.push({ role: 'assistant', content: apiResp.content });

        // Execute each tool call and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of apiResp.content) {
          if (block.type === 'tool_use' && block.name === 'calculate_cost') {
            const toolResult = executeCalculateCost(block.input as CostToolInput);
            console.log(
              `[agent] tool_use calculate_cost → commodity=${(block.input as CostToolInput).commodity}`,
              `success=${toolResult.success} total=${toolResult.total}`,
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(toolResult),
            });
          }
        }

        // Feed results back so the model can continue
        messages.push({ role: 'user', content: toolResults });
      } else {
        // end_turn — extract the final text response
        const textBlock = apiResp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
        const rawText = textBlock?.text ?? '{}';
        const { response: validated } = validateAgentResponse(extractJSON(rawText));
        finalResponse = validated;
        break;
      }
    }

    if (!finalResponse) {
      finalResponse = { chat: 'Max tool iterations reached without a final response.', action: null };
    }

    res.json({ success: true, response: finalResponse });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('timed out');
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? 'The AI agent is taking too long to respond. Please try again.'
        : `Agent error: ${msg}`,
    });
  }
});

// ─── Route: streaming (SSE) — hybrid: non-streaming tool iterations, streaming final response ───

router.post('/chat/stream', async (req, res): Promise<void> => {
  const { message, photoBase64, photoMime, history = [], costResult, region } = req.body as AgentRequest;

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = buildMessages(
    message, photoBase64, photoMime, history, costResult, region,
  );

  try {
    // Phase 1: Run tool iterations non-streaming until end_turn or max iterations
    const MAX_ITER = 5;
    let needsFinalStream = true;

    for (let i = 0; i < MAX_ITER; i++) {
      const apiResp = await withTimeout(
        anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          tools: [CALCULATE_COST_TOOL],
          tool_choice: { type: 'auto' },
          system: SYSTEM_PROMPT,
          messages,
        }),
        45_000,
      );

      if (apiResp.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: apiResp.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of apiResp.content) {
          if (block.type === 'tool_use' && block.name === 'calculate_cost') {
            const toolResult = executeCalculateCost(block.input as CostToolInput);
            console.log(
              `[agent/stream] tool_use calculate_cost → commodity=${(block.input as CostToolInput).commodity}`,
              `success=${toolResult.success} total=${toolResult.total}`,
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(toolResult),
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      } else {
        // end_turn without tool_use — we have a text response already; stream it
        const textBlock = apiResp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
        const rawText = textBlock?.text ?? '{}';

        // Emit the final text as a single delta so clients see it
        if (rawText) {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: rawText })}\n\n`);
        }

        const { response: validated, idWarnings } = validateAgentResponse(extractJSON(rawText));
        res.write(`data: ${JSON.stringify({ type: 'done', response: validated, idWarnings })}\n\n`);
        res.end();
        needsFinalStream = false;
        break;
      }
    }

    // Phase 2: If we exhausted tool iterations without end_turn, stream one final generation
    if (needsFinalStream) {
      // Ask the model for a final answer with no tools (force text response)
      let fullText = '';

      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const delta = event.delta.text;
          fullText += delta;
          res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
        }
      }

      const { response: validated, idWarnings } = validateAgentResponse(extractJSON(fullText));
      res.write(`data: ${JSON.stringify({ type: 'done', response: validated, idWarnings })}\n\n`);
      res.end();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
    res.end();
  }
});

export default router;
