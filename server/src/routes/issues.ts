import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db.js";
import { requireAuth, optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { haversineMeters } from "../services/geo.js";
import {
  addStatusHistory,
  getIssueRow,
  issueToSummary,
  parseAiResult,
  parseBreakdown,
  recomputeIssue,
  type IssueRow,
} from "../services/issues.js";
import { ISSUE_SELECT } from "../services/issues.js";
import { createNotification, reporterIds } from "../services/notifications.js";
import type { PriorityTier } from "../types.js";

const router = Router();

const TIER_RANK: Record<PriorityTier, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function tierRank(tier: PriorityTier): number {
  return TIER_RANK[tier];
}

/** GET /api/issues/nearby?lat=&lng=&radius= — used by the report flow + nearest sort. */
router.get("/nearby", optionalAuth, (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(5000, Math.max(1, Number(req.query.radius) || 200));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }
  const db = getDb();
  const rows = db.prepare(ISSUE_SELECT).all() as IssueRow[];
  const matches = rows
    .map((row) => ({ row, distanceM: haversineMeters(lat, lng, row.latitude, row.longitude) }))
    .filter((m) => m.distanceM <= radius)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 20)
    .map(({ row, distanceM }) => ({
      issueId: row.id,
      title: row.title,
      distanceM: Math.round(distanceM),
      upvoteCount: row.upvote_count,
      reportCount: row.report_count,
      status: row.status,
      categoryName: row.category_name,
    }));
  res.json({ items: matches });
});

/** GET /api/issues/:id — full detail: photos, priority breakdown, timeline, comments, resolution. */
router.get("/:id", optionalAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }

  const images = db
    .prepare(
      `SELECT img.id, img.url, img.thumb_url AS thumbUrl, img.kind, img.created_at AS createdAt,
              u.display_name AS uploadedBy
       FROM issue_images img JOIN users u ON u.id = img.uploader_id
       WHERE img.issue_id = ? ORDER BY img.created_at ASC`,
    )
    .all(issue.id);

  const history = db
    .prepare(
      `SELECT h.id, h.from_status AS fromStatus, h.to_status AS toStatus, h.note,
              h.created_at AS createdAt, u.display_name AS changedByName
       FROM issue_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.issue_id = ? ORDER BY h.created_at ASC`,
    )
    .all(issue.id);

  const comments = db
    .prepare(
      `SELECT c.id, c.body, c.upvote_count AS upvoteCount, c.created_at AS createdAt,
              u.display_name AS authorName, u.id AS authorId
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.issue_id = ? ORDER BY c.created_at ASC`,
    )
    .all(issue.id);

  const resolutionRow = db
    .prepare(
      `SELECT r.*, u.display_name AS resolvedByName, cu.display_name AS confirmedByName
       FROM resolutions r
       LEFT JOIN users u ON u.id = r.resolved_by
       LEFT JOIN users cu ON cu.id = r.confirmed_by
       WHERE r.issue_id = ? ORDER BY r.resolved_at DESC LIMIT 1`,
    )
    .get(issue.id) as
    | {
        id: string;
        note: string | null;
        after_photo_url: string | null;
        resolved_at: string;
        resolved_by: string;
        resolvedByName: string | null;
        confirmed: number;
        confirmed_by: string | null;
        confirmedByName: string | null;
        confirmed_at: string | null;
        rejected: number;
        rejection_reason: string | null;
      }
    | undefined;
  const resolution = resolutionRow
    ? {
        id: resolutionRow.id,
        note: resolutionRow.note,
        afterPhotoUrl: resolutionRow.after_photo_url,
        resolvedAt: resolutionRow.resolved_at,
        resolvedBy: resolutionRow.resolved_by,
        resolvedByName: resolutionRow.resolvedByName,
        confirmed: resolutionRow.confirmed,
        confirmedBy: resolutionRow.confirmed_by,
        confirmedByName: resolutionRow.confirmedByName,
        confirmedAt: resolutionRow.confirmed_at,
        rejected: resolutionRow.rejected,
        rejectionReason: resolutionRow.rejection_reason,
      }
    : null;

  const reports = db
    .prepare(
      `SELECT r.id, r.description, r.latitude, r.longitude, r.location_name AS locationName,
              r.created_at AS createdAt, u.display_name AS reporterName, u.id AS reporterId
       FROM issue_reports r JOIN users u ON u.id = r.user_id
       WHERE r.issue_id = ? ORDER BY r.created_at ASC`,
    )
    .all(issue.id);

  const userId = req.user?.id;
  const isReporter = userId
    ? !!db
        .prepare("SELECT 1 FROM issue_reports WHERE issue_id = ? AND user_id = ?")
        .get(issue.id, userId)
    : false;

  res.json({
    // No self-distance: the detail header shows the area, not “0 m away”.
    issue: issueToSummary(issue, { userId }),
    images,
    history,
    comments,
    resolution: resolution ?? null,
    reports,
    priorityBreakdown: parseBreakdown(issue),
    aiResult: parseAiResult(issue),
    department: issue.department_name,
    isReporter,
  });
});

const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });

/** POST /api/issues/:id/comments */
router.post("/:id/comments", requireAuth, (req: AuthedRequest, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Comment must be between 1 and 1000 characters" });
    return;
  }
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  const commentId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO comments (id, issue_id, user_id, body, created_at) VALUES (?,?,?,?,?)",
  ).run(commentId, issue.id, req.user!.id, parsed.data.body, new Date().toISOString());
  recomputeIssue(db, issue.id);

  createNotification(db, {
    userIds: reporterIds(db, issue.id),
    type: "new_comment",
    issueId: issue.id,
    body: `New comment on “${issue.title}”: “${parsed.data.body.slice(0, 80)}${parsed.data.body.length > 80 ? "…" : ""}”`,
    exceptUserId: req.user!.id,
  });

  res.status(201).json({
    comment: {
      id: commentId,
      body: parsed.data.body,
      upvoteCount: 0,
      createdAt: new Date().toISOString(),
      authorName: req.user!.displayName,
      authorId: req.user!.id,
    },
  });
});

/** POST /api/issues/:id/upvote — idempotent per user, guarded by UNIQUE(user_id, issue_id). */
router.post("/:id/upvote", requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }

  const before = parseBreakdown(issue)?.tier ?? recomputeIssue(db, issue.id).priority.tier;

  db.prepare(
    "INSERT OR IGNORE INTO upvotes (id, user_id, issue_id, created_at) VALUES (?,?,?,?)",
  ).run(crypto.randomUUID(), req.user!.id, issue.id, new Date().toISOString());

  const result = recomputeIssue(db, issue.id);
  const { priority, upvoteCount } = result;

  // Notify reporters when an upvote pushes the issue into a new priority tier.
  if (tierRank(priority.tier) > tierRank(before)) {
    createNotification(db, {
      userIds: reporterIds(db, issue.id),
      type: "priority_tier_up",
      issueId: issue.id,
      body: `“${issue.title}” reached ${priority.tier.toUpperCase()} priority thanks to community upvotes.`,
      exceptUserId: req.user!.id,
    });
  }

  res.json({
    issueId: issue.id,
    upvoteCount,
    userUpvoted: true,
    priorityScore: priority.total,
    priorityTier: priority.tier,
  });
});

/** DELETE /api/issues/:id/upvote */
router.delete("/:id/upvote", requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  db.prepare("DELETE FROM upvotes WHERE issue_id = ? AND user_id = ?").run(
    issue.id,
    req.user!.id,
  );
  const { upvoteCount, priority } = recomputeIssue(db, issue.id);
  res.json({
    issueId: issue.id,
    upvoteCount,
    userUpvoted: false,
    priorityScore: priority.total,
    priorityTier: priority.tier,
  });
});

const confirmSchema = z.object({
  confirm: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/** POST /api/issues/:id/confirm-resolution — reporters/community verify a fix is real. */
router.post("/:id/confirm-resolution", requireAuth, (req: AuthedRequest, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "confirm (true/false) is required" });
    return;
  }
  const db = getDb();
  const issue = getIssueRow(db, req.params.id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  if (issue.status !== "resolved") {
    res.status(409).json({ error: "Only resolved issues can be confirmed" });
    return;
  }
  const isReporter = !!db
    .prepare("SELECT 1 FROM issue_reports WHERE issue_id = ? AND user_id = ?")
    .get(issue.id, req.user!.id);
  if (!isReporter) {
    res.status(403).json({ error: "Only people who reported this issue can confirm the fix" });
    return;
  }
  const resolution = db
    .prepare("SELECT * FROM resolutions WHERE issue_id = ? ORDER BY resolved_at DESC LIMIT 1")
    .get(issue.id) as { id: string } | undefined;
  if (!resolution) {
    res.status(409).json({ error: "No resolution recorded for this issue" });
    return;
  }
  const now = new Date().toISOString();

  if (parsed.data.confirm) {
    db.prepare(
      "UPDATE resolutions SET confirmed = 1, confirmed_by = ?, confirmed_at = ? WHERE id = ?",
    ).run(req.user!.id, now, resolution.id);
    db.prepare("UPDATE issues SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(
      now,
      issue.id,
    );
    addStatusHistory(db, issue.id, "resolved", "confirmed", req.user!.id, "Confirmed fixed by reporter");
    createNotification(db, {
      userIds: reporterIds(db, issue.id),
      type: "resolution_confirmed",
      issueId: issue.id,
      body: `“${issue.title}” was confirmed fixed by a reporter.`,
      exceptUserId: req.user!.id,
    });
    res.json({ confirmed: true, status: "confirmed" });
    return;
  }

  db.prepare(
    "UPDATE resolutions SET rejected = 1, rejection_reason = ? WHERE id = ?",
  ).run(parsed.data.reason ?? "Not actually fixed", resolution.id);
  createNotification(db, {
    userIds: reporterIds(db, issue.id),
    type: "resolution_rejected",
    issueId: issue.id,
    body: `A reporter says “${issue.title}” is NOT actually fixed${parsed.data.reason ? `: “${parsed.data.reason}”` : "."}`,
    exceptUserId: req.user!.id,
  });
  res.json({ confirmed: false, status: "resolved", rejectionReason: parsed.data.reason ?? null });
});

export default router;