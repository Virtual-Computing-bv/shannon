import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA_DIR = process.env.NAHAYAT_DATA_DIR ?? '/data';
const DB_PATH = process.env.NAHAYAT_DB_PATH ?? path.join(DATA_DIR, 'portal.db');

function ensureDir(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

ensureDir();

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

// AES-256-GCM with a key derived from `NAHAYAT_ENCRYPTION_KEY` (or a stable
// per-DB key auto-generated on first launch). Used for the Anthropic API key
// in `settings`. The portal-wide value lives in `settings(key='encryption_kid')`
// so we never accidentally re-derive a different key after upgrades.
const ENC_KEY = deriveEncKey();

function deriveEncKey(): Buffer {
  const explicit = process.env.NAHAYAT_ENCRYPTION_KEY;
  if (explicit) return crypto.createHash('sha256').update(explicit).digest();
  const existing = (db
    .prepare(`SELECT value FROM settings WHERE key='encryption_kid'`)
    .get() as { value: string } | undefined)?.value;
  if (existing) return crypto.createHash('sha256').update(existing).digest();
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
