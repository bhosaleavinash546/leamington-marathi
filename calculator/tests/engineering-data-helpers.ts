/**
 * Shared inputs for the engineering-data tests: the recorded geometry of the real parts, and hand-written drawing
 * extractions (the drawing reader is a separate layer — these tests never run it).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { ConsolidatedEngineeringData, DrawingExtraction, DrawingLocation, EngineeringParameter, ParameterValue } from '../src/engine/engineering-data/model.js';
import { confirm, type Who } from '../src/engine/engineering-data/overrides.js';

export interface RecordedPart {
  part: string; answers: Record<string, string>; commodity?: string; geometry: OCCTGeometry;
  outcome: { status: string; commodity?: string; total?: number; breakdown?: Record<string, number> };
}

export const RECORDED: RecordedPart[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures', 'real-parts-baseline.json'), 'utf8')) as RecordedPart[];

export function recorded(part: string): RecordedPart {
  const b = RECORDED.find(x => x.part === part);
  if (!b) throw new Error(`no recorded geometry for ${part}`);
  return b;
}

export const WHO: Who = { by: 'cost.engineer', at: '2026-11-10T09:00:00.000Z' };

const TITLE: DrawingLocation = { sheet: 1, zone: 'D1', bbox: [600, 520, 800, 560], region: 'title-block' };
const NOTES: DrawingLocation = { sheet: 1, zone: 'A4', bbox: [40, 60, 300, 140], region: 'notes' };
const VIEW: DrawingLocation = { sheet: 1, zone: 'B2', bbox: [200, 200, 260, 215], region: 'view' };
export const LOCATIONS = { TITLE, NOTES, VIEW };

/** One parameter as a drawing reader would hand it over: exact PDF text, unconfirmed. */
export function dp(name: string, value: ParameterValue, rawText?: string, extra: Partial<EngineeringParameter> = {}): EngineeringParameter {
  return {
    id: extra.id ?? `drawing:${name}:${rawText ?? JSON.stringify(value)}`, name, value,
    rawText: rawText ?? (typeof value === 'string' ? value : JSON.stringify(value)),
    source: 'drawing', method: 'pdf-text', kind: 'extracted', status: 'extracted', reliability: 1,
    location: name.startsWith('title.') || name.startsWith('material.') || name.startsWith('tolerance.') ? TITLE
      : name === 'hole.diameter' || name === 'thread' || name === 'dimension' ? VIEW : NOTES,
    ...extra,
  };
}

export function drawingOf(parameters: EngineeringParameter[], sourceFile = 'part-drawing.pdf'): DrawingExtraction {
  return {
    schemaVersion: 1, readerVersion: 'hand-written-test-1', sourceFile, fileKind: 'pdf',
    sheets: [{ sheet: 1, widthPt: 842, heightPt: 595, content: 'vector-text', textItemCount: parameters.length, rotationDeg: 0 }],
    parameters, text: [], warnings: [],
  };
}

/** Confirm every live parameter of the given names (what the engineer does on the review panel). */
export function confirmNames(data: ConsolidatedEngineeringData, names: string[], who: Who = WHO): ConsolidatedEngineeringData {
  let d = data;
  for (const p of data.parameters) {
    if (names.includes(p.name) && (p.status === 'extracted' || p.status === 'needs-validation')) d = confirm(d, p.id, who);
  }
  return d;
}

export const byName = (data: ConsolidatedEngineeringData, name: string): EngineeringParameter[] => data.parameters.filter(p => p.name === name);
