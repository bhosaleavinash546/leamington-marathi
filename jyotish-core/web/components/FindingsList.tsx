import { useTranslations } from 'next-intl';
import type { Finding } from '@/lib/api';
import { EvidenceAffordance } from './EvidenceAffordance';

/**
 * Yogas and doshas, each with its evidence affordance.
 *
 * CLAUDE.md 12: "Every interpretive sentence in the UI can be traced to a
 * placement via the evidence affordance." A finding rendered without one would
 * break that, so the affordance is part of this component rather than something a
 * page opts into.
 *
 * A dosha whose `present` is false is still rendered, with its reasoning: an
 * absent dosha is a useful thing for a reader to see stated, and hiding the
 * negative cases would make the list look like a list of afflictions.
 */
export function FindingsList({
  yogas,
  doshas,
}: {
  yogas: Finding[];
  doshas: Finding[];
}) {
  // A finding key may be named in `combination` (chart yogas) or `dosha`, with
  // `milan` kept as a tail fallback. Looking findings up in `milan` alone left 29
  // of 33 rule keys reaching the reader as Latin snake_case (audit F-005); the
  // order here mirrors `api/locale.py:FINDING_NAMESPACES`, and the locale gate
  // fails the build if a rule key is missing from all three.
  const tCombination = useTranslations('combination');
  const tDosha = useTranslations('dosha');
  const t = useTranslations('milan');
  const common = useTranslations('common');
  const chart = useTranslations('chart');

  const label = (key: string) => {
    if (tCombination.has(key)) return tCombination(key);
    if (tDosha.has(key)) return tDosha(key);
    return t.has(key) ? t(key) : key;
  };

  const render = (findings: Finding[], heading: string, id: string) => {
    if (findings.length === 0) return null;
    return (
      <section className="card" aria-labelledby={id}>
        <h2 id={id}>{heading}</h2>
        <ul className="findings">
          {findings.map((finding) => (
            <li key={`${finding.key}-${finding.ruleset ?? ''}`} className="findings__item">
              <p className="findings__head">
                <strong>{label(finding.key)}</strong>
                {finding.strength ? (
                  <span className="tag">
                    {common.has(finding.strength) ? common(finding.strength) : finding.strength}
                  </span>
                ) : null}
                {/*
                  शास्त्र or परंपरा, visible rather than folded into the collapsed
                  evidence panel. The rule table always knew which a rule was; it
                  reached the reader only as an English citation behind a
                  disclosure (audit F-014), so the one signal distinguishing
                  doctrine from traditional practice was the one they could not
                  read.
                */}
                {finding.provenance ? (
                  <span
                    className={`tag tag--${finding.provenance}`}
                    title={common(`${finding.provenance}_note`)}
                  >
                    {common(finding.provenance)}
                  </span>
                ) : null}
                {finding.present === false ? (
                  <span className="tag tag--absent">{t('exception')}</span>
                ) : null}
              </p>
              <EvidenceAffordance
                evidence={finding.evidence}
                citation={finding.citation}
                ruleset={finding.ruleset}
              />
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <>
      {/* The yoga list was headed जन्मकुंडली — the name of the whole sheet — and
          the dosha list `t('mangal_dosha')`, a key `milan` does not define, so it
          rendered as the literal string `milan.mangal_dosha`. */}
      {render(yogas, chart('yogas_present'), 'yogas-heading')}
      {render(doshas, chart('doshas_present'), 'doshas-heading')}
    </>
  );
}
