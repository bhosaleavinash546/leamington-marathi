export interface CADGeometry {
  boundingBoxMm: { x: number; y: number; z: number };
  estimatedVolumeCm3: number;
  estimatedSurfaceAreaCm2: number;
  estimatedWeightKg: { aluminum: number; steel: number; plastic: number };
}

/** Raw output from the OCCT Python geometry engine — present only when the engine succeeded. */
/** One measured manufacturing feature. Absent keys mean NOT MEASURED, never zero. */
export interface ManufacturingFeature {
  id: string;
  kind: 'hole' | 'boss' | 'fillet' | 'planar_face';
  /** 1-based B-rep face indices — the viewer highlights exactly these. */
  faceIds: number[];
  diaMm?: number;
  depthMm?: number;
  /** depth / diameter — drives drill reach and tool-deflection rules. */
  ldRatio?: number;
  radiusMm?: number;
  areaMm2?: number;
  positionMm?: [number, number, number];
  axis?: [number, number, number];
  thicknessMm?: number;
  /** Draft measured on this face. Absent when draftClass is not_applicable. */
  draftDeg?: number;
  /** `not_applicable` = an end face, where draft is undefined — not a gap. */
  draftClass?: 'undercut' | 'zero_draft' | 'drafted' | 'not_applicable';
  neighbourWallMm?: number;
  neighbourMinThicknessMm?: number;
  /** Thick:thin across an adjacent face. Only emitted when wallAnalysisValid. */
  sectionRatio?: number;
  bossToWallRatio?: number;
  adjacentFaceIds?: number[];
}

export interface ManufacturingFeatureSet {
  available: boolean;
  features: ManufacturingFeature[];
  faceCount?: number;
  thicknessSampledFaces?: number;
  medianThicknessMm?: number | null;
  /**
   * False on a solid-bodied part, where single-ray thickness measures the
   * part's extent rather than a wall. Section-change and hot-spot rules MUST
   * NOT run when this is false — that is the guard against the false-positive
   * class that makes a DFM tool untrustworthy.
   */
  wallAnalysisValid?: boolean;
  fillRatio?: number | null;
  hotSpots?: Array<{ faceId: number; thicknessMm: number; vsMedianRatio: number; positionMm: number[] }>;
  adjacencyAvailable?: boolean;
  drawDirectionXYZ?: number[];
  note?: string;
}

export interface OCCTGeometry {
  status: 'success' | 'error';
  partName?: string;
  boundingBox?: { xMm: number; yMm: number; zMm: number };
  volume?: { mm3: number; cm3: number };
  surfaceArea?: { mm2: number; cm2: number };
  fillRatio?: number;
  /** Sealed-hollow-body vs open-drape topology (distinguishes a fuel tank from a bumper). */
  topology?: {
    available: boolean;
    solidCount?: number;
    shellCount?: number;
    voidCount?: number;
    freeEdgeCount?: number;
    freeEdgeRatio?: number;
    /** True → encloses a sealed cavity (blow/rotational-moulding candidate). */
    enclosesSealedVoid?: boolean;
    /** True → thin open drape with no enclosed void (injection-moulding / thermoforming). */
    openShell?: boolean;
    note?: string;
  } | null;
  wallThickness?: {
    minMm: number; maxMm: number; meanMm: number; stdDevMm: number;
    /** 95th-percentile ray-cast wall (mm) — the thickest section governs cooling/ejection. */
    p95Mm?: number | null;
    sampleCount: number; method: 'ray_cast' | 'formula' | 'volume_surface_shell'; uniformity: string;
  } | null;
  draftAnalysis?: {
    drawDirectionXYZ: [number, number, number];
    undercutFaceCount: number;
    zeroDraftFaceCount: number;
    adequateDraftFaceCount: number;
    minPositiveDraftDeg: number | null;
    maxPositiveDraftDeg: number | null;
    analyzedFaceCount: number;
  } | null;
  setupAnalysis?: {
    estimatedSetupCount: number;
    principalDirections: Array<{ directionLabel: string; faceCount: number }>;
  } | null;
  cncCycleTimeEstimate?: {
    setupTimeMins: number;
    planarMillingTimeMins: number;
    drillBoreTimeMins: number;
    estimatedTotalMins: number;
    estimatedTotalHrs: number;
    assumedFeedRateMm2PerMin: number;
    assumedDrillBoreMinPerFeature: number;
    assumedSetupTimeMinsPerSetup: number;
  } | null;
  weights?: {
    aluminiumKg: number; steelKg: number; plasticKg: number;
    castIronKg: number; copperKg: number; titaniumKg: number;
  };
  faces?: { total: number; byType: Record<string, number> };
  edges?: { total: number; byType: Record<string, number>; sampleCircleRadiiMm: number[] };
  features?: {
    cylindricalFaceCount: number;
    cylindricalFaceRadiiMm: number[];
    estimatedHoleCount: number;
    holeRadiiMm: number[];
    bossShaftRadiiMm: number[];
    threadFeaturesDetected: boolean;
    planarFaceCount: number;
    freeFormFaceCount: number;
  };
  /** Exact per-feature rows: hole/boss × Ø × depth × through, axis-deduped counts. */
  featureTable?: Array<{
    kind: 'hole' | 'boss' | 'face' | 'pocket' | 'slot';
    diaMm: number;
    depthMm: number;
    through: boolean | null;
    count: number;
    areaMm2?: number;
  }>;
  /** Sheet-metal forming features — geometry-measured bend count for SM Fab. */
  sheetMetal?: { bendCount: number; totalBendLengthMm: number; thicknessMm: number };
  /**
   * Gear metrology, from the B-rep: teeth counted from tip-circle cylinder
   * patches, module derived as OD/(z+2). Null/absent when the shape is not
   * gear-like. Helix is deliberately never derived — a STEP file's flank
   * surfaces cannot be trusted to settle it, so it stays a drawing question.
   */
  gear?: {
    likelyGear: boolean;
    teeth: number;
    tipDiameterMm: number;
    faceWidthMm: number;
    boreDiameterMm: number;
    derivedNormalModuleMm: number;
    moduleBasis: string;
    teethBasis: string;
    helixAngleDeg: number | null;
    internal: boolean;
  } | null;
  error?: string;
  toolingCostEstimates?: {
    hpdcDieCostGBP: number;
    gravityMouldCostGBP: number;
    sandPatternCostGBP: number;
    imMouldCostGBP: number;
    forgeDieCostGBP: number;
    progressiveDieCostGBP: number;
  };
  manufacturabilityScore?: number;
  /**
   * Per-feature manufacturing substrate for geometric DFM — the unit of
   * analysis, mirroring aPriori's Geometric Cost Drivers and DFMPro's
   * recognised features.
   *
   * Present only when the kernel ran with `CV_EXTRACT_FEATURES=1` (the
   * background DFM job); a normal costing run does not pay for the per-face
   * ray casting and adjacency build. `faceIds` index the same face map the
   * viewer's `triFace` sidecar uses, so a finding can highlight its own cause.
   */
  manufacturingFeatures?: ManufacturingFeatureSet | null;
  processSpecificEstimates?: {
    sandCycleTimeHr: number;
    sandCycleTimeHrFerrous: number;
    forgeStrokes: number;
    investWaxCostGBP: number;
    investShellCostGBP: number;
  };
  assemblyWarning?: string | null;
  unitWarning?: string | null;
  /** Weld-nut / weld-stud hardware detected from distinct small solids (kernel-exact). */
  detectedHardware?: {
    available: boolean;
    note?: string;
    solidCount?: number;
    totalVolumeCm3?: number;
    estSteelMassKg?: number;
    detected?: Array<{
      type: string;
      threadSize: string;
      count: number;
      boreDiaMm: number;
      heightMm: number;
      sideFlats: number;
      onSheetHole: boolean;
    }>;
  } | null;
}

export interface DetectedFeature {
  type: string;
  description: string;
  count: number;
  significance: 'High' | 'Medium' | 'Low';
}

export interface ProcessRecommendation {
  process: string;
  commodityType: string;
  confidencePct: number;
  reasoning: string;
  estimatedCycleTimeHr: number;
}

export interface ManufacturabilityRisk {
  severity: 'High' | 'Medium' | 'Low';
  feature: string;
  description: string;
  suggestion: string;
}

export interface SuggestedOperation {
  name: string;
  machineId: string;
  cycleTimeHr: number;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
}

/** Per-field AI confidence score 0–1. Key = form field ID (e.g. "bm-wall", "imm-cav"). */
export type FieldConfidences = Record<string, number>;

/** Stage 1 fast commodity pre-selection (Haiku model output). */
export interface Stage1Selection {
  primary: string;
  conf: number;
  alt: Array<{ type: string; conf: number }>;
}

/** Cost range low/mid/high for a recommended process. */
export interface CostRange {
  low: number;
  mid: number;
  high: number;
  currency: string;
}

/** DFM (Design for Manufacture) issue raised by the specialist AI. */
export interface DFMIssue {
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  area: string;
  description: string;
  impact: string;
  fix: string;
}

export interface CADAnalysisResult {
  partName: string;
  geometry: CADGeometry;
  detectedFeatures: DetectedFeature[];
  materialAnalysis: {
    fromMetadata: boolean;
    primarySuggestion: { materialId: string; name: string; confidencePct: number; reasoning: string };
    alternatives: Array<{ materialId: string; name: string; confidencePct: number }>;
  };
  processRecommendations: ProcessRecommendation[];
  manufacturabilityScore: number;
  manufacturabilityRisks: ManufacturabilityRisk[];
  costInputSuggestions: {
    recommendedCommodity: string;
    netWeightKg: number;
    materialId: string;
    estimatedCycleTimeHr: number;
    estimatedSetupTimeHr: number;
    estimatedOperations: SuggestedOperation[];
    /** Machining-specific derived inputs. Rule-engine written; the model is not
     *  asked for these — they were the largest orphaned group in the A/B. */
    machining?: {
      stockWeightKg?: number;
      materialUtilization?: number;
      machineId?: string;
      setupCount?: number;
    };
    casting?: {
      subtype: 'hpdc' | 'sand' | 'gravity' | 'investment';
      dieMouldCostGBP: number;
      dieMouldLife: number;
      cavities: number;
      yieldFraction: number;
      cycleTimeHpdcSec: number;
      cycleTimeSandGravHr: number;
    };
    forging?: {
      flashKg: number;
      yieldFraction: number;
      dieCostGBP: number;
      dieLife: number;
      strokes: number;
      timePerBlowSec: number;
      /** Rule-engine written (parametric die + secondary adders). */
      projectedAreaCm2?: number;
      dieSteel?: string;
      dieImpressions?: number;
      heatingEnergyKwhPerKg?: number;
      heatTreatCostPerKg?: number;
      descaleCostPerKg?: number;
      ndtCostPerPart?: number;
      forgeId?: string;
    };
    sheetMetal?: {
      thicknessMm: number;
      blankLengthMm: number;
      blankWidthMm: number;
      dieCostGBP: number;
      dieLife: number;
      numOps: number;
      /** Rule-engine written strip layout + press speed. */
      shearStrengthMPa?: number;
      dieType?: string;
      pitchMm?: number;
      stripWidthMm?: number;
      strokesPerMin?: number;
    };
    /** Gear cutting — rule-engine owned; every value carries provenance. */
    gear?: {
      normalModuleMm?: number;
      teeth?: number;
      helixAngleDeg?: number;
      faceWidthMm?: number;
      internal?: boolean;
      qualityClass?: number;
      materialClass?: string;
      caseHardened?: boolean;
      blankCostPerPart?: number;
      blankPrepCycleSec?: number;
      batchSize?: number;
    };
    injectionMoulding?: {
      cavities: number;
      projectedAreaCm2: number;
      wallThicknessMm: number;
      mouldCostGBP: number;
      mouldLife: number;
      runnerWeightKg: number;
      /** Rule-engine written cycle chain + machine sizing. */
      fillTimeSec?: number;
      packTimeSec?: number;
      ejectTimeSec?: number;
      coolTimeFactorSPerMm2?: number;
      cavityPressureMPa?: number;
      machineId?: string;
      steelClass?: string;
    };
    blowMoulding?: {
      /** 'ebm' | 'ibm' | 'sbm' */
      subtype: string;
      wallThicknessMm: number;
      flashWeightKg: number;
      cavities: number;
      mouldCostGBP: number;
      mouldLife: number;
      blowTimeSec: number;
      openCloseSec: number;
      /** true for coextruded multi-layer barrier walls (fuel tanks, AdBlue ducts). */
      barrierMultilayer?: boolean;
    };
    thermoforming?: {
      /** 'vacuum' | 'pressure' | 'twin_sheet' */
      method: string;
      sheetWeightKg: number;
      partWeightKg: number;
      toolCostGBP: number;
      heatTimeSec: number;
      formTimeSec: number;
      trimTimeSec: number;
    };
    rotationalMoulding?: {
      numArms: number;
      partsPerArm: number;
      heatTimeSec: number;
      coolTimeSec: number;
      mouldCostGBP: number;
      mouldLife: number;
    };
    rubber?: {
      /** 'compression' | 'transfer' | 'injection' | 'extrusion' | 'calendering' | 'die_cut' */
      process: string;
      flashWeightKg: number;
      cavities: number;
      cycleTimeSec: number;
      mouldCostGBP: number;
      mouldLife: number;
    };
    composites?: {
      /** 'hand_layup' | 'prepreg_autoclave' | 'rtm' | 'infusion' | 'smc' | 'wet_layup' */
      process: string;
      fibreFraction: number;
      wasteFraction: number;
      areaCm2: number;
      plies: number;
      toolCostGBP: number;
      toolLife: number;
      cureTimeSec: number;
    };
    fieldConfidences?: FieldConfidences;
    dfmIssues?: DFMIssue[];
    costRange?: CostRange;
    stage1Selection?: Stage1Selection;
  };
  aiExplanation: string;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  analysisLimitations: string[];
}
