import { useNavigate } from "react-router-dom";
import { formatDistance, timeAgo } from "../lib/format";
import type { IssueSummary } from "../lib/types";
import { CategoryChip, StatusBadge, TierBadge } from "./badges";
import { UpvoteButton } from "./UpvoteButton";

interface Props {
  issue: IssueSummary;
  showDistance?: boolean;
  onUpvoteConfirmed?: (issueId: string, data: { upvoteCount: number }) => void;
}

export function IssueCard({ issue, showDistance, onUpvoteConfirmed }: Props) {
  const navigate = useNavigate();
  const hasDistance = showDistance && issue.distanceM != null;
  const open = () => navigate(`/issue/${issue.id}`);

  return (
    <article
      className="issue-card card fade-in"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
      style={{ cursor: "pointer" }}
    >
      {issue.photoUrl && (
        <div className="issue-media">
          <img src={issue.photoUrl} alt={issue.title} loading="lazy" />
          <div className="badge-float">
            <StatusBadge status={issue.status} />
          </div>
          <div className="priority-float">
            <TierBadge tier={issue.priorityTier} />
          </div>
        </div>
      )}

      <div className="issue-body">
        {!issue.photoUrl && (
          <div className="row" style={{ marginBottom: 8 }}>
            <StatusBadge status={issue.status} />
            <TierBadge tier={issue.priorityTier} />
          </div>
        )}
        <div className="issue-head">
          <h3 className="issue-title">{issue.title}</h3>
        </div>

        <div className="issue-meta">
          <CategoryChip name={issue.categoryName} color={issue.categoryColor} icon={issue.categoryIcon} />
          <span className="meta-item">📍 {issue.areaName || "Nearby"}</span>
          {hasDistance && <span className="meta-item">{formatDistance(issue.distanceM)}</span>}
        </div>

        {issue.duplicateNote && <div className="dup-note">👥 {issue.duplicateNote}</div>}

        {issue.description && <p className="issue-desc">{issue.description}</p>}

        <div className="issue-footer">
          <div className="footer-left">
            <span className="meta-item">🕐 {timeAgo(issue.createdAt)}</span>
            <span className="meta-item">💬 {issue.commentCount}</span>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <UpvoteButton
              issueId={issue.id}
              count={issue.upvoteCount}
              voted={issue.userUpvoted}
              onConfirmed={(res) => onUpvoteConfirmed?.(issue.id, { upvoteCount: res.upvoteCount })}
            />
          </div>
        </div>
      </div>
    </article>
  );
}