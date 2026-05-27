import express, { type Router as ExpressRouter } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db, encrypt } from './db.js';
import {
  createScopeRule,
  deleteScopeRule,
  listScopeRules,
  markAdminInitialized,
  publicSettings,
  setAnthropicKey,
  setExploitModuleEnabled,
  setScopeDefaultPolicy,
} from './settings.js';
import { logTail, reportPath, runScan, stopScan } from './runner.js';
import type {
  NetworkIntensity,
  Scan,
  ScanWithTarget,
  ScopeRulePolicy,
  Target,
  TargetKind,
} from '../shared/types.js';

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
  scopeDefaultPolicy: z.enum(['allow', 'deny']).optional(),
  exploitModuleEnabled: z.boolean().optional(),
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
  if (parsed.data.scopeDefaultPolicy !== undefined) {
    setScopeDefaultPolicy(parsed.data.scopeDefaultPolicy);
  }
  if (parsed.data.exploitModuleEnabled !== undefined) {
    setExploitModuleEnabled(parsed.data.exploitModuleEnabled);
  }
  res.json(publicSettings());
});

// ── Targets ──
const WebappTargetBody = z.object({
  kind: z.literal('webapp'),
  name: z.string().min(1).max(64),
  url: z.string().url(),
  repoSource: z.enum(['github-url', 'local-path']).default('github-url'),
  repoUrl: z.string().min(1),
  /**
   * Optional GitHub/Git PAT used to clone private repos. Never echoed back to
   * clients. Empty string → clear stored token; undefined → leave as-is.
   */
  repoToken: z.string().nullable().optional(),
  configYaml: z.string().nullable().optional(),
});

const NetworkTargetBody = z.object({
  kind: z.literal('network'),
  name: z.string().min(1).max(64),
  /** Primary host string used for labelling. IP, CIDR, or hostname. */
  url: z.string().min(1),
  hosts: z.array(z.string().min(1)).min(1),
  scopeLabel: z.string().min(1).max(120),
  intensity: z.enum(['recon', 'enum', 'exploit']),
  configYaml: z.string().nullable().optional(),
});

const TargetBody = z.discriminatedUnion('kind', [WebappTargetBody, NetworkTargetBody]);

const TargetPatchBody = z.object({
  name: z.string().min(1).max(64).optional(),
  url: z.string().min(1).optional(),
  repoSource: z.enum(['github-url', 'local-path']).optional(),
  repoUrl: z.string().min(1).optional(),
  repoToken: z.string().nullable().optional(),
  configYaml: z.string().nullable().optional(),
  hosts: z.array(z.string().min(1)).min(1).optional(),
  scopeLabel: z.string().min(1).max(120).optional(),
  intensity: z.enum(['recon', 'enum', 'exploit']).optional(),
});

interface TargetRow {
  id: string;
  name: string;
  url: string;
  kind: TargetKind;
  repo_source: 'github-url' | 'local-path';
  repo_url: string;
  repo_token_enc: string | null;
  hosts_json: string | null;
  scope_label: string | null;
  intensity: NetworkIntensity | null;
  config_yaml: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTarget(r: TargetRow): Target {
  const base = {
    id: r.id,
    name: r.name,
    url: r.url,
    kind: r.kind,
    configYaml: r.config_yaml,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (r.kind === 'network') {
    return {
      ...base,
      webapp: null,
      network: {
        hosts: r.hosts_json ? (JSON.parse(r.hosts_json) as string[]) : [],
        scopeLabel: r.scope_label ?? '',
        intensity: r.intensity ?? 'recon',
      },
    };
  }
  return {
    ...base,
    webapp: {
      repoSource: r.repo_source,
      repoUrl: r.repo_url,
      repoTokenSet: !!r.repo_token_enc,
    },
    network: null,
  };
}

router.get('/targets', requireAuth, (_req, res) => {
  const rows = db.prepare(`SELECT * FROM targets ORDER BY created_at DESC`).all() as unknown as TargetRow[];
  res.json({ data: rows.map(rowToTarget) });
});

router.post('/targets', requireAuth, (req, res) => {
  const parsed = TargetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid', issues: parsed.error.issues });
    return;
  }
  const id = crypto.randomUUID();
  if (parsed.data.kind === 'network') {
    db.prepare(
      `INSERT INTO targets (id, name, url, kind, repo_url, hosts_json, scope_label, intensity, config_yaml)
       VALUES (?, ?, ?, 'network', '', ?, ?, ?, ?)`,
    ).run(
      id,
      parsed.data.name,
      parsed.data.url,
      JSON.stringify(parsed.data.hosts),
      parsed.data.scopeLabel,
      parsed.data.intensity,
      parsed.data.configYaml ?? null,
    );
  } else {
    const tokenPlain = parsed.data.repoToken?.trim();
    const tokenEnc = tokenPlain ? encrypt(tokenPlain) : null;
    db.prepare(
      `INSERT INTO targets (id, name, url, kind, repo_source, repo_url, repo_token_enc, config_yaml)
       VALUES (?, ?, ?, 'webapp', ?, ?, ?, ?)`,
    ).run(
      id,
      parsed.data.name,
      parsed.data.url,
      parsed.data.repoSource,
      parsed.data.repoUrl,
      tokenEnc,
      parsed.data.configYaml ?? null,
    );
  }
  res.json({ id });
});

router.put('/targets/:id', requireAuth, (req, res) => {
  const parsed = TargetPatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid' });
    return;
  }
  const fields = parsed.data;
  // node:sqlite is stricter about parameter types than better-sqlite3 —
  // bound values must be string|number|null|bigint|Uint8Array. Coerce up
  // front so the typed array satisfies SQLInputValue without TS narrowing
  // gymnastics at every push site.
  const sets: string[] = [];
  const vals: Array<string | number | null> = [];
  if (fields.name !== undefined) { sets.push('name=?'); vals.push(fields.name); }
  if (fields.url !== undefined) { sets.push('url=?'); vals.push(fields.url); }
  if (fields.repoUrl !== undefined) { sets.push('repo_url=?'); vals.push(fields.repoUrl); }
  if (fields.repoSource !== undefined) { sets.push('repo_source=?'); vals.push(fields.repoSource); }
  // repoToken === null  → clear stored token
  // repoToken === ''    → no change (form leaves blank when keeping existing)
  // repoToken === '...' → encrypt + replace
  if (fields.repoToken === null) {
    sets.push('repo_token_enc=?');
    vals.push(null);
  } else if (typeof fields.repoToken === 'string' && fields.repoToken.trim() !== '') {
    sets.push('repo_token_enc=?');
    vals.push(encrypt(fields.repoToken.trim()));
  }
  if (fields.configYaml !== undefined) { sets.push('config_yaml=?'); vals.push(fields.configYaml); }
  if (fields.hosts !== undefined) { sets.push('hosts_json=?'); vals.push(JSON.stringify(fields.hosts)); }
  if (fields.scopeLabel !== undefined) { sets.push('scope_label=?'); vals.push(fields.scopeLabel); }
  if (fields.intensity !== undefined) { sets.push('intensity=?'); vals.push(fields.intensity); }
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
      `SELECT s.*, t.name AS t_name, t.url AS t_url, t.kind AS t_kind FROM scans s
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
      t_kind: TargetKind;
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
    target: { id: r.target_id, name: r.t_name, url: r.t_url, kind: r.t_kind },
  }));
  res.json({ data: scans });
});

router.get('/scans/:id/logs', requireAuth, (req, res) => {
  res.type('text/plain').send(logTail(req.params.id));
});

// Stop a running scan. Sends SIGTERM to the in-process worker child, then
// SIGKILL after a 5s grace window. Idempotent — a stop call on an already
// terminal scan is a noop that just echoes the current state.
router.post('/scans/:id/stop', requireAuth, async (req, res) => {
  try {
    const result = await stopScan(req.params.id);
    if (result.status === 'failed' && result.error === 'scan not found') {
      res.status(404).json({ error: 'scan not found' });
      return;
    }
    res.json({
      id: req.params.id,
      stopped: result.stopped,
      status: result.status,
      finishedAt: result.finishedAt,
      exitCode: result.exitCode,
      error: result.error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
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

// ── Scope rules ──
// Used by the Settings UI scope editor. A rule with target_id=null is global
// (default-deny applies to every network target); a rule scoped to a target
// is checked first and overrides the global default for that target. cidr
// and hostname_glob are mutually exclusive — exactly one is set per rule.
const ScopeRuleBody = z
  .object({
    targetId: z.string().nullable().optional(),
    policy: z.enum(['allow', 'deny']),
    cidr: z.string().min(1).nullable().optional(),
    hostnameGlob: z.string().min(1).nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .refine((b) => Boolean(b.cidr) !== Boolean(b.hostnameGlob), {
    message: 'exactly one of cidr or hostnameGlob must be set',
  });

router.get('/scope-rules', requireAuth, (req, res) => {
  const targetIdParam = typeof req.query.targetId === 'string' ? req.query.targetId : undefined;
  // 'null' literal in query string → global rules only. Absent → all rules.
  if (targetIdParam === 'null') {
    res.json({ data: listScopeRules(null) });
    return;
  }
  if (targetIdParam !== undefined) {
    res.json({ data: listScopeRules(targetIdParam) });
    return;
  }
  res.json({ data: listScopeRules() });
});

router.post('/scope-rules', requireAuth, (req, res) => {
  const parsed = ScopeRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid', issues: parsed.error.issues });
    return;
  }
  const rule = createScopeRule({
    targetId: parsed.data.targetId ?? null,
    policy: parsed.data.policy as ScopeRulePolicy,
    cidr: parsed.data.cidr ?? null,
    hostnameGlob: parsed.data.hostnameGlob ?? null,
    note: parsed.data.note ?? null,
  });
  res.json({ data: rule });
});

router.delete('/scope-rules/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  const ok = deleteScopeRule(id);
  if (!ok) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ ok: true });
});
