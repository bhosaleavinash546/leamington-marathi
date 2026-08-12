import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useDfmMotion } from './motion';

/**
 * The one surface this feature uses.
 *
 * The page had grown three card recipes (`bg-navy-900 rounded-2xl p-6`,
 * `bg-navy-950/40 rounded-xl p-4`, and a bare bordered div) which is how a
 * tool stops looking designed and starts looking assembled. Everything is this
 * panel now; the variations that remain are deliberate and named:
 *
 *   `framed`  — drawing-frame corner ticks. Reserved for the panels that carry
 *               a VERDICT (results, reconciliation), so the motif means
 *               something rather than being sprinkled.
 *   `tone`    — a semantic edge for warnings and conflicts.
 */
export default function Panel({
  children,
  className = '',
  framed = false,
  tone = 'default',
  eyebrow,
  title,
  actions,
  animate = true,
  id,
}: {
  children: ReactNode;
  className?: string;
  framed?: boolean;
  tone?: 'default' | 'warning' | 'danger' | 'accent';
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  animate?: boolean;
  id?: string;
}) {
  const m = useDfmMotion();
  const toneClass =
    tone === 'warning' ? 'border-amber-500/40 bg-amber-500/[0.06]'
      : tone === 'danger' ? 'border-red-500/40 bg-red-500/[0.06]'
        : tone === 'accent' ? 'border-gold-500/30'
          : '';

  const body = (
    <>
      {(eyebrow || title || actions) && (
        <div className="dfm-panel-head flex items-start justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            {eyebrow && <p className="dfm-label text-slate-500 mb-0.5">{eyebrow}</p>}
            {title && <div className="text-white font-semibold text-sm leading-snug">{title}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </>
  );

  const cls = `dfm-panel ${framed ? 'dfm-framed' : ''} ${toneClass} ${className}`;

  if (!animate) return <section id={id} className={cls}>{body}</section>;
  return (
    <motion.section
      id={id}
      className={cls}
      variants={m.panel}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      {body}
    </motion.section>
  );
}
