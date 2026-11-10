/**
 * Internal types of the offline 2D drawing reader (Layer 2, Nov 2026).
 *
 * Coordinates are page points (1/72 in) from the page's TOP-LEFT corner, x right, y down — the same frame
 * `DrawingLocation.bbox` uses. Rotation is degrees counter-clockwise as seen on the sheet: 0 reads left to right,
 * 90 reads bottom to top (the usual vertical dimension text).
 *
 * This folder imports nothing from the cost engine except the TYPES in src/engine/engineering-data/model.ts and the
 * parameter dictionary. It never computes a cost.
 */
import type { DrawingSheetInfo, EngineeringParameter } from '../../src/engine/engineering-data/model.js';

export type BBox = [number, number, number, number];
export type TextMethod = 'pdf-text' | 'ocr' | 'dxf-entity';
export type Region = 'title-block' | 'notes' | 'revision-table' | 'view' | 'table' | 'other';

/** One run of text as the source emitted it (a glyph, a word or a string). */
export interface RawTextItem {
  text: string;
  sheet: number;
  /** Baseline start. */
  ox: number; oy: number;
  /** Advance along the reading direction, in points. */
  width: number;
  /** Font height in points. */
  size: number;
  rotation: number;
  method: TextMethod;
  reliability?: number;
  /** The font's real name when the source gives one (used only to map symbol fonts). */
  font?: string;
  /** The run was written in a symbol font and has been mapped to Unicode symbols. */
  symbol?: boolean;
}

/** Text re-assembled into one reading line (or one table cell's line). */
export interface TextLine {
  id: number;
  text: string;
  sheet: number;
  bbox: BBox;
  size: number;
  rotation: number;
  method: TextMethod;
  reliability?: number;
  /** Baseline start in the line's own frame: u along the reading direction, v across it (growing line by line). */
  u0: number; u1: number; v: number;
  font?: string;
  region?: Region;
  zone?: string;
  /** Index of the numbered note this line belongs to, when it sits in a notes block. */
  noteNo?: string;
  /** The line is a flag-note number drawn inside its own small outline (a reference to a note, never a value). */
  flagNote?: boolean;
}

/** A straight piece of line work. */
export interface Segment { x0: number; y0: number; x1: number; y1: number }

export interface SheetData {
  info: DrawingSheetInfo;
  items: RawTextItem[];
  lines: TextLine[];
  /** Axis-aligned line work, merged: horizontal (y0 === y1, x0 < x1) and vertical (x0 === x1, y0 < y1). */
  hSegs: Segment[];
  vSegs: Segment[];
  /** Every other straight segment of at least 3 pt (rotated frames, leaders, hatching). */
  oSegs: Segment[];
  stats: {
    pathOps: number; glyphLikePaths: number; imageCoverage: number; textChars: number;
    /** Letter-sized STROKED polylines in runs away from the text: annotation in a stroke ("single-line") font. */
    strokeGlyphPaths?: number;
    /** Share of the shown characters nobody can see (invisible render mode, or under a full-page image). */
    hiddenTextShare?: number;
  };
}

export interface NoteEntry { no: string; text: string; bbox: BBox; lineIds: number[]; sheet: number }

export interface TableCell { bbox: BBox; lineIds: number[]; text: string }

export interface SheetLayout {
  sheet: number;
  /** The drawing frame (inner border) when one is found. */
  border?: BBox;
  /** Zone grid read off the margin labels. */
  zones?: { cols: Array<{ label: string; x0: number; x1: number }>; rows: Array<{ label: string; y0: number; y1: number }> };
  titleBlock?: { bbox: BBox; fields: Record<string, TitleField> };
  notes: Array<{ bbox: BBox; heading?: string; entries: NoteEntry[] }>;
  revisionTable?: { bbox: BBox; rows: string[][] };
  tables: Array<{ kind: 'gear' | 'other'; bbox: BBox; rows: Array<{ label: string; value: string; lineIds: number[]; bbox: BBox }> }>;
  viewAreas: BBox[];
}

export interface TitleField { label: string; value: string; bbox: BBox; lineIds: number[]; labelLineId: number }

/** What every extractor receives. Extractors are pure functions of this. */
export interface ExtractContext {
  sourceFile: string;
  sheets: SheetData[];
  layouts: SheetLayout[];
  /** All lines of all sheets, in reading order. */
  lines: TextLine[];
}

/** A parameter before ids are assigned. */
export type DraftParameter = Omit<EngineeringParameter, 'id' | 'source' | 'sourceFile'>;

export interface ReadOptions {
  /** `auto` (default): OCR sheets with no usable text. `off`: never. `force`: every sheet. */
  ocr?: 'auto' | 'off' | 'force';
  /** Tesseract language codes, default ['eng', 'deu'] (both bundled). */
  ocrLanguages?: string[];
  /** Render resolution for OCR. Default 300, lowered automatically on very large sheets. */
  ocrDpi?: number;
  /** Also OCR the sheet turned 90° to read vertical text. Default true. */
  ocrVertical?: boolean;
  maxBytes?: number;
  maxPages?: number;
  /** Test hook: an OCR engine to use instead of the bundled one (or null for "not installed"). */
  ocrEngine?: OcrEngine | null;
}

export interface OcrWord {
  text: string; x0: number; y0: number; x1: number; y1: number; confidence: number;
  /** The engine's own text line this word belongs to (words of one line share a baseline). */
  line?: string;
}

export interface OcrEngine {
  name: string;
  /** Recognise an 8-bit greyscale image; boxes in pixels. */
  recognise(grey: Uint8Array, width: number, height: number, opts: { dpi: number; languages: string[] }): Promise<OcrWord[]>;
  close(): Promise<void>;
}

export class DrawingReadError extends Error {
  constructor(public code: 'unsupported-type' | 'too-large' | 'encrypted' | 'corrupt' | 'empty', message: string) {
    super(message);
    this.name = 'DrawingReadError';
  }
}
