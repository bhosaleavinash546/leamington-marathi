import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center',
          padding: '2rem',
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ color: 'var(--text-1)', fontSize: '1.25rem', fontWeight: 700 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-2)', maxWidth: 420, lineHeight: 1.6 }}>
            This section encountered an unexpected error. Your data is safe.
          </p>
          {this.state.error && (
            <details style={{ maxWidth: 480, textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>
                Technical details
              </summary>
              <pre style={{
                marginTop: 8, padding: '0.75rem', borderRadius: 6,
                background: 'var(--bg-alt)', fontSize: 11, color: 'var(--danger)',
                overflow: 'auto', maxHeight: 200,
              }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => window.location.href = '/dashboard'}
          >
            Go to Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
