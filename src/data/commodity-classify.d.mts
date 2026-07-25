export type CommodityKey =
  | 'Battery' | 'EDU' | 'Chassis' | 'Driveline' | 'BIW'
  | 'Interior' | 'Exterior' | 'Electrical' | 'Powertrain';
export const COMMODITY_KEYS: CommodityKey[];
export function inferCommodityKey(system: string | null | undefined): CommodityKey | null;
