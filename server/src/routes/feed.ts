import { Router } from "express";
import { getDb } from "../db.js";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { haversineMeters } from "../services/geo.js";
import { ISSUE_SELECT, issueToSummary, type IssueRow } from "../services/issues.js";
import { TIER_THRESHOLDS } from "../services/priority.js";

const router = Router();

type Sort = "trending" | "top" | "recent" | "nearby";

function parseBool(v: string | undefined): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function parseFloatOr(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/feed?sort=trending|top|recent|nearby&category=&status=&criticalOnly=&lat=&lng=&page=&limit=
 *
 * Trending is computed on-read: upvotes in the last 24h weighted heavily, plus
 * all-time upvotes as a tiebreaker, then priority. At demo scale this is cheap;
 * the same formula can move behind a scheduled job later without changing the API.
 */
router.get("/", optionalAuth, (req: AuthedRequest, res) => {
  const q = req.query;
  const sort: Sort = (["trending", "top", "recent", "nearby"] as const).includes(
    q.sort as Sort,
  )
    ? (q.sort as Sort)
    : "trending";
  const category = typeof q.category === "string" ? q.category : undefined;
  const status = typeof q.status === "string" ? q.status : undefined;
  const criticalOnly = parseBool(typeof q.criticalOnly === "string" ? q.criticalOnly : undefined);
  const lat = parseFloatOr(typeof q.lat === "string" ? q.lat : undefined);
  const lng = parseFloatOr(typeof q.lng === "string" ? q.lng : undefined);
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));

  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (category) {
    if (/^\d+$/.test(category)) {
      where.push("i.category_id = ?");
      params.push(Number(category));
    } else {
      where.push("c.name = ?");
      params.push(category);
    }
  }
  if (status) {
    where.push("i.status = ?");
    params.push(status);
  }
  if (criticalOnly) {
    where.push("i.priority_score >= ?");
    params.push(TIER_THRESHOLDS.high);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  if (sort === "nearby") {
    if (lat == null || lng == null) {
      res.status(400).json({ error: "lat and lng are required for the nearby sort" });
      return;
    }
    const rows = db.prepare(ISSUE_SELECT).all() as IssueRow[];
    const withDistance = rows
      .map((row) => ({
        row,
        distanceM: haversineMeters(lat, lng, row.latitude, row.longitude),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);
    const items = withDistance
      .slice((page - 1) * limit, page * limit)
      .map(({ row, distanceM }) =>
        issueToSummary(row, { userId: req.user?.id, latitude: lat, longitude: lng }),
      );
    res.json({
      items,
      page,
      hasMore: page * limit < withDistance.length,
      total: withDistance.length,
    });
    return;
  }

  // Trending: velocity CTE — upvotes in the last 24h. The join must come BEFORE
  // any WHERE clause (ISSUE_SELECT carries the FROM + base joins).
  const velocityJoin =
    sort === "trending"
      ? `LEFT JOIN (SELECT issue_id, COUNT(*) AS c FROM upvotes WHERE created_at >= ? GROUP BY issue_id) v ON v.issue_id = i.id`
      : "";
  const velocityParam = sort === "trending" ? [new Date(Date.now() - 24 * 3600 * 1000).toISOString()] : [];

  let orderBy: string;
  if (sort === "top") orderBy = "i.upvote_count DESC, i.priority_score DESC";
  else if (sort === "recent") orderBy = "i.created_at DESC";
  else orderBy = "(COALESCE(v.c, 0) * 3 + i.upvote_count * 0.4) DESC, i.priority_score DESC, i.created_at DESC";

  const fromJoin = `${ISSUE_SELECT} ${velocityJoin}`;
  const rows = db
    .prepare(`${fromJoin} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...velocityParam, ...params, limit, (page - 1) * limit) as IssueRow[];

  const items = rows.map((row) =>
    issueToSummary(row, { userId: req.user?.id, latitude: lat, longitude: lng }),
  );

  // hasMore: fetch one extra row to know if another page exists.
  const hasMoreRow = db
    .prepare(`${fromJoin} ${whereSql} ORDER BY ${orderBy} LIMIT 1 OFFSET ?`)
    .get(...velocityParam, ...params, page * limit) as IssueRow | undefined;

  res.json({ items, page, hasMore: !!hasMoreRow });
});

export default router;