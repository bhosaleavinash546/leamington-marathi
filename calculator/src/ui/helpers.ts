import type { UniversalStackInput } from '../engine/types.js';

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
export function val(id: string): string { return (el<HTMLInputElement>(id))?.value?.trim() ?? ''; }
export function num(id: string): number { return parseFloat(val(id)) || 0; }
export function sel(id: string): string { return el<HTMLSelectElement>(id)?.value ?? ''; }
export function fmt(n: number): string { return '£' + n.toFixed(2); }
export function fmtPct(n: number): string { return n.toFixed(1) + '%'; }

export function chk(id: string): boolean { return (document.getElementById(id) as HTMLInputElement)?.checked ?? false; }

export function getUniversalTail(): Pick<UniversalStackInput, 'partName' | 'packagingPerPart' | 'logisticsPerPart' | 'overheadPct' | 'marginPct'> {
  return {
    partName: val('part-name') || 'Unnamed Part',
    packagingPerPart: num('packaging'),
    logisticsPerPart: num('logistics'),
    overheadPct: num('overhead-pct') / 100,
    marginPct: num('margin-pct') / 100,
  };
}
