/**
 * The unified engineering data model — the ONE contract between the 3D CAD reader, the 2D drawing reader and the
 * existing cost engine (offline 2D drawing intelligence, Nov 2026; plan in
 * docs/plans/offline-2d-drawing-intelligence-plan-2026-11.md).
 *
 * Types only. This file imports nothing: the drawing reader (server/drawing/) depends on it and on nothing else in
 * src/engine, and no cost formula may ever live in this folder.
 *
 * A parameter is one engineering fact with where it came from. Nothing here is a £.
 */

/** Where a parameter came from. */
export type ParameterSource = 'cad' | 'drawing' | 'derived' | 'manual';

/** How it was obtained. `pdf-text` is exact text in a vector PDF; `ocr` is read off pixels. */
export type ExtractionMethod = 'pdf-text' | 'ocr' | 'dxf-entity' | 'kernel' | 'cad-metadata' | 'rule' | 'typed';

/**
 * How direct the reading is.
 * - `extracted`: the value is written on the source as read ("EN-GJS-500-7").
 * - `interpreted`: an algorithm turned what is written into the value ("ISO 2768-mK" → general class medium;
 *   "Ø25 H7" → 25.000 / 25.021).
 * - `inferred`: an engineering rule concluded it; the source does not state it. Always shown as inferred.
 */
export type ParameterKind = 'extracted' | 'interpreted' | 'inferred';

/**
 * Review state.
 * - `extracted`: read with nothing to doubt, not yet confirmed by the engineer.
 * - `needs-validation`: read, but uncertain (OCR, ambiguous wording, several candidates).
 * - `missing`: expected for this commodity and found in no source.
 * - `conflict`: two sources disagree. Never resolved silently.
 * - `confirmed`: the engineer accepted the value as read.
 * - `corrected`: the engineer typed a different value (see `history`).
 * - `rejected`: the engineer said the reading is wrong and gave no value.
 * Only `confirmed` and `corrected` parameters may reach the cost engine.
 */
export type ParameterStatus =
  | 'extracted' | 'needs-validation' | 'missing' | 'conflict' | 'confirmed' | 'corrected' | 'rejected';

/** Where on a drawing a reading sits. Coordinates are PDF points from the page's top-left corner. */
export interface DrawingLocation {
  sheet: number;                               // 1-based
  /** The drawing zone when the sheet has a grid ("C4"), else undefined. */
  zone?: string;
  /** [x0, y0, x1, y1] in page points, top-left origin. */
  bbox: [number, number, number, number];
  /** The block the text was found in. */
  region?: 'title-block' | 'notes' | 'revision-table' | 'view' | 'table' | 'other';
}

export interface OverrideEntry {
  by: string;
  at: string;                                  // ISO timestamp
  from: unknown;
  to: unknown;
  action: 'confirm' | 'correct' | 'reject' | 'resolve-conflict' | 'reopen';
  reason?: string;
}

export type ParameterValue = string | number | boolean | Record<string, unknown>;

/** One engineering fact with its provenance. */
export interface EngineeringParameter {
  /** Stable id within a dataset (e.g. "drawing:material.designation:1"). */
  id: string;
  /** Canonical name from the parameter dictionary (dictionary.ts), e.g. 'material.designation'. */
  name: string;
  value: ParameterValue;
  /** Normalised unit (mm, µm, deg, HRC, kg …); undefined for text and flags. */
  unit?: string;
  /** Exactly what was read, before any normalisation. */
  rawText?: string;
  source: ParameterSource;
  sourceFile?: string;
  location?: DrawingLocation;
  method: ExtractionMethod;
  kind: ParameterKind;
  status: ParameterStatus;
  /** 0–1, only where it is measurable: exact PDF text = 1, OCR = the engine's word confidence. Never a guess. */
  reliability?: number;
  /** What the value applies to, when it is not the whole part. */
  appliesTo?: { featureId?: string; faceIds?: number[]; description?: string };
  /** Why the status is what it is, in words an engineer can act on. */
  note?: string;
  history?: OverrideEntry[];
}

/** A piece of text on a drawing with its position — the raw material every extractor works from. */
export interface DrawingTextItem {
  text: string;
  sheet: number;
  bbox: [number, number, number, number];
  /** Font height in points. */
  size?: number;
  /** Rotation in degrees (0 = reads left to right). */
  rotation?: number;
  method: 'pdf-text' | 'ocr' | 'dxf-entity';
  reliability?: number;
}

export interface DrawingSheetInfo {
  sheet: number;
  widthPt: number;
  heightPt: number;
  /** `vector-text`: selectable text. `text-as-curves`: vector line work, no text. `scanned`: an image. */
  content: 'vector-text' | 'text-as-curves' | 'scanned' | 'empty';
  textItemCount: number;
  rotationDeg: number;
}

/** What the drawing reader (Layer 2) returns. It never contains a cost. */
export interface DrawingExtraction {
  schemaVersion: 1;
  /** Bumped whenever extraction logic changes a result; part of every cache key. */
  readerVersion: string;
  sourceFile: string;
  fileKind: 'pdf' | 'image' | 'dxf';
  sheets: DrawingSheetInfo[];
  parameters: EngineeringParameter[];
  /** Every text item read, for the review screen and for traceability. */
  text: DrawingTextItem[];
  /** What the reader could not do on this file, in plain words (e.g. "sheet 2 is a scan and OCR is not installed"). */
  warnings: string[];
  timingsMs?: Record<string, number>;
}

/** One side of a comparison between sources. */
export interface ConflictSide { parameterId: string; source: ParameterSource; value: ParameterValue; unit?: string; rawText?: string }

export interface ParameterConflict {
  name: string;
  appliesTo?: EngineeringParameter['appliesTo'];
  sides: ConflictSide[];
  /** The side the configured precedence would suggest. A suggestion only — never applied without the engineer. */
  suggested?: string;
  /** Absolute and relative difference when both sides are numbers. */
  difference?: { abs: number; rel: number };
  why: string;
}

/** What the unified layer (Layer 3) hands on. */
export interface ConsolidatedEngineeringData {
  schemaVersion: 1;
  commodity?: string;
  /** Every parameter from every source, after normalisation. */
  parameters: EngineeringParameter[];
  conflicts: ParameterConflict[];
  /** Names expected for this commodity and found in no source. */
  missing: Array<{ name: string; why: string }>;
  /** Drawing readings that have no place in the cost model yet: shown and reported, never costed. */
  notCosted: Array<{ parameterId: string; why: string }>;
  sources: Array<{ source: ParameterSource; file?: string; readerVersion?: string }>;
}
