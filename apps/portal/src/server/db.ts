import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

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
    repo_source TEXT NOT NULL DEFAULT 'github-url',
    repo_url TEXT NOT NULL,
    repo_token_enc TEXT,
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
`);

// Idempotent migration for DBs created before the encrypted PAT column existed.
// node:sqlite has no IF NOT EXISTS for ADD COLUMN, so we probe pragma_table_info.
const hasRepoToken = (
  db
    .prepare(`SELECT 1 AS n FROM pragma_table_info('targets') WHERE name='repo_token_enc'`)
    .get() as { n: number } | undefined
)?.n === 1;
if (!hasRepoToken) {
  db.exec(`ALTER TABLE targets ADD COLUMN repo_token_enc TEXT`);
}

// AES-256-GCM with a key derived from $NAHAYAT_ENCRYPTION_KEY (or a stable
// per-DB key auto-generated on first launch). Used for the Anthropic API
// key in `settings`.
const ENC_KEY = deriveEncKey();

function deriveEncKey(): Buffer {
  const explicit = process.env.NAHAYAT_ENCRYPTION_KEY;
  if (explicit) return crypto.createHash('sha256').update(explicit).digest();
  const row = db
    .prepare(`SELECT value FROM settings WHERE key='encryption_kid'`)
    .get() as { value: string } | undefined;
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
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(key, value);
}
