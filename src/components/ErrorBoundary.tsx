import React from 'react';

interface State { hasError: boolean; error: string; }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error?.message || String(error) };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ background: '#07111e', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: 'monospace' }}>
        <div style={{ background: '#0d1f33', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: 32, maxWidth: 640, width: '100%' }}>
          <div style={{ color: '#f87171', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>⚠️ BrainSpark — Startup Error</div>
          <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            The app encountered an error while loading. Copy the error below and send it to get it fixed.
          </div>
          <div style={{ background: '#020817', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 16, color: '#fca5a5', fontSize: 12, wordBreak: 'break-all', lineHeight: 1.7 }}>
            {this.state.error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, background: '#f59e0b', color: '#07111e', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}
