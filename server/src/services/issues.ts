import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "../db.js";
import type {
  AiClassification,
  IssueStatus,
  IssueSummary,
  PriorityTier,
} from "../types.js";
import { computePriority, tierForScore } from "./priority.js";
import { createNotification, reporterIds } from "./notifications.js";

export interface IssueRow {
  id: string;
  category_id: number;
  category_name: string;
  category_color: string;
  category_icon: string;
  department_id: number | null;
  department_name: string | null;
  status: IssueStatus;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  area_name: string | null;
  severity: string;
  priority_score: number;
  priority_breakdown: string | null;
  report_count: number;
  upvote_count: number;
  comment_count: number;
  ai_result: string | null;
  first_reported_at: string;
  last_reported_at: string;
  resolved_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ISSUE_SELECT = `
  SELECT i.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
         d.name AS department_name
  FROM issues i
  JOIN issue_categories c ON c.id = i.category_id
  LEFT JOIN departments d ON d.id = i.department_id
`;

export function parseAiResult(row: { ai_result: string | null }): AiClassification | null {
  if (!row.ai_result) return null;
  try {
    return JSON.parse(row.ai_result) as AiClassification;
  } catch {
    return null;
  }
}

export function parseBreakdown(
  row: { priority_breakdown: string | null },
): ReturnType<typeof computePriority> | null {
  if (!row.priority_breakdown) return null;
  try {
    return JSON.parse(row.priority_breakdown);
  } catch {
    return null;
  }
}

const photoCache = new Map<string, { url: string; thumb_url: string } | null>();

function primaryPhoto(issueId: string): { url: string; thumb_url: string } | null {
  if (photoCache.has(issueId)) return photoCache.get(issueId) ?? null;
  const row = getDb()
    .prepare(
      `SELECT url, thumb_url FROM issue_images
       WHERE issue_id = ? AND kind = 'report'
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get(issueId) as { url: string; thumb_url: string } | undefined;
  photoCache.set(issueId, row ?? null);
  return row ?? null;
}

export function invalidatePhotoCache(issueId: string): void {
  photoCache.delete(issueId);
}

function distanceMeters(row: IssueRow, lat: number, lng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(row.latitude - lat);
  const dLng = toRad(row.longitude - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(row.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)));
}

export function issueToSummary(
  row: IssueRow,
  opts: { userId?: string; latitude?: number; longitude?: number } = {},
): IssueSummary {
  const ai = parseAiResult(row);
  const breakdown = parseBreakdown(row);
  const photo = primaryPhoto(row.id);
  const hasUpvoted = opts.userId
    ? !!getDb().prepare("SELECT 1 FROM upvotes WHERE issue_id = ? AND user_id = ?").get(row.id, opts.userId)
    : false;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryColor: row.category_color,
    categoryIcon: row.category_icon,
    status: row.status,
    severity: row.severity as IssueSummary["severity"],
    priorityScore: row.priority_score,
    priorityTier: (breakdown?.tier ?? tierForScore(row.priority_score)) as PriorityTier,
    upvoteCount: row.upvote_count,
    reportCount: row.report_count,
    commentCount: row.comment_count,
    photoUrl: photo?.url ?? null,
    thumbUrl: photo?.thumb_url ?? null,
    areaName: row.area_name ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    distanceM:
      opts.latitude != null && opts.longitude != null
        ? distanceMeters(row, opts.latitude, opts.longitude)
        : null,
    createdAt: row.created_at,
    firstReportedAt: row.first_reported_at,
    lastReportedAt: row.last_reported_at,
    userUpvoted: hasUpvoted,
    duplicateNote:
      row.report_count > 1
        ? `${row.report_count - 1} other ${row.report_count - 1 === 1 ? "person" : "people"} reported this too`
        : null,
    aiResult: ai,
  };
}

export function getIssueRow(db: Database.Database, id: string): IssueRow | null {
  return (db.prepare(`${ISSUE_SELECT} WHERE i.id = ?`).get(id) as IssueRow | undefined) ?? null;
}

/** Recompute denormalized counts and priority for an issue after any change. */
export function recomputeIssue(
  db: Database.Database,
  issueId: string,
): {
  upvoteCount: number;
  reportCount: number;
  commentCount: number;
  priority: ReturnType<typeof computePriority>;
} {
  const issue = getIssueRow(db, issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);

  const upvoteCount = (
    db.prepare("SELECT COUNT(*) AS n FROM upvotes WHERE issue_id = ?").get(issueId) as { n: number }
  ).n;
  const reportCount = (
    db
      .prepare("SELECT COUNT(DISTINCT user_id) AS n FROM issue_reports WHERE issue_id = ?")
      .get(issueId) as { n: number }
  ).n;
  const commentCount = (
    db.prepare("SELECT COUNT(*) AS n FROM comments WHERE issue_id = ?").get(issueId) as { n: number }
  ).n;

  const lastReport = (
    db
      .prepare("SELECT MAX(created_at) AS m FROM issue_reports WHERE issue_id = ?")
      .get(issueId) as { m: string | null }
  ).m;
  const lastUpvote = (
    db.prepare("SELECT MAX(created_at) AS m FROM upvotes WHERE issue_id = ?").get(issueId) as {
      m: string | null;
    }
  ).m;
  const lastActivityAt = [lastReport, lastUpvote, issue.updated_at]
    .filter((v): v is string => !!v)
    .sort()
    .reverse()[0]!;

  const ai = parseAiResult(issue);
  const priority = computePriority({
    severity: issue.severity as IssueSummary["severity"],
    upvoteCount,
    reportCount,
    safetyRisk: ai?.safetyRisk ?? 0,
    locationImportance: ai?.locationImportance ?? 3,
    lastActivityAt,
  });

  db.prepare(
    `UPDATE issues SET upvote_count = ?, report_count = ?, comment_count = ?,
       priority_score = ?, priority_breakdown = ?, updated_at = ? WHERE id = ?`,
  ).run(
    upvoteCount,
    reportCount,
    commentCount,
    priority.total,
    JSON.stringify(priority),
    new Date().toISOString(),
    issueId,
  );

  return { upvoteCount, reportCount, commentCount, priority };
}

export const STATUS_ORDER: IssueStatus[] = [
  "reported",
  "ai_analyzed",
  "verified",
  "assigned",
  "in_progress",
  "resolved",
  "confirmed",
];

export const STATUS_LABELS: Record<IssueStatus, string> = {
  reported: "reported",
  ai_analyzed: "analyzed by AI",
  verified: "verified",
  assigned: "assigned",
  in_progress: "marked in progress",
  resolved: "marked resolved",
  confirmed: "confirmed fixed",
};

export function addStatusHistory(
  db: Database.Database,
  issueId: string,
  from: IssueStatus | null,
  to: IssueStatus,
  changedBy: string,
  note?: string,
): void {
  db.prepare(
    "INSERT INTO issue_status_history (id, issue_id, from_status, to_status, changed_by, note, created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(crypto.randomUUID(), issueId, from, to, changedBy, note ?? null, new Date().toISOString());
}

/** Update issue status + history + notify reporters. Returns the new status. */
export function transitionStatus(
  db: Database.Database,
  issueId: string,
  to: IssueStatus,
  actorId: string,
  opts: { note?: string; notifType?: "status_changed" | "verified" | "assigned" | "resolved"; notify?: boolean } = {},
): IssueStatus {
  const issue = getIssueRow(db, issueId);
  if (!issue) throw new Error("Issue not found");
  const from = issue.status;

  addStatusHistory(db, issueId, from, to, actorId, opts.note);
  db.prepare("UPDATE issues SET status = ?, updated_at = ? WHERE id = ?").run(
    to,
    new Date().toISOString(),
    issueId,
  );

  if (opts.notify !== false) {
    const reporters = reporterIds(db, issueId);
    createNotification(db, {
      userIds: reporters,
      type: opts.notifType ?? "status_changed",
      issueId,
      body: `“${issue.title}” was ${STATUS_LABELS[to]} by the city.`,
      exceptUserId: actorId,
    });
  }
  return to;
}