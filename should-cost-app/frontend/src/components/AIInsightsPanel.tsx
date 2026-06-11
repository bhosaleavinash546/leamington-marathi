import { AIInsight } from '../types';

interface Props {
  insight: AIInsight;
  streamingText?: string;
}

const severityOrder = { high: 0, medium: 1, low: 2 };

function ConfidenceDots({ score }: { score?: number }) {
  if (!score) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 2 }}>Confidence</span>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: i <= score
            ? score >= 4 ? 'var(--success)' : score >= 3 ? '#f59e0b' : 'var(--danger)'
            : 'var(--border)',
        }} />
      ))}
      <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 2 }}>{score}/5</span>
    </div>
  );
}

export default function AIInsightsPanel({ insight, streamingText }: Props) {
  const flags = [...(insight.flags ?? [])].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
  const confidence = (insight.raw_response as Record<string, unknown> | undefined)?.confidence as number | undefined;

  // Streaming live-text mode
  if (streamingText !== undefined) {
    return (
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>AI Analysis</h2>
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>● Generating…</span>
        </div>
        <div className="insight-summary" style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {streamingText || <span style={{ color: 'var(--text-3)' }}>Waiting for Claude…</span>}
          <span style={{ borderRight: '2px solid var(--accent)', marginLeft: 1 }}>&nbsp;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>AI Analysis</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ConfidenceDots score={confidence} />
          <div style={{ fontSize: 12, color: '#888' }}>
            Model: {insight.model_used ?? 'mock'} · v{insight.prompt_version} ·{' '}
            {new Date(insight.generated_at).toLocaleString()}
          </div>
        </div>
      </div>

      {insight.summary && (
        <div className="insight-summary">{insight.summary}</div>
      )}

      {flags.length > 0 && (
        <div className="insight-section">
          <h4>Flagged Elements</h4>
          <table>
            <thead>
              <tr><th>Cost Element</th><th>Finding</th><th>Severity</th></tr>
            </thead>
            <tbody>
              {flags.map((f, i) => (
                <tr key={i}>
                  <td><strong>{f.element}</strong></td>
                  <td style={{ fontSize: 13, color: '#555' }}>{f.reason}</td>
                  <td><span className={`badge badge-${f.severity}`}>{f.severity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(insight.questions ?? []).length > 0 && (
        <div className="insight-section">
          <h4>Clarifying Questions for Supplier</h4>
          <ul>{insight.questions!.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}

      {(insight.recommendations ?? []).length > 0 && (
        <div className="insight-section">
          <h4>Recommended Actions</h4>
          <ul>{insight.recommendations!.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
