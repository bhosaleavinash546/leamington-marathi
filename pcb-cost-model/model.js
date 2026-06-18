/* ============================================================================
 * model.js — 360° PCB should-cost engine (all PCB types).
 *
 * Pure functions. Bottom-up, process-routed cost build with layer count and
 * stack-up as primary drivers. Returns a rich result object with per-process
 * costs, a category cost breakdown, yield, routing, benchmark check, and DfC
 * (design-for-cost) recommendations.
 * ==========================================================================*/

const byId = (arr, id) => arr.find((x) => x.id === id) || arr[0];
const clampN = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* Lamination cycles — central stack-up driver.
 * Standard multilayer presses all cores at once = 1 cycle. Buried vias and HDI
 * build-up require SEQUENTIAL lamination, each adding a press cycle. Rigid-flex
 * adds bonding cycles. More layers beyond ~12 add an extra sub-lamination. */
function laminationCycles(p, type, via) {
  if (p.layerCount <= 2) return type.id === "flex" ? 1 : 0; // 2-layer: no inner lam (flex: 1 bond)
  let cycles = 1;                                  // base multilayer press
  cycles += via.lamExtra;                          // buried/blind + HDI build-up
  if (type.id === "rigidflex") cycles += 2;        // flex bonding + coverlay press
  if (type.id === "flex" && p.layerCount > 2) cycles += 1;
  if (p.layerCount >= 14) cycles += 1;             // very high layer sub-lam
  return cycles;
}

/* Boards per working panel from panel size, board size and utilisation. */
function boardsPerPanel(p) {
  const panelArea = (p.panelW * p.panelH) / 10000; // dm²
  const boardArea = (p.boardW * p.boardH) / 10000; // dm²
  if (boardArea <= 0) return 1;
  return Math.max(1, Math.floor((panelArea / boardArea) * (p.utilization / 100)));
}

function computePcb(input) {
  const p = { ...input };
  const type = byId(PCB_TYPES, p.pcbType);
  const mat = byId(MATERIALS, p.material);
  const cuIn = byId(COPPER_WEIGHTS, p.copperInner);
  const cuOut = byId(COPPER_WEIGHTS, p.copperOuter);
  const trace = byId(TRACE_CLASSES, p.trace);
  const via = byId(VIA_TYPES, p.via);
  const finish = byId(FINISHES, p.finish);
  const maskColor = byId(MASK_COLORS, p.maskColor);
  const quality = byId(QUALITY_LEVELS, p.quality);
  const region = byId(REGIONS, p.region);

  const area = (p.boardW * p.boardH) / 10000;            // dm² per board
  const L = Math.max(1, p.layerCount);
  const innerLayers = Math.max(0, L - 2);
  const bpp = boardsPerPanel(p);
  const lamCycles = laminationCycles(p, type, via);

  // Blended copper multiplier (outer 2 layers + inner layers)
  const cuMult = (2 * cuOut.mult + innerLayers * cuIn.mult) / L;

  // ---------------- MATERIAL ----------------
  let material = area * mat.costDm2PerLayer * L * cuMult * COEFF.materialCal;
  // flex / rigid-flex coverlay + stiffener
  if (type.id === "flex" || type.id === "rigidflex") material += area * COEFF.coverlayDm2;
  if (type.id === "rigidflex") material += area * COEFF.stiffenerDm2;
  // heavy copper material/etch compensation
  const heavyOz = Math.max(0, Math.max(cuIn.oz, cuOut.oz) - 1);
  if (heavyOz > 0) material += area * COEFF.heavyCopperDm2 * heavyOz;

  // ---------------- PROCESSING (per board, pre-region) ----------------
  const fine = trace.fineMult;
  const imaging   = area * L * COEFF.imagePerLayerDm2 * fine;
  const etch      = area * L * COEFF.etchPerLayerDm2 * (1 + 0.15 * heavyOz);
  const aoi       = area * L * COEFF.aoiPerLayerDm2;
  const lamination = area * lamCycles * COEFF.lamPerCycleDm2;

  // Drilling — aspect-ratio sensitive (thickness / min hole). Higher AR => slower, lower yield.
  const aspect = clampN(p.boardThickness / 0.2, 1, 20);
  const aspectMult = 1 + 0.05 * Math.max(0, aspect - 6);
  const holeCount = (p.holeDensity || COEFF.holeDensity) * area;
  const drilling  = holeCount * COEFF.costPerHole * aspectMult * (L > 2 ? 1.1 : 1.0);

  // Laser microvias (HDI)
  let laserDrill = 0;
  if (via.microvia) laserDrill = COEFF.microviaDensity * area * via.buildup * COEFF.costPerMicrovia;

  const desmearPth = area * COEFF.desmearPthDm2 * (L > 2 ? 1.0 : 0.6);
  const plating    = area * COEFF.platingDm2 * (0.6 + 0.4 * L / 4) * aspectMult * cuMult;
  const solderMask = area * COEFF.maskDm2 * 2 + area * maskColor.add;
  const surfaceFin = area * finish.costDm2;
  const silkscreen = p.silkscreen ? area * COEFF.silkDm2 * 2 : 0;
  const profiling  = area * COEFF.profilingDm2 * (type.id === "rigidflex" ? 1.6 : 1.0);
  const impedance  = p.impedance ? area * COEFF.impedanceDm2 : 0;

  const rfMult = mat.family === "rf" ? 1.25 : 1.0; // RF lamination/handling premium
  let processing = (imaging + etch + aoi + lamination + drilling + laserDrill +
                    desmearPth + plating + solderMask + silkscreen + profiling + impedance)
                    * type.complexity * rfMult;
  processing *= region.labor;                       // regional labour

  // ---------------- TEST & INSPECTION ----------------
  // Low volume → flying probe per board; high volume → fixtured e-test (cheap/board, fixture NRE separate)
  const eTest = p.orderQty < 5000
    ? COEFF.flyingProbeRate * (1 + 0.04 * L)
    : area * COEFF.fixtureTestDm2 * (1 + 0.04 * L);
  const inspection = area * quality.inspect + (quality.microsection ? 0.05 * area : 0);
  let testInspect = (eTest + inspection) * quality.testMult * region.labor;

  // ---------------- TOOLING / NRE (one-time, amortised over orderQty) ----------------
  let nre = COEFF.nrePhotoTools + COEFF.nreDrillProgram;
  if (p.orderQty >= 5000) nre += COEFF.nreTestFixture;          // fixtured test
  if (via.microvia) nre += COEFF.nreLaserProgram;
  if (p.impedance) nre += COEFF.impedanceCoupon;
  nre *= quality.nreMult;
  const nrePerBoard = nre / Math.max(1, p.orderQty);

  // ---------------- YIELD ----------------
  // Layer derate (each layer pair compounds), fine-line, type, quality class.
  const layerYld = Math.pow(0.992, Math.max(0, L - 2));
  const yld = clampN(quality.yld * trace.yld * layerYld *
              (type.id === "rigidflex" ? 0.95 : type.id === "hdi" ? 0.96 : 1.0), 0.5, 0.999);

  // Manufacturing cost carried by good boards (material + processing + finish material + test)
  const directCost = material + processing + surfaceFin * 0 + testInspect; // surfaceFin already in processing
  // NOTE: surfaceFin folded into processing above; keep separate var for breakdown only.
  const mfgGood = (material + processing + testInspect) / yld;

  // ---------------- OVERHEAD & MARGIN ----------------
  const overhead = (p.overheadPct / 100) * mfgGood * region.overhead;
  const totalCost = mfgGood + nrePerBoard + overhead;
  const margin = p.marginPct != null ? p.marginPct / 100 : quality.margin;
  const price = totalCost / (1 - clampN(margin, 0, 0.9));

  // ---------------- CATEGORY BREAKDOWN (sums to totalCost) ----------------
  // Scale the per-process figures by the yield uplift so categories reconcile.
  const yScale = mfgGood / Math.max(1e-9, material + processing + testInspect);
  const components = [
    { key: "material",  label: "Material (laminate, copper, prepreg)", value: material * yScale,   color: "#2563eb" },
    { key: "imaging",   label: "Imaging + etch + AOI",                 value: (imaging + etch + aoi) * type.complexity * region.labor * yScale, color: "#0891b2" },
    { key: "lamination",label: "Lamination (" + lamCycles + " cycle" + (lamCycles===1?"":"s") + ")", value: lamination * type.complexity * region.labor * yScale, color: "#7c3aed" },
    { key: "drilling",  label: "Drilling + laser microvia",           value: (drilling + laserDrill) * type.complexity * region.labor * yScale, color: "#0d9488" },
    { key: "plating",   label: "Desmear / PTH / plating",             value: (desmearPth + plating) * type.complexity * region.labor * yScale, color: "#059669" },
    { key: "finish",    label: "Solder mask / finish / silk",         value: (solderMask + surfaceFin + silkscreen + profiling + impedance) * type.complexity * region.labor * yScale, color: "#65a30d" },
    { key: "test",      label: "Test + inspection",                   value: testInspect * yScale,  color: "#ca8a04" },
    { key: "nre",       label: "Tooling / NRE (amortised)",           value: nrePerBoard,           color: "#dc2626" },
    { key: "overhead",  label: "Overhead",                            value: overhead,              color: "#9333ea" },
  ];

  // ---------------- ROUTING (process steps actually used) ----------------
  const routing = buildRouting(p, type, via, L);

  // ---------------- BENCHMARK CHECK ----------------
  const benchmark = benchmarkBand(p, type, L, area, quality, finish, mat, p.impedance);

  // ---------------- DfC RECOMMENDATIONS + AI INSIGHTS ----------------
  const dfc = dfcRecommendations(p, { type, mat, via, trace, finish, quality, L, area, bpp, aspect, yld, lamCycles, cuIn, cuOut });

  return {
    p, type, mat, via, trace, finish, quality, region,
    area, L, innerLayers, bpp, lamCycles, aspect, cuMult, holeCount,
    material, processing, testInspect, surfaceFin,
    nre, nrePerBoard, yld, mfgGood, overhead, totalCost, price, margin,
    components, routing, benchmark, dfc,
    process: { imaging, etch, aoi, lamination, drilling, laserDrill, desmearPth, plating, solderMask, surfaceFin, silkscreen, profiling, impedance },
  };
}

/* Process routing per board type. Returns ordered steps with machine + flag. */
function buildRouting(p, type, via, L) {
  const ml = L > 2;
  const steps = [];
  const add = (name, machine, on = true) => { if (on) steps.push({ name, machine }); };
  add("Material cut / core prep", "Shearing / CNC");
  add("Inner-layer imaging", "LDI / DI exposure", ml);
  add("Inner-layer develop-etch-strip (DES)", "Wet etch line", ml);
  add("Inner-layer AOI", "Automated optical inspection", ml);
  add("Oxide / bonding treatment", "Brown/black oxide", ml);
  add("Lay-up & lamination", "Vacuum press", ml || type.id === "flex" || type.id === "rigidflex");
  add("Mechanical drilling", "CNC drill");
  add("Laser microvia drilling", "UV/CO₂ laser", via.microvia);
  add("Desmear + electroless copper (PTH)", "Desmear + e-less line");
  add("Electroplating (panel/pattern)", "Cu plating line");
  add("Outer-layer imaging", "LDI / DI exposure");
  add("Outer DES / pattern plate / strip-etch", "Wet process line");
  add("Outer AOI", "Automated optical inspection");
  add("Coverlay lamination", "Vacuum press", type.id === "flex" || type.id === "rigidflex");
  add("Solder mask apply / expose / develop", "LPI mask line");
  add("Surface finish", finishMachine(p.finish));
  add("Silkscreen / legend", "Inkjet / screen legend", p.silkscreen);
  add("Stiffener bonding", "Lamination / bonding", type.id === "rigidflex");
  add("Profiling / routing / depanel", "CNC route / laser cut");
  add("Electrical test", p.orderQty < 5000 ? "Flying probe" : "Fixture / ICT e-test");
  add("Impedance / TDR test", "TDR + coupon", p.impedance);
  add("Microsection / reliability", "Cross-section + lab", byId(QUALITY_LEVELS, p.quality).microsection);
  add("Final inspection + packaging", "FQC / vacuum pack");
  return steps;
}
function finishMachine(id) {
  if (id === "hasl" || id === "lfhasl") return "HASL line";
  if (id === "osp") return "OSP line";
  return "Chemical plating line (Ni/Au)";
}

/* Benchmark band ($/board) by layer/type, adjusted for quality, finish and
 * material — an independent "does this look sane" reference built from public
 * $/dm² fab-price ranges, NOT from the cost engine itself. */
function benchmarkBand(p, type, L, area, quality, finish, mat, impedance) {
  // base $/dm² midpoints by layer count (China, class 2, std FR-4, volume)
  let perDm2;
  if (L <= 2) perDm2 = 1.6;
  else if (L <= 4) perDm2 = 2.9;
  else if (L <= 6) perDm2 = 4.4;
  else if (L <= 8) perDm2 = 6.5;
  else if (L <= 10) perDm2 = 9.5;
  else if (L <= 12) perDm2 = 13;
  else perDm2 = 18;
  const typeMult = { rigid: 1, highspeed: 1.5, power: 1.3, hdi: 2.0, flex: 2.2, rigidflex: 3.2 }[type.id] || 1;
  const qualMult = { consumer: 1.0, industrial: 1.15, automotive: 1.5, aerospace: 2.2 }[quality.id] || 1;
  const finishMult = 1 + (finish.costDm2 - 0.10) * 0.6;          // ENIG/ENEPIG premium
  const matMult = mat.family === "rf" ? 1.5 : mat.family === "flex" ? 1.4 : (mat.id === "fr4_hightg" ? 1.1 : 1.0);
  const impMult = impedance ? 1.1 : 1.0;
  // Market PRICE band ($/board) — compare against the model's PRICE, not cost.
  const mid = perDm2 * typeMult * qualMult * finishMult * matMult * impMult * area;
  return { lo: mid * 0.65, mid, hi: mid * 1.6 };
}

/* DfC (Design-for-Cost) recommendations + AI insight narrative. */
function dfcRecommendations(p, c) {
  const recs = [];
  const push = (sev, text) => recs.push({ sev, text });

  if (p.layerCount % 2 !== 0 && p.layerCount > 1)
    push("high", `Layer count ${p.layerCount} is odd — multilayer stack-ups are built in balanced pairs. Move to ${p.layerCount + 1} layers for a symmetric, warp-free stack-up at little extra cost.`);

  if (c.L >= 8 && p.via === "through")
    push("med", `An ${c.L}-layer board with only through-vias forces large drilled holes through the full stack and wastes routing channels. Evaluate buried/blind vias or HDI to reduce layer count.`);

  if (c.via.microvia && c.via.buildup >= 2 && p.trace !== "2mil")
    push("low", "Stacked microvia (2+ build-up) is justified only by routing density — confirm escape routing genuinely needs it; staggered microvias yield better and cost less.");

  if (c.mat.family === "rf" && p.layerCount > 2)
    push("high", `Full-board ${c.mat.label} is expensive. Use a HYBRID stack-up: RF material only on the layers carrying high-frequency nets, FR-4 high-Tg elsewhere. Can cut material 40–60%.`);

  if (c.finish.id === "enepig" && p.quality === "consumer")
    push("med", "ENEPIG is over-specified for consumer; ENIG or immersion silver gives wire-bond/solder reliability at lower cost.");
  if (c.finish.id === "enig" && p.quality === "consumer")
    push("low", "For consumer-grade assembly, OSP or immersion silver can replace ENIG and save finish cost.");

  if (c.aspect > 10)
    push("high", `Aspect ratio ≈ ${c.aspect.toFixed(1)}:1 stresses through-hole plating reliability and yield. Reduce board thickness or increase minimum drill, or split into sub-laminations.`);

  if (p.trace === "2mil" && p.quality !== "consumer")
    push("med", "≤2 mil lines drive imaging to advanced LDI and depress yield. Relax to 3–4 mil where signal integrity allows.");

  if (c.bpp <= 1)
    push("high", `Only ${c.bpp} board fits the working panel — panel utilisation is poor. Re-pitch the array or choose a panel size that fits more up; material and per-board processing scale with utilisation.`);
  else if (p.utilization < 70)
    push("med", `Panel utilisation ${p.utilization}% is low. Improving array nesting toward 80–85% directly lowers $/board.`);

  if (Math.max(c.cuIn.oz, c.cuOut.oz) >= 3 && p.pcbType !== "power")
    push("low", "Heavy copper (≥3 oz) needs etch compensation and wider spacing. If only a few high-current nets need it, consider selective/stepped copper instead of full-build heavy copper.");

  if (p.quality === "automotive" && !p.impedance && p.pcbType === "highspeed")
    push("med", "High-speed automotive board without impedance control flagged — confirm controlled-impedance is truly not required for the high-speed interfaces.");

  if (p.orderQty < 5000)
    push("low", `Order qty ${p.orderQty} is low; tooling/NRE per board is significant. Consolidating volume or panel-sharing reduces NRE amortisation per board.`);

  if (recs.length === 0) push("ok", "No major cost red-flags. Design is broadly cost-balanced for its class.");
  return recs;
}

/* One-at-a-time ±pct sensitivity of total cost. */
function pcbSensitivity(input, pct = 15) {
  const base = computePcb(input).totalCost;
  const drivers = [
    { key: "layerCount", label: "Layer count" },
    { key: "boardW",     label: "Board size (W)" },
    { key: "orderQty",   label: "Order quantity", invert: true },
    { key: "utilization",label: "Panel utilisation", invert: true },
    { key: "holeDensity",label: "Hole density" },
    { key: "overheadPct",label: "Overhead %" },
    { key: "boardThickness", label: "Board thickness (AR)" },
  ];
  return drivers.map((d) => {
    const up = computePcb({ ...input, [d.key]: input[d.key] * (1 + pct / 100) }).totalCost;
    const dn = computePcb({ ...input, [d.key]: input[d.key] * (1 - pct / 100) }).totalCost;
    const swing = Math.max(Math.abs(up - base), Math.abs(dn - base)) / base * 100;
    return { label: d.label, swing };
  }).sort((a, b) => b.swing - a.swing);
}
