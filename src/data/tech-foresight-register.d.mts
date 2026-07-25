import type { CommodityKey } from './commodity-classify.mjs';

export type Powertrain = 'ICE' | 'MHEV' | 'PHEV' | 'BEV';
export type CostTrend = 'falling-fast' | 'falling' | 'flat' | 'rising';
export type Driver = 'cost' | 'regulation' | 'performance' | 'weight' | 'software' | 'sustainability';

export interface RegAnchor {
  id: string;
  name: string;
  year: number;           // year the obligation bites (or main step)
  region: string;
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
}

export const REG_ANCHORS: RegAnchor[];
export const FORESIGHT_REGISTER: ForesightTech[];
export const MIN_PER_COMMODITY: number;
