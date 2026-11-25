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
} satisfies Record<string, OperationFigure>;

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
