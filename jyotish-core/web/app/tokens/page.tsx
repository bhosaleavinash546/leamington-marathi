import type { Metadata } from 'next';
import './token-sheet.css';

/**
 * The token sheet — DESIGN.md §10 Phase A.
 *
 * > a single static "token sheet" page rendering every token, every graha chip
 * > in both themes, and a full Devanagari + Latin type specimen with both
 * > numeral systems.
 *
 * Deliberately outside `[locale]`: it is a design artifact, not a product
 * screen, so it carries no locale routing, no disclaimer and no chart. It exists
 * to be looked at and argued with.
 *
 * Both themes render on one page rather than behind a toggle, because the point
 * is comparison — a token that works in one and fails in the other is exactly
 * what this sheet is for, and a toggle hides that.
 */

export const metadata: Metadata = { title: 'Token sheet — jyotish' };

const SURFACE = ['paper', 'paper-sunk'] as const;
const INK = ['ink', 'ink-muted', 'rule', 'rule-interactive'] as const;
const SIGNAL = ['sindoor', 'sindoor-wash'] as const;

/**
 * Graha identity. Colour is never the sole channel (§2.1, §8) — the marker is a
 * colour chip *beside* the Devanagari abbreviation, not behind it.
 *
 * The first cut put the abbreviation inside the coloured chip, and screenshotting
 * it killed the idea: the glyph sat at 1.37:1 on Saturn in light mode and 1.04:1
 * on the Moon in dark, because a fill dark enough to read against paper is one
 * that swallows ink text. Exactly the tokens needing the outline for the surface
 * gate were the ones whose own glyph disappeared. Splitting the two channels
 * apart fixes both at once and needs no per-token text colour table.
 */
const GRAHA = [
  { key: 'sun', deva: 'र', abbr: 'रवि', latin: 'Su' },
  { key: 'moon', deva: 'चं', abbr: 'चंद्र', latin: 'Mo' },
  { key: 'mars', deva: 'मं', abbr: 'मंगळ', latin: 'Ma' },
  { key: 'mercury', deva: 'बु', abbr: 'बुध', latin: 'Me' },
  { key: 'jupiter', deva: 'गु', abbr: 'गुरू', latin: 'Ju' },
  { key: 'venus', deva: 'शु', abbr: 'शुक्र', latin: 'Ve' },
  { key: 'saturn', deva: 'श', abbr: 'शनी', latin: 'Sa' },
  { key: 'rahu', deva: 'रा', abbr: 'राहू', latin: 'Ra' },
  { key: 'ketu', deva: 'के', abbr: 'केतू', latin: 'Ke' },
];

/** Measured against both surfaces, worst case. `npm run audit:contrast`
 *  regenerates these; they are stated rather than computed at runtime so the
 *  sheet shows what was actually verified, not what the browser happens to do. */
type Contrast = { light: number; dark: number };
const CONTRAST: Record<string, Contrast | undefined> = {
  sun: { light: 4.19, dark: 3.42 },
  moon: { light: 1.07, dark: 13.42 },
  mars: { light: 6.03, dark: 2.38 },
  mercury: { light: 5.11, dark: 2.81 },
  jupiter: { light: 2.52, dark: 5.69 },
  venus: { light: 1.14, dark: 12.55 },
  saturn: { light: 11.16, dark: 1.28 },
  rahu: { light: 4.43, dark: 3.23 },
  ketu: { light: 4.64, dark: 3.09 },
};

/* Conjuncts and matras above cap-height and below the baseline — the strings
 * DESIGN.md §5.2 names for testing reveal masks. */
const SPECIMEN = 'कृत्तिका ज्येष्ठा श्रवण अनुराधा उत्तराषाढा';
const CONJUNCTS = 'क्ष त्र ज्ञ श्र द्व ट्ट ङ्क ह्म';

function Swatches({ names, label }: { names: readonly string[]; label: string }) {
  return (
    <section>
      <h3>{label}</h3>
      <div className="swatches">
        {names.map((n) => (
          <div key={n} className="swatch">
            <div className="swatch__chip" style={{ background: `var(--${n})` }} />
            <code>--{n}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function GrahaChips({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <table className="graha-table">
      <caption>ग्रह identity — {theme}</caption>
      <thead>
        <tr>
          <th scope="col">chip</th>
          <th scope="col">token</th>
          <th scope="col">Devanagari</th>
          <th scope="col">contrast</th>
        </tr>
      </thead>
      <tbody>
        {GRAHA.map((g) => {
          const ratio = CONTRAST[g.key]?.[theme] ?? 0;
          const needsOutline = ratio < 3;
          return (
            <tr key={g.key}>
              <td>
                <span className="graha-id">
                  <span
                    className={`graha-chip${needsOutline ? ' graha-chip--outlined' : ''}`}
                    style={{ background: `var(--graha-${g.key})` }}
                    aria-hidden="true"
                  />
                  <span className="graha-id__glyph">{g.deva}</span>
                </span>
              </td>
              <td>
                <code>--graha-{g.key}</code>
              </td>
              <td>{g.abbr}</td>
              <td className={needsOutline ? 'fail' : 'pass'}>
                {ratio.toFixed(2)}:1 {needsOutline ? '· outlined' : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Panel({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="panel" data-theme={theme}>
      <h2>{theme}</h2>
      <Swatches names={SURFACE} label="surface" />
      <Swatches names={INK} label="ink and rule" />
      <Swatches names={SIGNAL} label="signal — sindoor carries meaning only" />
      <GrahaChips theme={theme} />

      <section>
        <h3>type specimen</h3>
        <p className="specimen specimen--display">जन्मपत्रिका</p>
        <p className="specimen specimen--body">{SPECIMEN}</p>
        <p className="specimen specimen--body">{CONJUNCTS}</p>
        <p className="specimen specimen--data">
          मिथुन ०°१७' · कुंभ १९°५९' · वृषभ ११°४५'
        </p>
        <p className="specimen specimen--data">Gemini 0°17' · Aquarius 19°59'</p>
        <p className="specimen specimen--latin">
          The quick brown fox — 0123456789 · ०१२३४५६७८९
        </p>
      </section>

      <section>
        <h3>tabular alignment — both numeral systems (§5.5)</h3>
        <table className="figures">
          <tbody>
            <tr>
              <td>०१२३४५६७८९</td>
              <td>१११११</td>
              <td>००:००</td>
            </tr>
            <tr>
              <td>९८७६५४३२१०</td>
              <td>८८८८८</td>
              <td>२३:५९</td>
            </tr>
            <tr>
              <td>0123456789</td>
              <td>11111</td>
              <td>00:00</td>
            </tr>
            <tr>
              <td>9876543210</td>
              <td>88888</td>
              <td>23:59</td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          Columns must not shift between rows or between numeral systems.
        </p>
      </section>

      <section>
        <h3>rule, radius, sunk surface</h3>
        <div className="ruled">
          <div>hairline above and below, --rule</div>
          <div>--paper-sunk row</div>
          <div>hairline</div>
        </div>
        <button className="control" type="button">
          control — 2px radius, --rule-interactive edge
        </button>
      </section>
    </div>
  );
}

export default function TokenSheet() {
  return (
    <main className="token-sheet">
      <header>
        <h1>Token sheet</h1>
        <p className="note">
          DESIGN.md §10 Phase A. Every token, both themes, no components. Read
          alongside <code>docs/design/DIRECTION.md</code>, which records what has
          <strong> not</strong> been verified against a printed page.
        </p>
      </header>
      <div className="panels">
        <Panel theme="light" />
        <Panel theme="dark" />
      </div>
      <section className="motion">
        <h2>motion tokens</h2>
        <p className="note">
          Values only. Nothing on this page animates: §3.1 bans ambient motion,
          and a token sheet has no state change to explain.
        </p>
        <table className="figures">
          <tbody>
            <tr>
              <td>
                <code>--dur-micro</code>
              </td>
              <td>120ms</td>
              <td>press, toggle, focus</td>
            </tr>
            <tr>
              <td>
                <code>--dur-enter</code>
              </td>
              <td>200ms</td>
              <td>element enter/exit</td>
            </tr>
            <tr>
              <td>
                <code>--dur-layout</code>
              </td>
              <td>320ms</td>
              <td>panel, sheet, layout shift</td>
            </tr>
            <tr>
              <td>
                <code>--dur-orch</code>
              </td>
              <td>500ms</td>
              <td>orchestrated reveal — the ceiling</td>
            </tr>
            <tr>
              <td>
                <code>--dur-chart-draw</code>
              </td>
              <td>800ms</td>
              <td>the one permitted exception (§3.2)</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
