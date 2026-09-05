import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { NotificationItem } from "../lib/types";

const TYPE_ICON: Record<string, string> = {
  report_submitted: "📨",
  ai_analyzed: "✨",
  merged: "👥",
  verified: "🛡",
  assigned: "📋",
  status_changed: "🔁",
  resolved: "✅",
  resolution_confirmed: "🎉",
  resolution_rejected: "⚠️",
  priority_tier_up: "🚨",
  new_comment: "💬",
  new_reporter: "👥",
};

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: NotificationItem[]; unreadCount: number }>(
        "/api/notifications",
      );
      setItems(res.items);
      setUnread(res.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const markRead = async (id: string) => {
    await api.post(`/api/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: 1 } : n)));
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await api.post("/api/notifications/read-all");
    setItems((prev) => prev.map((n) => ({ ...n, read: 1 })));
    setUnread(0);
  };

  return (
    <div className="fade-in">
      <div className="page-head spread">
        <div>
          <h1>Alerts</h1>
          <p>{unread > 0 ? `${unread} unread` : "You're all caught up"}</p>
        </div>
        {unread > 0 && (
          <button className="pill-btn" onClick={() => void markAll()}>
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="state-box">
          <div className="loader" style={{ margin: "0 auto" }} />
        </div>
      ) : error ? (
        <div className="error-banner">
          {error}
          <button className="pill-btn" style={{ marginLeft: 8 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="state-box">
          <div className="state-icon">🔕</div>
          <h3>Nothing yet</h3>
          <p>You'll get notified as your reports move through the pipeline.</p>
          <Link to="/report" className="btn btn-primary">Report an issue</Link>
        </div>
      ) : (
        <div className="card" style={{ margin: "4px 12px" }}>
          {items.map((n) => (
            <div
              key={n.id}
              className={`notif ${n.read ? "" : "unread"}`}
              onClick={() => !n.read && void markRead(n.id)}
              role={n.read ? undefined : "button"}
            >
              <span className="notif-icon">{TYPE_ICON[n.type] ?? "🔔"}</span>
              <div className="notif-body">
                {n.issue_id ? (
                  <Link to={`/issue/${n.issue_id}`} onClick={(e) => e.stopPropagation()}>
                    {n.body}
                  </Link>
                ) : (
                  n.body
                )}
                <div className="notif-meta">{timeAgo(n.created_at)}</div>
              </div>
              {!n.read && <span className="muted" style={{ color: "var(--brand)" }}>●</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}