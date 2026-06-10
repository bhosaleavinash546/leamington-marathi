interface Props {
  comparisonId: number;
  isMulti?: boolean;
}

export default function ExportButtons({ comparisonId, isMulti = false }: Props) {
  const path = isMulti
    ? `/api/export/multi-comparison/${comparisonId}.xlsx`
    : `/api/export/comparison/${comparisonId}.xlsx`;

  return (
    <div className="export-bar">
      <a
        href={path}
        className="btn btn-secondary btn-sm"
        download
        target="_blank"
        rel="noreferrer"
      >
        ⬇ Excel
      </a>
    </div>
  );
}
