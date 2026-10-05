import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, CheckSquare, Square, ArrowDown } from 'lucide-react';
import type { CostReductionIdea, IdeaAnnotation } from '../../types';
import IdeaDetailPanel from '../IdeaDetailPanel';

/**
 * The table view of a result. A run returns 20–30 ideas; reading them as a
 * stack of tall cards makes comparison a scrolling exercise, and the engineers
 * who use this compare (Airtable, Linear and every cost tool they already use
 * offer a table). One row per idea, the columns a reviewer scans first, the
 * row opens the full detail in place. Sorting is the page's own sort, so the
 * toolbar and the column headers can never disagree.
 */
export type TableSort = 'default' | 'roi' | 'savings' | 'ease';

interface Props {
  ideas: CostReductionIdea[];
  annotations: Record<string, IdeaAnnotation | undefined>;
  statusLabel: (s: string) => string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  sortBy: TableSort;
  onSort: (s: TableSort) => void;
}

/** "€7.7M–€12.0M at 200,000 units/yr" → figure "€7.7M–€12.0M", basis "at 200,000 units/yr".
 *  The figure leads the column; the basis stays visible underneath, never dropped. */
export function splitAnnual(v: string): { figure: string; basis: string } {
  const m = v.trim().match(/^(\S+?)(\/yr)?(\s+.*)?$/);
  return m ? { figure: m[1], basis: (m[3] ?? '').trim() } : { figure: v, basis: '' };
}

const DIFF_CLS: Record<string, string> = {
  Low: 'text-success-400', Medium: 'text-amber-400', High: 'text-danger-400',
};

export default function IdeasTable({ ideas, annotations, statusLabel, selectedIds, onToggleSelect, sortBy, onSort }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const Th = ({ label, sort, className = '' }: { label: string; sort?: TableSort; className?: string }) => (
    <th scope="col" className={`py-2 px-2 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500 ${className}`}
      aria-sort={sort && sortBy === sort ? 'descending' : undefined}>
      {sort ? (
        <button type="button" onClick={() => onSort(sortBy === sort ? 'default' : sort)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-white transition-colors ${sortBy === sort ? 'text-gold-400' : ''}`}>
          {label}{sortBy === sort && <ArrowDown size={11} aria-hidden="true" />}
        </button>
      ) : label}
    </th>
  );

  return (
    <div className="mb-8 overflow-x-auto rounded-2xl border border-hairline bg-navy-900">
      <table className="w-full text-sm" aria-label="Cost-reduction ideas">
        <thead className="border-b border-hairline bg-tint">
          <tr>
            <th scope="col" className="w-10 py-2 px-2"><span className="sr-only">Select</span></th>
            <Th label="#" className="w-8" />
            <Th label="Idea" />
            <Th label="Level" className="hidden md:table-cell" />
            <Th label="Annual saving" sort="savings" className="text-right" />
            <Th label="Range" className="hidden xl:table-cell" />
            <Th label="Difficulty" sort="ease" className="hidden sm:table-cell" />
            <Th label="Time" className="hidden 2xl:table-cell" />
            <Th label="Engine" className="hidden md:table-cell" />
            <Th label="Status" className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea, i) => {
            const expanded = open === idea.id;
            const ec = idea.engineCheck;
            const status = annotations[idea.id]?.status ?? 'pending';
            return (
              <Fragment key={idea.id}>
                <tr className={`border-b border-hairline align-top hover:bg-tint transition-colors ${expanded ? 'bg-tint' : ''}`}>
                  <td className="py-2 px-2">
                    <button type="button" onClick={() => onToggleSelect(idea.id)} aria-pressed={selectedIds.has(idea.id)} aria-label={selectedIds.has(idea.id) ? 'Deselect idea' : 'Select idea'}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${selectedIds.has(idea.id) ? 'text-gold-400' : 'text-slate-500 hover:text-slate-300'}`}>
                      {selectedIds.has(idea.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </td>
                  <td className="py-2.5 px-2 font-mono text-xs text-slate-500">{i + 1}</td>
                  <td className="py-2 px-2 min-w-[260px]">
                    <button type="button" onClick={() => setOpen(expanded ? null : idea.id)} aria-expanded={expanded}
                      className="flex items-start gap-1.5 text-left text-white font-medium hover:text-gold-300 transition-colors">
                      {expanded ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />}
                      <span>{idea.title}</span>
                    </button>
                    <div className="mt-0.5 pl-5 text-xs text-slate-500 capitalize">{idea.costSavingTypes.join(' · ')}</div>
                  </td>
                  <td className="py-2.5 px-2 hidden md:table-cell text-xs text-slate-400">{idea.systemLevel}</td>
                  <td className="py-2.5 px-2 text-right">
                    {(() => { const { figure, basis } = splitAnnual(idea.costSavingPotential.annualValue || '—'); return (<>
                      <div className="font-mono text-xs text-gold-400 whitespace-nowrap">{figure}</div>
                      {basis && <div className="mt-0.5 ml-auto max-w-[150px] truncate text-2xs text-slate-500" title={basis}>{basis}</div>}
                    </>); })()}
                  </td>
                  <td className="py-2.5 px-2 hidden xl:table-cell max-w-[150px]">
                    <div className="truncate font-mono text-xs text-slate-400" title={idea.costSavingPotential.percentage}>{idea.costSavingPotential.percentage || '—'}</div>
                  </td>
                  <td className={`py-2.5 px-2 hidden sm:table-cell text-xs font-medium ${DIFF_CLS[idea.implementationDifficulty] ?? 'text-slate-400'}`}>{idea.implementationDifficulty}</td>
                  <td className="py-2.5 px-2 hidden 2xl:table-cell text-xs text-slate-400">{idea.timeToImplement}</td>
                  <td className="py-2.5 px-2 hidden md:table-cell text-xs whitespace-nowrap">
                    {ec ? (ec.direction === 'confirmed'
                      ? <span className="text-success-400" title={ec.basis}>✓ confirmed</span>
                      : <span className="text-danger-400" title={ec.basis}>✕ contradicts</span>)
                      : <span className="text-slate-500" title={idea.engineCheckReason}>not checked</span>}
                  </td>
                  <td className="py-2.5 px-2 hidden lg:table-cell text-xs text-slate-400">{statusLabel(status)}</td>
                </tr>
                {expanded && (
                  <tr className="border-b border-hairline">
                    <td colSpan={10} className="px-4 py-4 bg-navy-950/40">
                      <IdeaDetailPanel idea={idea} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
