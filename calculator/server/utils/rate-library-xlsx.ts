/**
 * Excel (.xlsx) template + parser for the manufacturing rate library.
 *
 * Admins download a multi-tab template (one sheet per rate table), fill in their
 * company's numbers, and upload it. This module turns a RateLibrary into that
 * workbook and parses an uploaded workbook back into a validated RateLibrary.
 *
 * Pure data transforms over the `xlsx` library — unit-tested by round-tripping
 * the built-in library through build → parse.
 */

import * as XLSX from 'xlsx';
import type {
  RateLibrary, MaterialRate, MachineRate, LabourRate, EnergyRate, FXRate, OverheadDefault, Confidence,
} from '../../src/engine/types.js';
import { computeMachineRatePerHr } from '../../src/engine/rate-library-merge.js';

export interface ParseResult {
  library: RateLibrary | null;
  errors: string[];
  counts: Record<string, number>;
}

const SHEETS = {
  materials: 'Materials',
  machines: 'Machines',
  labour: 'Labour',
  energy: 'Energy',
  fx: 'FX',
  overhead: 'Overhead',
} as const;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(/[£$€,\s]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const conf = (v: unknown): Confidence => {
  const s = str(v);
  return s === 'High' || s === 'Medium' || s === 'Low' ? s : 'Medium';
};

// ─── Build the template / export the current library ───────────────────────────

export function buildRateLibraryWorkbook(lib: RateLibrary): Buffer {
  const wb = XLSX.utils.book_new();

  const add = (name: string, rows: unknown[][], cols: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = cols.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add(SHEETS.materials, [
    ['id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3', 'region', 'effectiveDate', 'sourceNote', 'confidence'],
    ...lib.materials.map(m => [m.id, m.grade, m.category, m.pricePerKg, m.scrapRecoveryPricePerKg, m.densityKgPerM3, m.region, m.effectiveDate, m.sourceNote, m.confidence]),
  ], [22, 20, 16, 12, 20, 14, 12, 14, 40, 12]);

  add(SHEETS.machines, [
    ['id', 'machineClass', 'region', 'annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport', 'financeCost', 'annualAvailableHours', 'machineUtilization', 'effectiveDate', 'sourceNote', 'confidence', 'computedRatePerHr (auto)'],
    ...lib.machines.map(m => [m.id, m.machineClass, m.region, m.buildup.annualDepreciation, m.buildup.maintenance, m.buildup.energy, m.buildup.floorSpace, m.buildup.indirectSupport, m.buildup.financeCost, m.buildup.annualAvailableHours, m.buildup.machineUtilization, m.effectiveDate, m.sourceNote, m.confidence, m.computedRatePerHr]),
  ], [22, 22, 12, 18, 14, 12, 12, 16, 14, 20, 18, 14, 36, 12, 22]);

  add(SHEETS.labour, [
    ['id', 'region', 'skillLevel', 'fullyLoadedRatePerHr', 'effectiveDate', 'sourceNote', 'confidence'],
    ...lib.labour.map(l => [l.id, l.region, l.skillLevel, l.fullyLoadedRatePerHr, l.effectiveDate, l.sourceNote, l.confidence]),
  ], [22, 14, 18, 20, 14, 40, 12]);

  add(SHEETS.energy, [
    ['id', 'region', 'electricityPerKwh', 'gasPerKwh', 'effectiveDate', 'sourceNote', 'confidence'],
    ...lib.energy.map(e => [e.id, e.region, e.electricityPerKwh, e.gasPerKwh, e.effectiveDate, e.sourceNote, e.confidence]),
  ], [22, 14, 18, 14, 14, 40, 12]);

  add(SHEETS.fx, [
    ['id', 'fromCurrency', 'toCurrency', 'rate', 'effectiveDate', 'sourceNote'],
    ...lib.fx.map(f => [f.id, f.fromCurrency, f.toCurrency, f.rate, f.effectiveDate, f.sourceNote]),
  ], [16, 14, 12, 12, 14, 40]);

  add(SHEETS.overhead, [
    ['id', 'commodityType', 'supplierTier', 'overheadPct', 'marginPct', 'sourceNote'],
    ...lib.overheadDefaults.map(o => [o.id, o.commodityType, o.supplierTier, o.overheadPct, o.marginPct, o.sourceNote]),
  ], [22, 20, 16, 12, 12, 40]);

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

// ─── Parse an uploaded workbook back into a validated library ──────────────────

function rows(wb: XLSX.WorkBook, sheet: string): Record<string, unknown>[] {
  const ws = wb.Sheets[sheet];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
}

export function parseRateLibraryWorkbook(buf: Buffer): ParseResult {
  const errors: string[] = [];
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buf, { type: 'buffer' }); }
  catch { return { library: null, errors: ['File is not a readable .xlsx workbook.'], counts: {} }; }

  const need = (v: number, where: string): number => {
    if (!Number.isFinite(v)) { errors.push(`${where}: not a valid number`); return 0; }
    if (v < 0) { errors.push(`${where}: must not be negative`); return 0; }
    return v;
  };

  const materials: MaterialRate[] = rows(wb, SHEETS.materials).filter(r => str(r.id)).map((r, i) => ({
    id: str(r.id), grade: str(r.grade), category: str(r.category),
    pricePerKg: need(num(r.pricePerKg), `Materials row ${i + 2} pricePerKg`),
    scrapRecoveryPricePerKg: need(num(r.scrapRecoveryPricePerKg), `Materials row ${i + 2} scrapRecoveryPricePerKg`),
    densityKgPerM3: need(num(r.densityKgPerM3), `Materials row ${i + 2} densityKgPerM3`),
    region: str(r.region), effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
  }));

  const machines: MachineRate[] = rows(wb, SHEETS.machines).filter(r => str(r.id)).map((r, i) => {
    const buildup = {
      annualDepreciation: need(num(r.annualDepreciation), `Machines row ${i + 2} annualDepreciation`),
      maintenance: need(num(r.maintenance), `Machines row ${i + 2} maintenance`),
      energy: need(num(r.energy), `Machines row ${i + 2} energy`),
      floorSpace: need(num(r.floorSpace), `Machines row ${i + 2} floorSpace`),
      indirectSupport: need(num(r.indirectSupport), `Machines row ${i + 2} indirectSupport`),
      financeCost: need(num(r.financeCost), `Machines row ${i + 2} financeCost`),
      annualAvailableHours: need(num(r.annualAvailableHours), `Machines row ${i + 2} annualAvailableHours`),
      machineUtilization: need(num(r.machineUtilization), `Machines row ${i + 2} machineUtilization`),
    };
    return {
      id: str(r.id), machineClass: str(r.machineClass), region: str(r.region), buildup,
      computedRatePerHr: computeMachineRatePerHr(buildup),   // always derived, never trusted from the file
      effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
    };
  });

  const labour: LabourRate[] = rows(wb, SHEETS.labour).filter(r => str(r.id)).map((r, i) => ({
    id: str(r.id), region: str(r.region), skillLevel: str(r.skillLevel),
    fullyLoadedRatePerHr: need(num(r.fullyLoadedRatePerHr), `Labour row ${i + 2} fullyLoadedRatePerHr`),
    effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
  }));

  const energy: EnergyRate[] = rows(wb, SHEETS.energy).filter(r => str(r.id)).map((r, i) => ({
    id: str(r.id), region: str(r.region),
    electricityPerKwh: need(num(r.electricityPerKwh), `Energy row ${i + 2} electricityPerKwh`),
    gasPerKwh: need(num(r.gasPerKwh), `Energy row ${i + 2} gasPerKwh`),
    effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote), confidence: conf(r.confidence),
  }));

  const fx: FXRate[] = rows(wb, SHEETS.fx).filter(r => str(r.id)).map((r, i) => ({
    id: str(r.id), fromCurrency: str(r.fromCurrency), toCurrency: str(r.toCurrency),
    rate: need(num(r.rate), `FX row ${i + 2} rate`),
    effectiveDate: str(r.effectiveDate), sourceNote: str(r.sourceNote),
  }));

  const overheadDefaults: OverheadDefault[] = rows(wb, SHEETS.overhead).filter(r => str(r.id)).map((r, i) => ({
    id: str(r.id), commodityType: str(r.commodityType) as OverheadDefault['commodityType'], supplierTier: str(r.supplierTier),
    overheadPct: need(num(r.overheadPct), `Overhead row ${i + 2} overheadPct`),
    marginPct: need(num(r.marginPct), `Overhead row ${i + 2} marginPct`),
    sourceNote: str(r.sourceNote),
  }));

  const counts = { materials: materials.length, machines: machines.length, labour: labour.length, energy: energy.length, fx: fx.length, overheadDefaults: overheadDefaults.length };
  if (materials.length === 0 && machines.length === 0 && labour.length === 0) {
    errors.push('No rows found — is this the correct template with the Materials/Machines/Labour sheets?');
  }
  if (errors.length) return { library: null, errors, counts };

  const library: RateLibrary = {
    materials, machines, labour, energy, fx, overheadDefaults,
    version: 'company-upload', lastModified: '',   // stamped by the caller
  };
  return { library, errors: [], counts };
}
