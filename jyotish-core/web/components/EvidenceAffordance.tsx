'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { humaniseEvidence } from '@/lib/format';

/**
 * The "why" affordance (CLAUDE.md 8).
 *
 * > Every interpretive paragraph carries a small "why" affordance exposing the
 * > `evidence` array from ChartFacts. **This is what separates a credible tool
 * > from a fortune-cookie app.**
 *
 * Two decisions follow from that sentence:
 *
 * 1. **The raw keys are shown.** A prettified rendering is offered for reading, but
 *    the verbatim key sits beside it, because the claim being traceable means the
 *    user can see the actual identifier the engine emitted — not a paraphrase of it.
 * 2. **It is a `<details>`.** Native disclosure: keyboard-operable, announced by
 *    screen readers, and it still works with JavaScript disabled. A custom
 *    popover would be prettier and would exclude people.
 *
 * A finding with no evidence renders nothing rather than an empty panel. That case
 * should be impossible — the rule engine emits evidence for every match and a test
 * asserts it — so an empty panel would be misleading rather than merely bare.
 */
export function EvidenceAffordance({
  evidence,
  citation,
  ruleset,
}: {
  evidence: string[];
  citation?: string;
  ruleset?: string | null;
}) {
  const t = useTranslations('ui');
  const tMilan = useTranslations('milan');
  const [open, setOpen] = useState(false);
  const id = useId();

  if (evidence.length === 0) return null;

  return (
    <details
      className="evidence"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary aria-controls={id}>
        <span aria-hidden="true">＊ </span>
        {open ? t('hide_evidence') : t('why')}
      </summary>
      <div id={id} className="evidence__body">
        <ul className="evidence__list">
          {evidence.map((key) => (
            <li key={key}>
              <span className="evidence__human">{humaniseEvidence(key)}</span>
              {/* The verbatim key: this is the thing that makes the claim checkable. */}
              <code className="evidence__key">{key}</code>
            </li>
          ))}
        </ul>
        {ruleset ? (
          <p className="evidence__meta">
            {tMilan('ruleset')}: <code>{ruleset}</code>
          </p>
        ) : null}
        {citation ? <p className="evidence__meta">{citation}</p> : null}
      </div>
    </details>
  );
}
