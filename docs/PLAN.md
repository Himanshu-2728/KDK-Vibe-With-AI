# CivicPulse — Build Plan

## 1. Product Design

- **Name:** CivicPulse
- **Tagline:** *Your city's issues, surfaced by the people who live there.*
- **Problem:** Civic issues (potholes, broken streetlights, water leaks, garbage dumping) go unreported or unresolved because there's no easy, engaging way for citizens to flag them — and even when reported, the issues affecting the most people have no way to surface above the noise.
- **Solution:** A social feed where reporting is as easy as posting. Citizens upload a photo + location in seconds; the community upvotes the issues that matter; upvote count and duplicate-merge counts drive visibility, priority, and the order authorities act on.
- **Target users:** Everyday citizens (primary), local authority/municipal staff (secondary, lighter-weight desktop view).
- **Unique selling points:**
  1. **Social-feed familiarity** — reporting feels like posting, not filing paperwork.
  2. **Upvote-driven prioritization** — crowd-verified urgency replaces the black-box queue.
  3. **Automatic duplicate merging** — near-identical reports merge into one master issue so upvotes concentrate instead of splintering.
  4. **AI-assisted classification** — auto-detects issue type, severity, and duplicates, always as a suggestion the user/system can confirm or override.
- **Why this beats a complaint portal:** engagement (people actually use it), transparency (priority score components are visible on every issue), and crowd-verified priority (the most-reported problems get fixed first, provably).

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React SPA, mobile-first)                          │
│  Feed · Report flow · Issue detail · Profile · Notifications│
│  Admin dashboard (desktop-oriented)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + multipart uploads
┌──────────────────────────▼──────────────────────────────────┐
│ Backend API (Node/Express, TypeScript)                      │
│  Auth · reports · feed ranking · upvotes · comments ·       │
│  status workflow · notifications · admin actions            │
└──────────────┬──────────────────────────┬───────────────────┘
               │ calls                    │ reads/writes
┌──────────────▼───────────┐   ┌──────────▼──────────────────┐
│ AI Service (modular)     │   │ Database (SQLite for demo / │
│  classify() → type,      │   │ PostgreSQL schema target)   │
│  severity, explanation   │   │ issues, upvotes, reports,   │
│  findDuplicates() →      │   │ status history, comments,   │
│  nearby matches          │   │ notifications               │
└──────────────────────────┘   └──────────┬──────────────────┘
                                          │
                            ┌─────────────▼─────────────┐
                            │ File/Image Storage        │
                            │ (local disk in dev; S3-   │
                            │  compatible interface)    │
                            └───────────────────────────┘
```

**Layer communication:**
- Frontend talks to the API only, over REST + multipart for image uploads.
- The API runs the AI pass *inline, asynchronously* after report creation (report is created instantly, AI result arrives moments later as an "AI Analyzed" status — never blocks submission).
- Feed ranking: **Trending is computed on-read** for the MVP using a time-decayed upvote velocity query (no scheduled job needed at this scale; the formula lives in one pure function so it can be promoted to a cached/scheduled job later). Most Upvoted / Recent are simple indexed sorts. Nearest uses haversine in SQL.
- Notifications are in-app only: rows in `notifications`, fetched on load / after actions.

---

## 3. Database Schema (PostgreSQL target; SQLite-compatible for the demo)

> Schema is designed for Postgres (UUID PKs, TIMESTAMPTZ, JSONB, geospatial via lat/lng + haversine). For the local demo we run the identical shape on SQLite so the app runs with zero infra. `issues` is the merged/master record; `issue_reports` are raw individual submissions that map to it.

**users**
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| email | TEXT UNIQUE NOT NULL | |
| password_hash | TEXT NOT NULL | bcrypt |
| display_name | TEXT NOT NULL | |
| role | TEXT NOT NULL | `citizen` \| `authority` |
| avatar_url | TEXT | |
| created_at | TIMESTAMPTZ | |

**departments** — id, name (`Roads`, `Electrical`, `Water`, `Waste Management`, `Municipal`), created_at.

**issue_categories** — id, name (`Infrastructure`, `Sanitation`, `Water`, `Electrical`, `Safety`, `Environment`), department_id FK, color, icon.

**issues** (master issue)
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| category_id | FK → issue_categories | |
| status | TEXT NOT NULL | `reported → ai_analyzed → verified → assigned → in_progress → resolved → confirmed` |
| title | TEXT NOT NULL | auto-generated short label |
| description | TEXT | |
| latitude / longitude | DOUBLE PRECISION | issue anchor point |
| area_name | TEXT | neighborhood label for grouping |
| severity | TEXT | `low` \| `medium` \| `high` \| `critical` |
| priority_score | DOUBLE PRECISION | computed, see §4 |
| priority_breakdown | JSONB | component scores, stored for transparency |
| report_count | INT | distinct reporters (duplicates merged) |
| upvote_count | INT | denormalized, guarded by unique constraint |
| comment_count | INT | denormalized |
| ai_result | JSONB | { category, confidence, severity, explanation } |
| first_reported_at / last_reported_at | TIMESTAMPTZ | for velocity |
| resolved_at / confirmed_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

*Indexes:* `(status, priority_score DESC)`, `(upvote_count DESC)`, `(created_at DESC)`, `(latitude, longitude)` for range scans, `(category_id)`.

**issue_reports** (individual submissions)
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| issue_id | FK → issues (nullable until merged) | |
| user_id | FK → users | |
| description | TEXT | |
| latitude / longitude | DOUBLE PRECISION | reporter's location |
| location_name | TEXT | |
| created_at | TIMESTAMPTZ | |

*Indexes:* `(issue_id)`, `(user_id)`, `(latitude, longitude)`.

**issue_images** — id, issue_id FK (nullable pre-merge), report_id FK, uploader_id FK, url, thumb_url, kind (`report` \| `after_fix`), created_at.

**upvotes**
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | FK → users | |
| issue_id | FK → issues | |
| created_at | TIMESTAMPTZ | |

*UNIQUE(user_id, issue_id)* — the server-side "one upvote per user" guarantee. Index on `(issue_id)`.

**issue_status_history** — id, issue_id FK, from_status, to_status, changed_by FK, note, created_at. Index `(issue_id)`.

**comments** — id, issue_id FK, user_id FK, body, upvote_count, created_at. Index `(issue_id, created_at)`.

**comment_upvotes** — id, comment_id FK, user_id FK, UNIQUE(comment_id, user_id). *(nice-to-have)*

**notifications** — id, user_id FK, type, issue_id FK, body, read, created_at. Index `(user_id, read)`.

**resolutions** — id, issue_id FK, resolved_by FK, note, after_photo_url, resolved_at, confirmed (bool), confirmed_by FK, confirmed_at, rejected (bool), rejection_reason.

---

## 4. Priority / Severity Formula

```
Priority Score (0–100) =
  Base Severity (0–40)        — from AI classification (e.g. pothole 20, sinkhole 38)
+ Popularity (0–30)           — upvotes + distinct reporters, scaled & capped
+ Safety Risk (0–20)          — keyword/safety context from description + AI
+ Location Importance (0–10)  — proximity to schools/hospitals/main roads (heuristic for MVP)
− Age Decay (0–10)            — log decay on days since last activity
```

- Tiers: **LOW <25 · MEDIUM 25–49 · HIGH 50–74 · CRITICAL ≥75**
- The breakdown is stored per-issue and rendered as a transparent component breakdown on the detail page.
- Upvotes and duplicate merges visibly push the score up — that's the mechanic that makes "more upvotes = more visibility = more likely to be fixed" feel real.
- Formula lives in one pure, unit-tested function.

---

## 5. API Design (REST)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | create citizen account |
| POST | `/api/auth/login` | session cookie / token |
| GET | `/api/auth/me` | current user |
| POST | `/api/reports` | multipart: photo + description + location → creates report, kicks off AI pass + duplicate check |
| GET | `/api/feed` | `?sort=trending\|top\|recent\|nearby&category=&status=&criticalOnly=&page=&limit=&lat=&lng=` |
| POST | `/api/issues/:id/upvote` | upvote (idempotent per user, 409 on duplicate handled gracefully) |
| DELETE | `/api/issues/:id/upvote` | remove upvote |
| GET | `/api/issues/:id` | detail: photos, map pin, priority breakdown, status timeline, comments |
| POST | `/api/issues/:id/comments` | add comment |
| GET | `/api/issues/nearby` | `?lat=&lng=&radius=` for duplicate check + nearest sort |
| GET | `/api/me/reports` · `/api/me/upvotes` · `/api/me/notifications` | profile data |
| POST | `/api/notifications/:id/read` | mark read |
| *authority* | `GET /api/admin/summary` · `GET /api/admin/issues` · `GET /api/admin/analytics` | dashboard data |
| *authority* | `POST /api/admin/issues/:id/verify` · `/assign` · `/status` · `/resolve` | workflow actions (resolve accepts after-fix photo) |

**Feed endpoint example** — `GET /api/feed?sort=trending&page=1&limit=10`
```json
{
  "items": [
    {
      "id": "iss_01HX...",
      "title": "Deep pothole on Oak St",
      "category": { "name": "Infrastructure", "color": "#..." },
      "status": "verified",
      "severity": "critical",
      "priorityScore": 82,
      "upvoteCount": 47,
      "reportCount": 5,
      "commentCount": 3,
      "duplicateNote": "4 other people reported this too",
      "photo": { "url": "/media/iss_01HX/photo.jpg", "thumbUrl": "..." },
      "areaName": "Riverside",
      "distanceMeters": 412,
      "createdAt": "2026-09-01T10:12:00Z",
      "userUpvoted": true
    }
  ],
  "page": 1, "hasMore": true
}
```

**Upvote endpoint example** — `POST /api/issues/iss_01HX/upvote`
```json
// 200 OK
{ "issueId": "iss_01HX", "upvoteCount": 48, "userUpvoted": true, "priorityScore": 83, "priorityTier": "critical" }
```
Double-upvote by the same user returns 200 with unchanged count (idempotent) — enforced by the UNIQUE constraint, not just the UI.

---

## 6. AI Strategy (honest about what's real vs. mocked)

**Modular interface** — one `AiService` with two methods, so the surrounding flow never changes:
- `classify(report) → { category, confidence, severity, explanation }`
- `findDuplicates(report, nearbyIssues) → matches`

**Image classification / severity:**
- **Realistic to run:** a small pretrained classifier (e.g. MobileNet-based or ONNX) fine-tuned on an infrastructure dataset. 
- **Demo (MVP default):** a rule-based mock — combines EXIF/photo metadata heuristics, description keyword matching, and simple image signal stats (e.g. mean brightness/darkness as a "severity" proxy) to produce a plausible `{ category, confidence, severity, explanation }`. The mock returns in a realistic async shape with slight latency so the flow behaves like the real thing.
- **Never authoritative:** the AI pass sets status `ai_analyzed` and the user confirms/corrects the guess before the post is fully live (pending confirmation). Overrides are stored.

**Duplicate detection:**
1. **Geographic proximity first** (cheap, reliable): haversine within ~150 m + same/adjacent category → candidate match. 
2. **Optional secondary signal:** image pHash/embedding similarity if images are present (mocked via a hash-based similarity in the MVP).
3. On match → prompt "This looks like an issue already reported nearby — add your upvote instead?" → merge into master issue → increment `report_count` → bump priority (popularity term).

**Accuracy limitations:** classification is a suggestion with a confidence score, never final; admins can re-classify; the explanation text makes the model's reasoning inspectable.

---

## 7. Screen-by-Screen UI Plan

**Design direction:** clean typography, soft shadows, rounded cards, calm civic-trust blues/greens with a single accent color reserved for upvotes/CTAs, dark mode via CSS variables, bottom nav on mobile (Home · Map/Explore · Report · Notifications · Profile), micro-interactions on upvote (bounce + count tick) and page transitions.

**Citizen-facing (mobile-first):**
1. **Landing/onboarding** — brand, tagline, "Continue as citizen / authority", one-line value props.
2. **Auth** — login/signup (email + password).
3. **Home feed** (centerpiece) — infinite-scroll issue cards (photo, category tag, area + distance, upvote button with count, status badge, timestamp, comment count, "N people reported this too" when merged), sort/filter bar (Trending / Most Upvoted / Nearest / Recent / Category / Critical only), skeleton loaders, empty state ("No issues near you yet — be the first to report one"), error state with retry. Floating **+** FAB.
4. **Report flow** — step 1: photo (upload/capture) → step 2: location (auto-GPS or manual pin on a mini map) → step 3: short description + optional category → submit → **AI analysis confirmation step** (shows detected type, confidence, severity, explanation; confirm or correct) → duplicate prompt if a nearby match was found (offer upvote-and-merge instead) → "Submitted" confirmation.
5. **Issue detail** — full photo, description, map pin, upvote, priority score breakdown, status timeline (every stage with timestamps), comments thread, resolution card (before/after photos + "Confirm this is fixed" for reporter/community).
6. **Profile** — my reports, my upvotes, impact score, civic streak badge (nice-to-have).
7. **Notifications** — in-app list, mark-read.

**Authority-facing (desktop, information-dense):**
8. **Dashboard** — stat cards (total / pending / high-priority / resolved, avg resolution time), color-coded heatmap (red/yellow/green density, sample data acceptable early), insights phrased for decisions ("Road-related reports up 28% this month").
9. **Issue table** — filterable by category/department/status, row actions.
10. **Issue detail (admin)** — verify, override department, change status, upload after-fix photo, resolve.
11. **Analytics** — category/department trends.

---

## 8. Demo Story (the "wow" path)

> Aisha hits a deep pothole on her commute. She pulls over, taps **+**, snaps a photo — GPS pins her location automatically. She types "deep pothole, almost wrecked my wheel." CivicPulse's AI pass suggests **Pothole · Infrastructure · High severity · "Large dark cavity on asphalt, likely a deep pothole."** She confirms. The duplicate pass finds **4 nearby reports** of the same pothole within 150 m — the app asks "This looks like an issue already reported nearby — add your upvote instead?" She upvotes; the issue now shows **"5 people reported this"** and its priority jumps to **CRITICAL**. 
>
> Back on the feed, the issue is trending — upvotes rolling in with the little bounce animation, count ticking up, priority bar climbing. The municipal authority opens the admin dashboard, sees the heatmap flaring red on Oak St, verifies the report, auto-routes it to **Roads**, and marks it **In Progress**. A week later they upload an after-fix photo and mark **Resolved**. Aisha gets a notification, opens the issue, sees the new pavement, and taps **"Confirm this is fixed."** The feed shows **Confirmed**, the dashboard's resolved count ticks up, and the neighborhood gets a "3 issues resolved near you this week" digest (nice-to-have).

---

## 9. Trust & Anti-Abuse (lightweight)

- Server-side **one upvote per user per issue** (UNIQUE constraint) — UI double-taps safe.
- **Rate limit** report submissions per user (e.g. max 5/hour) and per IP.
- **Flag** (not auto-reject) suspicious patterns: many reports in a short window, no location, repeated identical images.
- Role boundaries enforced in the API (`authority` routes reject `citizen`), input validation on every write, images validated by type/size.

## 10. What Must Work vs. Can Be Mocked

**Must work for a convincing demo:** feed with real upvoting (optimistic, debounced, server-enforced), report submission with photo + location, status progression end-to-end, duplicate merge on proximity check, priority score moving with upvotes, authority verify→assign→resolve flow, in-app notifications.

**Mocked/simplified initially:** AI image classification (rule-based stand-in behind the same interface), admin heatmap (static/sample data acceptable), real map tiles (simple embedded map or static pin display), auth (bcrypt + sessions, no OAuth).

**Do not build:** anything not visible in the demo flow — no SMS/push, no real map service integration, no multi-node caching.

---

## 11. Implementation Roadmap (feed-first, build-and-test at every step)

1. **Scaffold** — monorepo, frontend shell (nav, theme, routing), backend skeleton (health endpoint, DB connection, migrations).
2. **Auth** — signup/login/me, role check. *Test: signup, login, auth-guard failures.*
3. **Feed core** — seed data, feed endpoint with all sorts/filters, infinite scroll, skeleton/empty/error states, issue cards. *Test: feed loads, each sort correct.*
4. **Upvoting** — optimistic bounce + tick, debounced write, server dedup, denormalized count. *Test: upvote persists, double-upvote safe, count exact.*
5. **Report flow** — photo upload, GPS + manual pin, description, submit. *Test: multipart submit, validation errors.*
6. **AI pass + duplicate merge** — `AiService` interface with rule-based impl, AI confirmation step, proximity duplicate check + merge + priority bump. *Test: priority formula, duplicate-match logic, merge doesn't double-count upvotes.*
7. **Issue detail** — photos, map pin, priority breakdown, status timeline, comments. *Test: detail renders history, comment add.*
8. **Status workflow + notifications** — authority actions, resolution + confirmation, in-app notifications on each transition. *Test: citizen can't call admin routes, status transitions emit notifications.*
9. **Admin dashboard** — stat cards, heatmap (sample data), issue table, verify/assign/resolve actions, analytics insights.
10. **Profile + polish** — my reports/upvotes, impact score, dark mode, animations, empty/error/loading audit.
11. **Demo pass** — re-run all known-good flows, seed a rich demo story, write the 30s/1min/3min pitches.

**Build-and-test discipline (from §18 of the brief, treated as a gate):** after every feature — run the app, exercise the new feature, re-check feed loads / upvote persists / report submits; unit tests for priority formula, duplicate logic, upvote dedup; API tests per endpoint (success + failure cases); e2e smoke test (submit → feed → upvote → count → status change on detail) re-run after every major change.