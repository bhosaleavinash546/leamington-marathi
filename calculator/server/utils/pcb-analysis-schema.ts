/**
 * The Stage 3 answer as a JSON schema, for structured output.
 *
 * The model is asked for readings only — no costEstimates: the server prices the
 * board from its rate tables (the golden rule).
 *
 * Stage 3 used to be free text scraped for the outermost {…}, then salvaged or
 * sent back for "repair" when it did not parse — the origin of the empty-BOM
 * failures. With `output_config.format` the model must return this shape. Models
 * (or proxies) that reject the parameter fall back to the free-text call, so the
 * salvage path stays as the second line.
 */
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const bool = { type: 'boolean' } as const;
const strs = { type: 'array', items: str } as const;

export const PCB_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    partName: str,
    boardSpec: {
      type: 'object',
      properties: {
        estimatedLayers: num, widthMm: num, heightMm: num,
        dimensionsSource: { type: 'string', enum: ['measured', 'estimated'] },
        surfaceFinish: str, solderMaskColour: str, silkscreenSides: num,
        throughVias: num, blindVias: num, buriedVias: num, microVias: num,
        bgaDetected: bool, minTraceSpaceMm: num, technologyType: str, hdiStructure: str,
        impedanceControlRequired: bool, copperWeightOz: num,
        copperOzByLayer: { type: 'array', items: num }, boardWeightG: num,
        qualityGrade: str, panelUtilisation: num, conformalCoating: bool,
      },
      required: ['estimatedLayers', 'widthMm', 'heightMm', 'dimensionsSource', 'surfaceFinish', 'solderMaskColour', 'silkscreenSides',
        'throughVias', 'blindVias', 'buriedVias', 'microVias', 'bgaDetected', 'minTraceSpaceMm', 'technologyType', 'hdiStructure',
        'impedanceControlRequired', 'copperWeightOz', 'copperOzByLayer', 'boardWeightG', 'qualityGrade', 'panelUtilisation', 'conformalCoating'],
      additionalProperties: false,
    },
    bom: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          refDes: str, componentType: str, description: str, pkg: str, value: str, voltage: str,
          qty: num, unitPriceGBP: num, moq: num, automotive: bool, highCost: bool, partNumber: str,
          lineConf: num, ocrExtracted: bool,
        },
        required: ['refDes', 'componentType', 'description', 'pkg', 'value', 'voltage', 'qty', 'unitPriceGBP', 'moq', 'automotive', 'highCost', 'partNumber', 'lineConf', 'ocrExtracted'],
        additionalProperties: false,
      },
    },
    assembly: {
      type: 'object',
      properties: {
        smtPlacements: num, throughHoleJoints: num, manualJoints: num, bgaCount: num,
        complexity: str, reflowSides: num, aoiRequired: bool, ictTimeSec: num,
      },
      required: ['smtPlacements', 'throughHoleJoints', 'manualJoints', 'bgaCount', 'complexity', 'reflowSides', 'aoiRequired', 'ictTimeSec'],
      additionalProperties: false,
    },
    aiInsights: strs, dfmIssues: strs, highCostComponents: strs, optimisationSuggestions: strs,
    confidenceLevel: { type: 'string', enum: ['High', 'Medium', 'Low'] },
    analysisLimitations: strs,
  },
  required: ['partName', 'boardSpec', 'bom', 'assembly', 'aiInsights', 'dfmIssues', 'highCostComponents', 'optimisationSuggestions', 'confidenceLevel', 'analysisLimitations'],
  additionalProperties: false,
} as const;

/** The `output_config` block for a Stage 3 call. */
export function pcbAnalysisOutputConfig() {
  return { format: jsonSchemaOutputFormat(PCB_ANALYSIS_JSON_SCHEMA) };
}

/** A 400 that names the output-format parameter: the model or proxy does not take it. */
export function isOutputFormatRejection(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | null;
  const msg = String(e?.message ?? err ?? '');
  return (e?.status === 400 || /400/.test(msg)) && /output_config|output_format|structured|json_schema|\bformat\b/i.test(msg);
}
