import { createHash } from 'crypto';
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
import { fetchLivePrices, fetchLivePricesWithAECQ, resolveNexarAccessToken, type LivePricingProvider, type LivePriceResult } from '../utils/pcb-live-pricing.js';
import { reconcileBomWithCatalogue, groundingCandidates } from '../utils/pcb-bom-grounding.js';
import { parseBOMFile, type ParsedBOMLine } from '../utils/pcb-bom-parser.js';

// ── Volume BOM price correction ────────────────────────────────────────────
// Pricing table is calibrated to 100K units. Multipliers scale cost up for
// lower order quantities (below 100K it gets more expensive, above it's cheaper).
const VOLUME_BOM_MULTIPLIERS: [number, number][] = [
  [50, 10.0], [100, 8.0], [250, 5.5], [500, 4.0], [1000, 3.0],
  [2500, 2.2], [5000, 1.7], [10000, 1.35], [25000, 1.15],
  [50000, 1.06], [100000, 1.00],
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

const HIGH_VALUE_COMP_TYPES = new Set(['ic_bga', 'ic_tqfp', 'power_module']);

interface BOMLineForBand {
  qty: number; unitPriceGBP: number; lineConf: number;
  ocrExtracted: boolean; componentType?: string; partNumber?: string;
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
    weightedConfSum += line.lineConf * line.qty;
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

// Apply volume correction and flag unconfirmed high-value ICs in the BOM array
function flagAndEnrichBOM(
  bom: Array<Record<string, unknown>>,
  volumeMultiplier: number,
): Array<Record<string, unknown>> {
  return bom.map(line => {
    const unitPrice = Number(line.unitPriceGBP ?? 0);
    const qty = Number(line.qty ?? 1);
    const adj = unitPrice * volumeMultiplier;
    const lineTotal = adj * qty;
    const isHighValue = HIGH_VALUE_COMP_TYPES.has(String(line.componentType ?? ''));
    const hasPN = String(line.partNumber ?? '').trim().length > 0;
    const isOCR = Boolean(line.ocrExtracted);
    return {
      ...line,
      unitPriceGBP: Math.round(adj * 10000) / 10000,
      lineTotalGBP: Math.round(lineTotal * 100) / 100,
      volumeAdjusted: volumeMultiplier !== 1.0,
      unconfirmedHighValue: isHighValue && !isOCR && !hasPN && lineTotal > 2.0,
    };
  });
}

// ── Image analysis cache (SHA-256 of image buffers, 4h TTL) ──────────────────
const _analysisCache = new Map<string, { ts: number; payload: unknown }>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
function buildCacheKey(buffers: Buffer[]): string {
  const h = createHash('sha256');
  for (const b of buffers) h.update(b);
  return h.digest('hex');
}
function getCached(key: string): unknown | null {
  const e = _analysisCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { _analysisCache.delete(key); return null; }
  return e.payload;
}
function setCached(key: string, payload: unknown): void {
  if (_analysisCache.size > 200) {
    const oldest = [..._analysisCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) _analysisCache.delete(oldest[0]);
  }
  _analysisCache.set(key, { ts: Date.now(), payload });
}

// ── Board sanity checks ────────────────────────────────────────────────────────
interface SanityWarning { code: string; message: string; severity: 'warn' | 'error' }
function runSanityChecks(
  boardSpec: Record<string, unknown>,
  assembly: Record<string, unknown>,
  bom: Array<Record<string, unknown>>,
  aiTotalBOM: number,
): SanityWarning[] {
  const warnings: SanityWarning[] = [];
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
): Promise<Map<string, { partNumber: string; unitPriceGBP: number; lineConf: number }>> {
  if (unconfirmedLines.length === 0) return new Map();
  const specialistSystem = SPECIALIST_SYSTEM_PROMPTS[domain] ?? SPECIALIST_SYSTEM_PROMPTS['general'];
  const lineDesc = unconfirmedLines.map((l, i) =>
    `Line ${i+1}: ${l.refDes ?? '?'} — ${l.description ?? ''} (${l.pkg ?? ''}) — current AI price £${Number(l.unitPriceGBP).toFixed(2)}`
  ).join('\n');
  const prompt = `SECOND-PASS IC IDENTIFICATION — ${unconfirmedLines.length} unconfirmed high-value component(s)

The initial analysis could not confirm part numbers for these components. Please inspect the PCB image(s) very carefully for markings on or near each component:

${lineDesc}

Look for chip top markings, silk screen labels, and any visible logos. Price each using the domain-appropriate pricing.
Return ONLY a JSON array (same order as the list above):
[{"refDes":"U1","identifiedPartNumber":"STM32F407","unitPriceGBP":3.20,"lineConf":0.85}]
If still unreadable, set identifiedPartNumber to "" and adjust lineConf downward.`;
  try {
    const msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-sonnet-4-6', max_tokens: 2048, system: specialistSystem,
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, imageFiles.length > 1),
        { type: 'text', text: prompt },
      ]}],
    });
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '[]';
    let arr: Array<{ refDes: string; identifiedPartNumber: string; unitPriceGBP: number; lineConf: number }> = [];
    try {
      const start = raw.indexOf('['), end = raw.lastIndexOf(']');
      if (start !== -1 && end > start) arr = JSON.parse(raw.slice(start, end + 1)) as typeof arr;
    } catch { /* ignore */ }
    const out = new Map<string, { partNumber: string; unitPriceGBP: number; lineConf: number }>();
    for (const r of arr) {
      if (r.refDes) out.set(String(r.refDes), {
        partNumber: r.identifiedPartNumber ?? '',
        unitPriceGBP: Number(r.unitPriceGBP) || 0,
        lineConf: Math.min(1, Math.max(0, Number(r.lineConf) || 0.6)),
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
function computeNPIBreakdown(bomTotal: number, fabMid: number, smtPlacements: number, orderQty: number): NPIBreakdown {
  const stencilCost = smtPlacements > 300 ? 220 : smtPlacements > 100 ? 160 : 120;
  const firstArticleCost = 280; // first-article inspection
  const toolingTotal = stencilCost + firstArticleCost;
  const prototypeSurcharge = 0.38; // fab and assembly premium for small runs
  const unitCostBase = bomTotal + fabMid;
  const unitCostProd = unitCostBase;
  const unitCostNPI = unitCostBase * (1 + prototypeSurcharge) + toolingTotal / 50;
  const setupPerUnit50 = toolingTotal / 50;
  return { stencilCost, firstArticleCost, toolingTotal, unitCostNPI: Math.round(unitCostNPI*100)/100, unitCostProd: Math.round(unitCostProd*100)/100, setupPerUnit50: Math.round(setupPerUnit50*100)/100 };
}

// ── Post-analysis automotive grade enforcement ────────────────────────────────
function enforceAutomotiveGrading(
  bom: Array<Record<string, unknown>>,
  domain: string,
): { bom: Array<Record<string, unknown>>; forcedCount: number } {
  if (domain !== 'automotive_adas') return { bom, forcedCount: 0 };
  let forcedCount = 0;
  const updated = bom.map(line => {
    if (line.automotive === true) return line;
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
  try {
    const msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-haiku-4-5-20251001', max_tokens: 512,
      system: 'You are an automotive functional safety engineer. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, imageFiles.length > 1),
        { type: 'text', text: prompt },
      ]}],
    });
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}';
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
    console.warn('[PCB] Stage 1b ASIL classification failed:', (err as Error).message);
  }
  return { asilLevel: 'Unknown', asilRationale: '', safetyFunctions: [] };
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
function computeAutomotiveNRE(asilLevel: ASILLevel, bomTotal: number): AutomotiveNRE {
  const tier = asilLevel === 'ASIL-D' ? 4 : asilLevel === 'ASIL-C' ? 3 : asilLevel === 'ASIL-B' ? 2 : asilLevel === 'ASIL-A' ? 1 : 0;
  if (tier === 0) {
    // QM / Unknown — minimal automotive paperwork
    const ppap = 1500; const fmea = 2500; const dvpr = 3000; const audit = 0;
    return { ppapCost: ppap, fmeaCost: fmea, dvprCost: dvpr, asilAuditCost: audit, totalNRE: ppap + fmea + dvpr + audit, asilLevel };
  }
  const ppapCost  = [0, 3000,  6000, 10000, 18000][tier];
  const fmeaCost  = [0, 5000, 10000, 18000, 32000][tier];
  const dvprCost  = [0, 8000, 16000, 28000, 50000][tier];
  const asilAudit = [0, 2500,  5000, 10000, 20000][tier];
  const bomScale  = Math.max(1, bomTotal / 50);  // scale slightly for complex boards
  const scale     = Math.min(2.0, bomScale);
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
        unitPrice,
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
): number {
  if (domain !== 'automotive_adas') return 0;
  const widthMm = Number(boardSpec.widthMm) || 100;
  const heightMm = Number(boardSpec.heightMm) || 80;
  const areaCm2 = (widthMm * heightMm) / 100;
  // Base coating cost: selective UV acrylic £0.08–0.15/cm², polyurethane £0.12–0.22/cm²
  // ASIL-D requires conformal + edge seal; ASIL-A/B selective is fine
  const ratePerCm2 = asilLevel === 'ASIL-D' || asilLevel === 'ASIL-C' ? 0.20 : 0.12;
  const coatingCost = areaCm2 * ratePerCm2;
  // Minimum batch setup £18, maximum per-board £280
  return Math.min(280, Math.max(18, Math.round(coatingCost * 100) / 100));
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
function computeAutomotiveAssemblyCost(
  assemblyData: Record<string, unknown>,
  asilLevel: ASILLevel,
  orderQty: number,
  countryAssemblyPerBoard: number,
): AutomotiveAssemblyCost {
  const smtPlacements = Number(assemblyData.smtPlacements) || 0;
  const bgaCount = Number(assemblyData.bgaCount) || 0;
  const thJoints = Number(assemblyData.throughHoleJoints) || 0;
  const manualJoints = Number(assemblyData.manualJoints) || 0;
  const baseAssemblyGBP = countryAssemblyPerBoard > 0
    ? countryAssemblyPerBoard
    : smtPlacements * 0.018 + thJoints * 0.025 + manualJoints * 0.045;
  const standardAssemblyGBP = baseAssemblyGBP;
  const iatfPremiumGBP = standardAssemblyGBP * 0.20;
  const axiCostGBP = bgaCount > 0 ? Math.min(15, 8 + bgaCount * 1.2) : 0;
  const serialisationGBP = 0.80;
  const aoiBase = Boolean(assemblyData.aoiRequired) ? 2.5 : 0;
  const ipcClass3GBP = aoiBase * 0.15;
  const boardsPerShift = Math.max(1, Math.min(200, orderQty));
  const burnInShifts = asilLevel === 'ASIL-D' ? 6 : asilLevel === 'ASIL-C' ? 4 : asilLevel === 'ASIL-B' ? 2 : 0;
  const burnInGBP = burnInShifts > 0 ? Math.round((180 * burnInShifts / boardsPerShift) * 100) / 100 : 0;
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
  const ipcClass3InspectionGBP = Math.min(45, Math.max(8, areaCm2 * 0.08));
  const couponTestingGBP = Math.min(35, Math.max(5, layers * 2.5));
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
function estimateMissingPassives(bom: Array<Record<string, unknown>>, smtPlacements: number): BOMCompletenessResult {
  const icTypes = new Set(['ic_bga', 'ic_tqfp', 'ic_qfp', 'ic_soic', 'ic_sot', 'power_module', 'ic_other']);
  const passiveTypes = new Set(['passive_0402', 'passive_0603', 'passive_0805', 'passive_other']);
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
  const missingPassives = Math.max(0, totalExpectedPassives - passiveCount);
  const estimatedMissingCostGBP = Math.round(missingPassives * 0.012 * 100) / 100;
  const completenessScore = smtPlacements > 0 ? Math.min(100, Math.round((identifiedTotal / smtPlacements) * 100)) : identifiedTotal > 0 ? 75 : 0;
  const decouplingMissing = Math.max(0, expectedDecoupling - passiveCount);
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
  const annualProgramVolume = orderQty * 4;
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
  type Block = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'text'; text: string };
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
  const MAX_TOTAL_BASE64_BYTES = 24 * 1024 * 1024; // ~24 MB of base64, leaving headroom under 32 MB
  let usedBytes = 0;
  let dropped = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const base64 = f.buffer.toString('base64');
    if (usedBytes + base64.length > MAX_TOTAL_BASE64_BYTES && out.some(b => b.type === 'image')) {
      dropped++;
      continue; // keep at least the first image; skip further ones that would blow the budget
    }
    usedBytes += base64.length;
    const mtype = f.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
    if (includeLabels) out.push({ type: 'text', text: `**${labels[i] ?? `Image ${i + 1}`}:**` });
    out.push({ type: 'image', source: { type: 'base64', media_type: mtype, data: base64 } });
  }
  if (dropped > 0) {
    console.warn(`[PCB] Image payload over budget — included ${files.length - dropped}/${files.length} image(s), dropped ${dropped} to stay under the API request limit. Client should downscale before upload.`);
  }
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
  automotive_adas: 'You are a senior Tier-1 automotive PCB cost engineer with 20+ years in ASIL-rated PCBA design. MANDATORY PRICING RULES — NO EXCEPTIONS: (1) Price EVERY component at AEC-Q qualified automotive grade — ICs: 3–8× consumer, passives/MLCCs: 3–6×, crystals/oscillators: 3×. (2) Set automotive=true on ALL components. (3) Sealed IP67 automotive connectors (Amphenol, TE AMP, Molex MX150, Kostal): £3–35 each. FAKRA SMB £4–18, HSD £5–22, MATEnet £6–25. (4) AEC-Q200 MLCC only — X7R/C0G grade: 0402 resistors £0.003–0.012, 0402 caps £0.008–0.025, 0603 caps £0.015–0.06. (5) KNOWN AUTOMOTIVE IC PRICES (100K volume): AURIX TC2xx £18–55, TC3xx £35–90, TC39x/TC4xx £65–130; NXP S32K1xx £4.50–15, S32K3xx £12–45, S32G2/G3 £40–90; TI TDA4VM £85–220, TDA4AL £120–280; NXP SJA1105 £8–22, SJA1110 £15–40; TJA1101/1103 100BASE-T1 PHY £3–9; TJA1044/1042 CAN xcvr £0.80–2.80; NXP FS65/FS85 SBC £2.50–7; Infineon TLF35584 safety PMIC £3.50–9; Renesas RH850/V4H £18–80; NXP MPC5748G £22–65. Return ONLY valid JSON.',
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
// Known automotive IC price ranges (100K volume, AEC-Q qualified)
const IC_PRICE_HINTS: Array<{ test: (m: string) => boolean; label: string; price: string }> = [
  // ── Automotive MCUs ────────────────────────────────────────────────────────
  { test: m => /AURIX|TC39[0-9]|TC38[0-9]|TC37[0-9]/i.test(m), label: 'Infineon AURIX TC3xx/TC4xx (ASIL-D lockstep)', price: '£35–130' },
  { test: m => /TC2[6-9][0-9]|TC26|TC27|TC29/i.test(m), label: 'Infineon AURIX TC2xx (ASIL-D)', price: '£18–55' },
  { test: m => /S32K3[0-9]{2}|S32K3/i.test(m), label: 'NXP S32K3xx automotive MCU (ASIL-D)', price: '£12–45' },
  { test: m => /S32K1[0-9]{2}|S32K14|S32K11/i.test(m), label: 'NXP S32K1xx automotive MCU (ASIL-B)', price: '£4.50–15' },
  { test: m => /S32G[23]/i.test(m), label: 'NXP S32G2/G3 network SoC (ASIL-B)', price: '£40–90' },
  { test: m => /MPC5748|MPC5746|MPC574/i.test(m), label: 'NXP MPC574x automotive MCU', price: '£22–65' },
  { test: m => /SPC584|SPC582|SPC560/i.test(m), label: 'STM SPC5xxx/SPC58x automotive MCU', price: '£8–40' },
  { test: m => /RH850|R7F70|R7F01/i.test(m), label: 'Renesas RH850 automotive MCU', price: '£18–80' },
  { test: m => /V4H|R8A779|R8A779G/i.test(m), label: 'Renesas R-Car V4H ADAS SoC', price: '£80–200' },
  { test: m => /STM32[A-Z]|STM32F|STM32H|STM32L/i.test(m), label: 'STM32 microcontroller', price: '£1.00–6' },
  { test: m => /SAMC2|SAMD5|SAME5|SAME7/i.test(m), label: 'Microchip SAM automotive MCU', price: '£3–12' },
  // ── ADAS & Vision SoCs ────────────────────────────────────────────────────
  { test: m => /TDA4VM|TDA4AL|TDA4VH/i.test(m), label: 'TI TDA4VM/AL ADAS SoC', price: '£85–280' },
  { test: m => /TDA2[PEK]|TDA2S/i.test(m), label: 'TI TDA2x ADAS SoC (older gen)', price: '£45–120' },
  { test: m => /EYEQ[3-6]|MQ[2-6]0[0-9]/i.test(m), label: 'Mobileye EyeQ ADAS processor', price: '£35–180' },
  { test: m => /IMX390|IMX623|IMX728/i.test(m), label: 'Sony automotive image sensor', price: '£8–35' },
  { test: m => /OV9284|OV2775|OV9782/i.test(m), label: 'OmniVision automotive image sensor', price: '£3–18' },
  // ── CAN / LIN / Ethernet Transceivers ─────────────────────────────────────
  { test: m => /TJA110[0-9]|TJA1102|TJA1103/i.test(m), label: 'NXP TJA110x 100BASE-T1 automotive Ethernet PHY', price: '£3–9' },
  { test: m => /TJA104[0-9]|TJA1042|TJA1044/i.test(m), label: 'NXP TJA104x CAN/CAN-FD transceiver (automotive)', price: '£0.80–2.80' },
  { test: m => /TJA110[6-9]|TJA1107/i.test(m), label: 'NXP TJA110x automotive LIN transceiver', price: '£0.45–1.60' },
  { test: m => /SJA1105|SJA1110/i.test(m), label: 'NXP SJA110x 5-port automotive Ethernet switch', price: '£8–40' },
  { test: m => /DP83TC812|DP83822|DP83867/i.test(m), label: 'TI DP83 automotive Ethernet PHY', price: '£2.50–8' },
  { test: m => /BCM8906|BCM8957|BCM89881/i.test(m), label: 'Broadcom automotive 100BASE-T1 PHY', price: '£4–15' },
  { test: m => /TCAN|SN65HVD|ISO1042|ISOW/i.test(m), label: 'TI automotive CAN/isolated transceiver', price: '£0.80–4.50' },
  // ── Safety PMICs & System Basis Chips ─────────────────────────────────────
  { test: m => /TLF35584|TLF35577/i.test(m), label: 'Infineon TLF3558x automotive safety PMIC (ASIL-D)', price: '£3.50–9' },
  { test: m => /FS65|FS85|FS6500/i.test(m), label: 'NXP FS65/FS85 System Basis Chip (safety SBC)', price: '£2.50–7' },
  { test: m => /UJA117[0-9]|UJA1167/i.test(m), label: 'NXP UJA117x Mini SBC', price: '£1.80–5' },
  { test: m => /BD9V100|BD9S400|ROHM/i.test(m), label: 'Rohm BD automotive PMIC', price: '£2–8' },
  { test: m => /RAA271|RAA272|ISL78/i.test(m), label: 'Renesas RAA/ISL automotive multi-rail PMIC', price: '£4–14' },
  { test: m => /TPS929|TPS928|TPS9264/i.test(m), label: 'TI TPS92x automotive LED driver', price: '£1.50–6' },
  { test: m => /TLE926|TLE4471|TLE7|TLS/i.test(m), label: 'Infineon TLE/TLS automotive voltage reg / SBC', price: '£0.80–5' },
  { test: m => /NCV7717|NCV7805|NCV8704/i.test(m), label: 'ON Semi NCV automotive LDO/power IC', price: '£0.60–3.50' },
  // ── Gate Drivers, FETs, Power ──────────────────────────────────────────────
  { test: m => /UCC5320|UCC5390|UCC2153/i.test(m), label: 'TI UCC isolated automotive gate driver', price: '£1.80–5' },
  { test: m => /ISO784|ISO774|DRV840|DRV862/i.test(m), label: 'TI ISO/DRV automotive driver', price: '£2–8' },
  { test: m => /BTS700|BTS600|BTS500/i.test(m), label: 'Infineon BTS automotive smart power switch', price: '£1.20–8' },
  { test: m => /AUIPS|IPD|IPS200/i.test(m), label: 'Infineon AUIPS automotive power switch', price: '£1.50–6' },
  // ── Radar & RF (Automotive) ────────────────────────────────────────────────
  { test: m => /BGT60|BGT24|BGT12/i.test(m), label: 'Infineon BGT60/24 77GHz/24GHz radar frontend', price: '£18–80' },
  { test: m => /TEF810|TEF81/i.test(m), label: 'NXP TEF810x 77GHz radar transceiver', price: '£25–90' },
  { test: m => /AWR1843|AWR1642|AWR1443/i.test(m), label: 'TI AWR 77GHz ADAS radar SoC', price: '£20–75' },
  // ── Memory (Automotive) ────────────────────────────────────────────────────
  { test: m => /IS42S|IS43T|IS66W/i.test(m), label: 'ISSI automotive SDRAM/SRAM', price: '£1.50–8' },
  { test: m => /K4A|K4B|K9F/i.test(m), label: 'Samsung automotive LPDDR/NAND (AEC-Q grade)', price: '£3–20' },
  { test: m => /MT41K|MT47H|MT25Q/i.test(m), label: 'Micron automotive DDR/Flash', price: '£2.50–15' },
  { test: m => /THGBM|THGLF/i.test(m), label: 'Kioxia automotive eMMC/NAND', price: '£3–18' },
  // ── General (non-automotive, fallback by brand) ────────────────────────────
  { test: m => /NRF52|NRF5340|NRF9/i.test(m), label: 'Nordic nRF MCU/SoC', price: '£0.70–4.50' },
  { test: m => /ESP32|ESP8266|ESP32-S/i.test(m), label: 'Espressif WiFi/BT SoC', price: '£0.50–2.20' },
  { test: m => /LAN9|LAN8|KSZ89|KSZ80/i.test(m), label: 'Microchip LAN/KSZ Ethernet IC', price: '£0.70–5' },
  { test: m => /MAX[0-9]{4}|MAX3|MAX4/i.test(m), label: 'Maxim/Analog interface IC', price: '£0.30–4.50' },
  { test: m => /TLV3|TLV6|TLV7/i.test(m), label: 'TI TLV comparator/op-amp', price: '£0.12–1.80' },
  { test: m => /LM317|LM358|LM741|LM324/i.test(m), label: 'TI/Fairchild classic linear IC', price: '£0.08–0.80' },
];

function buildICPriceHints(markings: string[], domain: string): string {
  const automotiveNote = domain === 'automotive_adas'
    ? 'NOTE: This is an automotive board — ALL prices below are AEC-Q automotive grade. Apply automotive=true to every component.\n'
    : '';
  const lines = markings.map(marking => {
    const m = marking.toUpperCase();
    const hit = IC_PRICE_HINTS.find(h => h.test(m));
    if (hit) return `${marking} — ${hit.label} — ${hit.price} at 100K volume${domain === 'automotive_adas' ? ' (AEC-Q, automotive=true)' : ''}`;
    return `${marking} — use pricing table above`;
  });
  return automotiveNote + lines.join('\n');
}

// ── Stage 3: Build user prompt for specialist analysis ─────────────────────
interface Stage1Result { domain: string; conf: number; hints: string[] }
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
- unitPriceGBP: use the COMPONENT PRICING REFERENCE above as hard anchors (calibrated to 100K unit volume); default to the LOWER HALF of each range for standard/generic components
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

  // Check cache — keyed by SHA-256 of all uploaded images + body params
  const cacheKey = buildCacheKey([
    ...imageFiles.map(f => f.buffer),
    Buffer.from(JSON.stringify({ country: req.body?.country, orderQty: req.body?.orderQty })),
  ]);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[PCB] Cache HIT: ${cacheKey.slice(0,12)}`);
    res.json(cached);
    return;
  }

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
    const s1Msg = await anthropic.messages.create({ temperature: 0,
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
    const s2Msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-haiku-4-5',
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
  const reqOrderQty = parseInt(req.body?.orderQty as string ?? '100', 10) || 100;
  const userPromptText = buildUserPrompt(ocrResult, stage1Result, domain, reqOrderQty) + multiImageNote +
    (parsedBOM.length > 0 ? buildParsedBOMContext(parsedBOM) : '');

  let analysis: unknown;
  let lastRaw = '';
  let lastError = '';

  try {
    // ── Attempt 1: Full vision analysis (all images) ─────────────────────
    const msg1 = await anthropic.messages.create({ temperature: 0,
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
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
      const msg2 = await anthropic.messages.create({ temperature: 0,
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
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

        const msg3 = await anthropic.messages.create({ temperature: 0,
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

  // ── Stage 3b: Focused refinement of unconfirmed high-value ICs ────────────
  {
    const a3 = analysis as Record<string, unknown>;
    const bom3 = Array.isArray(a3?.bom) ? (a3.bom as Array<Record<string, unknown>>) : [];
    const unconfirmedLines = bom3.filter(l =>
      HIGH_VALUE_COMP_TYPES.has(String(l.componentType ?? '')) &&
      !Boolean(l.ocrExtracted) &&
      !String(l.partNumber ?? '').trim() &&
      Number(l.qty ?? 1) * Number(l.unitPriceGBP ?? 0) > 2.0
    );
    if (unconfirmedLines.length > 0 && unconfirmedLines.length <= 8) {
      console.log(`[PCB] Stage 3b: refining ${unconfirmedLines.length} unconfirmed high-value IC(s)...`);
      const refinements = await refineUnconfirmedICs(anthropic, imageFiles, imageLabels, domain, unconfirmedLines);
      if (refinements.size > 0) {
        a3.bom = bom3.map(line => {
          const ref = String(line.refDes ?? '');
          const r = refinements.get(ref);
          if (!r) return line;
          return {
            ...line,
            partNumber: r.partNumber || line.partNumber,
            unitPriceGBP: r.unitPriceGBP > 0 ? r.unitPriceGBP : line.unitPriceGBP,
            lineConf: r.lineConf,
            ocrExtracted: r.partNumber.length > 0 ? true : line.ocrExtracted,
            unconfirmedHighValue: r.partNumber.length === 0,
          };
        });
        console.log(`[PCB] Stage 3b: applied ${refinements.size} refinement(s)`);
      }
    }
  }

  // ── Stage 4: Volume correction + confidence band + country costs ──────────
  const selectedCountry = (req.body?.country as string | undefined) ?? 'cn';
  const orderQty = parseInt(req.body?.orderQty as string ?? '100', 10) || 100;

  let countryComparison: ReturnType<typeof computeAllCountryCosts> = [];
  let selectedCountryBreakdown: ReturnType<typeof computePCBCountryCost> | null = null;
  let volumeCurves: Record<string, ReturnType<typeof computeVolumeCurve>> = {};
  let complexityScore: ReturnType<typeof computeComplexityScore> | null = null;
  let confidenceBand: PCBConfidenceBand | null = null;
  let sanityWarnings: SanityWarning[] = [];
  let npiBreakdown: NPIBreakdown | null = null;
  let livePriceHits = 0;
  let automotiveNRE: AutomotiveNRE | null = null;
  let automotiveGradeEnforcedCount = 0;
  let singleSourceWarnings: SingleSourceWarning[] = [];
  let conformalCoatingCost = 0;
  let automotiveAssemblyCost: AutomotiveAssemblyCost | null = null;
  let automotiveFabAdjustment: AutomotiveFabAdjustment | null = null;
  let bomCompleteness: BOMCompletenessResult | null = null;
  let programPricing: ProgramPricingResult | null = null;
  const volumeMultiplier = getVolumeMultiplier(orderQty);

  try {
    const a = analysis as Record<string, unknown>;
    const boardSpec = a?.boardSpec as Record<string, unknown> ?? {};
    const assemblyData = a?.assembly as Record<string, unknown> ?? {};
    const costEst = a?.costEstimates as Record<string, unknown> ?? {};
    const pcbFabGBP = costEst?.pcbFabGBP as { min?: number; mid?: number; max?: number } | undefined;
    const fabCostMid = Number(pcbFabGBP?.mid) || 0;

    // Apply volume correction to BOM, flag unconfirmed high-value ICs
    const rawBOM = Array.isArray(a?.bom) ? (a.bom as Array<Record<string, unknown>>) : [];
    let enrichedBOM = flagAndEnrichBOM(rawBOM, volumeMultiplier);

    // Automotive: enforce AEC-Q grading on any lines the AI priced at consumer grade
    if (domain === 'automotive_adas') {
      const gradeResult = enforceAutomotiveGrading(enrichedBOM, domain);
      enrichedBOM = gradeResult.bom;
      automotiveGradeEnforcedCount = gradeResult.forcedCount;
      if (automotiveGradeEnforcedCount > 0) {
        console.log(`[PCB] Automotive grade enforcement: ${automotiveGradeEnforcedCount} component(s) repriced to AEC-Q`);
      }
      // Single-source risk flags
      singleSourceWarnings = flagSingleSourceRisks(enrichedBOM);
      // Automotive NRE (PPAP/FMEA/DVP&R)
      const bomTotalForNRE = enrichedBOM.reduce((s, l) => s + Number(l.lineTotalGBP ?? 0), 0);
      automotiveNRE = computeAutomotiveNRE(asilClassification.asilLevel, bomTotalForNRE);
      // Conformal coating
      conformalCoatingCost = computeConformalCoatingCost(boardSpec, domain, asilClassification.asilLevel);
      // Automotive assembly cost model
      const countryAssemblyPerBoard = selectedCountryBreakdown?.assemblyPerBoard ?? 0;
      automotiveAssemblyCost = computeAutomotiveAssemblyCost(assemblyData, asilClassification.asilLevel, orderQty, countryAssemblyPerBoard);
      // Automotive fab adjustment
      automotiveFabAdjustment = computeAutomotiveFabAdjustment(boardSpec, fabCostMid, domain);
    }

    a.bom = enrichedBOM;

    // Re-sum BOM from volume-adjusted prices
    const correctedBOMTotal = enrichedBOM.reduce((sum, line) => sum + Number(line.lineTotalGBP ?? 0), 0);
    if (a.costEstimates && typeof a.costEstimates === 'object') {
      (a.costEstimates as Record<string, unknown>).totalBOMCostGBP = Math.round(correctedBOMTotal * 100) / 100;
    }

    // BOM completeness (all domains)
    bomCompleteness = estimateMissingPassives(enrichedBOM, Number(assemblyData.smtPlacements) || 0);
    // Program pricing (automotive only, or show discount potential)
    programPricing = computeProgramPricing(correctedBOMTotal, orderQty, domain);

    // Compute confidence band from enriched BOM + fab cost
    confidenceBand = computeConfidenceBand(
      enrichedBOM as unknown as BOMLineForBand[],
      fabCostMid,
      ocrResult.extractionQuality,
      volumeMultiplier,
    );

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
      conformalCoatAreaCm2: conformalCoatingCost > 0 ? (Number(boardSpec.widthMm || 100) * Number(boardSpec.heightMm || 80) / 100) : 0,
      totalBOMCostGBP:      correctedBOMTotal || Number(costEst?.totalBOMCostGBP) || pcbFabGBP?.mid || 0,
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

    complexityScore = computeComplexityScore(boardSpec, assemblyData);

    // Sanity checks on AI output
    const aiStatedBOMTotal = Number((costEst as Record<string, unknown>).totalBOMCostGBP ?? 0);
    sanityWarnings = runSanityChecks(boardSpec, assemblyData, enrichedBOM, aiStatedBOMTotal);

    // NPI vs production breakdown
    npiBreakdown = computeNPIBreakdown(correctedBOMTotal, fabCostMid, Number(assemblyData.smtPlacements) || 0, orderQty);

    // Rec #1: catalogue grounding — replace AI-guessed prices with real
    // distributor prices for any part with a plausible MPN (not just OCR-confirmed),
    // and flag every line's verification state for human review (Rec #3).
    const candidatePNs = groundingCandidates(enrichedBOM, 20);
    let livePrices: LivePriceResult[] = [];
    if (candidatePNs.length > 0) {
      const octoKey = await resolveNexarAccessToken();   // OAuth2 client-credentials (audit fix)
      const rsKey = process.env.RS_API_KEY ?? '';
      const liveProvider: LivePricingProvider | null = octoKey ? 'octopart' : rsKey ? 'rs' : null;
      if (liveProvider) {
        try {
          livePrices = await fetchLivePricesWithAECQ(candidatePNs, liveProvider, liveProvider === 'octopart' ? octoKey : rsKey, orderQty, domain === 'automotive_adas');
          console.log(`[PCB] Catalogue grounding: ${livePrices.length}/${candidatePNs.length} parts priced via ${liveProvider}`);
        } catch (lpErr) {
          console.warn('[PCB] Live pricing fetch failed (non-fatal):', (lpErr as Error).message);
        }
      }
    }
    // Always reconcile — with catalogue hits when available, else confidence-only.
    // Works offline (no key) so the human-in-the-loop review is always populated.
    const reconciled = reconcileBomWithCatalogue(a.bom as Array<Record<string, unknown>>, livePrices);
    a.bom = reconciled.bom;
    livePriceHits = reconciled.matched;
    (a as Record<string, unknown>).needsVerificationCount = reconciled.needsVerification;
    (a as Record<string, unknown>).catalogueVerifiedCount = reconciled.matched;

    console.log(`[PCB] Stage 4: qty=${orderQty} volMult=${volumeMultiplier} BOM=${correctedBOMTotal.toFixed(2)} band=${confidenceBand.overallLabel} sanity=${sanityWarnings.length} warnings${domain === 'automotive_adas' ? ` asil=${asilClassification.asilLevel} forced=${automotiveGradeEnforcedCount}` : ''}`);
  } catch (err) {
    console.warn('[PCB] Stage 4 failed:', (err as Error).message);
  }

  const finalPayload = {
    success: true,
    analysis,
    selectedCountry,
    selectedCountryBreakdown,
    countryComparison,
    volumeCurves,
    complexityScore,
    confidenceBand,
    volumeMultiplier,
    sanityWarnings,
    npiBreakdown,
    livePriceHits,
    catalogueVerifiedCount: (analysis as Record<string, unknown>).catalogueVerifiedCount ?? 0,
    needsVerificationCount: (analysis as Record<string, unknown>).needsVerificationCount ?? 0,
    asilLevel: asilClassification.asilLevel,
    asilRationale: asilClassification.asilRationale,
    asilSafetyFunctions: asilClassification.safetyFunctions,
    automotiveNRE,
    automotiveGradeEnforcedCount,
    singleSourceWarnings,
    conformalCoatingCost,
    automotiveAssemblyCost,
    automotiveFabAdjustment,
    bomCompleteness,
    programPricing,
    fromCache: false,
  };
  setCached(cacheKey, { ...finalPayload, fromCache: true });
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

    const msg1 = await anthropic.messages.create({ temperature: 0,
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
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
      const msg2 = await anthropic.messages.create({ temperature: 0,
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
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

        const msg3 = await anthropic.messages.create({ temperature: 0,
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

  // ── Stage 4: Volume correction + confidence band + country costs ──────────
  const selectedCountry = (req.body?.country as string | undefined) ?? 'cn';
  const orderQty = parseInt(req.body?.orderQty as string ?? '100', 10) || 100;

  let countryComparison: ReturnType<typeof computeAllCountryCosts> = [];
  let selectedCountryBreakdown: ReturnType<typeof computePCBCountryCost> | null = null;
  let volumeCurves: Record<string, ReturnType<typeof computeVolumeCurve>> = {};
  let complexityScore: ReturnType<typeof computeComplexityScore> | null = null;
  let confidenceBand: PCBConfidenceBand | null = null;
  let reanalAutomotiveNRE: AutomotiveNRE | null = null;
  let reanalAutomotiveGradeEnforcedCount = 0;
  let reanalSingleSourceWarnings: SingleSourceWarning[] = [];
  let reanalConformalCoatingCost = 0;
  let reanalAutomotiveAssemblyCost: AutomotiveAssemblyCost | null = null;
  let reanalAutomotiveFabAdjustment: AutomotiveFabAdjustment | null = null;
  let reanalBomCompleteness: BOMCompletenessResult | null = null;
  let reanalProgramPricing: ProgramPricingResult | null = null;
  const volumeMultiplier = getVolumeMultiplier(orderQty);

  try {
    const a = analysis as Record<string, unknown>;
    const boardSpec = a?.boardSpec as Record<string, unknown> ?? {};
    const assemblyData = a?.assembly as Record<string, unknown> ?? {};
    const costEst = a?.costEstimates as Record<string, unknown> ?? {};
    const pcbFabGBP = costEst?.pcbFabGBP as { min?: number; mid?: number; max?: number } | undefined;
    const fabCostMid = Number(pcbFabGBP?.mid) || 0;

    const rawBOM = Array.isArray(a?.bom) ? (a.bom as Array<Record<string, unknown>>) : [];
    let enrichedBOM = flagAndEnrichBOM(rawBOM, volumeMultiplier);

    if (domain === 'automotive_adas') {
      const gradeResult = enforceAutomotiveGrading(enrichedBOM, domain);
      enrichedBOM = gradeResult.bom;
      reanalAutomotiveGradeEnforcedCount = gradeResult.forcedCount;
      reanalSingleSourceWarnings = flagSingleSourceRisks(enrichedBOM);
      const bomTotalForNRE = enrichedBOM.reduce((s, l) => s + Number(l.lineTotalGBP ?? 0), 0);
      reanalAutomotiveNRE = computeAutomotiveNRE('Unknown', bomTotalForNRE);
      reanalConformalCoatingCost = computeConformalCoatingCost(boardSpec, domain, 'Unknown');
      // Automotive assembly cost model
      const reanalCountryAssemblyPerBoard = selectedCountryBreakdown?.assemblyPerBoard ?? 0;
      reanalAutomotiveAssemblyCost = computeAutomotiveAssemblyCost(assemblyData, 'Unknown' as ASILLevel, orderQty, reanalCountryAssemblyPerBoard);
      // Automotive fab adjustment
      reanalAutomotiveFabAdjustment = computeAutomotiveFabAdjustment(boardSpec, fabCostMid, domain);
    }

    a.bom = enrichedBOM;

    const correctedBOMTotal = enrichedBOM.reduce((sum, line) => sum + Number(line.lineTotalGBP ?? 0), 0);
    if (a.costEstimates && typeof a.costEstimates === 'object') {
      (a.costEstimates as Record<string, unknown>).totalBOMCostGBP = Math.round(correctedBOMTotal * 100) / 100;
    }

    // BOM completeness (all domains)
    reanalBomCompleteness = estimateMissingPassives(enrichedBOM, Number(assemblyData.smtPlacements) || 0);
    // Program pricing (automotive only, or show discount potential)
    reanalProgramPricing = computeProgramPricing(correctedBOMTotal, orderQty, domain);

    confidenceBand = computeConfidenceBand(
      enrichedBOM as unknown as BOMLineForBand[],
      fabCostMid,
      'high', // reanalyze always uses high OCR quality (user corrections applied)
      volumeMultiplier,
    );

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
      conformalCoatAreaCm2: reanalConformalCoatingCost > 0 ? (Number(boardSpec.widthMm || 100) * Number(boardSpec.heightMm || 80) / 100) : 0,
      totalBOMCostGBP:      correctedBOMTotal || Number(costEst?.totalBOMCostGBP) || pcbFabGBP?.mid || 0,
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

    console.log(`[PCB/reanalyze] Stage 4: qty=${orderQty} volMult=${volumeMultiplier} BOM=${correctedBOMTotal.toFixed(2)} band=${confidenceBand.overallLabel}`);
  } catch (err) {
    console.warn('[PCB/reanalyze] Stage 4 failed:', (err as Error).message);
  }

  res.json({
    success: true,
    analysis,
    selectedCountry,
    selectedCountryBreakdown,
    countryComparison,
    volumeCurves,
    complexityScore,
    confidenceBand,
    volumeMultiplier,
    automotiveNRE: reanalAutomotiveNRE,
    automotiveGradeEnforcedCount: reanalAutomotiveGradeEnforcedCount,
    singleSourceWarnings: reanalSingleSourceWarnings,
    conformalCoatingCost: reanalConformalCoatingCost,
    automotiveAssemblyCost: reanalAutomotiveAssemblyCost,
    automotiveFabAdjustment: reanalAutomotiveFabAdjustment,
    bomCompleteness: reanalBomCompleteness,
    programPricing: reanalProgramPricing,
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

// POST /api/pcb/analyze-image-stream — SSE streaming variant of analyze-image
// Emits progress events after each stage so the UI can show live stage updates.
router.post('/analyze-image-stream', upload.fields([
  { name: 'pcbImages', maxCount: 5 },
  { name: 'bomFile', maxCount: 1 },
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

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) { emit('error', { message: 'ANTHROPIC_API_KEY not configured' }); res.end(); return; }

  let imageLabels: string[] = DEFAULT_IMAGE_LABELS;
  try { const raw = req.body?.pcbImageLabels as string; if (raw) imageLabels = JSON.parse(raw) as string[]; } catch { /* use defaults */ }
  const multiImage = imageFiles.length > 1;
  const mediaType = primaryImage.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
  const base64Data = primaryImage.buffer.toString('base64');
  const anthropic = new Anthropic({ apiKey });

  emit('progress', { stage: 0, label: 'Starting analysis…', pct: 5 });

  // Stage 1
  let stage1Result: Stage1Result = { domain: 'general', conf: 0.5, hints: [] };
  try {
    emit('progress', { stage: 1, label: 'Stage 1 — Board domain classification', pct: 15 });
    const s1Msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-haiku-4-5', max_tokens: 512,
      system: 'You are a PCB classification expert. Return ONLY JSON.',
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        { type: 'text', text: stage1Prompt() },
      ]}],
    });
    const s1Raw = s1Msg.content[0]?.type === 'text' ? s1Msg.content[0].text : '';
    const s1P = JSON.parse(extractJSON(s1Raw)) as Stage1Result;
    stage1Result = { domain: s1P.domain ?? 'general', conf: s1P.conf ?? 0.5, hints: s1P.hints ?? [] };
    emit('stage1', { domain: stage1Result.domain, conf: stage1Result.conf, hints: stage1Result.hints });
  } catch { emit('progress', { stage: 1, label: 'Stage 1 — using defaults', pct: 20 }); }

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
    const s2Msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-haiku-4-5', max_tokens: 4096,
      system: 'You are an expert at reading PCB text. Return ONLY JSON.',
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
        { type: 'text', text: stage2Prompt + s2Note },
      ]}],
    });
    const s2Raw = s2Msg.content[0]?.type === 'text' ? s2Msg.content[0].text : '';
    const s2P = JSON.parse(extractJSON(s2Raw)) as OCRResult;
    ocrResult = { icMarkings: s2P.icMarkings ?? [], refDesGroups: s2P.refDesGroups ?? [], connectors: s2P.connectors ?? [], boardText: s2P.boardText ?? [], extractionQuality: s2P.extractionQuality ?? 'low' };
    emit('stage2', { icMarkings: ocrResult.icMarkings, extractionQuality: ocrResult.extractionQuality });
  } catch { emit('progress', { stage: 2, label: 'Stage 2 — OCR skipped', pct: 40 }); }

  // Stage 3
  emit('progress', { stage: 3, label: 'Stage 3 — Full BOM analysis (this takes ~20s)', pct: 50 });
  const reqOrderQty2 = parseInt(req.body?.orderQty as string ?? '100', 10) || 100;
  const domain = stage1Result.domain;
  const specSystem = SPECIALIST_SYSTEM_PROMPTS[domain] ?? SPECIALIST_SYSTEM_PROMPTS['general'];
  const multiNote = multiImage ? `\n\nNOTE: ${imageFiles.length} photos (${imageLabels.slice(0, imageFiles.length).join(', ')}). Use ALL images together.` : '';
  let parsedBOM2: ParsedBOMLine[] = [];
  const bomFileUpload2 = files?.bomFile?.[0];
  if (bomFileUpload2) {
    try { parsedBOM2 = parseBOMFile(bomFileUpload2.buffer.toString('utf-8'), bomFileUpload2.originalname); } catch { /* ignore */ }
  }
  const userPromptText2 = buildUserPrompt(ocrResult, stage1Result, domain, reqOrderQty2) + multiNote + (parsedBOM2.length > 0 ? buildParsedBOMContext(parsedBOM2) : '');

  let analysis: unknown;
  let stage3Raw = '';
  // ── Stage 3 attempt 1: full vision analysis ──────────────────────────────
  try {
    const msg = await anthropic.messages.create({ temperature: 0,
      model: 'claude-sonnet-4-6', max_tokens: 16384, system: specSystem,
      messages: [{ role: 'user', content: [
        ...buildImageContentBlocks(imageFiles, imageLabels, multiImage),
        { type: 'text', text: userPromptText2 },
      ]}],
    });
    stage3Raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  } catch (err) {
    const raw = (err as Error).message ?? '';
    const tooLarge = /413|request_too_large|maximum size|too large/i.test(raw);
    emit('error', { message: tooLarge
      ? 'Images are too large for the AI service even after compression. Please retry with fewer images (2–3), or attach a BOM file to reduce reliance on the photos.'
      : `Stage 3 AI service error: ${raw}` });
    res.end();
    return;
  }
  try {
    analysis = JSON.parse(extractJSON(stage3Raw));
  } catch (parseErr) {
    // ── Attempt 2: JSON repair (mirrors the non-streaming handler) ──────────
    console.warn('[PCB/stream] Stage 3 JSON parse failed, attempting repair:', String(parseErr));
    console.warn('[PCB/stream] Raw (first 500):', stage3Raw.slice(0, 500));
    emit('progress', { stage: 3, label: 'Stage 3 — repairing AI response', pct: 60 });
    try {
      const repair = await anthropic.messages.create({ temperature: 0,
        model: 'claude-sonnet-4-6', max_tokens: 16384,
        system: 'You are a JSON repair assistant. Return ONLY valid JSON — nothing else. Start with { and end with }.',
        messages: [{ role: 'user', content: buildRepairPrompt(stage3Raw) }],
      });
      const repairRaw = repair.content[0]?.type === 'text' ? repair.content[0].text : '';
      analysis = JSON.parse(extractJSON(repairRaw));
    } catch (repairErr) {
      emit('error', { message: `Stage 3 could not produce valid JSON after repair: ${(repairErr as Error).message}. The response was likely truncated — try fewer images or attach a BOM file.` });
      res.end();
      return;
    }
  }
  if (!analysis || typeof analysis !== 'object') {
    emit('error', { message: 'Stage 3 returned an empty analysis result.' });
    res.end();
    return;
  }
  emit('stage3', { partName: (analysis as Record<string, unknown>).partName, confidence: (analysis as Record<string, unknown>).confidenceLevel });

  emit('progress', { stage: 4, label: 'Stage 4 — Cost breakdown & country comparison', pct: 85 });

  // Stage 4
  const selectedCountry2 = (req.body?.country as string | undefined) ?? 'cn';
  const orderQty2 = parseInt(req.body?.orderQty as string ?? '100', 10) || 100;
  const volumeMultiplier2 = getVolumeMultiplier(orderQty2);
  let countryComparison2: ReturnType<typeof computeAllCountryCosts> = [];
  let selectedCountryBreakdown2: ReturnType<typeof computePCBCountryCost> | null = null;
  let volumeCurves2: Record<string, ReturnType<typeof computeVolumeCurve>> = {};
  let complexityScore2: ReturnType<typeof computeComplexityScore> | null = null;
  let confidenceBand2: PCBConfidenceBand | null = null;
  let sanityWarnings2: SanityWarning[] = [];
  let npiBreakdown2: NPIBreakdown | null = null;
  let streamAutomotiveNRE: AutomotiveNRE | null = null;
  let streamAutomotiveGradeEnforcedCount = 0;
  let streamSingleSourceWarnings: SingleSourceWarning[] = [];
  let streamConformalCoatingCost = 0;
  let streamAutomotiveAssemblyCost: AutomotiveAssemblyCost | null = null;
  let streamAutomotiveFabAdjustment: AutomotiveFabAdjustment | null = null;
  let streamBomCompleteness: BOMCompletenessResult | null = null;
  let streamProgramPricing: ProgramPricingResult | null = null;
  let streamLivePriceHits = 0;
  let streamNeedsVerification = 0;

  try {
    const a = analysis as Record<string, unknown>;
    const boardSpec = a.boardSpec as Record<string, unknown> ?? {};
    const assemblyData = a.assembly as Record<string, unknown> ?? {};
    const costEst = a.costEstimates as Record<string, unknown> ?? {};
    const pcbFabGBP = costEst.pcbFabGBP as { min?: number; mid?: number; max?: number } | undefined;
    const fabCostMid2 = Number(pcbFabGBP?.mid) || 0;
    const rawBOM2 = Array.isArray(a.bom) ? (a.bom as Array<Record<string, unknown>>) : [];
    let enrichedBOM2 = flagAndEnrichBOM(rawBOM2, volumeMultiplier2);
    if (domain === 'automotive_adas') {
      const gr2 = enforceAutomotiveGrading(enrichedBOM2, domain);
      enrichedBOM2 = gr2.bom;
      streamAutomotiveGradeEnforcedCount = gr2.forcedCount;
      streamSingleSourceWarnings = flagSingleSourceRisks(enrichedBOM2);
      const bomTotNRE = enrichedBOM2.reduce((s, l) => s + Number(l.lineTotalGBP ?? 0), 0);
      streamAutomotiveNRE = computeAutomotiveNRE(streamAsilClassification.asilLevel, bomTotNRE);
      streamConformalCoatingCost = computeConformalCoatingCost(boardSpec, domain, streamAsilClassification.asilLevel);
      // Automotive assembly cost model
      const streamCountryAssemblyPerBoard = selectedCountryBreakdown2?.assemblyPerBoard ?? 0;
      streamAutomotiveAssemblyCost = computeAutomotiveAssemblyCost(assemblyData, streamAsilClassification.asilLevel, orderQty2, streamCountryAssemblyPerBoard);
      // Automotive fab adjustment
      streamAutomotiveFabAdjustment = computeAutomotiveFabAdjustment(boardSpec, fabCostMid2, domain);
    }
    // Catalogue grounding (audit fix): the streaming path — the one the UI
    // actually uses — previously hardcoded livePriceHits: 0 and never called
    // the distributor APIs. Ground BEFORE totals so real prices flow into the
    // BOM total and the country comparison. Offline (no key) it still runs
    // reconcile for the needs-verification flags.
    {
      const candidatePNs2 = groundingCandidates(enrichedBOM2, 20);
      let livePrices2: LivePriceResult[] = [];
      if (candidatePNs2.length > 0) {
        const octoKey2 = await resolveNexarAccessToken();
        const rsKey2 = process.env.RS_API_KEY ?? '';
        const liveProvider2: LivePricingProvider | null = octoKey2 ? 'octopart' : rsKey2 ? 'rs' : null;
        if (liveProvider2) {
          emit('progress', { stage: 4, label: 'Stage 4 — grounding prices against distributor catalogue', pct: 90 });
          try {
            livePrices2 = await fetchLivePricesWithAECQ(candidatePNs2, liveProvider2, liveProvider2 === 'octopart' ? octoKey2 : rsKey2, orderQty2, domain === 'automotive_adas');
            console.log(`[PCB/stream] Catalogue grounding: ${livePrices2.length}/${candidatePNs2.length} parts priced via ${liveProvider2}`);
          } catch (lpErr) {
            console.warn('[PCB/stream] Live pricing fetch failed (non-fatal):', (lpErr as Error).message);
          }
        }
      }
      const reconciled2 = reconcileBomWithCatalogue(enrichedBOM2, livePrices2);
      enrichedBOM2 = reconciled2.bom as Array<Record<string, unknown>>;
      streamLivePriceHits = reconciled2.matched;
      streamNeedsVerification = reconciled2.needsVerification;
    }
    a.bom = enrichedBOM2;
    const correctedBOMTotal2 = enrichedBOM2.reduce((s, l) => s + Number(l.lineTotalGBP ?? 0), 0);
    if (a.costEstimates && typeof a.costEstimates === 'object') (a.costEstimates as Record<string, unknown>).totalBOMCostGBP = Math.round(correctedBOMTotal2 * 100) / 100;
    // BOM completeness (all domains)
    streamBomCompleteness = estimateMissingPassives(enrichedBOM2, Number(assemblyData.smtPlacements) || 0);
    // Program pricing (automotive only, or show discount potential)
    streamProgramPricing = computeProgramPricing(correctedBOMTotal2, orderQty2, domain);
    confidenceBand2 = computeConfidenceBand(enrichedBOM2 as unknown as BOMLineForBand[], fabCostMid2, ocrResult.extractionQuality, volumeMultiplier2);
    sanityWarnings2 = runSanityChecks(boardSpec, assemblyData, enrichedBOM2, Number((costEst as Record<string,unknown>).totalBOMCostGBP ?? 0));
    npiBreakdown2 = computeNPIBreakdown(correctedBOMTotal2, fabCostMid2, Number(assemblyData.smtPlacements) || 0, orderQty2);
    const costInput2: PCBCostInput = {
      widthMm: Number(boardSpec.widthMm) || 100, heightMm: Number(boardSpec.heightMm) || 80, layers: Number(boardSpec.estimatedLayers) || 2,
      surfaceFinish: String(boardSpec.surfaceFinish || 'enig'), throughVias: Number(boardSpec.throughVias) || 50,
      blindVias: Number(boardSpec.blindVias) || 0, microVias: Number(boardSpec.microVias) || 0, hdiStructure: String(boardSpec.hdiStructure || 'none'),
      impedanceControlled: Boolean(boardSpec.impedanceControlRequired), smtPlacements: Number(assemblyData.smtPlacements) || 0,
      throughHoleJoints: Number(assemblyData.throughHoleJoints) || 0, manualJoints: Number(assemblyData.manualJoints) || 0,
      bgaCount: Number(assemblyData.bgaCount) || 0, aoiRequired: Boolean(assemblyData.aoiRequired), ictTimeSec: Number(assemblyData.ictTimeSec) || 0,
      conformalCoatAreaCm2: streamConformalCoatingCost > 0 ? (Number(boardSpec.widthMm || 100) * Number(boardSpec.heightMm || 80) / 100) : 0,
      totalBOMCostGBP: correctedBOMTotal2 || Number(costEst.totalBOMCostGBP) || fabCostMid2 || 0, orderQuantity: orderQty2,
    };
    countryComparison2 = computeAllCountryCosts(costInput2);
    const resolvedCountry2 = PCB_COUNTRY_RATES[selectedCountry2] ? selectedCountry2 : 'cn';
    selectedCountryBreakdown2 = computePCBCountryCost(costInput2, resolvedCountry2);
    const sorted2 = [...countryComparison2].sort((x, y) => x.totalPerBoard - y.totalPerBoard);
    const cheapestId2 = sorted2[0]?.countryId ?? 'cn';
    const volQtys2 = [100, 250, 500, 1000, 2500, 5000, 10000, 25000];
    volumeCurves2 = { [cheapestId2]: computeVolumeCurve(costInput2, cheapestId2, volQtys2), [resolvedCountry2]: computeVolumeCurve(costInput2, resolvedCountry2, volQtys2), gb: computeVolumeCurve(costInput2, 'gb', volQtys2) };
    complexityScore2 = computeComplexityScore(boardSpec, assemblyData);
  } catch (err) {
    console.warn('[PCB/stream] Stage 4 failed:', (err as Error).message);
  }

  emit('progress', { stage: 5, label: 'Complete', pct: 100 });
  emit('complete', {
    analysis, selectedCountry: selectedCountry2, selectedCountryBreakdown: selectedCountryBreakdown2,
    countryComparison: countryComparison2, volumeCurves: volumeCurves2, complexityScore: complexityScore2,
    confidenceBand: confidenceBand2, volumeMultiplier: volumeMultiplier2, sanityWarnings: sanityWarnings2,
    npiBreakdown: npiBreakdown2, livePriceHits: streamLivePriceHits,
    catalogueVerifiedCount: streamLivePriceHits, needsVerificationCount: streamNeedsVerification,
    fromCache: false,
    asilLevel: streamAsilClassification.asilLevel,
    asilRationale: streamAsilClassification.asilRationale,
    asilSafetyFunctions: streamAsilClassification.safetyFunctions,
    automotiveNRE: streamAutomotiveNRE,
    automotiveGradeEnforcedCount: streamAutomotiveGradeEnforcedCount,
    singleSourceWarnings: streamSingleSourceWarnings,
    conformalCoatingCost: streamConformalCoatingCost,
    automotiveAssemblyCost: streamAutomotiveAssemblyCost,
    automotiveFabAdjustment: streamAutomotiveFabAdjustment,
    bomCompleteness: streamBomCompleteness,
    programPricing: streamProgramPricing,
  });
  res.end();
});

export default router;
