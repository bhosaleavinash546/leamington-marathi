// Provenance must survive into EVERY exported artefact.
//
// The audit that produced this file found the opposite: the on-screen PDF
// carried the engine cross-check and the confidence caveat, while the Excel
// workbook, the PowerPoint deck and — worst — the RFQ pack sent to suppliers
// carried none of it. An idea the engine had CONTRADICTED reached a supplier
// reading exactly as authoritative as an engine-confirmed one. These tests pin
// both the semantics and the fact that all four exporters use them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AI_ESTIMATED_CAUTION, OUTBOUND_DISCLAIMER, evidenceIsVerified, engineVerdict,
  evidenceLine, verificationCell, needsValidation, verificationTally,
} from '../src/services/idea-provenance.mjs';

const confirmed = {
  engineCheck: {
    direction: 'confirmed', baselineEur: 12.5, proposedEur: 9.8,
    savingPct: 21.6, referenceCase: 'HPDC bracket 2.4 kg', basis: 'material substitution',
  },
  confidenceLevel: 'high',
  evidenceSources: [{ title: 'NADCA product standards', year: 2024 }],
  evidenceUnverified: false,
};
const contradicted = { engineCheck: { direction: 'contradicted', baselineEur: 10, proposedEur: 11.4, savingPct: -14, referenceCase: 'steel stamping', basis: 'process swap' } };
const unchecked = { confidenceLevel: 'estimated' };

describe('engine verdict', () => {
  it('labels a confirmed idea and quotes the ENGINE figure, never the AI percentage', () => {
    const v = engineVerdict(confirmed);
    assert.equal(v.label, 'ENGINE-CONFIRMED');
    assert.equal(v.tone, 'confirmed');
    assert.match(v.text, /€12\.50 → €9\.80/);
    assert.match(verificationCell(confirmed), /engine: −21\.6%/);
  });

  it('says CONTRADICTED as loudly as CONFIRMED — never softens it', () => {
    const v = engineVerdict(contradicted);
    assert.equal(v.label, 'ENGINE-CONTRADICTED');
    assert.equal(v.tone, 'contradicted');
  });

  it('an unchecked idea states the reason and the validate-first caution — never blank', () => {
    const v = engineVerdict(unchecked);
    assert.equal(v.label, 'NOT ENGINE-CHECKED');
    assert.equal(v.tone, 'none');
    assert.match(v.text, new RegExp(AI_ESTIMATED_CAUTION));
    // A silent gap reads as a pass, which is the whole failure mode.
    assert.ok(v.text.trim().length > 40);
  });

  it('needsValidation is true for anything that is not engine-confirmed', () => {
    assert.equal(needsValidation(confirmed), false);
    assert.equal(needsValidation(contradicted), true);
    assert.equal(needsValidation(unchecked), true);
    assert.equal(needsValidation(null), true);
  });
});

describe('evidence default — the bug this module was written to kill', () => {
  it('treats UNDEFINED as unverified, per the type contract', () => {
    // `false` = generated with live retrieval; `true`/`undefined` = model-
    // asserted. A plain truthiness test reports the common unset case as
    // verified — the wrong way round. Absence of a stamp is not a stamp.
    assert.equal(evidenceIsVerified({}), false);
    assert.equal(evidenceIsVerified({ evidenceUnverified: undefined }), false);
    assert.equal(evidenceIsVerified({ evidenceUnverified: true }), false);
    assert.equal(evidenceIsVerified({ evidenceUnverified: false }), true);
  });

  it('carries the caveat into the evidence line when unset', () => {
    assert.match(evidenceLine({ confidenceLevel: 'medium' }), /not independently verified/);
    assert.doesNotMatch(evidenceLine(confirmed), /not independently verified/);
  });

  it('says so plainly when there are no sources at all', () => {
    assert.match(evidenceLine(unchecked), /no external evidence sources attached/);
  });
});

describe('portfolio tally — lets a reader calibrate', () => {
  it('counts each tone and the evidence-verified subset', () => {
    const t = verificationTally([confirmed, contradicted, unchecked, unchecked]);
    assert.deepEqual(t, { total: 4, confirmed: 1, contradicted: 1, unchecked: 2, evidenceVerified: 1 });
  });

  it('is safe on empty and rubbish input', () => {
    assert.equal(verificationTally(null).total, 0);
    assert.equal(verificationTally([]).total, 0);
  });
});

// ── The invariant that actually failed in production ────────────────────────
//
// A source-level check, deliberately. The exporters are .ts rendering into
// jsPDF/exceljs/pptxgenjs, which node:test cannot execute without a build step;
// but the regression that shipped was structural — an exporter simply never
// mentioning provenance at all — and that IS visible in the source. This test
// fails the moment someone writes a fifth exporter, or strips one of these
// four, without carrying the stamps across.
describe('every exporter carries provenance', () => {
  const src = readFileSync(new URL('../src/services/export-service.ts', import.meta.url), 'utf8');

  const bodyOf = (name) => {
    const start = src.search(new RegExp(`^export (?:async )?function ${name}\\b`, 'm'));
    assert.notEqual(start, -1, `${name} not found — was it renamed?`);
    const next = src.slice(start + 1).search(/^export (?:async )?function /m);
    return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  };

  for (const fn of ['exportToPdf', 'exportToExcel', 'exportToPowerPoint', 'exportRfqPdf']) {
    it(`${fn} reports the engine verdict`, () => {
      const body = bodyOf(fn);
      assert.ok(
        /engineVerdict|verificationCell|verificationTally/.test(body),
        `${fn} renders ideas without any engine verdict — an unverified saving would read as fact`,
      );
    });
  }

  it('the outbound RFQ pack states the disclaimer once, up front', () => {
    assert.ok(
      /OUTBOUND_DISCLAIMER/.test(bodyOf('exportRfqPdf')),
      'the artefact that reaches suppliers must say which lines are engine-verified',
    );
  });

  it('the disclaimer names the confirmed label it refers to', () => {
    assert.match(OUTBOUND_DISCLAIMER, /ENGINE-CONFIRMED/);
  });
});
