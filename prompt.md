# CivicPulse — Detailed Build Prompt for AI Agent

You are a senior full-stack engineer, AI/ML engineer, and UI/UX designer. Design and build **CivicPulse**, a social-media-style web app for reporting and tracking civic issues (potholes, broken streetlights, garbage dumping, water leakage, damaged roads, fallen trees, and similar public infrastructure problems).

The core idea: instead of a boring government complaint portal, this should feel like scrolling a social feed — citizens post issues with a photo and location, the community upvotes the ones that matter, and upvote count drives visibility, priority, and (eventually) which issues authorities act on first. Do not build a generic CRUD complaint form. This must feel like a real, polished consumer product.

---

## 1. PRODUCT DESIGN

- Give the project a strong, memorable name and one-line tagline.
- State the problem: civic issues go unreported or unresolved because there's no easy, engaging way for citizens to flag them or make popular issues visible.
- State the solution: a social feed where reporting is as easy as posting, and community upvotes surface the issues that affect the most people.
- Target users: everyday citizens (primary), local authorities/municipal staff (secondary, lighter-weight view).
- Unique selling points: social-feed familiarity, upvote-driven prioritization, automatic duplicate/near-duplicate merging so upvotes concentrate instead of splintering, AI-assisted issue classification.
- Explain briefly why this beats a traditional complaint system: engagement, transparency, and crowd-verified priority instead of a black-box queue.

---

## 2. HOME FEED (the centerpiece — build this first and make it excellent)

- Scrollable feed of **issue cards**. Each card shows:
  - Photo(s), auto-detected/selected issue type, short description
  - Category tag (Infrastructure, Sanitation, Water, Electrical, Safety, Environment)
  - Location (area name + distance from viewer if location permission granted)
  - Upvote count and upvote button
  - Status badge: Reported → AI Analyzed → Verified → Assigned → In Progress → Resolved → Confirmed
  - Timestamp, comment count
- **Upvote interaction**: tapping animates (bounce + count tick-up), optimistic UI update, debounced write to backend. One upvote per user per issue.
- **Duplicate awareness on the card**: if the system detects this issue has multiple near-identical reports nearby, show "12 people reported this too" instead of splitting into separate cards — this is what makes upvotes meaningful instead of diluted.
- **Sort/filter bar**: Trending (velocity of upvotes), Most Upvoted (all-time), Nearest to Me, Recent, By Category, Critical Only.
- Infinite scroll, skeleton loaders, graceful empty state ("No issues near you yet — be the first to report one") and error states.
- Mobile-first responsive layout; this is the page most users will live in.

---

## 3. REPORTING FLOW

- Entry point: a floating "+" / "Report an Issue" button, always reachable from the feed.
- Steps: take/upload photo → auto-capture GPS (or drop a pin manually on a map) → short description → optional category picker → submit.
- On submit, run an AI pass on the photo:
  - Return detected issue type, confidence score, estimated severity, and a short plain-language explanation.
  - Let the user confirm or correct the AI's guess before the post goes live — never claim the AI is authoritative.
  - Design the AI step so it can run on a real lightweight model, a pretrained classifier, or a mocked/rule-based stand-in without changing the surrounding flow.
- Duplicate detection pass: compare new report's location + category (and optionally image similarity) against existing nearby issues.
  - If a likely match is found, prompt: "This looks like an issue already reported nearby — add your upvote instead?" and merge into the existing card's report count.
  - If merged, bump that issue's priority based on number of distinct reporters.

---

## 4. PRIORITY / SEVERITY SYSTEM

Define a transparent formula (not a black box), e.g.:

```
Priority Score = Base Severity + Report/Upvote Frequency + Safety Risk + Location Importance (proximity to schools/hospitals/main roads) − Age Decay Adjustment
```

Classify into LOW / MEDIUM / HIGH / CRITICAL. Show the score's components on the issue detail page so it feels transparent, not arbitrary. Upvotes and duplicate-merge counts should visibly move an issue up this scale — this is the mechanic that makes "more upvotes = more visibility = more likely to be fixed" feel real.

---

## 5. ISSUE DETAIL PAGE

- Full photo(s), description, map pin, upvote button, comment/discussion thread.
- Status timeline showing every stage the issue has passed through, with timestamps.
- Priority score breakdown (see above).
- Once marked resolved by an authority: before/after photos, resolution timestamp, and a "Confirm this is actually fixed" action for the original reporter/community — prevents fake resolutions and builds trust.

---

## 6. PROFILE & NOTIFICATIONS

- Profile: issues the user has reported, issues they've upvoted, an "impact score" (weighted by upvotes their reports received and issues they helped resolve).
- In-app notifications for: report submitted, AI analyzed, verified, status changed, resolved, resolution confirmed/rejected, someone upvoted your report to a new priority tier.

---

## 7. LIGHTWEIGHT AUTHORITY/ADMIN VIEW

A separate, information-dense view (desktop-oriented) for verifying and managing issues — secondary to the citizen feed but should still exist:

- Totals: total / pending / high-priority / resolved reports, average resolution time.
- Interactive map with color-coded density (heatmap: red = high issue density, yellow = medium, green = low).
- Table of reports by category, department, and status.
- Ability to verify a report, override its auto-assigned department, change status, and upload after-fix photos.
- Basic insights, e.g. "Road-related reports increased 28% this month," "Area X has the most unresolved reports," phrased for municipal decision-making, not just raw stats.

---

## 8. DEPARTMENT AUTO-ROUTING

Auto-assign verified issues to a department based on category (Pothole → Roads, Streetlight → Electrical, Water Leakage → Water Dept, Garbage → Waste Management, Fallen Tree → Municipal/Disaster). Allow manual override from the admin view.

---

## 9. TRUST & ANTI-ABUSE (lightweight, not over-engineered)

- Rate-limit report submissions per user/device.
- One upvote per user per issue, enforced server-side.
- Flag (not auto-reject) suspicious patterns: many reports from one account in a short window, reports with no location, repeated identical images.
- Basic auth (citizen vs authority roles), input validation, secure image upload.

---

## 10. SYSTEM ARCHITECTURE

Design and diagram the flow:

```
Frontend (feed, report flow, profile)
   ↓
Backend API (auth, CRUD, upvotes, feed ranking)
   ↓
AI Service (image classification, severity, duplicate detection)
   ↓
Database (Postgres)
   ↓
File/Image Storage
   ↓
Maps/Geolocation Service
   ↓
Notification Service (in-app)
```

Explain how each layer talks to the others, and where caching/ranking computation for "Trending" happens (e.g. a scheduled job or on-read scoring).

---

## 11. DATABASE SCHEMA (PostgreSQL)

Design tables including, at minimum: `users`, `issues` (the merged/master issue, not raw individual submissions), `issue_reports` (individual submissions that map to a master issue), `issue_categories`, `departments`, `issue_images`, `upvotes` (user_id + issue_id, unique constraint), `issue_status_history`, `comments`, `notifications`, `resolutions`. For each table give columns, data types, primary/foreign keys, and important indexes (especially for geospatial lookup and feed sorting by upvote velocity).

---

## 12. API DESIGN

Design REST endpoints for: auth (signup/login), create report, upload image, trigger AI analysis, get feed (with sort/filter params), upvote/un-upvote an issue, get nearby issues (for duplicate check and "near me" sort), get issue detail + status history, add comment, admin: verify/assign/update status/resolve, notifications. Give example request/response payloads for the feed endpoint and the upvote endpoint at minimum, since those are the core interactions.

---

## 13. AI PIPELINE

Explain the approach for:
- Image classification/detection of issue type (pretrained model, fine-tuned lightweight classifier, or mocked inference — be explicit about what's realistic to actually run vs. what to fake for a demo).
- Severity estimation from the image/description.
- Duplicate detection: geographic proximity first (cheap, reliable), optional image embedding similarity as a secondary signal.
- Be honest about accuracy limitations; never assume the AI decision is final — it should always be a suggestion the system or user can confirm/override.

---

## 14. UI/UX — SCREENS TO DESIGN

**Citizen-facing (mobile-first, social-app polish):**
Landing/onboarding → Login/signup → Home feed → Report issue (photo/location/description) → AI analysis confirmation step → Post submitted confirmation → Issue detail (with timeline + comments) → Profile → Notifications.

**Authority-facing (desktop, information-dense):**
Dashboard (stat cards, heatmap) → Issue list/table → Issue detail with verify/assign/resolve actions → Analytics view.

Design direction: clean typography, soft shadows, rounded cards, smooth micro-interactions especially on the upvote button and page transitions, civic-trust color palette (calm blues/greens with one accent reserved for upvotes/CTAs — avoid looking like a government portal), dark mode support, bottom nav on mobile (Home, Map/Explore, Report, Notifications, Profile).

---

## 15. BUILD PRIORITIES

State clearly what must work for a convincing demo vs. what can be mocked:

**Must work:** the feed with real upvoting, report submission with photo + location, basic status progression, duplicate merge on at least a simple proximity check.

**Can be mocked/simplified initially:** full AI image classification (rule-based or pretrained-off-the-shelf is fine), the admin heatmap (static/sample data acceptable early), notifications (in-app only, no SMS/push infra needed).

**Do not build:** anything not visible in the demo flow — skip infrastructure that doesn't serve the "report → upvote → visibility → resolution" story.

---

## 16. DEMO / STORY FLOW

Write a short end-to-end scenario showing: a citizen spots a pothole → reports it in seconds → AI suggests "Pothole, High Severity" → system finds 4 nearby similar reports and merges them, bumping priority to CRITICAL → issue rises to the top of the "Trending" feed via upvotes → an authority verifies and assigns it → marks it in progress → uploads an after-fix photo → original reporters get notified and confirm the fix → feed and dashboard stats update. Make this feel like a real, satisfying story, not a checklist of features.

---

## 17. IMPLEMENTATION ROADMAP

Break the build into phases/milestones (e.g., feed + auth first, then reporting flow, then upvote/duplicate logic, then AI integration, then admin view, then polish/animations). Prioritize whatever makes the core feed-and-upvote loop demoable as early as possible.

---

## 18. BUILD-AND-TEST DISCIPLINE (mandatory, not optional)

Do not build the whole app and test at the end — verify each piece before moving to the next, so a later feature never silently breaks an earlier one.

- **After every feature, before starting the next one:** run the app, manually exercise the new feature, and re-check the 2–3 most important existing flows still work (feed loads, upvote persists, report submission succeeds). Treat this as a gate, not a suggestion.
- **Write lightweight automated tests as you go**, not as an afterthought:
  - Unit tests for pure logic that's easy to get subtly wrong: priority score calculation, duplicate-match logic, upvote counting/dedup (one vote per user).
  - API tests for each endpoint as it's built (create report, upvote, get feed with each sort/filter, status update) — check both success and obvious failure cases (bad input, unauthenticated, double-upvote).
  - A handful of end-to-end smoke tests for the critical path: submit a report → it appears in the feed → upvote it → count updates → status changes reflect on the detail page. Re-run this smoke test after every major change.
- **Guard against regressions specifically around:**
  - Upvote counts (race conditions from rapid double-taps, duplicate votes from the same user).
  - Duplicate/merge logic (make sure merging two reports doesn't drop or double-count upvotes).
  - Feed sorting/filtering (each sort mode still returns correct results after schema or ranking changes).
  - Auth/role boundaries (citizen actions vs. authority-only actions stay separated as new screens are added).
- Before considering any milestone "done," do a quick pass on loading states, empty states, and error states for whatever was just built — these are the first things that look broken in a demo.
- Keep a short running checklist of "known-good" flows and re-verify all of them right before the final demo build, not just the newest feature.

---

## 19. USE THE ORIGINAL PROJECT BRIEF AS EXTENDED REFERENCE

This build is based on an earlier, more exhaustive brief for a civic-issue reporting system (the hackathon-style version, before it was reframed as a social feed). Pull from that original brief for anything not already covered above, especially:

- The **4-developer parallel work split** it laid out (e.g., one owns frontend/feed UI, one owns backend/API, one owns AI pipeline, one owns database/admin dashboard) — use this as the default team division if building with a team.
- The **day-by-day/milestone-by-milestone build order** it proposed, adapted so the social feed (not the admin dashboard) is the first thing made demoable.
- The **pitch materials** it asked for — produce a 30-second elevator pitch, a 1-minute pitch, and a 3-minute demo script/story (citizen spots an issue → reports it → AI classifies it → duplicate reports merge and priority rises → it trends on the feed via upvotes → an authority resolves it → reporter confirms) before the final demo.
- Its **"what to mock vs. what must actually work"** judgment calls — the reasoning there still applies even though the surface concept changed to a social feed.

Treat the original brief as the deeper technical reference (schema detail, anti-spam/trust reasoning, security notes) and this document as the product-shape and priority reference. Where they conflict, this document's social-feed framing wins.

---

## 20. SUGGESTED ADDITIONAL FEATURES (nice-to-have, add if time allows)

- **Comment upvotes** — let the discussion thread on an issue surface the most useful comment (e.g., someone with more detail or a photo update), not just chronological order.
- **"Similar issues near you" prompt** — when a user opens the app in a new area, surface nearby trending issues they might want to upvote, to build feed density faster in new locations.
- **Civic engagement streaks** — track a user's consecutive weeks of reporting or upvoting (a lightweight version of a habit-streak mechanic), shown on their profile as a small motivational badge, not a core feature.
- **Abuse/false-report flagging** — a simple "flag this" option on any issue or comment, feeding into the trust/anti-spam system rather than only relying on rate limits.
- **Weekly area digest** — an optional in-app summary like "3 issues resolved near you this week, 5 new ones trending" to bring lapsed users back to the feed.
- **Resolution leaderboard for departments** (admin-facing) — a friendly ranking of which departments resolve fastest, which doubles as a subtle accountability mechanism without needing to shame anyone publicly.

---

### Output instructions for the agent
Before writing any code, first produce: the architecture, database schema, API design, AI strategy, and screen-by-screen UI plan. Wait for confirmation before moving into implementation. When implementing, build in logical phases **and apply the build-and-test discipline above at every step** — never move to the next feature until the current one is verified working and existing flows are re-checked. Use a clean modular project structure, use environment variables for secrets, include error/loading/empty states throughout, and avoid unnecessary complexity — the goal is a strong, demoable MVP with a genuinely polished, social-app feel, not a feature-bloated prototype.