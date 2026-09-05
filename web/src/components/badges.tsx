import { STATUS_LABELS, TIER_LABELS, type IssueStatus, type PriorityTier } from "../lib/types";

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="beacon" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function TierBadge({ tier }: { tier: PriorityTier }) {
  return (
    <span className={`chip tier-${tier}`}>
      {tier === "critical" ? "🚨 " : tier === "high" ? "⚠️ " : ""}
      {TIER_LABELS[tier]} priority
    </span>
  );
}

export function CategoryChip({
  name,
  color,
  icon,
}: {
  name: string;
  color: string;
  icon: string;
}) {
  return (
    <span
      className="chip"
      style={{ background: `${color}1f`, color }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {name}
    </span>
  );
}