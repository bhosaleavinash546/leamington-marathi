import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TOOLS, TOOL_GROUPS, type Tool } from '../../config/tools';
import { useHouseMotion } from '../../lib/motion';

/**
 * ONE MASTHEAD FOR EVERY PAGE.
 *
 * The September 2026 UX review found three page-header languages in the
 * product — a centred marketing hero on eleven tool pages, the Prism / DFM
 * masthead on two, a compact table header on five — and twelve distinct
 * `h1` sizes. This is the Prism pattern, promoted: icon tile, eyebrow (the
 * tool group, read from the nav registry so it cannot disagree with the
 * sidebar), display title, one-line promise, and a slot for the controls
 * that belong to the whole page (mode chips, library badges, admin links).
 *
 * Left-aligned, because a tool page is a workspace and not a landing page;
 * 28 px on phones and 36 px on desktop, because that is the top of the type
 * scale and the only place it is used.
 *
 * Tone follows the house rule about colour with a job: `brand` (gold) for
 * pages where the user acts — generation, tracking; `engine` (teal) for
 * pages where the engine measures — costing, DFM. Pass `tool` and the icon,
 * label and group come from the registry.
 */
export type HeaderTone = 'brand' | 'engine' | 'neutral';

const TONE: Record<HeaderTone, { tile: string; icon: string; eyebrow: string }> = {
  brand:   { tile: 'bg-gold-500/15 border-gold-500/25', icon: 'text-gold-400', eyebrow: 'text-gold-400/90' },
  engine:  { tile: 'bg-teal-500/15 border-teal-500/25', icon: 'text-teal-400', eyebrow: 'text-teal-300/90' },
  neutral: { tile: 'bg-white/[0.06] border-white/10',    icon: 'text-slate-300', eyebrow: 'text-slate-400' },
};

export function toneForTool(t: Tool | undefined): HeaderTone {
  if (!t) return 'neutral';
  return t.category === 'cost' ? 'engine' : 'brand';
}

interface Props {
  /** A tool id from src/config/tools.ts — supplies icon, eyebrow and default title. */
  tool?: string;
  /** Overrides when the page is not a registry tool (settings, team, help). */
  icon?: Tool['icon'];
  eyebrow?: string;
  title?: ReactNode;
  /** The one-line promise. Keep it one line; the engine explains itself below. */
  subtitle?: ReactNode;
  tone?: HeaderTone;
  /** Page-level controls: mode chips, badges, admin links. */
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ tool, icon, eyebrow, title, subtitle, tone, actions, className = '' }: Props) {
  const m = useHouseMotion();
  const t = tool ? TOOLS.find(x => x.id === tool) : undefined;
  const Icon = icon ?? t?.icon;
  const group = t ? TOOL_GROUPS.find(g => g.id === t.category)?.label : undefined;
  const tn = TONE[tone ?? toneForTool(t)];
  const eyebrowText = eyebrow ?? group;

  return (
    <motion.header
      variants={m.stagger()}
      initial="hidden"
      animate="show"
      className={`mb-8 ${className}`}
    >
      <motion.div variants={m.rise} className="flex items-start gap-4">
        {Icon && (
          <div className={`shrink-0 inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border ${tn.tile}`}>
            <Icon size={26} className={tn.icon} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {eyebrowText && (
            <p className={`text-2xs font-semibold uppercase tracking-[0.12em] mb-1 ${tn.eyebrow}`}>{eyebrowText}</p>
          )}
          <h1 className="text-[28px] sm:text-4xl font-black text-white tracking-tight leading-[1.1]">
            {title ?? t?.label}
          </h1>
          {subtitle && (
            <p className="text-slate-400 text-sm sm:text-[15px] leading-relaxed mt-2 max-w-2xl">{subtitle}</p>
          )}
        </div>
      </motion.div>
      {actions && (
        <motion.div variants={m.rise} className="flex flex-wrap items-center gap-2 mt-4">
          {actions}
        </motion.div>
      )}
    </motion.header>
  );
}
