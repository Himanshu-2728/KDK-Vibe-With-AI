import { describe, expect, it } from "vitest";
import { findDuplicateCandidates, type NearbyIssueRow } from "../src/services/duplicates.js";

const CATEGORY = 1; // Infrastructure

function issue(partial: Partial<NearbyIssueRow>): NearbyIssueRow {
  return {
    id: "iss_x",
    category_id: CATEGORY,
    description: "Deep pothole on Great Nag Rd",
    latitude: 21.1413,
    longitude: 79.12673,
    status: "verified",
    upvote_count: 10,
    report_count: 2,
    ...partial,
  };
}

const query = {
  latitude: 21.1413,
  longitude: 79.12673,
  categoryId: CATEGORY,
  description: "Deep pothole on Great Nag Rd",
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
    const far = issue({ latitude: 21.155, longitude: 79.135 }); // ~1.8 km away
    expect(findDuplicateCandidates(query, [far])).toHaveLength(0);
  });

  it("ignores issues of a different category even when close", () => {
    const other = issue({ category_id: 4 }); // Electrical
    expect(findDuplicateCandidates(query, [other])).toHaveLength(0);
  });

  it("ranks closer, more text-similar matches first", () => {
    const closeButGeneric = issue({
      id: "a",
      latitude: 21.1414,
      longitude: 79.1268,
      description: "Road is bad here",
    });
    const slightlyFarButIdentical = issue({
      id: "b",
      latitude: 21.1415,
      longitude: 79.1269,
      description: "Deep pothole on Great Nag Rd near the school",
    });
    const matches = findDuplicateCandidates(query, [closeButGeneric, slightlyFarButIdentical]);
    expect(matches.map((m) => m.issueId)).toEqual(["b", "a"]);
  });

  it("filters out weak matches below the score floor", () => {
    // ~133 m away with unrelated text: proximity is too low to matter.
    const weak = issue({ latitude: 21.1425, description: "Hello world this is unrelated" });
    expect(findDuplicateCandidates(query, [weak])).toHaveLength(0);
  });

  it("supports a custom radius", () => {
    const near = issue({ latitude: 21.142, longitude: 79.12673 }); // ~78 m
    expect(findDuplicateCandidates({ ...query, radiusM: 50 }, [near])).toHaveLength(0);
    expect(findDuplicateCandidates({ ...query, radiusM: 120 }, [near])).toHaveLength(1);
  });
});