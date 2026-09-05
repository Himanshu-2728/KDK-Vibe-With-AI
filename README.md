# ⚡ CivicPulse

**Your city's issues, surfaced by the people who live there.**

A social-media-style web app for reporting and tracking civic issues — potholes, broken
streetlights, garbage dumping, water leaks, fallen trees. Reporting feels like posting,
community upvotes surface what matters, near-identical reports merge automatically so
upvotes concentrate instead of splintering, and a transparent priority score decides what
the city works on first.

Full product/technical design: [`docs/PLAN.md`](docs/PLAN.md).

---

## Quick start

```bash
npm install        # installs server + web workspaces
npm run dev        # starts API (:3001) and web (:5173) together
```

Open **http://localhost:5173**.

The API seeds a small neighborhood demo on first boot (SQLite file at `server/data/`).
To reset to a pristine demo story: stop the servers and delete `server/data`, then restart.

### Demo logins (password: `demo1234`)

| Account | Role | What you'll see |
|---|---|---|
| `aisha@example.com` | Citizen | A reported issue merged with 4 neighbors, now **CRITICAL** and trending |
| `tom@city.gov` | Authority | The admin command center: stats, heatmap, queue, analytics |

The auth page has one-tap buttons for both. You can also sign up your own citizen account.

### The demo story in one minute

1. Open the feed — **“Deep pothole on Oak St”** is trending with 52 upvotes, shows
   *“4 other people reported this too”*, and carries a **CRITICAL** priority badge.
2. Open it — see the transparent priority breakdown (severity + popularity + safety +
   location − age), the full status timeline, and the discussion.
3. Tap **+** to report your own issue: snap/upload a photo, use your location (or pick
   “Oak St, Riverside”), describe it, submit.
4. The **AI step** suggests a type and severity with confidence — confirm, or correct it.
5. If you report near the pothole, CivicPulse says *“this looks like an existing report —
   add your upvote instead?”* and merges you in (watch `reportCount` and priority climb).
6. Log in as **Tom** (authority) → **Command center**: verify the report, assign a
   department, mark it in progress, then **resolve** with an after-photo.
7. Back as Aisha: a notification arrives, open the issue and **confirm the fix** —
   status flips to Confirmed and the dashboard's resolved count ticks up.

## What actually works vs. what's mocked

**Works for real:** feed with all sorts (trending / most upvoted / recent / nearest) and
filters; one-upvote-per-user enforced by a DB unique constraint; optimistic animated
upvoting; photo + GPS/area reporting; AI-analyzed status with user confirm/correct; duplicate
detection (proximity first, text similarity second) with merge + priority bump; issue detail
with priority breakdown, status timeline, comments, resolution confirm/reject; role-separated
authority workflow (verify → assign → in progress → resolve → confirmed) with in-app
notifications; admin dashboard, heatmap, queue table and analytics insights.

**Desktop app layout:** above phone width the citizen app becomes a three-column desktop
shell — fixed sidebar (home, alerts, report button, profile) plus a right rail with your
location controls and trending issues — and the feed renders as a two-column card grid.
The admin command center expands to a full-width dashboard.

**Mocked/simplified (by design for the demo):** the AI classifier is a transparent rule-based
stand-in behind a clean `AiService` interface — but it genuinely decodes uploaded JPEG/PNG
photos (darkness, pavement/water/vegetation color ratios) and cites that evidence in its
suggestion, which you confirm or correct; the heatmap is a clickable SVG of the seeded
neighborhood (area clusters + per-issue pins, drill into an area's queue); geolocation
falls back to a pin-map picker with GPS status messaging; notifications are in-app only.

## Tests & verification

```bash
npm run typecheck   # tsc on server + web
npm test            # 50 API + unit tests (priority formula, image-aware AI, duplicates, upvotes, workflow, area filters)
npm run build       # production web build
npm run smoke       # real-browser E2E (needs `npm run dev` running + Chrome)
```

`npm run smoke` drives headless Chrome through the critical path: feed loads (desktop shell
renders) → upvote click increments the count → issue detail renders breakdown/timeline/
comments/AI evidence → the full report wizard with a real uploaded photo: pin-map location,
AI review, duplicate merge prompt, merge success → admin dashboard with clickable heatmap
(area drill-down) and filtered queue — with a console-error check on every page.

## Architecture

```
web/   React + Vite SPA (mobile-first citizen app + desktop admin)
server/ Express + TypeScript API, better-sqlite3 (Postgres-shaped schema)
  ├── services/priority.ts      pure, unit-tested priority formula
  ├── services/ai.ts            AiService interface + rule-based impl
  ├── services/duplicates.ts    proximity + text duplicate matching
  └── routes/                   auth · feed · issues · reports · me · admin · notifications
docs/PLAN.md                    schema, API design, roadmap
```

## Project structure

```
web/src/
  pages/         Feed · Report · IssueDetail · Profile · Notifications · Landing · Auth · Admin*
  components/    IssueCard · UpvoteButton · badges · Heatmap …
  lib/           api client · types · formatting · area presets
  theme.css      design system (light/dark)
server/src/
  routes/        REST endpoints
  services/      priority · ai · duplicates · issues · notifications · geo
  seed.ts        the demo neighborhood + story
  schema.ts      tables: users, issues, issue_reports, upvotes, comments,
                 issue_status_history, notifications, resolutions, …
```
