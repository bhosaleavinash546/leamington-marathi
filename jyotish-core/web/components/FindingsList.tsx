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
  const t = useTranslations('milan');
  const chart = useTranslations('chart');

  const render = (findings: Finding[], heading: string, id: string) => {
    if (findings.length === 0) return null;
    return (
      <section className="card" aria-labelledby={id}>
        <h2 id={id}>{heading}</h2>
        <ul className="findings">
          {findings.map((finding) => (
            <li key={`${finding.key}-${finding.ruleset ?? ''}`} className="findings__item">
              <p className="findings__head">
                <strong>{t.has(finding.key) ? t(finding.key) : finding.key}</strong>
                {finding.strength ? <span className="tag">{finding.strength}</span> : null}
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
      {render(yogas, chart('kundali'), 'yogas-heading')}
      {render(doshas, t('mangal_dosha'), 'doshas-heading')}
    </>
  );
}
