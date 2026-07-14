/**
 * PCB analysis payload normalization — guarantees the exact shape the client
 * renderer assumes. The model can omit whole sections OR individual numerics
 * from the Stage 3 JSON even after repair; the renderer calls .toFixed() on
 * them and crashes ("undefined is not an object (evaluating 'a.smtPlacements')",
 * "Cannot read properties of undefined (reading 'toFixed')"). Every section is
 * made present and every numeric finite, with defaults derived from the BOM.
 */
export function normalizePCBAnalysis(a: Record<string, unknown>): void {
  const num = (v: unknown, dflt: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  };
  const str = (v: unknown, dflt: string): string => (typeof v === 'string' && v ? v : dflt);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  // BOM lines: qty/unitPriceGBP must be numbers.
  const bom = arr(a.bom) as Array<Record<string, unknown>>;
  for (const line of bom) {
    line.qty = num(line.qty, 1);
    line.unitPriceGBP = num(line.unitPriceGBP, 0);
    line.moq = num(line.moq, 1);
    line.refDes = str(line.refDes, '—');
    line.componentType = str(line.componentType, 'other');
    line.description = str(line.description, '');
    line.pkg = str(line.pkg, '');
    line.value = str(line.value, '');
    line.voltage = str(line.voltage, '');
  }
  a.bom = bom;
  const totalQty = bom.reduce((s, l) => s + (l.qty as number), 0);
  const bomTotal = bom.reduce((s, l) => s + (l.qty as number) * (l.unitPriceGBP as number), 0);

  const asm = (a.assembly && typeof a.assembly === 'object' ? a.assembly : {}) as Record<string, unknown>;
  a.assembly = {
    ...asm,
    smtPlacements: num(asm.smtPlacements, totalQty),
    throughHoleJoints: num(asm.throughHoleJoints, 0),
    manualJoints: num(asm.manualJoints, 0),
    bgaCount: num(asm.bgaCount, 0),
    complexity: str(asm.complexity, 'Medium'),
    reflowSides: num(asm.reflowSides, 1),
    aoiRequired: typeof asm.aoiRequired === 'boolean' ? asm.aoiRequired : true,
    ictTimeSec: num(asm.ictTimeSec, 0),
  };

  const bs = (a.boardSpec && typeof a.boardSpec === 'object' ? a.boardSpec : {}) as Record<string, unknown>;
  a.boardSpec = {
    ...bs,
    estimatedLayers: num(bs.estimatedLayers, 4),
    widthMm: num(bs.widthMm, 100),
    heightMm: num(bs.heightMm, 80),
    surfaceFinish: str(bs.surfaceFinish, 'HASL'),
    solderMaskColour: str(bs.solderMaskColour, 'green'),
    silkscreenSides: num(bs.silkscreenSides, 1),
    throughVias: num(bs.throughVias, 0),
    blindVias: num(bs.blindVias, 0),
    buriedVias: num(bs.buriedVias, 0),
    microVias: num(bs.microVias, 0),
    bgaDetected: typeof bs.bgaDetected === 'boolean' ? bs.bgaDetected : false,
    minTraceSpaceMm: num(bs.minTraceSpaceMm, 0.15),
    technologyType: str(bs.technologyType, 'standard_rigid'),
    hdiStructure: str(bs.hdiStructure, 'none'),
    impedanceControlRequired: typeof bs.impedanceControlRequired === 'boolean' ? bs.impedanceControlRequired : false,
    copperWeightOz: num(bs.copperWeightOz, 1),
    qualityGrade: str(bs.qualityGrade, 'industrial'),
    panelUtilisation: num(bs.panelUtilisation, 0.8),
  };

  const ce = (a.costEstimates && typeof a.costEstimates === 'object' ? a.costEstimates : {}) as Record<string, unknown>;
  const fab = (ce.pcbFabGBP && typeof ce.pcbFabGBP === 'object' ? ce.pcbFabGBP : {}) as Record<string, unknown>;
  const fabMid = num(fab.mid, num(fab.min, 0) && num(fab.max, 0) ? (num(fab.min, 0) + num(fab.max, 0)) / 2 : 2.5);
  a.costEstimates = {
    ...ce,
    pcbFabGBP: { min: num(fab.min, fabMid * 0.8), mid: fabMid, max: num(fab.max, fabMid * 1.3) },
    totalBOMCostGBP: num(ce.totalBOMCostGBP, Math.round(bomTotal * 100) / 100),
    smtAssemblyCostGBP: num(ce.smtAssemblyCostGBP, 0),
  };

  a.partName = str(a.partName, 'PCB Assembly');
  a.confidenceLevel = str(a.confidenceLevel, 'Low');
  a.aiInsights = arr(a.aiInsights);
  a.dfmIssues = arr(a.dfmIssues);
  a.highCostComponents = arr(a.highCostComponents);
  a.optimisationSuggestions = arr(a.optimisationSuggestions);
  a.analysisLimitations = arr(a.analysisLimitations);
}
