import { num, sel, chk, getUniversalTail } from '../helpers.js';
import { computePCBFabDrivers } from '../../engine/modules/pcb-fab.js';
import type { UniversalStackInput } from '../../engine/types.js';

export function renderPCBFabForm(): string {
  return `
    <div class="section-title">PCB Technology & Quality</div>
    <div class="field-row">
      <div class="field-group"><label>PCB Technology</label><select id="pcbf-technology">
        <option value="FR4_STD">FR4 Standard (1–8L, Tg 130°C)</option>
        <option value="FR4_HTg">FR4 High-Tg (4–16L, Tg 150–170°C)</option>
        <option value="HDI_RIGID" selected>HDI Rigid (6–24L, microvias)</option>
        <option value="RIGID_FLEX">Rigid-Flex (polyimide + FR4)</option>
        <option value="FLEX">Pure Flex (polyimide, 1–6L)</option>
        <option value="RF_MICRO">RF/Microwave (Rogers/PTFE)</option>
        <option value="MCPCB">Metal-Core PCB (MCPCB)</option>
        <option value="CERAMIC">Ceramic Substrate</option>
      </select></div>
      <div class="field-group"><label>Quality Grade</label><select id="pcbf-quality">
        <option value="consumer">Consumer (IPC Class 1)</option>
        <option value="industrial">Industrial (IPC Class 2)</option>
        <option value="auto_grade2">Automotive Grade 2 (AEC-Q)</option>
        <option value="auto_grade1" selected>Automotive Grade 1 (IATF 16949)</option>
        <option value="aerospace">Aerospace (IPC Class 3 / AS9100)</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Sourcing Region</label><select id="pcbf-region">
        <option value="uk" selected>UK</option>
        <option value="eu">EU</option>
        <option value="china">China</option>
        <option value="india">India</option>
        <option value="na">North America</option>
      </select></div>
      <div class="field-group"><label>Layer Count</label><select id="pcbf-layers">
        <option value="1">1 Layer</option>
        <option value="2">2 Layers</option>
        <option value="4">4 Layers</option>
        <option value="6">6 Layers</option>
        <option value="8" selected>8 Layers</option>
        <option value="10">10 Layers</option>
        <option value="12">12 Layers</option>
        <option value="16">16 Layers</option>
        <option value="20">20 Layers</option>
        <option value="24">24 Layers</option>
      </select></div>
    </div>

    <div class="section-title" style="margin-top:8px">Board Geometry</div>
    <div class="field-row">
      <div class="field-group"><label>Board Width (mm)</label><input type="number" id="pcbf-board-w" step="1" min="5" value="200"/></div>
      <div class="field-group"><label>Board Height (mm)</label><input type="number" id="pcbf-board-h" step="1" min="5" value="150"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Panel Width (mm)</label><input type="number" id="pcbf-panel-w" step="50" min="100" value="500"/></div>
      <div class="field-group"><label>Panel Height (mm)</label><input type="number" id="pcbf-panel-h" step="50" min="100" value="600"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Panel Utilisation (0–1)</label><input type="number" id="pcbf-panel-util" step="0.01" min="0.1" max="1" value="0.72"/></div>
      <div class="field-group"><label>Base Material Tg (°C)</label><select id="pcbf-tg">
        <option value="130">130°C — Standard FR4</option>
        <option value="150">150°C — Mid-Tg FR4</option>
        <option value="170" selected>170°C — High-Tg FR4</option>
      </select></div>
    </div>

    <div class="section-title" style="margin-top:8px">Copper & Stack-Up</div>
    <div class="field-row">
      <div class="field-group"><label>Inner Copper (oz/ft²)</label><select id="pcbf-cu">
        <option value="0.5">0.5 oz — signal layers</option>
        <option value="1" selected>1 oz — standard</option>
        <option value="2">2 oz — power/ground</option>
      </select></div>
      <div class="field-group"><label>Outer Copper (oz/ft²)</label><select id="pcbf-outer-cu">
        <option value="1" selected>1 oz — standard</option>
        <option value="2">2 oz — power</option>
        <option value="3">3 oz — high current</option>
      </select></div>
    </div>

    <div class="section-title" style="margin-top:8px">Via Technology</div>
    <div class="field-row">
      <div class="field-group"><label>Via Type</label><select id="pcbf-via-type">
        <option value="through_only">Through-hole only</option>
        <option value="through_blind">Through + Blind vias</option>
        <option value="through_blind_buried">Through + Blind + Buried</option>
        <option value="microvia_hdi" selected>Microvias (HDI laser-drilled)</option>
      </select></div>
      <div class="field-group"><label>HDI Structure</label><select id="pcbf-hdi-structure">
        <option value="none">None — standard through-vias</option>
        <option value="1plus_n_plus1" selected>1+N+1 — single build-up</option>
        <option value="2plus_n_plus2">2+N+2 — double build-up</option>
        <option value="any_layer">Any-layer HDI</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Through-Vias / Board</label><input type="number" id="pcbf-vias" step="10" min="0" value="300"/></div>
      <div class="field-group"><label>Blind Vias / Board</label><input type="number" id="pcbf-blind-vias" step="10" min="0" value="0"/></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Buried Vias / Board</label><input type="number" id="pcbf-buried-vias" step="10" min="0" value="0"/></div>
      <div class="field-group"><label>Micro-Vias / Board</label><input type="number" id="pcbf-uvias" step="50" min="0" value="200"/></div>
    </div>

    <div class="section-title" style="margin-top:8px">Design Rules & Features</div>
    <div class="field-row">
      <div class="field-group"><label>Min Trace/Space (mm)</label><select id="pcbf-trace">
        <option value="0.20">0.20 mm — standard</option>
        <option value="0.15">0.15 mm — fine pitch</option>
        <option value="0.10" selected>0.10 mm — HDI</option>
        <option value="0.075">0.075 mm — ultra-HDI</option>
      </select></div>
      <div class="field-group"><label>Surface Finish</label><select id="pcbf-finish">
        <option value="hasl">HASL (leaded)</option>
        <option value="hasl_lf">HASL Lead-Free</option>
        <option value="osp">OSP</option>
        <option value="enig" selected>ENIG (automotive std)</option>
        <option value="enepig">ENEPIG (wire bond)</option>
        <option value="iteq">ITEQ / ImAg</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group"><label>Solder Mask Colour</label><select id="pcbf-solder-mask">
        <option value="green" selected>Green (standard)</option>
        <option value="black">Black</option>
        <option value="white">White</option>
        <option value="red">Red</option>
        <option value="blue">Blue</option>
      </select></div>
      <div class="field-group"><label>Silkscreen Sides</label><select id="pcbf-silkscreen">
        <option value="0">None</option>
        <option value="1">1 side</option>
        <option value="2" selected>2 sides</option>
      </select></div>
    </div>
    <div class="field-row" style="margin-top:6px">
      <div class="field-group" style="display:flex;align-items:center;gap:8px;padding-top:18px">
        <input type="checkbox" id="pcbf-impedance" checked/>
        <label for="pcbf-impedance" style="font-weight:normal">Impedance controlled (+18%)</label>
      </div>
      <div class="field-group" style="display:flex;align-items:center;gap:8px;padding-top:18px">
        <input type="checkbox" id="pcbf-bga"/>
        <label for="pcbf-bga" style="font-weight:normal">Fine-pitch BGA ≤0.65 mm</label>
      </div>
    </div>

    <div class="section-title" style="margin-top:8px">Testing & Inspection</div>
    <div class="field-row">
      <div class="field-group"><label>Test Method</label><select id="pcbf-test-method">
        <option value="none">None</option>
        <option value="aoi_only">AOI only</option>
        <option value="flying_probe" selected>Flying Probe (electrical)</option>
        <option value="ict_fixtureless">ICT Fixtureless</option>
        <option value="ict_fixture">ICT Bed-of-Nails Fixture</option>
        <option value="ict_xray">ICT + X-Ray (BGA/CSP)</option>
      </select></div>
      <div class="field-group"><label>Fab Yield Override (0–1, leave 0 for auto)</label><input type="number" id="pcbf-yield" step="0.01" min="0" max="1" value="0"/></div>
    </div>

    <div class="section-title" style="margin-top:8px">NRE & Amortisation</div>
    <div class="field-row">
      <div class="field-group"><label>NRE Cost (£)</label><input type="number" id="pcbf-nre" step="100" min="0" value="2500"/></div>
      <div class="field-group"><label>Amortisation Volume</label><input type="number" id="pcbf-amort" step="1000" min="1" value="5000"/></div>
    </div>`;
}

export function collectPCBFabInput(): UniversalStackInput {
  const yieldOverride = num('pcbf-yield');
  const drivers = computePCBFabDrivers({
    layers:               parseInt(sel('pcbf-layers')) || 8,
    boardWidthMm:         num('pcbf-board-w') || 200,
    boardHeightMm:        num('pcbf-board-h') || 150,
    panelWidthMm:         num('pcbf-panel-w') || 500,
    panelHeightMm:        num('pcbf-panel-h') || 600,
    panelUtilization:     num('pcbf-panel-util') || 0.72,
    technology:           sel('pcbf-technology') as any,
    baseMaterialTg:       parseInt(sel('pcbf-tg')) || 170,
    copperWeightOz:       parseFloat(sel('pcbf-cu')) || 1,
    outerCopperWeightOz:  parseFloat(sel('pcbf-outer-cu')) || 1,
    viaType:              sel('pcbf-via-type') as any,
    throughViaCount:      num('pcbf-vias'),
    blindViaCount:        num('pcbf-blind-vias'),
    buriedViaCount:       num('pcbf-buried-vias'),
    microViaCount:        num('pcbf-uvias'),
    hdiStructure:         sel('pcbf-hdi-structure') as any,
    minTraceSpaceMm:      parseFloat(sel('pcbf-trace')) || 0.10,
    surfaceFinish:        sel('pcbf-finish') as any,
    solderMaskColor:      sel('pcbf-solder-mask') as any,
    silkscreenSides:      parseInt(sel('pcbf-silkscreen')) || 2,
    impedanceControlled:  chk('pcbf-impedance'),
    hasFinePitchBGA:      chk('pcbf-bga'),
    testMethod:           sel('pcbf-test-method') as any,
    qualityGrade:         sel('pcbf-quality') as any,
    region:               sel('pcbf-region') as any,
    nreCost:              num('pcbf-nre'),
    amortizationVolume:   num('pcbf-amort') || 1,
    fabYieldOverride:     yieldOverride > 0 ? yieldOverride : undefined,
  });
  return { ...getUniversalTail(), rawMaterial: drivers.rawMaterial, operations: drivers.operations, tooling: drivers.tooling };
}
