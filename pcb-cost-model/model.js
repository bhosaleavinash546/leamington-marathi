/* ============================================================================
 * model.js — 360° PCB should-cost engine (all PCB types) — 2026 edition v2.
 *
 * Pure functions. Bottom-up, process-routed cost build with layer count and
 * stack-up as primary drivers.
 *
 * v2 (review fixes + upgrades):
 *  - Panel utilisation now enters the cost math (waste factor, normalized at
 *    the 80% calibration reference) — material & panel-area processing scale
 *    with real panel share.  [review B1]
 *  - Lot-size curve: prototype quantities cost 3–5× volume pricing, decaying
 *    to 1.0 by ~3k boards.
 *  - Quality scrap allowance and finish setup are now consumed (were dead
 *    parameters).  [review B6]
 *  - Region material factor (NA/EU pay more for laminate) + expanded regions.
 *  - Config validation: contradictory stack-ups are flagged HIGH in DfC.  [B2]
 *  - Landed cost: duty lane + freight → landed $/board.
 *  - Optional PCBA assembly module (SMT/THT placements, BOM, stencil NRE).
 *  - Monte Carlo uncertainty (P10/P50/P90) via mcSimulate().
 * ==========================================================================*/

const byId = (arr, id) => arr.find((x) => x.id === id) || arr[0];
const clampN = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* Calibration reference for panel utilisation: all $/dm² coefficients were
 * calibrated against quotes that already embed ~80% utilisation waste, so the
 * waste factor is normalized to 1.0 at 80%. */
const UTIL_REF = 0.80;

/* Lamination cycles — central stack-up driver. */
function laminationCycles(p, type, via) {
  if (p.layerCount <= 2) return type.id === "flex" ? 1 : 0;
  let cycles = 1;
  cycles += via.lamExtra;
  if (type.id === "anylayer") cycles += 1;
  if (type.id === "rigidflex") cycles += 2;
  if (type.id === "flex" && p.layerCount > 2) cycles += 1;
  if (p.layerCount >= 14) cycles += 1;
  return cycles;
}

function boardsPerPanel(p) {
  const panelArea = (p.panelW * p.panelH) / 10000;
  const boardArea = (p.boardW * p.boardH) / 10000;
  if (boardArea <= 0) return 1;
  return Math.max(1, Math.floor((panelArea / boardArea) * (p.utilization / 100)));
}

/* Gold-price-adjusted surface-finish cost per dm². */
function finishCostDm2(finish, goldPrice) {
  const g = clampN((goldPrice || GOLD_REF) / GOLD_REF, 0.3, 4);
  return finish.costDm2 * ((1 - finish.goldFrac) + finish.goldFrac * g);
}

/* Lot-size multiplier on material+processing (fab quote behaviour). */
function lotFactor(qty) {
  return 1 + LOT_AMPL * Math.exp(-Math.max(1, qty) / LOT_TAU);
}

/* Config validation — contradictory stack-ups a fab would bounce. [B2] */
function validateConfig(p, type, mat, via, proc, trace, cuIn, cuOut) {
  const issues = [];
  if ((type.id === "hdi" || type.id === "anylayer") && !via.microvia)
    issues.push(`CONFIG: ${type.label} requires microvia technology, but "${via.label}" is selected. The build as configured is not manufacturable — select an HDI via structure (1+N+1 / 2+N+2 / any-layer).`);
  if ((type.id === "flex" || type.id === "rigidflex") && mat.family !== "flex")
    issues.push(`CONFIG: ${type.label} needs a flex-family base material (polyimide / LCP), but "${mat.label}" is selected. Costing is unreliable until the material matches the build.`);
  if (via.microvia && (type.id === "rigid" || type.id === "power"))
    issues.push(`CONFIG: microvias are selected on the "${type.label}" board type — switch the type to HDI / any-layer so routing, complexity and yield reflect the actual build.`);
  if (p.layerCount <= 2 && via.lamExtra > 0)
    issues.push(`CONFIG: a ${p.layerCount}-layer board cannot have buried/blind or build-up vias — there is no inner stack to bury them in.`);
  return issues;
}

function computePcb(input) {
  const p = { ...input };
  const type = byId(PCB_TYPES, p.pcbType);
  const mat = byId(MATERIALS, p.material);
  const cuIn = byId(COPPER_WEIGHTS, p.copperInner);
  const cuOut = byId(COPPER_WEIGHTS, p.copperOuter);
  const foil = byId(COPPER_FOILS, p.copperFoil || "hte");
  const proc = byId(FAB_PROCESSES, p.fabProcess || "subtractive");
  const trace = byId(TRACE_CLASSES, p.trace);
  const via = byId(VIA_TYPES, p.via);
  const finish = byId(FINISHES, p.finish);
  const maskColor = byId(MASK_COLORS, p.maskColor);
  const quality = byId(QUALITY_LEVELS, p.quality);
  const region = byId(REGIONS, p.region);
  const surcharge = 1 + (p.marketSurcharge || 0) / 100;
  const mc = p._mc || {};                       // Monte Carlo perturbation hooks

  const area = (p.boardW * p.boardH) / 10000;   // dm² per board
  const L = Math.max(1, p.layerCount);
  const innerLayers = Math.max(0, L - 2);
  const bpp = boardsPerPanel(p);
  const lamCycles = laminationCycles(p, type, via);
  const cuMult = (2 * cuOut.mult + innerLayers * cuIn.mult) / L;

  // Panel-waste factor: the board pays for its share of the panel including
  // unusable area. Normalized so utilisation = 80% reproduces calibration. [B1]
  const waste = UTIL_REF / clampN((p.utilization || 80) / 100, 0.2, 0.95);
  // Lot-size multiplier (prototype premium → volume pricing).
  const lot = lotFactor(p.orderQty);

  // ---------------- MATERIAL ----------------
  let material = area * mat.costDm2PerLayer * L * cuMult * COEFF.materialCal;
  material += area * L * foil.addDm2;
  if (type.id === "flex" || type.id === "rigidflex") material += area * COEFF.coverlayDm2;
  if (type.id === "rigidflex") material += area * COEFF.stiffenerDm2;
  const heavyOz = Math.max(0, Math.max(cuIn.oz, cuOut.oz) - 1);
  if (heavyOz > 0) material += area * COEFF.heavyCopperDm2 * heavyOz;
  // waste share, scrap allowance [B6], regional material premium, 2026 surcharge, lot curve
  material *= waste * (1 + quality.scrap) * (region.matFactor || 1) * surcharge * lot;
  material *= (mc.m || 1);

  // ---------------- PROCESSING (per board, pre-region) ----------------
  const fine = trace.fineMult * proc.imageMult;
  const imaging   = area * L * COEFF.imagePerLayerDm2 * fine;
  const etch      = area * L * COEFF.etchPerLayerDm2 * (1 + 0.15 * heavyOz);
  const aoi       = area * L * COEFF.aoiPerLayerDm2;
  const lamination = area * lamCycles * COEFF.lamPerCycleDm2;

  const aspect = clampN(p.boardThickness / 0.2, 1, 20);
  const aspectMult = 1 + 0.05 * Math.max(0, aspect - 6);
  const holeCount = (p.holeDensity || COEFF.holeDensity) * area;
  const drilling  = holeCount * COEFF.costPerHole * aspectMult * (L > 2 ? 1.1 : 1.0);

  let laserDrill = 0;
  if (via.microvia) laserDrill = COEFF.microviaDensity * area * via.buildup * COEFF.costPerMicrovia;

  const backdrill = p.backdrill ? holeCount * COEFF.backdrillFrac * COEFF.costPerBackdrill : 0;
  const viafill   = (p.viafill && via.microvia) ? area * COEFF.viafillDm2 * via.buildup : 0;
  const msapAdder = proc.id !== "subtractive" ? area * L * COEFF.msapAdderDm2 : 0;

  const desmearPth = area * COEFF.desmearPthDm2 * (L > 2 ? 1.0 : 0.6) * (mat.family === "rf" ? 1.5 : 1.0);
  const plating    = area * COEFF.platingDm2 * (0.6 + 0.4 * L / 4) * aspectMult * cuMult;
  const solderMask = area * COEFF.maskDm2 * 2 + area * maskColor.add;
  const surfaceFin = area * finishCostDm2(finish, (p.goldPrice || GOLD_REF) * (mc.g || 1));
  const silkscreen = p.silkscreen ? area * COEFF.silkDm2 * 2 : 0;
  const profiling  = area * COEFF.profilingDm2 * (type.id === "rigidflex" ? 1.6 : 1.0);
  const impedance  = p.impedance ? area * COEFF.impedanceDm2 : 0;

  const rfMult = mat.family === "rf" ? 1.35 : mat.family === "ll" ? 1.10 : 1.0;
  // Panel-area steps carry the waste factor; per-hole steps do not (holes are
  // drilled only where the boards are).
  const areaSteps = imaging + etch + aoi + lamination + viafill + msapAdder + desmearPth +
                    plating + solderMask + surfaceFin + silkscreen + profiling + impedance;
  const holeSteps = drilling + laserDrill + backdrill;
  const pBase = type.complexity * rfMult * region.labor * surcharge * lot * (COEFF.procCal || 1);
  let processing = (areaSteps * waste + holeSteps) * pBase;
  processing *= (mc.pr || 1);

  // ---------------- TEST & INSPECTION ----------------
  const eTest = p.orderQty < 2000
    ? COEFF.flyingProbeRate * (1 + 0.05 * L)
    : area * COEFF.fixtureTestDm2 * (1 + 0.04 * L);
  let inspection = area * quality.inspect + (quality.microsection ? 0.05 * area : 0);
  if (quality.axi && (via.microvia || L >= 8)) inspection += area * COEFF.axiDm2;
  if (quality.microsection) inspection += COEFF.istCoupon * area;
  let testInspect = (eTest + inspection) * quality.testMult * region.labor;
  testInspect *= (mc.t || 1);

  // ---------------- TOOLING / NRE (amortised over orderQty) ----------------
  let nre = COEFF.nrePhotoTools + COEFF.nreDrillProgram + finish.setup;   // [B6] finish setup
  if (p.orderQty >= 2000) nre += COEFF.nreTestFixture;
  if (via.microvia) nre += COEFF.nreLaserProgram;
  if (p.backdrill) nre += COEFF.nreBackdrill;
  if (p.impedance) nre += COEFF.impedanceCoupon;
  nre *= quality.nreMult;
  const nrePerBoard = nre / Math.max(1, p.orderQty);

  // ---------------- YIELD ----------------
  const layerYld = Math.pow(0.992, Math.max(0, L - 2));
  let yld = clampN(quality.yld * trace.yld * proc.yld * layerYld *
            (type.id === "rigidflex" ? 0.95 : type.id === "anylayer" ? 0.94 : type.id === "hdi" ? 0.96 : 1.0),
            0.5, 0.999);
  yld = clampN(yld + (mc.y || 0), 0.5, 0.999);

  const mfgGood = (material + processing + testInspect) / yld;

  // ---------------- OVERHEAD & MARGIN ----------------
  const overhead = (p.overheadPct / 100) * mfgGood * region.overhead;
  const totalCost = mfgGood + nrePerBoard + overhead;
  const margin = p.marginPct != null ? p.marginPct / 100 : quality.margin;
  const price = totalCost / (1 - clampN(margin, 0, 0.9));

  // ---------------- PCBA ASSEMBLY (optional module) ----------------
  let assembly = null, pcbaCost = null, pcbaPrice = null;
  if (p.assemblyOn) {
    const smt = (p.smtCount || 0) * ASSEMBLY.smtPerPlacement * region.labor;
    const tht = (p.thtCount || 0) * ASSEMBLY.thtPerJoint * region.labor;
    const sideAdd = (p.sides || 1) >= 2 ? ASSEMBLY.sideChangeover * region.labor : 0;
    const aoiSpi = ASSEMBLY.aoiSpiPerBoard * region.labor;
    const fct = ((p.smtCount || 0) + (p.thtCount || 0)) / 100 * ASSEMBLY.testPerComp100 * region.labor;
    const assyNre = (ASSEMBLY.nreProgramming + ASSEMBLY.nreStencil * (p.sides || 1)) / Math.max(1, p.orderQty);
    const assyProc = (smt + tht + sideAdd + aoiSpi + fct) / ASSEMBLY.assyYield;
    assembly = { smt, tht, sideAdd, aoiSpi, fct, assyNre, assyProc, bom: p.bomCost || 0 };
    pcbaCost = totalCost + (p.bomCost || 0) + assyProc + assyNre;
    pcbaPrice = pcbaCost / (1 - clampN(margin, 0, 0.9));
  }

  // ---------------- LANDED COST (optional) ----------------
  const priceBasis = pcbaPrice != null ? pcbaPrice : price;
  const dutyPct = p.dutyPct || 0;
  const freight = p.freightPerBoard || 0;
  const landed = (p.destMarket && p.destMarket !== "domestic") || dutyPct > 0 || freight > 0
    ? { duty: priceBasis * dutyPct / 100, freight, total: priceBasis * (1 + dutyPct / 100) + freight }
    : null;

  // ---------------- CATEGORY BREAKDOWN (sums to totalCost) ----------------
  const yScale = mfgGood / Math.max(1e-9, material + processing + testInspect);
  const pmA = pBase * waste * (mc.pr || 1);   // area-step multiplier
  const pmH = pBase * (mc.pr || 1);           // per-hole multiplier
  const components = [
    { key: "material",  label: "Material (laminate, copper, prepreg)", value: material * yScale,   color: "#00e5ff" },
    { key: "imaging",   label: "Imaging + etch + AOI",                 value: (imaging + etch + aoi) * pmA * yScale, color: "#3a8bff" },
    { key: "lamination",label: "Lamination (" + lamCycles + " cycle" + (lamCycles===1?"":"s") + ")", value: lamination * pmA * yScale, color: "#a06bff" },
    { key: "drilling",  label: "Drilling + laser µvia + back-drill",   value: holeSteps * pmH * yScale, color: "#ff2bd6" },
    { key: "plating",   label: "Desmear / PTH / plating / via-fill",   value: (desmearPth + plating + viafill + msapAdder) * pmA * yScale, color: "#6cff3f" },
    { key: "finish",    label: "Solder mask / finish / silk",          value: (solderMask + surfaceFin + silkscreen + profiling + impedance) * pmA * yScale, color: "#ffcf33" },
    { key: "test",      label: "Test + inspection (AOI/AXI/e-test)",   value: testInspect * yScale,  color: "#ff7a3d" },
    { key: "nre",       label: "Tooling / NRE (amortised)",            value: nrePerBoard,           color: "#ff3b6b" },
    { key: "overhead",  label: "Overhead",                             value: overhead,              color: "#8b95bf" },
  ];

  const routing = buildRouting(p, type, via, L, proc);
  const benchmark = benchmarkBand(p, type, L, area, quality, finish, mat, p.impedance, region, Math.max(cuIn.oz, cuOut.oz));
  const configIssues = validateConfig(p, type, mat, via, proc, trace, cuIn, cuOut);
  const dfc = dfcRecommendations(p, { type, mat, via, trace, finish, quality, proc, L, area, bpp, aspect, yld, lamCycles, cuIn, cuOut }, configIssues);

  return {
    p, type, mat, via, trace, finish, quality, region, proc, foil,
    area, L, innerLayers, bpp, lamCycles, aspect, cuMult, holeCount,
    waste, lot,
    material, processing, testInspect, surfaceFin,
    nre, nrePerBoard, yld, mfgGood, overhead, totalCost, price, margin,
    assembly, pcbaCost, pcbaPrice, landed,
    components, routing, benchmark, dfc, configIssues,
    process: { imaging, etch, aoi, lamination, drilling, laserDrill, backdrill, viafill, msapAdder, desmearPth, plating, solderMask, surfaceFin, silkscreen, profiling, impedance },
  };
}

/* ---------------- Monte Carlo uncertainty ----------------
 * Perturbs the major cost blocks by their calibration sigmas and returns the
 * resulting distribution of total cost (and landed/pcba where active). */
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function mcSimulate(input, n = 400) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const mc = {
      m: Math.max(0.5, 1 + randn() * MC_SIGMA.material),
      pr: Math.max(0.5, 1 + randn() * MC_SIGMA.processing),
      t: Math.max(0.5, 1 + randn() * MC_SIGMA.test),
      g: Math.max(0.5, 1 + randn() * MC_SIGMA.gold),
      y: randn() * MC_SIGMA.yldAbs,
    };
    samples.push(computePcb({ ...input, _mc: mc }).totalCost);
  }
  samples.sort((a, b) => a - b);
  const q = (f) => samples[Math.min(n - 1, Math.max(0, Math.round(f * (n - 1))))];
  return { p10: q(0.10), p50: q(0.50), p90: q(0.90), n };
}

/* Process routing per board type. */
function buildRouting(p, type, via, L, proc) {
  const ml = L > 2;
  const steps = [];
  const add = (name, machine, on = true) => { if (on) steps.push({ name, machine }); };
  add("Material cut / core prep", "Shearing / CNC");
  add("Inner-layer imaging", proc.id === "subtractive" ? "LDI / DI exposure" : "mSAP/SAP patterning", ml);
  add("Inner-layer develop-etch-strip (DES)", "Wet etch line", ml && proc.id === "subtractive");
  add("Inner-layer pattern plate (semi-additive)", "VCP plating line", ml && proc.id !== "subtractive");
  add("Inner-layer AOI", "Automated optical inspection", ml);
  add("Oxide / bonding treatment", "Brown/black oxide", ml);
  add("Lay-up & lamination", "Vacuum press", ml || type.id === "flex" || type.id === "rigidflex");
  add("Mechanical drilling", "CNC drill");
  add("Laser microvia drilling", "UV/CO₂ laser", via.microvia);
  add("Desmear + electroless copper (PTH)", mp_rf(p) ? "Plasma desmear + e-less" : "Desmear + e-less line");
  add("Electroplating (VCP / pulse)", "Cu plating line");
  add("Via fill + planarise", "Resin/Cu fill + grind", p.viafill && via.microvia);
  add("Outer-layer imaging", proc.id === "subtractive" ? "LDI / DI exposure" : "mSAP/SAP patterning");
  add("Outer DES / pattern plate / strip-etch", "Wet process line");
  add("Outer AOI", "Automated optical inspection");
  add("Coverlay lamination", "Vacuum press", type.id === "flex" || type.id === "rigidflex");
  add("Solder mask apply / expose / develop", "LPI mask line");
  add("Surface finish", finishMachine(p.finish));
  add("Silkscreen / legend", "Inkjet / screen legend", p.silkscreen);
  add("Stiffener bonding", "Lamination / bonding", type.id === "rigidflex");
  add("Back-drill (controlled depth)", "CDD back-drill", p.backdrill);
  add("Profiling / routing / depanel", type.id === "rigidflex" || type.id === "flex" ? "Laser depanel" : "CNC route");
  add("Electrical test", p.orderQty < 2000 ? "Flying probe" : "Fixture / ICT e-test");
  add("Impedance / TDR test", "TDR + coupon", p.impedance);
  add("AXI (X-ray) buried-joint inspection", "3D AXI", byId(QUALITY_LEVELS, p.quality).axi && (via.microvia || L >= 8));
  add("Microsection / IST / CAF reliability", "Cross-section + lab", byId(QUALITY_LEVELS, p.quality).microsection);
  add("Final inspection + packaging", "FQC / vacuum pack");
  if (p.assemblyOn) {
    add("Solder-paste print + SPI", "Stencil printer + SPI");
    add("SMT placement", "Pick & place line");
    add("Reflow" + ((p.sides || 1) >= 2 ? " (×2 sides)" : ""), "Reflow oven");
    add("THT insertion + wave/selective", "Wave / selective solder", (p.thtCount || 0) > 0);
    add("Assembly AOI + functional test", "3D AOI + FCT");
  }
  return steps;
}
function mp_rf(p) { return byId(MATERIALS, p.material).family === "rf"; }
function finishMachine(id) {
  if (id === "hasl" || id === "lfhasl") return "HASL line";
  if (id === "osp") return "OSP line";
  if (id === "imag" || id === "isn") return "Immersion line";
  return "Chemical plating line (Ni/Pd/Au)";
}

/* Benchmark market-PRICE band ($/board) — independent of the cost engine.
 * Includes the lot-size effect so proto-quantity comparisons stay fair. */
function benchmarkBand(p, type, L, area, quality, finish, mat, impedance, region, maxOz) {
  let perDm2;
  if (L <= 2) perDm2 = 1.6;
  else if (L <= 4) perDm2 = 2.9;
  else if (L <= 6) perDm2 = 4.4;
  else if (L <= 8) perDm2 = 6.5;
  else if (L <= 10) perDm2 = 9.5;
  else if (L <= 12) perDm2 = 13;
  else if (L <= 16) perDm2 = 20;
  else perDm2 = 30;
  const typeMult = { rigid: 1, highspeed: 1.5, power: 1.3, hdi: 2.0, anylayer: 3.0, flex: 2.2, rigidflex: 3.2 }[type.id] || 1;
  const qualMult = { consumer: 1.0, industrial: 1.15, automotive: 1.5, aerospace: 2.2 }[quality.id] || 1;
  const finishMult = 1 + (finish.costDm2 - 0.10) * 0.5;
  const matMult = mat.family === "rf" ? 2.6 : mat.family === "ll" ? 1.4 : mat.family === "flex" ? 1.4
                : mat.family === "mc" ? 1.8 : (mat.id === "fr4_hightg" ? 1.1 : 1.0);
  const cuMult = maxOz >= 3 ? (1 + 0.15 * (maxOz - 1)) : 1.0;
  const regionMult = 1 + ((region ? region.labor : 1) - 1) * 0.45;
  const impMult = impedance ? 1.1 : 1.0;
  const mid = perDm2 * typeMult * qualMult * finishMult * matMult * cuMult * regionMult * impMult * area * lotFactor(p.orderQty);
  return { lo: mid * 0.65, mid, hi: mid * 1.6 };
}

/* DfC (Design-for-Cost) recommendations. Config-validation issues rank first. */
function dfcRecommendations(p, c, configIssues) {
  const recs = [];
  const push = (sev, text) => recs.push({ sev, text });
  (configIssues || []).forEach((t) => push("high", t));

  if (p.layerCount % 2 !== 0 && p.layerCount > 1)
    push("high", `Layer count ${p.layerCount} is odd — multilayer stack-ups are built in balanced pairs. Move to ${p.layerCount + 1} layers for a symmetric, warp-free stack-up at little extra cost.`);
  if (c.L >= 8 && p.via === "through")
    push("med", `An ${c.L}-layer through-via board wastes routing channels and forces large drilled holes. Evaluate buried/blind vias, back-drilling, or HDI to reduce layer count.`);
  if (c.via.microvia && c.via.buildup >= 2 && p.trace !== "1mil" && p.trace !== "2mil")
    push("low", "Stacked microvia (2+ build-up) costs ~30–50% more than staggered. Confirm escape routing genuinely needs it; staggered microvias yield better and cost less.");
  if (c.mat.family === "rf" && p.layerCount > 2)
    push("high", `Full-board ${c.mat.label} is expensive (PTFE laminate is 10–20× FR-4). Use a HYBRID stack-up: RF material only on the layers carrying high-frequency nets, FR-4 High-Tg elsewhere — typically 40–60% material saving.`);
  if (c.mat.family === "ll" && p.copperFoil === "hte")
    push("med", "Low-loss laminate with standard HTE foil undermines the loss budget at ≥28 Gbps. Pair low-loss dielectric with VLP/HVLP foil (or you're paying for dielectric you can't use).");
  if (c.finish.goldFrac >= 0.5 && p.quality !== "aerospace")
    push("med", `Gold finish (${c.finish.label}) is heavily exposed to 2026 gold prices (~70% of ENIG cost is gold). Where assembly allows, OSP/immersion silver eliminate gold exposure; ENEPIG's thinner gold partly hedges vs ENIG.`);
  if (c.aspect > 10)
    push("high", `Aspect ratio ≈ ${c.aspect.toFixed(1)}:1 stresses through-hole plating reliability and yield. Reduce board thickness or increase minimum drill, or split into sub-laminations.`);
  if ((p.trace === "2mil" || p.trace === "1mil") && p.fabProcess === "subtractive")
    push("high", "Sub-2-mil lines are below the subtractive-etch floor (~2 mil, undercut-limited). This needs mSAP/SAP — the model's yield/cost won't be realistic on subtractive. Switch process or relax the geometry.");
  if (p.fabProcess !== "subtractive" && !["1mil", "2mil"].includes(p.trace))
    push("low", "mSAP/SAP carries a ~40–50% premium over conventional imaging. It's only justified below ~3 mil — for wider geometry, subtractive etch is cheaper.");
  if (c.bpp <= 1)
    push("high", `Only ${c.bpp} board fits the working panel — utilisation is poor. Re-pitch the array or pick a panel size that fits more up.`);
  else if (p.utilization < 70)
    push("med", `Panel utilisation ${p.utilization}% is low — you are paying for ${(UTIL_REF / (p.utilization / 100) * 100 - 100).toFixed(0)}% more panel share than the 80% reference. Improving nesting toward 80–85% directly lowers $/board.`);
  if (Math.max(c.cuIn.oz, c.cuOut.oz) >= 3 && p.pcbType !== "power")
    push("low", "Heavy copper (≥3 oz) adds 40–70% and needs etch compensation. If only a few nets carry high current, use stepped/mixed copper (saves 20–30% vs full-build heavy copper).");
  if (p.orderQty < 500)
    push("med", `Order qty ${p.orderQty} is deep in the prototype-pricing zone (~${lotFactor(p.orderQty).toFixed(1)}× volume pricing). Consolidating releases or panel-sharing moves you down the lot-size curve fast.`);
  else if (p.orderQty < 2000)
    push("low", `Order qty ${p.orderQty} is below the ~500–1000 ICT break-even; flying-probe test and un-amortised tooling dominate. Consolidating volume cuts NRE per board.`);
  if (recs.length === 0) push("ok", "No major cost red-flags. Design is broadly cost-balanced for its class.");
  return recs;
}

/* One-at-a-time ±pct sensitivity of total cost. */
function pcbSensitivity(input, pct = 15) {
  const base = computePcb(input).totalCost;
  const drivers = [
    { key: "layerCount",  label: "Layer count" },
    { key: "boardW",      label: "Board size (W)" },
    { key: "orderQty",    label: "Order quantity" },
    { key: "utilization", label: "Panel utilisation" },
    { key: "holeDensity", label: "Hole density" },
    { key: "goldPrice",   label: "Gold price" },
    { key: "overheadPct", label: "Overhead %" },
    { key: "marketSurcharge", label: "Market surcharge" },
  ];
  return drivers.map((d) => {
    const up = computePcb({ ...input, [d.key]: input[d.key] * (1 + pct / 100) }).totalCost;
    const dn = computePcb({ ...input, [d.key]: input[d.key] * (1 - pct / 100) }).totalCost;
    const swing = Math.max(Math.abs(up - base), Math.abs(dn - base)) / base * 100;
    return { label: d.label, swing };
  }).sort((a, b) => b.swing - a.swing);
}
