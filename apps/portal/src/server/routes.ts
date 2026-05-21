import express, { type Router as ExpressRouter } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db } from './db.js';
import { markAdminInitialized, publicSettings, setAnthropicKey } from './settings.js';
import { logTail, reportPath, runScan } from './runner.js';
import type { Scan, ScanWithTarget, Target } from '../shared/types.js';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
  }
}

export const router: ExpressRouter = express.Router();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

// ── Bootstrap ──
router.get('/bootstrap', (req, res) => {
  const userCount = (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
  res.json({
    needsSetup: userCount === 0,
    authenticated: !!req.session?.userId,
    settings: publicSettings(),
  });
});

const SetupBody = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
});
router.post('/setup', async (req, res) => {
  const userCount = (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
  if (userCount > 0) {
    res.status(409).json({ error: 'already initialized' });
    return;
  }
  const parsed = SetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid', issues: parsed.error.issues });
    return;
  }
  const hash = await bcrypt.hash(parsed.data.password, 12);
  const info = db
    .prepare(`INSERT INTO users (username, password_hash) VALUES (?, ?)`)
    .run(parsed.data.username, hash);
  markAdminInitialized();
  req.session.userId = Number(info.lastInsertRowid);
  req.session.username = parsed.data.username;
  res.json({ ok: true });
});

// ── Auth ──
const LoginBody = z.object({
  username: z.string(),
  password: z.string(),
});
router.post('/login', async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid' });
    return;
  }
  const row = db
    .prepare(`SELECT id, password_hash FROM users WHERE username=?`)
    .get(parsed.data.username) as { id: number; password_hash: string } | undefined;
  if (!row || !(await bcrypt.compare(parsed.data.password, row.password_hash))) {
    res.status(401).json({ error: 'bad credentials' });
    return;
  }
  req.session.userId = row.id;
  req.session.username = parsed.data.username;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Settings ──
router.get('/settings', requireAuth, (_req, res) => {
  res.json(publicSettings());
});

const SettingsBody = z.object({
  anthropicApiKey: z.string().nullable().optional(),
});
router.put('/settings', requireAuth, (req, res) => {
  const parsed = SettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid' });
    return;
  }
  if (parsed.data.anthropicApiKey !== undefined) {
    setAnthropicKey(parsed.data.anthropicApiKey);
  }
  res.json(publicSettings());
});

// ── Targets ──
const TargetBody = z.object({
  name: z.string().min(1).max(64),
  url: z.string().url(),
  repoSource: z.enum(['github-url', 'local-path']).default('github-url'),
  repoUrl: z.string().min(1),
  configYaml: z.string().nullable().optional(),
});

router.get('/targets', requireAuth, (_req, res) => {
  const rows = db.prepare(`SELECT * FROM targets ORDER BY created_at DESC`).all() as Array<{
    id: string;
    name: string;
    url: string;
    repo_source: 'github-url' | 'local-path';
    repo_url: string;
    config_yaml: string | null;
    created_at: string;
    updated_at: string;
  }>;
  const targets: Target[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    repoSource: r.repo_source,
    repoUrl: r.repo_url,
    configYaml: r.config_yaml,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  res.json({ data: targets });
});

router.post('/targets', requireAuth, (req, res) => {
  const parsed = TargetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid', issues: parsed.error.issues });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO targets (id, name, url, repo_source, repo_url, config_yaml)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    parsed.data.name,
    parsed.data.url,
    parsed.data.repoSource,
    parsed.data.repoUrl,
    parsed.data.configYaml ?? null,
  );
  res.json({ id });
});

router.put('/targets/:id', requireAuth, (req, res) => {
  const parsed = TargetBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid' });
    return;
  }
  const fields = parsed.data;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.name !== undefined) { sets.push('name=?'); vals.push(fields.name); }
  if (fields.url !== undefined) { sets.push('url=?'); vals.push(fields.url); }
  if (fields.repoUrl !== undefined) { sets.push('repo_url=?'); vals.push(fields.repoUrl); }
  if (fields.repoSource !== undefined) { sets.push('repo_source=?'); vals.push(fields.repoSource); }
  if (fields.configYaml !== undefined) { sets.push('config_yaml=?'); vals.push(fields.configYaml); }
  if (sets.length === 0) {
    res.json({ ok: true });
    return;
  }
  sets.push(`updated_at=datetime('now')`);
  vals.push(req.params.id);
  db.prepare(`UPDATE targets SET ${sets.join(', ')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

router.delete('/targets/:id', requireAuth, (req, res) => {
  db.prepare(`DELETE FROM targets WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ── Scans ──
router.post('/scans', requireAuth, (req, res) => {
  const body = z.object({ targetId: z.string() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid' });
    return;
  }
  const target = db
    .prepare(`SELECT id FROM targets WHERE id=?`)
    .get(body.data.targetId) as { id: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'target not found' });
    return;
  }
  const id = crypto.randomUUID();
  const workspace = id;
  db.prepare(
    `INSERT INTO scans (id, target_id, status, workspace) VALUES (?, ?, 'pending', ?)`,
  ).run(id, body.data.targetId, workspace);

  // Fire-and-forget. The runner updates status as it progresses.
  void runScan(id, body.data.targetId).catch((err) => {
    console.error('[runScan]', err);
  });

  res.json({ id });
});

router.get('/scans', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, t.name AS t_name, t.url AS t_url FROM scans s
       JOIN targets t ON t.id = s.target_id
       ORDER BY s.started_at DESC
       LIMIT 200`,
    )
    .all() as Array<{
      id: string;
      target_id: string;
      status: Scan['status'];
      workspace: string;
      started_at: string;
      finished_at: string | null;
      exit_code: number | null;
      error: string | null;
      t_name: string;
      t_url: string;
    }>;
  const scans: ScanWithTarget[] = rows.map((r) => ({
    id: r.id,
    targetId: r.target_id,
    status: r.status,
    workspace: r.workspace,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    exitCode: r.exit_code,
    error: r.error,
    target: { id: r.target_id, name: r.t_name, url: r.t_url },
  }));
  res.json({ data: scans });
});

router.get('/scans/:id/logs', requireAuth, (req, res) => {
  res.type('text/plain').send(logTail(req.params.id));
});

router.get('/scans/:id/report', requireAuth, (req, res) => {
  const p = reportPath(req.params.id);
  if (!p) {
    res.status(404).json({ error: 'no report yet' });
    return;
  }
  res.type('text/markdown').send(fs.readFileSync(p, 'utf8'));
});

router.get('/scans/:id/report/download', requireAuth, (req, res) => {
  const p = reportPath(req.params.id);
  if (!p) {
    res.status(404).send('no report');
    return;
  }
  res.download(p, `nahayat-pentest-${req.params.id}-${path.basename(p)}`);
});
