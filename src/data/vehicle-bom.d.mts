export const BOM_TREE: Record<string, Record<string, string[]>>;
export function flattenBom(): Array<{ commodity: string; assembly: string; part: string }>;
