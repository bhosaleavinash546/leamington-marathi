// ─────────────────────────────────────────────────────────────────────────────
// The provenance badge row — ONE implementation, every surface.
//
// The honesty rules already lived in one tested place (idea-provenance.mjs).
// The RENDERING of them did not: the results page showed the engine verdict,
// the depth rubric, the arithmetic re-check, validator flags and the evidence
// citations, while the marketplace panel showed none of it, the shared report
// showed none of it, and Should-Cost, TRIZ and CAD Diff rendered the confirmed
// badge but nothing at all when the engine had not looked (Sept 2026 review,
// R-19 to R-22). A silent gap reads as a pass, which is the one thing this
// codebase refuses to do anywhere else.
//
// So: any surface that renders a saving renders this. `tests/idea-provenance-
// surfaces.test.mjs` fails when one does not.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Gauge, Layers, Calculator, AlertTriangle, ThumbsUp, Store, RefreshCw,
  FileSearch, ShieldCheck, BookOpen, FlaskConical,
} from 'lucide-react';
import PrismIcon from './icons/PrismIcon';
import { notableFlags } from '../services/idea-provenance.mjs';
import type { CostReductionIdea, ConfidenceLevel } from '../types';

const CONFIDENCE: Record<ConfidenceLevel, { label: string; cls: string; icon: typeof ShieldCheck; title: string }> = {
  verified:    { label: 'Verified',    cls: 'bg-success-500/10 text-success-400 border-success-500/30', icon: ShieldCheck,  title: 'OEM confirmed in production' },
  benchmarked: { label: 'Benchmarked', cls: 'bg-info-500/10 text-info-400 border-info-500/30',          icon: BookOpen,     title: 'Teardown / industry study data' },
  estimated:   { label: 'Estimated',   cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       icon: Calculator,   title: 'Cost-model / engineering estimate' },
  theoretical: { label: 'Theoretical', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30',    icon: FlaskConical, title: 'First-principles / analytical' },
};

const BADGE = 'flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-medium';

function Badge({ title, cls, children }: { title: string; cls: string; children: React.ReactNode }) {
  return <div title={title} className={`${BADGE} ${cls}`}>{children}</div>;
}

export interface IdeaProvenanceBadgesProps {
  idea: CostReductionIdea;
  /** 'full' shows every stamp; 'compact' shows the verdict, confidence and evidence status only. */
  variant?: 'full' | 'compact';
  className?: string;
}

/**
 * The engine verdict is ALWAYS rendered — confirmed, contradicted, or not
 * checked with the reason the pipeline recorded. Everything else appears only
 * when the pipeline actually stamped it.
 */
export default function IdeaProvenanceBadges({ idea, variant = 'full', className = '' }: IdeaProvenanceBadgesProps) {
  const ec = idea.engineCheck;
  const conf = idea.confidenceLevel ? CONFIDENCE[idea.confidenceLevel] : null;
  const ConfIcon = conf?.icon;
  const flags = variant === 'full' ? notableFlags(idea) : [];
  const unverifiedEvidence = idea.evidenceUnverified !== false && (idea.evidenceSources?.length ?? 0) > 0;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {conf && ConfIcon && (
        <Badge title={conf.title} cls={conf.cls}><ConfIcon size={10} />{conf.label}</Badge>
      )}

      {ec ? (
        <Badge
          title={`The percentage here is the ENGINE's figure for ${ec.referenceCase}, not the saving claimed above — the two answer different questions.\n\n${ec.basis}${idea.rank ? `\n\nRank factors: ${idea.rank.basis}` : ''}`}
          cls={ec.direction === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-danger-500/10 text-danger-400 border-danger-500/25'}
        >
          <Gauge size={10} />
          {ec.direction === 'confirmed' ? `Engine ✓ ${ec.savingPct > 0 ? '−' : ''}${Math.abs(ec.savingPct)}%` : 'Engine contradicts'}
        </Badge>
      ) : (
        // Absence of a badge is not the same as a pass.
        <Badge
          title={`${idea.engineCheckReason ? `Why: ${idea.engineCheckReason}.` : 'The engine had no comparable basis to test this idea against — it is not expressible as a substitution, tolerance, assembly or harness change.'} The saving is AI-estimated; validate before commercial use.`}
          cls="bg-slate-500/10 text-slate-400 border-slate-500/25"
        >
          <Gauge size={10} /> Not engine-checked
        </Badge>
      )}

      {unverifiedEvidence && (
        <Badge
          title="The sources on this idea are the model's own recollection, not retrieved and checked. Turn on web search when generating to corroborate them."
          cls="bg-amber-500/10 text-amber-400 border-amber-500/25"
        >
          <AlertTriangle size={10} /> Evidence unverified
        </Badge>
      )}

      {variant === 'full' && idea.depth && typeof idea.depth.score === 'number' && (
        <Badge
          title={`Technical depth ${idea.depth.score}/100 — deterministic rubric.\n${Object.entries(idea.depth.criteria).map(([k, c]) => `${c.met ? '✓' : '✗'} ${k}: ${c.detail}`).join('\n')}`}
          cls={idea.depth.score >= 80 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : idea.depth.score >= 50 ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-danger-500/10 text-danger-400 border-danger-500/25'}
        >
          <Layers size={10} /> Depth {idea.depth.score}
        </Badge>
      )}

      {/* THREE outcomes, three colours. `partial` is amber, not red: the basis
          names a term the checker could not price, so the computed figure is a
          floor and the shortfall is the reader's gap rather than a proven error.
          Showing it red was one of the reasons 7 of every 8 "sums off" badges
          were wrong before the Sept 2026 false-positive review. */}
      {variant === 'full' && idea.arithmetic && idea.arithmetic.status !== 'unparsed' && (
        <Badge
          title={`${idea.arithmetic.note}.\nRead as: ${idea.arithmetic.basis}`}
          cls={
            idea.arithmetic.status === 'consistent' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : idea.arithmetic.status === 'partial' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : 'bg-danger-500/10 text-danger-400 border-danger-500/25'
          }
        >
          <Calculator size={10} /> {
            idea.arithmetic.status === 'consistent' ? 'Sums check'
              : idea.arithmetic.status === 'partial' ? 'Sums are a floor'
                : `Sums off ${idea.arithmetic.deltaPct! > 0 ? '+' : ''}${idea.arithmetic.deltaPct}%`
          }
        </Badge>
      )}

      {flags.length > 0 && (
        <Badge
          title={`The deterministic validator flagged this idea:\n${flags.map(f => `• ${f}`).join('\n')}`}
          cls="bg-amber-500/10 text-amber-400 border-amber-500/25"
        >
          <AlertTriangle size={10} /> {flags.length === 1 ? '1 validator flag' : `${flags.length} validator flags`}
        </Badge>
      )}

      {variant === 'full' && idea.tasteMatch && (
        <Badge title={`Ranked higher: similar to an idea you previously approved/confirmed — "${idea.tasteMatch.title}"`} cls="bg-violet-500/10 text-violet-400 border-violet-500/25">
          <ThumbsUp size={10} /> Similar to approved
        </Badge>
      )}

      {variant === 'full' && idea.priorArt && (
        <Badge title={`Close to an existing marketplace idea: "${idea.priorArt.title}" — check before duplicating effort`} cls="bg-amber-500/10 text-amber-400 border-amber-500/25">
          <Store size={10} /> Prior art
        </Badge>
      )}

      {variant === 'full' && idea.refined && (
        <Badge title={`Deep mode ${idea.refined.note} — original: "${idea.refined.fromTitle}"`} cls="bg-violet-500/10 text-violet-300 border-violet-500/25">
          <RefreshCw size={10} /> Refined
        </Badge>
      )}

      {variant === 'full' && idea.lensId && (
        <Badge title={`Prism: generated through the "${idea.lensId}" evidence lens`} cls="bg-teal-500/10 text-teal-400 border-teal-500/25">
          <PrismIcon size={10} /> {idea.lensId}
        </Badge>
      )}

      {/* Corroboration is POSITIVE-ONLY by design. The idea states its saving
          arithmetic twice; when the second statement independently lands on the
          same number that is hard to do by accident and worth showing. When it
          does not, the parser's known low bias on prose bridges means the
          disagreement carries no information, so nothing is shown rather than
          an accusation the measurement cannot support. */}
      {variant === 'full' && idea.arithmetic?.corroboration?.status === 'corroborated' && (
        <Badge
          title={idea.arithmetic.corroboration.note}
          cls="bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
        >
          <ShieldCheck size={10} /> Bridge agrees
        </Badge>
      )}

      {/* A benchmark claim says how it is grounded, in BOTH variants. An
          attributable unbacked claim ("Vitesco did this in 2023") is the one a
          reader is most likely to repeat in a meeting, so it is the one that
          must never look settled. The gate behind this used to be an allow-list
          of ~55 company names and 26 real-company claims walked past it. */}
      {idea.benchmarkClaim && idea.benchmarkClaim !== 'retrieval-backed' && (
        <Badge
          title={idea.benchmarkClaim === 'attributable-unverified'
            ? `This idea attributes a benchmark to a specific company, programme or year, and NOTHING in this run verified it. Treat it as a lead to check, not as a fact.\n\n${idea.benchmarkReference ?? ''}`
            : `This idea cites general industry practice rather than a named source, and nothing verified it.\n\n${idea.benchmarkReference ?? ''}`}
          cls={idea.benchmarkClaim === 'attributable-unverified'
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
            : 'bg-slate-500/10 text-slate-400 border-slate-500/25'}
        >
          <BookOpen size={10} /> {idea.benchmarkClaim === 'attributable-unverified' ? 'Named claim, unverified' : 'General practice'}
        </Badge>
      )}

      {Array.isArray(idea.evidenceRefs) && idea.evidenceRefs.length > 0 && (
        <Badge
          title={`Cites measured evidence lines from the Prism dossier: ${idea.evidenceRefs.join(', ')} (E = engine measurement, W = waterfall step)`}
          cls="bg-teal-500/10 text-teal-300 border-teal-500/25"
        >
          <FileSearch size={10} /> {idea.evidenceRefs.slice(0, 4).join(' ')}{idea.evidenceRefs.length > 4 ? ` +${idea.evidenceRefs.length - 4}` : ''}
        </Badge>
      )}
    </div>
  );
}
