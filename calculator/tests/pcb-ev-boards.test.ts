/**
 * Round 3 (9 Oct 2026): MHEV / PHEV / BEV vehicle boards. The ECU-library merge adds to what earlier rounds found —
 * teardown links and board-cost evidence are never wiped by a later research file.
 */
import { describe, it, expect } from 'vitest';
import { mergeEcuResearch } from '../scripts/pcb-ecu-library-merge.js';

describe('ECU library merge keeps earlier rounds', () => {
  const lib = () => ({
    powertrains: [{ id: 'BEV400', ecus: ['OBC'] }],
    ecus: [{ ecu: 'OBC', name: 'On-board charger', function: 'f', powertrains: ['BEV400'],
      keyIcs: [{ role: 'MCU', examples: ['A'], source: 'https://a' }],
      teardowns: [{ title: 'old', url: 'https://old', finding: 'x' }] }],
    boardCostEvidence: [{ claim: 'earlier', url: 'https://e' }],
    notes: [] as string[],
  });

  it('adds teardowns and board-cost evidence instead of replacing them (each once)', () => {
    const l = lib();
    mergeEcuResearch(l as never, { domain: 'ev-charging', researched: '2026-10-09', ecus: [{ ecu: 'OBC', name: 'On-board charger', function: 'f',
      powertrains: ['BEV400'], keyIcs: [], teardowns: [{ title: 'old again', url: 'https://old', finding: 'x' }, { title: 'new', url: 'https://new', finding: 'y' }] }],
      boardCostEvidence: [{ claim: 'earlier', url: 'https://e' }, { claim: 'later', url: 'https://l' }], notes: ['n'] });
    expect(l.ecus[0].teardowns.map(t => t.url)).toEqual(['https://old', 'https://new']);
    expect(l.boardCostEvidence.map(x => x.claim)).toEqual(['earlier', 'later']);
    expect(l.notes).toEqual(['ev-charging (2026-10-09): n']);
  });
});
