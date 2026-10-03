/* ============================================================================
 * methodology.js — Transparency: formulae, calibration tables, sources, limits.
 * Rendered into the Methodology tab.
 * ==========================================================================*/

function buildMethodology() {
  const nodeRows = NODES.map((n) =>
    `<tr><td>${n.label}</td><td>${n.tier}${n.euv ? " · EUV" : ""}</td>
      <td>$${n.waferLo.toLocaleString()}–$${n.waferHi.toLocaleString()}</td>
      <td>$${(n.mask/1e6).toFixed(1)}M</td><td>${n.d0}</td></tr>`
  ).join("");

  $("methodologyProse").innerHTML = `
    <h2>What this model does</h2>
    <p>It is a bottom-up <b>should-cost model</b> for an automotive In-Vehicle Infotainment (IVI)
    SoC built on a fabless business model — i.e. the company pays a foundry for wafers, an OSAT for
    assembly &amp; test, and IP vendors for licenses and royalties, and amortizes its own NRE.
    It computes two headline numbers: the <b>unit silicon cost</b> ($/good die) and the
    <b>total product cost</b> per shipped SoC (silicon + package + assembly + test + IP + amortized
    NRE + overhead). Every input is editable so the model supports scenario analysis across nodes,
    volumes, packages, and IP mixes.</p>

    <h2>Cost flow</h2>
    <div class="formula">wafer $ → ÷ (gross dies/wafer × yield) → silicon $/good die
   + package + assembly  → ÷ assembly yield
   + test (+ burn-in)    → ÷ test yield        = packaged & tested cost
   + IP (royalty + upfront/volume)
   + NRE (mask + design + qual) / lifetime volume
   + overhead %                                = TOTAL PRODUCT COST
   ÷ (1 − gross margin)                         = indicative ASP</div>

    <h2>Key formulae</h2>
    <h3>1 · Gross dies per wafer (De Vries edge-loss formula)</h3>
    <div class="formula">DPW = π·r² / S  −  π·(2r) / √(2·S)</div>
    <p><code>r</code> = wafer radius − edge exclusion; <code>S</code> = die footprint area
    (active area inflated by ASIL overhead, plus scribe/kerf on each side). This captures the
    partial dies lost at the round wafer edge, which matters most for large IVI dies.</p>

    <h3>2 · Die yield (negative-binomial model)</h3>
    <div class="formula">Y = Y_systematic × (1 + A·D₀ / α)^(−α)</div>
    <p><code>A</code> = effective die area (cm²), <code>D₀</code> = defect density (defects/cm²),
    <code>α</code> = clustering factor. The negative-binomial form is the industry standard because
    real defects cluster; pure Poisson over-penalizes large dies. <code>Y_systematic</code> captures
    parametric and design–process yield loss that is independent of random defects.</p>

    <h3>3 · Back-end with yield loss</h3>
    <p>Assembly, package and test costs are added in sequence, each divided by the yield of that
    stage so that the cost sunk into units scrapped downstream is correctly carried by the survivors.</p>

    <h3>4 · Amortization</h3>
    <p>Mask set, design NRE, automotive-qualification NRE, and the upfront IP license are amortized
    over <b>lifetime volume = annual volume × program years</b>. This is why low-volume programs on
    advanced nodes are dominated by NRE per unit, while high-volume programs are dominated by silicon.</p>

    <h2>Calibration benchmarks (2024–2026)</h2>
    <p>Defaults below are midpoints of public/analyst ranges for automotive-qualified flows. Wafer
    prices are 300 mm, fully processed. Replace with negotiated numbers when you have them.</p>
    <table>
      <thead><tr><th>Node</th><th>Tier</th><th>Wafer cost ($/wafer)</th><th>Mask set</th><th>D₀ (/cm²)</th></tr></thead>
      <tbody>${nodeRows}</tbody>
    </table>
    <p class="src">Wafer-cost and mask-set ranges are consistent with publicly reported foundry
    economics and teardown/analyst estimates: TechInsights Semiconductor Manufacturing Economics,
    CSET foundry cost analyses, Morgan Stanley / IBS node-cost trackers, and IBS mask-cost curves.
    Automotive flows carry a premium over consumer (~10–20%) for qualified PDKs, screening, and
    lower defect-density targets. Figures are <b>order-of-magnitude calibrated estimates</b>, not
    confidential vendor pricing.</p>

    <h2>Automotive-specific adders</h2>
    <ul>
      <li><b>AEC-Q100 / extended temperature:</b> tighter screening, higher test coverage and time,
      optional burn-in — captured in test time, burn-in toggle, and lower final-test yield.</li>
      <li><b>Functional safety (ASIL-B/D, ISO 26262):</b> lockstep cores, ECC, BIST, redundancy and a
      safety island add die area — captured by the ASIL area-overhead input (default 8%).</li>
      <li><b>Qualification &amp; long lifetime:</b> separate qualification NRE line (AEC-Q100,
      reliability, characterization) amortized over program volume.</li>
      <li><b>Lower defect density / higher yield bar:</b> automotive parts target lower DPPM; D₀ and
      systematic-yield inputs are set conservatively.</li>
    </ul>

    <h2>Typical IVI SoC reference points</h2>
    <table>
      <thead><tr><th>Class</th><th>Node</th><th>Die area</th><th>Package</th><th>Volume</th></tr></thead>
      <tbody>
        <tr><td>Entry IVI / digital cluster</td><td>28/22 nm</td><td>80–120 mm²</td><td>BGA 0.8 mm</td><td>0.5–3M/yr</td></tr>
        <tr><td>Mid cockpit</td><td>16/14 nm</td><td>90–140 mm²</td><td>FC-BGA</td><td>0.3–2M/yr</td></tr>
        <tr><td>High-end domain controller</td><td>7/6/5 nm</td><td>120–200 mm²</td><td>FC-BGA HD / SiP</td><td>0.1–1M/yr</td></tr>
      </tbody>
    </table>

    <h2>Accuracy &amp; limitations</h2>
    <p>Targeted accuracy is <b>90–95%</b> when wafer cost, defect density, package and IP terms are
    calibrated to the specific program. Residual error is dominated by:</p>
    <ul>
      <li>Wafer-price negotiation and foundry mix (±10–15%).</li>
      <li>Achieved yield during ramp vs. mature steady state.</li>
      <li>IP royalty structure (per-unit vs. tiered vs. paid-up) and DRAM/PoP content if applicable.</li>
      <li>Test program maturity and burn-in policy.</li>
    </ul>
    <p>The model deliberately excludes company-level R&amp;D not tied to the program, distribution
    margin beyond the overhead line, and tariffs/logistics, which vary by customer. Use the
    <b>Indicative ASP</b> only as a sanity check — it applies a flat gross margin and is not a pricing
    recommendation.</p>
  `;
}
