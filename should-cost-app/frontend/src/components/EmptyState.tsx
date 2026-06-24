interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  compact?: boolean;
}

export default function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  secondaryAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: compact ? 8 : 12,
      padding: compact ? '2rem 1rem' : '4rem 2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: compact ? 32 : 48, lineHeight: 1 }}>{icon}</div>
      <h3 style={{
        color: 'var(--text-1)', fontWeight: 600,
        fontSize: compact ? '0.9rem' : '1.05rem',
        margin: 0,
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          color: 'var(--text-2)', maxWidth: 360, lineHeight: 1.6,
          fontSize: compact ? '0.8rem' : '0.875rem', margin: 0,
        }}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {action && (
            <button className="btn btn-primary btn-sm" onClick={action.onClick}>
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button className="btn btn-secondary btn-sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
