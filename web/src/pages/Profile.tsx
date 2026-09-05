import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { IssueCard } from "../components/IssueCard";
import { UserAvatar } from "../components/UserAvatar";
import { useAuth } from "../context/AuthContext";
import { timeAgo } from "../lib/format";
import type { IssueSummary, User } from "../lib/types";

interface ProfileData {
  user: User;
  impact: number;
  impactBreakdown: { reportedIssues: number; communityAttention: number; confirmedFixedBonus: number };
  stats: { reportCount: number; upvoteCount: number; confirmedCount: number; civicStreakWeeks: number };
}

export default function Profile() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [tab, setTab] = useState<"reports" | "upvotes">("reports");
  const [lists, setLists] = useState<{ reports: IssueSummary[]; upvotes: IssueSummary[] }>({
    reports: [],
    upvotes: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      api.get<ProfileData>("/api/me/profile"),
      api.get<{ items: IssueSummary[] }>("/api/me/reports"),
      api.get<{ items: IssueSummary[] }>("/api/me/upvotes"),
    ])
      .then(([profile, reports, upvotes]) => {
        setData(profile);
        setLists({ reports: reports.items, upvotes: upvotes.items });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;
  if (loading || !data) {
    return (
      <div className="state-box">
        <div className="loader" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  const streak = data.stats.civicStreakWeeks;

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="card" style={{ margin: "12px 12px 0", padding: 18 }}>
        <div className="row" style={{ gap: 14 }}>
          <UserAvatar user={user} size={58} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 19 }}>{user.displayName}</h2>
            <p className="muted">
              {user.email} · {user.role === "authority" ? "🏛 City authority" : "🧑🏽 Citizen"}
            </p>
          </div>
          <button className="pill-btn" onClick={logout}>Sign out</button>
        </div>
        <div className="divider" />
        <div className="spread" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="big-num" style={{ fontSize: 34 }}>{data.impact}</div>
            <div className="muted" style={{ fontWeight: 700 }}>Impact score</div>
          </div>
          <div className="muted" style={{ textAlign: "right", fontSize: 12.5 }}>
            {streak >= 2 ? `🔥 ${streak}-week civic streak` : "Keep reporting to build a streak"}
            <div>✓ {data.stats.confirmedCount} confirmed fixes</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {[
            { label: "Reports", value: data.stats.reportCount },
            { label: "Upvotes given", value: data.stats.upvoteCount },
            { label: "Attention earned", value: data.impactBreakdown.communityAttention },
          ].map((s) => (
            <div key={s.label} className="stat-card" style={{ flex: 1, minWidth: 90 }}>
              <div className="stat-num" style={{ fontSize: 18 }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="sortbar">
        <button className={`sort-chip ${tab === "reports" ? "active" : ""}`} onClick={() => setTab("reports")}>
          📣 My reports ({lists.reports.length})
        </button>
        <button className={`sort-chip ${tab === "upvotes" ? "active" : ""}`} onClick={() => setTab("upvotes")}>
          👍 My upvotes ({lists.upvotes.length})
        </button>
      </div>

      <div className="stack">
        {(tab === "reports" ? lists.reports : lists.upvotes).length === 0 ? (
          <div className="state-box">
            <div className="state-icon">{tab === "reports" ? "📣" : "👍"}</div>
            <h3>{tab === "reports" ? "No reports yet" : "No upvotes yet"}</h3>
            <p>
              {tab === "reports"
                ? "Seen something broken? Be the first to flag it."
                : "Upvote issues you care about — it decides what gets fixed first."}
            </p>
            <Link to={tab === "reports" ? "/report" : "/feed"} className="btn btn-primary">
              {tab === "reports" ? "Report an issue" : "Browse the feed"}
            </Link>
          </div>
        ) : (
          (tab === "reports" ? lists.reports : lists.upvotes).map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))
        )}
        {tab === "reports" && lists.reports.length > 0 && (
          <p className="muted" style={{ textAlign: "center" }}>
            Joined CivicPulse {timeAgo(user.createdAt)}
          </p>
        )}
      </div>
    </div>
  );
}