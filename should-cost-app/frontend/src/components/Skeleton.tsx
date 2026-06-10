interface Props {
  height?: number | string;
  width?: number | string;
  radius?: number;
  count?: number;
  gap?: number;
}

const pulse = `
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
`;

export default function Skeleton({ height = 20, width = '100%', radius = 8, count = 1, gap = 8 }: Props) {
  return (
    <>
      <style>{pulse}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height, width, borderRadius: radius,
            background: 'linear-gradient(90deg, var(--bg-alt) 25%, var(--border) 50%, var(--bg-alt) 75%)',
            backgroundSize: '800px 100%',
            animation: 'shimmer 1.4s ease-in-out infinite',
            marginBottom: i < count - 1 ? gap : 0,
          }}
        />
      ))}
    </>
  );
}

export function SkeletonCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card">
      <Skeleton height={18} width="40%" radius={6} />
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} height={14} width={`${90 - i * 8}%`} radius={4} />
        ))}
      </div>
    </div>
  );
}
