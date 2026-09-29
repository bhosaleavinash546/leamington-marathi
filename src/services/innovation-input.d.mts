export interface DfaPart { name: string; moves: boolean; differentMaterial: boolean; mustSeparate: boolean }
export function parseDfaLine(line: string): DfaPart | null;
export function parseDfaLines(text: string): DfaPart[];
