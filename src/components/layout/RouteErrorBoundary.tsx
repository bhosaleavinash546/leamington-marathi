import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this key resets the boundary (e.g. route pathname). */
  resetKey?: string;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * Route-level error boundary. A render error in one page shows a recoverable
 * panel instead of blanking the whole app. Resets automatically when the route
 * (resetKey) changes, so navigating away clears the error.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for diagnostics; avoids a silent white screen.
    console.error('[RouteError]', error, info?.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-navy-900 border border-white/10 rounded-2xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-danger-500/15 border border-danger-500/25 mb-4">
            <AlertTriangle size={26} className="text-danger-400" />
          </div>
          <h2 className="text-white font-bold text-xl mb-2">This page hit an error</h2>
          <p className="text-slate-400 text-sm mb-6">
            Something went wrong rendering this view. Your data is safe — you can retry or head back to the dashboard.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors"
            >
              <RefreshCw size={15} /> Retry
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 text-slate-300 hover:bg-white/5 text-sm font-semibold transition-colors"
            >
              <Home size={15} /> Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
