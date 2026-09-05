import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { uploadImage } from "../middleware/upload.js";
import {
  getIssueRow,
  invalidatePhotoCache,
  issueToSummary,
  parseBreakdown,
  recomputeIssue,
  STATUS_ORDER,
  transitionStatus,
  type IssueRow,
} from "../services/issues.js";
import { AREA_SHORT_BY_LABEL, SEED_AREAS, shortToLabel } from "../areas.js";
import { createNotification, reporterIds } from "../services/notifications.js";
import type { IssueStatus } from "../types.js";

const router = Router();
router.use(requireAuth, requireRole("authority"));

const PENDING_STATUSES = new Set(["reported", "ai_analyzed"]);

/** GET /api/admin/summary — stat cards, category/status breakdown, heatmap cells. */
router.get("/summary", (_req: AuthedRequest, res) => {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS n FROM issues").get() as { n: number }).n;
  const pending = (
    db
      .prepare("SELECT COUNT(*) AS n FROM issues WHERE status IN ('reported','ai_analyzed')")
      .get() as { n: number }
  ).n;
  const highPriority = (
    db.prepare("SELECT COUNT(*) AS n FROM issues WHERE priority_score >= 50").get() as { n: number }
  ).n;
  const critical = (
    db.prepare("SELECT COUNT(*) AS n FROM issues WHERE priority_score >= 75").get() as { n: number }
  ).n;
  const resolved = (
    db
      .prepare("SELECT COUNT(*) AS n FROM issues WHERE status IN ('resolved','confirmed')")
      .get() as { n: number }
  ).n;
  const totalUpvotes = (
    db.prepare("SELECT COUNT(*) AS n FROM upvotes").get() as { n: number }
  ).n;
  const totalReports = (
    db.prepare("SELECT COUNT(*) AS n FROM issue_reports").get() as { n: number }
  ).n;

  const avgResolutionHours = (
    db
      .prepare(
        `SELECT AVG((julianday(COALESCE(resolved_at, confirmed_at)) - julianday(first_reported_at)) * 24) AS h
         FROM issues WHERE status IN ('resolved','confirmed') AND resolved_at IS NOT NULL`,
      )
      .get() as { h: number | null }
  ).h;

  const byCategory = db
    .prepare(
      `SELECT c.name, c.color, COUNT(i.id) AS count,
         SUM(CASE WHEN i.status IN ('resolved','confirmed') THEN 1 ELSE 0 END) AS resolved
       FROM issue_categories c LEFT JOIN issues i ON i.category_id = c.id
       GROUP BY c.id ORDER BY count DESC`,
    )
    .all();

  const byStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM issues GROUP BY status ORDER BY count DESC`,
    )
    .all();

  // Heatmap: aggregate unresolved issues by area (lat/lng centroid).
  const heatmap = db
    .prepare(
      `SELECT area_name, AVG(latitude) AS lat, AVG(longitude) AS lng,
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('resolved','confirmed') THEN 0 ELSE 1 END) AS unresolved
       FROM issues WHERE area_name IS NOT NULL
       GROUP BY area_name ORDER BY unresolved DESC`,
    )
    .all() as Array<{
    area_name: string;
    lat: number;
    lng: number;
    total: number;
    unresolved: number;
  }>;
  const maxUnresolved = Math.max(1, ...heatmap.map((h) => Number(h.unresolved)));
  const heatmapCells = heatmap.map((h) => ({
    // Map short names → full preset labels so the client's map can place the
    // cluster on the matching preset pin and deep-link by full label.
    area: shortToLabel(h.area_name),
    shortArea: h.area_name,
    lat: h.lat,
    lng: h.lng,
    total: h.total,
    unresolved: Number(h.unresolved),
    intensity: Number(h.unresolved) / maxUnresolved,
  }));

  // Every distinct area, as full preset labels for the admin filter.
  const areas = SEED_AREAS.map(shortToLabel);

  // Individual issue points so the client can render precise pins, not just blobs.
  const heatPoints = db
    .prepare(
      `SELECT i.id, i.title, i.latitude AS lat, i.longitude AS lng, i.area_name AS area,
         i.status, i.severity, i.priority_score AS priority,
         CASE WHEN i.status IN ('resolved','confirmed') THEN 0 ELSE 1 END AS unresolved
       FROM issues i
       ORDER BY i.latitude DESC`,
    )
    .all();

  res.json({
    stats: {
      total,
      pending,
      highPriority,
      critical,
      resolved,
      totalUpvotes,
      totalReports,
      avgResolutionHours: avgResolutionHours ? Math.round(avgResolutionHours * 10) / 10 : null,
    },
    byCategory,
    byStatus,
    heatmap: heatmapCells,
    heatPoints,
    areas,
  });
});

/** GET /api/admin/issues — filterable table. */
router.get("/issues", (req, res) => {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (typeof req.query.status === "string" && req.query.status) {
    where.push("i.status = ?");
    params.push(req.query.status);
  }
  if (/^\d+$/.test(String(req.query.category ?? ""))) {
    where.push("i.category_id = ?");
    params.push(Number(req.query.category));
  }
  if (/^\d+$/.test(String(req.query.department ?? ""))) {
    where.push("i.department_id = ?");
    params.push(Number(req.query.department));
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    where.push("(i.title LIKE ? OR i.description LIKE ? OR i.area_name LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  // Area accepts full labels (“Oak St, Riverside”) or short names (“Riverside”)
  // so both the heatmap drill-down and the queue select keep working.
  const areaRaw = typeof req.query.area === "string" ? req.query.area.trim() : "";
  const area =
    areaRaw && AREA_SHORT_BY_LABEL[areaRaw] ? AREA_SHORT_BY_LABEL[areaRaw] : areaRaw;
  if (area) {
    where.push("i.area_name = ?");
    params.push(area);
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = (db
    .prepare(
      `SELECT i.id, i.title, i.status, i.severity, i.priority_score, i.upvote_count, i.report_count,
         i.area_name, i.first_reported_at, c.name AS category_name, c.color AS category_color,
         d.name AS department_name
       FROM issues i
       JOIN issue_categories c ON c.id = i.category_id
       LEFT JOIN departments d ON d.id = i.department_id
       ${whereSql} ORDER BY i.priority_score DESC, i.first_reported_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, (page - 1) * limit) as Array<{ area_name: string | null } & Record<string, unknown>>).map(
    (r) => ({
      ...r,
      // Display the friendlier full label (“Oak St, Riverside”), while the DB
      // stores the short neighborhood name used for filtering.
      area_name: r.area_name ? shortToLabel(r.area_name) : r.area_name,
    }),
  );
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM issues i ${whereSql}`)
      .get(...params) as { n: number }
  ).n;

  res.json({ items: rows, total, page, hasMore: page * limit < total });
});

/** GET /api/admin/issues/:id — everything an authority needs to act. */
router.get("/issues/:id", (req, res) => {
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  const reports = db
    .prepare(
      `SELECT r.id, r.description, r.latitude, r.longitude, r.location_name, r.created_at,
              u.display_name AS reporter_name, u.email AS reporter_email
       FROM issue_reports r JOIN users u ON u.id = r.user_id
       WHERE r.issue_id = ? ORDER BY r.created_at ASC`,
    )
    .all(issue.id);
  const images = db
    .prepare(
      `SELECT img.url, img.thumb_url, img.kind, img.created_at FROM issue_images img
       WHERE img.issue_id = ? ORDER BY img.created_at ASC`,
    )
    .all(issue.id);
  const history = db
    .prepare(
      `SELECT h.from_status, h.to_status, h.note, h.created_at, u.display_name AS changed_by_name
       FROM issue_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.issue_id = ? ORDER BY h.created_at ASC`,
    )
    .all(issue.id);
  const departments = db.prepare("SELECT id, name FROM departments ORDER BY id").all();

  res.json({
    issue: issueToSummary(issue),
    priorityBreakdown: parseBreakdown(issue),
    reports,
    images,
    history,
    departments,
    allowedTransitions: STATUS_ORDER.filter((s) => STATUS_ORDER.indexOf(s) > STATUS_ORDER.indexOf(issue.status)),
  });
});

const assignSchema = z.object({ departmentId: z.number().int().positive() });
const statusSchema = z.object({
  status: z.enum(["reported", "ai_analyzed", "verified", "assigned", "in_progress", "resolved", "confirmed"]),
  note: z.string().trim().max(500).optional(),
});

function canTransition(current: IssueStatus, target: IssueStatus): boolean {
  return STATUS_ORDER.indexOf(target) >= STATUS_ORDER.indexOf(current);
}

/** POST /api/admin/issues/:id/verify */
router.post("/issues/:id/verify", (req: AuthedRequest, res) => {
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  if (STATUS_ORDER.indexOf(issue.status) > STATUS_ORDER.indexOf("ai_analyzed")) {
    res.status(409).json({ error: `Cannot verify an issue that is already ${issue.status}` });
    return;
  }
  transitionStatus(db, issue.id, "verified", req.user!.id, { notifType: "verified" });
  res.json({ ok: true, status: "verified" });
});

/** POST /api/admin/issues/:id/assign { departmentId } */
router.post("/issues/:id/assign", (req: AuthedRequest, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid departmentId is required" });
    return;
  }
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  const dept = db.prepare("SELECT id FROM departments WHERE id = ?").get(parsed.data.departmentId);
  if (!dept) {
    res.status(400).json({ error: "Department not found" });
    return;
  }
  db.prepare("UPDATE issues SET department_id = ?, updated_at = ? WHERE id = ?").run(
    parsed.data.departmentId,
    new Date().toISOString(),
    issue.id,
  );
  transitionStatus(db, issue.id, "assigned", req.user!.id, { notifType: "assigned" });
  res.json({ ok: true, status: "assigned", departmentId: parsed.data.departmentId });
});

/** POST /api/admin/issues/:id/status { status, note? } — generic forward transition. */
router.post("/issues/:id/status", (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  if (!canTransition(issue.status, parsed.data.status)) {
    res.status(409).json({
      error: `Cannot move from ${issue.status} back to ${parsed.data.status}`,
    });
    return;
  }
  const notifType =
    parsed.data.status === "resolved"
      ? "resolved"
      : parsed.data.status === "verified"
        ? "verified"
        : parsed.data.status === "assigned"
          ? "assigned"
          : "status_changed";
  transitionStatus(db, issue.id, parsed.data.status, req.user!.id, {
    note: parsed.data.note,
    notifType,
  });
  if (parsed.data.status === "resolved") {
    db.prepare("UPDATE issues SET resolved_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      issue.id,
    );
  }
  res.json({ ok: true, status: parsed.data.status });
});

/** POST /api/admin/issues/:id/resolve — multipart: note + optional after photo. */
router.post("/issues/:id/resolve", uploadImage.single("afterPhoto"), (req: AuthedRequest, res) => {
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  if (issue.status === "resolved" || issue.status === "confirmed") {
    res.status(409).json({ error: "Issue is already resolved" });
    return;
  }
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 500) : null;
  const afterUrl = req.file ? `/media/uploads/${req.file.filename}` : null;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO resolutions (id, issue_id, resolved_by, note, after_photo_url, resolved_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(crypto.randomUUID(), issue.id, req.user!.id, note, afterUrl, now);

  if (afterUrl) {
    db.prepare(
      `INSERT INTO issue_images (id, issue_id, report_id, uploader_id, url, thumb_url, kind, created_at)
       VALUES (?,?,NULL,?,?,?,'after_fix',?)`,
    ).run(crypto.randomUUID(), issue.id, req.user!.id, afterUrl, afterUrl, now);
    invalidatePhotoCache(issue.id);
  }

  db.prepare("UPDATE issues SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?").run(
    now,
    now,
    issue.id,
  );
  db.prepare(
    "INSERT INTO issue_status_history (id, issue_id, from_status, to_status, changed_by, note, created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(crypto.randomUUID(), issue.id, issue.status, "resolved", req.user!.id, note, now);

  createNotification(db, {
    userIds: reporterIds(db, issue.id),
    type: "resolved",
    issueId: issue.id,
    body: `“${issue.title}” was marked resolved by the city. Take a look and confirm the fix so it shows as done.`,
    exceptUserId: req.user!.id,
  });

  res.json({ ok: true, status: "resolved" });
});

/** GET /api/admin/analytics — trends and insights phrased for municipal decisions. */
router.get("/analytics", (_req: AuthedRequest, res) => {
  const db = getDb();

  const monthStart = (monthsAgo: number): string => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - monthsAgo);
    return d.toISOString();
  };

  const categoryTrend = db
    .prepare(
      `SELECT c.name, c.color,
         SUM(CASE WHEN i.created_at >= ? THEN 1 ELSE 0 END) AS this_period,
         SUM(CASE WHEN i.created_at >= ? AND i.created_at < ? THEN 1 ELSE 0 END) AS prev_period
       FROM issue_categories c LEFT JOIN issues i ON i.category_id = c.id
       GROUP BY c.id ORDER BY this_period DESC`,
    )
    .all(monthStart(1), monthStart(2), monthStart(1));

  const byMonth = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
       FROM issues WHERE created_at >= ? GROUP BY month ORDER BY month ASC`,
    )
    .all(monthStart(6));

  const topUnresolvedAreas = db
    .prepare(
      `SELECT area_name AS area, COUNT(*) AS unresolved
       FROM issues
       WHERE status NOT IN ('resolved','confirmed') AND area_name IS NOT NULL
       GROUP BY area_name ORDER BY unresolved DESC LIMIT 5`,
    )
    .all();

  // Insights phrased for decision-making.
  const insights: string[] = [];
  for (const row of categoryTrend as Array<{
    name: string;
    color: string;
    this_period: number;
    prev_period: number;
  }>) {
    const prev = Number(row.prev_period);
    const curr = Number(row.this_period);
    if (prev > 0 && curr > prev) {
      const pct = Math.round(((curr - prev) / prev) * 100);
      insights.push(`${row.name} reports increased ${pct}% this month (${curr} vs ${prev}).`);
    } else if (prev === 0 && curr > 0) {
      insights.push(`${row.name} reports are new this month (${curr} reports).`);
    }
  }
  for (const area of topUnresolvedAreas as Array<{ area: string; unresolved: number }>) {
    insights.push(
      `${area} has the most unresolved reports (${area.unresolved}). Consider dispatching a field check.`,
    );
  }

  res.json({ categoryTrend, byMonth, topUnresolvedAreas, insights });
});

export default router;