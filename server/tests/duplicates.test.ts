import { describe, expect, it } from "vitest";
import { findDuplicateCandidates, type NearbyIssueRow } from "../src/services/duplicates.js";

const CATEGORY = 1; // Infrastructure

function issue(partial: Partial<NearbyIssueRow>): NearbyIssueRow {
  return {
    id: "iss_x",
    category_id: CATEGORY,
    description: "Deep pothole on Oak St",
    latitude: 40.7135,
    longitude: -74.0032,
    status: "verified",
    upvote_count: 10,
    report_count: 2,
    ...partial,
  };
}

const query = {
  latitude: 40.7135,
  longitude: -74.0032,
  categoryId: CATEGORY,
  description: "Deep pothole on Oak St",
  radiusM: 150,
};

describe("findDuplicateCandidates", () => {
  it("matches an identical report at the same spot", () => {
    const matches = findDuplicateCandidates(query, [issue({})]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.issueId).toBe("iss_x");
    expect(matches[0]!.score).toBeGreaterThanOrEqual(0.7);
  });

  it("ignores issues outside the radius", () => {
    const far = issue({ latitude: 40.72, longitude: -74.02 }); // ~1.8 km away
    expect(findDuplicateCandidates(query, [far])).toHaveLength(0);
  });

  it("ignores issues of a different category even when close", () => {
    const other = issue({ category_id: 4 }); // Electrical
    expect(findDuplicateCandidates(query, [other])).toHaveLength(0);
  });

  it("ranks closer, more text-similar matches first", () => {
    const closeButGeneric = issue({
      id: "a",
      latitude: 40.7136,
      longitude: -74.0031,
      description: "Road is bad here",
    });
    const slightlyFarButIdentical = issue({
      id: "b",
      latitude: 40.7137,
      longitude: -74.0029,
      description: "Deep pothole on Oak St near the school",
    });
    const matches = findDuplicateCandidates(query, [closeButGeneric, slightlyFarButIdentical]);
    expect(matches.map((m) => m.issueId)).toEqual(["b", "a"]);
  });

  it("filters out weak matches below the score floor", () => {
    // ~133 m away with unrelated text: proximity is too low to matter.
    const weak = issue({ latitude: 40.7147, description: "Hello world this is unrelated" });
    expect(findDuplicateCandidates(query, [weak])).toHaveLength(0);
  });

  it("supports a custom radius", () => {
    const near = issue({ latitude: 40.7142, longitude: -74.0036 }); // ~80 m
    expect(findDuplicateCandidates({ ...query, radiusM: 50 }, [near])).toHaveLength(0);
    expect(findDuplicateCandidates({ ...query, radiusM: 120 }, [near])).toHaveLength(1);
  });
});