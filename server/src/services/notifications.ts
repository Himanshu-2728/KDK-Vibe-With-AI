import crypto from "node:crypto";
import type Database from "better-sqlite3";

export type NotificationType =
  | "report_submitted"
  | "ai_analyzed"
  | "merged"
  | "verified"
  | "assigned"
  | "status_changed"
  | "resolved"
  | "resolution_confirmed"
  | "resolution_rejected"
  | "priority_tier_up"
  | "new_comment"
  | "new_reporter";

export function createNotification(
  db: Database.Database,
  params: {
    userIds: string[];
    type: NotificationType;
    issueId: string | null;
    body: string;
    exceptUserId?: string;
  },
): void {
  const stmt = db.prepare(
    "INSERT INTO notifications (id, user_id, type, issue_id, body, read, created_at) VALUES (?,?,?,?,?,0,?)",
  );
  const now = new Date().toISOString();
  for (const userId of new Set(params.userIds)) {
    if (userId === params.exceptUserId) continue;
    stmt.run(crypto.randomUUID(), userId, params.type, params.issueId, params.body, now);
  }
}

/** Distinct user ids who reported (contributed a report to) an issue. */
export function reporterIds(db: Database.Database, issueId: string): string[] {
  const rows = db
    .prepare("SELECT DISTINCT user_id FROM issue_reports WHERE issue_id = ?")
    .all(issueId) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}