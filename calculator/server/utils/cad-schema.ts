/**
 * JSON schema for the CAD-to-Cost Stage-2 analysis — used with the API's
 * structured outputs (`output_config.format`), which grammar-constrains the
 * response to this shape. Replaces the old "ask nicely for JSON + regex
 * extraction + repair retry" pattern: the response is guaranteed to parse
 * and to contain exactly these fields.
 *
 * Strict-mode rules: every object has `additionalProperties: false`; no
 * numeric min/max constraints; dynamic-key maps are not expressible — so
 * `fieldConfidences` is an array of {fieldId, confidence} pairs here and the
 * route converts it back to the Record shape the client expects.
 */

const severity3 = { type: 'string', enum: ['High', 'Medium', 'Low'] } as const;
const num = { type: 'number' } as const;
const str = { type: 'string' } as const;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const arr = (items: unknown) => ({ type: 'array', items });

// Per-commodity cost-input sub-objects (all optional — the model emits the
// primary commodity's block plus the four always-present ones).
const castingSub = obj({
  subtype: { type: 'string', enum: ['hpdc', 'sand', 'gravity', 'investment'] },
  dieMouldCostGBP: num, dieMouldLife: num, cavities: num, yieldFraction: num,
  cycleTimeHpdcSec: num, cycleTimeSandGravHr: num,
}, ['subtype']);

const CAD_COST_INPUTS = obj({
  recommendedCommodity: str,
  netWeightKg: num,
  materialId: str,
  estimatedCycleTimeHr: num,
  estimatedSetupTimeHr: num,
  estimatedOperations: arr(obj({
    name: str, machineId: str, cycleTimeHr: num, labourId: str,
    oee: num, manning: num, labourEfficiency: num,
  }, ['name', 'machineId', 'cycleTimeHr'])),
  casting: castingSub,
  forging: obj({ flashKg: num, yieldFraction: num, dieCostGBP: num, dieLife: num, strokes: num, timePerBlowSec: num }),
  sheetMetal: obj({ thicknessMm: num, blankLengthMm: num, blankWidthMm: num, dieCostGBP: num, dieLife: num, numOps: num }),
  injectionMoulding: obj({ cavities: num, projectedAreaCm2: num, wallThicknessMm: num, mouldCostGBP: num, mouldLife: num, runnerWeightKg: num }),
  blowMoulding: obj({
    subtype: { type: 'string', enum: ['ebm', 'ibm', 'sbm'] },
    wallThicknessMm: num, flashWeightKg: num, cavities: num, mouldCostGBP: num, mouldLife: num, blowTimeSec: num, openCloseSec: num,
    barrierMultilayer: { type: 'boolean' },
  }),
  thermoforming: obj({
    method: { type: 'string', enum: ['vacuum', 'pressure', 'twin_sheet'] },
    sheetWeightKg: num, partWeightKg: num, toolCostGBP: num, heatTimeSec: num, formTimeSec: num, trimTimeSec: num,
  }),
  rotationalMoulding: obj({ numArms: num, partsPerArm: num, heatTimeSec: num, coolTimeSec: num, mouldCostGBP: num, mouldLife: num }),
  rubber: obj({
    process: { type: 'string', enum: ['compression', 'transfer', 'injection', 'extrusion', 'calendering', 'die_cut'] },
    flashWeightKg: num, cavities: num, cycleTimeSec: num, mouldCostGBP: num, mouldLife: num,
  }),
  composites: obj({
    process: { type: 'string', enum: ['hand_layup', 'prepreg_autoclave', 'rtm', 'infusion', 'smc', 'wet_layup'] },
    fibreFraction: num, wasteFraction: num, areaCm2: num, plies: num, toolCostGBP: num, toolLife: num, cureTimeSec: num,
  }),
  fieldConfidences: arr(obj({ fieldId: str, confidence: num }, ['fieldId', 'confidence'])),
  dfmIssues: arr(obj({
    severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
    area: str, description: str, impact: str, fix: str,
  }, ['severity', 'area', 'description'])),
  costRange: obj({ low: num, mid: num, high: num, currency: str }, ['low', 'mid', 'high']),
  stage1Selection: {
    anyOf: [
      obj({ primary: str, conf: num, alt: arr(obj({ type: str, conf: num }, ['type', 'conf'])) }, ['primary', 'conf']),
      { type: 'null' },
    ],
  },
}, ['recommendedCommodity', 'netWeightKg', 'materialId', 'estimatedCycleTimeHr']);

export const CAD_ANALYSIS_SCHEMA = obj({
  partName: str,
  geometry: obj({
    boundingBoxMm: obj({ x: num, y: num, z: num }, ['x', 'y', 'z']),
    estimatedVolumeCm3: num,
    estimatedSurfaceAreaCm2: num,
    estimatedWeightKg: obj({ aluminum: num, steel: num, plastic: num }, ['aluminum', 'steel', 'plastic']),
  }, ['boundingBoxMm', 'estimatedVolumeCm3', 'estimatedSurfaceAreaCm2', 'estimatedWeightKg']),
  detectedFeatures: arr(obj({ type: str, description: str, count: num, significance: severity3 }, ['type', 'description', 'count', 'significance'])),
  materialAnalysis: obj({
    fromMetadata: { type: 'boolean' },
    primarySuggestion: obj({ materialId: str, name: str, confidencePct: num, reasoning: str }, ['materialId', 'name', 'confidencePct']),
    alternatives: arr(obj({ materialId: str, name: str, confidencePct: num }, ['materialId', 'name', 'confidencePct'])),
  }, ['fromMetadata', 'primarySuggestion', 'alternatives']),
  processRecommendations: arr(obj({
    process: str, commodityType: str, confidencePct: num, reasoning: str, estimatedCycleTimeHr: num,
  }, ['process', 'commodityType', 'confidencePct'])),
  manufacturabilityScore: num,
  manufacturabilityRisks: arr(obj({ severity: severity3, feature: str, description: str, suggestion: str }, ['severity', 'feature', 'description'])),
  costInputSuggestions: CAD_COST_INPUTS,
  aiExplanation: str,
  confidenceLevel: severity3,
  analysisLimitations: arr(str),
}, [
  'partName', 'geometry', 'detectedFeatures', 'materialAnalysis', 'processRecommendations',
  'manufacturabilityScore', 'manufacturabilityRisks', 'costInputSuggestions',
  'aiExplanation', 'confidenceLevel', 'analysisLimitations',
]);

/** Convert schema-shaped fieldConfidences (array of pairs) back to the Record the client reads. */
export function normalizeFieldConfidences(analysis: unknown): void {
  const a = analysis as { costInputSuggestions?: { fieldConfidences?: unknown } };
  const fc = a?.costInputSuggestions?.fieldConfidences;
  if (Array.isArray(fc)) {
    const map: Record<string, number> = {};
    for (const e of fc as Array<{ fieldId?: string; confidence?: number }>) {
      if (e && typeof e.fieldId === 'string' && typeof e.confidence === 'number') map[e.fieldId] = e.confidence;
    }
    a.costInputSuggestions!.fieldConfidences = map;
  }
}
