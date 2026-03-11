type MetricTileProps = {
  label: string;
  value: string | number;
};

export function MetricTile({ label, value }: MetricTileProps) {
  return (
    <article className="seller-metric-tile">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
