import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import path from "path";
import fs from "fs";
import os from "os";

function getDataDir(): string {
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) return path.join(xdgData, "omagent");
  return path.join(os.homedir(), ".local", "share", "omagent");
}

function getDbPath(): string {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "omagent.db");
}

let _db: ReturnType<typeof createDb> | null = null;

function createDb(dbPath?: string) {
  const sqlite = new Database(dbPath ?? getDbPath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = OFF");
  sqlite.pragma("cache_size = 10000");
  sqlite.pragma("temp_store = MEMORY");
  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export function initDb(dbPath?: string) {
  _db = createDb(dbPath);
  return _db;
}

export function initFts5(db: ReturnType<typeof createDb>) {
  const raw = (db as any).$client as InstanceType<typeof Database>;
  raw.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      id, path, scope, scope_id, type, content,
      tokenize='porter unicode61'
    );
  `);
}

export function runMigrations(db: ReturnType<typeof createDb>) {
  const raw = (db as any).$client as InstanceType<typeof Database>;
  raw.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY, worktree TEXT NOT NULL, vcs TEXT, name TEXT,
      icon_url TEXT, icon_color TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
      time_initialized INTEGER, sandboxes TEXT NOT NULL DEFAULT '[]', commands TEXT
    );
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      workspace_id TEXT, parent_id TEXT, context_from TEXT, context_watermark TEXT,
      slug TEXT NOT NULL, directory TEXT NOT NULL, title TEXT NOT NULL, version TEXT NOT NULL,
      share_url TEXT, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      summary_diffs TEXT, revert TEXT, permission TEXT, time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL, time_compacting INTEGER, time_archived INTEGER,
      last_checkpoint_message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS session_project_idx ON session(project_id);
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL DEFAULT 'main', data TEXT NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS message_session_idx ON message(session_id, time_created, id);
    CREATE TABLE IF NOT EXISTS part (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL, data TEXT NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS todo (
      session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      content TEXT NOT NULL, status TEXT NOT NULL, position INTEGER NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
      UNIQUE(session_id, position)
    );
    CREATE TABLE IF NOT EXISTS permission (
      project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
      data TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_share (
      session_id TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
      id TEXT NOT NULL, secret TEXT NOT NULL, url TEXT NOT NULL,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, scope TEXT NOT NULL, scope_id TEXT,
      type TEXT NOT NULL, content TEXT NOT NULL, hash TEXT NOT NULL, time_created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      agent_type TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'idle',
      parent_id TEXT, prompt TEXT, result TEXT, turn_count INTEGER DEFAULT 0,
      time_started INTEGER, time_completed INTEGER, last_error TEXT,
      time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      parent_task_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      description TEXT, progress_md TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
    );
  `);
  console.log("✓ Database initialized");
}
