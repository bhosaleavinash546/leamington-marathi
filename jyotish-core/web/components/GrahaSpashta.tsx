import { useTranslations } from 'next-intl';
import type { ChartFacts } from '@/lib/api';
import { applyNumerals, formatDegrees, type NumeralSystem } from '@/lib/format';

/**
 * ग्रहस्पष्ट — the planetary-positions table (DESIGN.md §10 Phase B).
 *
 * The one table a practitioner reads first, and the sheet did not have it. The
 * PDF export has carried it since Phase 5; the web view showed two diamonds and
 * went straight to the panchang, which is the difference between a patrika and a
 * picture of one.
 *
 * Column choices, all of them conventional rather than invented:
 *
 * - **Rashi and degree together**, as रास १२°४४' — the sign is what the degree is
 *   measured inside, and splitting them across two columns makes the reader
 *   recombine them on every row.
 * - **Degrees-minutes, never decimal.** A patrika prints ०°१७', and decimal
 *   degrees are the giveaway that a sheet came out of software (audit F-010).
 * - **भाव and भाव चलित side by side.** Whole-sign is the primary model
 *   (CLAUDE.md 3.3) and Chalit is the second opinion; a reader comparing the two
 *   is doing exactly what the two columns are for.
 * - **वक्री and अस्त as words, not symbols.** `(R)` means nothing on a Marathi
 *   sheet, and the retrograde flag is information a reader acts on.
 *
 * Shadbala is shown in rupas to two decimals, the classical unit, and is left
 * blank rather than zeroed when the engine did not compute it — a blank says
 * "not available", a 0.00 says "no strength", and they are different claims.
 */
export function GrahaSpashta({
  facts,
  numerals,
}: {
  facts: ChartFacts;
  numerals: NumeralSystem;
}) {
  const chart = useTranslations('chart');
  const graha = useTranslations('graha');
  const rashi = useTranslations('rashi');
  const nakshatra = useTranslations('nakshatra');
  const panchang = useTranslations('panchang');

  const grahas = facts.chart?.grahas;
  if (!grahas?.length) return null;

  const n = (text: string) => applyNumerals(text, numerals);
  const term = (t: ReturnType<typeof useTranslations>, key: string) => (t.has(key) ? t(key) : key);

  return (
    <section className="sheet-block" aria-labelledby="graha-spashta">
      <h2 id="graha-spashta">{chart('graha_spashta')}</h2>
      <div className="table-scroll">
        <table className="patrika-table patrika-table--graha">
          <thead>
            <tr>
              <th scope="col">{chart('graha')}</th>
              <th scope="col">{chart('rashi')}</th>
              <th scope="col">{chart('house')}</th>
              <th scope="col">{chart('bhava_chalit')}</th>
              <th scope="col">{panchang('nakshatra')}</th>
              <th scope="col">{chart('dignity')}</th>
              <th scope="col">{chart('shadbala')}</th>
              <th scope="col">
                {/* वक्री / अस्त. Headed by nothing: the cell content names itself,
                    and a column header here would be longer than the column. */}
                <span className="visually-hidden">
                  {chart('retrograde')} · {chart('combust')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {grahas.map((g) => {
              const bala = g.shadbala?.total_rupa;
              const marks = [
                g.retrograde ? chart('retrograde') : null,
                g.combust ? chart('combust') : null,
              ].filter(Boolean);
              return (
                <tr key={g.key}>
                  <th scope="row">{term(graha, g.key)}</th>
                  <td className="num">
                    {term(rashi, g.rashi_key)} {n(formatDegrees(g.deg_in_rashi))}
                  </td>
                  <td className="num">{n(String(g.house_whole_sign))}</td>
                  <td className="num">{n(String(g.house_chalit))}</td>
                  <td>
                    {term(nakshatra, g.nakshatra_key)} {n(String(g.pada))}
                  </td>
                  <td>{term(chart, g.dignity)}</td>
                  <td className="num">{bala === undefined ? '' : n(bala.toFixed(2))}</td>
                  <td>{marks.join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
