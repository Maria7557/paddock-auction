type StatusChipTone = "live" | "scheduled" | "warning" | "resolved" | "critical" | "neutral";

type StatusChipProps = {
  label: string;
  tone?: StatusChipTone;
};

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  return <span className={`status-chip tone-${tone}`}>{label}</span>;
}
