import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * An empty state that says three things: what is empty, why, and the one
 * action that fills it. Renders a <p>, not a heading, so it never breaks the
 * page's heading order (axe `heading-order` on Pipeline, VAVE, Marketplace).
 */
interface Props {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon: Icon, title, body, action, className = '' }: Props) {
  return (
    <div className={`rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center ${className}`}>
      {Icon && (
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
          <Icon size={22} className="text-slate-400" aria-hidden="true" />
        </div>
      )}
      <p className="text-white font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
