import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * An error the user can act on: what failed, in one sentence, and the retry.
 * Always `role="alert"` so assistive tech announces it when it appears.
 */
interface Props { title?: string; message: ReactNode; onRetry?: () => void; retryLabel?: string; className?: string; }

export default function ErrorState({ title = 'Something went wrong', message, onRetry, retryLabel = 'Try again', className = '' }: Props) {
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-2xl border border-danger-500/30 bg-danger-500/10 p-4 ${className}`}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-sm text-slate-300 break-words">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-hairline-strong px-3 py-1.5 text-xs font-semibold text-slate-200 transition-ui duration-micro ease-house hover:bg-tint-strong"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
