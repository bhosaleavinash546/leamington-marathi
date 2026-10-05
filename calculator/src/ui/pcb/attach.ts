/**
 * One way to attach a PCB analysis response to the result object (PCB review, Oct 2026).
 *
 * The first analysis and the re-analysis each had their own copy of this, and the
 * re-analysis copy dropped the ASIL level, the board domain and the chip markings.
 * The domain and markings only reached the client if the MODEL echoed them, which
 * structured output never does. So a re-analysis of an automotive board went to the
 * server as "general" with no markings, and its automotive premiums disappeared.
 */
import type { PCBImageAnalysis } from './types.js';

type Payload = Record<string, unknown> & { analysis: PCBImageAnalysis };

export function attachPcbPayload(target: PCBImageAnalysis, data: Payload, fallbackCountry: string): void {
  const d = data as Record<string, unknown>;
  const set = <K extends keyof PCBImageAnalysis>(k: K, v: unknown) => { if (v !== undefined && v !== null) (target as unknown as Record<string, unknown>)[k as string] = v; };
  target._selectedCountry = (d.selectedCountry as string | undefined) ?? fallbackCountry;
  target._selectedCountryBreakdown = (d.selectedCountryBreakdown as PCBImageAnalysis['_selectedCountryBreakdown']) ?? undefined;
  target._countryComparison = (d.countryComparison as PCBImageAnalysis['_countryComparison']) ?? [];
  target._volumeCurves = (d.volumeCurves as PCBImageAnalysis['_volumeCurves']) ?? undefined;
  set('complexityScore', d.complexityScore);
  set('_confidenceBand', d.confidenceBand);
  set('_volumeMultiplier', d.volumeMultiplier);
  set('_sanityWarnings', d.sanityWarnings);
  set('_npiBreakdown', d.npiBreakdown);
  set('_livePriceHits', d.livePriceHits);
  set('_asilLevel', d.asilLevel);
  set('_asilRationale', d.asilRationale);
  set('_asilSafetyFunctions', d.asilSafetyFunctions);
  set('_automotiveNRE', d.automotiveNRE);
  set('_automotiveGradeEnforcedCount', d.automotiveGradeEnforcedCount);
  set('_singleSourceWarnings', d.singleSourceWarnings);
  set('_conformalCoatingCost', d.conformalCoatingCost);
  set('_automotiveAssemblyCost', d.automotiveAssemblyCost);
  set('_automotiveFabAdjustment', d.automotiveFabAdjustment);
  set('_bomCompleteness', d.bomCompleteness);
  set('_programPricing', d.programPricing);
  set('_orderQty', d.orderQty);
  target._costingFailed = d.costingFailed === true;
  // From the server, not the model: what Stage 1 classified and what OCR read.
  set('stage1Classification', d.stage1Classification);
  set('ocrExtraction', d.ocrExtraction);
}
