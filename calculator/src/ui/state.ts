import { recomputeMachineRates, getLibraryFromStorage, saveLibraryToStorage, DEFAULT_RATE_LIBRARY } from '../engine/index.js';
import type { RateLibrary, UniversalStackInput, PartCostResult, CommodityType } from '../engine/types.js';
import type { CADAnalysisResult } from '../engine/ai-analysis.js';

export let library: RateLibrary = recomputeMachineRates(getLibraryFromStorage());
export let lastResult: PartCostResult | null = null;
export let lastInput: UniversalStackInput | null = null;
export let activeCommodity: CommodityType = 'machining';
export let cadFile: File | null = null;
export let cadAnalysisResult: CADAnalysisResult | null = null;

// row counters
export let machOpCount = 0;
export let coatCount = 0;
export let joinCount = 0;
export let stationCount = 0;
export let bomCount = 0;
export let camMachOpCount = 0;

export function setLibrary(lib: RateLibrary): void { library = lib; saveLibraryToStorage(lib); }
export function setLastResult(r: PartCostResult | null): void { lastResult = r; }
export function setLastInput(i: UniversalStackInput | null): void { lastInput = i; }
export function setActiveCommodity(c: CommodityType): void { activeCommodity = c; }
export function setCadFile(f: File | null): void { cadFile = f; }
export function setCadAnalysisResult(r: CADAnalysisResult | null): void { cadAnalysisResult = r; }
export function setMachOpCount(n: number): void { machOpCount = n; }
export function setCoatCount(n: number): void { coatCount = n; }
export function setJoinCount(n: number): void { joinCount = n; }
export function setStationCount(n: number): void { stationCount = n; }
export function setBomCount(n: number): void { bomCount = n; }
export function setCamMachOpCount(n: number): void { camMachOpCount = n; }
export { recomputeMachineRates, DEFAULT_RATE_LIBRARY };
