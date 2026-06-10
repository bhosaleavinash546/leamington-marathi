interface Props {
  height?: number;
  style?: React.CSSProperties;
}

export default function Logo({ height = 56, style }: Props) {
  return (
    <img
      src="/costlens-logo.jpg"
      alt="CostLens"
      style={{
        height,
        width: 'auto',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
