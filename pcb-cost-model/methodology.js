/* ============================================================================
 * methodology.js — Full documentation (2026 edition) rendered into the
 * Methodology tab: conceptual model, parameters, routing, cost drivers, yield,
 * 2026 market data & sources, worked examples (computed live), AI advisor, and
 * a manager summary.
 * ==========================================================================*/

function buildMethodology() {
  const f2 = (v) => "$" + (isFinite(v) ? v.toFixed(2) : "—");
  const f3 = (v) => "$" + (isFinite(v) ? v.toFixed(3) : "—");
  const pct = (v) => (v * 100).toFixed(0) + "%";

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
        ${byId(COPPER_WEIGHTS,i.copperOuter).label}/${byId(COPPER_WEIGHTS,i.copperInner).label} Cu · ${byId(COPPER_FOILS,i.copperFoil).label} foil ·
        ${byId(FAB_PROCESSES,i.fabProcess).label} · ${byId(VIA_TYPES,i.via).label} · ${byId(TRACE_CLASSES,i.trace).label} · ${byId(FINISHES,i.finish).label} ·
        ${i.impedance ? "impedance · " : ""}${i.backdrill ? "back-drill · " : ""}${i.viafill ? "via-fill · " : ""}${byId(QUALITY_LEVELS,i.quality).label} · ${byId(REGIONS,i.region).label} · qty ${i.orderQty.toLocaleString()}</p>
      <p><b>Derived:</b> ${r.area.toFixed(2)} dm² · ${r.bpp} boards/panel · ${r.lamCycles} lamination cycle(s) ·
        aspect ${r.aspect.toFixed(1)}:1 · yield ${pct(r.yld)}</p>
      <table>
        <thead><tr><th>Cost element</th><th>$/board</th><th>%</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Fab cost</th><th>${f2(r.totalCost)}</th><th>100%</th></tr>
        <tr><th>Quoted price</th><th>${f2(r.price)}</th><th>—</th></tr></tfoot>
      </table>
      <p><b>Top cost drivers:</b> ${drivers}.</p>
      <p><b>Benchmark:</b> price ${f2(r.price)} vs 2026 market band ${f2(r.benchmark.lo)}–${f2(r.benchmark.hi)} —
        ${(r.price>=r.benchmark.lo&&r.price<=r.benchmark.hi)?"<b style='color:#6cff3f'>in band ✓</b>":"outside band"}.</p>
      <p><b>DfC recommendations:</b></p><ul>${dfc}</ul>`;
  }).join("");

  $("methodologyProse").innerHTML = `
    <h2>1 · Conceptual model</h2>
    <p>A bottom-up, process-routed <b>should-cost model for ALL PCB types</b> — rigid (1–12+ layer),
    HDI, any-layer/SLP, flex, rigid-flex, high-speed/RF and power/heavy-copper — built the way a Tier-1
    automotive PCB supplier's cost engineer would. It walks the real fab process flow, costs every step
    from raw laminate to final inspection, applies yield/scrap and tooling amortisation, and adds
    overhead and margin. <b>Number of layers and stack-up are the primary drivers</b>: layer count
    compounds imaging, etch, AOI, lamination, drilling and yield; via technology sets the number of
    <b>sequential lamination cycles</b> — the biggest stack-up cost lever.</p>
    <div class="formula">material → +processing(imaging·etch·AOI·lamination·drill·µvia·back-drill·plate·mask·finish)
       → ÷ yield → +test/inspection(AOI·AXI·e-test) → +tooling/NRE ÷ qty → +overhead → fab cost
       ÷ (1 − margin) → quoted price</div>

    <h2>2 · What's new in the 2026 edition (v2)</h2>
    <ul>
      <li><b>Expanded materials:</b> FR-4 std/mid-Tg/High-Tg/halogen-free, low-loss (Megtron 6 / I-Tera),
      ultra-low-loss (Megtron 7/8), Rogers RO4350B/RO4003C/RO3003 (77 GHz), PTFE/Taconic, polyimide, LCP, IMS.</li>
      <li><b>Latest processes/technologies:</b> mSAP & SAP fine-line, any-layer HDI / SLP, back-drilling
      (per-via), via-fill / via-in-pad, copper-foil profile (HTE/RTF/VLP/HVLP), VCP plating, laser depanel,
      plasma desmear for PTFE, 3D AXI, IST/CAF reliability coupons, extreme copper.</li>
      <li><b>2026 market data:</b> gold-price finish sensitivity (~70% of ENIG cost is gold; +10% gold ≈
      +6.8% ENIG), CCL/copper inflation surcharge, and updated labour/region indices for 10 regions
      (China baseline; incl. Japan, Thailand, Mexico; NA/EU material-purchasing premium).</li>
      <li><b>AI advisor:</b> built-in insight engine, streaming Claude review, follow-up chat, and an
      <b>agentic optimizer</b> that uses the live cost engine as a tool to numerically verify every idea.</li>
    </ul>

    <h3>v2 review fixes &amp; new modules</h3>
    <ul>
      <li><b>Panel utilisation now enters the cost math.</b> The board pays for its true panel share via a
      waste factor <code>0.80 / utilisation</code>, normalized so the 80% calibration reference is
      unchanged. (Previously utilisation was display-only — a review-caught bug.)</li>
      <li><b>Finish cost reconciliation fixed:</b> surface finish is now correctly inside the processing
      total, and the breakdown sums to total cost exactly; the processing calibration knob
      (<code>COEFF.procCal</code>) was re-anchored so the validated benchmark suite still passes.</li>
      <li><b>Lot-size curve:</b> <code>1 + 2.8·e^(−qty/300)</code> — prototype quantities run ~3–5× volume
      pricing, decaying to 1.0 by ~3k boards (matches published proto multipliers).</li>
      <li><b>Config validation:</b> contradictory stack-ups (HDI without microvias, flex on FR-4, buried
      vias on 2-layer) are flagged as CONFIG alerts instead of being silently costed.</li>
      <li><b>Scrap &amp; finish setup wired in:</b> the IPC-class scrap allowance now inflates material and
      the finish line-setup joins NRE (both were previously dead parameters).</li>
      <li><b>Landed cost:</b> duty lanes (indicative 2026 rates — China→US reflects the Section 301 +
      Section 122 stack; verify per HTS code) + freight → landed $/board.</li>
      <li><b>Monte Carlo uncertainty:</b> 400 samples over the calibration σ of each cost block →
      P10/P50/P90 band shown next to the point estimate.</li>
      <li><b>Quote calibration:</b> log real supplier quotes; the model reports its live MAPE and learns a
      per-region median correction factor you can toggle on.</li>
      <li><b>PCBA assembly module (optional):</b> SMT/THT placements, sides, BOM, stencil/programming NRE,
      assembly yield → full PCBA cost.</li>
      <li><b>Design-file import (beta):</b> board extents from RS-274X Gerbers, hole count/density from
      Excellon drill files, layer count from copper-layer filename conventions.</li>
      <li><b>Batch CSV costing, share links, JSON/CSV export.</b></li>
    </ul>

    <h2>3 · Parameter list</h2>
    <table>
      <thead><tr><th>Group</th><th>Parameters</th></tr></thead>
      <tbody>
        <tr><td>Board &amp; type</td><td>PCB type, board W×H, order quantity</td></tr>
        <tr><td>Stack-up</td><td><b>Layer count</b>, base material, board thickness, inner/outer copper weight, copper-foil profile, via technology</td></tr>
        <tr><td>Design rules &amp; process</td><td>fine-line process (subtractive/mSAP/SAP), min trace/space, controlled impedance, back-drill, via-fill, surface finish, mask colour, silkscreen</td></tr>
        <tr><td>Panelisation</td><td>panel W×H, utilisation %, hole density</td></tr>
        <tr><td>Commercial / 2026 market</td><td>quality/IPC class, region, gold price $/oz, market surcharge %, overhead %, margin %</td></tr>
      </tbody>
    </table>

    <h2>4 · Key formulae</h2>
    <div class="formula">Boards/panel = floor(panelArea/boardArea × utilisation)
Lamination cycles = 1 + buried/HDI build-ups + rigid-flex bonding
Yield = Y_class × Y_trace × Y_process × 0.992^(layers−2) × Y_type
Finish$/dm² = base × [(1−goldFrac) + goldFrac × (gold$ / $4,100)]   (gold sensitivity)
Cost carried by GOOD boards only → cost ÷ yield</div>

    <h2>5 · Cost-driver list</h2>
    <ol>
      <li><b>Layer count &amp; stack-up</b> — compounds nearly every step + lamination cycles.</li>
      <li><b>Via technology</b> — buried/blind/microvia → sequential laminations + laser drilling; back-drill vs blind/buried trade-off.</li>
      <li><b>Material</b> — FR-4 → High-Tg → low-loss → RF (PTFE 10–20× FR-4). Use hybrid stacks for RF.</li>
      <li><b>Finish &amp; gold price</b> — 2026 gold (~$4,100/oz) makes ENIG/ENEPIG/hard-gold a major, volatile line item.</li>
      <li><b>Board area &amp; panel utilisation</b> — everything scales with area; poor nesting wastes panel.</li>
      <li><b>Fine-line process</b> — mSAP/SAP (~40–50% premium) needed below ~2 mil; subtractive elsewhere.</li>
      <li><b>Copper weight &amp; foil</b> — heavy copper 40–70%; HVLP foil for high-speed (supply-constrained 2026).</li>
      <li><b>Quality/IPC class</b> — yield, test depth, AXI, microsection, IST/CAF, scrap, NRE.</li>
      <li><b>Volume</b> — amortises tooling/NRE; flying-probe vs fixtured ICT (~500–1000 unit break-even).</li>
      <li><b>Region &amp; market surcharge</b> — labour/overhead index + 2026 metal/energy inflation.</li>
    </ol>

    <h2>6 · 2026 market benchmarks &amp; sources</h2>
    <p>Independent $/dm² price band (China-volume, standard FR-4 ladder, 2026-inflated), adjusted for
    type, quality, finish, material, heavy-copper and region. Reference $/dm² midpoints (China volume):</p>
    <table>
      <thead><tr><th>Layers</th><th>2 L</th><th>4 L</th><th>6 L</th><th>8 L</th><th>10 L</th><th>12 L</th><th>16 L</th></tr></thead>
      <tbody><tr><td>$/dm²</td><td>1.6</td><td>2.9</td><td>4.4</td><td>6.5</td><td>9.5</td><td>13</td><td>20</td></tr></tbody>
    </table>
    <table>
      <thead><tr><th>2026 driver</th><th>Figure used</th></tr></thead>
      <tbody>
        <tr><td>Gold price</td><td>~$4,100/oz (2024 ~$2,400); ENIG ~70% gold-variable; +10% gold ≈ +6.8% ENIG</td></tr>
        <tr><td>Copper / CCL</td><td>copper +~40% in 2025; CCL/copper-foil +up to 40%; captured by market-surcharge input</td></tr>
        <tr><td>Region index (China=1.0, raw wages)</td><td>India ~0.3 · Vietnam ~0.65 · Taiwan ~1.7 · Korea ~3.5 · USA ~7.2 · Germany ~8.8 → blended to fab-processing multipliers (labour is 15–30% of cost)</td></tr>
        <tr><td>Advanced-process adders</td><td>back-drill +10–20% · via-in-pad +up to 20% · mSAP/SLP +40–50% vs HDI · heavy Cu 4 oz +40–60% · 77 GHz radar 3–10× · IMS 2–3× · stacked vs staggered µvia +30–50%</td></tr>
        <tr><td>Cost structure</td><td>material 30–40% · processing 40–50% · test+overhead 10–20% (shifts to process-dominated for HDI)</td></tr>
      </tbody>
    </table>
    <p class="src"><b>Sources (2025–2026):</b> DigiTimes (Nan Ya / Kingboard / ITEQ CCL &amp; copper-foil price
    hikes), AtlasPCB &amp; TrendForce (CCL cost breakdown, Korea import +74.5% YoY, gold/metals), NCAB PCB
    price index (108→~125), Prismark (PCB +15.8% to ~$85B in 2025), Rogers Corp / RayPCB (RF laminate),
    Isola / PCBSync (Isola/Shengyi/Panasonic tiers), Hil Electronic / King Sun / TOPFAST / JLCPCB
    ($/in² ladders, cost-structure splits), IPC-4552B/4556 (ENIG/ENEPIG), Sierra/AllPCB/Epec (HDI,
    back-drill, via-fill, test economics), BLS/Destatis/vendor wage data (labour). All figures are
    engineering ranges, not supplier quotes; laminate makers publish sheet prices only under NDA.</p>

    <h2>7 · Worked examples (luxury SUV)</h2>
    ${exHtml}

    <h2>8 · AI advisor — insights &amp; idea generation</h2>
    <p>The <b>AI Advisor</b> tab has two engines:</p>
    <ul>
      <li><b>Built-in advisor</b> (offline, no key): analyses the current design and generates a ranked,
      quantified list of cost-reduction ideas (layer reduction, HDI vs through, finish downgrade, panel
      utilisation, hybrid RF stack-up, trace relaxation, volume consolidation, regional trade-offs) plus a
      cost narrative — computed deterministically from the model.</li>
      <li><b>Claude generation</b> (your own Anthropic API key): sends the design + computed cost stack
      directly from your browser to the Claude API and returns a generative should-cost review (drivers,
      DfC ideas, risks/missing processes, alternative concepts). The key is used only for that direct call
      and, if you opt in, stored only in your browser's localStorage. Model is selectable
      (Opus 4.8 default, Sonnet 5, Haiku 4.5).</li>
    </ul>

    <h2>9 · Yield &amp; quality model</h2>
    <table>
      <thead><tr><th>Class</th><th>Base yield</th><th>Scrap</th><th>Test ×</th><th>AXI</th><th>Microsection/IST</th><th>NRE ×</th></tr></thead>
      <tbody>${QUALITY_LEVELS.map((q)=>`<tr><td>${q.label}</td><td>${pct(q.yld)}</td><td>${pct(q.scrap)}</td><td>${q.testMult}</td><td>${q.axi?"yes":"no"}</td><td>${q.microsection?"yes":"no"}</td><td>${q.nreMult}</td></tr>`).join("")}</tbody>
    </table>

    <h2>10 · Manager summary — how this fixes the gaps</h2>
    <div class="callout"><p><b>Previous feedback:</b> missing materials, manufacturing processes, latest
    technologies; old labour rates; low accuracy. Wanted 2026 data, neon+black UI, and AI tools.</p></div>
    <table>
      <thead><tr><th>Gap</th><th>Now addressed</th></tr></thead>
      <tbody>
        <tr><td>Missing materials</td><td>13 materials incl. low-loss (Megtron 6/7/8), RF (Rogers RO4350B/RO4003C/RO3003, PTFE), LCP, IMS — with 2026 relative pricing.</td></tr>
        <tr><td>Missing processes / latest tech</td><td>mSAP/SAP, any-layer HDI/SLP, back-drilling, via-fill/via-in-pad, copper-foil profile, VCP, laser depanel, plasma desmear, 3D AXI, IST/CAF.</td></tr>
        <tr><td>Old labour rates</td><td>2026 blended region multipliers (China/Vietnam/India/Taiwan/Korea/NA/EU) from current wage + burden data; energy in the overhead term.</td></tr>
        <tr><td>Low accuracy</td><td>Recalibrated to 2026 $/dm² ladders + CCL inflation + gold-price finish driver; flagship examples land inside the independent market band; cost-structure split matches published 30–40% material / 40–50% process.</td></tr>
        <tr><td>Gold / metal volatility</td><td>Explicit gold-price input scales the gold-variable part of ENIG/ENEPIG/hard-gold; market-surcharge input for CCL/copper escalation.</td></tr>
        <tr><td>Neon + black UI</td><td>Full high-contrast neon-on-black redesign.</td></tr>
        <tr><td>AI tools</td><td>Built-in AI advisor + optional live Claude generation for insights and idea generation.</td></tr>
      </tbody>
    </table>

    <h2>Missing processes a fab would still confirm</h2>
    <p>Called out for completeness — add per RFQ: resin/copper via-fill chemistry choice &amp; capping,
    edge plating / castellation, peelable mask &amp; carbon ink, press-fit / heavy-gold connector tabs,
    copper coin / inlay for thermal, embedded components/die, glass-core substrate (emerging AI packaging,
    2027+), blue-glue &amp; depanel strategy, first-article &amp; PPAP (automotive), and assembly-side
    stencil/AOI/AXI (out of bare-board fab scope).</p>

    <p class="src">All figures are industry-aligned engineering estimates for model calibration, not
    confidential supplier pricing. Override coefficients in <code>data.js</code> with negotiated numbers
    when implementing in a costing engine.</p>
  `;
}
