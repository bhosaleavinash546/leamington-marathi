// ─────────────────────────────────────────────────────────────────────────────
// Wiring-harness should-cost — the audit's #1 missing commodity (a top-3
// vehicle commodity the parametric engine could not touch: it isn't a "part
// with a process", it's copper × circuits × connectors × labour-minutes).
//
// Parametric bottom-up model, industry-standard structure:
//   material  = conductor Cu + insulation + connectors/terminals/seals + tape/conduit
//   labour    = cut/strip/crimp per circuit + connector insertion + splices +
//               layout-board assembly + electrical test   (harness assembly is
//               ~70-80% manual — that's why it lives in Mexico/N.Africa/E.Europe)
//   overhead/SG&A follow the same regional structure as the main engine.
//
// Deterministic, unit-testable, honest about being an estimate: confidence
// bands widen with circuit count (routing complexity is under-modelled).
// ─────────────────────────────────────────────────────────────────────────────
import { REGIONS, MATERIALS } from './costing-engine.mjs';

const CU_PRICE = () => MATERIALS['Copper (Cu-ETP)']?.price ?? 9.2;   // €/kg — follows the live-price bridge when active

// Typical automotive conductor mix when only a circuit count is known.
// (FLRY-B dominates; heavier sections carry power.)
const DEFAULT_GAUGE_MIX = [
  { mm2: 0.35, share: 0.62 },
  { mm2: 0.5,  share: 0.20 },
  { mm2: 0.75, share: 0.10 },
  { mm2: 2.5,  share: 0.06 },
  { mm2: 6.0,  share: 0.02 },
];

const round = (x, dp = 2) => Number(x.toFixed(dp));

/**
 * @param {object} input
 * @param {number} input.circuits         number of circuits (cut leads)
 * @param {number} [input.avgLengthM=1.8] mean circuit length in metres
 * @param {number} [input.connectors]     connector count (default circuits/6)
 * @param {number} [input.splices]        splice count (default circuits/8)
 * @param {number} [input.sealedPct=0.3]  share of connectors that are sealed (engine bay)
 * @param {Array}  [input.gaugeMix]       [{mm2, share}] overriding the default mix
 * @param {string} [input.region='Mexico'] assembly region (harness plants: MX/E.EU/N.Africa proxies)
 * @param {number} [input.annualVolume=80000]
 */
export function computeHarnessCost(input, library = undefined) {
  const REG = library?.REGIONS || REGIONS;
  const circuits = Number(input.circuits);
  if (!Number.isFinite(circuits) || circuits < 1 || circuits > 5000) throw new Error('circuits must be 1–5000');
  const avgLen = Number.isFinite(Number(input.avgLengthM)) && Number(input.avgLengthM) > 0 ? Math.min(Number(input.avgLengthM), 12) : 1.8;
  const connectors = Number.isFinite(Number(input.connectors)) && Number(input.connectors) >= 0 ? Number(input.connectors) : Math.max(2, Math.round(circuits / 6));
  const splices = Number.isFinite(Number(input.splices)) && Number(input.splices) >= 0 ? Number(input.splices) : Math.round(circuits / 8);
  const sealedPct = Math.min(1, Math.max(0, Number(input.sealedPct ?? 0.3)));
  const region = Object.hasOwn(REG, input.region) ? input.region : 'Mexico';
  const reg = REG[region];
  const vol = Number(input.annualVolume) || 80000;
  const mix = Array.isArray(input.gaugeMix) && input.gaugeMix.length ? input.gaugeMix : DEFAULT_GAUGE_MIX;

  // ── Material ──
  const wireLenM = circuits * avgLen;
  // conductor kg = Σ share·length·area·ρ(Cu 8960 kg/m³)
  const cuKg = mix.reduce((s, g) => s + wireLenM * g.share * (g.mm2 * 1e-6) * 8960, 0);
  const conductorEur = cuKg * CU_PRICE();
  // insulation ≈ 45% of conductor mass for thin-wall PVC/XLPE at ~€2.1/kg
  const insulationEur = cuKg * 0.45 * 2.1;
  // connectors: unsealed ~€0.35, sealed ~€0.95 (incl. cavity seals); terminals 2/circuit @ €0.035
  const connectorsEur = connectors * (0.35 * (1 - sealedPct) + 0.95 * sealedPct);
  const terminalsEur = circuits * 2 * 0.035;
  const splicesEur = splices * 0.08;   // ultrasonic splice consumable
  // tape/conduit/channel on trunk length (~ total wire length / bundle factor 5)
  const dressEur = (wireLenM / 6) * 0.22;
  const materialEur = conductorEur + insulationEur + connectorsEur + terminalsEur + splicesEur + dressEur;

  // ── Labour (minutes — the industry's own currency for harness work) ──
  const minutes =
    circuits * 0.28 +          // cut/strip/crimp both ends (Komax-class automation; handling only)
    connectors * 0.35 +        // cavity insertion + click checks
    splices * 0.9 +            // ultrasonic splice + tape-in
    circuits * 0.22 +          // layout-board routing + taping (progressive boards)
    2 + circuits * 0.008;      // electrical test: fixture load + per-circuit continuity
  const labourEur = (minutes / 60) * reg.labour;

  // ── Burden, packaging, SG&A — same structure as the main engine ──
  const overheadEur = labourEur * reg.overheadPct * 2.2;   // harness plants carry heavy indirect (boards, test fixtures)
  const worksEur = materialEur + labourEur + overheadEur;
  const commercialEur = worksEur * 0.04;                   // packaging + freight (bulky, low-density)
  const sgaEur = (worksEur + commercialEur) * reg.sgaPct;
  const total = worksEur + commercialEur + sgaEur;

  // NRC: layout boards + test fixtures, amortised (cheap vs. moulds)
  const nrcEur = 18_000 + connectors * 120;
  const nrcPerUnit = nrcEur / Math.max(vol * 3, 1);

  // Honesty: routing/bundle complexity is under-modelled — widen band with size.
  const bandPct = Math.min(0.35, 0.15 + circuits / 4000);

  return {
    engine: 'deterministic-harness-v1',
    inputs: { circuits, avgLengthM: avgLen, connectors, splices, sealedPct, region, annualVolume: vol },
    drivers: {
      wireLengthM: round(wireLenM, 1), copperKg: round(cuKg, 3),
      copperPricePerKg: CU_PRICE(), labourMinutes: round(minutes, 1), labourRate: reg.labour,
    },
    breakdown: {
      conductor: round(conductorEur), insulation: round(insulationEur),
      connectors: round(connectorsEur), terminals: round(terminalsEur),
      splices: round(splicesEur), tapeConduit: round(dressEur),
      labour: round(labourEur), overhead: round(overheadEur),
      commercial: round(commercialEur), sgaProfit: round(sgaEur),
      nrcAmortised: round(nrcPerUnit, 3),
    },
    totalEur: round(total + nrcPerUnit),
    band: { lowEur: round((total + nrcPerUnit) * (1 - bandPct)), highEur: round((total + nrcPerUnit) * (1 + bandPct)), pct: round(bandPct * 100, 0) },
    assumptions: [
      `Gauge mix ${mix.map(g => `${Math.round(g.share * 100)}%×${g.mm2}mm²`).join(' / ')} — override gaugeMix for power-heavy harnesses.`,
      `Labour ${round(minutes, 0)} min @ €${reg.labour}/hr (${region}) — harness assembly is ~75% manual.`,
      'Copper at the engine catalogue price; connect the live LME feed for daily movement.',
      'Routing/bundle complexity under-modelled — validate against supplier cut-sheets before commercial use.',
    ],
  };
}
