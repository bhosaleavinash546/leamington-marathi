import type { CommodityKey } from './commodity-classify.mjs';

export type Powertrain = 'ICE' | 'MHEV' | 'PHEV' | 'BEV';
export type Segment = 'off-road' | 'luxury' | 'software';
export type CostTrend = 'falling-fast' | 'falling' | 'flat' | 'rising';
export type Driver = 'cost' | 'regulation' | 'performance' | 'weight' | 'software' | 'sustainability';

export type AnchorStatus = 'in-force' | 'adopted' | 'proposed' | 'under-revision';

export interface RegAnchor {
  id: string;
  name: string;
  year: number;           // year the obligation bites (or main step)
  region: string;
  status: AnchorStatus;   // only in-force/adopted law may pull a horizon
  effect: string;         // what it forces, one line
}

export interface ForesightTech {
  id: string;
  name: string;
  commodity: CommodityKey;
  powertrains: Powertrain[];
  replaces: string;
  trl: number;            // 1-9 automotive TRL today
  adoptionPct: number;    // % of applicable current production
  firstProduction?: string;
  drivers: Driver[];
  regAnchor?: string;     // RegAnchor id
  costTrend: CostTrend;
  players: string[];
  note: string;
  matchTerms: string[];
  segments?: Segment[];   // cross-cutting lens tags (off-road / luxury)
  ceiling?: number;       // honest saturation share of the applicable segment (default 90)
}

export interface BenchmarkVehicle {
  vehicle: string;
  brand: string;
  year: number;
  powertrains: Powertrain[];
  signature: string[];
  watch: string;
}

export const REG_ANCHORS: RegAnchor[];
export const FORESIGHT_REGISTER: ForesightTech[];
export const MIN_PER_COMMODITY: number;
export const SEGMENTS: Segment[];
export const SEGMENT_TAG_IDS: Record<Segment, string[]>;
export const ADOPTION_CEILING_IDS: string[];
export const BENCHMARK_VEHICLES: BenchmarkVehicle[];
