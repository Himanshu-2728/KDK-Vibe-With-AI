import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { createSchema } from "./schema.js";
import { seedIfEmpty } from "./seed.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  if (config.dbFile !== ":memory:") {
    fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
    fs.mkdirSync(config.mediaDir, { recursive: true });
  }
  db = new Database(config.dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createSchema(db);
  seedIfEmpty(db);
  return db;
}

/** Close and reopen from scratch — used by tests for isolation. */
export function resetDb(): Database.Database {
  if (db) {
    db.close();
    db = null;
  }
  return getDb();
}