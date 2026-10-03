import {
  TrendingDown, DollarSign, Calculator, Clock, BarChart3, Tag,
  AlertTriangle, CheckCircle, Scale, Link2, ShieldCheck, BookOpen,
  FlaskConical, Factory, Wrench, Cog, ExternalLink, Mountain,
} from 'lucide-react';
import { Money } from './ui/Money';
import type { CostReductionIdea, CostSavingType } from '../types';
import IdeaProvenanceBadges from './IdeaProvenanceBadges';

const TYPE_COLORS: Record<CostSavingType, string> = {
  material:      'bg-blue-500/15   text-blue-300   border-blue-500/25',
  process:       'bg-purple-500/15 text-purple-300 border-purple-500/25',
  logistics:     'bg-cyan-500/15   text-cyan-300   border-cyan-500/25',
  complexity:    'bg-pink-500/15   text-pink-300   border-pink-500/25',
  warranty:      'bg-orange-500/15 text-orange-300 border-orange-500/25',
  tooling:       'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  weight:        'bg-teal-500/15   text-teal-300   border-teal-500/25',
  commonisation: 'bg-lime-500/15   text-lime-300   border-lime-500/25',
};

const LEVEL_COLORS: Record<string, string> = {
  Assembly:    'bg-violet-500/15 text-violet-300 border-violet-500/25',
  Subassembly: 'bg-sky-500/15    text-sky-300    border-sky-500/25',
  Part:        'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
};

const CONFIDENCE_CONFIG = {
  verified:    { label: 'Verified',     color: 'text-success-400', bg: 'bg-success-500/10', border: 'border-success-500/30',  icon: ShieldCheck },
  benchmarked: { label: 'Benchmarked',  color: 'text-info-400',    bg: 'bg-info-500/10',    border: 'border-info-500/30',    icon: BookOpen },
  estimated:   { label: 'Estimated',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Calculator },
  theoretical: { label: 'Theoretical', color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  icon: FlaskConical },
};

const EVIDENCE_TYPE_CONFIG = {
  oem_press_release: { label: 'OEM Press Release', color: 'text-blue-300',    bg: 'bg-blue-500/10 border-blue-500/20' },
  teardown:          { label: 'Teardown Study',     color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  patent:            { label: 'Patent',             color: 'text-violet-300',  bg: 'bg-violet-500/10 border-violet-500/20' },
  industry_report:   { label: 'Industry Report',    color: 'text-amber-300',   bg: 'bg-amber-500/10 border-amber-500/20' },
  supplier_data:     { label: 'Supplier Data',      color: 'text-cyan-300',    bg: 'bg-cyan-500/10 border-cyan-500/20' },
  web_search:        { label: 'Web Search',         color: 'text-slate-300',   bg: 'bg-slate-500/10 border-slate-500/20' },
  regulatory:        { label: 'Regulatory',         color: 'text-red-300',     bg: 'bg-red-500/10 border-red-500/20' },
};

const EVIDENCE_DOT: Record<string, string> = {
  high:   'bg-success-400',
  medium: 'bg-amber-400',
  low:    'bg-danger-400',
};

const DIFF_CONFIG = {
  Low:    { color: 'text-success-400', bg: 'bg-success-500/10', border: 'border-success-500/30', icon: CheckCircle },
  Medium: { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Clock },
  High:   { color: 'text-danger-400',  bg: 'bg-danger-500/10',  border: 'border-danger-500/30',  icon: AlertTriangle },
};

interface Props {
  idea: CostReductionIdea;
  compact?: boolean;
}

export default function IdeaDetailPanel({ idea, compact = false }: Props) {
  const diff = DIFF_CONFIG[idea.implementationDifficulty] ?? DIFF_CONFIG.Medium;
  const DiffIcon = diff.icon;

  return (
    <div className="space-y-4">
      {/* Tags row */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${LEVEL_COLORS[idea.systemLevel] || 'bg-slate-500/10 text-slate-300 border-slate-500/25'}`}>
          {idea.systemLevel}
        </span>
        {idea.costSavingTypes.map(t => (
          <span key={t} className={`px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${TYPE_COLORS[t] || ''}`}>{t}</span>
        ))}
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${diff.bg} ${diff.color} ${diff.border}`}>
          <DiffIcon size={10} /> {idea.implementationDifficulty}
        </span>
        {idea.powertrain && (
          <span className="px-2 py-0.5 rounded-full border border-hairline bg-tint text-slate-300 text-xs font-medium">{idea.powertrain}</span>
        )}
        {idea.offRoad && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-hairline bg-tint text-slate-300 text-xs font-medium"><Mountain size={10} /> Off-road</span>
        )}
        {idea.confidenceLevel && (() => {
          const conf = CONFIDENCE_CONFIG[idea.confidenceLevel];
          const ConfIcon = conf.icon;
          return (
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${conf.bg} ${conf.color} ${conf.border}`}>
              <ConfIcon size={10} /> {conf.label}
            </span>
          );
        })()}
      </div>

      {/* Cost metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-xl bg-white/5">
        <div>
          <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><TrendingDown size={10} /> Saving Range</div>
          <div className="text-success-400 font-bold text-sm">{idea.costSavingPotential.percentage || '—'}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><DollarSign size={10} /> Annual Value</div>
          <div className="text-gold-400 font-bold text-sm">{idea.costSavingPotential.annualValue || 'TBD'}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><Calculator size={10} /> Basis</div>
          <div className="text-slate-400 text-xs leading-tight">{idea.costSavingPotential.calculationBasis || idea.costSavingPotential.qualitative.split(' ')[0]}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-slate-500 text-xs mb-0.5"><Clock size={10} /> Timeline</div>
          <div className="text-slate-300 font-medium text-sm">{idea.timeToImplement}</div>
        </div>
      </div>

      {idea.volumeBasis && <p className="text-2xs text-slate-500 -mt-2">{idea.volumeBasis}</p>}

      {/* The same provenance the results page shows. Until Sept 2026 this
          renderer showed none of it, so one idea read as verified here and
          honestly caveated there. */}
      <IdeaProvenanceBadges idea={idea} className="mb-3" />

      {/* Material grade */}
      {idea.materialGrade && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-teal-500/5 border border-teal-500/15">
          <FlaskConical size={14} className="text-teal-400 flex-shrink-0" />
          <span className="text-teal-400 text-xs font-semibold uppercase tracking-wider">Material Grade:</span>
          <span className="text-slate-200 text-sm font-medium">{idea.materialGrade}</span>
        </div>
      )}

      {/* Process route */}
      {idea.manufacturingProcess && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-tint border border-hairline">
          <Factory size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider shrink-0">Process:</span>
          <span className="text-slate-200 text-sm">{idea.manufacturingProcess}</span>
        </div>
      )}

      {/* Technical description */}
      <div>
        <p className="text-slate-300 text-sm leading-relaxed">{idea.technicalDescription}</p>
      </div>

      {!compact && (
        <>
          {/* Manufacturing impact */}
          {idea.manufacturingImpact && (
            <div>
              <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <BarChart3 size={11} /> Manufacturing & Assembly Impact
              </h4>
              <p className="text-slate-400 text-sm leading-relaxed">{idea.manufacturingImpact}</p>
            </div>
          )}

          {/* Where the money comes from, and what it does to the build */}
          {(idea.costReductionMechanism || idea.dfmDfa) && (
            <div className="grid md:grid-cols-2 gap-4">
              {idea.costReductionMechanism && (
                <div>
                  <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><TrendingDown size={11} /> Where the saving comes from</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">{idea.costReductionMechanism}</p>
                </div>
              )}
              {idea.dfmDfa && (
                <div>
                  <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Wrench size={11} /> DFM / DFA</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">{idea.dfmDfa}</p>
                </div>
              )}
            </div>
          )}

          {/* Engineering depth: physics, spec, validation, DFM, cost walk */}
          {idea.engineering && Object.values(idea.engineering).some(Boolean) && (
            <div className="rounded-xl border border-hairline p-3 space-y-3" aria-label="Engineering detail">
              <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><Cog size={11} /> Engineering detail</h4>
              {([
                ['mechanism', 'Why it works'],
                ['specDeltas', 'Drawing & spec changes'],
                ['validationPlan', 'Validation plan'],
                ['dfmImplications', 'Manufacturing implications'],
                ['costBridge', 'Cost walk'],
              ] as const).map(([k, label]) => idea.engineering?.[k] ? (
                <div key={k}>
                  <div className="text-slate-500 text-2xs font-semibold uppercase tracking-wider mb-0.5">{label}</div>
                  <p className="text-slate-300 text-sm leading-relaxed measure">{idea.engineering[k]}</p>
                </div>
              ) : null)}
            </div>
          )}

          {/* Line-by-line cost bridge (estimates) + investment */}
          {idea.costBridgeLines && idea.costBridgeLines.length > 0 && (() => {
            const lines = idea.costBridgeLines;
            const tb = lines.reduce((a, l) => a + l.baselineEur, 0);
            const tp = lines.reduce((a, l) => a + l.proposedEur, 0);
            return (
              <div className="rounded-xl border border-hairline p-3">
                <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Calculator size={11} /> Cost bridge per vehicle <span className="normal-case tracking-normal text-slate-500 font-normal">— estimates</span></h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" aria-label="Cost bridge per vehicle">
                    <thead>
                      <tr className="text-slate-500 text-left">
                        <th className="py-1 pr-2 font-medium">Line</th>
                        <th className="py-1 px-2 font-medium text-right">Baseline</th>
                        <th className="py-1 px-2 font-medium text-right">Proposed</th>
                        <th className="py-1 pl-2 font-medium text-right">Saving</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-t border-hairline align-top" title={l.basis}>
                          <td className="py-1 pr-2 text-slate-300">{l.item}{l.basis && <div className="text-2xs text-slate-500">{l.basis}</div>}</td>
                          <td className="py-1 px-2 text-right font-mono text-slate-400"><Money eur={l.baselineEur} /></td>
                          <td className="py-1 px-2 text-right font-mono text-slate-400"><Money eur={l.proposedEur} /></td>
                          <td className={`py-1 pl-2 text-right font-mono ${l.baselineEur - l.proposedEur >= 0 ? 'text-success-400' : 'text-danger-400'}`}><Money eur={l.baselineEur - l.proposedEur} /></td>
                        </tr>
                      ))}
                      <tr className="border-t border-hairline font-semibold">
                        <td className="py-1 pr-2 text-slate-200">Net per vehicle</td>
                        <td className="py-1 px-2 text-right font-mono text-slate-300"><Money eur={tb} /></td>
                        <td className="py-1 px-2 text-right font-mono text-slate-300"><Money eur={tp} /></td>
                        <td className="py-1 pl-2 text-right font-mono text-success-400"><Money eur={tb - tp} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {idea.investment && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                    <div><div className="text-slate-500 text-2xs uppercase tracking-wider">Tooling</div><div className="text-slate-200 font-mono"><Money eur={idea.investment.toolingEur} decimals={0} /></div></div>
                    <div><div className="text-slate-500 text-2xs uppercase tracking-wider">Capex</div><div className="text-slate-200 font-mono"><Money eur={idea.investment.capexEur} decimals={0} /></div></div>
                    <div><div className="text-slate-500 text-2xs uppercase tracking-wider">Validation</div><div className="text-slate-200 font-mono"><Money eur={idea.investment.validationEur} decimals={0} /></div></div>
                    <div><div className="text-slate-500 text-2xs uppercase tracking-wider">Payback</div><div className="text-slate-200 font-mono">{idea.investment.paybackMonths} months</div></div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid md:grid-cols-2 gap-4">
            {/* DFMA Principles */}
            {idea.dfmaPrinciples?.length > 0 && (
              <div>
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Tag size={11} /> DFMA Principles
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {idea.dfmaPrinciples.map(p => (
                    <span key={p} className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Risk notes */}
            {idea.riskNotes && (
              <div>
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={11} /> Risk & Impact Notes
                </h4>
                <p className="text-slate-400 text-sm leading-relaxed">{idea.riskNotes}</p>
              </div>
            )}
          </div>

          {/* Benchmark reference */}
          {idea.benchmarkAnchor ? (
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 space-y-1">
              <div><span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Benchmark: </span><span className="text-slate-200 text-sm font-medium">{idea.benchmarkAnchor.platform}</span></div>
              <div className="text-slate-300 text-sm"><span className="text-slate-500">What it does: </span>{idea.benchmarkAnchor.borrowedFeature}</div>
              <div className="text-slate-300 text-sm"><span className="text-slate-500">How this idea differs: </span>{idea.benchmarkAnchor.difference}</div>
            </div>
          ) : idea.benchmarkReference && (
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
              <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Industry Benchmark: </span>
              <span className="text-slate-300 text-sm">{idea.benchmarkReference}</span>
            </div>
          )}

          {/* Regulatory context */}
          {idea.regulatoryContext && idea.regulatoryContext !== 'null' && (
            <div className="p-3 rounded-xl bg-danger-500/5 border border-danger-500/15 flex items-start gap-2">
              <Scale size={14} className="text-danger-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-danger-400 text-xs font-semibold uppercase tracking-wider block mb-0.5">Regulatory Driver</span>
                <span className="text-slate-300 text-sm">{idea.regulatoryContext}</span>
              </div>
            </div>
          )}

          {/* Evidence sources */}
          {idea.evidenceSources && idea.evidenceSources.length > 0 && (
            <div>
              <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Link2 size={11} /> Evidence Sources
              </h4>
              <div className="flex flex-wrap gap-2">
                {idea.evidenceSources.map((src, i) => {
                  const cfg = EVIDENCE_TYPE_CONFIG[src.type] ?? EVIDENCE_TYPE_CONFIG.web_search;
                  return (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${cfg.bg}`}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVIDENCE_DOT[src.confidence] ?? 'bg-slate-400'}`} title={`${src.confidence} confidence`} />
                      <div>
                        {src.url ? (
                          <a href={src.url} target="_blank" rel="noopener noreferrer" className={`font-medium ${cfg.color} hover:underline inline-flex items-center gap-1`}>
                            {src.title}{src.year ? ` (${src.year})` : ''}<ExternalLink size={10} aria-hidden="true" />
                          </a>
                        ) : (
                          <div className={`font-medium ${cfg.color}`}>{src.title}{src.year ? ` (${src.year})` : ''}</div>
                        )}
                        <div className="text-slate-500 text-xs">{cfg.label}{src.supports ? ` — supports: ${src.supports}` : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
