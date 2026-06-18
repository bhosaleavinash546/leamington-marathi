/* ============================================================================
 * methodology.js — Full documentation rendered into the Methodology tab:
 * conceptual model, parameter list, routing, cost drivers, yield model,
 * cost breakdown, 3 worked examples (computed live), and a manager summary.
 * ==========================================================================*/

function buildMethodology() {
  const f2 = (v) => "$" + (isFinite(v) ? v.toFixed(2) : "—");
  const f3 = (v) => "$" + (isFinite(v) ? v.toFixed(3) : "—");
  const pct = (v) => (v * 100).toFixed(0) + "%";

  // ---- live worked examples ----
  const exHtml = EXAMPLES.map((ex) => {
    const r = computePcb(ex.input);
    const i = ex.input;
    const total = r.components.reduce((s, c) => s + Math.max(0, c.value), 0) || 1;
    const rows = r.components.map((c) =>
      `<tr><td>${c.label}</td><td>${f3(c.value)}</td><td>${((Math.max(0,c.value)/total)*100).toFixed(0)}%</td></tr>`).join("");
    const drivers = pcbSensitivity(i, 15).slice(0, 4).map((s) => `${s.label} (±${s.swing.toFixed(0)}%)`).join(", ");
    const dfc = r.dfc.filter((d) => d.sev !== "ok").slice(0, 3).map((d) => `<li>${d.text}</li>`).join("") || "<li>No major red flags.</li>";
    return `
      <h3>${ex.name}</h3>
      <p class="src">${ex.note}</p>
      <p><b>Inputs:</b> ${i.boardW}×${i.boardH} mm · ${i.layerCount} layer · ${byId(MATERIALS,i.material).label} ·
        ${byId(COPPER_WEIGHTS,i.copperOuter).label}/${byId(COPPER_WEIGHTS,i.copperInner).label} Cu ·
        ${byId(VIA_TYPES,i.via).label} · ${byId(TRACE_CLASSES,i.trace).label} · ${byId(FINISHES,i.finish).label} ·
        ${i.impedance ? "impedance-controlled · " : ""}${byId(QUALITY_LEVELS,i.quality).label} · ${byId(REGIONS,i.region).label} · qty ${i.orderQty.toLocaleString()}</p>
      <p><b>Derived:</b> ${r.area.toFixed(2)} dm² · ${r.bpp} boards/panel · ${r.lamCycles} lamination cycle(s) ·
        aspect ${r.aspect.toFixed(1)}:1 · yield ${pct(r.yld)}</p>
      <table>
        <thead><tr><th>Cost element</th><th>$/board</th><th>%</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Fab cost</th><th>${f2(r.totalCost)}</th><th>100%</th></tr>
        <tr><th>Quoted price</th><th>${f2(r.price)}</th><th>—</th></tr></tfoot>
      </table>
      <p><b>Top cost drivers:</b> ${drivers}.</p>
      <p><b>Benchmark:</b> price ${f2(r.price)} vs market band ${f2(r.benchmark.lo)}–${f2(r.benchmark.hi)} —
        ${(r.price>=r.benchmark.lo&&r.price<=r.benchmark.hi)?"<b style='color:#0e9f6e'>in band ✓</b>":"outside band"}.</p>
      <p><b>DfC recommendations:</b></p><ul>${dfc}</ul>`;
  }).join("");

  $("methodologyProse").innerHTML = `
    <h2>1 · Conceptual model</h2>
    <p>A bottom-up, process-routed <b>should-cost model for ALL PCB types</b> — rigid (1–12+ layer),
    HDI, flex, rigid-flex, high-speed/RF and power/heavy-copper — built the way a Tier-1 automotive
    PCB supplier's cost engineer would. It walks the real fab process flow, costs every step from raw
    laminate to final inspection, applies yield/scrap and tooling amortisation, and adds overhead and
    margin. <b>Number of layers and stack-up are the primary drivers</b>: layer count compounds
    imaging, etch, AOI, lamination, drilling and yield, while via technology (buried/blind/microvia)
    sets the number of <b>sequential lamination cycles</b> — the single biggest stack-up cost lever
    the previous model was missing.</p>
    <div class="formula">material → +processing(imaging·etch·AOI·lamination·drill·plating·mask·finish)
       → ÷ yield → +test/inspection → +tooling/NRE ÷ qty → +overhead → fab cost
       ÷ (1 − margin) → quoted price</div>

    <h2>2 · Parameter list</h2>
    <h3>Inputs</h3>
    <table>
      <thead><tr><th>Group</th><th>Parameters</th></tr></thead>
      <tbody>
        <tr><td>Board &amp; type</td><td>PCB type, board W×H, order quantity</td></tr>
        <tr><td>Stack-up</td><td><b>Layer count</b>, base material, board thickness, inner/outer copper weight, via technology</td></tr>
        <tr><td>Design rules</td><td>min trace/space, controlled impedance, surface finish, solder-mask colour, silkscreen</td></tr>
        <tr><td>Panelisation</td><td>panel W×H, utilisation %, hole density</td></tr>
        <tr><td>Commercial</td><td>quality/IPC class, region, overhead %, margin %</td></tr>
      </tbody>
    </table>
    <h3>Derived technical parameters</h3>
    <table><tbody>
      <tr><td>Board area (dm²)</td><td><code>W·H / 10000</code></td></tr>
      <tr><td>Boards per panel</td><td><code>floor(panelArea/boardArea · utilisation)</code></td></tr>
      <tr><td>Lamination cycles</td><td>base 1 + buried/HDI build-ups + rigid-flex bonding (sequential lamination)</td></tr>
      <tr><td>Blended copper factor</td><td>weighted outer/inner copper-weight multiplier</td></tr>
      <tr><td>Aspect ratio</td><td><code>thickness / min-hole</code> → plating-reliability &amp; yield derate</td></tr>
      <tr><td>Hole / microvia counts</td><td>density × area (× build-up layers for microvia)</td></tr>
    </tbody></table>

    <h2>3 · Process routing per PCB type</h2>
    <p>The engine emits the actual ordered step list (see the <b>Process Routing</b> tab). Steps switch
    on/off by configuration:</p>
    <table>
      <thead><tr><th>PCB type</th><th>Distinguishing process steps</th></tr></thead>
      <tbody>
        <tr><td>Rigid 1–2 layer</td><td>No inner imaging/lamination; drill → PTH → plate → outer image → mask → finish → route → e-test</td></tr>
        <tr><td>Rigid 4–12+ layer</td><td>Inner image/etch/AOI/oxide → lamination → drill → PTH/plate → outer → mask → finish → e-test → microsection (Class 3)</td></tr>
        <tr><td>HDI</td><td>+ laser microvia drilling + <b>sequential build-up lamination</b> (1+N+1 … any-layer)</td></tr>
        <tr><td>Flex</td><td>Polyimide core + coverlay lamination + special handling/profiling (laser cut)</td></tr>
        <tr><td>Rigid-flex</td><td>Rigid + flex sub-stacks + coverlay + bonding + stiffener; extra lamination cycles</td></tr>
        <tr><td>High-speed/RF</td><td>RF/hybrid laminate handling premium + mandatory impedance/TDR coupon test</td></tr>
        <tr><td>Power/heavy-copper</td><td>Heavy-copper etch compensation, thicker plating, (metal-core thermal substrate)</td></tr>
      </tbody>
    </table>

    <h2>4 · Cost-driver list</h2>
    <ol>
      <li><b>Layer count &amp; stack-up</b> — compounds nearly every process step + lamination cycles.</li>
      <li><b>Via technology</b> — buried/blind/microvia → sequential laminations + laser drilling.</li>
      <li><b>Board area &amp; panel utilisation</b> — everything scales with area; poor nesting wastes panel.</li>
      <li><b>Material</b> — FR-4 vs High-Tg vs RF (Rogers) vs polyimide; RF and flex carry large premiums.</li>
      <li><b>Copper weight</b> — heavy copper needs etch compensation, wider spacing, thicker plating.</li>
      <li><b>Trace/space &amp; impedance</b> — fine lines force LDI and depress yield; impedance adds TDR test.</li>
      <li><b>Surface finish</b> — OSP &lt; immersion Ag/Sn &lt; ENIG &lt; ENEPIG &lt; hard gold.</li>
      <li><b>Quality/IPC class</b> — yield, test depth, microsection, scrap, NRE multipliers.</li>
      <li><b>Volume</b> — amortises tooling/NRE; selects flying-probe vs fixtured e-test.</li>
      <li><b>Region</b> — labour &amp; overhead multipliers (China baseline → India → NA/EU).</li>
    </ol>

    <h2>5 · Yield &amp; quality model</h2>
    <div class="formula">Yield = Y_class × Y_trace × 0.992^(layers−2) × Y_type</div>
    <p>Each added layer pair compounds a small yield loss; finer trace classes and complex types
    (HDI, rigid-flex) derate further. The quality/IPC class sets the baseline yield, scrap allowance,
    test multiplier, mandatory microsection (Class 3 automotive/aero), and NRE multiplier. Cost is
    carried by <b>good boards only</b> (cost ÷ yield), so yield is a first-class cost driver.</p>
    <table>
      <thead><tr><th>Class</th><th>Base yield</th><th>Scrap</th><th>Test ×</th><th>Microsection</th><th>NRE ×</th></tr></thead>
      <tbody>${QUALITY_LEVELS.map((q)=>`<tr><td>${q.label}</td><td>${pct(q.yld)}</td><td>${pct(q.scrap)}</td><td>${q.testMult}</td><td>${q.microsection?"yes":"no"}</td><td>${q.nreMult}</td></tr>`).join("")}</tbody>
    </table>

    <h2>6 · Cost-breakdown structure</h2>
    <p>Nine reconciling categories that sum to fab cost: <b>Material</b>, <b>Imaging+etch+AOI</b>,
    <b>Lamination</b>, <b>Drilling+laser microvia</b>, <b>Desmear/PTH/plating</b>,
    <b>Mask/finish/silk/profile</b>, <b>Test+inspection</b>, <b>Tooling/NRE (amortised)</b>,
    <b>Overhead</b>; then margin → price. Material and processing typically dominate; NRE dominates at
    low volume; lamination + drilling dominate the incremental cost of added layers/HDI.</p>

    <h2>7 · Worked examples (luxury SUV)</h2>
    ${exHtml}

    <h2>8 · Benchmark ranges &amp; sources</h2>
    <p>The independent benchmark band is built from public PCB fab $/dm² price ranges by layer count
    and type, adjusted for quality, finish and material. Reference $/dm² midpoints (China, volume):
    2-layer ≈ $1.6, 4-layer ≈ $2.9, 6-layer ≈ $4.4, 8-layer ≈ $6.5, 10-layer ≈ $9.5, 12-layer ≈ $13/dm²,
    scaled ×1.3–3.2 for power/HDI/flex/rigid-flex. These are <b>engineering ranges</b> aligned with
    typical fab process economics and IPC build classes (<b>IPC-2221</b> design, <b>IPC-6012</b>
    rigid qualification &amp; Class 1/2/3, <b>IPC-6013</b> flex/rigid-flex, <b>IPC-2226</b> HDI,
    <b>IPC-A-600</b> acceptability, <b>IPC-7351</b> land patterns), not supplier quotes.</p>

    <h2>9 · Manager summary — how this fixes the gaps</h2>
    <div class="callout">
      <p><b>Previous feedback:</b> “small aspects covered, but critical processes &amp; parameters
      missing — especially number of layers and stack-up logic.”</p>
    </div>
    <table>
      <thead><tr><th>Gap</th><th>Now addressed</th></tr></thead>
      <tbody>
        <tr><td>Layer count not central</td><td><b>Layer count is the primary driver</b> — compounds imaging/etch/AOI/lamination/drill/plating and yield.</td></tr>
        <tr><td>No stack-up logic</td><td>Explicit <b>lamination-cycle model</b>: buried/blind &amp; HDI build-ups add sequential presses; rigid-flex adds bonding cycles.</td></tr>
        <tr><td>Via technology ignored</td><td>Through / buried-blind / HDI 1+N+1…any-layer with laser microvia drilling + build-up costs.</td></tr>
        <tr><td>Limited PCB types</td><td>Rigid, HDI, flex, rigid-flex, high-speed/RF, power — each with its own routing &amp; multipliers.</td></tr>
        <tr><td>Material/copper/finish coarse</td><td>FR-4/High-Tg/RF/polyimide/IMS, 0.5–4 oz copper, 8 finishes, mask colours.</td></tr>
        <tr><td>Impedance &amp; design rules</td><td>Trace/space classes (imaging tech + yield) and controlled-impedance TDR test.</td></tr>
        <tr><td>Panelisation</td><td>Boards-per-panel &amp; utilisation directly scale $/board.</td></tr>
        <tr><td>Test/inspection thin</td><td>Flying-probe vs fixtured e-test by volume, AOI, microsection for Class 3.</td></tr>
        <tr><td>Reliability/automotive</td><td>IPC Class 2/3, IATF flow, qualification NRE, conservative yield/scrap.</td></tr>
        <tr><td>No DfC / insights</td><td>Engineering-grade <b>DfC recommendations</b> + AI cost-driver sensitivity, every run.</td></tr>
      </tbody>
    </table>

    <h2>Missing processes a fab would still expect to confirm</h2>
    <p>Called out explicitly for completeness — add as needed for a specific RFQ: back-drilling of
    stub vias (high-speed), via-fill (resin/copper) &amp; capping for HDI/via-in-pad, edge plating /
    castellation, peelable mask &amp; carbon ink, press-fit / heavy-gold connector tabs, blue-glue
    &amp; depanel routing strategy, IST/CAF reliability coupons, first-article &amp; PPAP
    documentation (automotive), and assembly-side stencil/AOI (out of bare-board fab scope).</p>

    <p class="src">All figures are industry-aligned engineering estimates for model calibration, not
    confidential supplier pricing. Override coefficients in <code>data.js</code> with negotiated
    numbers when implementing in CostVision.</p>
  `;
}
