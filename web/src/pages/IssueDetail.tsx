import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { UserAvatar } from "../components/UserAvatar";
import { CategoryChip, StatusBadge, TierBadge } from "../components/badges";
import { EvidenceChips } from "../components/EvidenceChips";
import { UpvoteButton } from "../components/UpvoteButton";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, initials, timeAgo } from "../lib/format";
import {
  STATUS_LABELS,
  TIER_LABELS,
  type Comment,
  type IssueDetail as Detail,
  type IssueStatus,
  type IssueSummary,
  type PriorityBreakdown,
} from "../lib/types";

export default function IssueDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  const load = () => {
    if (!id) return;
    api
      .get<Detail>(`/api/issues/${id}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this issue"));
  };

  useEffect(load, [id]);

  if (error) {
    return (
      <div className="state-box">
        <div className="state-icon">🧭</div>
        <h3>Issue not found</h3>
        <p>{error}</p>
        <Link to="/feed" className="btn btn-primary">Back to feed</Link>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="state-box">
        <div className="loader" style={{ margin: "0 auto" }} />
        <p>Loading issue…</p>
      </div>
    );
  }

  const { issue } = detail;
  const reportImages = detail.images.filter((i) => i.kind === "report");

  const postComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !id) return;
    setPosting(true);
    try {
      const res = await api.post<{ comment: Comment }>(`/api/issues/${id}/comments`, {
        body: comment.trim(),
      });
      setDetail((d) =>
        d
          ? {
              ...d,
              comments: [...d.comments, res.comment],
              issue: { ...d.issue, commentCount: d.issue.commentCount + 1 },
            }
          : d,
      );
      setComment("");
    } finally {
      setPosting(false);
    }
  };

  const updateIssue = (patch: Partial<typeof issue>) => {
    setDetail((d) => (d ? { ...d, issue: { ...d.issue, ...patch } } : d));
  };

  return (
    <div className="fade-in" style={{ maxWidth: 780, margin: "0 auto", width: "100%" }}>
      {/* Hero */}
      {reportImages.length > 0 && (
        <div className="detail-hero" style={{ position: "relative" }}>
          <img src={reportImages[activeImage]?.url} alt={issue.title} />
          {reportImages.length > 1 && (
            <div className="row" style={{ position: "absolute", bottom: 10, right: 10 }}>
              {reportImages.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(i)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: i === activeImage ? "2px solid #fff" : "none",
                    padding: 0,
                    overflow: "hidden",
                    opacity: i === activeImage ? 1 : 0.6,
                  }}
                >
                  <img src={img.thumbUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ paddingTop: 10 }}>
        {/* Header card */}
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
            <StatusBadge status={issue.status} />
            <TierBadge tier={issue.priorityTier} />
          </div>
          <h1 style={{ fontSize: 21, marginTop: 10 }}>{issue.title}</h1>
          <div className="issue-meta" style={{ marginTop: 6 }}>
            <CategoryChip name={issue.categoryName} color={issue.categoryColor} icon={issue.categoryIcon} />
            <span className="meta-item">📍 {issue.areaName || "Nearby"}</span>
            {issue.distanceM != null && (
              <span className="meta-item">
                {issue.distanceM < 1000 ? `${Math.round(issue.distanceM)} m away` : `${(issue.distanceM / 1000).toFixed(1)} km away`}
              </span>
            )}
          </div>
          {issue.duplicateNote && <div className="dup-note">👥 {issue.duplicateNote}</div>}
          {issue.description && (
            <p style={{ fontSize: 14.5, color: "var(--text-2)", marginTop: 10 }}>{issue.description}</p>
          )}

          <div className="spread" style={{ marginTop: 14 }}>
            <UpvoteButton
              issueId={issue.id}
              count={issue.upvoteCount}
              voted={issue.userUpvoted}
              big
              onConfirmed={(res) =>
                updateIssue({
                  upvoteCount: res.upvoteCount,
                  priorityScore: res.priorityScore,
                  priorityTier: res.priorityTier as IssueSummary["priorityTier"],
                })
              }
            />
            <span className="muted">Reported {timeAgo(issue.firstReportedAt)}</span>
          </div>
        </div>

        {/* Priority breakdown */}
        {detail.priorityBreakdown && (
          <PriorityCard issueTitle={issue.title} breakdown={detail.priorityBreakdown} />
        )}

        {/* Location */}
        <div className="card" style={{ padding: 16 }}>
          <div className="panel-title">📍 Where it is</div>
          <div className="mini-map" style={{ height: 170, position: "relative", display: "block" }}>
            <PinMap lat={issue.latitude} lng={issue.longitude} area={issue.areaName} />
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            {issue.areaName || "Area not named"} · {issue.latitude.toFixed(5)}, {issue.longitude.toFixed(5)}
            {detail.reports.length > 1 && ` · ${detail.reports.length} people reported this`}
          </p>
        </div>

        {/* AI analysis */}
        {detail.aiResult && (
          <div className="card" style={{ padding: 16 }}>
            <div className="panel-title">🧠 AI analysis</div>
            <div className="ai-badge-row">
              <span className="chip" style={{ background: "var(--surface-2)", fontWeight: 800 }}>
                {detail.aiResult.type}
              </span>
              <span className="muted">
                {Math.round(detail.aiResult.confidence * 100)}% confidence
              </span>
            </div>
            <p className="ai-explanation">{detail.aiResult.explanation}</p>
            <EvidenceChips signals={detail.aiResult.signals} imageAnalyzed={detail.aiResult.imageAnalyzed} />
            <p className="muted">
              Assigned department: <strong>{detail.department ?? "—"}</strong>{" "}
              {detail.issue.status === "ai_analyzed" && "· pending verification"}
            </p>
          </div>
        )}

        {/* Resolution */}
        <ResolutionSection detail={detail} onUpdated={load} isReporter={detail.isReporter} userId={user?.id} />

        {/* Timeline */}
        <div className="card">
          <div className="panel-title" style={{ padding: "14px 16px 0" }}>
            🛠 Status timeline
          </div>
          <Timeline history={detail.history} />
        </div>

        {/* Comments */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div className="panel-title">💬 Discussion ({detail.comments.length})</div>
          {detail.comments.length === 0 && (
            <p className="muted">No comments yet — add context, photos, or updates.</p>
          )}
          {detail.comments.map((c) => (
            <div className="comment" key={c.id}>
              <span style={{ display: "inline-flex" }}>
                <span
                  className="avatar"
                  style={{ width: 30, height: 30, fontSize: 11 }}
                >
                  {initials(c.authorName)}
                </span>
              </span>
              <div className="comment-body">
                <span className="comment-author">{c.authorName}</span>
                <span className="comment-time"> · {timeAgo(c.createdAt)}</span>
                <p className="comment-text">{c.body}</p>
              </div>
            </div>
          ))}
          <form onSubmit={postComment} style={{ marginTop: 10 }}>
            <div className="row" style={{ alignItems: "flex-end" }}>
              {user && <UserAvatar user={user} size={32} />}
              <textarea
                className="textarea"
                style={{ flex: 1, minHeight: 44 }}
                placeholder="Add an update…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
              />
              <button className="btn btn-primary" disabled={posting || !comment.trim()}>
                Post
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function PriorityCard({ issueTitle, breakdown }: { issueTitle: string; breakdown: PriorityBreakdown }) {
  const rows: Array<{ label: string; value: number; max: number; hint: string }> = [
    { label: "Base severity", value: breakdown.baseSeverity, max: 40, hint: "from the AI-classified severity" },
    { label: "Community popularity", value: breakdown.popularity, max: 30, hint: "upvotes + duplicate reports" },
    { label: "Safety risk", value: breakdown.safetyRisk, max: 20, hint: "schools, traffic, injury language" },
    { label: "Location importance", value: breakdown.locationImportance, max: 10, hint: "near schools/hospitals/main roads" },
  ];
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="spread">
        <div className="panel-title" style={{ marginBottom: 0 }}>
          ⚖️ Priority score
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="big-num" style={{ fontSize: 28 }}>{breakdown.total}</span>
          <span className={`chip tier-${breakdown.tier}`} style={{ alignSelf: "center" }}>
            {TIER_LABELS[breakdown.tier]}
          </span>
        </div>
      </div>
      <div className="priority-meter" style={{ margin: "10px 0 14px" }}>
        <div className="fill" style={{ width: `${breakdown.total}%` }} />
      </div>
      {rows.map((r) => (
        <div className="breakdown-row" key={r.label} title={r.hint}>
          <span className="b-label">{r.label}</span>
          <div className="b-track">
            <div className="b-fill" style={{ width: `${(r.value / r.max) * 100}%`, background: r.value === 0 ? "var(--surface-3)" : undefined }} />
          </div>
          <span className="b-val">{r.value}</span>
        </div>
      ))}
      <p className="muted" style={{ marginTop: 8 }}>
        Age decay: −{breakdown.ageDecay} · More upvotes & reports push this issue up.{" "}
        <em>“{issueTitle}” gets fixed when its score says it matters.</em>
      </p>
    </div>
  );
}

function Timeline({ history }: { history: Detail["history"] }) {
  const lastIdx = history.length - 1;
  if (history.length === 0) {
    return <p className="muted" style={{ padding: "0 16px 14px" }}>No status changes recorded yet.</p>;
  }
  return (
    <div className="timeline">
      {history.map((h, i) => {
        const isLast = i === lastIdx;
        return (
          <div className={`tl-item ${isLast ? "current" : "done"}`} key={h.id}>
            <div className="tl-rail">
              <span className="tl-dot" />
              {!isLast && <span className="tl-line" />}
            </div>
            <div className="tl-content">
              <div className="tl-title">
                {h.fromStatus ? `${STATUS_LABELS[h.fromStatus as IssueStatus]} → ` : ""}
                {STATUS_LABELS[h.toStatus]}
                {isLast && <span className="muted"> (current)</span>}
              </div>
              <div className="tl-sub">
                {formatDateTime(h.createdAt)}
                {h.changedByName && ` · by ${h.changedByName}`}
              </div>
              {h.note && <div className="tl-sub" style={{ fontStyle: "italic" }}>“{h.note}”</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PinMap({ lat, lng, area }: { lat: number; lng: number; area: string }) {
  // Stylized SVG "map": roads + pin. No map service needed for the demo.
  return (
    <svg viewBox="0 0 400 170" style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <rect width="400" height="170" fill="transparent" />
      <path d="M-10 60 Q100 40 200 70 T410 80" stroke="rgba(255,255,255,0.55)" strokeWidth="14" fill="none" />
      <path d="M-10 120 Q150 150 410 100" stroke="rgba(255,255,255,0.4)" strokeWidth="8" fill="none" />
      <rect x="40" y="30" width="60" height="40" rx="6" fill="rgba(255,255,255,0.3)" />
      <rect x="300" y="90" width="60" height="40" rx="6" fill="rgba(255,255,255,0.25)" />
      {/* Pin */}
      <g transform="translate(200, 60)">
        <path d="M0 -46 C-22 -46 -30 -24 -30 -8 C-30 16 0 46 0 46 C0 46 30 16 30 -8 C30 -24 22 -46 0 -46 Z" fill="#dc2626" stroke="#fff" strokeWidth="3" />
        <circle cx="0" cy="-10" r="11" fill="#fff" />
      </g>
      <text x="200" y="160" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" opacity="0.7">
        {area || "Pin"} · {lat.toFixed(4)}, {lng.toFixed(4)}
      </text>
    </svg>
  );
}

function ResolutionSection({
  detail,
  onUpdated,
  isReporter,
  userId,
}: {
  detail: Detail;
  onUpdated: () => void;
  isReporter: boolean;
  userId?: string;
}) {
  const res = detail.resolution;
  const { issue } = detail;
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (issue.status !== "resolved" && issue.status !== "confirmed") return null;
  if (!res) return null;

  const confirm = async (value: boolean) => {
    if (!userId || !isReporter) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/api/issues/${issue.id}/confirm-resolution`, {
        confirm: value,
        reason: value ? undefined : reason || "Not actually fixed",
      });
      onUpdated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't send your response");
    } finally {
      setBusy(false);
    }
  };

  const alreadyConfirmed = !!res.confirmed || issue.status === "confirmed";
  const alreadyRejected = !!res.rejected;

  return (
    <div className="card" style={{ padding: 16, borderColor: "color-mix(in srgb, var(--success) 40%, var(--border))" }}>
      <div className="spread">
        <div className="panel-title" style={{ marginBottom: 0 }}>
          ✅ Resolved {alreadyConfirmed && "— confirmed by the community"}
        </div>
        {alreadyConfirmed ? (
          <span className="chip tier-low" style={{ background: "color-mix(in srgb, var(--success) 15%, var(--surface))", color: "var(--success)" }}>
            Verified fixed
          </span>
        ) : (
          <StatusBadge status={issue.status} />
        )}
      </div>
      <p style={{ fontSize: 13.5 }}>{res.note}</p>
      <div className="muted" style={{ marginBottom: 8 }}>
        Resolved {formatDateTime(res.resolvedAt)} by {res.resolvedByName ?? "the city"}
        {res.confirmedByName && ` · confirmed by ${res.confirmedByName}`}
      </div>
      {res.afterPhotoUrl && (
        <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
          <img src={res.afterPhotoUrl} alt="After the fix" style={{ width: "100%", maxHeight: 260, objectFit: "cover" }} />
        </div>
      )}
      {alreadyConfirmed && <p className="muted">✅ You're all set — thanks for helping keep your city honest.</p>}

      {!alreadyConfirmed && isReporter && (
        <div className="card" style={{ background: "var(--surface-2)", padding: 14, boxShadow: "none" }}>
          <strong style={{ fontSize: 14 }}>Is it actually fixed?</strong>
          <p className="muted" style={{ margin: "4px 0 10px" }}>
            Your confirmation makes this official — and stops fake resolutions.
          </p>
          {rejecting ? (
            <>
              <textarea
                className="textarea"
                placeholder="What's still wrong? (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ minHeight: 60 }}
              />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-danger" disabled={busy} onClick={() => void confirm(false)}>
                  {busy ? "…" : "It's NOT fixed"}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => void confirm(true)}>
                ✅ Yes, it's fixed
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(true)}>
                No, not really
              </button>
            </div>
          )}
          {alreadyRejected && (
            <p className="muted" style={{ marginTop: 8 }}>
              ⚠️ A reporter already flagged this as not fixed{res.rejectionReason ? `: “${res.rejectionReason}”` : ""}.
            </p>
          )}
          {message && <div className="form-error" style={{ marginTop: 6 }}>{message}</div>}
        </div>
      )}
      {!isReporter && !alreadyConfirmed && (
        <p className="muted">Only people who reported this issue can confirm the fix.</p>
      )}
    </div>
  );
}