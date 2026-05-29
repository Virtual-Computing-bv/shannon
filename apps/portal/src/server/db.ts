import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = process.env.NAHAYAT_DATA_DIR ?? '/data';
const DB_PATH = process.env.NAHAYAT_DB_PATH ?? path.join(DATA_DIR, 'portal.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Node 22.5+ ships node:sqlite as an experimental built-in — no native
// binding to compile, no musl/glibc differences, no pnpm install-script
// dances. The API mirrors better-sqlite3 closely enough that the rest of
// the code is unchanged.
export const db: DatabaseSync = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS targets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'webapp',
    repo_source TEXT NOT NULL DEFAULT 'github-url',
    repo_url TEXT NOT NULL DEFAULT '',
    repo_token_enc TEXT,
    hosts_json TEXT,
    scope_label TEXT,
    intensity TEXT,
    config_yaml TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    workspace TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    exit_code INTEGER,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS scans_target_idx ON scans (target_id);
  CREATE INDEX IF NOT EXISTS scans_status_idx ON scans (status);

  CREATE TABLE IF NOT EXISTS scope_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT REFERENCES targets(id) ON DELETE CASCADE,
    policy TEXT NOT NULL CHECK (policy IN ('allow','deny')),
    cidr TEXT,
    hostname_glob TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
      (cidr IS NOT NULL AND hostname_glob IS NULL) OR
      (cidr IS NULL AND hostname_glob IS NOT NULL)
    )
  );
  CREATE INDEX IF NOT EXISTS scope_rules_target_idx ON scope_rules (target_id);
`);

// Idempotent ADD COLUMN migrations. node:sqlite has no IF NOT EXISTS for
// ADD COLUMN, so we probe pragma_table_info per column. Keep this list
// ordered chronologically — older entries first — so the table evolves
// the same way on every install.
function hasColumn(table: string, column: string): boolean {
  const row = db.prepare(`SELECT 1 AS n FROM pragma_table_info(?) WHERE name=?`).get(table, column) as
    | { n: number }
    | undefined;
  return row?.n === 1;
}
if (!hasColumn('targets', 'repo_token_enc')) {
  db.exec(`ALTER TABLE targets ADD COLUMN repo_token_enc TEXT`);
}
if (!hasColumn('targets', 'kind')) {
  db.exec(`ALTER TABLE targets ADD COLUMN kind TEXT NOT NULL DEFAULT 'webapp'`);
}
if (!hasColumn('targets', 'hosts_json')) {
  db.exec(`ALTER TABLE targets ADD COLUMN hosts_json TEXT`);
}
if (!hasColumn('targets', 'scope_label')) {
  db.exec(`ALTER TABLE targets ADD COLUMN scope_label TEXT`);
}
if (!hasColumn('targets', 'intensity')) {
  db.exec(`ALTER TABLE targets ADD COLUMN intensity TEXT`);
}

// AES-256-GCM with a key derived from $NAHAYAT_ENCRYPTION_KEY (or a stable
// per-DB key auto-generated on first launch). Used for the Anthropic API
// key in `settings`.
const ENC_KEY = deriveEncKey();

function deriveEncKey(): Buffer {
  const explicit = process.env.NAHAYAT_ENCRYPTION_KEY;
  if (explicit) return crypto.createHash('sha256').update(explicit).digest();
  const row = db.prepare(`SELECT value FROM settings WHERE key='encryption_kid'`).get() as
    | { value: string }
    | undefined;
  if (row?.value) return crypto.createHash('sha256').update(row.value).digest();
  const fresh = crypto.randomBytes(48).toString('base64');
  db.prepare(`INSERT INTO settings (key, value) VALUES ('encryption_kid', ?)`).run(fresh);
  return crypto.createHash('sha256').update(fresh).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(stored: string): string {
  const [ivB64, tagB64, encB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !encB64) throw new Error('encrypted value malformed');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function getSetting(key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(key, value);
}
