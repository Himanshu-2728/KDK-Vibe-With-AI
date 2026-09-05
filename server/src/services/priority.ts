import type { PriorityBreakdown, PriorityTier, Severity } from "../types.js";

export const SEVERITY_BASE: Record<Severity, number> = {
  low: 10,
  medium: 20,
  high: 30,
  critical: 40,
};

export const TIER_THRESHOLDS = { low: 25, medium: 50, high: 75 } as const;

export function tierForScore(score: number): PriorityTier {
  if (score >= TIER_THRESHOLDS.high) return "critical";
  if (score >= TIER_THRESHOLDS.medium) return "high";
  if (score >= TIER_THRESHOLDS.low) return "medium";
  return "low";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Priority Score (0–100) =
 *   Base Severity (0–40)  — severity tier from AI classification
 * + Popularity (0–30)     — upvotes and distinct reporters (duplicate merges count)
 * + Safety Risk (0–20)    — context keywords (school, flooding, sparking…)
 * + Location Importance (0–10) — proximity to schools/hospitals/main roads
 * − Age Decay (0–10)      — log-ish decay since last activity
 *
 * Tiers: LOW <25 · MEDIUM 25–49 · HIGH 50–74 · CRITICAL ≥75
 */
export function computePriority(params: {
  severity: Severity;
  upvoteCount: number;
  reportCount: number;
  safetyRisk: number;
  locationImportance: number;
  lastActivityAt: string | Date;
  now?: Date;
}): PriorityBreakdown {
  const now = params.now ?? new Date();
  const lastActivity = new Date(params.lastActivityAt);
  const daysSince = Math.max(
    0,
    (now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000),
  );

  const baseSeverity = SEVERITY_BASE[params.severity];

  // Each upvote adds ~0.6; each extra distinct reporter (merge) adds 2.
  // Capped so raw popularity can't dominate everything.
  const popularity = clamp(
    Math.round(params.upvoteCount * 0.6 + Math.max(0, params.reportCount - 1) * 2),
    0,
    30,
  );

  const safetyRisk = clamp(Math.round(params.safetyRisk), 0, 20);
  const locationImportance = clamp(Math.round(params.locationImportance), 0, 10);

  // Slow early, then tapers: ~2/day in the first week, maxing at 10 after ~2 weeks.
  const ageDecay = Math.min(10, Math.round(Math.log2(daysSince + 1) * 2));

  const total = clamp(
    baseSeverity + popularity + safetyRisk + locationImportance - ageDecay,
    0,
    100,
  );

  return {
    baseSeverity,
    popularity,
    safetyRisk,
    locationImportance,
    ageDecay,
    total,
    tier: tierForScore(total),
  };
}