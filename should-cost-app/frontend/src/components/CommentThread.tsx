import { useEffect, useState, FormEvent } from 'react';
import api from '../utils/api';
import { AuthUser } from '../types';

interface Comment {
  id: number;
  body: string;
  cost_element?: string;
  is_internal: boolean;
  author_name?: string;
  author_role?: string;
  created_at: string;
  parent_id?: number;
}

interface Props {
  quoteId: number;
  user: AuthUser;
}

export default function CommentThread({ quoteId, user }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody]         = useState('');
  const [costElement, setCostElement] = useState('');
  const [isInternal, setIsInternal]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<Comment[]>(`/quotes/${quoteId}/comments`)
      .then((r) => setComments(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [quoteId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/quotes/${quoteId}/comments`, {
        body,
        costElement: costElement || undefined,
        isInternal,
      });
      setBody(''); setCostElement(''); setIsInternal(false);
      load();
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/quotes/comments/${id}`);
    load();
  };

  return (
    <div className="card">
      <div className="card-title">Negotiation Thread</div>

      {loading ? (
        <div className="loading-screen" style={{ height: 80 }}><span className="spinner" /></div>
      ) : (
        <div className="comment-thread">
          {comments.length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p>No comments yet. Start the negotiation.</p>
            </div>
          )}
          {comments.map((c) => (
            <div key={c.id} className={`comment-item${c.is_internal ? ' internal' : ''}`}>
              <div className="comment-header">
                <span className="comment-author">{c.author_name ?? 'Unknown'}</span>
                <span className={`badge badge-${c.author_role ?? 'internal'}`} style={{ fontSize: 10 }}>
                  {c.author_role}
                </span>
                {c.is_internal && <span className="badge badge-medium" style={{ fontSize: 10 }}>Internal</span>}
                {c.cost_element && (
                  <span className="badge badge-info" style={{ fontSize: 10, background: 'var(--info-bg)', color: 'var(--info)' }}>
                    {c.cost_element}
                  </span>
                )}
                <span className="comment-time">{new Date(c.created_at).toLocaleString()}</span>
                {(user.role === 'admin' || c.author_name === user.fullName) && (
                  <button
                    className="btn btn-danger btn-sm"
                    style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }}
                    onClick={() => handleDelete(c.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="comment-body">{c.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add comment */}
      <form onSubmit={handleSubmit} style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cost Element (optional)</label>
            <input
              className="form-control"
              type="text"
              placeholder="e.g. Raw Material"
              value={costElement}
              onChange={(e) => setCostElement(e.target.value)}
            />
          </div>
          {user.role !== 'supplier' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Visibility</label>
              <select className="form-control" value={isInternal ? 'internal' : 'external'} onChange={(e) => setIsInternal(e.target.value === 'internal')}>
                <option value="external">Visible to supplier</option>
                <option value="internal">Internal only</option>
              </select>
            </div>
          )}
        </div>
        <div className="form-group">
          <textarea
            className="form-control"
            rows={3}
            placeholder="Add a comment, question, or negotiation note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting || !body.trim()}>
          {submitting ? 'Posting…' : 'Post Comment'}
        </button>
      </form>
    </div>
  );
}
