/* ============================================================================
 * model.js — Should-cost engine for an automotive IVI SoC
 *
 * Pure functions. Given an input object `p` (all numeric, percentages as
 * whole numbers), computes dies-per-wafer, yield, silicon $/good-die, and the
 * fully-loaded total product cost per shipped unit.
 *
 * Formulae & rationale documented inline and in the Methodology tab.
 * ==========================================================================*/

/* Gross dies per wafer.
 * De Vries / "wafer-die" formula that accounts for circular wafer edge loss:
 *   DPW = pi*r^2 / S  -  pi*(2r) / sqrt(2*S)
 * where r = usable radius (after edge exclusion), S = die footprint area
 * (incl. scribe). All lengths in mm, areas in mm². */
function diesPerWafer(p) {
  const r = p.waferDiameter / 2 - p.edgeExclusion;        // usable radius (mm)
  const side = Math.sqrt(p.effFootprintArea);             // mm (equivalent square)
  const S = p.effFootprintArea;                           // mm²
  if (r <= 0 || S <= 0) return 0;
  const dpw = (Math.PI * r * r) / S - (Math.PI * 2 * r) / Math.sqrt(2 * S);
  return Math.max(0, Math.floor(dpw));
}

/* Random-defect yield — negative-binomial model (industry standard, accounts
 * for defect clustering):  Y_random = (1 + A*D0/alpha)^(-alpha)
 *   A     = effective die area in cm²
 *   D0    = defect density (defects/cm²)
 *   alpha = clustering factor
 * Total die yield = systematic/parametric yield × random yield. */
function dieYield(p) {
  const A_cm2 = p.effDieArea / 100;                       // mm² -> cm²
  const yRandom = Math.pow(1 + (A_cm2 * p.defectDensity) / p.clustering, -p.clustering);
  const ySys = clamp(p.systematicYield / 100, 0, 1);
  return { yRandom, ySys, yTotal: yRandom * ySys };
}

/* Full computation. Returns a rich result object. */
function computeCost(input) {
  const p = { ...input };

  // --- Effective die geometry -------------------------------------------------
  // ASIL overhead inflates active area (lockstep, ECC, redundancy, safety island)
  p.effDieArea = p.dieArea * (1 + p.asilOverhead / 100);
  // Footprint adds scribe/kerf on each side of the equivalent square die.
  const sideActive = Math.sqrt(p.effDieArea);
  const sideFoot = sideActive + 2 * p.scribe;
  p.effFootprintArea = sideFoot * sideFoot;

  // --- Wafer-level ------------------------------------------------------------
  const dpw = diesPerWafer(p);
  const y = dieYield(p);
  const goodDPW = dpw * y.yTotal;

  // Silicon cost per good (bare) die
  const siliconPerGoodDie = goodDPW > 0 ? p.waferCost / goodDPW : Infinity;

  // --- Back-end: assembly, package, test (cumulative cost with yield loss) -----
  // Each stage adds cost; units scrapped downstream carry the cost already sunk.
  const afterDie = siliconPerGoodDie;
  const afterAssembly = (afterDie + p.assemblyCost + p.packageCost) / clamp(p.assemblyYield / 100, 0.01, 1);
  const testCost = (p.testTime / 3600) * p.testerRate + (p.burnIn ? p.burnInCost : 0);
  const afterTest = (afterAssembly + testCost) / clamp(p.testYield / 100, 0.01, 1);

  // Manufacturing / COGS-silicon (everything physical up to a packaged tested part)
  const packagedTestedCost = afterTest;

  // --- IP --------------------------------------------------------------------
  const lifetimeVolume = Math.max(1, p.annualVolume * p.programYears);
  const ipUpfrontPerUnit = p.ipUpfront / lifetimeVolume;
  const ipPerUnit = p.ipRoyalty + ipUpfrontPerUnit;

  // --- NRE (amortized over lifetime volume) ----------------------------------
  const nreTotal = p.maskCost + p.designNRE + p.qualNRE;
  const nrePerUnit = nreTotal / lifetimeVolume;

  // --- Overhead --------------------------------------------------------------
  const cogsBeforeOverhead = packagedTestedCost + ipPerUnit;
  const overhead = (p.overheadPct / 100) * cogsBeforeOverhead;

  // --- Total product cost ----------------------------------------------------
  const totalCost = packagedTestedCost + ipPerUnit + nrePerUnit + overhead;

  // --- Indicative ASP --------------------------------------------------------
  const gm = clamp(p.grossMargin / 100, 0, 0.95);
  const asp = totalCost / (1 - gm);

  // --- Cost-stack components (per shipped unit, sum = totalCost) --------------
  // Decompose packagedTestedCost into its parts for the stack/breakdown, scaled
  // by the back-end yield uplift so the parts sum to packagedTestedCost.
  const yScale = packagedTestedCost / (afterDie + p.assemblyCost + p.packageCost + testCost || 1);
  const components = [
    { key: "silicon",  label: "Silicon (good die)",     value: afterDie * yScale,        color: "#2563eb" },
    { key: "package",  label: "Package + substrate",    value: p.packageCost * yScale,   color: "#0891b2" },
    { key: "assembly", label: "Assembly",               value: p.assemblyCost * yScale,  color: "#0d9488" },
    { key: "test",     label: "Test" + (p.burnIn ? " + burn-in" : ""), value: testCost * yScale, color: "#65a30d" },
    { key: "ip",       label: "IP (royalty + upfront)", value: ipPerUnit,                color: "#ca8a04" },
    { key: "nre",      label: "NRE amortization",       value: nrePerUnit,               color: "#dc2626" },
    { key: "overhead", label: "Overhead / SG&A",        value: overhead,                 color: "#9333ea" },
  ];

  return {
    p,
    dpw,
    yieldRandom: y.yRandom,
    yieldSystematic: y.ySys,
    yieldTotal: y.yTotal,
    goodDPW,
    effDieArea: p.effDieArea,
    siliconPerGoodDie,
    packagedTestedCost,
    testCost,
    ipPerUnit,
    ipUpfrontPerUnit,
    nrePerUnit,
    nreTotal,
    overhead,
    lifetimeVolume,
    totalCost,
    asp,
    components,
  };
}

/* One-at-a-time ±pct sensitivity of total cost to each key driver. */
function sensitivity(input, pct = 10) {
  const base = computeCost(input).totalCost;
  const drivers = [
    { key: "waferCost",     label: "Wafer cost" },
    { key: "dieArea",       label: "Die area" },
    { key: "defectDensity", label: "Defect density D₀" },
    { key: "annualVolume",  label: "Annual volume", invert: true },
    { key: "packageCost",   label: "Package cost" },
    { key: "ipRoyalty",     label: "IP royalty" },
    { key: "designNRE",     label: "Design NRE" },
    { key: "overheadPct",   label: "Overhead %" },
  ];
  return drivers.map((d) => {
    const up = { ...input, [d.key]: input[d.key] * (1 + pct / 100) };
    const dn = { ...input, [d.key]: input[d.key] * (1 - pct / 100) };
    const cUp = computeCost(up).totalCost;
    const cDn = computeCost(dn).totalCost;
    // swing as % of base; magnitude only (use the larger absolute deviation)
    const hi = ((cUp - base) / base) * 100;
    const lo = ((cDn - base) / base) * 100;
    return { label: d.label, hi, lo, swing: Math.abs(hi) + Math.abs(lo) };
  }).sort((a, b) => b.swing - a.swing);
}

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
