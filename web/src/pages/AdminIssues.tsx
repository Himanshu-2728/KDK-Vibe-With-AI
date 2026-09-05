import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../components/badges";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";

interface AdminIssueRow {
  id: string;
  title: string;
  status: string;
  severity: string;
  priority_score: number;
  upvote_count: number;
  report_count: number;
  area_name: string | null;
  first_reported_at: string;
  category_name: string;
  category_color: string;
  department_name: string | null;
}

const STATUSES = ["reported", "ai_analyzed", "verified", "assigned", "in_progress", "resolved", "confirmed"];

export default function AdminIssues() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<AdminIssueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const area = searchParams.get("area") ?? "";
  const areaRef = useRef(area);
  areaRef.current = area;
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Area list for the filter — stable regardless of current filters.
  useEffect(() => {
    api
      .get<{ areas: string[] }>("/api/admin/summary")
      .then((s) => setAreas(s.areas ?? []))
      .catch(() => setAreas([]));
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (department) params.set("department", department);
    const a = areaRef.current;
    if (a) params.set("area", a);
    if (q) params.set("q", q);
    api
      .get<{ items: AdminIssueRow[]; total: number }>(`/api/admin/issues?${params}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load issues"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, category, department, area, q]);

  const search = () => setQ(searchInput.trim());

  const pending = items.filter((i) => i.status === "reported" || i.status === "ai_analyzed");

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Issue queue</h1>
        <p>{total} lines of work · {pending.length} waiting for review</p>
      </div>

      {error && (
        <div className="error-banner" style={{ margin: "0 12px 8px" }}>
          {error}
          <button className="pill-btn" style={{ marginLeft: 8 }} onClick={load}>
            Retry
          </button>
        </div>
      )}

      <div className="panel" style={{ margin: "4px 12px" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <select className="select" style={{ flex: 1, minWidth: 130 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <select className="select" style={{ flex: 1, minWidth: 130 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            <option value="1">Infrastructure</option>
            <option value="2">Sanitation</option>
            <option value="3">Water</option>
            <option value="4">Electrical</option>
            <option value="5">Safety</option>
            <option value="6">Environment</option>
          </select>
          <select className="select" style={{ flex: 1, minWidth: 130 }} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            <option value="1">Roads</option>
            <option value="2">Electrical</option>
            <option value="3">Water</option>
            <option value="4">Waste Management</option>
            <option value="5">Municipal</option>
          </select>
          <select
            className="select"
            style={{ flex: 1, minWidth: 150 }}
            value={area}
            onChange={(e) => {
              const next = e.target.value;
              setSearchParams((p) => {
                if (next) p.set("area", next);
                else p.delete("area");
                return p;
              });
            }}
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div className="row" style={{ flex: 2, minWidth: 200 }}>
            <input
              className="input"
              placeholder="Search title, description, area…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <button className="btn btn-ghost" onClick={search}>Search</button>
          </div>
        </div>        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ marginTop: 12 }}><thead><tr><th>Priority</th><th>Issue</th><th>Category</th><th>Dept</th><th>Status</th><th>Votes</th><th>Reported</th></tr></thead><tbody>{loading ? (
            <tr><td colSpan={7} className="muted">Loading…</td></tr>
          ) : items.length === 0 ? (
            <tr><td colSpan={7} className="muted">No issues match.</td></tr>
          ) : (
            items.map((row) => (
              <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/admin/issues/${row.id}`)}>
                <td><span className={`chip tier-${row.priority_score >= 75 ? "critical" : row.priority_score >= 50 ? "high" : row.priority_score >= 25 ? "medium" : "low"}`}>{row.priority_score}</span></td>
                <td><strong>{row.title}</strong><span className="muted" style={{ display: "block" }}>{row.area_name ?? "—"}</span></td>
                <td><span className="chip" style={{ background: `${row.category_color}1f`, color: row.category_color }}>{row.category_name}</span></td>
                <td className="muted">{row.department_name ?? "auto"}</td>
                <td><StatusBadge status={row.status as never} /></td>
                <td>👍 {row.upvote_count} · 👥 {row.report_count}</td>
                <td className="muted">{timeAgo(row.first_reported_at)}</td>
              </tr>
            ))
          )}</tbody></table>
        </div>
      </div>
    </div>
  );
}