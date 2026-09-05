import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge, TierBadge } from "../components/badges";
import { api } from "../lib/api";
import { formatDateTime, timeAgo } from "../lib/format";
import { STATUS_LABELS, type IssueStatus, type IssueSummary, type PriorityBreakdown } from "../lib/types";

interface AdminDetail {
  issue: IssueSummary;
  priorityBreakdown: PriorityBreakdown | null;
  reports: Array<{ id: string; description: string | null; reporter_name: string; reporter_email: string; created_at: string }>;
  images: Array<{ url: string; thumb_url: string; kind: string; created_at: string }>;
  history: Array<{ from_status: string | null; to_status: string; note: string | null; created_at: string; changed_by_name: string | null }>;
  departments: Array<{ id: number; name: string }>;
  allowedTransitions: IssueStatus[];
}

export default function AdminIssueDetail() {
  const { id } = useParams();
  const [data, setData] = useState<AdminDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!id) return;
    api
      .get<AdminDetail>(`/api/admin/issues/${id}`)
      .then((res) => {
        setData(res);
        setDeptId(null);
        setActionMsg(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load issue"));
  };

  useEffect(load, [id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) {
    return (
      <div className="state-box">
        <div className="loader" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  const { issue } = data;
  const statusIndex = (["reported", "ai_analyzed", "verified", "assigned", "in_progress", "resolved", "confirmed"] as const).indexOf(issue.status);
  const canVerify = issue.status === "reported" || issue.status === "ai_analyzed";

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setActionMsg(null);
    try {
      await fn();
      setActionMsg(ok);
      load();
    } catch (err) {
      setActionMsg(err instanceof Error ? `⚠️ ${err.message}` : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const resolve = () =>
    act(async () => {
      const form = new FormData();
      form.append("note", note.trim());
      if (afterPhoto) form.append("afterPhoto", afterPhoto);
      await api.postForm(`/api/admin/issues/${issue.id}/resolve`, form);
    }, "✅ Marked resolved — reporters were notified to confirm.");

  return (
    <div className="fade-in" style={{ padding: "0 12px" }}>
      <div className="row" style={{ margin: "12px 0" }}>
        <Link to="/admin/issues" className="pill-btn">← Queue</Link>
      </div>

      {actionMsg && (
        <div className={`error-banner ${actionMsg.startsWith("✅") ? "" : ""}`} style={{ color: actionMsg.startsWith("⚠️") ? undefined : "var(--success)", borderColor: "currentColor", background: "color-mix(in srgb, currentColor 8%, var(--surface))" }}>
          {actionMsg}
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <StatusBadge status={issue.status} />
              <TierBadge tier={issue.priorityTier} />
            </div>
            <h2 style={{ marginTop: 8 }}>{issue.title}</h2>
            <p className="muted">
              {issue.categoryName} · {issue.areaName || "no area"} · first reported {timeAgo(issue.firstReportedAt)}
            </p>
          </div>
          <div className="row">
            <span className={`chip tier-${issue.priorityTier}`}>{issue.priorityScore}/100</span>
            <span className="muted">👍 {issue.upvoteCount} · 👥 {issue.reportCount} · 💬 {issue.commentCount}</span>
          </div>
        </div>
        {issue.description && <p style={{ marginTop: 8, fontSize: 14.5 }}>{issue.description}</p>}
        {issue.photoUrl && (
          <img src={issue.photoUrl} alt="" style={{ borderRadius: 12, marginTop: 10, maxHeight: 220, objectFit: "cover" }} />
        )}
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-title">Actions</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {canVerify && (
            <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api.post(`/api/admin/issues/${issue.id}/verify`), "✅ Verified on the record.")}>
              🛡 Verify report
            </button>
          )}

          <div className="row">
            <select className="select" value={deptId ?? ""} onChange={(e) => setDeptId(e.target.value ? Number(e.target.value) : null)} style={{ width: 170 }}>
              <option value="">Assign to…</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              className="btn btn-ghost"
              disabled={busy || deptId == null}
              onClick={() => deptId != null && act(() => api.post(`/api/admin/issues/${issue.id}/assign`, { departmentId: deptId }), "✅ Assigned to department.")}
            >
              Assign
            </button>
          </div>

          {data.allowedTransitions
            .filter((s) => s !== "resolved")
            .map((s) => (
              <button
                key={s}
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => act(() => api.post(`/api/admin/issues/${issue.id}/status`, { status: s }), `✅ Status → ${STATUS_LABELS[s]}.`)}
              >
                → {STATUS_LABELS[s]}
              </button>
            ))}
        </div>

        {data.allowedTransitions.includes("resolved") && issue.status !== "resolved" && issue.status !== "confirmed" && (
          <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none", padding: 14, marginTop: 12 }}>
            <strong>Mark resolved + notify reporters</strong>
            <p className="muted" style={{ margin: "4px 0 8px" }}>
              Add a note and (recommended) an after-fix photo. Reporters must confirm it's real.
            </p>
            <textarea className="textarea" placeholder="What was done?" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 52 }} />
            <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
              {afterPhoto ? (
                <span className="pill-btn" onClick={() => fileRef.current?.click()}>📷 {afterPhoto.name}</span>
              ) : (
                <button className="pill-btn" onClick={() => fileRef.current?.click()}>📷 Add after photo</button>
              )}
              <button className="btn btn-primary" disabled={busy} onClick={() => void resolve()}>
                ✅ Mark resolved
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setAfterPhoto(e.target.files?.[0] ?? null)} />
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-title">Reports ({data.reports.length})</div>
        {data.reports.map((r) => (
          <div key={r.id} className="insight-item">
            <span className="bulb">👤</span>
            <span style={{ flex: 1 }}>
              <strong>{r.reporter_name}</strong> <span className="muted">({r.reporter_email})</span>
              <span className="muted" style={{ display: "block" }}>{formatDateTime(r.created_at)}</span>
            </span>
            {r.description && <span className="muted" style={{ maxWidth: 380 }}>{r.description}</span>}
          </div>
        ))}
        {data.reports.length === 0 && <p className="muted">No individual reports.</p>}
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-title">Status history</div>
        {data.history.map((h, i) => (
          <div key={i} className="insight-item">
            <span className="bulb">▸</span>
            <span style={{ flex: 1 }}>
              <strong>{h.from_status ? `${STATUS_LABELS[h.from_status as IssueStatus]} → ${STATUS_LABELS[h.to_status as IssueStatus]}` : STATUS_LABELS[h.to_status as IssueStatus]}</strong>
              <span className="muted" style={{ display: "block" }}>
                {formatDateTime(h.created_at)} {h.changed_by_name && `· by ${h.changed_by_name}`}
              </span>
            </span>
            {h.note && <span className="muted" style={{ maxWidth: 300 }}>“{h.note}”</span>}
          </div>
        ))}
        <p className="muted" style={{ marginTop: 6 }}>
          Workflow position {statusIndex + 1} of 7 · current: {STATUS_LABELS[issue.status]}
        </p>
      </div>
    </div>
  );
}