import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Github, ExternalLink, Info } from 'lucide-react';
import HomePage from '../src/pages/HomePage';
import { REPO_URL, DEPLOY_DOC_URL } from '../src/lib/site-mode';
import '../src/index.css';

/**
 * The public shop window: BrainSpark's landing page, and nothing else.
 *
 * GitHub Pages serves static files, so there is no server here — no API, no
 * database, no Anthropic key, none of the sixteen tools. Rather than ship a
 * shell of the app whose every button fails, this build renders the one page
 * that is honest without a backend, wrapped in a shell that says so plainly
 * and points at the source and the deployment guide.
 *
 * `HomePage` is the real component, not a copy, so the page cannot drift away
 * from the product. Its two API calls (live prices, marketplace count) already
 * degrade to nothing when they fail; the stub below stops them reaching the
 * network at all, so the console stays clean.
 */
export default function StaticSite() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <header className="sticky top-0 z-nav bg-navy-950/85 backdrop-blur border-b border-white/10">
          <div className="max-w-6xl mx-auto px-6 lg:px-8 h-16 flex items-center gap-4">
            <img src={`${import.meta.env.BASE_URL}brainspark-logo.svg`} alt="" className="w-8 h-8" />
            <span className="text-lg font-bold text-white">Brain<span className="text-gold-400">Spark</span></span>
            <span className="hidden sm:inline text-2xs font-semibold uppercase tracking-widest text-slate-500 border border-white/10 rounded-full px-2.5 py-1">
              Preview
            </span>
            <a
              href={REPO_URL} target="_blank" rel="noreferrer"
              className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-navy-950 bg-gold-400 hover:bg-gold-300 px-4 py-2 rounded-lg transition-ui"
            ><Github size={16} /> Source</a>
          </div>
        </header>

        {/* Said once, at the top, in the reader's first three seconds — not
            buried in a footer where someone could click around for a minute
            before working out why nothing responds. */}
        <div className="bg-gold-500/[0.08] border-b border-gold-500/20">
          <div className="max-w-6xl mx-auto px-6 lg:px-8 py-3 flex items-start gap-2.5 text-[13px] text-gold-200">
            <Info size={15} className="shrink-0 mt-0.5 text-gold-400" />
            <p className="measure">
              This is a <b className="font-semibold">design preview</b> of BrainSpark&rsquo;s landing page.
              The tool itself is a Node service with a database and a CAD engine, so it cannot run on
              GitHub Pages &mdash; nothing here is interactive.{' '}
              <a href={DEPLOY_DOC_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-gold-100">
                Running the real thing takes one container
              </a>.
            </p>
          </div>
        </div>

        <HomePage />

        <footer className="border-t border-white/10 bg-navy-950">
          <div className="max-w-6xl mx-auto px-6 lg:px-8 py-10 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
            <p className="text-[13px] text-slate-500 measure">
              BrainSpark &mdash; AI-assisted cost engineering for automotive. Every cost figure comes
              from a deterministic engine; the AI proposes and explains, and says so when the engine
              could not check it.
            </p>
            <div className="flex gap-4 text-[13px] shrink-0">
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-slate-300 hover:text-gold-300 transition-colors">
                <Github size={15} /> Repository
              </a>
              <a href={DEPLOY_DOC_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-slate-300 hover:text-gold-300 transition-colors">
                <ExternalLink size={15} /> Deploy it
              </a>
            </div>
          </div>
        </footer>
      </BrowserRouter>
    </MotionConfig>
  );
}
