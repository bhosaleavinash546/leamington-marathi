// Phase 2: fetch-and-read, and the grounding it makes possible.
//
// The Phase 0 review found the research layer reasoned over ~200-character
// search snippets and had never once opened a page — a ceiling no prompt could
// lift. These tests pin the page-reading path, its safety guards, and the
// quote-or-drop check that turns "the model cited a link" into "the sentence it
// claims support from is really printed there".
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFetchableUrl, extractReadable, extractTitle, publishedYearFrom,
  quoteSupported, fetchArticle, fetchArticles, decodeEntities,
} from '../foresight-fetch.mjs';
import { rankSources, researchFutureTechnologies } from '../foresight-research.mjs';

const page = (body, head = '') => `<html><head>${head}</head><body>${body}</body></html>`;
const okRes = (html, ctype = 'text/html; charset=utf-8') => ({
  ok: true, status: 200,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? ctype : null) },
  text: async () => html,
});

describe('fetch safety guards', () => {
  it('refuses anything that is not a public http(s) URL', () => {
    assert.equal(isFetchableUrl('https://example.com/a').ok, true);
    for (const bad of [
      'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x',
      'http://127.0.0.1/x', 'http://localhost/x', 'https://192.168.1.9/x',
      'http://10.0.0.5/', 'http://169.254.169.254/latest/meta-data/', 'https://nodots/',
    ]) {
      assert.equal(isFetchableUrl(bad).ok, false, `${bad} should be refused`);
    }
  });

  it('a refused URL degrades to a stated reason, never a throw', async () => {
    const r = await fetchArticle('http://169.254.169.254/latest/meta-data/', { fetchImpl: async () => okRes('x') });
    assert.equal(r.ok, false);
    assert.match(r.error, /private or loopback/);
  });

  it('refuses unreadable content types instead of extracting nonsense', async () => {
    const r = await fetchArticle('https://x.example/f.pdf', { fetchImpl: async () => okRes('%PDF-1.7 binary', 'application/pdf') });
    assert.equal(r.ok, false);
    assert.match(r.error, /unreadable content-type/);
  });

  it('a page with no readable article is a failure, not an empty document', async () => {
    // Silence must not reach the model looking like "the source said nothing".
    const r = await fetchArticle('https://x.example/a', { fetchImpl: async () => okRes(page('<p>hi</p>')) });
    assert.equal(r.ok, false);
    assert.match(r.error, /no readable article text/);
  });

  it('reports HTTP failures rather than inventing content', async () => {
    const r = await fetchArticle('https://x.example/a', { fetchImpl: async () => ({ ok: false, status: 503, headers: { get: () => null } }) });
    assert.equal(r.ok, false);
    assert.match(r.error, /http 503/);
  });
});

describe('readable extraction', () => {
  const html = page(
    '<nav>home about contact</nav><article><h1>Gauge ladder</h1>'
    + '<p>0.15&nbsp;mm laminations at 960&nbsp;MPa cut iron loss 20&ndash;30%.</p>'
    + `<p>${'body text. '.repeat(80)}</p></article><footer>cookie policy</footer>`,
    '<title>Thin &amp; fast</title><meta property="article:published_time" content="2025-06-02">',
  );

  it('keeps the article and drops the furniture', () => {
    const t = extractReadable(html);
    assert.match(t, /0\.15 mm laminations at 960 MPa/);
    assert.ok(!/home about contact/.test(t), 'nav survived');
    assert.ok(!/cookie policy/.test(t), 'footer survived');
  });

  it('strips scripts and styles entirely', () => {
    const t = extractReadable(page('<script>alert("x")</script><style>.a{color:red}</style><article><p>' + 'real text. '.repeat(40) + '</p></article>'));
    assert.ok(!/alert|color:red/.test(t));
    assert.match(t, /real text/);
  });

  it('decodes entities and reads the title and date', () => {
    assert.equal(decodeEntities('20&ndash;30% &amp; more'), '20–30% & more');
    assert.equal(extractTitle(html), 'Thin & fast');
    assert.equal(publishedYearFrom(html), 2025);
  });

  it('an undated page returns null — never a guessed year', () => {
    // Guessing "probably recent" is exactly how 2016 content got presented as
    // the frontier; absent must stay absent.
    assert.equal(publishedYearFrom(page('<p>no dates here</p>'), 'https://x.example/article'), null);
    assert.equal(publishedYearFrom(page('<p>x</p>'), 'https://x.example/2021/07/thing'), 2021);
  });

  it('caps the text it hands on', () => {
    const t = extractReadable(page('<article><p>' + 'x'.repeat(50_000) + '</p></article>'), { maxChars: 1000 });
    assert.ok(t.length <= 1100);
    assert.match(t, /truncated/);
  });
});

describe('quote verification', () => {
  const text = '0.15 mm laminations at 960 MPa cut iron loss 20-30% at 20,000 rpm in current Chinese programmes.';

  it('accepts a verbatim quote', () => {
    assert.equal(quoteSupported('0.15 mm laminations at 960 MPa cut iron loss 20-30%', text), true);
  });

  it('accepts a quote whose punctuation or quoting style drifted', () => {
    assert.equal(quoteSupported('“0.15 mm laminations at 960 MPa cut iron loss 20–30%”', text), true);
  });

  it('REJECTS a fabricated figure — the whole point of the check', () => {
    assert.equal(quoteSupported('0.05 mm laminations at 2000 MPa cut iron loss 90%', text), false);
  });

  it('rejects a quote too short to prove anything', () => {
    assert.equal(quoteSupported('0.15 mm', text), false);
    assert.equal(quoteSupported('', text), false);
  });
});

describe('source ranking', () => {
  it('puts recent, technical sources first and never assumes an undated page is current', () => {
    const ranked = rankSources([
      { title: 'overview 2016', url: 'https://a.example/x' },
      { title: 'undated vendor page', url: 'https://b.example/y' },
      { title: 'SAE paper 2025 results', url: 'https://c.example/z', sourceClass: 'paper' },
      { title: 'trade news 2024', url: 'https://d.example/w' },
    ], { now: 2026, take: 4 });
    assert.equal(ranked[0].title, 'SAE paper 2025 results');
    assert.equal(ranked.at(-1).title, 'overview 2016');
    // undated ranks BELOW dated-recent, above stale
    assert.ok(ranked.findIndex((r) => r.newestYear === null) < ranked.findIndex((r) => r.newestYear === 2016));
  });
});

describe('the research pipeline reads pages and drops unsupported claims', () => {
  const ARTICLE = page('<article><h1>Thin gauge</h1><p>Xiaomi V8s EVO runs 0.15 mm laminations at 960 MPa yield in 2025 production.</p>'
    + `<p>${'Iron loss falls 22% versus 0.25 mm at 20,000 rpm. '.repeat(20)}</p></article>`,
    '<title>Thin gauge report</title><meta name="date" content="2025-09-01">');

  const deps = (candidates) => ({
    performSearch: async () => ([
      { title: 'Thin gauge report', url: 'https://good.example/2025/09/thin', snippet: 'vague blurb', source: 'good.example' },
      { title: 'same page from another probe', url: 'https://good.example/2025/09/thin', snippet: 'vague blurb', source: 'good.example' },
    ]),
    searchPatents: null,
    client: {},
    messagesJson: async () => ({ candidates, landscapeNote: 'note', evidenceGaps: 'gaps' }),
    model: 'test',
    fetchImpl: async () => okRes(ARTICLE),
    now: 2026,
  });

  const base = {
    name: 'Ultra-thin laminations', kind: 'substitution', whatItIs: 'thinner strip', replaces: '0.35 mm',
    trlEstimate: 7, adoptionEstimatePct: 3, ceilingEstimatePct: 40, earliestProduction: 'Xiaomi (2025)',
    players: ['Baowu'], whyItMatters: 'less iron loss', sourceUrl: 'https://good.example/2025/09/thin',
    quantitativeSpec: '0.15 mm at 960 MPa',
  };

  it('de-duplicates sources by URL so one page cannot fill every read slot', async () => {
    const out = await researchFutureTechnologies('stator lamination', deps([{ ...base, sourceQuote: 'Xiaomi V8s EVO runs 0.15 mm laminations at 960 MPa yield in 2025 production.' }]));
    assert.equal(out.evidence.searches.length, 1, 'the same URL was retrieved twice and not merged');
    assert.equal(out.evidence.readCount, 1);
  });

  it('keeps a candidate whose quote is really in the page it read', async () => {
    const out = await researchFutureTechnologies('stator lamination', deps([{ ...base, sourceQuote: 'Xiaomi V8s EVO runs 0.15 mm laminations at 960 MPa yield in 2025 production.' }]));
    assert.equal(out.candidates.length, 1);
    assert.equal(out.dropped, 0);
    // and the Phase 2 provenance survives positioning
    assert.equal(out.candidates[0].sourceRead, true);
    assert.match(out.candidates[0].sourceQuote, /0\.15 mm laminations/);
    assert.equal(out.candidates[0].quantitativeSpec, '0.15 mm at 960 MPa');
  });

  it('DROPS a candidate whose supporting quote is not in the page', async () => {
    const out = await researchFutureTechnologies('stator lamination', deps([
      { ...base, sourceQuote: 'Xiaomi V8s EVO runs 0.15 mm laminations at 960 MPa yield in 2025 production.' },
      { ...base, name: 'Invented tech', sourceQuote: 'Toyota ships 0.03 mm amorphous laminations at 4000 MPa across all models.' },
    ]));
    assert.equal(out.candidates.length, 1);
    assert.equal(out.candidates[0].name, 'Ultra-thin laminations');
    assert.equal(out.dropped, 1);
    assert.match(out.rejected[0].why, /quote is not present/);
  });

  it('says plainly when no search provider was configured', async () => {
    const out = await researchFutureTechnologies('stator lamination', deps([{ ...base, sourceQuote: 'Xiaomi V8s EVO runs 0.15 mm laminations at 960 MPa yield in 2025 production.' }]));
    assert.equal(out.evidence.provider.configured, false);
    assert.match(out.evidenceGaps, /No web-search provider was configured/);
    assert.match(out.evidence.readNote, /opened and read in full/);
  });

  it('without a fetch implementation it says so instead of pretending it read anything', async () => {
    const d = deps([{ ...base, sourceQuote: 'anything at all, unverifiable' }]);
    d.fetchImpl = null;
    const out = await researchFutureTechnologies('stator lamination', d);
    assert.equal(out.evidence.readCount, 0);
    assert.match(out.evidence.readNote, /had no page-fetch capability/);
    // quote-or-drop does NOT punish the model for our retrieval failure
    assert.equal(out.candidates.length, 1);
    assert.equal(out.candidates[0].sourceRead, false);
  });
});
