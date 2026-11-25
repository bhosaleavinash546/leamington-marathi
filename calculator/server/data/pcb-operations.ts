/**
 * PCBA operations the tool did not cost (EDU v6, Nov 2026 — audit package B): functional / end-of-line test, HV
 * insulation (hipot) test, MCU programming, press-fit, the second reflow side and the second coated side, coating
 * masking and inspection. On the EDU control board the manual should-cost carried them and the tool did not.
 *
 * Each figure says what it is: SOURCED (page read 25 Nov 2026, scripts/pcb-research/2026-11-25-v6/ems-operations.json)
 * or a COSTVISION ENGINEERING ESTIMATE (no source found — said so on every basis line). Stations follow the tool's own
 * convention for AOI / X-ray / ICT: station time × 2 × the country's electronics labour rate (operator + equipment),
 * with one-off fixtures and tools spread over the programme (annual × years).
 */

export interface OperationFigure { value: number; unit: string; kind: 'sourced' | 'engineering'; basis: string }

export const OPS = {
  /** TE servo press-fit machines (CBP-5T, CMP-6T, CMP-12T, CAP-6T): "3 – 5 sec/connector" — mid-point. */
  pressFitSecPerConnector: { value: 4, unit: 's a connector', kind: 'sourced', basis: 'TE Connectivity press-fit catalogue 2-1773452-6: servo presses "3 – 5 sec/connector" (mid-point)' },
  /** TE P100 inserts loose pins at up to 120 a minute. */
  pressFitSecPerPin: { value: 0.5, unit: 's a loose pin / press-in nut', kind: 'sourced', basis: 'TE P100 pin inserter: up to 120 pins a minute' },
  /** Press-fit tooling (support + press tool) per connector type — no price found. */
  pressFitToolGBP: { value: 1500, unit: '£ one-off a press-fit connector line', kind: 'engineering', basis: 'CostVision engineering estimate (no press-tool price found)' },
  /** Infineon AURIX TC3xx data sheet: program-flash write ≤ 1 s/MB (5 V); erase ≤ 0.5 s per 512 kB command = 1 s/MB. */
  flashWriteSecPerMB: { value: 1, unit: 's/MB', kind: 'sourced', basis: 'Infineon AURIX TC3xx data sheet (table 3-67): program flash write ≤ 1 s/MB at 5 V' },
  flashEraseSecPerMB: { value: 1, unit: 's/MB', kind: 'sourced', basis: 'Infineon AURIX TC3xx data sheet: erase ≤ 0.5 s a command of up to 512 kB' },
  /** Connect, verify and handle a board on the programmer — no source. */
  programmingHandlingSec: { value: 10, unit: 's a board', kind: 'engineering', basis: 'CostVision engineering estimate: connect, verify, unload' },
  /** Flash of an MCU whose size the BOM does not state. */
  defaultFlashMB: { value: 2, unit: 'MB', kind: 'engineering', basis: 'CostVision engineering estimate when the MCU\'s flash is not stated' },
  /** SEGGER Flasher ATE2 4-channel production programmer, list ex-VAT. */
  programmerGBP: { value: 5480 * 0.8358, unit: '£ one-off (€5,480)', kind: 'sourced', basis: 'SEGGER Flasher ATE2 4-channel, €5,480 list ex-VAT (segger.com), at the catalogue FX €1 = £0.8358' },
  /** End-of-line functional test of an automotive control board — no published time found. */
  functionalTestSec: { value: 60, unit: 's a board', kind: 'engineering', basis: 'CostVision engineering estimate (no published end-of-line test time found)' },
  functionalFixtureGBP: { value: 8000, unit: '£ one-off', kind: 'engineering', basis: 'CostVision engineering estimate for an automotive EOL fixture (a Chinese EMS list prices a simple fixture at ¥800 — not an automotive EOL bed)' },
  /** A production hipot test is commonly 1 s (a design test 60 s). */
  hipotSec: { value: 1, unit: 's a board', kind: 'sourced', basis: 'Interpower: production hipot test commonly 1 s' },
  hipotHandlingSec: { value: 5, unit: 's a board', kind: 'engineering', basis: 'CostVision engineering estimate: connect and discharge' },
  hipotTesterGBP: { value: 13980.59 / 1.27, unit: '£ one-off ($13,980.59)', kind: 'sourced', basis: 'Chroma 19032-P electrical safety analyser, new, $13,980.59 (ValueTronics), at $1.27 / £' },
  /** Stencil a side (framed): Pentalogix from $195. A second side doubles the stencil and the set-up (JLCPCB list). */
  stencilGBPPerSide: { value: 195 / 1.27, unit: '£ one-off a side ($195)', kind: 'sourced', basis: 'Pentalogix framed stencil from $195; JLCPCB charges the stencil and the set-up again for the second side' },
  /** Coating inspection: a full-surface image of a 419 × 528 mm area takes 25 s (Axxon-Mycronic) — a side. */
  coatInspectSecPerSide: { value: 25, unit: 's a coated side', kind: 'sourced', basis: 'Axxon-Mycronic coating inspection: full-surface image of 419 × 528 mm in 25 s' },
  /** Masking connectors / test points before coating — only relative figures found (boots cut masking 60–70 %). */
  maskSecPerConnector: { value: 10, unit: 's a connector masked', kind: 'engineering', basis: 'CostVision engineering estimate (only relative figures found: boots cut masking time 60–70 %, I-Connect007)' },
  // EDU audit G-07 (Nov 2026) — research scripts/pcb-research/2026-11-26-g17-g07/raw/ops-selective-staking.json, read 25 Nov 2026.
  /** Selective drag soldering: an 84-joint board in 59.3 s at 25 mm/s (Vitronics Soltec test) = 0.706 s a joint. */
  selectiveSecPerJoint: { value: 59.3 / 84, unit: 's a joint', kind: 'sourced', basis: 'Vitronics Soltec, Circuits Assembly Dec 2002: drag selective soldering of an 84-joint test board took 59.3 s at 25 mm/s (59.3 ÷ 84)' },
  /** Handling a solder pallet a cycle. */
  palletHandlingSec: { value: 20, unit: 's a board', kind: 'sourced', basis: 'Vitronics Soltec, Circuits Assembly Dec 2002: a solder carrier takes about 20 s to handle' },
  /** A solder pallet: $200–1,000 by design and size, about 20,000 cycles (wave pallet — no selective-pallet price found). */
  palletGBP: { value: 600 / 1.27, unit: '£ a pallet ($600, mid of $200–1,000)', kind: 'sourced', basis: 'Vitronics Soltec, Circuits Assembly Dec 2002: pallets $200–1,000 by design and size (mid-point), life about 20,000 cycles — a wave pallet, used for the selective pallet (no selective price found)' },
  palletCycles: { value: 20000, unit: 'cycles', kind: 'sourced', basis: 'Vitronics Soltec, Circuits Assembly Dec 2002: carrier lifetime about 20,000 cycles' },
  /** Hand soldering, lead-free: 3.5 s a joint (2.7 s tin-lead). */
  handSecPerJoint: { value: 3.5, unit: 's a joint', kind: 'sourced', basis: 'Vitronics Soltec, Circuits Assembly Dec 2002: hand soldering 3.5 s a joint lead-free (2.7 s tin-lead)' },
  /** Staking: a needle-dispensed silicone dot — no published time or dot mass found. */
  stakeSecPerDot: { value: 3, unit: 's a staking dot', kind: 'engineering', basis: 'CostVision engineering estimate (makers publish jetted-dot speeds, 49,000 an hour — not needle-dispensed silicone)' },
  stakeGramsPerDot: { value: 0.05, unit: 'g a dot', kind: 'engineering', basis: 'CostVision engineering estimate' },
  /** DOWSIL 3145 RTV (MIL-A-46146), 19 kg pail $6,967.56 = $366.71/kg. */
  stakeAdhesiveGBPPerKg: { value: 6967.56 / 19 / 1.27, unit: '£/kg ($366.71)', kind: 'sourced', basis: 'Ellsworth Adhesives: DOWSIL 3145 RTV clear, 19 kg pail $6,967.56 ($366.71/kg), at $1.27 / £' },
  /** SYLGARD 170 Fast Cure potting, 40 kg kit £2,456.87 ex VAT = £61.42/kg (UK distributor, a traded material). */
  pottingGBPPerKg: { value: 2456.87 / 40, unit: '£/kg', kind: 'sourced', basis: 'Silmid (UK): SYLGARD 170 Fast Cure silicone, 40 kg kit £2,456.87 ex VAT (£61.42/kg)' },
  /** Potting a board: load, dispense, unload — no published time; cure time is not charged (it runs unattended). */
  pottingHandlingSec: { value: 30, unit: 's a board', kind: 'engineering', basis: 'CostVision engineering estimate (load, dispense, unload); the cure runs unattended and is not charged' },
} satisfies Record<string, OperationFigure>;

/** How the through-hole joints are soldered (EDU audit G-07): the country table's rate, selective drag, or by hand. */
export type ThtMethod = 'table' | 'selective' | 'hand';
/** Through-hole joints soldered by the chosen method — null for the table rate (the caller keeps its own line). */
export function thtMethodCost(method: ThtMethod | undefined, joints: number, labourPerHr: number, progQ: number): { gbp: number; item: string; formula: string; source: string } | null {
  const j = Math.max(0, joints || 0);
  if (!j || !method || method === 'table') return null;
  const f = (v: number) => `£${v.toFixed(4)}`;
  if (method === 'hand') {
    const sec = j * OPS.handSecPerJoint.value, g = sec / 3600 * labourPerHr;
    return { gbp: g, item: 'Through-hole joints — hand soldered', source: `sourced: ${OPS.handSecPerJoint.basis}; operator at the country's labour rate`,
      formula: `${j} joints × ${OPS.handSecPerJoint.value} s = ${sec.toFixed(1)} s × £${labourPerHr.toFixed(2)}/h = ${f(g)}` };
  }
  const sec = j * OPS.selectiveSecPerJoint.value + OPS.palletHandlingSec.value;
  const pallets = Math.max(1, Math.ceil(progQ / OPS.palletCycles.value));
  const g = sec / 3600 * 2 * labourPerHr + pallets * OPS.palletGBP.value / progQ;
  return { gbp: g, item: 'Through-hole joints — selective solder', source: `sourced: ${OPS.selectiveSecPerJoint.basis}; ${OPS.palletHandlingSec.basis}; ${OPS.palletGBP.basis}; station = 2 × labour`,
    formula: `(${j} joints × ${OPS.selectiveSecPerJoint.value.toFixed(3)} s + ${OPS.palletHandlingSec.value} s pallet) = ${sec.toFixed(1)} s → ${f(sec / 3600 * 2 * labourPerHr)} + ${pallets} pallet${pallets > 1 ? 's' : ''} × £${OPS.palletGBP.value.toFixed(2)} ÷ ${progQ.toLocaleString('en-GB')} = ${f(g)}` };
}

export interface OperationsInput {
  /** Reflow sides (1 or 2). The second side repeats the line set-up per lot and needs its own stencil. */
  reflowSides?: number;
  /** Conformal-coated sides (0, 1, 2) — the coating area is a side's area × sides. */
  coatSides?: number;
  /** Press-fit connectors and loose press-fit pins / press-in nuts, and the press-fit connector lines (tools). */
  pressFitConnectors?: number; pressFitPins?: number; pressFitLines?: number;
  /** Programming seconds a board (computed from the MCUs' flash, or typed). */
  programmingSec?: number;
  /** Functional (end-of-line) test seconds a board, and whether an HV insulation test runs. */
  functionalTestSec?: number; hvTest?: boolean;
  /** How the through-hole joints are soldered (G-07) — applied by the caller to its through-hole line. */
  thtMethod?: ThtMethod;
  /** Staking dots a board (silicone, needle dispensed) and potting compound, g a board (G-07). */
  stakingDots?: number; pottingGrams?: number;
}

export interface OperationLine { item: string; gbp: number; formula: string; source: string }

/** The operations' £ a board — station time × 2 × labour + one-offs ÷ programme boards — each with its arithmetic. */
export function operationsCost(o: OperationsInput, labourPerHr: number, progQ: number, lotQ: number, batchSetupGBP: number, coatGBPPerSide: number): OperationLine[] {
  const st = (sec: number) => sec / 3600 * 2 * labourPerHr;
  const f = (v: number) => `£${v.toFixed(4)}`;
  const tag = (k: OperationFigure) => `${k.kind === 'sourced' ? 'sourced' : 'engineering estimate'}: ${k.basis}`;
  const out: OperationLine[] = [];
  const sides = Math.max(1, Math.min(2, Math.round(Number(o.reflowSides) || 1)));
  if (sides === 2) {
    const g = batchSetupGBP / lotQ + OPS.stencilGBPPerSide.value / progQ;
    out.push({ item: 'Second reflow side (set-up a lot + stencil)', gbp: g, source: `set-up: the country table's line set-up, once more a lot; ${tag(OPS.stencilGBPPerSide)}`,
      formula: `£${batchSetupGBP.toFixed(2)} ÷ ${lotQ.toLocaleString('en-GB')} boards a lot + £${OPS.stencilGBPPerSide.value.toFixed(2)} ÷ ${progQ.toLocaleString('en-GB')} = ${f(g)}` });
  }
  const coat = Math.max(0, Math.min(2, Math.round(Number(o.coatSides) || 0)));
  if (coat >= 1) {
    const extra = coat === 2 ? coatGBPPerSide : 0;   // the first side is the table's coating line
    const insp = st(coat * OPS.coatInspectSecPerSide.value);
    const masked = Math.max(0, Number(o.pressFitConnectors) || 0);
    const mask = st(masked * OPS.maskSecPerConnector.value);
    out.push({ item: `Conformal coating — ${coat === 2 ? 'second side, ' : ''}inspection${masked ? ', masking' : ''}`, gbp: extra + insp + mask,
      source: `${coat === 2 ? 'second side at the country table\'s £/cm²; ' : ''}${tag(OPS.coatInspectSecPerSide)}; ${tag(OPS.maskSecPerConnector)}; station = 2 × labour`,
      formula: `${coat === 2 ? `second side ${f(extra)} + ` : ''}${coat} × ${OPS.coatInspectSecPerSide.value} s inspection → ${f(insp)}${masked ? ` + ${masked} connectors × ${OPS.maskSecPerConnector.value} s masking → ${f(mask)}` : ''} = ${f(extra + insp + mask)}` });
  }
  const conns = Math.max(0, Number(o.pressFitConnectors) || 0), pins = Math.max(0, Number(o.pressFitPins) || 0), lines = Math.max(0, Number(o.pressFitLines) || 0);
  if (conns + pins > 0) {
    const sec = conns * OPS.pressFitSecPerConnector.value + pins * OPS.pressFitSecPerPin.value;
    const g = st(sec) + lines * OPS.pressFitToolGBP.value / progQ;
    out.push({ item: 'Press-fit', gbp: g, source: `${tag(OPS.pressFitSecPerConnector)}; ${tag(OPS.pressFitSecPerPin)}; ${tag(OPS.pressFitToolGBP)}; station = 2 × labour`,
      formula: `(${conns} × ${OPS.pressFitSecPerConnector.value} s + ${pins} × ${OPS.pressFitSecPerPin.value} s) = ${sec} s → ${f(st(sec))} + ${lines} tools × £${OPS.pressFitToolGBP.value.toLocaleString('en-GB')} ÷ ${progQ.toLocaleString('en-GB')} = ${f(g)}` });
  }
  const prog = Math.max(0, Number(o.programmingSec) || 0);
  if (prog > 0) {
    const g = st(prog) + OPS.programmerGBP.value / progQ;
    out.push({ item: 'Programming (MCU flash)', gbp: g, source: `time: the MCUs' flash × (${tag(OPS.flashWriteSecPerMB)} + erase ${OPS.flashEraseSecPerMB.value} s/MB) + ${OPS.programmingHandlingSec.value} s handling (engineering estimate) unless typed; ${tag(OPS.programmerGBP)}; station = 2 × labour`,
      formula: `${prog} s → ${f(st(prog))} + £${OPS.programmerGBP.value.toFixed(0)} ÷ ${progQ.toLocaleString('en-GB')} = ${f(g)}` });
  }
  const fct = Math.max(0, Number(o.functionalTestSec) || 0);
  if (fct > 0 || o.hvTest) {
    const hv = o.hvTest ? OPS.hipotSec.value + OPS.hipotHandlingSec.value : 0;
    const g = st(fct + hv) + (fct > 0 ? OPS.functionalFixtureGBP.value / progQ : 0) + (o.hvTest ? OPS.hipotTesterGBP.value / progQ : 0);
    out.push({ item: `Functional test${o.hvTest ? ' + HV insulation (hipot)' : ''}`, gbp: g,
      source: `${tag(OPS.functionalTestSec)} unless typed; ${tag(OPS.functionalFixtureGBP)}${o.hvTest ? `; ${tag(OPS.hipotSec)}; ${tag(OPS.hipotTesterGBP)}` : ''}; station = 2 × labour`,
      formula: `(${fct} s${o.hvTest ? ` + ${hv} s hipot` : ''}) → ${f(st(fct + hv))}${fct > 0 ? ` + £${OPS.functionalFixtureGBP.value.toLocaleString('en-GB')} fixture` : ''}${o.hvTest ? ` + £${OPS.hipotTesterGBP.value.toFixed(0)} tester` : ''} ÷ ${progQ.toLocaleString('en-GB')} = ${f(g)}` });
  }
  const dots = Math.max(0, Number(o.stakingDots) || 0);
  if (dots > 0) {
    const sec = dots * OPS.stakeSecPerDot.value, mat = dots * OPS.stakeGramsPerDot.value / 1000 * OPS.stakeAdhesiveGBPPerKg.value;
    const g = sec / 3600 * labourPerHr + mat;
    out.push({ item: 'Staking (silicone)', gbp: g, source: `${tag(OPS.stakeSecPerDot)}; ${tag(OPS.stakeGramsPerDot)}; ${tag(OPS.stakeAdhesiveGBPPerKg)}; operator at the labour rate`,
      formula: `${dots} dots × ${OPS.stakeSecPerDot.value} s → ${f(sec / 3600 * labourPerHr)} + ${dots} × ${OPS.stakeGramsPerDot.value} g × £${OPS.stakeAdhesiveGBPPerKg.value.toFixed(2)}/kg → ${f(mat)} = ${f(g)}` });
  }
  const pg = Math.max(0, Number(o.pottingGrams) || 0);
  if (pg > 0) {
    const mat = pg / 1000 * OPS.pottingGBPPerKg.value, g = st(OPS.pottingHandlingSec.value) + mat;
    out.push({ item: 'Potting', gbp: g, source: `${tag(OPS.pottingGBPPerKg)}; ${tag(OPS.pottingHandlingSec)}; station = 2 × labour`,
      formula: `${pg} g × £${OPS.pottingGBPPerKg.value.toFixed(2)}/kg → ${f(mat)} + ${OPS.pottingHandlingSec.value} s → ${f(st(OPS.pottingHandlingSec.value))} = ${f(g)}` });
  }
  return out;
}

type Line = Record<string, unknown>;
const PRESS_FIT = /press[- ]?fit|press[- ]?in/i;
/** What the BOM says about the operations: press-fit connectors / pins, MCU flash (MB), HV parts. */
export function operationsFromBom(bom: Line[]): { pressFitConnectors: number; pressFitPins: number; pressFitLines: number; mcuFlashMB: number[]; hv: boolean } {
  let conns = 0, pins = 0, lines = 0; const flash: number[] = []; let hv = false;
  for (const l of bom) {
    if (l.notFitted === true) continue;
    const text = `${String(l.description ?? '')} ${String(l.pkg ?? '')} ${String(l.catalogueDesc ?? '')}`;
    const q = Math.max(0, Number(l.qty) || 0);
    if (PRESS_FIT.test(text)) {
      if (/^(connector|through_hole)/i.test(String(l.componentType ?? '')) && !/\b(single|pin|nut|terminal)\b/i.test(String(l.description ?? '').split(',')[0])) { conns += q; lines++; }
      else pins += q;
    }
    if (/\b(mcu|microcontroller|aurix|tricore)\b/i.test(text) && /^ic_/.test(String(l.componentType ?? ''))) {
      const m = /(\d+(?:\.\d+)?)\s*MB\b[^,;]*?flash|flash[^,;]*?(\d+(?:\.\d+)?)\s*MB\b/i.exec(text);
      const mb = m ? Number(m[1] ?? m[2]) : OPS.defaultFlashMB.value;
      for (let i = 0; i < q; i++) flash.push(mb);
    }
    if (/\bHV\b|high[- ]voltage|isolated (amplifier|gate|dc)|isolat\w* .*(hv|bus)|creepage/i.test(text)) hv = true;
  }
  return { pressFitConnectors: conns, pressFitPins: pins, pressFitLines: lines, mcuFlashMB: flash, hv };
}

/** Programming seconds a board: each MCU's flash × (write + erase) s/MB, + handling once. 0 with no MCU. */
export function programmingSecFor(flashMB: number[]): number {
  if (!flashMB.length) return 0;
  return Math.round(flashMB.reduce((t, mb) => t + mb * (OPS.flashWriteSecPerMB.value + OPS.flashEraseSecPerMB.value), 0) + OPS.programmingHandlingSec.value);
}
