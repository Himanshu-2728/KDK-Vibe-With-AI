import { haversineMeters } from "./geo.js";

export interface DuplicateCandidate {
  issueId: string;
  distanceM: number;
  /** 0..1 — 1 means the descriptions are near-identical. */
  textSimilarity: number;
  score: number;
}

export interface NearbyIssueRow {
  id: string;
  category_id: number;
  description: string;
  latitude: number;
  longitude: number;
  status: string;
  upvote_count: number;
  report_count: number;
}

export interface DuplicateQuery {
  latitude: number;
  longitude: number;
  categoryId: number;
  description: string;
  radiusM?: number;
}

/**
 * Duplicate detection strategy:
 * 1. Geographic proximity FIRST (cheap, reliable): same category within ~150 m.
 * 2. Description token overlap as a secondary signal (image embedding similarity
 *    is the intended upgrade path — same interface, different scoring).
 * 3. Never auto-merge: this returns ranked candidates, the UI asks the user.
 */
export function findDuplicateCandidates(
  query: DuplicateQuery,
  nearby: NearbyIssueRow[],
): DuplicateCandidate[] {
  const radiusM = query.radiusM ?? 150;
  const queryTokens = tokenize(query.description);

  const candidates: DuplicateCandidate[] = [];

  for (const issue of nearby) {
    if (issue.category_id !== query.categoryId) continue;
    const distanceM = haversineMeters(
      query.latitude,
      query.longitude,
      issue.latitude,
      issue.longitude,
    );
    if (distanceM > radiusM) continue;

    const issueTokens = tokenize(issue.description ?? "");
    const textSimilarity = jaccard(queryTokens, issueTokens);

    // Distance dominates; text similarity is a tiebreaker bonus.
    const proximityScore = 1 - Math.min(1, distanceM / radiusM);
    const score = proximityScore * 0.7 + textSimilarity * 0.3;

    candidates.push({
      issueId: issue.id,
      distanceM: Math.round(distanceM),
      textSimilarity,
      score: Math.round(score * 100) / 100,
    });
  }

  return candidates
    .filter((c) => c.score >= 0.2)
    .sort((a, b) => b.score - a.score);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}