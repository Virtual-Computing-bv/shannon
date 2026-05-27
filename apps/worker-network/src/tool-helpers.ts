/**
 * Shared helpers for tool implementations: scope-guard, audit logging,
 * safe subprocess invocation, output truncation.
 */

import fs from 'node:fs';
import { execa } from 'execa';
import type { RunContext } from './types.js';

const MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export class ScopeViolation extends Error {
  constructor(public readonly host: string) {
    super(`scope-violation: tool refused host '${host}' which is not on the scope allowlist`);
    this.name = 'ScopeViolation';
  }
}

/**
 * Throws ScopeViolation if any of `hosts` is not present in
 * `ctx.allowedHosts`. We compare on the exact raw string the operator
 * configured — the scope-gate already resolved + checked them; here we
 * just enforce that Claude cannot expand the target set on its own.
 */
export function assertHostsAllowed(hosts: string[], ctx: RunContext): void {
  const allowed = new Set(ctx.allowedHosts);
  for (const h of hosts) {
    if (!allowed.has(h)) throw new ScopeViolation(h);
  }
}

export interface AuditEntry {
  ts: string;
  tool: string;
  input: unknown;
  exitCode: number;
  durationMs: number;
  outputBytes: number;
  truncated: boolean;
  error?: string;
}

export function appendAudit(ctx: RunContext, entry: AuditEntry): void {
  fs.appendFileSync(ctx.auditLogPath, `${JSON.stringify(entry)}\n`);
}

/**
 * Run a binary and capture stdout/stderr. Returns the combined output
 * truncated to MAX_OUTPUT_BYTES so a runaway scan can't blow the
 * Claude context. The full untruncated output is persisted next to
 * the audit log for human review.
 */
export async function runTool(
  ctx: RunContext,
  toolName: string,
  binary: string,
  args: string[],
  input: unknown,
  options?: { timeoutMs?: number; cwd?: string; stdin?: string },
): Promise<{ output: string; exitCode: number; truncated: boolean }> {
  const started = Date.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let errorMsg: string | undefined;
  try {
    const execaOptions: Record<string, unknown> = {
      timeout: timeoutMs,
      reject: false,
      stripFinalNewline: false,
    };
    if (options?.cwd !== undefined) execaOptions.cwd = options.cwd;
    if (options?.stdin !== undefined) execaOptions.input = options.stdin;
    const result = await execa(binary, args, execaOptions);
    stdout = result.stdout ?? '';
    stderr = result.stderr ?? '';
    exitCode = result.exitCode ?? -1;
    if (result.timedOut) {
      errorMsg = `timeout after ${timeoutMs}ms`;
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    exitCode = -1;
  }

  const combined = `# stdout\n${stdout}\n\n# stderr\n${stderr}${errorMsg ? `\n\n# runner error\n${errorMsg}` : ''}`;
  const truncated = combined.length > MAX_OUTPUT_BYTES;
  const output = truncated ? `${combined.slice(0, MAX_OUTPUT_BYTES)}\n\n[TRUNCATED — full output saved to workspace]` : combined;

  // Persist full output regardless of size so audits can recover it.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpPath = `${ctx.workspaceDir}/tool-${toolName}-${ts}.log`;
  fs.writeFileSync(dumpPath, combined);

  appendAudit(ctx, {
    ts: new Date().toISOString(),
    tool: toolName,
    input,
    exitCode,
    durationMs: Date.now() - started,
    outputBytes: combined.length,
    truncated,
    ...(errorMsg ? { error: errorMsg } : {}),
  });

  return { output, exitCode, truncated };
}
