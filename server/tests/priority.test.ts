import { describe, expect, it } from "vitest";
import { computePriority, tierForScore, TIER_THRESHOLDS } from "../src/services/priority.js";

const now = new Date("2026-09-05T12:00:00Z");

function score(opts: Partial<Parameters<typeof computePriority>[0]> = {}) {
  return computePriority({
    severity: "low",
    upvoteCount: 0,
    reportCount: 1,
    safetyRisk: 0,
    locationImportance: 0,
    lastActivityAt: new Date(now.getTime() - 3600_000).toISOString(),
    now,
    ...opts,
  });
}

describe("computePriority", () => {
  it("starts low for a fresh, un-upvoted minor issue", () => {
    const r = score();
    expect(r.total).toBeLessThan(TIER_THRESHOLDS.low);
    expect(r.tier).toBe("low");
  });

  it("bases score on severity tier", () => {
    expect(score({ severity: "critical" }).baseSeverity).toBe(40);
    expect(score({ severity: "low" }).baseSeverity).toBe(10);
  });

  it("upvotes visibly move an issue up the scale", () => {
    const base = score({ severity: "high" });
    const upvoted = score({ severity: "high", upvoteCount: 50 });
    expect(upvoted.total).toBeGreaterThan(base.total + 15);
    expect(upvoted.popularity).toBeGreaterThan(0);
  });

  it("popularity caps at 30 so raw popularity can't dominate everything", () => {
    const r = score({ upvoteCount: 10_000, reportCount: 100 });
    expect(r.popularity).toBe(30);
  });

  it("duplicate merges (distinct reporters) count toward popularity", () => {
    const single = score({ upvoteCount: 0, reportCount: 1 });
    const merged = score({ upvoteCount: 0, reportCount: 5 });
    expect(merged.popularity).toBeGreaterThan(single.popularity);
    expect(merged.total).toBeGreaterThan(single.total);
  });

  it("safety risk and location importance add on top", () => {
    const plain = score({ severity: "high" });
    const nearSchool = score({ severity: "high", safetyRisk: 20, locationImportance: 10 });
    expect(nearSchool.total).toBeGreaterThan(plain.total + 20);
  });

  it("age decay reduces score over time but caps at 10", () => {
    const fresh = score({ upvoteCount: 20 });
    const stale = score({ upvoteCount: 20, lastActivityAt: new Date(now.getTime() - 30 * 86400_000).toISOString() });
    expect(stale.ageDecay).toBe(10);
    expect(fresh.ageDecay).toBe(0);
    expect(stale.total).toBe(fresh.total - 10);
    expect(stale.total).toBeGreaterThanOrEqual(0);
  });

  it("never exceeds 0..100", () => {
    const r = score({ severity: "critical", upvoteCount: 999, reportCount: 50, safetyRisk: 20, locationImportance: 10 });
    expect(r.total).toBeLessThanOrEqual(100);
    expect(score({ lastActivityAt: new Date(now.getTime() - 500 * 86400_000).toISOString() }).total).toBeGreaterThanOrEqual(0);
  });

  it("tier boundaries are correct", () => {
    expect(tierForScore(0)).toBe("low");
    expect(tierForScore(24)).toBe("low");
    expect(tierForScore(25)).toBe("medium");
    expect(tierForScore(49)).toBe("medium");
    expect(tierForScore(50)).toBe("high");
    expect(tierForScore(74)).toBe("high");
    expect(tierForScore(75)).toBe("critical");
    expect(tierForScore(100)).toBe("critical");
  });

  it("a hot merged issue reaches CRITICAL (the demo mechanic)", () => {
    const r = score({
      severity: "high",
      upvoteCount: 47,
      reportCount: 5,
      safetyRisk: 8,
      locationImportance: 8,
      lastActivityAt: new Date(now.getTime() - 5 * 3600_000).toISOString(),
    });
    expect(r.tier).toBe("critical");
    expect(r.total).toBeGreaterThanOrEqual(TIER_THRESHOLDS.high);
  });
});