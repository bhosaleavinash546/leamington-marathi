// Hostile fixture for the Horizon foresight report: the REAL full register
// (75 cards — worst-case length, and register prose genuinely contains −, →, µ
// so the WinAnsi sanitizer is exercised on production data), plus an AI layer
// with deliberately nasty strings.
import { foresightFor } from '../../foresight.mjs';
import { positionCandidates } from '../../foresight-research.mjs';

const base = foresightFor({});   // every technology, all lanes

const allCards = [...base.horizons.H1, ...base.horizons.H2, ...base.horizons.H3];

// Researched candidates with hostile prose + a very long URL: the forward
// research page must wrap and paginate like every other section.
const RESEARCHED = {
  candidates: positionCandidates(Array.from({ length: 5 }, (_, i) => ({
    name: `Researched candidate ${i + 1} — µ-scale ↓ cost architecture with an unusually long technology name`,
    whatItIs: 'A rotary→linear actuator converts wheel motion ≥ 150 W into recovered charge while the same machine pushes; the mechanism description is deliberately long to stress paragraph wrapping across the card boundary and force pagination in the researched section. '.repeat(2),
    replaces: 'The incumbent passive part it displaces (≈€40/vehicle content)',
    trlEstimate: 3 + i, adoptionEstimatePct: i, ceilingEstimatePct: 15 + i * 8,
    earliestProduction: `Pilot programme ${2028 + i} → limited series`,
    players: ['Supplier A', 'Supplier B (China)', 'OEM C'],
    whyItMatters: 'Moves ~€12/vehicle of content from mechanical to electronic sourcing — the cost engineer’s exposure changes commodity.',
    sourceUrl: `https://example.test/a-deliberately-long-source-url-path/that-should-truncate-cleanly/segment-${i}?q=future+technology+roadmap`,
  })), { now: 2026 }),
  landscapeNote: 'The retrieved evidence points ↓ toward electrification of this subsystem, with Chinese suppliers setting the cost floor. '.repeat(3),
  evidenceGaps: 'No source established volume timing or a €/unit figure; TRL claims come from supplier press material, not measured production data.',
  trigger: 'thin-register-coverage',
  note: 'AI-RESEARCHED, NOT CURATED.',
};

export const FORESIGHT_RESULT = {
  ...base,
  researched: RESEARCHED,
  query: 'BEV HV battery / EDU — full landscape ↓↑→ "hostile" <query>',
  narrative: {
    briefing: 'Adoption ↑ across phosphate chemistries → pack cost ↓20-30%; the ≈€8/kWh delta between LFP and NMC continues to compress. '.repeat(6),
    signals: allCards.slice(0, 6).map((c) => ({ techId: c.id, watch: `Watch ${c.players[0]} SOP announcements → volume ≥ 100k/yr with Δcost ≤ 5% (µ-level tolerance)` })),
  },
  note: base.note ?? 'Positions from the curated register; projections are Bass/Wright models, labelled as modelled.',
};

export const FORESIGHT_PANEL = {
  panel: [
    { persona: 'The Contrarian', focus: 'over-hype and history', critiques: allCards.slice(0, 8).map((c) => ({ techId: c.id, stance: 'challenge', note: `Solid-state-style slippage risk → treat ${c.name} TRL ${c.trl} claim with ±2y error bars; adoption ↓ scenarios ignored`.slice(0, 200) })) },
    { persona: 'Supply-Chain Realist', focus: 'supplier readiness and capex', critiques: allCards.slice(0, 8).map((c) => ({ techId: c.id, stance: 'caution', note: 'Tooling capex ≥ €40M and PPAP timelines → mid-decade at best; supplier base thin (2-3 quals) — a very long critique line to stress wrapping behaviour in the report body '.slice(0, 220) })) },
    { persona: 'Regulatory Analyst', focus: 'regulation timing risk', critiques: allCards.slice(0, 8).map((c) => ({ techId: c.id, stance: 'agree', note: 'Anchor dates firm; carve-out probability low → positioning holds' })) },
  ],
  note: 'Panel stances are AI judgment on soft axes grounded in the deterministic cards. The positions themselves are unchanged by the panel.',
};
