import { AIInsight } from '../types';

interface Props {
  insight: AIInsight;
}

const severityOrder = { high: 0, medium: 1, low: 2 };

export default function AIInsightsPanel({ insight }: Props) {
  const flags = [...(insight.flags ?? [])].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>AI Analysis</h2>
        <div style={{ fontSize: 12, color: '#888' }}>
          Model: {insight.model_used ?? 'mock'} · Prompt v{insight.prompt_version} ·{' '}
          {new Date(insight.generated_at).toLocaleString()}
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
              <tr>
                <th>Cost Element</th>
                <th>Finding</th>
                <th>Severity</th>
              </tr>
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
          <ul>
            {insight.questions!.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {(insight.recommendations ?? []).length > 0 && (
        <div className="insight-section">
          <h4>Recommended Actions</h4>
          <ul>
            {insight.recommendations!.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
