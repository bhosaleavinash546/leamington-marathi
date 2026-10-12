export type CommodityKey =
  | 'Battery' | 'EDU' | 'Chassis' | 'Driveline' | 'BIW'
  | 'Interior' | 'Exterior' | 'Electrical' | 'Powertrain';
export const COMMODITY_KEYS: CommodityKey[];
export function inferCommodityKey(system: string | null | undefined): CommodityKey | null;
export declare const OFF_ROAD_KEY: 'OffRoad';
export declare const OFF_ROAD_LABEL: 'Off-Road Features';
export declare const MARKETPLACE_COMMODITY_KEYS: string[];
export declare function marketplaceCommodityOf(idea: { system?: string | null; ideaData?: unknown } | null | undefined): string | null;
export declare const OFF_ROAD_SYSTEM_NAMES: string[];
