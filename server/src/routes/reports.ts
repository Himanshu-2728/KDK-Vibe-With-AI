import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { uploadImage } from "../middleware/upload.js";
import { aiService } from "../services/ai.js";
import { findDuplicateCandidates, type NearbyIssueRow } from "../services/duplicates.js";
import {
  addStatusHistory,
  getIssueRow,
  invalidatePhotoCache,
  issueToSummary,
  recomputeIssue,
} from "../services/issues.js";
import { createNotification, reporterIds } from "../services/notifications.js";
import { computePriority } from "../services/priority.js";
import type { AiClassification, CategoryName, Severity } from "../types.js";

const router = Router();

const reportRateLimit = createRateLimiter(config.reportRateLimit);

interface ReportRow {
  id: string;
  issue_id: string | null;
  user_id: string;
  description: string | null;
  latitude: number;
  longitude: number;
  location_name: string | null;
  ai_result: string | null;
  created_at: string;
}

function getCategoryByName(
  db: ReturnType<typeof getDb>,
  name: string,
): { id: number; name: string; department_id: number } | null {
  return (
    (db.prepare("SELECT id, name, department_id FROM issue_categories WHERE name = ?").get(name) as
      | { id: number; name: string; department_id: number }
      | undefined) ?? null
  );
}

/**
 * POST /api/reports (multipart: photo, description, lat, lng, locationName)
 *
 * Creates the raw report, runs the AI pass, and checks for nearby duplicates —
 * all before the user decides. The master issue is only created on finalize,
 * so a duplicate never splits upvotes.
 */
router.post(
  "/",
  requireAuth,
  reportRateLimit,
  uploadImage.single("photo"),
  async (req: AuthedRequest, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "A photo is required" });
        return;
      }

      const lat = Number(req.body.lat);
      const lng = Number(req.body.lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        res.status(400).json({ error: "A valid latitude is required" });
        return;
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ error: "A valid longitude is required" });
        return;
      }
      const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
      if (description.length > 1000) {
        res.status(400).json({ error: "Description must be 1000 characters or fewer" });
        return;
      }
      const locationName =
        typeof req.body.locationName === "string" ? req.body.locationName.trim().slice(0, 120) : null;

      const db = getDb();
      const reportId = crypto.randomUUID();
      const now = new Date().toISOString();

      // AI pass first (rule-based mock behind the same interface a real model
      // would use), so its result is stored with the report.
      const ai = await aiService.classify({ description, imagePath: file.path });

      db.prepare(
        `INSERT INTO issue_reports (id, issue_id, user_id, description, latitude, longitude, location_name, ai_result, created_at)
         VALUES (?,NULL,?,?,?,?,?,?,?)`,
      ).run(reportId, req.user!.id, description, lat, lng, locationName, JSON.stringify(ai), now);

      const url = `/media/uploads/${file.filename}`;
      db.prepare(
        `INSERT INTO issue_images (id, issue_id, report_id, uploader_id, url, thumb_url, kind, created_at)
         VALUES (?,NULL,?,?,?,?,'report',?)`,
      ).run(crypto.randomUUID(), reportId, req.user!.id, url, url, now);

      // Duplicate pass: geographic proximity first, text similarity second.
      const category = getCategoryByName(db, ai.category);
      const candidates = category
        ? findDuplicateCandidates(
            {
              latitude: lat,
              longitude: lng,
              categoryId: category.id,
              description,
              radiusM: config.duplicateRadiusMeters,
            },
            db.prepare("SELECT * FROM issues").all() as unknown as NearbyIssueRow[],
          )
        : [];

      const best = candidates[0] ?? null;
      const duplicate = best
        ? (() => {
            const issue = getIssueRow(db, best.issueId);
            return issue
              ? {
                  issueId: issue.id,
                  title: issue.title,
                  distanceM: best.distanceM,
                  textSimilarity: best.textSimilarity,
                  upvoteCount: issue.upvote_count,
                  reportCount: issue.report_count,
                  status: issue.status,
                }
              : null;
          })()
        : null;

      res.status(201).json({ reportId, ai, duplicate });
    } catch (err) {
      next(err);
    }
  },
);

const finalizeSchema = z
  .object({
    decision: z.enum(["create", "merge"]),
    issueId: z.string().optional(),
    categoryId: z.number().int().optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    type: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => (v.decision === "merge" ? !!v.issueId : true), {
    message: "issueId is required when merging",
  });

/**
 * POST /api/reports/:id/finalize
 * decision: "create" — the user confirmed the AI guess (or corrected it);
 *           a new master issue is created.
 * decision: "merge"  — the user chose to add their report (and upvote) to an
 *           existing nearby issue instead.
 */
router.post("/:id/finalize", requireAuth, (req: AuthedRequest, res) => {
  const parsed = finalizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const db = getDb();
  const report = db
    .prepare("SELECT * FROM issue_reports WHERE id = ?")
    .get(req.params.id) as ReportRow | undefined;
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  if (report.user_id !== req.user!.id) {
    res.status(403).json({ error: "You can only finalize your own reports" });
    return;
  }
  if (report.issue_id) {
    res.status(409).json({ error: "This report was already finalized" });
    return;
  }

  const body = parsed.data;

  // --- MERGE into an existing issue (user chose "add your upvote instead") ---
  if (body.decision === "merge") {
    const issue = getIssueRow(db, body.issueId!);
    if (!issue) {
      res.status(404).json({ error: "Target issue not found" });
      return;
    }
    db.prepare("UPDATE issue_reports SET issue_id = ? WHERE id = ?").run(issue.id, report.id);
    db.prepare("UPDATE issue_images SET issue_id = ? WHERE report_id = ?").run(issue.id, report.id);
    invalidatePhotoCache(issue.id);
    // Merging implies "add your upvote instead".
    db.prepare(
      "INSERT OR IGNORE INTO upvotes (id, user_id, issue_id, created_at) VALUES (?,?,?,?)",
    ).run(crypto.randomUUID(), req.user!.id, issue.id, new Date().toISOString());

    const result = recomputeIssue(db, issue.id);

    createNotification(db, {
      userIds: reporterIds(db, issue.id),
      type: "merged",
      issueId: issue.id,
      body: `“${issue.title}” — another person reported this too (now ${result.reportCount} people).`,
      exceptUserId: req.user!.id,
    });
    createNotification(db, {
      userIds: [req.user!.id],
      type: "merged",
      issueId: issue.id,
      body: `Your report was added to “${issue.title}” — your upvote now counts toward it.`,
    });

    const fresh = getIssueRow(db, issue.id)!;
    res.json({
      merged: true,
      issueId: issue.id,
      reportCount: result.reportCount,
      upvoteCount: result.upvoteCount,
      priorityTier: result.priority.tier,
      issue: issueToSummary(fresh, { userId: req.user!.id }),
    });
    return;
  }

  // --- CREATE a new master issue (user confirmed/corrected the AI guess) ---
  const storedAi = report.ai_result ? (JSON.parse(report.ai_result) as AiClassification) : null;

  const categoryRow = body.categoryId
    ? (db
        .prepare("SELECT id, name, department_id FROM issue_categories WHERE id = ?")
        .get(body.categoryId) as { id: number; name: string; department_id: number } | undefined)
    : null;
  const category =
    categoryRow ?? (storedAi ? getCategoryByName(db, storedAi.category) : null) ?? getCategoryByName(db, "Infrastructure")!;
  const severity: Severity = body.severity ?? storedAi?.severity ?? "medium";
  const type = body.type ?? storedAi?.type ?? "Civic Issue";

  const safetyRisk = storedAi?.safetyRisk ?? 0;
  const locationImportance = storedAi?.locationImportance ?? 3;
  const title = `${type}${report.location_name ? ` in ${report.location_name}` : ""}`.slice(0, 120);

  const breakdown = computePriority({
    severity,
    upvoteCount: 0,
    reportCount: 1,
    safetyRisk,
    locationImportance,
    lastActivityAt: report.created_at,
  });

  const issueId = crypto.randomUUID();
  const aiResult: AiClassification = {
    type,
    category: category.name as CategoryName,
    confidence: storedAi?.confidence ?? 0.8,
    severity,
    explanation:
      storedAi?.explanation ??
      `Confirmed as “${type}” (${severity} severity). This AI suggestion was reviewed and confirmed by the reporter.`,
    safetyRisk,
    locationImportance,
    signals: storedAi?.signals,
    imageAnalyzed: storedAi?.imageAnalyzed,
  };

  db.prepare(
    `INSERT INTO issues (id, category_id, department_id, status, title, description, latitude, longitude, area_name,
      severity, priority_score, priority_breakdown, report_count, upvote_count, comment_count, ai_result,
      first_reported_at, last_reported_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,0,?,?,?,?,?)`,
  ).run(
    issueId,
    category.id,
    category.department_id,
    "ai_analyzed",
    title,
    report.description,
    report.latitude,
    report.longitude,
    report.location_name,
    severity,
    breakdown.total,
    JSON.stringify(breakdown),
    JSON.stringify(aiResult),
    report.created_at,
    report.created_at,
    report.created_at,
    new Date().toISOString(),
  );

  db.prepare("UPDATE issue_reports SET issue_id = ? WHERE id = ?").run(issueId, report.id);
  db.prepare("UPDATE issue_images SET issue_id = ? WHERE report_id = ?").run(issueId, report.id);
  addStatusHistory(db, issueId, "reported", "ai_analyzed", req.user!.id, "AI analysis complete");

  createNotification(db, {
    userIds: [req.user!.id],
    type: "ai_analyzed",
    issueId,
    body: `Your report “${title}” was analyzed — detected as “${type}” with ${Math.round(aiResult.confidence * 100)}% confidence.`,
  });

  invalidatePhotoCache(issueId);
  const fresh = getIssueRow(db, issueId)!;
  res.status(201).json({
    merged: false,
    issueId,
    issue: issueToSummary(fresh, { userId: req.user!.id }),
  });
});

export default router;