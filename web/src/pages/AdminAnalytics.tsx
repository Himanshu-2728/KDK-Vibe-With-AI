import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Analytics {
  categoryTrend: Array<{ name: string; color: string; this_period: number; prev_period: number }>;
  byMonth: Array<{ month: string; count: number }>;
  topUnresolvedAreas: Array<{ area: string; unresolved: number }>;
  insights: string[];
}

export default function AdminAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Analytics>("/api/admin/analytics")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load analytics"));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) {
    return (
      <div className="state-box">
        <div className="loader" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  const maxMonth = Math.max(1, ...data.byMonth.map((m) => m.count));

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Analytics</h1>
        <p>Trends phrased for decisions, not just dashboards.</p>
      </div>

      <div className="section-title">💡 Insights</div>
      <div className="panel" style={{ margin: "0 12px" }}>
        {data.insights.length === 0 && <p className="muted">Not enough data for trends yet — report volume is still low.</p>}
        {data.insights.map((ins, i) => (
          <div key={i} className="insight-item">
            <span className="bulb">💡</span>
            {ins}
          </div>
        ))}
      </div>

      <div className="section-title">Reports per month</div>
      <div className="panel" style={{ margin: "0 12px" }}>
        <div className="row" style={{ alignItems: "flex-end", gap: 8, height: 140 }}>
          {data.byMonth.map((m) => (
            <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{m.count}</span>
              <div
                style={{
                  width: "100%",
                  maxWidth: 46,
                  height: `${Math.max(4, (m.count / maxMonth) * 100)}%`,
                  borderRadius: "6px 6px 0 0",
                  background: "linear-gradient(180deg, var(--brand), var(--brand-strong))",
                }}
              />
              <span className="muted" style={{ fontSize: 10 }}>{m.month.slice(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-title">Category trends (this month vs last)</div>
      <div className="panel" style={{ margin: "0 12px" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>This month</th>
              <th>Last month</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {data.categoryTrend.map((c) => {
              const prev = c.prev_period;
              const curr = c.this_period;
              const change = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? null : 0;
              return (
                <tr key={c.name}>
                  <td>
                    <span style={{ color: c.color }}>●</span> {c.name}
                  </td>
                  <td>{curr}</td>
                  <td>{prev}</td>
                  <td>
                    {change == null ? (
                      <span className="chip tier-medium">new</span>
                    ) : change > 0 ? (
                      <span className="chip tier-critical">▲ {change}%</span>
                    ) : change < 0 ? (
                      <span className="chip tier-low">▼ {Math.abs(change)}%</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section-title">Most unresolved areas</div>
      <div className="panel" style={{ margin: "0 12px 24px" }}>
        {data.topUnresolvedAreas.map((a, i) => (
          <div key={a.area} className="insight-item">
            <span className="bulb">{i + 1}.</span>
            <span style={{ flex: 1 }}>
              <strong>{a.area}</strong> — {a.unresolved} unresolved {a.unresolved === 1 ? "report" : "reports"}
            </span>
          </div>
        ))}
        {data.topUnresolvedAreas.length === 0 && <p className="muted">Everything is resolved — a good day for the city. 🎉</p>}
      </div>
    </div>
  );
}