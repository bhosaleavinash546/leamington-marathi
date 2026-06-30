export type Powertrain = 'ICE' | 'MHEV' | 'PHEV' | 'BEV';
export type Voltage = '400V' | '800V';
export interface IdeaClassification {
  powertrains: Powertrain[];
  voltages: Voltage[];
}
export const POWERTRAINS: Powertrain[];
export const VOLTAGES: Voltage[];
export function classifyIdeaText(haystack: string): IdeaClassification;
export function classifyIdea(idea: { title?: string; description?: string; ideaData?: string | null }): IdeaClassification;
