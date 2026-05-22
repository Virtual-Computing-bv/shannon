/**
 * Spawns a Shannon scan by running the worker entrypoint as an in-process
 * Node child process — no Docker, no DinD, no privileged containers.
 *
 * Architecture:
 *   - portal container bundles worker dist + chromium + claude-code CLI +
 *     playwright-cli + save-deliverable + generate-totp (see Dockerfile).
 *   - A non-privileged `temporal` swarm sidecar provides the gRPC server at
 *     TEMPORAL_ADDRESS=shannon-temporal:7233.
 *   - This module spawns `node apps/worker/dist/temporal/worker.js` directly.
 *     The worker connects to Temporal, registers itself, submits the workflow,
 *     waits for completion, exits — exactly like before, just without the
 *     `docker run` indirection.
 *
 * Output layout (unchanged):
 *   /repos/<scan-id>/             — cloned source for this scan
 *   /workspaces/<scan-id>/        — Shannon's session/deliverables dir
 *   /reports/<scan-id>/           — final report copied via --output flag
 *   /logs/<scan-id>.log           — combined stdout+stderr
 */
import { execa, type ResultPromise } from 'execa';
import fs from 'node:fs';
import path from 'node:path';
import { db, decrypt } from './db.js';
import { decryptedAnthropicKey } from './settings.js';
import type { ScanStatus } from '../shared/types.js';

/**
 * Tracks live worker child processes per scan-id so the portal can implement
 * an interactive "Stop scan" button. Entries are inserted just before the
 * worker spawns and removed on either natural completion or stopScan().
 *
 * The runner explicitly marks a scan as user-cancelled via `cancellingScans`
 * before issuing the SIGTERM, so the post-spawn exit handler in runScan()
 * writes status='cancelled' instead of status='failed'.
 */
const runningScans: Map<string, ResultPromise> = new Map();
const cancellingScans: Set<string> = new Set();

const SIGTERM_GRACE_MS = 5_000;

const ACTIVE_STATUSES: ReadonlySet<ScanStatus> = new Set<ScanStatus>([
  'pending',
  'cloning',
  'pre-recon',
  'recon',
  'analyzing',
  'exploiting',
  'reporting',
]);

const DATA_DIR = process.env.NAHAYAT_DATA_DIR ?? '/data';
const REPOS_DIR = path.join(DATA_DIR, 'repos');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

const SHANNON_DIR = process.env.SHANNON_DIR ?? '/app';
const WORKER_ENTRY = path.join(SHANNON_DIR, 'apps/worker/dist/temporal/worker.js');
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'shannon-temporal:7233';

for (const d of [REPOS_DIR, REPORTS_DIR, LOGS_DIR, WORKSPACES_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

function setStatus(scanId: string, status: ScanStatus, extra?: { error?: string; exitCode?: number }): void {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    db.prepare(
      `UPDATE scans SET status=?, finished_at=datetime('now'), error=?, exit_code=? WHERE id=?`,
    ).run(status, extra?.error ?? null, extra?.exitCode ?? null, scanId);
  } else {
    db.prepare(`UPDATE scans SET status=? WHERE id=?`).run(status, scanId);
  }
}

/**
 * Inject a Git access token into an HTTPS clone URL so we can shallow-clone
 * private GitHub/GitLab/Gitea repos without writing the secret to disk in
 * plaintext. For GitHub PATs the canonical form is
 * `https://x-access-token:<TOKEN>@github.com/org/repo.git`. We also support
 * URLs where the user already embedded credentials (we leave those alone).
 */
function injectGitToken(repoUrl: string, token: string): string {
  try {
    const u = new URL(repoUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return repoUrl;
    if (u.username || u.password) return repoUrl;
    u.username = 'x-access-token';
    u.password = token;
    return u.toString();
  } catch {
    return repoUrl;
  }
}

/**
 * Generate an 8-char hex suffix for the per-scan Temporal task queue.
 * Replaces the CLI's randomSuffix() helper — we don't import from the CLI
 * here because the CLI bundle is not in the portal's module graph.
 */
function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

export async function runScan(scanId: string, targetId: string): Promise<void> {
  const target = db.prepare(`SELECT * FROM targets WHERE id=?`).get(targetId) as
    | {
        id: string;
        url: string;
        repo_url: string;
        repo_token_enc: string | null;
        config_yaml: string | null;
      }
    | undefined;
  if (!target) {
    setStatus(scanId, 'failed', { error: 'target not found' });
    return;
  }

  const anthropicKey = decryptedAnthropicKey();
  if (!anthropicKey) {
    setStatus(scanId, 'failed', { error: 'Anthropic API key not configured — set it under Settings.' });
    return;
  }

  const logPath = path.join(LOGS_DIR, `${scanId}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  // node:child_process requires every stdio member to expose a numeric fd at
  // spawn time. createWriteStream opens lazily, so the fd is still null on the
  // microtask we'd otherwise spawn on, and Node throws ERR_INVALID_ARG_VALUE
  // before any output is written. Wait for the 'open' event so the OS fd is
  // attached before the stream is handed to execa.
  await new Promise<void>((resolve, reject) => {
    logStream.once('open', () => resolve());
    logStream.once('error', reject);
  });
  const log = (msg: string): void => {
    logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
  };

  const repoDir = path.join(REPOS_DIR, scanId);
  const reportDir = path.join(REPORTS_DIR, scanId);
  const workspaceDir = path.join(WORKSPACES_DIR, scanId);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  try {
    setStatus(scanId, 'cloning');
    let cloneUrl = target.repo_url;
    if (target.repo_token_enc) {
      try {
        const token = decrypt(target.repo_token_enc);
        cloneUrl = injectGitToken(target.repo_url, token);
      } catch {
        // Encryption key changed or row corrupted — fall back to bare URL
        // and let git fail loudly rather than half-attempting auth.
        log('WARNING: stored Git access token could not be decrypted, cloning without auth');
      }
    }
    // Never log the token-embedded URL.
    log(`Cloning ${target.repo_url} → ${repoDir}`);
    await execa('git', ['clone', '--depth=1', cloneUrl, repoDir], {
      stdout: logStream,
      stderr: logStream,
    });

    // Pre-create overlay mount points so the worker's path-resolution logic
    // (which expects .shannon/* dirs inside the cloned repo) doesn't trip.
    const shannonRepoDir = path.join(repoDir, '.shannon');
    for (const sub of ['deliverables', 'scratchpad', '.playwright-cli']) {
      fs.mkdirSync(path.join(shannonRepoDir, sub), { recursive: true });
    }
    fs.mkdirSync(path.join(repoDir, '.playwright'), { recursive: true });

    let configPath: string | undefined;
    if (target.config_yaml && target.config_yaml.trim().length > 0) {
      configPath = path.join(repoDir, '.nahayat-config.yaml');
      fs.writeFileSync(configPath, target.config_yaml);
    }

    setStatus(scanId, 'pre-recon');
    log(`Starting Shannon worker (in-process): target=${target.url} repo=${repoDir} workspace=${scanId}`);

    // The worker entry's CWD must contain ./workspaces because all of its
    // session.json paths are computed relative to that. Stage a symlink so
    // the worker writes into our /data/workspaces (NFS-backed) tree.
    const workspacesLinkParent = path.join(SHANNON_DIR);
    const workspacesLink = path.join(workspacesLinkParent, 'workspaces');
    try {
      const stat = fs.lstatSync(workspacesLink);
      if (!stat.isSymbolicLink()) {
        // pre-existing real directory (from the worker image build); replace.
        fs.rmSync(workspacesLink, { recursive: true, force: true });
        fs.symlinkSync(WORKSPACES_DIR, workspacesLink, 'dir');
      }
    } catch {
      fs.symlinkSync(WORKSPACES_DIR, workspacesLink, 'dir');
    }

    const taskQueue = `shannon-${randomSuffix()}`;
    const args = [
      WORKER_ENTRY,
      target.url,
      repoDir,
      '--task-queue',
      taskQueue,
      '--workspace',
      scanId,
      '--output',
      reportDir,
    ];
    if (configPath) {
      args.push('--config', configPath);
    }

    const child = execa('node', args, {
      cwd: SHANNON_DIR,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: anthropicKey,
        TEMPORAL_ADDRESS,
        // The worker's claude-executor relies on the `claude` CLI being on
        // PATH (installed globally via npm in the Dockerfile). PATH inherited
        // from the parent process; nothing to do here. Same for playwright-cli.
        SHANNON_DOCKER: 'true',
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      },
    });

    // Register the child so the stop-scan endpoint can SIGTERM it. We do this
    // *after* execa() returns (so .pid is bound) but before awaiting the
    // promise — otherwise stopScan would have nothing to kill.
    runningScans.set(scanId, child);

    child.stdout?.on('data', (buf: Buffer) => {
      const txt = buf.toString();
      logStream.write(txt);
      if (txt.includes('-exploit')) setStatus(scanId, 'exploiting');
      else if (txt.includes('-vuln')) setStatus(scanId, 'analyzing');
      else if (txt.includes('reporting')) setStatus(scanId, 'reporting');
      else if (txt.includes('recon') && !txt.includes('pre-recon')) setStatus(scanId, 'recon');
    });
    child.stderr?.on('data', (buf: Buffer) => {
      logStream.write(buf);
    });

    let exitCode = 0;
    let errMsg: string | undefined;
    let killedBySignal: string | undefined;
    try {
      await child;
    } catch (e) {
      const result = e as { exitCode?: number; shortMessage?: string; signal?: string; isCanceled?: boolean };
      exitCode = result.exitCode ?? -1;
      errMsg = result.shortMessage ?? (e instanceof Error ? e.message : String(e));
      killedBySignal = result.signal;
    } finally {
      runningScans.delete(scanId);
    }

    const wasCancelled = cancellingScans.delete(scanId);
    if (wasCancelled || killedBySignal === 'SIGTERM' || killedBySignal === 'SIGKILL') {
      setStatus(scanId, 'cancelled', { exitCode, error: 'cancelled by user' });
      log(`Scan cancelled by user (signal=${killedBySignal ?? 'n/a'}, exit=${exitCode}).`);
    } else if (exitCode === 0) {
      setStatus(scanId, 'completed', { exitCode: 0 });
      log(`Scan completed.`);
    } else {
      setStatus(scanId, 'failed', { exitCode, error: errMsg ?? 'unknown error' });
      log(`Scan failed (exit ${exitCode}): ${errMsg ?? 'unknown'}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(scanId, 'failed', { error: msg });
    log(`Scan crashed: ${msg}`);
  } finally {
    runningScans.delete(scanId);
    cancellingScans.delete(scanId);
    logStream.end();
  }
}

/**
 * Best-effort graceful stop of a running scan. Returns the resulting scan
 * status so the route handler can echo it back to the UI. Idempotent —
 * repeated calls on the same scan-id (or on an already-finished scan) just
 * return the current DB state.
 */
export async function stopScan(scanId: string): Promise<{
  stopped: boolean;
  status: ScanStatus;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
}> {
  const current = currentScanState(scanId);
  if (!current) {
    return { stopped: false, status: 'failed', finishedAt: null, exitCode: null, error: 'scan not found' };
  }
  if (!ACTIVE_STATUSES.has(current.status)) {
    // Already terminal — nothing to kill, just echo state.
    return { stopped: false, ...current };
  }

  const child = runningScans.get(scanId);
  if (!child || child.exitCode !== null) {
    // The DB still says "running" but our in-memory handle is gone (process
    // crashed without the exit-handler running, or this portal instance was
    // restarted mid-scan). Mark the row cancelled so the UI doesn't get
    // stuck on a phantom "running" forever.
    runningScans.delete(scanId);
    setStatus(scanId, 'cancelled', { error: 'cancelled by user (worker process gone)' });
    return { stopped: true, ...currentScanState(scanId)! };
  }

  cancellingScans.add(scanId);
  try {
    child.kill('SIGTERM');
  } catch {
    // process already gone — fall through to await/SIGKILL path
  }

  // Give the worker SIGTERM_GRACE_MS to flush deliverables + close Temporal
  // connections, then escalate. The runScan() exit handler is the one that
  // actually writes status='cancelled', so we just need to make sure the
  // child eventually dies.
  const killTimer = setTimeout(() => {
    if (runningScans.has(scanId) && child.exitCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already dead */
      }
    }
  }, SIGTERM_GRACE_MS);

  try {
    await child.catch(() => undefined);
  } finally {
    clearTimeout(killTimer);
  }

  return { stopped: true, ...currentScanState(scanId)! };
}

function currentScanState(scanId: string): {
  status: ScanStatus;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
} | null {
  const row = db
    .prepare(`SELECT status, finished_at, exit_code, error FROM scans WHERE id=?`)
    .get(scanId) as
    | { status: ScanStatus; finished_at: string | null; exit_code: number | null; error: string | null }
    | undefined;
  if (!row) return null;
  return {
    status: row.status,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    error: row.error,
  };
}

export function reportPath(scanId: string): string | null {
  const dir = path.join(REPORTS_DIR, scanId);
  if (!fs.existsSync(dir)) return null;
  // Shannon writes a final .md into the output dir. Pick the most recent one.
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0] ? path.join(dir, files[0].f) : null;
}

export function logTail(scanId: string, lines = 200): string {
  const p = path.join(LOGS_DIR, `${scanId}.log`);
  if (!fs.existsSync(p)) return '';
  const all = fs.readFileSync(p, 'utf8').split('\n');
  return all.slice(-lines).join('\n');
}
