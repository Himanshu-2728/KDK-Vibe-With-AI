import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb, getDb } from "../src/db.js";

const app = createApp();
const TOKEN_KEY = "civicpulse_test";

let userSeq = 0;

async function signup(overrides: Record<string, string> = {}) {
  const email = `user${++userSeq}@test.dev`;
  const res = await request(app).post("/api/auth/signup").send({
    email,
    password: "password123",
    displayName: "Test User",
    ...overrides,
  });
  return res.body as { token: string; user: { id: string; email: string; role: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const PHOTO = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#333"/></svg>`,
);

beforeEach(() => {
  resetDb();
});

describe("auth", () => {
  it("signs up, logs in, and serves /me", async () => {
    const { token, user } = await signup();
    expect(user.role).toBe("citizen");
    expect(token).toBeTruthy();

    const me = await request(app).get("/api/auth/me").set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "password123",
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  it("rejects duplicate emails, short passwords, wrong passwords", async () => {
    const { user } = await signup();
    const dup = await request(app).post("/api/auth/signup").send({
      email: user.email,
      password: "password123",
      displayName: "Other",
    });
    expect(dup.status).toBe(409);

    const short = await request(app).post("/api/auth/signup").send({
      email: "x@test.dev",
      password: "short",
      displayName: "X",
    });
    expect(short.status).toBe(400);

    const badLogin = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "nope-nope",
    });
    expect(badLogin.status).toBe(401);
  });

  it("requires auth for protected routes", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    const feed = await request(app).get("/api/feed");
    expect(feed.status).toBe(200); // feed is public
  });
});

describe("feed", () => {
  it("returns seeded issues with all fields, trending by default", async () => {
    const res = await request(app).get("/api/feed").query({ limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const first = res.body.items[0]!;
    expect(first.id).toBeTruthy();
    expect(first.categoryName).toBeTruthy();
    expect(first.status).toBeTruthy();
    expect(typeof first.upvoteCount).toBe("number");
    expect(typeof first.priorityTier).toBe("string");
  });

  it("sorts by top (upvote count) and recent (created_at)", async () => {
    const top = await request(app).get("/api/feed").query({ sort: "top", limit: 50 });
    const counts = top.body.items.map((i: { upvoteCount: number }) => i.upvoteCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    const recent = await request(app).get("/api/feed").query({ sort: "recent", limit: 50 });
    const dates = recent.body.items.map((i: { createdAt: string }) => i.createdAt);
    expect(dates).toEqual([...dates].sort((a, b) => (a < b ? 1 : -1)));
  });

  it("trending surfaces the merged pothole cluster first (demo mechanic)", async () => {
    const res = await request(app).get("/api/feed").query({ sort: "trending", limit: 3 });
    expect(res.body.items[0]!.id).toBe("iss_oak_pothole");
    expect(res.body.items[0]!.reportCount).toBe(5);
    expect(res.body.items[0]!.duplicateNote).toContain("4 other people reported this too");
    expect(res.body.items[0]!.priorityTier).toBe("critical");
  });

  it("filters by criticalOnly, category and status", async () => {
    const crit = await request(app).get("/api/feed").query({ criticalOnly: "true", limit: 50 });
    expect(crit.body.items.length).toBeGreaterThan(0);
    for (const i of crit.body.items) expect(i.priorityScore).toBeGreaterThanOrEqual(75);

    const water = await request(app).get("/api/feed").query({ category: "Water" });
    expect(water.body.items.length).toBeGreaterThan(0);
    for (const i of water.body.items) expect(i.categoryName).toBe("Water");

    const resolved = await request(app).get("/api/feed").query({ status: "confirmed" });
    for (const i of resolved.body.items) expect(i.status).toBe("confirmed");
  });

  it("nearby sort requires coordinates and returns distances", async () => {
    const bad = await request(app).get("/api/feed").query({ sort: "nearby" });
    expect(bad.status).toBe(400);

    const res = await request(app)
      .get("/api/feed")
      .query({ sort: "nearby", lat: 40.7135, lng: -74.0032 });
    expect(res.status).toBe(200);
    expect(res.body.items[0]!.id).toBe("iss_oak_pothole");
    expect(res.body.items[0]!.distanceM).toBeLessThan(200);
  });

  it("paginates with hasMore", async () => {
    const page1 = await request(app).get("/api/feed").query({ page: 1, limit: 2 });
    const page2 = await request(app).get("/api/feed").query({ page: 2, limit: 2 });
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);
    const ids1 = new Set(page1.body.items.map((i: { id: string }) => i.id));
    for (const i of page2.body.items) expect(ids1.has(i.id)).toBe(false);
  });
});

describe("upvotes", () => {
  it("counts upvotes, dedupes per user, and supports un-upvoting", async () => {
    const { token } = await signup();
    const detail = await request(app).get("/api/issues/iss_railing_bridge");
    expect(detail.body.issue.upvoteCount).toBe(1);

    const up1 = await request(app).post("/api/issues/iss_railing_bridge/upvote").set(auth(token));
    expect(up1.status).toBe(200);
    expect(up1.body.upvoteCount).toBe(2);
    expect(up1.body.userUpvoted).toBe(true);

    // Double upvote must NOT increment (server-side unique constraint).
    const up2 = await request(app).post("/api/issues/iss_railing_bridge/upvote").set(auth(token));
    expect(up2.body.upvoteCount).toBe(2);

    const un = await request(app).delete("/api/issues/iss_railing_bridge/upvote").set(auth(token));
    expect(un.body.upvoteCount).toBe(1);
    expect(un.body.userUpvoted).toBe(false);
  });

  it("requires auth to upvote", async () => {
    const res = await request(app).post("/api/issues/iss_railing_bridge/upvote");
    expect(res.status).toBe(401);
  });

  it("reports userUpvoted on the feed for the logged-in user", async () => {
    const { token } = await signup();
    await request(app).post("/api/issues/iss_railing_bridge/upvote").set(auth(token));
    const feed = await request(app).get("/api/feed").set(auth(token));
    const item = feed.body.items.find((i: { id: string }) => i.id === "iss_railing_bridge");
    expect(item.userUpvoted).toBe(true);
  });
});

describe("report flow", () => {
  it("creates a report, runs the AI pass, and finalizes into a new issue", async () => {
    const { token } = await signup();

    const created = await request(app)
      .post("/api/reports")
      .set(auth(token))
      .field("description", "Broken streetlight flickering near the park")
      .field("lat", "40.7100")
      .field("lng", "-74.0050")
      .field("locationName", "Central Park")
      .attach("photo", PHOTO, { filename: "photo.svg", contentType: "image/svg+xml" });
    expect(created.status).toBe(201);
    expect(created.body.reportId).toBeTruthy();
    expect(created.body.ai.category).toBe("Electrical");
    expect(typeof created.body.ai.confidence).toBe("number");

    const finalize = await request(app)
      .post(`/api/reports/${created.body.reportId}/finalize`)
      .set(auth(token))
      .send({ decision: "create" });
    expect(finalize.status).toBe(201);
    expect(finalize.body.merged).toBe(false);
    const issueId = finalize.body.issueId as string;

    const detail = await request(app).get(`/api/issues/${issueId}`);
    expect(detail.body.issue.status).toBe("ai_analyzed");
    expect(detail.body.issue.categoryName).toBe("Electrical");
    expect(detail.body.history[0]!.toStatus).toBe("ai_analyzed");

    // It should now appear in the feed.
    const feed = await request(app).get("/api/feed").query({ sort: "recent", limit: 10 });
    expect(feed.body.items.some((i: { id: string }) => i.id === issueId)).toBe(true);
  });

  it("rejects reports without a photo or location", async () => {
    const { token } = await signup();
    const noPhoto = await request(app)
      .post("/api/reports")
      .set(auth(token))
      .field("description", "test")
      .field("lat", "40.7")
      .field("lng", "-74.0");
    expect(noPhoto.status).toBe(400);

    const noLoc = await request(app)
      .post("/api/reports")
      .set(auth(token))
      .attach("photo", PHOTO, { filename: "photo.svg", contentType: "image/svg+xml" });
    expect(noLoc.status).toBe(400);
  });

  it("detects a nearby duplicate and merges with an upvote, bumping priority", async () => {
    const { token } = await signup();
    const before = await request(app).get("/api/issues/iss_oak_pothole");
    const beforePriority = before.body.issue.priorityScore;

    // Report at the pothole's exact location with matching keywords.
    const created = await request(app)
      .post("/api/reports")
      .set(auth(token))
      .field("description", "Deep pothole on Oak St, getting worse")
      .field("lat", "40.7135")
      .field("lng", "-74.0032")
      .attach("photo", PHOTO, { filename: "photo.svg", contentType: "image/svg+xml" });
    expect(created.status).toBe(201);
    expect(created.body.duplicate.issueId).toBe("iss_oak_pothole");

    const finalize = await request(app)
      .post(`/api/reports/${created.body.reportId}/finalize`)
      .set(auth(token))
      .send({ decision: "merge", issueId: "iss_oak_pothole" });
    expect(finalize.status).toBe(200);
    expect(finalize.body.merged).toBe(true);
    expect(finalize.body.reportCount).toBe(6);

    const after = await request(app).get("/api/issues/iss_oak_pothole");
    expect(after.body.issue.upvoteCount).toBe(before.body.issue.upvoteCount + 1); // merge adds an upvote
    expect(after.body.issue.reportCount).toBe(6);
    expect(after.body.issue.priorityScore).toBeGreaterThanOrEqual(beforePriority);

    // Merging twice with the same user must not double count.
    const created2 = await request(app)
      .post("/api/reports")
      .set(auth(token))
      .field("description", "Another pothole on Oak St")
      .field("lat", "40.7136")
      .field("lng", "-74.0033")
      .attach("photo", PHOTO, { filename: "photo.svg", contentType: "image/svg+xml" });
    await request(app)
      .post(`/api/reports/${created2.body.reportId}/finalize`)
      .set(auth(token))
      .send({ decision: "merge", issueId: "iss_oak_pothole" });
    const after2 = await request(app).get("/api/issues/iss_oak_pothole");
    expect(after2.body.issue.reportCount).toBe(6); // distinct reporters, not reports
    expect(after2.body.issue.upvoteCount).toBe(after.body.issue.upvoteCount); // already upvoted
  });

  it("lets the user correct the AI guess on finalize", async () => {
    const { token } = await signup();
    const created = await request(app)
      .post("/api/reports")
      .set(auth(token))
      .field("description", "Weird damage on the sidewalk")
      .field("lat", "40.7110")
      .field("lng", "-74.0060")
      .attach("photo", PHOTO, { filename: "photo.svg", contentType: "image/svg+xml" });
    const finalize = await request(app)
      .post(`/api/reports/${created.body.reportId}/finalize`)
      .set(auth(token))
      .send({ decision: "create", categoryId: 5, severity: "high", type: "Broken Guardrail" });
    expect(finalize.status).toBe(201);
    const detail = await request(app).get(`/api/issues/${finalize.body.issueId}`);
    expect(detail.body.issue.categoryName).toBe("Safety");
    expect(detail.body.issue.severity).toBe("high");
    expect(detail.body.issue.title).toContain("Broken Guardrail");
  });
});

describe("comments", () => {
  it("adds comments and updates the count", async () => {
    const { token } = await signup();
    const before = await request(app).get("/api/issues/iss_oak_pothole");
    const res = await request(app)
      .post("/api/issues/iss_oak_pothole/comments")
      .set(auth(token))
      .send({ body: "This is getting dangerous" });
    expect(res.status).toBe(201);
    const after = await request(app).get("/api/issues/iss_oak_pothole");
    expect(after.body.comments.length).toBe(before.body.comments.length + 1);
    expect(after.body.issue.commentCount).toBe(before.body.issue.commentCount + 1);
  });

  it("validates comment length and auth", async () => {
    const { token } = await signup();
    const empty = await request(app)
      .post("/api/issues/iss_oak_pothole/comments")
      .set(auth(token))
      .send({ body: "   " });
    expect(empty.status).toBe(400);
    const noAuth = await request(app)
      .post("/api/issues/iss_oak_pothole/comments")
      .send({ body: "hello" });
    expect(noAuth.status).toBe(401);
  });
});

describe("admin workflow + role boundaries", () => {
  it("blocks citizens from admin routes", async () => {
    const { token } = await signup();
    const res = await request(app).get("/api/admin/summary").set(auth(token));
    expect(res.status).toBe(403);
  });

  it("serves heatmap cells, per-issue points and area names in the summary", async () => {
    const login = await request(app).post("/api/auth/login").send({
      email: "tom@city.gov",
      password: "demo1234",
    });
    const res = await request(app).get("/api/admin/summary").set(auth(login.body.token as string));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.heatmap)).toBe(true);
    expect(res.body.heatmap.length).toBeGreaterThan(1);
    expect(res.body.heatmap[0]).toMatchObject({ area: expect.any(String), unresolved: expect.any(Number) });
    expect(Array.isArray(res.body.heatPoints)).toBe(true);
    expect(res.body.heatPoints.length).toBeGreaterThanOrEqual(res.body.heatmap.length);
    expect(res.body.areas).toContain("Oak St, Riverside");
  });

  it("filters the admin queue by area", async () => {
    const login = await request(app).post("/api/auth/login").send({
      email: "tom@city.gov",
      password: "demo1234",
    });
    const all = await request(app).get("/api/admin/issues").set(auth(login.body.token as string));
    expect(all.body.total).toBeGreaterThan(1);

    // Both the short name and the full preset label work as filters.
    const res = await request(app)
      .get("/api/admin/issues")
      .query({ area: "Riverside" })
      .set(auth(login.body.token as string));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThan(all.body.total);
    for (const i of res.body.items) expect(i.area_name).toBe("Oak St, Riverside");

    const byFull = await request(app)
      .get("/api/admin/issues")
      .query({ area: "Oak St, Riverside" })
      .set(auth(login.body.token as string));
    expect(byFull.status).toBe(200);
    expect(byFull.body.total).toBe(res.body.total);
  });

  it("allows the authority role to verify, assign, resolve and get confirmed", async () => {
    const login = await request(app).post("/api/auth/login").send({
      email: "tom@city.gov",
      password: "demo1234",
    });
    expect(login.status).toBe(200);
    const admin = auth(login.body.token as string);
    const citizen = await signup();

    // Verify the AI-analyzed garbage issue.
    const verify = await request(app).post("/api/admin/issues/iss_garbage_park/verify").set(admin);
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe("verified");

    // Backward transitions are rejected.
    const back = await request(app)
      .post("/api/admin/issues/iss_garbage_park/status")
      .set(admin)
      .send({ status: "reported" });
    expect(back.status).toBe(409);

    // Assign to Waste Management (dept 4).
    const assign = await request(app)
      .post("/api/admin/issues/iss_garbage_park/assign")
      .set(admin)
      .send({ departmentId: 4 });
    expect(assign.status).toBe(200);
    expect(assign.body.status).toBe("assigned");

    // Mark in progress.
    const progress = await request(app)
      .post("/api/admin/issues/iss_garbage_park/status")
      .set(admin)
      .send({ status: "in_progress", note: "Crew dispatched" });
    expect(progress.status).toBe(200);

    // Resolve with an after-photo.
    const resolve = await request(app)
      .post("/api/admin/issues/iss_garbage_park/resolve")
      .set(admin)
      .field("note", "Area cleaned")
      .attach("afterPhoto", PHOTO, { filename: "after.svg", contentType: "image/svg+xml" });
    expect(resolve.status).toBe(200);

    // The original reporter (Jordan, seeded) is notified; confirm as reporter.
    const jordan = await request(app).post("/api/auth/login").send({
      email: "jordan@example.com",
      password: "demo1234",
    });
    const confirm = await request(app)
      .post("/api/issues/iss_garbage_park/confirm-resolution")
      .set(auth(jordan.body.token as string))
      .send({ confirm: true });
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe("confirmed");

    const detail = await request(app).get("/api/issues/iss_garbage_park");
    expect(detail.body.issue.status).toBe("confirmed");
    expect(detail.body.resolution.confirmed).toBe(1);

    // Non-reporters cannot confirm.
    const outsider = await signup();
    await request(app).post("/api/admin/issues/iss_railing_bridge/status").set(admin).send({ status: "resolved" });
    const noConfirm = await request(app)
      .post("/api/issues/iss_railing_bridge/confirm-resolution")
      .set(auth(outsider.token))
      .send({ confirm: true });
    expect(noConfirm.status).toBe(403);
  });
});

describe("notifications + profile", () => {
  it("creates notifications on status changes and lists them", async () => {
    // Sam reported the railing issue, so Sam is the one notified on verify.
    const sam = await request(app).post("/api/auth/login").send({
      email: "sam@example.com",
      password: "demo1234",
    });
    const admin = await request(app).post("/api/auth/login").send({
      email: "tom@city.gov",
      password: "demo1234",
    });

    await request(app).post("/api/admin/issues/iss_railing_bridge/verify").set(auth(admin.body.token as string));

    const notifs = await request(app)
      .get("/api/notifications")
      .set(auth(sam.body.token as string));
    expect(notifs.status).toBe(200);
    const latest = notifs.body.items[0];
    expect(latest.issue_id).toBe("iss_railing_bridge");
    expect(notifs.body.unreadCount).toBeGreaterThan(0);

    const read = await request(app)
      .post(`/api/notifications/${latest.id}/read`)
      .set(auth(sam.body.token as string));
    expect(read.status).toBe(200);
  });

  it("computes an impact score from reported issues", async () => {
    const aisha = await request(app).post("/api/auth/login").send({
      email: "aisha@example.com",
      password: "demo1234",
    });
    const res = await request(app)
      .get("/api/me/profile")
      .set(auth(aisha.body.token as string));
    expect(res.status).toBe(200);
    expect(res.body.impact).toBeGreaterThan(0);
    expect(res.body.stats.reportCount).toBeGreaterThanOrEqual(2); // pothole + tree
  });
});

describe("nearby endpoint", () => {
  it("returns issues within the radius with distances", async () => {
    const res = await request(app)
      .get("/api/issues/nearby")
      .query({ lat: 40.7135, lng: -74.0032, radius: 300 });
    expect(res.status).toBe(200);
    expect(res.body.items[0]!.issueId).toBe("iss_oak_pothole");
    expect(res.body.items[0]!.distanceM).toBeLessThan(50);
  });

  it("requires coordinates", async () => {
    const res = await request(app).get("/api/issues/nearby");
    expect(res.status).toBe(400);
  });
});

// Keep a reference so the DB helper import is used (getDb used by resetDb path).
void getDb;