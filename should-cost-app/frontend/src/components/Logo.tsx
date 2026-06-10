// CostLens logo mark — shows only the magnifying-glass icon, clips the text below.
// Original image: 691 × 638 px. Icon occupies the top ~58% (≈370 px).
// We scale the image so those 370 px map to `size` px, then clip the rest.

interface Props {
  size?: number;   // height / width of the square display box (default 40)
  style?: React.CSSProperties;
}

export default function Logo({ size = 40, style }: Props) {
  // Scale so icon height === size. Full image height at this scale:
  const fullH = Math.round(size / 0.58);
  // Aspect-correct width: original ratio = 691/638
  const fullW = Math.round(fullH * (691 / 638));

  return (
    <div
      role="img"
      aria-label="CostLens"
      style={{
        width: size,
        height: size,
        overflow: 'hidden',
        borderRadius: Math.round(size * 0.22),
        flexShrink: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: '#ffffff',
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        ...style,
      }}
    >
      <img
        src="/costlens-logo.jpg"
        alt="CostLens"
        style={{
          display: 'block',
          height: fullH,
          width: fullW,
          flexShrink: 0,
        }}
      />
    </div>
  );
}
