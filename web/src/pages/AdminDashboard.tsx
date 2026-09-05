import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heatmap, type HeatCell } from "../components/admin/Heatmap";
import { StatusBadge } from "../components/badges";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";

interface Summary {
  stats: {
    total: number;
    pending: number;
    highPriority: number;
    critical: number;
    resolved: number;
    totalUpvotes: number;
    totalReports: number;
    avgResolutionHours: number | null;
  };
  byCategory: Array<{ name: string; color: string; count: number; resolved: number }>;
  byStatus: Array<{ status: string; count: number }>;
  heatmap: HeatCell[];
  areas: string[];
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ id: string; title: string; status: string; priority_score: number; first_reported_at: string }>>([]);

  useEffect(() => {
    Promise.all([
      api.get<Summary>("/api/admin/summary"),
      api.get<{ items: Array<{ id: string; title: string; status: string; priority_score: number; first_reported_at: string }> }>(
        "/api/admin/issues?limit=6",
      ),
    ])
      .then(([s, r]) => {
        setData(s);
        setRecent(r.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load dashboard"));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) {
    return (
      <div className="state-box">
        <div className="loader" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  const { stats } = data;
  const avgDays = stats.avgResolutionHours != null ? (stats.avgResolutionHours / 24).toFixed(1) : "—";

  const cards = [
    { label: "Total reports", value: stats.total, icon: "🗂" },
    { label: "Pending review", value: stats.pending, icon: "🕓" },
    { label: "High priority", value: stats.highPriority, icon: "⚠️" },
    { label: "Critical", value: stats.critical, icon: "🚨" },
    { label: "Resolved", value: stats.resolved, icon: "✅" },
    { label: "Avg resolution", value: `${avgDays}d`, icon: "⏱" },
  ];

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Command center</h1>
        <p>What your city needs attention on, right now.</p>
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat-card" key={c.label}>
            <div className="stat-num">
              {c.icon} {c.value}
            </div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="section-title">Density map — unresolved issues by area</div>
      <div className="panel" style={{ margin: "0 12px" }}>
        <Heatmap cells={data.heatmap} onPick={(area) => navigate(`/admin/issues?area=${encodeURIComponent(area)}`)} />
        <div className="row" style={{ gap: 14, marginTop: 8, flexWrap: "wrap" }}>
          <LegendDot color="rgba(34,197,94,0.6)" label="Low density" />
          <LegendDot color="rgba(250,204,21,0.65)" label="Medium density" />
          <LegendDot color="rgba(239,68,68,0.6)" label="High density" />
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Tap a cluster to open its issue queue.
        </p>
      </div>

      <div className="section-title">By category</div>
      <div className="panel" style={{ margin: "0 12px" }}>
        {data.byCategory.map((c) => {
          const pct = c.count ? Math.round((c.resolved / c.count) * 100) : 0;
          return (
            <div key={c.name} className="breakdown-row">
              <span className="b-label">
                <span style={{ color: c.color }}>●</span> {c.name}
              </span>
              <div className="b-track">
                <div className="b-fill" style={{ width: `${Math.max(3, pct)}%`, background: c.color, opacity: 0.75 }} />
              </div>
              <span className="b-val" style={{ width: 64, fontSize: 11.5 }}>
                {c.resolved}/{c.count} done
              </span>
            </div>
          );
        })}
        <p className="muted" style={{ marginTop: 8 }}>
          Bars show the share already resolved · {stats.totalReports} individual reports, {stats.totalUpvotes} upvotes across {stats.total} open lines of work.
        </p>
      </div>

      <div className="section-title">Needs attention</div>
      <div className="panel" style={{ margin: "0 12px" }}>
        {recent.length === 0 && <p className="muted">Nothing to show.</p>}
        {recent.map((r) => (
          <Link key={r.id} to={`/admin/issues/${r.id}`} className="insight-item">
            <span className="bulb">{r.priority_score >= 75 ? "🚨" : r.priority_score >= 50 ? "⚠️" : "•"}</span>
            <span style={{ flex: 1 }}>
              <strong>{r.title}</strong>
              <span className="muted" style={{ display: "block" }}>
                {timeAgo(r.first_reported_at)} · priority {r.priority_score}
              </span>
            </span>
            <StatusBadge status={r.status as never} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}