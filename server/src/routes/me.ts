import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { ISSUE_SELECT, issueToSummary, type IssueRow } from "../services/issues.js";

const router = Router();

router.use(requireAuth);

/** GET /api/me/profile — user + impact score. */
router.get("/profile", (req: AuthedRequest, res) => {
  const db = getDb();
  const userId = req.user!.id;

  const reportedIssues = db
    .prepare(
      `${ISSUE_SELECT} JOIN issue_reports r ON r.issue_id = i.id AND r.user_id = ? GROUP BY i.id`,
    )
    .all(userId) as IssueRow[];

  // Impact = weighted by the community attention your reports drew, plus credit
  // for issues that got confirmed fixed.
  let impact = 0;
  let confirmedCount = 0;
  for (const issue of reportedIssues) {
    impact += Math.round(Math.sqrt(issue.upvote_count) * 10);
    if (issue.status === "confirmed") {
      impact += 50;
      confirmedCount++;
    }
  }

  const reportCount = reportedIssues.length;
  const upvoteCount = (
    db.prepare("SELECT COUNT(*) AS n FROM upvotes WHERE user_id = ?").get(userId) as { n: number }
  ).n;

  // Civic streak: distinct weeks with activity in the last 12 weeks.
  const activityRows = db
    .prepare(
      `SELECT created_at FROM issue_reports WHERE user_id = ?
       UNION ALL SELECT created_at FROM upvotes WHERE user_id = ?
       UNION ALL SELECT created_at FROM comments WHERE user_id = ?`,
    )
    .all(userId, userId, userId) as Array<{ created_at: string }>;
  const weeks = new Set<number>();
  const cutoff = Date.now() - 12 * 7 * 86400000;
  for (const row of activityRows) {
    const t = new Date(row.created_at).getTime();
    if (t >= cutoff) weeks.add(Math.floor(t / (7 * 86400000)));
  }

  res.json({
    user: req.user,
    impact,
    impactBreakdown: {
      reportedIssues: reportCount,
      communityAttention: impact - confirmedCount * 50,
      confirmedFixedBonus: confirmedCount * 50,
    },
    stats: {
      reportCount,
      upvoteCount,
      confirmedCount,
      civicStreakWeeks: weeks.size,
    },
  });
});

/** GET /api/me/reports — issues the user reported (including merged ones). */
router.get("/reports", (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `${ISSUE_SELECT} JOIN issue_reports r ON r.issue_id = i.id AND r.user_id = ?
       GROUP BY i.id ORDER BY i.first_reported_at DESC`,
    )
    .all(req.user!.id) as IssueRow[];
  res.json({ items: rows.map((row) => issueToSummary(row, { userId: req.user!.id })) });
});

/** GET /api/me/upvotes — issues the user upvoted. */
router.get("/upvotes", (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `${ISSUE_SELECT} JOIN upvotes u ON u.issue_id = i.id AND u.user_id = ?
       ORDER BY u.created_at DESC`,
    )
    .all(req.user!.id) as IssueRow[];
  res.json({ items: rows.map((row) => issueToSummary(row, { userId: req.user!.id })) });
});

export default router;