/**
 * Spawns a Shannon scan by shelling out to the bundled `shannon` CLI. The
 * Docker socket points at the DinD sidecar (DOCKER_HOST=tcp://shannon-dind:2375)
 * so the ephemeral worker container runs inside our isolated deploy, not on
 * the swarm host.
 *
 * Output layout:
 *   /repos/<scan-id>/             — cloned source for this scan (read-only mount inside worker)
 *   /workspaces/<scan-id>/        — Shannon's session/deliverables dir
 *   /reports/<scan-id>/           — final report copied via Shannon's -o flag
 *   /logs/<scan-id>.log           — combined stdout+stderr
 */
import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';
import { db, decrypt } from './db.js';
import { decryptedAnthropicKey } from './settings.js';
import type { ScanStatus } from '../shared/types.js';

const DATA_DIR = process.env.NAHAYAT_DATA_DIR ?? '/data';
const REPOS_DIR = path.join(DATA_DIR, 'repos');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

const SHANNON_DIR = process.env.SHANNON_DIR ?? '/app';

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
  const log = (msg: string): void => {
    logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
  };

  const repoDir = path.join(REPOS_DIR, scanId);
  const reportDir = path.join(REPORTS_DIR, scanId);
  fs.mkdirSync(reportDir, { recursive: true });

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

    let configPath: string | undefined;
    if (target.config_yaml && target.config_yaml.trim().length > 0) {
      configPath = path.join(repoDir, '.nahayat-config.yaml');
      fs.writeFileSync(configPath, target.config_yaml);
    }

    setStatus(scanId, 'pre-recon');
    log(`Starting Shannon: target=${target.url} repo=${repoDir} workspace=${scanId}`);
    const args = ['start', '-u', target.url, '-r', repoDir, '-w', scanId, '-o', reportDir];
    if (configPath) args.push('-c', configPath);

    // Spawn the CLI in pipe mode so we can both write to the log file AND
    // sniff stdout for heuristic phase detection.
    const child = execa('./shannon', args, {
      cwd: SHANNON_DIR,
      env: {
        ...process.env,
        SHANNON_LOCAL: '1',
        ANTHROPIC_API_KEY: anthropicKey,
      },
    });

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
    try {
      await child;
    } catch (e) {
      const result = e as { exitCode?: number; shortMessage?: string };
      exitCode = result.exitCode ?? -1;
      errMsg = result.shortMessage ?? (e instanceof Error ? e.message : String(e));
    }

    if (exitCode === 0) {
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
    logStream.end();
  }
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
