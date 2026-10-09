
import { Router } from 'express';
import { countryFactor } from '../../src/engine/regional-services.js';
import { REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { resolveApiKey } from '../utils/api-key.js';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { createAnalysisCache } from '../utils/analysis-cache.js';
import { createAnthropic, isAirGapped, aiDisabledBody, AI_DISABLED_MESSAGE } from '../utils/ai-client.js';
import { aiLimit } from '../middleware/ai-limit.js';
import {
  computeAllCountryCosts,
  computePCBCountryCost,
  computeVolumeCurve,
  computeComplexityScore,
  PCB_COUNTRY_RATES,
  COUNTRY_DISPLAY_ORDER,
  type PCBCostInput,
  type VolumeCurvePoint,
  type PCBCountryCostBreakdown,
} from '../data/pcb-country-rates.js';
import { fetchLivePrices, fetchLivePricesWithAECQ, resolveNexarAccessToken, type LivePricingProvider, type LivePriceResult } from '../utils/pcb-live-pricing.js';
import { groundingCandidates, offlineCataloguePrices, groundAndSplit } from '../utils/pcb-bom-grounding.js';
import { reconcileOcrMarkings, verifyOcrClaims, crossCheckWithOcr } from '../utils/pcb-ocr-reconcile.js';
import { consolidateBom } from '../utils/pcb-bom-consolidate.js';
import { ecuLibrary } from '../utils/pcb-ecu-library.js';
import { isNotFitted } from '../utils/pcb-price-catalogue.js';
import { measureFabData, applyFabMeasurement, type FabMeasurement } from '../utils/pcb-fab-data.js';
import { readBomImage, isBomImage } from '../utils/pcb-bom-image.js';
import { bomFromFile } from '../utils/pcb-bom-truth.js';
import { pcbAnalysisOutputConfig, isOutputFormatRejection } from '../utils/pcb-analysis-schema.js';
import { stabiliseBoardSpec, stableFabMid, copperLayersFromSpec, weightKgFromSpec } from '../utils/pcb-boardspec-stabilise.js';
import { parseBOMFile, type ParsedBOMLine } from '../utils/pcb-bom-parser.js';
import { normalizePCBAnalysis } from '../utils/pcb-normalize.js';
import { salvageAnalysisFromRaw } from '../utils/pcb-salvage.js';
import { guardAsil, type AsilLevel, type AsilGuardResult } from '../utils/pcb-asil-guard.js';

// ── Volume BOM price correction ────────────────────────────────────────────
// Pricing table is calibrated to 100K units. Multipliers scale cost up for
// lower order quantities (below 100K it gets more expensive, above it's cheaper).
// Recalibrated (accuracy pass): the mid/high-volume steps were too steep — for
// mainstream automotive silicon the real 10k-vs-100k distributor delta is ~10%,
// not 35%. 10k is a production volume, not a prototype. Prototype steps (≤1k) stay
// aggressive. NB: catalogue-grounded lines ignore this entirely (their price comes
// straight from the catalogue/distributor at the order qty), so this now only
// affects OCR-confirmed lines whose exact MPN isn't in the catalogue.
const VOLUME_BOM_MULTIPLIERS: [number, number][] = [
  [50, 8.0], [100, 6.0], [250, 4.0], [500, 2.8], [1000, 2.0],
  [2500, 1.55], [5000, 1.28], [10000, 1.12], [25000, 1.05],
  [50000, 1.02], [100000, 1.00],
];
function getVolumeMultiplier(orderQty: number): number {
  for (const [maxQty, mult] of VOLUME_BOM_MULTIPLIERS) {
    if (orderQty <= maxQty) return mult;
  }
  return 0.88; // >100K benefits from super-volume pricing
}

// ── Cost confidence band ───────────────────────────────────────────────────
interface PCBConfidenceBand {
  bomCostLow: number; bomCostMid: number; bomCostHigh: number;
  fabCostLow: number; fabCostMid: number; fabCostHigh: number;
  totalLow: number; totalMid: number; totalHigh: number;
  unconfirmedHighValueCount: number;
  ocrConfirmedCount: number;
  weightedBOMConfidence: number;
  bomConfidenceLabel: 'High' | 'Medium' | 'Low';
  fabConfidenceLabel: 'High' | 'Medium' | 'Low';
  overallLabel: 'High' | 'Medium' | 'Low';
  volumeMultiplier: number;
}

// Widened (accuracy pass): reading the exact MPN of an unconfirmed high-value IC is
// what makes it catalogue-groundable, so include the other IC packages that carry
// real value (QFN/QFP/SOIC), not just BGA/TQFP. Passives stay out — they're cheap
// and not worth a second Opus pass.
const HIGH_VALUE_COMP_TYPES = new Set(['ic_bga', 'ic_tqfp', 'ic_qfp', 'ic_qfn', 'ic_soic', 'power_module']);

interface BOMLineForBand {
  qty: number; unitPriceGBP: number; lineConf: number;
  ocrExtracted: boolean; componentType?: string; partNumber?: string;
}

/**
 * One total on every panel: rebase the confidence band on the headline country
 * total (components + board + assembly + logistics/duty + energy + packaging +
 * yield), keeping the band's own percentage spread. The band used to be
 * components + (fab×1.3 + assembly) with no logistics, so the UI showed £54.23
 * beside a £51.34 headline for the same board.
 */
export function anchorBandToHeadline<T extends {
  bomCostLow: number; bomCostMid: number; bomCostHigh: number;
  fabCostLow: number; fabCostMid: number; fabCostHigh: number;
  totalLow: number; totalMid: number; totalHigh: number;
}>(band: T | null, bd: { bomCostPerBoard: number; pcbFabPerBoard: number; assemblyPerBoard: number; totalPerBoard: number } | null): T | null {
  if (!band || !bd || !(band.totalMid > 0)) return band;
  const r = (x: number) => Math.round(x * 100) / 100;
  const scale = (lo: number, mid: number, hi: number, newMid: number) =>
    mid > 0 ? [r(lo / mid * newMid), r(newMid), r(hi / mid * newMid)] : [r(newMid), r(newMid), r(newMid)];
  const [bl, bm, bh] = scale(band.bomCostLow, band.bomCostMid, band.bomCostHigh, bd.bomCostPerBoard);
  const [fl, fm, fh] = scale(band.fabCostLow, band.fabCostMid, band.fabCostHigh, bd.pcbFabPerBoard + bd.assemblyPerBoard);
  const other = bd.totalPerBoard - bm - fm;               // logistics, duty, energy, packaging, yield
  return { ...band, bomCostLow: bl, bomCostMid: bm, bomCostHigh: bh, fabCostLow: fl, fabCostMid: fm, fabCostHigh: fh,
    totalLow: r(bl + fl + other), totalMid: r(bd.totalPerBoard), totalHigh: r(bh + fh + other) };
}

function computeConfidenceBand(
  bom: BOMLineForBand[],
  fabCostMid: number,
  ocrQuality: string,
  volumeMultiplier: number,
): PCBConfidenceBand {
  let bomMid = 0, ocrCount = 0, weightedConfSum = 0, totalQtySum = 0, unconfirmedHighValue = 0;
  for (const line of bom) {
    const lineTotal = line.qty * line.unitPriceGBP;
    bomMid += lineTotal;
    if (line.ocrExtracted) ocrCount++;
    // lineConf can be undefined on a sparse AI response → NaN → serialises to
    // null → crashed the renderer's .toFixed(). Default to 0.5.
    weightedConfSum += (Number.isFinite(line.lineConf) ? line.lineConf : 0.5) * line.qty;
    totalQtySum += line.qty;
    const isHighValue = HIGH_VALUE_COMP_TYPES.has(line.componentType ?? '');
    const hasPN = String(line.partNumber ?? '').trim().length > 0;
    if (isHighValue && !line.ocrExtracted && !hasPN && lineTotal > 2.0) unconfirmedHighValue++;
  }
  const wConf = totalQtySum > 0 ? weightedConfSum / totalQtySum : 0.5;
  const bomLow = bomMid * 0.80;
  const bomHighMult = wConf >= 0.85 ? 1.15 : wConf >= 0.70 ? 1.30 : 1.50;
  const bomHigh = bomMid * bomHighMult;
  const fabLow = fabCostMid * 0.70;
  const fabHigh = fabCostMid * 1.40;
  const bomCL: 'High' | 'Medium' | 'Low' = wConf >= 0.85 && unconfirmedHighValue === 0 ? 'High' : wConf >= 0.65 && unconfirmedHighValue <= 1 ? 'Medium' : 'Low';
  const fabCL: 'High' | 'Medium' | 'Low' = ocrQuality === 'high' ? 'High' : ocrQuality === 'medium' ? 'Medium' : 'Low';
  const overall: 'High' | 'Medium' | 'Low' = bomCL === 'High' && fabCL !== 'Low' ? 'High' : (bomCL === 'Low' || fabCL === 'Low') ? 'Low' : 'Medium';
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    bomCostLow: r(bomLow), bomCostMid: r(bomMid), bomCostHigh: r(bomHigh),
    fabCostLow: r(fabLow), fabCostMid: r(fabCostMid), fabCostHigh: r(fabHigh),
    totalLow: r(bomLow + fabLow), totalMid: r(bomMid + fabCostMid), totalHigh: r(bomHigh + fabHigh),
    unconfirmedHighValueCount: unconfirmedHighValue,
    ocrConfirmedCount: ocrCount,
    weightedBOMConfidence: Math.round(wConf * 100) / 100,
    bomConfidenceLabel: bomCL, fabConfidenceLabel: fabCL, overallLabel: overall,
    volumeMultiplier,
  };
}

/**
 * Before pricing: carry every chip marking OCR read into the BOM (see
 * pcb-ocr-reconcile.ts), and correct a single-sided reflow claim when the BOM
 * itself places parts on the bottom side. Returns sanity warnings for markings
 * that no line could take, and for the links made by function.
 */
export function prepareBOMFromOCR(
  rawBOM: Array<Record<string, unknown>>,
  icMarkings: string[],
  assemblyData: Record<string, unknown>,
): { bom: Array<Record<string, unknown>>; warnings: SanityWarning[] } {
  // The model's own "read off the chip" flag stands only where a real OCR marking agrees.
  const claims = verifyOcrClaims(rawBOM, icMarkings ?? []);
  const rec = reconcileOcrMarkings(claims.bom, icMarkings ?? [], markingLabel, l => icKnownRange(l, { specificOnly: true }) != null);
  const warnings: SanityWarning[] = [];
  if (claims.revoked.length) warnings.push({ code: 'OCR_CLAIM_NOT_CONFIRMED', severity: 'warn',
    message: `${claims.revoked.length} line(s) were marked as read off the chip, but no marking the OCR stage read agrees: ${claims.revoked.slice(0, 10).join(', ')}${claims.revoked.length > 10 ? ', …' : ''}. Their part numbers are kept as readings to confirm.` });
  if (rec.attached.length) warnings.push({ code: 'OCR_MATCHED_BY_FUNCTION', severity: 'warn',
    message: `${rec.attached.length} chip marking(s) read in the photos were missing from the AI's BOM and were attached by function: ${rec.attached.map(a => `${a.marking} → ${a.refDes}`).join(', ')}. Confirm the RefDes.` });
  if (rec.missing.length) warnings.push({ code: 'OCR_PART_NOT_IN_BOM', severity: 'warn',
    message: `Chip marking(s) read in the photos but not in the BOM: ${rec.missing.join(', ')}. Add the line(s) or the BOM total is short.` });
  const bottom = rec.bom.some(l => /\bbottom[- ]side\b|\bunderside\b|\(bottom\)|\bon the bottom\b/i.test(`${l.description ?? ''} ${l.refDes ?? ''}`));
  if (bottom && Number(assemblyData.reflowSides ?? 1) < 2) {
    assemblyData.reflowSides = 2;
    warnings.push({ code: 'REFLOW_SIDES_CORRECTED', severity: 'warn',
      message: 'The BOM places parts on the bottom side, so reflow is double-sided (the AI said single-sided).' });
  }
  return { bom: rec.bom, warnings };
}

/** Measure the uploaded drill / Gerber files (never throws; null when none). */
function measureUploadedFabData(files: Record<string, Express.Multer.File[]> | undefined): FabMeasurement | null {
  const ups = files?.fabFiles ?? [];
  if (!ups.length) return null;
  try {
    const m = measureFabData(ups.map(f => ({ name: f.originalname, text: f.buffer.toString('latin1') })));
    console.log(`[PCB] Fab data: ${m.filesUsed.length}/${ups.length} files read — size ${m.widthMm}×${m.heightMm}, layers ${m.layers}, vias ${m.throughVias}`);
    return m;
  } catch (err) { console.warn('[PCB] Fab data measurement failed:', (err as Error).message); return null; }
}

/**
 * Ground truth before the model's guess: a supplied BOM file replaces the AI's
 * BOM (identity + quantity; the model's reading fills a package or estimates a
 * price for the same ref-des), and measured fab data replaces the guessed size,
 * layer count and via count. Both are reported in the warnings list so the
 * screen says what was measured and what was read.
 */
export function applyGroundTruth(
  a: Record<string, unknown>,
  parsed: ParsedBOMLine[],
  fab: FabMeasurement | null,
  domain: string,
): SanityWarning[] {
  const warnings: SanityWarning[] = [];
  const boardSpec = (a.boardSpec ?? {}) as Record<string, unknown>;
  const asm = (a.assembly ?? {}) as Record<string, unknown>;
  if (parsed.length > 0) {
    const aiBom = Array.isArray(a.bom) ? (a.bom as Array<Record<string, unknown>>) : [];
    const t = bomFromFile(parsed, aiBom, domain === 'automotive_adas');
    a.bom = t.bom;
    const fromImage = parsed.some(l => (l as { fromImage?: boolean }).fromImage);
    a.bomSource = fromImage ? 'image' : 'file';
    if (t.smtPlacements > 0) asm.smtPlacements = t.smtPlacements;
    if (t.bgaCount > 0) asm.bgaCount = t.bgaCount;
    if (t.throughHoleLines > 0 && !(Number(asm.throughHoleJoints) > 0)) asm.throughHoleJoints = t.throughHoleLines * 2;
    if (t.bottomSide && Number(asm.reflowSides ?? 1) < 2) asm.reflowSides = 2;
    warnings.push({ code: 'BOM_FROM_FILE', severity: 'warn',
      message: `BOM taken from your ${fromImage ? 'BOM image (transcribed by the AI reader; prices come from the catalogue and rate tables, never from the reader)' : 'file'}: ${t.bom.length} lines, ${t.smtPlacements} SMT placements. The photos were used for the board build and to fill gaps, not to write the BOM.` });
    // A BOM without designators is checked by count: the photos counting clearly more parts than the
    // BOM lists is the signal (its own count stays the costed one).
    const fileParts = t.bom.reduce((n, l) => n + (Number(l.qty) || 0), 0);
    if (!t.fileHasDesignators && t.aiPlacements > fileParts * 1.2 + 2) warnings.push({ code: 'AI_COUNT_ABOVE_BOM_FILE', severity: 'warn',
      message: `Your BOM lists ${fileParts} parts with no designators; the photos count about ${t.aiPlacements}. The BOM's count is costed — check it is complete.` });
    if (t.aiOnly.length) warnings.push({ code: 'AI_PARTS_NOT_IN_BOM_FILE', severity: 'warn',
      message: `The photos show parts your BOM file does not list: ${t.aiOnly.slice(0, 12).join(', ')}${t.aiOnly.length > 12 ? ', …' : ''}. If they are fitted, the file is short.` });
  }
  if (fab) {
    const changed = applyFabMeasurement(boardSpec, fab);
    if (changed.length) warnings.push({ code: 'FAB_DATA_MEASURED', severity: 'warn',
      message: `Measured from the fab data (${fab.filesUsed.join(', ')}): ${changed.join('; ')}.${fab.notes.length ? ` Notes: ${fab.notes.join('; ')}.` : ''}` });
    else warnings.push({ code: 'FAB_DATA_UNREAD', severity: 'warn',
      message: `Fab files were attached but nothing could be measured (${fab.notes.join('; ') || 'no drill, outline or copper layer recognised'}). The board build stays estimated from the photos.` });
  }
  return warnings;
}

/**
 * Stage 3 with structured output: the schema in pcb-analysis-schema.ts is sent
 * as output_config.format, so the answer parses by construction. A model or
 * proxy that rejects the parameter (400 naming it) gets the plain call, and the
 * salvage / repair path behind it stays as the second line.
 */
/**
 * A BOM uploaded as a picture: transcribed (pcb-bom-image.ts — no prices) and cleaned. null when the
 * upload is not an image. A picture that is not a BOM table, or a failed read, returns no lines and a
 * note saying so — the BOM is then read from the board photos as if no BOM had been attached.
 */
async function bomFromImageUpload(anthropic: Anthropic, upload: Express.Multer.File | undefined, deep: boolean, tag: string):
  Promise<{ lines: ParsedBOMLine[]; notes: string[] } | null> {
  if (!upload || !isBomImage(upload)) return null;
  try {
    const r = await readBomImage(anthropic, upload, deep ? DEEP_EXTRACT_MODEL : OCR_MODEL);
    console.log(`[PCB${tag}] BOM image read: ${r.lines.length} lines from ${upload.originalname}`);
    if (!r.isBomTable) return { lines: [], notes: ['the attached picture was not read as a BOM table, so the BOM comes from the board photos', ...r.notes] };
    return { lines: r.lines, notes: [`${r.lines.length} rows transcribed from ${upload.originalname} — check part numbers against the picture`, ...r.notes] };
  } catch (err) {
    console.warn(`[PCB${tag}] BOM image read failed:`, (err as Error).message);
    return { lines: [], notes: [`the BOM picture could not be read (${(err as Error).message.slice(0, 80)}), so the BOM comes from the board photos`] };
  }
}

type Stage3Params = { model: string; max_tokens: number; system: string; messages: Anthropic.MessageParam[] };
// Streamed: the API reference requires streaming above ~16K output tokens, and a
// full automotive BOM is asked for with 32K. The whole message is still awaited.
async function stage3Message(anthropic: Anthropic, params: Stage3Params, tag: string): Promise<Anthropic.Message> {
  try {
    return await anthropic.messages.stream({ ...params, output_config: pcbAnalysisOutputConfig() }).finalMessage();
  } catch (err) {
    if (!isOutputFormatRejection(err)) throw err;
    console.warn(`[PCB${tag}] structured output not accepted (${(err as Error).message.slice(0, 120)}) — falling back to free-text JSON`);
    return await anthropic.messages.stream(params).finalMessage();
  }
}

/**
 * Placement count from the BOM itself. The model reported a separate
 * `smtPlacements` (224 on the radar run) that did not equal its own list (222
 * SMT + 2 through-hole + 2 unfitted pads). The assembly cost is per placement, so
 * it is derived from the priced lines, deterministically; the model's figure is
 * kept for the record and a warning says when the two disagree.
 */
export function derivePlacementsFromBOM(bom: Array<Record<string, unknown>>, assemblyData: Record<string, unknown>): SanityWarning[] {
  let smt = 0, th = 0, bga = 0;
  for (const l of bom) {
    // Checked directly: placements are now counted BEFORE pricing marks a line not-fitted.
    if (l.notFitted === true || l.priceSource === 'not-fitted' || isNotFitted(l)) continue;
    const qty = Math.max(0, Number(l.qty) || 0);
    const ct = String(l.componentType ?? '');
    if (ct === 'through_hole') th += qty;
    else if (ct === 'manual_solder' || ct === 'mechanical') continue;
    else smt += qty;
    if (ct === 'ic_bga') bga += qty;
  }
  const out: SanityWarning[] = [];
  const aiSmt = Number(assemblyData.smtPlacements) || 0;
  if (smt > 0) {
    if (aiSmt > 0 && Math.abs(aiSmt - smt) / Math.max(aiSmt, smt) > 0.10) {
      out.push({ code: 'PLACEMENTS_FROM_BOM', severity: 'warn',
        message: `SMT placements set to ${smt} from the BOM lines (the AI reported ${aiSmt}). Assembly is costed per placement, so the count follows the priced list.` });
    }
    assemblyData.aiSmtPlacements = aiSmt;
    assemblyData.smtPlacements = smt;
  }
  if (bga > 0) assemblyData.bgaCount = Math.max(bga, Number(assemblyData.bgaCount) || 0);
  if (th > 0 && !(Number(assemblyData.throughHoleJoints) > 0)) assemblyData.throughHoleJoints = th * 2;
  return out;
}

/**
 * Automotive grade in the headline. `computePCBCountryCost` prices a commercial
 * board; IATF 16949 line premium, IPC class 3 workmanship, serialisation, burn-in
 * (ASIL-C/D), automotive laminate and coupon testing were computed for side
 * panels but never added to the headline — the radar board's £68.21 was a
 * consumer-grade cost with an "automotive premium" of £4 shown next to it. Now
 * the premiums are folded into the breakdown (fab and assembly), duty is
 * re-based on the graded value, and the panels report what was added.
 */
export function applyAutomotiveGrade(
  bd: PCBCountryCostBreakdown,
  boardSpec: Record<string, unknown>,
  assemblyData: Record<string, unknown>,
  asil: ASILLevel,
  orderQty: number,
  domain: string,
): { assembly: AutomotiveAssemblyCost; fab: AutomotiveFabAdjustment } | null {
  if (domain !== 'automotive_adas') return null;
  const assembly = computeAutomotiveAssemblyCost(assemblyData, asil, orderQty, bd.assemblyPerBoard, bd.countryId);
  const fab = computeAutomotiveFabAdjustment(boardSpec, bd.pcbFabPerBoard, domain, bd.panelInfo?.boardsPerPanel ?? 1, bd.countryId);
  const asmPremium = Math.max(0, assembly.totalAutomotiveAssemblyGBP - assembly.standardAssemblyGBP);
  const fabPremium = Math.max(0, fab.totalAutomotiveFabGBP - fab.standardFabGBP);
  const duty = PCB_COUNTRY_RATES[bd.countryId]?.logistics.importDutyFraction ?? 0;
  const dutyDelta = (asmPremium + fabPremium) * duty;
  const r = (n: number) => Math.round(n * 100) / 100;
  bd.pcbFabPerBoard = r(bd.pcbFabPerBoard + fabPremium);
  bd.assemblyPerBoard = r(bd.assemblyPerBoard + asmPremium);
  bd.logisticsPerBoard = r(bd.logisticsPerBoard + dutyDelta);
  bd.totalPerBoard = r(bd.totalPerBoard + fabPremium + asmPremium + dutyDelta);
  bd.breakdown.automotiveFab = r(fabPremium);
  bd.breakdown.automotiveAssembly = r(asmPremium);
  bd.breakdown.importDuty = r(bd.breakdown.importDuty + dutyDelta);
  bd.automotiveGrade = { asil, fabPremiumGBP: r(fabPremium), assemblyPremiumGBP: r(asmPremium) };
  return { assembly, fab };
}

/** The same premiums on a volume-curve point (which carries no breakdown). */
export function gradeVolumeCurve(points: VolumeCurvePoint[], boardSpec: Record<string, unknown>, assemblyData: Record<string, unknown>, asil: ASILLevel, domain: string, boardsPerPanel: number, countryId = 'gb'): VolumeCurvePoint[] {
  if (domain !== 'automotive_adas') return points;
  const r = (n: number) => Math.round(n * 100) / 100;
  return points.map(pt => {
    const a = computeAutomotiveAssemblyCost(assemblyData, asil, pt.qty, pt.assemblyPerBoard, countryId);
    const f = computeAutomotiveFabAdjustment(boardSpec, pt.pcbFabPerBoard, domain, boardsPerPanel, countryId);
    const asmP = Math.max(0, a.totalAutomotiveAssemblyGBP - a.standardAssemblyGBP);
    const fabP = Math.max(0, f.totalAutomotiveFabGBP - f.standardFabGBP);
    // Duty on the premiums, as the headline charges it (applyAutomotiveGrade) — the
    // curve was £0.10 under the headline at its own quantity.
    const dutyP = (asmP + fabP) * (PCB_COUNTRY_RATES[countryId]?.logistics.importDutyFraction ?? 0);
    return { ...pt, assemblyPerBoard: r(pt.assemblyPerBoard + asmP), pcbFabPerBoard: r(pt.pcbFabPerBoard + fabP),
      logisticsPerBoard: r(pt.logisticsPerBoard + dutyP), totalPerBoard: r(pt.totalPerBoard + asmP + fabP + dutyP) };
  });
}

/**
 * `costEstimates` is what the screen, the PDFs and Save-to-Library fall back to.
 * It came from the model (its guess at fab, assembly and BOM) with only the BOM
 * total overwritten. Now every field is the deterministic figure for the
 * selected country; the model's first pass is kept under `aiFirstPass` for audit.
 */
export function setDeterministicCostEstimates(a: Record<string, unknown>, bd: PCBCountryCostBreakdown | null, bomTotal: number): void {
  const prev = (a.costEstimates && typeof a.costEstimates === 'object' ? a.costEstimates : {}) as Record<string, unknown>;
  const r = (n: number) => Math.round(n * 100) / 100;
  const fab = bd ? bd.pcbFabPerBoard : Number((prev.pcbFabGBP as { mid?: number } | undefined)?.mid) || 0;
  a.costEstimates = {
    ...prev,
    pcbFabGBP: { min: r(fab * 0.8), mid: r(fab), max: r(fab * 1.3) },
    totalBOMCostGBP: r(bomTotal),
    smtAssemblyCostGBP: bd ? bd.assemblyPerBoard : Number(prev.smtAssemblyCostGBP) || 0,
    basis: bd ? `deterministic — ${bd.countryName}` : 'deterministic',
    aiFirstPass: prev.aiFirstPass ?? { pcbFabGBP: prev.pcbFabGBP, totalBOMCostGBP: prev.totalBOMCostGBP, smtAssemblyCostGBP: prev.smtAssemblyCostGBP },
  };
}

// Apply volume correction and flag unconfirmed high-value ICs in the BOM array
function flagAndEnrichBOM(
  bom: Array<Record<string, unknown>>,
  volumeMultiplier: number,
  orderQty?: number,
): Array<Record<string, unknown>> {
  return bom.map(line => {
    const unitPrice = Number(line.unitPriceGBP ?? 0);
    const qty = Number(line.qty ?? 1);
    // A part's price break follows the parts bought — qty per board × boards —
    // not the board count: 40 × 0402 on 1,000 boards is a 40,000-part buy
    // (PCB review, Oct 2026). Without an order quantity, the board-level factor.
    const k = orderQty && orderQty > 0 ? getVolumeMultiplier(Math.max(1, qty) * orderQty) : volumeMultiplier;
    const adj = unitPrice * k;
    const lineTotal = adj * qty;
    const isHighValue = HIGH_VALUE_COMP_TYPES.has(String(line.componentType ?? ''));
    const hasPN = String(line.partNumber ?? '').trim().length > 0;
    const isOCR = Boolean(line.ocrExtracted);
    return {
      ...line,
      unitPriceGBP: Math.round(adj * 100000) / 100000,
      lineTotalGBP: Math.round(lineTotal * 10000) / 10000,
      volumeMultiplier: k,
      partsBought: orderQty && orderQty > 0 ? Math.max(1, qty) * orderQty : undefined,
      volumeAdjusted: k !== 1.0,
      unconfirmedHighValue: isHighValue && !isOCR && !hasPN && lineTotal > 2.0,
    };
  });
}

// ── Extraction model selection ────────────────────────────────────────────────
// Sonnet 5 is the workhorse for vision extraction (near-Opus on structured
// extraction, faster, cheaper). "Deep analysis" escalates the extraction stages
// to Opus 4.8 for complex/high-value boards — deeper reasoning on ambiguous
// components. The Stage 3b refinement of unconfirmed ICs ALWAYS runs on Opus:
// it is small (2K tokens) and sits exactly where analyses fail.
// 2026-09-30: Sonnet 5.5 (same price and image resolution as Sonnet 5, current
// Sonnet) for extraction; Opus 5.5 for deep analysis — newer than Opus 4.8,
// cheaper ($4/$20 vs $5/$25) and the Opus line is the one documented as stronger
// at counting and measuring. Neither takes `temperature`; none is sent.
export const EXTRACT_MODEL = 'claude-sonnet-5-5';
export const DEEP_EXTRACT_MODEL = 'claude-opus-5-5';
// Chip-marking OCR moved off Haiku: a mis-read marking is the costliest single
// error in the pipeline (a TEF8105 read as "MMIC" was a £4 line, not £8–£19).
export const OCR_MODEL = 'claude-sonnet-5-5';
const extractionModel = (deep: boolean): string => (deep ? DEEP_EXTRACT_MODEL : EXTRACT_MODEL);

// A fully-populated automotive/HDI board can enumerate hundreds of components at
// automotive grade. At the old 16384-token ceiling that BOM was cut off
// mid-array — the JSON failed to parse and the analysis rolled back to an empty
// BOM, "again and again". Both Sonnet 5 and Opus 4.8 support up to 128K output
// tokens; 32000 roughly doubles the headroom while staying well under the
// SDK's non-streaming timeout envelope (it only spends what the model emits).
// Truncation-tolerant salvage (pcb-salvage.ts) backs this up for the rare board
// that still overflows.
const EXTRACT_MAX_TOKENS = 32000;

// Read the model's text output ROBUSTLY. Sonnet 5 / Opus 4.8 can return a
// non-text block first (e.g. a thinking/redacted block), so `content[0]` is not
// guaranteed to be the text. Reading only content[0] silently discarded the
// whole BOM — the model spent output tokens but the route saw "" → empty BOM,
// "again and again". Concatenate every text block instead.
function textOf(msg: { content: Array<{ type: string; text?: string }> }): string {
  return msg.content.map(b => (b.type === 'text' ? (b.text ?? '') : '')).join('');
}

// Confidence gate for the heavy automotive path. A low-confidence 'automotive'
// guess (e.g. a lone connector or heatsink on an otherwise simple board) must
// NOT trigger the full AEC-Q enumeration + ASIL classification + extra IC pass:
// that misclassified simple boards as "complex automotive", ran two extra AI
// calls, and told the model to enumerate & up-price every component at
// automotive grade — ballooning output until Stage 3 truncated to an empty BOM.
// Only boards the classifier is genuinely sure about get the automotive machine.
const AUTOMOTIVE_CONF_MIN = 0.7;

// Unambiguous automotive-silicon part-number signatures. If OCR reads one of
// these, the board is automotive regardless of what the top-image classifier
// guessed — radar MCUs/transceivers, automotive MCUs/SoCs, safety SBCs/PMICs,
// automotive Ethernet/CAN PHYs. Matched case-insensitively against IC markings.
const AUTOMOTIVE_SILICON_RE =
  /\bF?S32[RKGVZ]\d|\bMPC5\d{3}|\bSPC5\d{1,2}|\bTC2\d{2}|\bTC3\d{2}|\bTC4\d\b|\bAURIX|\bMR3003|\bMR2001|\bTEF81|\bTEF82|\bTDA[234]\b|\bEYEQ[45]?|R[- ]?CAR|\bRH850|\bSJA11(?:05|10)|\bTJA1(?:04|10|14)\d|\bFS(?:65|85)\b|\bTLF35584|\bAWR[12]\d{3}|\bIWR[16]\d{3}/i;

/** True when an IC marking is an unmistakable automotive part number. */
export function looksAutomotiveSilicon(markings: string[]): boolean {
  return markings.some(m => typeof m === 'string' && AUTOMOTIVE_SILICON_RE.test(m));
}

function gateAutomotive(s: Stage1Result, tag = 'PCB'): void {
  if (s.domain === 'automotive_adas' && s.conf < AUTOMOTIVE_CONF_MIN) {
    console.log(`[${tag}] Automotive guess conf=${s.conf} < ${AUTOMOTIVE_CONF_MIN} — treating as a general board (no forced AEC-Q grading; saves tokens & extra calls)`);
    s.domain = 'general';
  }
}
const isDeep = (req: { body?: Record<string, unknown> }): boolean =>
  req.body?.deepAnalysis === 'true' || req.body?.deepAnalysis === true;

// ── Image analysis cache (SHA-256 of image buffers + params) ─────────────────
// Persistent repeatability cache — shared implementation with CAD-to-Cost.
// Same photo + qty + country -> identical result, across server restarts.
const pcbCache = createAnalysisCache('pcb_analysis_cache');
const buildCacheKey = (buffers: Buffer[]): string => pcbCache.buildKey(buffers);
const getCached = (key: string): unknown | null => pcbCache.get(key);
const setCached = (key: string, payload: unknown): void => pcbCache.set(key, payload);

// ── Board sanity checks ────────────────────────────────────────────────────────
interface SanityWarning { code: string; message: string; severity: 'warn' | 'error' }
export function runSanityChecks(
  boardSpec: Record<string, unknown>,
  assembly: Record<string, unknown>,
  bom: Array<Record<string, unknown>>,
  aiTotalBOM: number,
  orderQty?: number,
): SanityWarning[] {
  const warnings: SanityWarning[] = [];
  // The quantity is the ANNUAL production volume. A teardown sample's "Quantity 1"
  // entered here prices the board as a prototype run (BOM ×8, setup ÷1, minimum
  // freight ÷1) — say so rather than let it pass as a should-cost.
  if (typeof orderQty === 'number' && orderQty < 100) {
    warnings.push({ code: 'PROTOTYPE_VOLUME', severity: 'warn',
      message: `Annual volume ${orderQty} is a prototype quantity — components, setup and freight are priced for ${orderQty} board(s). Enter the production volume per year for a should-cost.` });
  }
  const widthMm = Number(boardSpec.widthMm) || 100;
  const heightMm = Number(boardSpec.heightMm) || 80;
  const areaCm2 = (widthMm * heightMm) / 100;
  const smtPlacements = Number(assembly.smtPlacements) || 0;
  // >30 placements/cm² is physically impossible for standard SMD
  if (areaCm2 > 0 && smtPlacements / areaCm2 > 30 && smtPlacements > 50) {
    warnings.push({ code: 'DENSITY_TOO_HIGH', severity: 'warn',
      message: `SMT density ${(smtPlacements/areaCm2).toFixed(1)}/cm² exceeds physical limit for ${widthMm}×${heightMm}mm — AI may have over-counted` });
  }
  // BOM line-item sum vs AI-stated total
  const lineSum = bom.reduce((s, l) => s + Number(l.qty ?? 0) * Number(l.unitPriceGBP ?? 0), 0);
  if (lineSum > 0 && aiTotalBOM > 0) {
    const disc = Math.abs(lineSum - aiTotalBOM) / Math.max(aiTotalBOM, lineSum);
    if (disc > 0.20) {
      warnings.push({ code: 'BOM_TOTAL_MISMATCH', severity: 'warn',
        message: `AI BOM total £${aiTotalBOM.toFixed(2)} differs from line-item sum £${lineSum.toFixed(2)} by ${(disc*100).toFixed(0)}% — line-item sum used` });
    }
  }
  // Implausibly small board with many layers
  const layers = Number(boardSpec.estimatedLayers) || 2;
  if (areaCm2 < 4 && layers >= 8) {
    warnings.push({ code: 'LAYERS_SUSPECT', severity: 'warn',
      message: `${layers}-layer board on ${(areaCm2).toFixed(1)}cm² seems unlikely — verify layer count` });
  }
  return warnings;
}

// ── Stage 3b: Focused refinement of UNCONFIRMED high-value ICs ───────────────
async function refineUnconfirmedICs(
  anthropic: Anthropic,
  imageFiles: Express.Multer.File[],
  imageLabels: string[],
  domain: string,
  unconfirmedLines: Array<Record<string, unknown>>,
): Promise<Map<string, { partNumber: string; markingRead: string; lineConf: number }>> {
  if (unconfirmedLines.length === 0) return new Map();
  const specialistSystem = SPECIALIST_SYSTEM_PROMPTS[domain] ?? SPECIALIST_SYSTEM_PROMPTS['general'];
  const lineDesc = unconfirmedLines.map((l, i) =>
    `Line ${i+1}: ${l.refDes ?? '?'} — ${l.description ?? ''} (${l.pkg ?? ''})`
  ).join('\n');
  const prompt = `SECOND-PASS IC IDENTIFICATION — ${unconfirmedLines.length} unconfirmed high-value component(s)

The initial analysis could not confirm part numbers for these components. Please inspect the PCB image(s) very carefully for markings on or near each component:

${lineDesc}

Look for chip top markings, silk screen labels and maker logos in every photo, close-ups first.
Do NOT price anything — the tool prices from its own tables.
Return ONLY a JSON array (same order as the list above):
[{"refDes":"U1","markingRead":"<the exact characters you can read on the package>","identifiedPartNumber":"<part number those characters spell, or empty>","lineConf":0.0}]
Rules:
- identifiedPartNumber must come from characters you can actually read on that package. Never infer a part number from the board's function, the package size or what such a board usually carries.
- If the marking is unreadable, partly hidden or blurred, set markingRead and identifiedPartNumber to "" — an empty answer is correct and expected.
- lineConf is how sure you are of the reading (0–1).`;
  try {
    const msg = await anthropic.messages.create({
      model: DEEP_EXTRACT_MODEL, max_tokens: 2048, system: specialistSystem,
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, imageFiles.length > 1),
        { type: 'text', text: prompt },
      ]}],
    });
    const raw = textOf(msg) || '[]';
    let arr: Array<{ refDes: string; identifiedPartNumber: string; markingRead?: string; lineConf: number }> = [];
    try {
      const start = raw.indexOf('['), end = raw.lastIndexOf(']');
      if (start !== -1 && end > start) arr = JSON.parse(raw.slice(start, end + 1)) as typeof arr;
    } catch { /* ignore */ }
    const out = new Map<string, { partNumber: string; markingRead: string; lineConf: number }>();
    for (const r of arr) {
      if (r.refDes) out.set(String(r.refDes), {
        partNumber: String(r.identifiedPartNumber ?? '').trim(),
        markingRead: String(r.markingRead ?? '').trim(),
        lineConf: Math.min(1, Math.max(0, Number(r.lineConf) || 0.5)),
      });
    }
    return out;
  } catch (err) {
    console.warn('[PCB] Stage 3b failed:', (err as Error).message);
    return new Map();
  }
}

// ── NPI vs production cost split ─────────────────────────────────────────────
interface NPIBreakdown {
  stencilCost: number;
  firstArticleCost: number;
  toolingTotal: number;
  unitCostNPI: number;    // cost at 50 units (NPI run)
  unitCostProd: number;   // cost at orderQty
  setupPerUnit50: number; // NRE amortised over 50 units
}
function computeNPIBreakdown(bomTotal: number, fabMid: number, smtPlacements: number, _orderQty: number, headlinePerBoard?: number): NPIBreakdown {
  const stencilCost = smtPlacements > 300 ? 220 : smtPlacements > 100 ? 160 : 120;
  const firstArticleCost = 280; // first-article inspection
  const toolingTotal = stencilCost + firstArticleCost;
  const prototypeSurcharge = 0.38; // fab and assembly premium for small runs
  // "Production" is the headline (BOM, fab, assembly, logistics, energy, yield for the
  // selected country). It was BOM + a fab estimate — £72.93 next to a £70.89 headline.
  const unitCostBase = headlinePerBoard && headlinePerBoard > 0 ? headlinePerBoard : bomTotal + fabMid;
  const unitCostProd = unitCostBase;
  const unitCostNPI = unitCostBase * (1 + prototypeSurcharge) + toolingTotal / 50;
  const setupPerUnit50 = toolingTotal / 50;
  return { stencilCost, firstArticleCost, toolingTotal, unitCostNPI: Math.round(unitCostNPI*100)/100, unitCostProd: Math.round(unitCostProd*100)/100, setupPerUnit50: Math.round(setupPerUnit50*100)/100 };
}

// ── Post-analysis automotive grade enforcement ────────────────────────────────
export function enforceAutomotiveGrading(
  bom: Array<Record<string, unknown>>,
  domain: string,
): { bom: Array<Record<string, unknown>>; forcedCount: number } {
  if (domain !== 'automotive_adas') return { bom, forcedCount: 0 };
  let forcedCount = 0;
  const updated = bom.map(line => {
    if (line.automotive === true) return line;
    // Only a line the model EXPLICITLY priced as consumer grade is uplifted. A
    // missing flag (the specialist prompt already demands automotive pricing) was
    // multiplied ×2.5–3.5 on top of an automotive price, and so were parts read
    // off the chip or live-priced, whose price is not a grade guess at all.
    const unstated = line.automotive !== false || line.automotiveUnstated === true;
    if (unstated || line.ocrExtracted === true || line.livePriced === true) {
      return { ...line, automotive: true, automotiveGradeAssumed: unstated };
    }
    const ct = String(line.componentType ?? '');
    const mult = ct.startsWith('ic_') || ct === 'power_module' ? 3.5
      : ct.startsWith('passive_') ? 2.5
      : ct === 'crystal_osc' ? 3.0
      : ct === 'connector_smt' ? 2.0 : 1.0;
    if (mult === 1.0) return line;
    const adj = Number(line.unitPriceGBP ?? 0) * mult;
    forcedCount++;
    return {
      ...line,
      unitPriceGBP: Math.round(adj * 10000) / 10000,
      lineTotalGBP: Math.round(adj * Number(line.qty ?? 1) * 100) / 100,
      automotive: true,
      automotiveGradeForced: true,
    };
  });
  return { bom: updated, forcedCount };
}

// ── ASIL classification (Stage 1b) ────────────────────────────────────────────
type ASILLevel = 'QM' | 'ASIL-A' | 'ASIL-B' | 'ASIL-C' | 'ASIL-D' | 'Unknown';
interface Stage1bASIL {
  asilLevel: ASILLevel;
  asilRationale: string;
  safetyFunctions: string[];
}
async function classifyASILLevel(
  anthropic: Anthropic,
  imageFiles: Express.Multer.File[],
  imageLabels: string[],
  domainSummary: string,
): Promise<Stage1bASIL> {
  const prompt = `You are an automotive functional safety expert (ISO 26262). Analyse this PCB and classify its ASIL level.

Board domain: ${domainSummary}

Look for: safety-critical MCUs (AURIX, S32K, lockstep cores), redundant power rails, safety PMICs (TLF35584, FS85), watchdog ICs, isolated CAN/Ethernet, ADAS SoCs.

Return ONLY valid JSON:
{"asilLevel":"ASIL-B","asilRationale":"Dual-core lockstep MCU with safety PMIC suggests ASIL-B/C chassis control","safetyFunctions":["Electronic power steering","Fault detection"]}

ASIL levels: QM (no safety), ASIL-A (low), ASIL-B (medium), ASIL-C (high), ASIL-D (highest).`;
  // Salvage the ASIL level/rationale by regex when strict JSON.parse fails — the
  // model occasionally wraps the JSON in prose or truncates the safetyFunctions
  // array, and a single formatting quirk must NOT blank the safety classification
  // on a genuinely safety-critical board.
  const salvage = (raw: string): Stage1bASIL => {
    const lvl = /"?asilLevel"?\s*:\s*"?(ASIL-?[ABCD]|QM)"?/i.exec(raw)?.[1]?.replace('ASIL', 'ASIL-').replace('ASIL--', 'ASIL-');
    const rat = /"?asilRationale"?\s*:\s*"([^"]{0,400})"/i.exec(raw)?.[1] ?? '';
    const fnsBlock = /"safetyFunctions"\s*:\s*\[([^\]]*)/i.exec(raw)?.[1] ?? '';
    const fns = [...fnsBlock.matchAll(/"([^"]{2,60})"/g)].map(m => m[1]);
    return { asilLevel: (lvl as ASILLevel) ?? 'Unknown', asilRationale: rat, safetyFunctions: fns };
  };
  let raw = '{}';
  try {
    const msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-haiku-4-5-20251001', max_tokens: 768,
      system: 'You are an automotive functional safety engineer. Return ONLY valid JSON — one object, no prose.',
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, imageFiles.length > 1),
        { type: 'text', text: prompt },
      ]}],
    });
    raw = textOf(msg) || '{}';
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Stage1bASIL;
      return {
        asilLevel: parsed.asilLevel ?? 'Unknown',
        asilRationale: parsed.asilRationale ?? '',
        safetyFunctions: Array.isArray(parsed.safetyFunctions) ? parsed.safetyFunctions : [],
      };
    }
  } catch (err) {
    const s = salvage(raw);
    if (s.asilLevel !== 'Unknown') {
      console.warn('[PCB] Stage 1b JSON parse failed — salvaged ASIL from text:', s.asilLevel);
      return s;
    }
    console.warn('[PCB] Stage 1b ASIL classification failed:', (err as Error).message);
  }
  return salvage(raw);
}

// ── Automotive NRE breakdown ──────────────────────────────────────────────────
interface AutomotiveNRE {
  ppapCost: number;
  fmeaCost: number;
  dvprCost: number;
  asilAuditCost: number;
  totalNRE: number;
  asilLevel: ASILLevel;
}
function computeAutomotiveNRE(asilLevel: ASILLevel, bomTotal: number, countryId = 'gb'): AutomotiveNRE {
  // PPAP, FMEA, DVP&R and the ASIL audit are the supplier's engineering — UK £ figures
  // priced at the board country's engineer rate (regional-services.ts).
  const eng = countryFactor('engineer', pcbRegionOf(countryId));
  const tier = asilLevel === 'ASIL-D' ? 4 : asilLevel === 'ASIL-C' ? 3 : asilLevel === 'ASIL-B' ? 2 : asilLevel === 'ASIL-A' ? 1 : 0;
  if (tier === 0) {
    // QM / Unknown — minimal automotive paperwork
    const ppap = Math.round(1500 * eng); const fmea = Math.round(2500 * eng); const dvpr = Math.round(3000 * eng); const audit = 0;
    return { ppapCost: ppap, fmeaCost: fmea, dvprCost: dvpr, asilAuditCost: audit, totalNRE: ppap + fmea + dvpr + audit, asilLevel };
  }
  const ppapCost  = [0, 3000,  6000, 10000, 18000][tier];
  const fmeaCost  = [0, 5000, 10000, 18000, 32000][tier];
  const dvprCost  = [0, 8000, 16000, 28000, 50000][tier];
  const asilAudit = [0, 2500,  5000, 10000, 20000][tier];
  // Scale gently with BOM complexity: +1% per £8 of BOM, capped at +50%. The
  // old bomTotal/50 with a 2.0 cap saturated to a silent 2x for any board over
  // £100 BOM — doubling PPAP/FMEA/DVP&R for essentially every real board.
  const scale     = (1 + Math.min(0.5, bomTotal / 800)) * eng;
  const r = (n: number) => Math.round(n * scale / 100) * 100;
  return {
    ppapCost: r(ppapCost), fmeaCost: r(fmeaCost),
    dvprCost: r(dvprCost), asilAuditCost: r(asilAudit),
    totalNRE: r(ppapCost) + r(fmeaCost) + r(dvprCost) + r(asilAudit),
    asilLevel,
  };
}

// ── Single-source risk flagging ───────────────────────────────────────────────
const SINGLE_SOURCE_RISK_ICS: Array<{ pattern: RegExp; vendor: string; premium: number }> = [
  { pattern: /AURIX|TC39[0-9]|TC38[0-9]|TC37[0-9]|TC2[6-9][0-9]/i, vendor: 'Infineon (sole AEC-Q ASIL-D MCU family)', premium: 0.20 },
  { pattern: /TDA4VM|TDA4AL|TDA4VH|TDA2[PEK]/i, vendor: 'TI (sole ASIL-D ADAS SoC at this class)', premium: 0.25 },
  { pattern: /EYEQ[3-6]|MQ[2-6]0[0-9]/i, vendor: 'Mobileye (sole-source NCAP-qualified EyeQ)', premium: 0.50 },
  { pattern: /SJA1105|SJA1110/i, vendor: 'NXP (sole automotive TSN switch this class)', premium: 0.15 },
  { pattern: /BGT60|BGT24/i, vendor: 'Infineon (dominant 77GHz radar frontend)', premium: 0.25 },
  { pattern: /TEF810|TEF81/i, vendor: 'NXP (radar transceiver, limited alternatives)', premium: 0.20 },
  { pattern: /TLF35584|TLF35577/i, vendor: 'Infineon (ASIL-D safety PMIC, very limited alternatives)', premium: 0.15 },
  { pattern: /V4H|R8A779G/i, vendor: 'Renesas (sole R-Car V4H ADAS platform)', premium: 0.30 },
];
interface SingleSourceWarning {
  refDes: string;
  partDescription: string;
  vendor: string;
  premium: number;
  unitPriceGBP: number;
  premiumAmountGBP: number;
}
function flagSingleSourceRisks(bom: Array<Record<string, unknown>>): SingleSourceWarning[] {
  const warnings: SingleSourceWarning[] = [];
  for (const line of bom) {
    const desc = String(line.description ?? '') + ' ' + String(line.partNumber ?? '');
    const match = SINGLE_SOURCE_RISK_ICS.find(r => r.pattern.test(desc));
    if (match) {
      const unitPrice = Number(line.unitPriceGBP ?? 0);
      warnings.push({
        refDes: String(line.refDes ?? ''),
        partDescription: desc.trim(),
        vendor: match.vendor,
        premium: match.premium,
        unitPriceGBP: unitPrice,
        premiumAmountGBP: Math.round(unitPrice * match.premium * 100) / 100,
      });
    }
  }
  return warnings;
}

// ── Conformal coating cost model ──────────────────────────────────────────────
function computeConformalCoatingCost(
  boardSpec: Record<string, unknown>,
  domain: string,
  asilLevel: ASILLevel,
  countryId = 'gb',
): number {
  if (domain !== 'automotive_adas') return 0;
  // Only a board that IS coated pays for coating. This used to charge every
  // automotive board; the model now reports conformalCoating from the photos
  // (a UV photo shows it fluorescing) and the user can correct it.
  if (boardSpec.conformalCoating !== true) return 0;
  const widthMm = Number(boardSpec.widthMm) || 100;
  const heightMm = Number(boardSpec.heightMm) || 80;
  const areaCm2 = (widthMm * heightMm) / 100;
  // Base coating cost: selective UV acrylic £0.08–0.15/cm², polyurethane £0.12–0.22/cm²
  // ASIL-D requires conformal + edge seal; ASIL-A/B selective is fine
  const ratePerCm2 = asilLevel === 'ASIL-D' || asilLevel === 'ASIL-C' ? 0.20 : 0.12;
  // UK £/cm² (material + selective-coat line) priced in the board's country.
  const coatingCost = areaCm2 * ratePerCm2 * countryFactor('process', pcbRegionOf(countryId));
  // Capped at £280/board. (The old £18 floor was a per-BATCH setup charge applied
  // per board.)
  return Math.min(280, Math.round(coatingCost * 100) / 100);
}

/** The manufacturing region of a PCB country id (cn → CN, gb → UK) — for the flat £ premiums
 *  below, which are UK figures priced in the board's country (regional-services.ts). */
function pcbRegionOf(countryId: string): ManufacturingRegion {
  const code = (countryId === 'gb' ? 'UK' : countryId.toUpperCase()) as ManufacturingRegion;
  return REGIONAL_DATA[code] ? code : 'UK';
}

// ── Automotive Assembly Cost Model (IATF 16949) ───────────────────────────────
interface AutomotiveAssemblyCost {
  baseAssemblyGBP: number;
  iatfPremiumGBP: number;
  axiCostGBP: number;
  serialisationGBP: number;
  ipcClass3GBP: number;
  burnInGBP: number;
  totalAutomotiveAssemblyGBP: number;
  standardAssemblyGBP: number;
  premiumPctOverStandard: number;
}
export function computeAutomotiveAssemblyCost(
  assemblyData: Record<string, unknown>,
  asilLevel: ASILLevel,
  orderQty: number,
  countryAssemblyPerBoard: number,
  countryId = 'gb',
): AutomotiveAssemblyCost {
  // The flat £ items (X-ray fallback, serialisation, burn-in chamber) are UK figures,
  // priced in the board's country; the % premiums ride on the country's own figure.
  const proc = countryFactor('process', pcbRegionOf(countryId));
  const insp = countryFactor('inspection', pcbRegionOf(countryId));
  const smtPlacements = Number(assemblyData.smtPlacements) || 0;
  const bgaCount = Number(assemblyData.bgaCount) || 0;
  const thJoints = Number(assemblyData.throughHoleJoints) || 0;
  const manualJoints = Number(assemblyData.manualJoints) || 0;
  // The country assembly figure already contains SMT, AOI, X-ray and ICT. The panel
  // used to add a flat prototype X-ray (£8 + £1.2/BGA → £10.40 a board at 250k),
  // £0.80 serialisation and burn-in over 200 boards a shift on top of it.
  const haveCountry = countryAssemblyPerBoard > 0;
  const baseAssemblyGBP = haveCountry
    ? countryAssemblyPerBoard
    : smtPlacements * 0.018 + thJoints * 0.025 + manualJoints * 0.045;
  const standardAssemblyGBP = baseAssemblyGBP;
  const iatfPremiumGBP = standardAssemblyGBP * 0.20;              // IATF 16949 process control / traceability
  // Separate X-ray only when there is no country figure that already carries it.
  const axiCostGBP = !haveCountry && bgaCount > 0 ? Math.min(15, 8 + bgaCount * 1.2) * insp : 0;
  // Laser-mark + scan: ~6 s at a ~£30/hr station at volume; setup-dominated below 1,000.
  const serialisationGBP = (orderQty >= 1000 ? 0.05 : 0.80) * proc;
  // IPC Class 3 workmanship: ~5% more inspection time on the assembly.
  const ipcClass3GBP = standardAssemblyGBP * 0.05;
  // Burn-in / ESS is an ASIL-C/D practice; ASIL-B modules take an end-of-line test
  // (in ICT). Chamber ~£180/shift; racks hold ~500 small modules at volume.
  const burnInShifts = asilLevel === 'ASIL-D' ? 6 : asilLevel === 'ASIL-C' ? 4 : 0;
  const boardsPerShift = orderQty >= 1000 ? 500 : Math.max(1, Math.min(200, orderQty));
  const burnInGBP = burnInShifts > 0 ? Math.round((180 * insp * burnInShifts / boardsPerShift) * 100) / 100 : 0;
  const totalAutomotiveAssemblyGBP = standardAssemblyGBP + iatfPremiumGBP + axiCostGBP + serialisationGBP + ipcClass3GBP + burnInGBP;
  const premiumPctOverStandard = standardAssemblyGBP > 0 ? Math.round((totalAutomotiveAssemblyGBP / standardAssemblyGBP - 1) * 100) : 0;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    baseAssemblyGBP: r(baseAssemblyGBP), iatfPremiumGBP: r(iatfPremiumGBP),
    axiCostGBP: r(axiCostGBP), serialisationGBP: r(serialisationGBP),
    ipcClass3GBP: r(ipcClass3GBP), burnInGBP: r(burnInGBP),
    totalAutomotiveAssemblyGBP: r(totalAutomotiveAssemblyGBP),
    standardAssemblyGBP: r(standardAssemblyGBP), premiumPctOverStandard,
  };
}

// ── Automotive PCB Fabrication Cost Adjustment (IATF 16949 + automotive laminate) ──
interface AutomotiveFabAdjustment {
  standardFabGBP: number;
  iatfFabPremiumGBP: number;
  automotiveLaminatePremiumGBP: number;
  ipcClass3InspectionGBP: number;
  couponTestingGBP: number;
  totalAutomotiveFabGBP: number;
  premiumPctOverStandard: number;
}
function computeAutomotiveFabAdjustment(
  boardSpec: Record<string, unknown>,
  fabCostMid: number,
  domain: string,
  boardsPerPanel = 1,
  countryId = 'gb',
): AutomotiveFabAdjustment {
  if (domain !== 'automotive_adas' || fabCostMid <= 0) {
    return { standardFabGBP: fabCostMid, iatfFabPremiumGBP: 0, automotiveLaminatePremiumGBP: 0, ipcClass3InspectionGBP: 0, couponTestingGBP: 0, totalAutomotiveFabGBP: fabCostMid, premiumPctOverStandard: 0 };
  }
  const layers = Number(boardSpec.estimatedLayers) || 2;
  const widthMm = Number(boardSpec.widthMm) || 100;
  const heightMm = Number(boardSpec.heightMm) || 80;
  const areaCm2 = (widthMm * heightMm) / 100;
  const iatfFabPremiumGBP = fabCostMid * 0.18;
  const laminatePct = layers >= 8 ? 0.50 : 0.35;
  const automotiveLaminatePremiumGBP = fabCostMid * 0.40 * laminatePct;
  // Class-3 microsection inspection and coupon testing are done per PANEL (the
  // coupons are cut from the panel rails), so they are shared by its boards.
  const perPanel = Math.max(1, boardsPerPanel);
  // UK lab prices — microsection and coupon testing — in the board's country.
  const insp = countryFactor('inspection', pcbRegionOf(countryId));
  const ipcClass3InspectionGBP = Math.min(45, Math.max(8, areaCm2 * 0.08)) * insp / perPanel;
  const couponTestingGBP = Math.min(35, Math.max(5, layers * 2.5)) * insp / perPanel;
  const totalAutomotiveFabGBP = fabCostMid + iatfFabPremiumGBP + automotiveLaminatePremiumGBP + ipcClass3InspectionGBP + couponTestingGBP;
  const premiumPctOverStandard = Math.round((totalAutomotiveFabGBP / fabCostMid - 1) * 100);
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    standardFabGBP: r(fabCostMid), iatfFabPremiumGBP: r(iatfFabPremiumGBP),
    automotiveLaminatePremiumGBP: r(automotiveLaminatePremiumGBP),
    ipcClass3InspectionGBP: r(ipcClass3InspectionGBP), couponTestingGBP: r(couponTestingGBP),
    totalAutomotiveFabGBP: r(totalAutomotiveFabGBP), premiumPctOverStandard,
  };
}

// ── BOM Completeness Estimator ────────────────────────────────────────────────
interface BOMCompletenessResult {
  identifiedLineCount: number;
  identifiedICCount: number;
  identifiedPassiveCount: number;
  estimatedMissingPassiveCount: number;
  estimatedMissingCostGBP: number;
  missingEstimateBreakdown: { decouplingCaps: number; pullResistors: number; ferriteBeads: number; esdArrays: number };
  completenessScore: number;
}
function estimateMissingPassives(bom: Array<Record<string, unknown>>, smtPlacements: number, bomIsSupplied = false): BOMCompletenessResult {
  const icTypes = new Set(['ic_bga', 'ic_qfn', 'ic_tqfp', 'ic_qfp', 'ic_soic', 'ic_sot', 'power_module', 'ic_other']);
  const passiveTypes = new Set(['passive_0402', 'passive_0603', 'passive_0805', 'passive_1206', 'passive_other', 'transformer']);
  let icCount = 0; let passiveCount = 0; let identifiedTotal = 0;
  for (const line of bom) {
    const ct = String(line.componentType ?? '');
    const qty = Number(line.qty ?? 1);
    identifiedTotal += qty;
    if (icTypes.has(ct)) icCount += qty;
    if (passiveTypes.has(ct)) passiveCount += qty;
  }
  // Ratios are engineering-typical board-design practice (decoupling: 2-4
  // ceramics per IC power domain per IPC/manufacturer app notes; pull-ups,
  // ferrite filtering and ESD on external interfaces). Calibrate against the
  // golden-board set (tests/fixtures/pcb-boards/) as it grows.
  const expectedDecoupling = Math.round(icCount * 3.2);
  const expectedPullResistors = Math.round(icCount * 0.8);
  const expectedFerrites = Math.round(icCount * 0.4);
  const expectedESD = Math.round(icCount * 0.3);
  const totalExpectedPassives = expectedDecoupling + expectedPullResistors + expectedFerrites + expectedESD;
  // A supplied BOM (file or picture) IS the parts list: nothing is "missing" by rule of thumb.
  const missingPassives = bomIsSupplied ? 0 : Math.max(0, totalExpectedPassives - passiveCount);
  const estimatedMissingCostGBP = Math.round(missingPassives * 0.012 * 100) / 100;
  const completenessScore = bomIsSupplied ? 100 : smtPlacements > 0 ? Math.min(100, Math.round((identifiedTotal / smtPlacements) * 100)) : identifiedTotal > 0 ? 75 : 0;
  const decouplingMissing = bomIsSupplied ? 0 : Math.max(0, expectedDecoupling - passiveCount);
  const remaining = Math.max(0, missingPassives - decouplingMissing);
  return {
    identifiedLineCount: bom.length, identifiedICCount: icCount, identifiedPassiveCount: passiveCount,
    estimatedMissingPassiveCount: missingPassives, estimatedMissingCostGBP,
    missingEstimateBreakdown: { decouplingCaps: decouplingMissing, pullResistors: Math.round(remaining * 0.5), ferriteBeads: Math.round(remaining * 0.3), esdArrays: Math.round(remaining * 0.2) },
    completenessScore,
  };
}

// ── Program Pricing (volume-committed) vs Spot Correction ─────────────────────
interface ProgramPricingResult {
  spotBOMTotal: number;
  programBOMTotal: number;
  savingsGBP: number;
  savingsPct: number;
  annualProgramVolume: number;
  pricingTier: 'distributor_spot' | 'blanket_order' | 'direct_contract' | 'tier1_contract';
  multiplier: number;
}
function computeProgramPricing(bomTotal: number, orderQty: number, domain: string): ProgramPricingResult {
  // The quantity field IS the annual volume (the PDF labels it so). It used to be
  // multiplied by 4 — 250k/yr became a 1M "Tier-1 contract" and a −50% BOM.
  const annualProgramVolume = orderQty;
  let multiplier: number; let pricingTier: ProgramPricingResult['pricingTier'];
  if (domain !== 'automotive_adas') { multiplier = 1.0; pricingTier = 'distributor_spot'; }
  else if (annualProgramVolume >= 500_000) { multiplier = 0.50; pricingTier = 'tier1_contract'; }
  else if (annualProgramVolume >= 200_000) { multiplier = 0.60; pricingTier = 'direct_contract'; }
  else if (annualProgramVolume >= 50_000) { multiplier = 0.72; pricingTier = 'blanket_order'; }
  else if (annualProgramVolume >= 10_000) { multiplier = 0.85; pricingTier = 'blanket_order'; }
  else { multiplier = 1.0; pricingTier = 'distributor_spot'; }
  const programBOMTotal = Math.round(bomTotal * multiplier * 100) / 100;
  const savingsGBP = Math.round((bomTotal - programBOMTotal) * 100) / 100;
  const savingsPct = bomTotal > 0 ? Math.round((1 - multiplier) * 100) : 0;
  return { spotBOMTotal: Math.round(bomTotal * 100) / 100, programBOMTotal, savingsGBP, savingsPct, annualProgramVolume, pricingTier, multiplier };
}

/**
 * Boards ordered, from a form field. parseInt read "1e7" (what a number input sends for 10,000,000) as 1 —
 * a prototype costing — let 0 fall silently to 100, and passed a negative count into the volume maths
 * (360 review, Oct 2026). Whole boards, 1 … 10,000,000; anything unreadable is the 100-board default.
 */
export function parseOrderQty(v: unknown): number {
  const n = Number(typeof v === 'string' ? v.trim() : v);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(10_000_000, Math.round(n));
}

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // pcbImages (array) must be images; bomFile accepts csv/xml/txt text formats.
    // fabFiles: Excellon drill + Gerber layers. Gerber extensions are a zoo
    // (.gtl/.g2/.gko/.gbr/.art/.txt), so any text-like file under this field is
    // accepted and the measurer decides what it is.
    if (file.fieldname === 'fabFiles') {
      if (/\.(zip|rar|7z|png|jpe?g|pdf)$/i.test(file.originalname)) cb(new Error('Fab files must be the individual drill / Gerber files, not an archive'));
      else cb(null, true);
      return;
    }
    if (file.fieldname === 'bomFile') {
      // A BOM may also be a picture of the BOM table (pcb-bom-image.ts): PNG / JPEG / WebP.
      if (/\.(csv|xml|txt)$/i.test(file.originalname) || /^(text\/|application\/(xml|csv|vnd\.ms-excel))/i.test(file.mimetype) || isBomImage(file)) cb(null, true);
      else cb(new Error('BOM file must be .csv, .xml, .txt, or an image of the BOM (.png / .jpg / .webp)'));
      return;
    }
    if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WebP images are accepted'));
  },
});

// Slot labels sent from the frontend (Top side, Bottom side, Additional 1…6)
const DEFAULT_IMAGE_LABELS = ['Top side', 'Bottom side', 'Additional 1', 'Additional 2', 'Additional 3', 'Additional 4', 'Additional 5', 'Additional 6'];
// Max PCB photos accepted per analysis (top + bottom + up to 6 close-ups).
const PCB_MAX_IMAGES = 8;

/** Build Claude content blocks for one or more PCB images, with optional label text prefixes. */
function buildImageContentBlocks(
  files: Express.Multer.File[],
  labels: string[],
  includeLabels: boolean,
): Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } } | { type: 'text'; text: string }> {
  type Block = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } } | { type: 'text'; text: string };
  const out: Block[] = [];
  // Rec #2: when multiple views are supplied, tell the model how to exploit them —
  // this resolves components hidden on one side and lets it measure board size
  // from a scale reference instead of guessing.
  if (files.length > 1) {
    out.push({ type: 'text', text:
      `You are given ${files.length} views of the SAME board (e.g. top, bottom, angled, or a close-up). ` +
      `Combine them: a component visible in ANY view counts once — do not double-count a part seen in two views, ` +
      `and do not miss parts that appear only on one side. If a ruler, coin or known connector provides scale, ` +
      `use it to measure board dimensions rather than estimating. Note each component's side (top/bottom) where discernible.`,
    });
  }
  // Server-side safety net for the Anthropic 32 MB per-request limit. The web
  // client already downscales to ≤1568 px, but a direct API caller (or a stale
  // cached client) could still send large buffers. Rather than hard-fail with a
  // 413, admit images in priority order (Top, Bottom, Close-ups…) up to a safe
  // base64 budget and drop the rest with a warning — a partial analysis beats none.
  const skip = new Set(photosOverBudget(files));
  let dropped = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (skip.has(i)) { dropped++; continue; }   // keep the first image; skip further ones that would blow the budget
    const base64 = f.buffer.toString('base64');
    const mtype = f.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
    if (includeLabels) out.push({ type: 'text', text: `**${labels[i] ?? `Image ${i + 1}`}:**` });
    out.push({ type: 'image', source: { type: 'base64', media_type: mtype, data: base64 } });
  }
  if (dropped > 0) {
    console.warn(`[PCB] Image payload over budget — included ${files.length - dropped}/${files.length} image(s), dropped ${dropped} to stay under the API request limit. Client should downscale before upload.`);
  }
  return out;
}

/** Indexes of the photos left out to stay under the API request limit (priority order:
 *  top, bottom, close-ups). Shared by the prompt builder and the warning the user sees —
 *  dropped photos were only logged on the server. */
function photosOverBudget(files: Express.Multer.File[]): number[] {
  const MAX_TOTAL_BASE64_BYTES = 24 * 1024 * 1024; // ~24 MB of base64, leaving headroom under 32 MB
  let used = 0;
  const out: number[] = [];
  files.forEach((f, i) => {
    const len = Math.ceil(f.buffer.length / 3) * 4;
    if (i > 0 && used + len > MAX_TOTAL_BASE64_BYTES) { out.push(i); return; }
    used += len;
  });
  return out;
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
  return `Classify this PCB (all photos are views of the same board) into one application domain and return JSON only:
{"domain":"automotive_adas"|"rf_microwave"|"industrial_power"|"industrial_control"|"consumer_iot"|"medical"|"general","conf":0.0-1.0,"hints":["visual clue 1","visual clue 2"]}

Clues per domain:
- automotive_adas: CAN/LIN/FlexRay/FAKRA/HSD connectors, AEC markings, heat spreaders / EMI shield frames, ADAS SoCs (TI TDA, Mobileye EyeQ), automotive MCUs (NXP S32/MPC, Infineon AURIX TC2xx/TC3xx, Renesas RH850). AUTOMOTIVE RADAR modules are automotive_adas — signs: a patch / series-fed ANTENNA ARRAY etched on the board (rows of copper rectangles), an NXP S32R radar MCU, a 77/79 GHz FMCW transceiver MMIC (NXP MR3003/TEF810x, TI AWR/IWR), tapered RF feed traces, an EMI-shield fence. A radar board with an automotive MCU is automotive_adas, NOT rf_microwave.
- rf_microwave: Rogers/PTFE substrate, SMA/N connectors, RF shielding cans, spiral inductors — but NOT if it carries an automotive radar MCU (that is automotive_adas)
- industrial_power: large capacitors/inductors, IGBTs/MOSFETs, optocouplers, heatsinks
- industrial_control: DIN rail mount, fieldbus connectors (RJ45 banks, DB9), industrial MCUs
- consumer_iot: tiny form factor, WiFi/BT antenna area, USB-C, MEMS sensors, coin cell
- medical: isolated power section, isolation barriers, medical-grade connectors
- general: none of the above or unclear`;
}

// ── Stage 2: OCR text extraction prompt ───────────────────────────────────
const stage2Prompt = `Examine EVERY photo of this PCB (top, bottom and each close-up) and extract the readable text:
- IC chip markings: the characters printed on each package, exactly as printed (maker logo/prefix + part number line, e.g. "<maker> <part number as printed>"). Read close-ups first — they are there for the markings.
  Write only characters you can actually read; put "?" for an illegible character and leave out a marking you cannot read at all. Never complete a marking from what such a board usually carries.
  List each physical chip once even if it appears in several photos.
- Reference designators visible on silkscreen (e.g. "U1", "R1-R10", "C47")
- Connector labels or markings (e.g. "J1 CAN", "P2 PWR")
- Board text (revision, title, manufacturer, date codes)

Return JSON only:
{"icMarkings":["exact text from chip 1","exact text from chip 2"],"refDesGroups":["U1","R1-R10","C1-C20"],"connectors":["J1: appears to be CAN connector","P2: power input"],"boardText":["PCB REV 2.1","MADE IN UK"],"extractionQuality":"high"|"medium"|"low"}`;

// ── Specialist system prompts ──────────────────────────────────────────────
const SPECIALIST_SYSTEM_PROMPTS: Record<string, string> = {
  automotive_adas: 'You are a senior Tier-1 automotive PCB cost engineer with 20+ years in ASIL-rated PCBA design. MANDATORY PRICING RULES — NO EXCEPTIONS: (1) Price EVERY component at AEC-Q qualified automotive grade — ICs: 3–8× consumer, passives/MLCCs: 3–6×, crystals/oscillators: 3×. (2) Set automotive=true on ALL components. (3) Sealed IP67 automotive connectors (Amphenol, TE AMP, Molex MX150, Kostal): £3–35 each. FAKRA SMB £4–18, HSD £5–22, MATEnet £6–25. (4) AEC-Q200 MLCC only — X7R/C0G grade: 0402 resistors £0.003–0.012, 0402 caps £0.008–0.025, 0603 caps £0.015–0.06. (5) KNOWN AUTOMOTIVE IC PRICES (100K volume): AURIX TC2xx £18–55, TC3xx £35–90, TC39x/TC4xx £65–130; NXP S32K1xx £4.50–15, S32K3xx £12–45, S32G2/G3 £40–90; TI TDA4VM £85–220, TDA4AL £120–280; NXP SJA1105 £8–22, SJA1110 £15–40; TJA1101/1103 100BASE-T1 PHY £3–9; TJA1044/1042 CAN xcvr £0.80–2.80; NXP FS65/FS85 SBC £2.50–7; Infineon TLF35584 safety PMIC £3.50–9; Renesas RH850/V4H £18–80; NXP MPC5748G £22–65. AUTOMOTIVE RADAR: NXP S32R294/S32R274 radar MCU £22–48, NXP S32R45/S32R41 £45–95; 77/79GHz FMCW transceiver MMIC (NXP MR3003/TEF810x, TI AWR1243/AWR1642/AWR2944) £9–22 each. A radar board usually carries a transceiver MMIC near the antenna feed: if one is visible but its marking is hidden (glob-top, epoxy, shield), list it as \"radar transceiver MMIC (marking not readable)\" with an EMPTY partNumber — the tool prices it by function. Never write a part number you did not read. Return ONLY valid JSON.',
  rf_microwave: 'You are an RF/microwave PCB design and cost engineer with expertise in Rogers/PTFE substrates, impedance-controlled layouts, and RF component selection. You understand PA/LNA/PLL/filter/balun component pricing, the cost premium of RF substrates (Rogers 4350B: 8–12×), controlled-impedance PCB fab, and RF module pricing from suppliers like Mini-Circuits, Würth, and Murata. Return ONLY valid JSON.',
  industrial_power: 'You are a power electronics PCB cost engineer specialising in motor drives, power converters, UPS, and industrial power supplies. You know IGBT/SiC MOSFET pricing, gate driver ICs, isolated DC-DC converter modules, high-capacitance bulk capacitors, current sensor ICs, and thermal management components. You understand that industrial-grade components cost 2–4× consumer parts. Return ONLY valid JSON.',
  industrial_control: 'You are an industrial control and automation PCB cost engineer with expertise in PLCs, motion controllers, fieldbus nodes (EtherCAT, PROFIBUS, CANopen, Modbus), and industrial Ethernet switches. You know Siemens/Beckhoff/Rockwell component choices, ruggedised connector pricing, industrial-grade MCU/DSP costs, and conformal coating requirements. Return ONLY valid JSON.',
  consumer_iot: 'You are a consumer electronics and IoT PCB cost engineer specialising in connected devices, wearables, and smart home products. You know WiFi/BT SoC pricing (ESP32, CC2340, nRF52840), MEMS sensor costs, PMIC selection, USB-C connector and PD IC pricing, and how to optimise BOM cost for high-volume consumer applications. You target the lowest reasonable BOM cost while meeting spec. Return ONLY valid JSON.',
  medical: 'You are a medical device PCB cost engineer with expertise in IEC 60601-1, ISO 13485, and patient-safety isolation requirements. You understand reinforced/basic isolation requirements, medical-grade component sourcing, IEC 60601-compliant isolation transformer and optocoupler selection, and the significant cost premium of medical-certified components (3–10× consumer). Return ONLY valid JSON.',
  general: 'You are a world-class PCB engineer and electronics cost analyst with 20+ years of experience across multiple industries. You analyse PCB images with exceptional accuracy and provide realistic component pricing based on 2025/2026 UK market data at 100K unit production volumes. For should-cost analysis at 100K volumes, always use the lower half of the given price ranges for standard/generic parts — volume negotiation and direct-from-fab sourcing drives significant cost reduction at this scale. Return ONLY valid JSON.',
};

// ── Pricing reference table ────────────────────────────────────────────────
const PRICING_TABLE = `COMPONENT PRICING REFERENCE — UK 2025/2026, production volume 100K units. These are HARD ANCHORS.
CRITICAL PRICING RULE: Default to the LOWER HALF of each range for standard/generic components at 100K volumes. Use the upper end only for premium/high-spec/automotive-grade variants. DO NOT use the upper bound as a default.
passive_0402: resistors £0.0005–0.003, caps £0.001–0.015 (X5R/X7R consumer); AEC-Q200 automotive: resistors £0.003–0.012, caps X7R £0.008–0.025, C0G £0.012–0.040
passive_0603: resistors £0.001–0.005, caps £0.002–0.040, inductors £0.006–0.060; AEC-Q200 automotive: caps X7R £0.015–0.060, inductors AEC £0.025–0.15
passive_0805: resistors £0.002–0.010, caps £0.005–0.180, inductors £0.018–0.600; AEC-Q200 automotive: 3–5× above
crystal_osc: HC-49 crystal £0.04–0.18; SMD crystal £0.06–0.35; TCXO £0.50–2.80; automotive TCXO (SiTime, TXC AEC-Q200) £1.80–8; OCXO £6–35
power_module: DC-DC SIP/DIP module £1.20–7; isolated module £4–22; automotive AEC-Q101 £12–55
transformer: SMD signal transformer £0.35–2.00; SMD power transformer £1.00–7; common-mode choke £0.12–1.20; automotive CM choke £0.60–3.50
led: SMD indicator 0603/0805 £0.010–0.06; RGB LED £0.05–0.25; high-power LED £0.20–2.00
relay_switch: SMD relay SPDT £0.14–1.00; high-current relay £1.00–5.50; tactile switch £0.02–0.22; automotive relay £1.20–6
fuse_tvs: SMD polyfuse £0.03–0.15; SMD fuse £0.02–0.12; TVS diode £0.03–0.22; TVS array £0.10–0.60; automotive TVS AEC-Q101 £0.12–0.80
ic_soic: logic gate £0.03–0.25; op-amp general £0.10–1.20; op-amp precision £0.50–4; driver IC £0.12–1.80; LDO regulator £0.08–1.20; automotive-grade SOIC ICs: 3–6× above
ic_qfn: simple MCU (8/32-bit low-end) £0.18–1.80; complex MCU £1.50–9; PMIC £0.70–7; RF IC £1.00–12; automotive MCU QFN £3–18; automotive PMIC QFN £2.50–12
ic_bga: FPGA small £6–40; FPGA large £30–250; SoC/Application CPU £18–160; DDR memory £1.50–12; automotive SoC £22–200; ADAS processor £60–400; AURIX TC3xx/TC4xx £35–130; NXP S32G SoC £40–90
ic_tqfp: MCU 32-bit mid-range £1.00–6; DSP £3–18; CPLD £1.80–12; automotive MCU TQFP £5–45; AURIX TC2xx £18–55; RH850 £18–80
connector_smt: 0.5mm FPC/FFC £0.06–0.40; 1.0mm FPC £0.05–0.28; USB-C £0.10–0.70; SMA/RF £0.22–1.80; FAKRA SMB £4–18; HSD 4+2 £5–22; MATEnet/H-MTD £6–25; automotive sealed IP67 (Amphenol AT, TE AmpSeal, Molex MX150L, Kostal MLK): single connector body £3–18 plus £0.15–0.80 per terminal; DF17 board-to-board £0.60–3.50
through_hole: electrolytic cap (small) £0.05–0.40; electrolytic cap (large) £0.22–2.80; TH connector 2-row £0.12–1.80; power connector £0.40–4.50; TO-220 transistor £0.14–2.80; automotive TH power connector £2–12
manual_solder: wire/jumper £0.03–0.22; heat-shrink joint £0.02–0.14`;

// ── IC price hints from OCR markings ──────────────────────────────────────
// Known automotive IC price ranges (100K volume, AEC-Q qualified). Ranges marked
// with a date were checked against distributor prices on that date (see
// docs/pcb/component-catalogue.md); the catalogue (server/data/
// pcb-component-catalogue.json) carries the per-part figures and sources.
// `generic` entries name a FUNCTION, not a part ("77 GHz radar transceiver MMIC"
// with no marking read): they bound a price but never count as the part identified.
const IC_PRICE_HINTS: Array<{ test: (m: string) => boolean; label: string; price: string; generic?: boolean }> = [
  // ── Automotive radar MCUs (ranges as in the automotive system prompt) ─────
  { test: m => /S32R29[0-9]|S32R27[0-9]/i.test(m), label: 'NXP S32R294/S32R274 radar MCU (ASIL-B)', price: '£18–34' },   // Arrow $29, Mouser $30.33, Avnet $27.11, Newark $26.54 @1k (2026-10-01)
  { test: m => /S32R4[0-9]/i.test(m), label: 'NXP S32R45/S32R41 radar processor', price: '£45–95' },
  // ── Automotive MCUs ────────────────────────────────────────────────────────
  { test: m => /AURIX|TC39[0-9]|TC38[0-9]|TC37[0-9]/i.test(m), label: 'Infineon AURIX TC3xx/TC4xx (ASIL-D lockstep)', price: '£15–60' },   // TC375 $23.84 @500 (2026-10-01)
  { test: m => /TC2[2-9][0-9]|TC26|TC27|TC29/i.test(m), label: 'Infineon AURIX TC2xx (ASIL-D)', price: '£6–30' },   // TC234 ≈ $9.5 @1k (2026-10-01)
  { test: m => /S32K3[0-9]{2}|S32K3/i.test(m), label: 'NXP S32K3xx automotive MCU (ASIL-D)', price: '£6–20' },   // S32K344 $14.79 @100 (2026-10-01)
  { test: m => /S32K1[0-9]{2}|S32K14|S32K11/i.test(m), label: 'NXP S32K1xx automotive MCU (ASIL-B)', price: '£2.50–9' },   // S32K144 $5.47–6.20 @1k (2026-10-01)
  { test: m => /S32G[23]/i.test(m), label: 'NXP S32G2/G3 network SoC (ASIL-B)', price: '£40–90' },
  { test: m => /MPC5748|MPC5746|MPC574/i.test(m), label: 'NXP MPC574x automotive MCU', price: '£22–65' },
  { test: m => /SPC584|SPC582|SPC560/i.test(m), label: 'STM SPC5xxx/SPC58x automotive MCU', price: '£8–40' },
  { test: m => /RH850|R7F70|R7F01/i.test(m), label: 'Renesas RH850 automotive MCU', price: '£6–30' },   // F1KM-S1 $8.73, S4 $11.54 @1k (2026-10-01)
  { test: m => /V4H|R8A779|R8A779G/i.test(m), label: 'Renesas R-Car V4H ADAS SoC', price: '£80–200' },
  { test: m => /STM32[A-Z]|STM32F|STM32H|STM32L/i.test(m), label: 'STM32 microcontroller', price: '£1.00–10' },   // H735 $10.87 @504 (2026-10-01)
  { test: m => /SAMC2|SAMD5|SAME5|SAME7/i.test(m), label: 'Microchip SAM automotive MCU', price: '£3–12' },
  // ── ADAS & Vision SoCs ────────────────────────────────────────────────────
  { test: m => /TDA4VM|TDA4AL|TDA4VH/i.test(m), label: 'TI TDA4VM/AL ADAS SoC', price: '£85–280' },
  { test: m => /TDA2[PEK]|TDA2S/i.test(m), label: 'TI TDA2x ADAS SoC (older gen)', price: '£45–120' },
  { test: m => /EYEQ[3-6]|MQ[2-6]0[0-9]/i.test(m), label: 'Mobileye EyeQ ADAS processor', price: '£35–180' },
  { test: m => /IMX390|IMX623|IMX728/i.test(m), label: 'Sony automotive image sensor', price: '£8–35' },
  { test: m => /OV9284|OV2775|OV9782/i.test(m), label: 'OmniVision automotive image sensor', price: '£3–18' },
  // ── CAN / LIN / Ethernet Transceivers ─────────────────────────────────────
  { test: m => /TJA110[0-9]|TJA1102|TJA1103/i.test(m), label: 'NXP TJA110x 100BASE-T1 automotive Ethernet PHY', price: '£1.20–4' },   // TJA1103 $1.71 @1k (2026-10-01)
  { test: m => /TJA104[0-9]|TJA1042|TJA1044/i.test(m), label: 'NXP TJA104x CAN/CAN-FD transceiver (automotive)', price: '£0.40–1.20' },   // TJA1044GT/3Z $0.689 @1k (2026-10-01)
  { test: m => /TJA110[6-9]|TJA1107/i.test(m), label: 'NXP TJA110x automotive LIN transceiver', price: '£0.45–1.60' },
  { test: m => /SJA1105|SJA1110/i.test(m), label: 'NXP SJA110x 5-port automotive Ethernet switch', price: '£8–40' },
  { test: m => /DP83TC812|DP83822|DP83867/i.test(m), label: 'TI DP83 automotive Ethernet PHY', price: '£1.50–5' },   // DP83TC812 $2.59 @500 (2026-10-01)
  { test: m => /BCM8906|BCM8957|BCM89881/i.test(m), label: 'Broadcom automotive 100BASE-T1 PHY', price: '£4–15' },
  // TI prints only "1044AV" on a TCAN1044AV-Q1's top — the chip never says TCAN.
  { test: m => /TCAN10[0-9]{2}|\bTI\b.*\b10[0-9]{2}A?V\b|^\s*10[0-9]{2}A?V\b/i.test(m), label: 'TI TCAN10xx automotive CAN-FD transceiver', price: '£0.35–1.20' },   // TCAN1044AV $0.517 @2.5k (2026-10-01)
  { test: m => /TCAN|SN65HVD|ISO1042|ISOW/i.test(m), label: 'TI automotive CAN/isolated transceiver', price: '£0.80–4.50' },
  // ── Safety PMICs & System Basis Chips ─────────────────────────────────────
  { test: m => /TLF35584|TLF35577/i.test(m), label: 'Infineon TLF3558x automotive safety PMIC (ASIL-D)', price: '£2–6' },   // $2.54–3.70 @1k (2026-10-01)
  { test: m => /FS65|FS85|FS6500/i.test(m), label: 'NXP FS65/FS85 System Basis Chip (safety SBC)', price: '£2.50–7' },
  { test: m => /UJA117[0-9]|UJA1167/i.test(m), label: 'NXP UJA117x Mini SBC', price: '£1.80–5' },
  { test: m => /BD9V100|BD9S400|ROHM/i.test(m), label: 'Rohm BD automotive PMIC', price: '£2–8' },
  { test: m => /RAA271|RAA272|ISL78/i.test(m), label: 'Renesas RAA/ISL automotive multi-rail PMIC', price: '£4–14' },
  { test: m => /TPS929|TPS928|TPS9264/i.test(m), label: 'TI TPS92x automotive LED driver', price: '£1.50–6' },
  { test: m => /TLE926|TLE4471|TLE7|TLS/i.test(m), label: 'Infineon TLE/TLS automotive voltage reg / SBC', price: '£0.60–4' },   // TLE9261 $1.95 @1k (2026-10-01)
  { test: m => /NCV7717|NCV7805|NCV8704/i.test(m), label: 'ON Semi NCV automotive LDO/power IC', price: '£0.60–3.50' },
  // ── Gate Drivers, FETs, Power ──────────────────────────────────────────────
  { test: m => /UCC5320|UCC5390|UCC2153/i.test(m), label: 'TI UCC isolated automotive gate driver', price: '£1.80–5' },
  { test: m => /ISO784|ISO774|DRV840|DRV862/i.test(m), label: 'TI ISO/DRV automotive driver', price: '£2–8' },
  { test: m => /BTS700|BTS600|BTS500/i.test(m), label: 'Infineon BTS automotive smart power switch', price: '£0.50–3' },   // BTS7008 $0.71–1.27 @1k (2026-10-01)
  { test: m => /AUIPS|IPD|IPS200/i.test(m), label: 'Infineon AUIPS automotive power switch', price: '£1.50–6' },
  // ── Radar & RF (Automotive) ────────────────────────────────────────────────
  { test: m => /BGT60|BGT24|BGT12/i.test(m), label: 'Infineon BGT60/24 77GHz/24GHz radar frontend', price: '£18–80' },
  // Same range as the automotive system prompt — the two used to disagree (£25–90 here vs £9–22 there).
  { test: m => /TEF810|TEF81/i.test(m), label: 'NXP TEF810x 77GHz radar transceiver', price: '£9–22' },
  { test: m => /AWR1843|AWR1642|AWR1443|AWR2[29]44|AWR2243/i.test(m), label: 'TI AWR 77GHz ADAS radar SoC', price: '£14–40' },   // AWR1843 $24.91, AWR2944 $27.9–34.6 @1k (2026-10-01)
  // A 77 GHz transceiver whose marking was not read (glob-top, shield) is still a
  // TEF810x-class die: the 2026-09-29 run priced one at £4.00.
  { test: m => /77\s*(\/\s*79)?\s*GHZ[^,;]*(TRANSCEIVER|MMIC|FRONT)|RADAR (TRANSCEIVER|MMIC|FRONT[- ]?END)/i.test(m), label: '77 GHz radar transceiver MMIC (part not read; TEF810x-class)', price: '£9–22', generic: true },
  // ── Memory (Automotive) ────────────────────────────────────────────────────
  { test: m => /IS42S|IS43T|IS66W/i.test(m), label: 'ISSI automotive SDRAM/SRAM', price: '£1.50–8' },
  { test: m => /K4A|K4B|K9F/i.test(m), label: 'Samsung automotive LPDDR/NAND (AEC-Q grade)', price: '£3–20' },
  { test: m => /MT41K|MT47H|MT25Q/i.test(m), label: 'Micron automotive DDR/Flash', price: '£2.50–15' },
  { test: m => /THGBM|THGLF/i.test(m), label: 'Kioxia automotive eMMC/NAND', price: '£3–18' },
  // Winbond's top marking drops the W: "winbond 25Q32JWSIQ".
  { test: m => /W25Q[0-9]{2,3}|WINBOND|\b25Q[0-9]{2,3}[A-Z]/i.test(m), label: 'Winbond SPI NOR flash (automotive)', price: '£0.40–1.60' },   // W25Q32JW $1.02 @1k, W25Q128JV $1.64 @1k (2026-10-01)
  { test: m => /IS25LP|IS25WP|MX25L|MX25U|GD25Q/i.test(m), label: 'SPI NOR flash (automotive)', price: '£0.30–1.50' },
  // ── General (non-automotive, fallback by brand) ────────────────────────────
  { test: m => /NRF52|NRF5340|NRF9/i.test(m), label: 'Nordic nRF MCU/SoC', price: '£0.70–4.50' },
  { test: m => /ESP32|ESP8266|ESP32-S/i.test(m), label: 'Espressif WiFi/BT SoC', price: '£0.50–2.20' },
  { test: m => /LAN9|LAN8|KSZ89|KSZ80/i.test(m), label: 'Microchip LAN/KSZ Ethernet IC', price: '£0.70–5' },
  { test: m => /MAX2043[0-9]|MAX2041[0-9]|MAX2002[0-9]|MAX2008[0-9]/i.test(m), label: 'Maxim/ADI automotive multi-output PMIC', price: '£2.50–6.50' },
  { test: m => /MAX[0-9]{4}|MAX3|MAX4/i.test(m), label: 'Maxim/Analog interface IC', price: '£0.30–4.50' },
  { test: m => /TLV3|TLV6|TLV7/i.test(m), label: 'TI TLV comparator/op-amp', price: '£0.12–1.80' },
  { test: m => /LM317|LM358|LM741|LM324/i.test(m), label: 'TI/Fairchild classic linear IC', price: '£0.08–0.80' },
];

/** The tool's stated 100K range for a BOM line it can name, for the grounding cap. */
export function icKnownRange(line: { partNumber?: unknown; description?: unknown }, opts: { specificOnly?: boolean } = {}): { lo: number; hi: number; label: string; generic?: boolean } | null {
  const text = `${String(line.partNumber ?? '')} ${String(line.description ?? '')}`.toUpperCase();
  const hit = IC_PRICE_HINTS.find(h => h.test(text) && !(opts.specificOnly && h.generic));
  if (!hit) return null;
  const m = /£\s*([0-9.]+)\s*[–-]\s*([0-9.]+)/.exec(hit.price);
  return m ? { lo: Number(m[1]), hi: Number(m[2]), label: hit.label, ...(hit.generic ? { generic: true } : {}) } : null;
}

/** The tool's label for a chip marking it can name specifically (null = not nameable). */
export function markingLabel(marking: string): string | null {
  const m = marking.toUpperCase();
  return IC_PRICE_HINTS.find(h => !h.generic && h.test(m))?.label ?? null;
}

/** icKnownRange scaled to the order volume — the table is stated at 100K. */
export function knownRangeAtVolume(volumeMultiplier: number) {
  return (line: Record<string, unknown>) => {
    const r = icKnownRange(line);
    if (!r) return null;
    const k = Number(line.volumeMultiplier) > 0 ? Number(line.volumeMultiplier) : volumeMultiplier;
    return { ...r, lo: Math.round(r.lo * k * 100) / 100, hi: Math.round(r.hi * k * 100) / 100 };
  };
}

function buildICPriceHints(markings: string[], domain: string): string {
  const automotiveNote = domain === 'automotive_adas'
    ? 'NOTE: This is an automotive board — ALL prices below are AEC-Q automotive grade. Apply automotive=true to every component.\n'
    : '';
  const lines = markings.map(marking => {
    const m = marking.toUpperCase();
    const hit = IC_PRICE_HINTS.find(h => !h.generic && h.test(m));
    if (hit) return `${marking} — ${hit.label} — ${hit.price} at 100K volume${domain === 'automotive_adas' ? ' (AEC-Q, automotive=true)' : ''}`;
    return `${marking} — use pricing table above`;
  });
  return automotiveNote + lines.join('\n');
}

// ── Stage 3: Build user prompt for specialist analysis ─────────────────────
interface Stage1Result { domain: string; conf: number; hints: string[]; failed?: boolean }
interface OCRResult { icMarkings: string[]; refDesGroups: string[]; connectors: string[]; boardText: string[]; extractionQuality: string }

function buildUserPrompt(ocr: OCRResult, stage1: Stage1Result, domain: string, orderQty?: number): string {
  const volumeNote = orderQty && orderQty < 100000
    ? `VOLUME CONTEXT: Target order quantity is ${orderQty} units. Pricing table below is calibrated to 100K — the server will apply a volume correction factor after your analysis. Use 100K pricing anchors as instructed. Note this correction in analysisLimitations.\n\n`
    : '';
  const automotiveNote = domain === 'automotive_adas'
    ? `CRITICAL — AUTOMOTIVE GRADE PRICING MANDATORY: Every component must be priced at AEC-Q qualified automotive grade. Apply 3–8× consumer price for all ICs. Apply 3–6× for passives (MLCC, resistors). Set automotive=true for all ICs and safety-critical passives. Never use consumer pricing on this board.\n\n`
    : '';
  return `${volumeNote}${automotiveNote}=== STAGE 1 CLASSIFICATION ===
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
surfaceFinish: hasl | hasl_lf | enig | osp | enepig | imag (immersion silver — silvery, not gold)
hdiStructure: none | 1plus_n_plus1 | 2plus_n_plus2 | any_layer
qualityGrade: consumer | industrial | auto_grade2 | auto_grade1 | aerospace
complexity: low | medium | high | very_high
confidenceLevel: High | Medium | Low

Analyse the photos of this PCB thoroughly (all are views of the same board). Group identical components. Return ONLY this JSON structure (replace all example values with actual values from the image):
{
  "partName": "descriptive board name",
  "boardSpec": {
    "estimatedLayers": 2,
    "widthMm": 100,
    "heightMm": 80,
    "dimensionsSource": "estimated",
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
    "copperOzByLayer": [],
    "boardWeightG": 0,
    "qualityGrade": "industrial",
    "panelUtilisation": 0.75,
    "conformalCoating": false
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
- Do NOT estimate board fabrication, assembly or total costs — the server computes every cost from its rate tables
- unitPriceGBP: your ESTIMATE only, inside the COMPONENT PRICING REFERENCE range for the part's class (100K volume; lower half for standard/generic parts). The server prices every line from its own table, catalogue and part ranges — your figure only picks the point within the range
- For IC components identified from OCR markings, set partNumber to the exact marking, lineConf to 1.0, and ocrExtracted to true. EVERY IC marking listed above must be the partNumber of exactly one BOM line — never describe an OCR-read part generically (e.g. write TEF8105, not \"radar transceiver MMIC\")
- Pads, test points and unfitted footprints are NOT components: leave them out of the BOM
- For every other component, partNumber is ONLY a part number you can read on the package in the photos. If you cannot read it, leave partNumber EMPTY and say what the part is in description (function, value, package) — the tool prices an unread part from its class table, and an invented part number is worse than none. Never infer a part number from the board's function, the package or what such boards usually carry. ocrExtracted false; lineConf = how sure you are of what the part IS (0–1)
- refDes: write the designators as printed (\"R1-R10\" or \"R1, R2, R5\") — the tool counts them against qty
- Each physical part once: the photos are views of the SAME board; a part seen in the top photo and in a close-up is ONE part
- smtPlacements = total qty of all SMT components
- throughHoleJoints = sum of qty x pins for through_hole components
- Estimate board dimensions from component sizes, connector pitch, or visible rulers
- dimensionsSource: "measured" ONLY if width/height were READ from a label, drawing, board-data table, ruler or scale in the photos; otherwise "estimated"
- copperOzByLayer: per-layer copper in oz (35 µm = 1 oz, 70 µm = 2 oz), top to bottom, ONLY when a board-data table or drawing states it; otherwise []
- boardWeightG: board weight in grams ONLY if stated in the photos; otherwise 0
- conformalCoating: true only if a coating is visible (glossy film over components, fluorescence in a UV photo); otherwise false
- List at least 3 aiInsights, 2 dfmIssues, 3 optimisationSuggestions, 1 analysisLimitation
- IMPORTANT: Return ONLY the JSON — nothing else`;
}

// ── JSON repair prompt ─────────────────────────────────────────────────────
/** True when the analysis carries no usable BOM lines. An empty BOM must be
 *  treated as a FAILED analysis: rendering it looks like silent success, and
 *  caching it poisons every re-run of the same photos. */
function bomIsEmpty(analysis: unknown): boolean {
  const bom = (analysis as { bom?: unknown } | null)?.bom;
  return !Array.isArray(bom) || bom.length === 0;
}

const EMPTY_BOM_RETRY_NOTE = `

CRITICAL: Your previous response contained ZERO usable BOM lines (it was empty or ran past the output limit before the BOM closed). Enumerate EVERY visible component (ICs, passive groups, connectors, magnetics, crystals) as BOM lines — a part you can see but not identify is listed by function with an EMPTY partNumber and a low lineConf; never invent a part number. To keep the whole BOM within the response limit: GROUP identical passives into a single line with a combined quantity (e.g. one "C1-C40, 100nF 0402, qty 40" line, not 40 lines), keep every field terse, and emit ONLY the JSON object — no prose before or after. If the board is truly bare/unpopulated, return an empty bom and say so in analysisLimitations.`;

function buildRepairPrompt(raw: string): string {
  return `The following text was supposed to be a valid JSON object but it may be malformed, truncated, or wrapped in code fences. Extract and return ONLY the valid JSON object. Fix any syntax errors. Start your response with { and end with }. Do not add any other text.

Text to fix:
${raw}`;
}

// POST /api/pcb/analyze-image
// ── Shared Stage 3b + Stage 4 (PCB review, Oct 2026) ─────────────────────────
// /analyze-image, /analyze-image-stream (the one the screen uses) and /reanalyze
// each carried their own copy of Stage 4, and the copies had drifted: the stream
// route never ran Stage 3b, /reanalyze priced from the offline catalogue only and
// hard-coded OCR quality 'high'. One implementation now serves all three.

/**
 * Stage 3b — a second, focused look at high-value IC lines that have no part
 * number. It asks for the part number and the marking text it read — never a
 * price — and the line is marked as read off the chip only when that marking
 * agrees with what the OCR stage read (verifyOcrClaims, in prepareBOMFromOCR).
 */
async function applyStage3b(
  anthropic: Anthropic, analysis: Record<string, unknown>, imageFiles: Express.Multer.File[],
  imageLabels: string[], domain: string, tag: string,
): Promise<number> {
  const bom = Array.isArray(analysis.bom) ? (analysis.bom as Array<Record<string, unknown>>) : [];
  const unconfirmed = bom.filter(l =>
    HIGH_VALUE_COMP_TYPES.has(String(l.componentType ?? '')) &&
    !String(l.partNumber ?? '').trim());
  if (unconfirmed.length === 0 || unconfirmed.length > 12) return 0;
  console.log(`[PCB${tag}] Stage 3b: second look at ${unconfirmed.length} unidentified high-value IC(s)`);
  const refinements = await refineUnconfirmedICs(anthropic, imageFiles, imageLabels, domain, unconfirmed);
  if (refinements.size === 0) return 0;
  let applied = 0;
  analysis.bom = bom.map(line => {
    const r = refinements.get(String(line.refDes ?? ''));
    if (!r || !r.partNumber) return line;
    applied++;
    return {
      ...line,
      partNumber: r.partNumber,
      lineConf: Math.min(r.lineConf, 0.9),
      // A claim, checked against the OCR stage's markings before pricing.
      ocrExtracted: r.markingRead.length > 0,
      secondLookMarking: r.markingRead || undefined,
      identifiedBy: 'second-look',
    };
  });
  return applied;
}

interface Stage4Input {
  analysis: Record<string, unknown>;
  domain: string;
  asilLevel: ASILLevel;
  ocrResult: OCRResult;
  country: string;
  orderQty: number;
  /** Ground truth: a parsed BOM file and the uploaded fab files (first analysis only). */
  parsedBOM?: ParsedBOMLine[];
  /** What the BOM-image reader reported (rows not used, quantities fixed, cells unreadable). */
  bomImageNotes?: string[];
  files?: Record<string, Express.Multer.File[]>;
  /** /reanalyze: the engineer's edited lines, authoritative. */
  correctedBOM?: Array<Record<string, unknown>> | null;
  onProgress?: (label: string) => void;
  /** Stage 1 failed and the domain fell back to "general". */
  classificationFailed?: boolean;
  /** A distributor key supplied by the user for this run (Fetch Live Prices). */
  live?: { provider: LivePricingProvider; key: string };
  /** The classifier's words behind the ASIL — checked against the parts list. */
  asilRationale?: string;
  asilSafetyFunctions?: string[];
  tag: string;
}

/** Everything Stage 4 adds to the response. `failed` results must not be cached. */
interface Stage4Output {
  selectedCountry: string;
  orderQty: number;
  volumeMultiplier: number;
  selectedCountryBreakdown: PCBCountryCostBreakdown | null;
  countryComparison: ReturnType<typeof computeAllCountryCosts>;
  volumeCurves: Record<string, ReturnType<typeof computeVolumeCurve>>;
  complexityScore: ReturnType<typeof computeComplexityScore> | null;
  confidenceBand: PCBConfidenceBand | null;
  sanityWarnings: SanityWarning[];
  npiBreakdown: NPIBreakdown | null;
  livePriceHits: number;
  catalogueVerifiedCount: number;
  needsVerificationCount: number;
  automotiveNRE: AutomotiveNRE | null;
  automotiveGradeEnforcedCount: number;
  singleSourceWarnings: SingleSourceWarning[];
  conformalCoatingCost: number;
  automotiveAssemblyCost: AutomotiveAssemblyCost | null;
  automotiveFabAdjustment: AutomotiveFabAdjustment | null;
  bomCompleteness: BOMCompletenessResult | null;
  /** The board's domain after the parts-list evidence (may upgrade the classifier's). */
  domain: string;
  programPricing: ProgramPricingResult | null;
  /** The ASIL as claimed, as costed, and why they differ (pcb-asil-guard.ts). */
  asil: AsilGuardResult | null;
  failed: boolean;
}

export async function runStage4(inp: Stage4Input): Promise<Stage4Output> {
  const { analysis: a, ocrResult, orderQty, tag } = inp;
  let asilLevel = inp.asilLevel;
  let domain = inp.domain;
  const selectedCountry = inp.country;
  const volumeMultiplier = getVolumeMultiplier(orderQty);
  let auto = domain === 'automotive_adas';
  const out: Stage4Output = {
    selectedCountry, orderQty, volumeMultiplier, selectedCountryBreakdown: null, countryComparison: [], volumeCurves: {},
    complexityScore: null, confidenceBand: null, sanityWarnings: [], npiBreakdown: null, livePriceHits: 0,
    catalogueVerifiedCount: 0, needsVerificationCount: 0, automotiveNRE: null, automotiveGradeEnforcedCount: 0,
    singleSourceWarnings: [], conformalCoatingCost: 0, automotiveAssemblyCost: null, automotiveFabAdjustment: null,
    bomCompleteness: null, programPricing: null, failed: false, domain: inp.domain,
    // Unchanged until the parts list is known (a failed Stage 4 still reports what was claimed).
    asil: guardAsil({ asil: inp.asilLevel as AsilLevel, rationale: inp.asilRationale, safetyFunctions: inp.asilSafetyFunctions, bom: [] }),
  };
  try {
    const boardSpec = (a.boardSpec ?? (a.boardSpec = {})) as Record<string, unknown>;
    const assemblyData = (a.assembly ?? (a.assembly = {})) as Record<string, unknown>;
    const costEst = (a.costEstimates ?? (a.costEstimates = {})) as Record<string, unknown>;
    const pcbFabGBP = costEst.pcbFabGBP as { min?: number; mid?: number; max?: number } | undefined;
    const warnings: SanityWarning[] = [];

    if (a._salvaged === true) warnings.push({ code: 'BOM_TRUNCATED', severity: 'error',
      message: `The AI's answer was cut off before the whole board was listed: this BOM (${Array.isArray(a.bom) ? (a.bom as unknown[]).length : 0} lines) is PARTIAL, so the cost is too low. Run again, or attach the BOM file.` });
    {
      const photos = inp.files?.pcbImages ?? [];
      const over = photosOverBudget(photos);
      if (over.length) warnings.push({ code: 'PHOTOS_NOT_READ', severity: 'error',
        message: `${over.length} of ${photos.length} photo(s) were too large to send together and were NOT read: ${over.map(i => DEFAULT_IMAGE_LABELS[i] ?? `photo ${i + 1}`).join(', ')}. Re-upload them smaller (the app's uploader resizes automatically).` });
    }
    if (inp.classificationFailed) warnings.push({ code: 'CLASSIFICATION_FAILED', severity: 'warn',
      message: 'The board-type classification failed, so the board was costed as "general" (no automotive grade). If this is an automotive board, run again.' });
    if (ocrResult.extractionQuality === 'failed') warnings.push({ code: 'OCR_STAGE_FAILED', severity: 'warn',
      message: 'The chip-marking (OCR) stage failed, so no marking was read separately: part numbers come only from the BOM stage and more lines are priced from class tables. Run again for a full read.' });
    // 1. Ground truth (a BOM file, measured fab data) before anything the model said.
    if (inp.parsedBOM || inp.files) warnings.push(...applyGroundTruth(a, inp.parsedBOM ?? [], measureUploadedFabData(inp.files), domain));
    // The parts list is evidence of the grade: a board whose named ICs are mostly AEC-Q100 orderable
    // codes (TI "…Q1", ADI "/V") is automotive whatever the photo classifier guessed. A 360° surround-
    // view camera (4 of 5 ICs -Q1, the model's own title "automotive camera module") was costed as
    // "consumer IoT" — no automotive grade, consumer benchmarks (Oct 2026).
    if (!auto) {
      // Only EVIDENCED codes count (360 review, Oct 2026): a line from the supplied BOM file, or a code an
      // OCR marking agrees with. A "-Q1" the model added on its own flipped the board to automotive —
      // class ranges, IATF / class-3 premiums and NRE — on nothing but its own text.
      const marks = (ocrResult.icMarkings ?? []).map(m => String(m).toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(m => m.length >= 5);
      const evidenced = (l: Record<string, unknown>, pn: string) => {
        if (l.bomSource === 'file' || l.bomSource === 'image') return true;
        const k = pn.replace(/[^A-Z0-9]/g, '');
        return marks.some(m => k.startsWith(m) || m.startsWith(k.replace(/Q1$/, '')));
      };
      const lines = (Array.isArray(a.bom) ? a.bom as Array<Record<string, unknown>> : [])
        .map(l => ({ l, pn: String(l.partNumber ?? '').trim().toUpperCase() })).filter(({ pn }) => /[A-Z]/.test(pn) && /\d/.test(pn) && pn.length >= 6);
      const named = lines.map(x => x.pn);
      const aecq = lines.filter(({ l, pn }) => /Q1$|-Q1\b|\/V\+?T?$|\/VY\+T?$/.test(pn) && evidenced(l, pn)).map(x => x.pn);
      if (aecq.length >= 2 && aecq.length >= named.length * 0.5) {
        domain = 'automotive_adas'; auto = true; out.domain = domain;
        warnings.push({ code: 'AUTOMOTIVE_FROM_BOM', severity: 'warn',
          message: `Costed as an automotive board: ${aecq.length} of ${named.length} named ICs are AEC-Q100 automotive codes (${aecq.slice(0, 4).join(', ')}${aecq.length > 4 ? ', …' : ''}), although the photo classifier said "${inp.domain}".` });
      }
    }
    if (inp.bomImageNotes?.length) warnings.push({ code: 'BOM_IMAGE_READING', severity: 'warn', message: `BOM image: ${inp.bomImageNotes.join(' · ')}.` });
    // The BOM as read (after any BOM file), kept so a re-price (/reprice) starts from it
    // and never applies the volume factor or the grading twice.
    if (Array.isArray(a.rawBom)) a.bom = JSON.parse(JSON.stringify(a.rawBom));
    else a.rawBom = JSON.parse(JSON.stringify(Array.isArray(a.bom) ? a.bom : []));
    // The classifier's ASIL against the parts list (pcb-asil-guard.ts): ASIL-C/D is costed only
    // with the safety hardware it needs, and a rationale the BOM contradicts is withheld.
    out.asil = guardAsil({ asil: asilLevel as AsilLevel, rationale: inp.asilRationale, safetyFunctions: inp.asilSafetyFunctions,
      bom: Array.isArray(a.bom) ? (a.bom as Array<Record<string, unknown>>) : [] });
    asilLevel = out.asil.costed as ASILLevel;
    for (const n of out.asil.notes) warnings.push({ code: 'ASIL_CHECKED_AGAINST_BOM', severity: 'warn', message: n });
    // 2. One part, one line, whole-number quantities — across all the photos.
    const cons = consolidateBom(Array.isArray(a.bom) ? (a.bom as Array<Record<string, unknown>>) : []);
    warnings.push(...cons.warnings);
    // 3. OCR markings into the BOM; the model's "read off the chip" claims checked.
    const prepared = prepareBOMFromOCR(cons.bom, ocrResult.icMarkings, assemblyData);
    warnings.push(...prepared.warnings);
    // 4. Placements from the list BEFORE the board is sized from them — the fab
    //    stabiliser and the assembly cost used to read two different counts.
    warnings.push(...derivePlacementsFromBOM(prepared.bom, assemblyData));
    stabiliseBoardSpec(boardSpec, assemblyData, domain);
    {
      const sf = stableFabMid(boardSpec, assemblyData, orderQty, PCB_COUNTRY_RATES[selectedCountry] ? selectedCountry : 'cn', auto);
      if (pcbFabGBP && sf > 0) { pcbFabGBP.mid = Math.round(sf * 100) / 100; pcbFabGBP.min = Math.round(sf * 80) / 100; pcbFabGBP.max = Math.round(sf * 130) / 100; }
    }
    const fabCostMid = Number(pcbFabGBP?.mid) || 0;

    // 5. Volume (per line: parts bought), automotive grade.
    let bom = flagAndEnrichBOM(prepared.bom, volumeMultiplier, orderQty);
    if (auto) {
      const gr = enforceAutomotiveGrading(bom, domain);
      bom = gr.bom;
      out.automotiveGradeEnforcedCount = gr.forcedCount;
      out.singleSourceWarnings = flagSingleSourceRisks(bom);
      out.conformalCoatingCost = computeConformalCoatingCost(boardSpec, domain, asilLevel, selectedCountry);
    }

    // 6. The engineer's corrections (re-analysis) are authoritative — including a line
    //    the model dropped or renamed this time (it used to be lost).
    if (inp.correctedBOM && inp.correctedBOM.length) {
      const corr = new Map<string, Record<string, unknown>>();
      // A placeholder ("—", "N/A", "U?") is not a designator: keyed on it, N unlabelled lines became N
      // copies of the last one (360 review). Such a line is matched by its part number + description.
      const keyOf = (l: Record<string, unknown>) => {
        const rd = String(l?.refDes ?? '').trim();
        return /^[A-Za-z_]+\d/.test(rd) ? rd : `pn:${String(l?.partNumber ?? '').trim()}|${String(l?.description ?? '').trim()}`;
      };
      for (const l of inp.correctedBOM) corr.set(keyOf(l), l);
      const used = new Set<string>();
      const fromCorr = (c: Record<string, unknown>, base: Record<string, unknown>) => {
        const price = Number(c.unitPriceGBP);
        const qtyRaw = Number(c.qty);
        const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw) : Number(base.qty) || 1;
        if (!Number.isFinite(price) || price < 0) return null;
        return { ...base, ...c, qty, unitPriceGBP: Math.round(price * 100000) / 100000, lineTotalGBP: Math.round(price * qty * 10000) / 10000,
          volumeAdjusted: false, automotiveGradeForced: false, userCorrected: true };
      };
      bom = bom.map(line => {
        const rd = keyOf(line);
        const c = corr.get(rd);
        if (!c || used.has(rd)) return line;
        used.add(rd);
        return fromCorr(c, line) ?? line;
      });
      for (const [rd, c] of corr) if (!used.has(rd)) { const l = fromCorr(c, {}); if (l) bom.push(l); }
    }

    // 7. Prices: live distributor (if keyed) then the offline catalogue for EVERY
    //    candidate (it has no rate limit — it was capped at 20), at the parts bought.
    const editable = bom.filter(l => l.userCorrected !== true);
    const candidates = groundingCandidates(editable, 500);
    let prices: LivePriceResult[] = [];
    if (candidates.length) {
      const octoKey = inp.live ? '' : await resolveNexarAccessToken();
      const rsKey = inp.live ? '' : process.env.RS_API_KEY ?? '';
      const provider: LivePricingProvider | null = inp.live?.provider ?? (octoKey ? 'octopart' : rsKey ? 'rs' : null);
      const key = inp.live?.key ?? (provider === 'octopart' ? octoKey : rsKey);
      if (provider && key) {
        inp.onProgress?.('Stage 4 — grounding prices against distributor catalogue');
        try {
          prices = await fetchLivePricesWithAECQ(candidates.slice(0, 20), provider, key, orderQty, auto);
          console.log(`[PCB${tag}] Catalogue grounding: ${prices.length}/${Math.min(20, candidates.length)} parts priced via ${provider}`);
        } catch (e) { console.warn(`[PCB${tag}] Live pricing failed (non-fatal):`, (e as Error).message); }
      }
      const hit = new Set(prices.map(p => p.mpn.toUpperCase()));
      for (const pn of candidates) {
        if (hit.has(pn.toUpperCase())) continue;
        const parts = Math.max(...editable.filter(l => String(l.partNumber ?? '').trim() === pn).map(l => Number(l.partsBought) || orderQty));
        prices.push(...offlineCataloguePrices([pn], parts));
      }
    }
    const grounded = groundAndSplit(bom, prices, knownRangeAtVolume(volumeMultiplier), { automotive: auto, volumeMultiplier });
    bom = grounded.bom.map((l, i) => (bom[i].userCorrected === true ? { ...bom[i], priceSource: 'user', needsVerification: false } : l)) as Array<Record<string, unknown>>;
    // What the OCR stage SAW against the parts list: a quantity that differs from the
    // chips read, a connector where only pads were seen. Flagged to verify, never changed.
    {
      const xc = crossCheckWithOcr(bom, ocrResult.icMarkings, ocrResult.connectors ?? []);
      const flag = new Set(xc.map(c => c.refDes));
      if (xc.length) {
        bom = bom.map(l => (flag.has(String(l.refDes ?? l.partNumber)) && l.userCorrected !== true
          ? { ...l, needsVerification: true, ocrCheck: xc.filter(c => c.refDes === String(l.refDes ?? l.partNumber)).map(c => c.message).join(' ') } : l));
        for (const c of xc) warnings.push({ code: c.code, severity: 'warn', message: c.message });
      }
    }
    a.bom = bom;
    const sum = (f: (l: Record<string, unknown>) => boolean) => Math.round(bom.filter(f).reduce((t, l) => t + (Number(l.lineTotalGBP) || 0), 0) * 100) / 100;
    const bomTotal = sum(() => true);
    costEst.totalBOMCostGBP = bomTotal;
    costEst.confirmedBOMCostGBP = sum(l => l.needsVerification !== true);
    // The remainder, so "priced" + "to verify" always equals the BOM total on screen
    // (rounded separately they were a penny out).
    costEst.unverifiedBOMCostGBP = Math.round((bomTotal - Number(costEst.confirmedBOMCostGBP)) * 100) / 100;
    out.livePriceHits = bom.filter(l => l.livePriced === true).length;
    out.catalogueVerifiedCount = grounded.matched;
    out.needsVerificationCount = bom.filter(l => l.needsVerification === true).length;
    a.catalogueVerifiedCount = out.catalogueVerifiedCount;
    a.needsVerificationCount = out.needsVerificationCount;
    a.pricesCappedCount = grounded.capped;
    if (auto) out.automotiveNRE = computeAutomotiveNRE(asilLevel, bomTotal, selectedCountry);

    // 8. Missing board facts default — and every default is said out loud.
    const dflt = (label: string, v: unknown, d: number | string) => {
      const ok = typeof d === 'number' ? Number(v) > 0 : Boolean(v);
      if (!ok) warnings.push({ code: 'BOARD_DEFAULT_USED', severity: 'warn', message: `${label} was not read from the photos or files; ${d} was assumed. Measure it or attach the fab data.` });
      return ok ? v : d;
    };
    const widthMm = Number(dflt('Board width (mm)', boardSpec.widthMm, 100));
    const heightMm = Number(dflt('Board height (mm)', boardSpec.heightMm, 80));
    const layers = Number(dflt('Layer count', boardSpec.estimatedLayers, 2));
    const throughVias = Number(boardSpec.throughVias) >= 0 && boardSpec.throughVias !== undefined && boardSpec.throughVias !== null && boardSpec.throughVias !== ''
      ? Number(boardSpec.throughVias) : Number(dflt('Through-via count', undefined, 50));
    if (!(bomTotal > 0)) warnings.push({ code: 'BOM_TOTAL_ZERO', severity: 'error', message: 'No component on the BOM carries a price, so the board is costed without parts. Check the BOM.' });

    const costInput: PCBCostInput = {
      widthMm, heightMm, layers,
      surfaceFinish: String(boardSpec.surfaceFinish || 'enig'), throughVias,
      blindVias: Number(boardSpec.blindVias) || 0, microVias: Number(boardSpec.microVias) || 0, hdiStructure: String(boardSpec.hdiStructure || 'none'),
      impedanceControlled: Boolean(boardSpec.impedanceControlRequired), smtPlacements: Number(assemblyData.smtPlacements) || 0,
      throughHoleJoints: Number(assemblyData.throughHoleJoints) || 0, manualJoints: Number(assemblyData.manualJoints) || 0,
      bgaCount: Number(assemblyData.bgaCount) || 0, aoiRequired: Boolean(assemblyData.aoiRequired), ictTimeSec: Number(assemblyData.ictTimeSec) || 0,
      conformalCoatAreaCm2: out.conformalCoatingCost > 0 ? widthMm * heightMm / 100 : 0,
      // The BOM is the BOM: it used to fall back to the fab estimate, costing the board twice.
      totalBOMCostGBP: bomTotal, orderQuantity: orderQty,
      copperOzByLayer: copperLayersFromSpec(boardSpec), weightKg: weightKgFromSpec(boardSpec),
    };
    out.countryComparison = computeAllCountryCosts(costInput);
    const resolved = PCB_COUNTRY_RATES[selectedCountry] ? selectedCountry : 'cn';
    const bd = computePCBCountryCost(costInput, resolved);
    for (const c of out.countryComparison) applyAutomotiveGrade(c, boardSpec, assemblyData, asilLevel, orderQty, domain);
    const graded = applyAutomotiveGrade(bd, boardSpec, assemblyData, asilLevel, orderQty, domain);
    if (graded) { out.automotiveAssemblyCost = graded.assembly; out.automotiveFabAdjustment = graded.fab; }
    out.selectedCountryBreakdown = bd;
    // Panel: a board bigger than every panel had zero waste charged, and a poor fit was
    // clamped to 40 % utilisation — both silently (PCB review, Oct 2026).
    if (bd.panelInfo) {
      const u = bd.panelInfo.utilisation;
      if (u <= 0) warnings.push({ code: 'BOARD_LARGER_THAN_PANEL', severity: 'warn',
        message: `A ${widthMm}×${heightMm} mm board does not fit the standard production panels; it is costed one per panel with no panel waste. Check the board size, or quote it as a special.` });
      else if (u < 0.4) warnings.push({ code: 'PANEL_UTILISATION_LOW', severity: 'warn',
        message: `Panel utilisation is ${Math.round(u * 100)} % (${bd.panelInfo.boardsPerPanel}-up on ${bd.panelInfo.panelW}×${bd.panelInfo.panelH} mm); the fab cost assumes at least 40 %, so it may be low.` });
    }
    // The coating the headline charges (country rate × area), not a second model of it.
    if (auto) out.conformalCoatingCost = Math.round(costInput.conformalCoatAreaCm2 * (PCB_COUNTRY_RATES[resolved]?.assembly.conformalCoatPerCm2 ?? 0) * 100) / 100;

    out.confidenceBand = computeConfidenceBand(bom as unknown as BOMLineForBand[], fabCostMid, ocrResult.extractionQuality, volumeMultiplier);
    out.confidenceBand = anchorBandToHeadline(out.confidenceBand, bd) ?? out.confidenceBand;
    setDeterministicCostEstimates(a, bd, bomTotal);
    // Panels that quote a "production" or "programme" figure start from the headline.
    out.bomCompleteness = estimateMissingPassives(bom, Number(assemblyData.smtPlacements) || 0, a.bomSource === 'file' || a.bomSource === 'image');
    out.programPricing = computeProgramPricing(bd.bomCostPerBoard, orderQty, domain);
    out.npiBreakdown = computeNPIBreakdown(bd.bomCostPerBoard, bd.totalPerBoard - bd.bomCostPerBoard, Number(assemblyData.smtPlacements) || 0, orderQty, bd.totalPerBoard);

    // Volume curves: include the analysed quantity, so the curve passes through the headline.
    const sorted = [...out.countryComparison].sort((x, y) => x.totalPerBoard - y.totalPerBoard);
    const cheapestId = sorted[0]?.countryId ?? 'cn';
    const qtys = [...new Set([100, 250, 500, 1000, 2500, 5000, 10000, 25000, 100000, orderQty])].sort((x, y) => x - y);
    const bpp = bd.panelInfo?.boardsPerPanel ?? 1;
    // Component prices follow each point's quantity (parts bought per line); edited lines stay as typed.
    const bomAt = (q: number) => bomAtQty(bom, q, orderQty);
    const curve = (id: string) => gradeVolumeCurve(computeVolumeCurve(costInput, id, qtys, bomAt), boardSpec, assemblyData, asilLevel, domain, bpp, id);
    out.volumeCurves = { [cheapestId]: curve(cheapestId), [resolved]: curve(resolved), gb: curve('gb') };
    out.complexityScore = computeComplexityScore(boardSpec, assemblyData);

    out.sanityWarnings = [...runSanityChecks(boardSpec, assemblyData, bom, Number((a.aiFirstPass as Record<string, unknown> | undefined)?.totalBOMCostGBP ?? 0), orderQty), ...warnings];
    console.log(`[PCB${tag}] Stage 4: qty=${orderQty} BOM=${bomTotal.toFixed(2)} headline=${bd.totalPerBoard.toFixed(2)} lines=${bom.length} verify=${out.needsVerificationCount}${auto ? ` asil=${asilLevel}` : ''}`);
  } catch (err) {
    out.failed = true;
    console.warn(`[PCB${tag}] Stage 4 failed:`, (err as Error).message);
    out.sanityWarnings.push({ code: 'COSTING_FAILED', severity: 'error',
      message: `The cost build-up could not be completed (${(err as Error).message}). The figures shown are incomplete — re-run the analysis.` });
  }
  return out;
}

/**
 * Cache key over EVERY input that changes the result. The keys left out the fab
 * files (and the stream key the image labels): attach Gerbers after a photo-only
 * run and the cache replayed the old result, ignoring the measured board.
 * v8: Oct 2026 review pricing — results priced under the old rules must not replay.
 */
function pcbCacheKey(req: import('express').Request, files: Record<string, Express.Multer.File[]> | undefined, deep: boolean, labels: string[]): string {
  return buildCacheKey([
    ...(files?.pcbImages ?? []).map(f => f.buffer),
    Buffer.from(JSON.stringify({
      country: req.body?.country ?? 'cn', orderQty: req.body?.orderQty ?? '100',
      nre: req.body?.automotiveNRE ?? req.body?.includeAutomotiveNRE ?? '',
      // v9 (camera-board trial, Oct 2026): board-size band, ICT / X-ray / AOI at volume, EMS material burden,
      // imager / bead / choke classes, -Q1 lookup, automotive from the BOM. Bump on every costing change:
      // the cache persists across restarts and would otherwise replay a result costed by the old rules.
      // v10: the ASIL is checked against the parts list (pcb-asil-guard.ts).
      // v11: named imagers priced at automotive volume, their listing a reference (IMAGER_RE, 9 Oct 2026).
      deep, labels: labels.slice(0, (files?.pcbImages ?? []).length), v: 11,
    })),
    ...(files?.bomFile ?? []).map(f => f.buffer),
    ...(files?.fabFiles ?? []).flatMap(f => [Buffer.from(f.originalname), f.buffer]),
  ]);
}

/**
 * The BOM total at another board quantity: each line's price moves by the volume
 * table at its own parts-bought quantity; lines the engineer typed stay as typed.
 * At the analysed quantity it is exactly the BOM total. Shared by the volume curve
 * and the what-if scenario so both agree with the headline.
 */
export function bomAtQty(lines: Array<Record<string, unknown>>, q: number, analysedQty: number): number {
  return Math.round(lines.reduce((t, l) => {
    const lt = Number(l.lineTotalGBP) || 0;
    if (l.userCorrected === true || q === analysedQty) return t + lt;
    const n = Math.max(1, Number(l.qty) || 1);
    return t + lt * getVolumeMultiplier(n * q) / getVolumeMultiplier(n * analysedQty);
  }, 0) * 100) / 100;
}

/** The response fields Stage 4 contributes, identical for every route. */
function stage4Payload(s4: Stage4Output) {
  return {
    selectedCountry: s4.selectedCountry, selectedCountryBreakdown: s4.selectedCountryBreakdown,
    countryComparison: s4.countryComparison, volumeCurves: s4.volumeCurves, complexityScore: s4.complexityScore,
    confidenceBand: s4.confidenceBand, volumeMultiplier: s4.volumeMultiplier, sanityWarnings: s4.sanityWarnings,
    npiBreakdown: s4.npiBreakdown, livePriceHits: s4.livePriceHits,
    catalogueVerifiedCount: s4.catalogueVerifiedCount, needsVerificationCount: s4.needsVerificationCount,
    automotiveNRE: s4.automotiveNRE, automotiveGradeEnforcedCount: s4.automotiveGradeEnforcedCount,
    singleSourceWarnings: s4.singleSourceWarnings, conformalCoatingCost: s4.conformalCoatingCost,
    automotiveAssemblyCost: s4.automotiveAssemblyCost, automotiveFabAdjustment: s4.automotiveFabAdjustment,
    bomCompleteness: s4.bomCompleteness, programPricing: s4.programPricing,
    orderQty: s4.orderQty, costingFailed: s4.failed, boardDomain: s4.domain,
    // The ASIL the costing used (the guard's), what the classifier claimed, and why they differ.
    ...(s4.asil ? { asilLevel: s4.asil.costed, asilClaimed: s4.asil.claimed, asilRationale: s4.asil.rationale,
      asilSafetyFunctions: s4.asil.safetyFunctions, asilNotes: s4.asil.notes, boardFunction: s4.asil.boardFunction } : {}),
  };
}

router.post('/analyze-image', aiLimit('pcbVision'), upload.fields([
  { name: 'pcbImages', maxCount: PCB_MAX_IMAGES },   // up to 8 images: top, bottom, + 6 close-ups
  { name: 'bomFile', maxCount: 1 },
  { name: 'fabFiles', maxCount: 40 },
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

  // Check cache — keyed by SHA-256 of all uploaded images + body params
  const deepAnalysis = isDeep(req);
  const cacheKey = pcbCacheKey(req, files, deepAnalysis, imageLabels);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[PCB] Cache HIT: ${cacheKey.slice(0,12)}`);
    res.json(cached);
    return;
  }

  // Optional user-provided BOM file — parsed and injected as ground truth.
  let parsedBOM: ParsedBOMLine[] = [];
  if (bomFileUpload && !isBomImage(bomFileUpload)) {
    try {
      parsedBOM = parseBOMFile(bomFileUpload.buffer.toString('utf-8'), bomFileUpload.originalname);
      console.log(`[PCB] BOM file parsed: ${parsedBOM.length} lines from ${bomFileUpload.originalname}`);
    } catch (err) {
      console.warn('[PCB] BOM file parse failed:', err instanceof Error ? err.message : String(err));
    }
  }

  if (isAirGapped()) { res.status(503).json(aiDisabledBody('Reading a board from a photo')); return; }
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured. Add it in Settings or set the environment variable.' });
    return;
  }

  const anthropic = createAnthropic(apiKey);
  console.log(`[PCB] ${imageFiles.length} image(s) received: ${imageLabels.slice(0, imageFiles.length).join(', ')}`);
  const bomImage = await bomFromImageUpload(anthropic, bomFileUpload, deepAnalysis, '');
  if (bomImage) parsedBOM = bomImage.lines;

  // ── Stage 1: Board domain classification (Haiku) ───────────────────────
  let stage1Result: Stage1Result = { domain: 'general', conf: 0.5, hints: [] };
  try {
    const s1Msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: 'You are a PCB classification expert. Identify the board\'s application domain from visual cues. Return ONLY JSON.',
      messages: [{
        role: 'user',
        content: [
          // Every photo, not just the first: an industrial or medical cue on the bottom side
          // or in a close-up was never seen (PCB review, Oct 2026). Haiku — cheap.
          ...buildImageContentBlocks(imageFiles, imageLabels, imageFiles.length > 1),
          { type: 'text', text: stage1Prompt() },
        ],
      }],
    });
    const s1Raw = textOf(s1Msg);
    const s1Parsed = JSON.parse(extractJSON(s1Raw)) as Stage1Result;
    stage1Result = {
      domain: s1Parsed.domain ?? 'general',
      conf: typeof s1Parsed.conf === 'number' ? s1Parsed.conf : 0.5,
      hints: Array.isArray(s1Parsed.hints) ? s1Parsed.hints : [],
    };
    gateAutomotive(stage1Result);
    console.log(`[PCB] Stage 1: ${stage1Result.domain} (conf=${stage1Result.conf})`);
  } catch (err) {
    console.warn('[PCB] Stage 1 failed, using defaults:', err instanceof Error ? err.message : String(err));
    stage1Result.failed = true;
  }

  let domain = stage1Result.domain;

  // ── Stage 1b: ASIL classification (Haiku) — automotive_adas only ────────
  let asilClassification: Stage1bASIL = { asilLevel: 'Unknown', asilRationale: '', safetyFunctions: [] };
  if (domain === 'automotive_adas') {
    console.log('[PCB] Stage 1b: ASIL classification...');
    asilClassification = await classifyASILLevel(anthropic, imageFiles, imageLabels, stage1Result.hints.join(', ') || domain);
    console.log(`[PCB] Stage 1b: ASIL=${asilClassification.asilLevel}`);
  }

  // ── Stage 2: OCR text extraction (Haiku) — uses ALL images ──────────
  let ocrResult: OCRResult = { icMarkings: [], refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'low' };
  try {
    const s2MultiNote = multiImage
      ? `\n\nNOTE: ${imageFiles.length} PCB photos provided (${imageLabels.slice(0, imageFiles.length).join(', ')}). Extract text from ALL images — the bottom side and additional photos often expose component markings not visible from the top.`
      : '';
    const s2Msg = await anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 4096,
      system: 'You are an expert at reading text from PCB images. Extract all readable text. Return ONLY JSON.',
      messages: [{
        role: 'user',
        content: [
          ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
          { type: 'text', text: stage2Prompt + s2MultiNote },
        ],
      }],
    });
    const s2Raw = textOf(s2Msg);
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
    ocrResult.extractionQuality = 'failed';
  }

  // ── Deterministic automotive promotion from IC markings ─────────────────
  // Stage 1 classifies the domain from the TOP image before OCR reads any part
  // number, so an automotive RADAR module (NXP S32R + antenna array) or a board
  // whose flagship IC is an automotive MCU can be mislabelled rf_microwave/general
  // — silently disabling ASIL, program pricing and AEC-Q grading. When the OCR
  // markings expose an unmistakable automotive-silicon signature we force the
  // automotive path (and run the ASIL step Stage 1 skipped). Ground truth wins.
  if (domain !== 'automotive_adas' && looksAutomotiveSilicon(ocrResult.icMarkings)) {
    const sig = ocrResult.icMarkings.find(m => looksAutomotiveSilicon([m])) ?? 'automotive IC';
    console.log(`[PCB] Promoted domain -> automotive_adas from IC marking "${sig}" (Stage 1 said ${domain})`);
    domain = 'automotive_adas';
    stage1Result.domain = 'automotive_adas';
    stage1Result.conf = Math.max(stage1Result.conf, 0.9);
    if (asilClassification.asilLevel === 'Unknown') {
      try {
        asilClassification = await classifyASILLevel(anthropic, imageFiles, imageLabels, ocrResult.icMarkings.join(', ') || domain);
        console.log(`[PCB] ASIL (post-promotion): ${asilClassification.asilLevel}`);
      } catch (err) {
        console.warn('[PCB] Post-promotion ASIL failed:', err instanceof Error ? err.message : String(err));
      }
    }
  }

  // ── Stage 3: Full BOM analysis with specialist persona (Sonnet) ────────
  console.log(`[PCB] Stage 3: Sonnet specialist analysis (${imageFiles.length} image(s))...`);
  const specialistSystem = SPECIALIST_SYSTEM_PROMPTS[domain] ?? SPECIALIST_SYSTEM_PROMPTS['general'];
  const multiImageNote = multiImage
    ? `\n\nNOTE: ${imageFiles.length} PCB photos provided (${imageLabels.slice(0, imageFiles.length).join(', ')}). Use ALL images together for maximum accuracy — top side for component placement, bottom side for assembly type and solder joints, additional photos for close-up markings or specific areas of interest.`
    : '';
  const reqOrderQty = parseOrderQty(req.body?.orderQty);
  const userPromptText = buildUserPrompt(ocrResult, stage1Result, domain, reqOrderQty) + multiImageNote +
    (parsedBOM.length > 0 ? buildParsedBOMContext(parsedBOM) : '');

  let analysis: unknown;
  let lastRaw = '';
  let lastError = '';

  try {
    // ── Attempt 1: Full vision analysis (all images) ─────────────────────
    const msg1 = await stage3Message(anthropic, {
      model: extractionModel(deepAnalysis),
      max_tokens: EXTRACT_MAX_TOKENS,
      system: specialistSystem,
      messages: [{
        role: 'user',
        content: [
          ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
          { type: 'text', text: userPromptText },
        ],
      }],
    }, '');
    if (msg1.stop_reason === 'max_tokens') console.warn('[PCB] Stage 3 hit the output-token limit — BOM likely truncated; will salvage/consolidate');

    lastRaw = textOf(msg1);

    try {
      analysis = JSON.parse(extractJSON(lastRaw));
    } catch (e1) {
      lastError = String(e1);
      console.warn('[PCB] Attempt 1 JSON parse failed:', lastError);
      console.warn('[PCB] Raw (first 500):', lastRaw.slice(0, 500));

      // ── Attempt 1b: salvage complete BOM lines from a truncated response ──
      // Cheaper and more faithful than a repair round-trip when the failure is
      // output-token truncation (the common case for large automotive boards).
      const salvaged = salvageAnalysisFromRaw(lastRaw);
      if (salvaged) {
        console.warn(`[PCB] Salvaged ${(salvaged.bom as unknown[]).length} BOM line(s) from a truncated/malformed Stage-3 response`);
        analysis = salvaged;
      } else {
        // ── Attempt 2: Send raw response back to Claude for JSON repair ────
        const msg2 = await anthropic.messages.create({
          model: extractionModel(deepAnalysis),
          max_tokens: EXTRACT_MAX_TOKENS,
          system: 'You are a JSON repair assistant. Return ONLY valid JSON — nothing else. Start with { and end with }.',
          messages: [{ role: 'user', content: buildRepairPrompt(lastRaw) }],
        });

        lastRaw = textOf(msg2);

        try {
          analysis = JSON.parse(extractJSON(lastRaw));
        } catch (e2) {
          lastError = String(e2);
          console.error('[PCB] Attempt 2 JSON repair also failed:', lastError);
          console.error('[PCB] Repair raw (first 500):', lastRaw.slice(0, 500));

          const salvaged2 = salvageAnalysisFromRaw(lastRaw);
          if (salvaged2) {
            console.warn(`[PCB] Salvaged ${(salvaged2.bom as unknown[]).length} BOM line(s) from the repair response`);
            analysis = salvaged2;
          } else {
            // ── Attempt 3: Minimal fallback prompt ───────────────────────────
            const fallbackPrompt = `A PCB image was analysed and the result should have been JSON. The analysis failed. Return a valid JSON object with these exact fields, set confidenceLevel to "Low", and include an analysisLimitation explaining the parse failure. List every component you can see as bom lines; a part whose marking you cannot read gets an EMPTY partNumber and is described by function — never invent one. Group identical passives into one line with a combined quantity to keep the response compact.

${userPromptText}`;

            const msg3 = await anthropic.messages.create({
              model: extractionModel(deepAnalysis),
              max_tokens: 8192,
              system: specialistSystem,
              messages: [{
                role: 'user',
                content: [
                  ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
                  { type: 'text', text: fallbackPrompt },
                ],
              }],
            });

            lastRaw = textOf(msg3);

            try {
              analysis = JSON.parse(extractJSON(lastRaw));
            } catch (e3) {
              const salvaged3 = salvageAnalysisFromRaw(lastRaw);
              if (salvaged3) {
                analysis = salvaged3;
              } else {
                res.status(500).json({
                  error: `PCB analysis failed after 3 attempts. The AI could not produce valid JSON. Parse error: ${String(e3)}. Raw response preview: ${lastRaw.slice(0, 400)}`,
                });
                return;
              }
            }
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PCB] Anthropic API error:', msg);
    res.status(502).json({ error: `AI service error: ${msg}` });
    return;
  }

  // Empty BOM = failed analysis, not a result (see streaming path). Retry
  // once with an emphatic instruction; if still empty, 422 without caching.
  normalizePCBAnalysis(analysis as Record<string, unknown>);
  if (bomIsEmpty(analysis)) {
    console.warn('[PCB] Stage 3 returned an EMPTY BOM — retrying once with emphasis');
    try {
      const retry = await stage3Message(anthropic, {
        model: extractionModel(deepAnalysis), max_tokens: EXTRACT_MAX_TOKENS, system: specialistSystem,
        messages: [{ role: 'user', content: [
          ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
          { type: 'text', text: userPromptText + EMPTY_BOM_RETRY_NOTE },
        ]}],
      }, '');
      if (retry.stop_reason === 'max_tokens') console.warn('[PCB] Empty-BOM retry hit the output-token limit — salvaging');
      const retryRaw = textOf(retry);
      let retryAnalysis: Record<string, unknown> | null;
      try { retryAnalysis = JSON.parse(extractJSON(retryRaw)) as Record<string, unknown>; }
      catch { retryAnalysis = salvageAnalysisFromRaw(retryRaw); }
      if (retryAnalysis) {
        normalizePCBAnalysis(retryAnalysis);
        if (!bomIsEmpty(retryAnalysis)) analysis = retryAnalysis;
      }
    } catch (retryErr) {
      console.warn('[PCB] Empty-BOM retry failed:', (retryErr as Error).message);
    }
  }
  if (bomIsEmpty(analysis)) {
    res.status(422).json({
      error: 'The AI could not identify any components on this board (empty BOM), even after a retry. ' +
             'Add close-up photos with readable IC markings, or attach a BOM file. This result was NOT cached — analyzing again will run fresh.',
    });
    return;
  }

  // ── Stage 3b: a second look at unidentified high-value ICs ────────────────
  await applyStage3b(anthropic, analysis as Record<string, unknown>, imageFiles, imageLabels, domain, '');

  // ── Stage 4: one implementation for every route (runStage4) ───────────────
  const s4 = await runStage4({
    analysis: analysis as Record<string, unknown>, domain, asilLevel: asilClassification.asilLevel, ocrResult,
    asilRationale: asilClassification.asilRationale, asilSafetyFunctions: asilClassification.safetyFunctions,
    country: (req.body?.country as string | undefined) ?? 'cn',
    orderQty: parseOrderQty(req.body?.orderQty),
    parsedBOM, bomImageNotes: bomImage?.notes, files, tag: '', classificationFailed: stage1Result.failed === true,
  });

  // ── Structural guarantee for the client ─────────────────────────────────
  // The model can omit sections OR individual numerics from the Stage 3 JSON
  // even after repair; the renderer calls .toFixed() on them and crashes.
  // Deep-normalize the full contract: every section exists, every numeric the
  // renderer touches is a finite number, with defaults derived from the BOM.
  normalizePCBAnalysis(analysis as Record<string, unknown>);

  const finalPayload = {
    success: true,
    analysis,
    ...stage4Payload(s4),
    // What the earlier stages found, for /reanalyze and the screen: the domain and the
    // markings used to come back only if the MODEL echoed them, which structured output
    // never does — a re-analysis then costed an automotive board as "general".
    stage1Classification: { domain: s4.domain, conf: stage1Result.conf, hints: stage1Result.hints, failed: stage1Result.failed === true, ...(s4.domain !== domain ? { classifierDomain: domain } : {}) },
    ocrExtraction: { icMarkings: ocrResult.icMarkings, connectors: ocrResult.connectors ?? [], extractionQuality: ocrResult.extractionQuality },
    // ASIL fields come from stage4Payload: the level the costing used, checked against the BOM.
    fromCache: false,
  };
  // Never cache a hollow, salvaged or half-costed result — it would replay forever.
  if (!bomIsEmpty(analysis) && !s4.failed && !(analysis as Record<string, unknown>)._salvaged) setCached(cacheKey, { ...finalPayload, fromCache: true });
  res.json(finalPayload);
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
  parts.push('optimisationSuggestions, confidenceLevel, analysisLimitations and partName. Do not estimate costs — the server prices the board.\n');
  return parts.join('\n');
}

// POST /api/pcb/reanalyze — skip Stages 1 & 2, run Stage 3+4 with corrected values
router.post('/reanalyze', aiLimit('pcbVision'), upload.fields([
  { name: 'pcbImages', maxCount: PCB_MAX_IMAGES },
]), async (req, res): Promise<void> => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFiles = files?.pcbImages ?? [];
  const deepAnalysis = isDeep(req);

  if (isAirGapped()) { res.status(503).json(aiDisabledBody('Reading a board from a photo')); return; }
  const apiKey = resolveApiKey(req);
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
    connectors: (() => { try { const c = JSON.parse(String(req.body?.ocrConnectors ?? '[]')); return Array.isArray(c) ? c.map(String) : []; } catch { return []; } })(),
    boardText: [],
    // The first analysis's OCR quality (the UI sends it back); 'high' was hard-coded,
    // which narrowed the confidence band on every re-analysis.
    extractionQuality: /^(high|medium|low|none)$/.test(String(req.body?.ocrQuality ?? '')) ? String(req.body?.ocrQuality) : 'medium',
  };

  const anthropic = createAnthropic(apiKey);
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
    const contentBlocks: Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } } | { type: 'text'; text: string }> =
      imageFiles.length > 0 ? buildImageContentBlocks(imageFiles, imageLabels, multiImage) : [];

    const msg1 = await stage3Message(anthropic, {
      model: extractionModel(deepAnalysis),
      max_tokens: EXTRACT_MAX_TOKENS,
      system: specialistSystem,
      messages: [{
        role: 'user',
        content: [
          ...contentBlocks,
          { type: 'text', text: userPromptText },
        ],
      }],
    }, '/reanalyze');

    lastRaw = textOf(msg1);

    try {
      analysis = JSON.parse(extractJSON(lastRaw));
    } catch (e1) {
      console.warn('[PCB/reanalyze] Attempt 1 JSON parse failed:', String(e1));

      // ── Attempt 2: JSON repair ────────────────────────────────────────
      const msg2 = await anthropic.messages.create({
        model: extractionModel(deepAnalysis),
        max_tokens: EXTRACT_MAX_TOKENS,
        system: 'You are a JSON repair assistant. Return ONLY valid JSON — nothing else. Start with { and end with }.',
        messages: [{ role: 'user', content: buildRepairPrompt(lastRaw) }],
      });

      lastRaw = textOf(msg2);

      try {
        analysis = JSON.parse(extractJSON(lastRaw));
      } catch (e2) {
        console.error('[PCB/reanalyze] Attempt 2 JSON repair failed:', String(e2));

        // ── Attempt 3: Minimal fallback ───────────────────────────────
        const fallbackContentBlocks: Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } } | { type: 'text'; text: string }> =
          imageFiles.length > 0 ? buildImageContentBlocks(imageFiles, imageLabels, multiImage) : [];

        const msg3 = await anthropic.messages.create({
          model: extractionModel(deepAnalysis),
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

        lastRaw = textOf(msg3);

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

  if (!analysis || typeof analysis !== 'object') {
    res.status(502).json({ error: 'Re-analysis returned an empty result — please try again.' });
    return;
  }
  // Same structural guarantee as the other two analysis routes: a sparse model
  // response (missing assembly/costEstimates/boardSpec strings) crashed the
  // renderer after re-analysis with "undefined is not an object (evaluating
  // 'a.smtPlacements')" — this route was the only one left un-normalized.
  normalizePCBAnalysis(analysis as Record<string, unknown>);
  // The user's corrected BOM is authoritative ground truth: if the model
  // dropped the BOM entirely, restore it instead of failing.
  if (bomIsEmpty(analysis) && Array.isArray(correctedBOM) && correctedBOM.length > 0) {
    console.warn('[PCB/reanalyze] Model returned no BOM — restoring the user-corrected BOM (ground truth)');
    (analysis as Record<string, unknown>).bom = correctedBOM;
    normalizePCBAnalysis(analysis as Record<string, unknown>);
  }
  if (bomIsEmpty(analysis)) {
    res.status(422).json({
      error: 'Re-analysis returned no BOM lines. Your original result is unchanged — try Re-analyze again, or correct the BOM rows before re-analyzing.',
    });
    return;
  }

  // ── Stage 4: the same implementation as a first analysis (runStage4) ─────
  // The ASIL from the first analysis (the UI sends it back): burn-in and the NRE
  // tier depend on it, and a re-analysis used to reset it to Unknown.
  const reanalAsil = (/^(ASIL-[ABCD]|QM)$/.test(String(req.body?.asilLevel ?? '')) ? String(req.body?.asilLevel) : 'Unknown') as ASILLevel;
  const reanalFns = (() => { try { const v = JSON.parse(String(req.body?.asilSafetyFunctions ?? '[]')); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } })();
  const s4 = await runStage4({
    analysis: analysis as Record<string, unknown>, domain, asilLevel: reanalAsil, ocrResult,
    asilRationale: String(req.body?.asilRationale ?? ''), asilSafetyFunctions: reanalFns,
    country: (req.body?.country as string | undefined) ?? 'cn',
    orderQty: parseOrderQty(req.body?.orderQty),
    correctedBOM: Array.isArray(correctedBOM) ? (correctedBOM as Array<Record<string, unknown>>) : null,
    tag: '/reanalyze',
  });
  normalizePCBAnalysis(analysis as Record<string, unknown>);

  res.json({
    success: true,
    analysis,
    ...stage4Payload(s4),
    stage1Classification: { domain, conf: 1, hints: [] },
    ocrExtraction: { icMarkings: ocrResult.icMarkings, connectors: ocrResult.connectors ?? [], extractionQuality: ocrResult.extractionQuality },
  });
});

// POST /api/pcb/live-pricing  — optional live component pricing
/**
 * GET /api/pcb/ecu-library?volume=300000 — which ECUs each powertrain carries and their key
 * ICs, each linked to its catalogue price at that annual volume (pcb-ecu-library.ts).
 */
router.get('/ecu-library', (req, res): void => {
  const v = parseInt(String(req.query.volume ?? '100000'), 10);
  res.json(ecuLibrary([100_000, 200_000, 300_000].includes(v) ? v : Math.min(1_000_000, Math.max(1_000, v || 100_000))));
});

/**
 * POST /api/pcb/reprice — Stage 4 again on the current analysis, no AI call: a new
 * country, quantity or distributor key. "Fetch Live Prices" used to overwrite line
 * prices in the browser (at a fixed qty of 100), mark them "OCR extracted" and leave
 * the BOM total and the headline unchanged. Now every figure moves together.
 */
router.post('/reprice', async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as {
    analysis?: Record<string, unknown>; domain?: string; asilLevel?: string; ocrMarkings?: string[]; ocrConnectors?: string[]; ocrQuality?: string;
    asilRationale?: string; asilSafetyFunctions?: unknown[];
    country?: string; orderQty?: number | string; provider?: string; apiKey?: string;
  };
  if (!b.analysis || typeof b.analysis !== 'object' || !Array.isArray(b.analysis.rawBom ?? b.analysis.bom)) {
    res.status(400).json({ error: 'analysis with a BOM is required' }); return;
  }
  const analysis = JSON.parse(JSON.stringify(b.analysis)) as Record<string, unknown>;
  const provider = ['octopart', 'rs'].includes(String(b.provider)) ? (b.provider as LivePricingProvider) : null;
  const domain = String(b.domain ?? 'general');
  const asil = (/^(ASIL-[ABCD]|QM)$/.test(String(b.asilLevel ?? '')) ? String(b.asilLevel) : 'Unknown') as ASILLevel;
  try {
    const s4 = await runStage4({
      analysis, domain, asilLevel: asil,
      asilRationale: String(b.asilRationale ?? ''), asilSafetyFunctions: Array.isArray(b.asilSafetyFunctions) ? b.asilSafetyFunctions.map(String) : [],
      ocrResult: { icMarkings: Array.isArray(b.ocrMarkings) ? b.ocrMarkings.map(String) : [], refDesGroups: [], connectors: Array.isArray(b.ocrConnectors) ? b.ocrConnectors.map(String) : [], boardText: [],
        extractionQuality: /^(high|medium|low|none|failed)$/.test(String(b.ocrQuality ?? '')) ? String(b.ocrQuality) : 'medium' },
      country: String(b.country ?? 'cn'), orderQty: parseOrderQty(b.orderQty),
      live: provider && b.apiKey ? { provider, key: String(b.apiKey) } : undefined,
      tag: '/reprice',
    });
    normalizePCBAnalysis(analysis);
    res.json({ success: true, analysis, ...stage4Payload(s4),
      stage1Classification: { domain, conf: 1, hints: [] },
      ocrExtraction: { icMarkings: Array.isArray(b.ocrMarkings) ? b.ocrMarkings : [], connectors: Array.isArray(b.ocrConnectors) ? b.ocrConnectors : [], extractionQuality: String(b.ocrQuality ?? 'medium') } });
  } catch (err) {
    // Express 4 does not catch async errors: a throw here left the request hanging (360 review).
    console.error('[pcb/reprice]', err);
    res.status(500).json({ error: 'Re-pricing failed. Please try again; if it persists, re-run the analysis.' });
  }
});

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
    // Reaching here means the provider accepted our credentials (auth failures throw
    // above), so `authenticated` lets the client distinguish "token OK but 0 matches"
    // from "token rejected" when the price list comes back empty.
    res.json({ success: true, provider, prices, count: prices.length, authenticated: true });
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
  const b = (req.body ?? {}) as Partial<PCBCostInput> & {
    country?: string; domain?: string; asilLevel?: string;
    boardSpec?: Record<string, unknown>; assembly?: Record<string, unknown>;
    bomLines?: Array<Record<string, unknown>>; analysedQty?: number;
  };
  const countryId = PCB_COUNTRY_RATES[b.country ?? ''] ? (b.country as string) : 'cn';

  const input: PCBCostInput = {
    widthMm:              Number(b.widthMm)             || 100,
    heightMm:             Number(b.heightMm)            || 80,
    layers:               Number(b.layers)              || 2,
    surfaceFinish:        String(b.surfaceFinish        || 'enig'),
    throughVias:          Number(b.throughVias)         >= 0 && b.throughVias != null ? Number(b.throughVias) : 50,
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
    copperOzByLayer:      Array.isArray(b.copperOzByLayer) ? b.copperOzByLayer.map(Number) : undefined,
    weightKg:             Number(b.weightKg) > 0 ? Number(b.weightKg) : undefined,
  };

  // Copper and weight exactly as the headline derives them from the board spec.
  if (b.boardSpec) { input.copperOzByLayer = copperLayersFromSpec(b.boardSpec); input.weightKg = weightKgFromSpec(b.boardSpec); }
  // Components at the scenario's quantity (price breaks), from the priced lines.
  const analysedQty = Number(b.analysedQty) || input.orderQuantity;
  if (Array.isArray(b.bomLines) && b.bomLines.length) input.totalBOMCostGBP = bomAtQty(b.bomLines, input.orderQuantity, analysedQty);
  try {
    const breakdown = computePCBCountryCost(input, countryId);
    // The baseline on screen is the automotive-graded headline; a scenario without the
    // grade showed a false "saving" of the premiums on any change (−£2.70 on the radar).
    const asil = (/^(ASIL-[ABCD]|QM)$/.test(String(b.asilLevel ?? '')) ? String(b.asilLevel) : 'Unknown') as ASILLevel;
    applyAutomotiveGrade(breakdown, b.boardSpec ?? {}, b.assembly ?? {}, asil, input.orderQuantity, String(b.domain ?? 'general'));
    res.json({ success: true, breakdown });
  } catch (err) {
    res.status(400).json({ error: `Scenario compute failed: ${(err as Error).message}` });
  }
});

// POST /api/pcb/analyze-image-stream — SSE streaming variant of analyze-image
// Emits progress events after each stage so the UI can show live stage updates.
router.post('/analyze-image-stream', aiLimit('pcbVision'), upload.fields([
  { name: 'pcbImages', maxCount: PCB_MAX_IMAGES },
  { name: 'bomFile', maxCount: 1 },
  { name: 'fabFiles', maxCount: 40 },
]), async (req, res): Promise<void> => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (type: string, data: unknown) => {
    res.write(`data: ${JSON.stringify({ type, ...( typeof data === 'object' ? data : { value: data }) })}\n\n`);
  };

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFiles = files?.pcbImages ?? [];
  const primaryImage = imageFiles[0];
  if (!primaryImage) { emit('error', { message: 'No image uploaded' }); res.end(); return; }

  if (isAirGapped()) {
    emit('error', { message: `Reading a board from a photo uses AI. ${AI_DISABLED_MESSAGE}`, code: 'AI_DISABLED' });
    res.end(); return;
  }
  const apiKey = resolveApiKey(req);
  if (!apiKey) { emit('error', { message: 'ANTHROPIC_API_KEY not configured' }); res.end(); return; }

  let imageLabels: string[] = DEFAULT_IMAGE_LABELS;
  try { const raw = req.body?.pcbImageLabels as string; if (raw) imageLabels = JSON.parse(raw) as string[]; } catch { /* use defaults */ }
  const multiImage = imageFiles.length > 1;
  const anthropic = createAnthropic(apiKey);

  // ── Result cache ────────────────────────────────────────────────────────────
  // The AI pipeline is not deterministic run-to-run — even at temperature 0, LLM
  // output varies (batching / MoE routing), so the same board produced different
  // BOMs and totals each run. Cache the finished analysis keyed by the exact image
  // bytes + cost params; an identical re-run replays the stored result verbatim.
  const deepAnalysis = isDeep(req);
  const streamCacheKey = pcbCacheKey(req, files, deepAnalysis, imageLabels);
  const streamCached = getCached(streamCacheKey) as Record<string, unknown> | null;
  if (streamCached) {
    console.log(`[PCB/stream] Cache HIT ${streamCacheKey.slice(0, 12)} — replaying stored result (deterministic)`);
    emit('progress', { stage: 5, label: 'Loaded cached analysis', pct: 100 });
    emit('complete', { ...streamCached, fromCache: true });
    res.end();
    return;
  }

  emit('progress', { stage: 0, label: 'Starting analysis…', pct: 5 });

  // Stage 1
  let stage1Result: Stage1Result = { domain: 'general', conf: 0.5, hints: [] };
  try {
    emit('progress', { stage: 1, label: 'Stage 1 — Board domain classification', pct: 15 });
    const s1Msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-haiku-4-5-20251001', max_tokens: 512,
      system: 'You are a PCB classification expert. Return ONLY JSON.',
      messages: [{ role: 'user', content: [
        // Every photo, not just the first (PCB review, Oct 2026).
        ...buildImageContentBlocks(imageFiles, imageLabels, imageFiles.length > 1),
        { type: 'text', text: stage1Prompt() },
      ]}],
    });
    const s1Raw = textOf(s1Msg);
    const s1P = JSON.parse(extractJSON(s1Raw)) as Stage1Result;
    stage1Result = { domain: s1P.domain ?? 'general', conf: s1P.conf ?? 0.5, hints: s1P.hints ?? [] };
    gateAutomotive(stage1Result, 'PCB/stream');
    emit('stage1', { domain: stage1Result.domain, conf: stage1Result.conf, hints: stage1Result.hints });
  } catch { stage1Result.failed = true; emit('progress', { stage: 1, label: 'Stage 1 — classification failed, using "general"', pct: 20 }); }

  // Stage 1b: ASIL classification for automotive_adas
  let streamAsilClassification: Stage1bASIL = { asilLevel: 'Unknown', asilRationale: '', safetyFunctions: [] };
  if (stage1Result.domain === 'automotive_adas') {
    try {
      emit('progress', { stage: 1, label: 'Stage 1b — ASIL safety classification', pct: 25 });
      streamAsilClassification = await classifyASILLevel(anthropic, imageFiles, imageLabels, stage1Result.hints.join(', ') || stage1Result.domain);
    } catch { /* non-fatal */ }
  }

  // Stage 2
  let ocrResult: OCRResult = { icMarkings: [], refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'low' };
  try {
    emit('progress', { stage: 2, label: 'Stage 2 — OCR text extraction', pct: 35 });
    const s2Note = multiImage ? `\n\nNOTE: ${imageFiles.length} photos provided (${imageLabels.slice(0, imageFiles.length).join(', ')}). Extract from ALL images.` : '';
    const s2Msg = await anthropic.messages.create({
      model: OCR_MODEL, max_tokens: 4096,
      system: 'You are an expert at reading PCB text. Return ONLY JSON.',
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
        { type: 'text', text: stage2Prompt + s2Note },
      ]}],
    });
    const s2Raw = textOf(s2Msg);
    const s2P = JSON.parse(extractJSON(s2Raw)) as OCRResult;
    // Arrays of strings only, as the non-streaming route: a string icMarkings threw outside any try and
    // the SSE stream never sent complete or error (360 review).
    const strs = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    ocrResult = { icMarkings: strs(s2P.icMarkings), refDesGroups: Array.isArray(s2P.refDesGroups) ? s2P.refDesGroups : [], connectors: strs(s2P.connectors), boardText: strs(s2P.boardText), extractionQuality: s2P.extractionQuality ?? 'low' };
    emit('stage2', { icMarkings: ocrResult.icMarkings, extractionQuality: ocrResult.extractionQuality });
  } catch { ocrResult.extractionQuality = 'failed'; emit('progress', { stage: 2, label: 'Stage 2 — OCR failed, continuing without chip markings', pct: 40 }); }

  // Stage 3
  emit('progress', { stage: 3, label: 'Stage 3 — Full BOM analysis (this takes ~20s)', pct: 50 });
  const reqOrderQty2 = parseOrderQty(req.body?.orderQty);
  // Same safety net as the non-stream path: Stage 1 sees only the top photo, so a
  // radar board with an S32R/TEF81x marking can come back rf_microwave/general —
  // which drops automotive pricing, ASIL and AEC-Q grading. The chip markings win.
  if (stage1Result.domain !== 'automotive_adas' && looksAutomotiveSilicon(ocrResult.icMarkings)) {
    console.log(`[PCB/stream] Promoted domain -> automotive_adas from IC markings (Stage 1 said ${stage1Result.domain})`);
    stage1Result.domain = 'automotive_adas';
    stage1Result.conf = Math.max(stage1Result.conf, 0.9);
    if (streamAsilClassification.asilLevel === 'Unknown') {
      try { streamAsilClassification = await classifyASILLevel(anthropic, imageFiles, imageLabels, ocrResult.icMarkings.join(', ')); }
      catch { /* keep Unknown */ }
    }
  }
  const domain = stage1Result.domain;
  const specSystem = SPECIALIST_SYSTEM_PROMPTS[domain] ?? SPECIALIST_SYSTEM_PROMPTS['general'];
  const multiNote = multiImage ? `\n\nNOTE: ${imageFiles.length} photos (${imageLabels.slice(0, imageFiles.length).join(', ')}). Use ALL images together.` : '';
  let parsedBOM2: ParsedBOMLine[] = [];
  const bomFileUpload2 = files?.bomFile?.[0];
  if (bomFileUpload2 && !isBomImage(bomFileUpload2)) {
    try { parsedBOM2 = parseBOMFile(bomFileUpload2.buffer.toString('utf-8'), bomFileUpload2.originalname); } catch { /* ignore */ }
  }
  if (bomFileUpload2 && isBomImage(bomFileUpload2)) emit('progress', { stage: 2, label: 'Reading the BOM image', pct: 40 });
  const bomImage2 = await bomFromImageUpload(anthropic, bomFileUpload2, deepAnalysis, '/stream');
  if (bomImage2) parsedBOM2 = bomImage2.lines;
  const userPromptText2 = buildUserPrompt(ocrResult, stage1Result, domain, reqOrderQty2) + multiNote + (parsedBOM2.length > 0 ? buildParsedBOMContext(parsedBOM2) : '');

  let analysis: unknown;
  let stage3Raw = '';
  // ── Stage 3 attempt 1: full vision analysis ──────────────────────────────
  try {
    const msg = await stage3Message(anthropic, {
      model: extractionModel(deepAnalysis), max_tokens: EXTRACT_MAX_TOKENS, system: specSystem,
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
        { type: 'text', text: userPromptText2 },
      ]}],
    }, '/stream');
    if (msg.stop_reason === 'max_tokens') console.warn('[PCB/stream] Stage 3 hit the output-token limit — BOM likely truncated; will salvage/consolidate');
    stage3Raw = textOf(msg);
    console.log('[PCB/stream] Stage 3 stop=%s blocks=%s textLen=%d', msg.stop_reason, JSON.stringify(msg.content.map(b => b.type)), stage3Raw.length);
  } catch (err) {
    const raw = (err as Error).message ?? '';
    const tooLarge = /413|request_too_large|maximum size|too large/i.test(raw);
    emit('error', { message: tooLarge
      ? 'Images are too large for the AI service even after compression. Please retry (the uploader in the app resizes photos automatically), or attach a BOM file to reduce reliance on the photos.'
      : `Stage 3 AI service error: ${raw}` });
    res.end();
    return;
  }
  try {
    analysis = JSON.parse(extractJSON(stage3Raw));
  } catch (parseErr) {
    // ── Attempt 1b: salvage complete BOM lines from a truncated response ─────
    const salvaged = salvageAnalysisFromRaw(stage3Raw);
    if (salvaged) {
      console.warn(`[PCB/stream] Salvaged ${(salvaged.bom as unknown[]).length} BOM line(s) from a truncated/malformed Stage-3 response`);
      analysis = salvaged;
    } else {
      // ── Attempt 2: JSON repair (mirrors the non-streaming handler) ────────
      console.warn('[PCB/stream] Stage 3 JSON parse failed, attempting repair:', String(parseErr));
      console.warn('[PCB/stream] Raw (first 500):', stage3Raw.slice(0, 500));
      emit('progress', { stage: 3, label: 'Stage 3 — repairing AI response', pct: 60 });
      try {
        const repair = await anthropic.messages.create({
          model: extractionModel(deepAnalysis), max_tokens: EXTRACT_MAX_TOKENS,
          system: 'You are a JSON repair assistant. Return ONLY valid JSON — nothing else. Start with { and end with }.',
          messages: [{ role: 'user', content: buildRepairPrompt(stage3Raw) }],
        });
        const repairRaw = textOf(repair);
        try { analysis = JSON.parse(extractJSON(repairRaw)); }
        catch (repErr) {
          const salvaged2 = salvageAnalysisFromRaw(repairRaw);
          if (salvaged2) analysis = salvaged2; else throw repErr;
        }
      } catch (repairErr) {
        emit('error', { message: `Stage 3 could not produce valid JSON after repair: ${(repairErr as Error).message}. The response was likely truncated — run again, or attach a BOM file.` });
        res.end();
        return;
      }
    }
  }
  if (!analysis || typeof analysis !== 'object') {
    emit('error', { message: 'Stage 3 returned an empty analysis result.' });
    res.end();
    return;
  }
  // Same structural guarantee as the non-streaming route — the streaming path
  // is what the browser actually uses, and a sparse AI response (missing
  // technologyType/qualityGrade strings, or numerics) crashed the renderer
  // with "Cannot read properties of undefined (reading 'replace')".
  normalizePCBAnalysis(analysis as Record<string, unknown>);

  // An empty BOM is a FAILED analysis, not a result. Normalizing used to let
  // it render as silent success and — worse — get cached, so every re-run of
  // the same photos replayed the empty BOM. Retry once with an emphatic
  // instruction; if still empty, error out WITHOUT caching.
  if (bomIsEmpty(analysis)) {
    console.warn('[PCB/stream] Stage 3 returned an EMPTY BOM — retrying once with emphasis');
    emit('progress', { stage: 3, label: 'Stage 3 — empty BOM returned, retrying', pct: 65 });
    try {
      const retry = await stage3Message(anthropic, {
        model: extractionModel(deepAnalysis), max_tokens: EXTRACT_MAX_TOKENS, system: specSystem,
        messages: [{ role: 'user', content: [
          ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
          { type: 'text', text: userPromptText2 + EMPTY_BOM_RETRY_NOTE },
        ]}],
      }, '/stream');
      if (retry.stop_reason === 'max_tokens') console.warn('[PCB/stream] Empty-BOM retry hit the output-token limit — salvaging');
      const retryRaw = textOf(retry);
      let retryAnalysis: Record<string, unknown> | null;
      try { retryAnalysis = JSON.parse(extractJSON(retryRaw)) as Record<string, unknown>; }
      catch { retryAnalysis = salvageAnalysisFromRaw(retryRaw); }
      if (retryAnalysis) {
        normalizePCBAnalysis(retryAnalysis);
        if (!bomIsEmpty(retryAnalysis)) analysis = retryAnalysis;
      }
    } catch (retryErr) {
      console.warn('[PCB/stream] Empty-BOM retry failed:', (retryErr as Error).message);
    }
  }
  if (bomIsEmpty(analysis)) {
    emit('error', { message: 'The AI could not identify any components on this board (empty BOM), even after a retry. ' +
      'Add close-up photos with readable IC markings, or attach a BOM file. This result was NOT cached — Re-analyze will run fresh.' });
    res.end();
    return;
  }
  emit('stage3', { partName: (analysis as Record<string, unknown>).partName, confidence: (analysis as Record<string, unknown>).confidenceLevel });

  // Stage 3b — the stream route (the one the screen uses) never ran it.
  emit('progress', { stage: 3, label: 'Stage 3b — second look at unidentified chips', pct: 80 });
  await applyStage3b(anthropic, analysis as Record<string, unknown>, imageFiles, imageLabels, domain, '/stream');

  emit('progress', { stage: 4, label: 'Stage 4 — Cost breakdown & country comparison', pct: 85 });
  const s4 = await runStage4({
    analysis: analysis as Record<string, unknown>, domain, asilLevel: streamAsilClassification.asilLevel, ocrResult,
    asilRationale: streamAsilClassification.asilRationale, asilSafetyFunctions: streamAsilClassification.safetyFunctions,
    country: (req.body?.country as string | undefined) ?? 'cn',
    orderQty: parseOrderQty(req.body?.orderQty),
    parsedBOM: parsedBOM2, bomImageNotes: bomImage2?.notes, files, tag: '/stream', classificationFailed: stage1Result.failed === true,
    onProgress: label => emit('progress', { stage: 4, label, pct: 90 }),
  });
  normalizePCBAnalysis(analysis as Record<string, unknown>);

  emit('progress', { stage: 5, label: 'Complete', pct: 100 });
  const streamComplete = {
    analysis,
    ...stage4Payload(s4),
    stage1Classification: { domain: s4.domain, conf: stage1Result.conf, hints: stage1Result.hints, failed: stage1Result.failed === true, ...(s4.domain !== domain ? { classifierDomain: domain } : {}) },
    ocrExtraction: { icMarkings: ocrResult.icMarkings, connectors: ocrResult.connectors ?? [], extractionQuality: ocrResult.extractionQuality },
    fromCache: false,
  };
  // Store so an identical re-run replays this exact result — never a hollow, salvaged or half-costed one.
  if (!bomIsEmpty(analysis) && !s4.failed && !(analysis as Record<string, unknown>)._salvaged) setCached(streamCacheKey, streamComplete);
  emit('complete', streamComplete);
  res.end();
});

export default router;
