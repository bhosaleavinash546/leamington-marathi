/** Runs every extractor over one drawing. Each extractor is a pure function of the context and can be run alone. */
import type { DraftParameter, ExtractContext } from '../types.js';
import { extractTitleBlock } from './title-block.js';
import { extractMaterial } from './material.js';
import { extractGeneralTolerance } from './general-tolerance.js';
import { extractRoughness } from './roughness.js';
import { extractCoating } from './coating.js';
import { extractHeatTreatment } from './heat-treatment.js';
import { extractThreads } from './threads.js';
import { extractDimensions } from './dimensions.js';
import { extractGdt } from './gdt.js';
import { extractWelds } from './welds.js';
import { extractQuality } from './quality.js';
import { extractGear } from './gear.js';
import { extractNotes } from './notes.js';

export function runExtractors(ctx: ExtractContext): DraftParameter[] {
  const gdt = extractGdt(ctx);
  return [
    ...extractTitleBlock(ctx),
    ...extractMaterial(ctx),
    ...extractGeneralTolerance(ctx),
    ...extractRoughness(ctx),
    ...extractCoating(ctx),
    ...extractHeatTreatment(ctx),
    ...extractThreads(ctx),
    ...extractDimensions(ctx, { skipLineIds: gdt.frameLineIds }),
    ...gdt.parameters,
    ...extractWelds(ctx),
    ...extractQuality(ctx),
    ...extractGear(ctx),
    ...extractNotes(ctx),
  ];
}

export { extractTitleBlock, extractMaterial, extractGeneralTolerance, extractRoughness, extractCoating, extractHeatTreatment, extractThreads,
  extractDimensions, extractGdt, extractWelds, extractQuality, extractGear, extractNotes };
