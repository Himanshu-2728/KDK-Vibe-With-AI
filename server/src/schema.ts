import type Database from "better-sqlite3";

/**
 * Schema mirrors the PostgreSQL design in docs/PLAN.md (same table/column
 * shapes, TIMESTAMPTZ as ISO text, JSONB as TEXT). SQLite keeps the demo
 * zero-infra while staying portable to Postgres later.
 */
export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen','authority')),
      avatar_url    TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS departments (
      id   INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS issue_categories (
      id            INTEGER PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      color         TEXT NOT NULL,
      icon          TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id                 TEXT PRIMARY KEY,
      category_id        INTEGER NOT NULL REFERENCES issue_categories(id),
      department_id      INTEGER REFERENCES departments(id),
      status             TEXT NOT NULL DEFAULT 'reported'
        CHECK (status IN ('reported','ai_analyzed','verified','assigned','in_progress','resolved','confirmed')),
      title              TEXT NOT NULL,
      description        TEXT,
      latitude           REAL NOT NULL,
      longitude          REAL NOT NULL,
      area_name          TEXT,
      severity           TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
      priority_score     REAL NOT NULL DEFAULT 0,
      priority_breakdown TEXT,
      report_count       INTEGER NOT NULL DEFAULT 1,
      upvote_count       INTEGER NOT NULL DEFAULT 0,
      comment_count      INTEGER NOT NULL DEFAULT 0,
      ai_result          TEXT,
      first_reported_at  TEXT NOT NULL,
      last_reported_at   TEXT NOT NULL,
      resolved_at        TEXT,
      confirmed_at       TEXT,
      created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_issues_status_priority ON issues(status, priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_issues_upvotes ON issues(upvote_count DESC);
    CREATE INDEX IF NOT EXISTS idx_issues_recent ON issues(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category_id);
    CREATE INDEX IF NOT EXISTS idx_issues_geo ON issues(latitude, longitude);

    CREATE TABLE IF NOT EXISTS issue_reports (
      id            TEXT PRIMARY KEY,
      issue_id      TEXT REFERENCES issues(id) ON DELETE SET NULL,
      user_id       TEXT NOT NULL REFERENCES users(id),
      description   TEXT,
      latitude      REAL NOT NULL,
      longitude     REAL NOT NULL,
      location_name TEXT,
      ai_result     TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reports_issue ON issue_reports(issue_id);
    CREATE INDEX IF NOT EXISTS idx_reports_user ON issue_reports(user_id);

    CREATE TABLE IF NOT EXISTS issue_images (
      id          TEXT PRIMARY KEY,
      issue_id    TEXT REFERENCES issues(id) ON DELETE CASCADE,
      report_id   TEXT REFERENCES issue_reports(id) ON DELETE SET NULL,
      uploader_id TEXT NOT NULL REFERENCES users(id),
      url         TEXT NOT NULL,
      thumb_url   TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'report' CHECK (kind IN ('report','after_fix')),
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_images_issue ON issue_images(issue_id);

    CREATE TABLE IF NOT EXISTS upvotes (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issue_id   TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (user_id, issue_id)
    );
    CREATE INDEX IF NOT EXISTS idx_upvotes_issue ON upvotes(issue_id);
    CREATE INDEX IF NOT EXISTS idx_upvotes_created ON upvotes(created_at);

    CREATE TABLE IF NOT EXISTS issue_status_history (
      id         TEXT PRIMARY KEY,
      issue_id   TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status  TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id),
      note       TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_history_issue ON issue_status_history(issue_id);

    CREATE TABLE IF NOT EXISTS comments (
      id           TEXT PRIMARY KEY,
      issue_id     TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL REFERENCES users(id),
      body         TEXT NOT NULL,
      upvote_count INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id, created_at);

    CREATE TABLE IF NOT EXISTS comment_upvotes (
      id         TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      issue_id   TEXT REFERENCES issues(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

    CREATE TABLE IF NOT EXISTS resolutions (
      id               TEXT PRIMARY KEY,
      issue_id         TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      resolved_by      TEXT NOT NULL REFERENCES users(id),
      note             TEXT,
      after_photo_url  TEXT,
      resolved_at      TEXT NOT NULL,
      confirmed        INTEGER NOT NULL DEFAULT 0,
      confirmed_by     TEXT REFERENCES users(id),
      confirmed_at     TEXT,
      rejected         INTEGER NOT NULL DEFAULT 0,
      rejection_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_resolutions_issue ON resolutions(issue_id);
  `);
}