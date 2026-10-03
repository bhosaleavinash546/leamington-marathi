/**
 * Identify a part's manufacturing process and material from everything we have:
 * a photo of the physical part, the engineering drawing, rendered views of the
 * CAD, the measured geometry and what the file says about itself.
 *
 * WHY THIS REPLACED STAGE 1. The old Stage 1 was Claude Haiku 4.5 reading a
 * paragraph of numbers — bounding box, fill ratio, face count — and nothing
 * else. It never saw a rendered view, the photo or the drawing (those went only
 * to the later specialist call, after the process had already been chosen), and
 * it had no material question at all. A fill ratio does not separate a casting
 * from a forging from a billet part, so the choice it made was close to a prior.
 *
 * WHAT EACH INPUT CAN AND CANNOT TELL. This is written into the prompt because
 * it is where vision models go wrong:
 *  - CAD renders are untextured grey. They show SHAPE — draft, ribs, blends,
 *    parting lines, bosses, uniform walls, bends — so they inform the PROCESS.
 *    They carry no material information whatsoever.
 *  - A photo of the real part shows SURFACE — as-cast sand texture, die-cast
 *    sheen and ejector marks, forging flash lines and scale, machining lay,
 *    stamped burrs, moulded gloss, the colour of grey iron against aluminium
 *    against zinc plate. It is the only image that can show the material.
 *  - A drawing usually STATES the material and often the process (a casting
 *    spec, a forging spec, "machine all over").
 *  - File and product names are the designer's own words for it.
 * The model reports where its material came from; `none` keeps it unknown, and
 * the rules then ask the engineer exactly as they do with no AI at all.
 *
 * THE MODEL NEVER SETS A PRICE, and it does not get the last word here either:
 * the geometry guards (`enforceGeometryCommodity`) still overrule a process the
 * physics rules out, and any material it names is held as a blocking
 * confirmation with its pick as the suggestion (`pendingDecisions`).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { OCCTGeometry } from '../../src/engine/ai-analysis.js';
import { partNames, processFromNames, netShapeSignal, hasMachinedFeatures, materialFromFile } from '../../src/engine/cost-input-rules/derive/part-evidence.js';
import { isOutputFormatRejection } from './pcb-analysis-schema.js';

/** Sonnet 5.5 reads images well enough for this at a third of Opus's price; Opus 5.5 under "Deep analysis". */
export const IDENTIFY_MODEL = 'claude-sonnet-5-5';
export const IDENTIFY_DEEP_MODEL = 'claude-opus-5-5';

export const IDENTIFY_PROCESSES = [
  'machining', 'casting', 'cast_and_machine', 'forging', 'sheet_metal', 'sheet_metal_fab',
  'injection_moulding', 'blow_moulding', 'thermoforming', 'rotational_moulding', 'extrusion', 'aluminium_extrusion',
  'rubber', 'composites', 'gear', 'wiring_harness', 'pcb_fab', 'pcba', 'biw_assembly', 'painting', 'assembly',
] as const;
export const IDENTIFY_FAMILIES = ['steel', 'aluminium', 'cast iron', 'magnesium', 'titanium', 'copper alloy', 'plastic', 'unknown'] as const;
export const MATERIAL_SOURCES = ['photo', 'drawing', 'cad_metadata', 'file_name', 'none'] as const;

export interface Identification {
  process: string;
  processConfidence: number;
  alternatives: Array<{ process: string; confidence: number }>;
  processEvidence: string[];
  materialFamily: (typeof IDENTIFY_FAMILIES)[number];
  /** A grade when the evidence names one (e.g. "EN-GJS-500-7", "A356-T6"), else ''. */
  materialGrade: string;
  materialConfidence: number;
  materialSource: (typeof MATERIAL_SOURCES)[number];
  materialEvidence: string[];
  model: string;
}

const conf = { type: 'number' } as const;
const strs = { type: 'array', items: { type: 'string' } } as const;
export const IDENTIFY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    process: { type: 'string', enum: [...IDENTIFY_PROCESSES] },
    processConfidence: conf,
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: { process: { type: 'string', enum: [...IDENTIFY_PROCESSES] }, confidence: conf },
        required: ['process', 'confidence'],
        additionalProperties: false,
      },
    },
    processEvidence: strs,
    materialFamily: { type: 'string', enum: [...IDENTIFY_FAMILIES] },
    materialGrade: { type: 'string' },
    materialConfidence: conf,
    materialSource: { type: 'string', enum: [...MATERIAL_SOURCES] },
    materialEvidence: strs,
  },
  required: ['process', 'processConfidence', 'alternatives', 'processEvidence',
    'materialFamily', 'materialGrade', 'materialConfidence', 'materialSource', 'materialEvidence'],
  additionalProperties: false,
} as const;

export const IDENTIFY_SYSTEM_PROMPT = `You are a senior manufacturing and cost engineer identifying how an automotive part is made and what it is made of, from the evidence supplied. You do not estimate cost.

Read each kind of evidence for what it can show, and nothing more:
- RENDERED VIEWS of the CAD model are untextured, uniformly grey and lit artificially. They show SHAPE only — use them for the process (draft on walls, parting lines, ribs and gussets, blended fillets everywhere, cored cavities, uniform sheet wall with bends, flanges, bosses with draft, prismatic pockets and sharp edges). Never infer a material from a render: its colour and shine are the renderer's, not the part's.
- A PHOTO of the physical part shows SURFACE. As-cast sand texture and gates or risers point to sand casting; a smooth sheen with ejector-pin marks and a parting flash to high-pressure die casting; a flash line around the parting plane, scale and draft to forging; tool lay, circular feed marks and sharp edges to machining from solid; sheared and burred edges with uniform gauge and bend radii to stamping; gloss, gate vestige, ejector marks and knit lines to injection moulding. Colour and texture can show the material: dark grey granular iron, bright or anodised aluminium, zinc- or e-coated steel, painted surfaces (paint hides the substrate — say so).
- An ENGINEERING DRAWING usually states the material (and often a casting or forging specification, heat treatment, or "machine all over"). If it does, that is the material, with its grade.
- FILE AND PRODUCT NAMES and declared CAD material properties are the designer's own words; weigh them, but a name can be stale or generic.
- MEASURED GEOMETRY (volume, walls, bends, face mix) is exact. A part with bends at a uniform gauge is a pressing; a large thin shell enclosing a sealed void is blow or rotational moulded; walls over about 6 mm are not pressed or moulded; a surface built from free-form and blended faces is net-shape (cast or forged), one built only from planes and cylinders is cut from solid.

Rules:
- Choose the single most likely process and give honest alternatives with confidences. Casting followed by finish machining of bores, faces and tapped holes is cast_and_machine; a forging that is finish-machined is still forging.
- Report where the material came from in materialSource. If no photo, drawing, declared property or name supports a material, set materialFamily "unknown", materialSource "none" and materialConfidence 0 — do not guess from a render or from what parts like this are "usually" made of.
- materialGrade only when the evidence names one; otherwise an empty string.
- Each evidence item is one short sentence naming what you saw and where (e.g. "photo: parting flash along the mid-plane").`;

export interface IdentifyInput {
  geo: OCCTGeometry;
  filename: string;
  deep?: boolean;
  partPhoto?: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' } | null;
  /** JPEG base64 renders of the CAD (iso, front, top, right). */
  renderViews?: string[];
  drawingPdfBase64?: string | null;
}

/** The text block: measured geometry plus what the file says about itself. */
export function identificationBrief(geo: OCCTGeometry, filename: string): string {
  const lines: string[] = [];
  if (geo.status === 'success' && geo.boundingBox) {
    const bb = geo.boundingBox;
    lines.push(`Bounding box ${bb.xMm.toFixed(0)} × ${bb.yMm.toFixed(0)} × ${bb.zMm.toFixed(0)} mm; volume ${(geo.volume?.cm3 ?? 0).toFixed(1)} cm³; `
      + `surface ${(geo.surfaceArea?.cm2 ?? 0).toFixed(0)} cm²; fill ratio ${(geo.fillRatio ?? 0).toFixed(3)}.`);
    const v = geo.volume?.cm3 ?? 0, sA = geo.surfaceArea?.cm2 ?? 0;
    if (v > 0 && sA > 0) lines.push(`Bulk wall 2·V/S ${((2 * v / sA) * 10).toFixed(1)} mm; ray-cast wall mean ${geo.wallThickness?.meanMm?.toFixed(1) ?? 'n/a'} mm.`);
    const by = (geo.faces?.byType ?? {}) as Record<string, number>;
    lines.push(`Faces ${geo.faces?.total ?? 0}: ${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')}.`);
    lines.push(netShapeSignal(geo).basis + '.');
    if (geo.sheetMetal?.bendCount) lines.push(`${geo.sheetMetal.bendCount} bends measured at a ${geo.sheetMetal.thicknessMm} mm gauge.`);
    if (hasMachinedFeatures(geo)) lines.push(`${geo.features?.estimatedHoleCount ?? 0} holes measured.`);
    const d = geo.draftAnalysis;
    if (d?.analyzedFaceCount) lines.push(`Draft along the best pull: ${d.adequateDraftFaceCount} faces drafted, ${d.zeroDraftFaceCount} at zero draft, ${d.undercutFaceCount} undercut.`);
    if (geo.topology?.available) lines.push(`Topology: ${geo.topology.enclosesSealedVoid ? 'encloses a sealed void' : 'no sealed void'}.`);
  } else {
    lines.push('The geometry kernel did not measure this file.');
  }
  const names = partNames(filename, geo);
  if (names.length) lines.push('Names: ' + names.map(n => `${n.where}: "${n.text}"`).join('; ') + '.');
  const named = processFromNames(names);
  if (named.hits.length) lines.push('Process words in those names: ' + named.hits.map(h => `"${h.text}" reads as ${h.label}`).join('; ') + '.');
  const mat = materialFromFile(filename, geo);
  if (geo.cadMetadata?.materialDesignations.length) lines.push(`Material declared in the CAD file: ${geo.cadMetadata.materialDesignations.join(', ')}.`);
  else if (mat) lines.push(`A name suggests ${mat.family}: "${mat.text}" (${mat.where}).`);
  else lines.push('The CAD file declares no material and no name suggests one.');
  if (geo.cadMetadata?.authoringSystem) lines.push(`Authored in ${geo.cadMetadata.authoringSystem}.`);
  return lines.join('\n');
}

function clamp01(x: unknown): number { const n = Number(x); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0; }

/** Coerce a reply (structured or salvaged) into a well-formed Identification, or null. */
export function coerceIdentification(raw: unknown, model: string): Identification | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const process = String(r.process ?? '');
  if (!(IDENTIFY_PROCESSES as readonly string[]).includes(process)) return null;
  const fam = String(r.materialFamily ?? 'unknown');
  const src = String(r.materialSource ?? 'none');
  const family = ((IDENTIFY_FAMILIES as readonly string[]).includes(fam) ? fam : 'unknown') as Identification['materialFamily'];
  const source = ((MATERIAL_SOURCES as readonly string[]).includes(src) ? src : 'none') as Identification['materialSource'];
  const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 12) : []);
  // A material with no source is a guess: hold it as unknown, whatever the model said.
  const unsupported = source === 'none' || family === 'unknown';
  return {
    process,
    processConfidence: clamp01(r.processConfidence),
    alternatives: (Array.isArray(r.alternatives) ? r.alternatives : [])
      .map(a => a as Record<string, unknown>)
      .filter(a => (IDENTIFY_PROCESSES as readonly string[]).includes(String(a.process)) && a.process !== process)
      .map(a => ({ process: String(a.process), confidence: clamp01(a.confidence) }))
      .slice(0, 4),
    processEvidence: strList(r.processEvidence),
    materialFamily: unsupported ? 'unknown' : family,
    materialGrade: unsupported ? '' : String(r.materialGrade ?? '').slice(0, 60),
    materialConfidence: unsupported ? 0 : clamp01(r.materialConfidence),
    materialSource: unsupported ? 'none' : source,
    materialEvidence: strList(r.materialEvidence),
    model,
  };
}

function textOf(msg: { content: Array<{ type: string; text?: string }> }): string {
  // Every text block — a leading thinking block once emptied the PCB BOM.
  return msg.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
}

/** One vision call. Returns null when the model gives nothing usable; the caller falls back. */
export async function identifyPart(anthropic: Anthropic, input: IdentifyInput): Promise<Identification | null> {
  const model = input.deep ? IDENTIFY_DEEP_MODEL : IDENTIFY_MODEL;
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: `MEASURED GEOMETRY AND FILE EVIDENCE\n${identificationBrief(input.geo, input.filename)}` },
  ];
  if (input.drawingPdfBase64) {
    content.push({ type: 'text', text: 'ENGINEERING DRAWING (read the material, process and heat-treatment callouts):' });
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.drawingPdfBase64 } });
  }
  if (input.partPhoto?.data) {
    content.push({ type: 'text', text: 'PHOTO OF THE PHYSICAL PART (surface texture, marks and colour are real):' });
    content.push({ type: 'image', source: { type: 'base64', media_type: input.partPhoto.mediaType, data: input.partPhoto.data } });
  }
  const views = (input.renderViews ?? []).slice(0, 4);
  if (views.length) {
    content.push({ type: 'text', text: `${views.length} UNTEXTURED CAD RENDERS (isometric, front, top, right) — shape only, no material information:` });
    for (const v of views) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: v } });
  }
  content.push({ type: 'text', text: 'Identify the manufacturing process and the material, with the evidence for each.' });

  const params = {
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: IDENTIFY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  } as unknown as Parameters<Anthropic['messages']['create']>[0];
  const effort = input.deep ? 'high' : 'medium';
  try {
    const msg = await anthropic.messages.create({
      ...params,
      output_config: { effort, format: jsonSchemaOutputFormat(IDENTIFY_JSON_SCHEMA) },
    } as Parameters<Anthropic['messages']['create']>[0]) as unknown as { content: Array<{ type: string; text?: string }>; stop_reason?: string };
    if (msg.stop_reason === 'refusal') return null;
    return coerceIdentification(JSON.parse(textOf(msg)), model);
  } catch (err) {
    if (!isOutputFormatRejection(err)) throw err;
    // A proxy or model that does not take structured output: ask for the JSON in words.
    const msg = await anthropic.messages.create({
      ...params,
      output_config: { effort },
      messages: [{ role: 'user', content: [...content, { type: 'text', text: `Reply with one JSON object only, matching this schema: ${JSON.stringify(IDENTIFY_JSON_SCHEMA)}` }] }],
    } as unknown as Parameters<Anthropic['messages']['create']>[0]) as unknown as { content: Array<{ type: string; text?: string }> };
    const t = textOf(msg);
    const j = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
    try { return coerceIdentification(JSON.parse(j), model); } catch { return null; }
  }
}
