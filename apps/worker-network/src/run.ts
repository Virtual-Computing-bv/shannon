#!/usr/bin/env node
/**
 * worker-network entrypoint. Spawned per-scan by apps/portal/src/server/runner.ts
 * (or directly by a developer for testing). Orchestrates the four-phase
 * pentest pipeline:
 *
 *   1. recon       — port + service discovery
 *   2. enum        — vulnerability / web enumeration (intensity >= enum)
 *   3. exploit     — active verification + exploitation (intensity === exploit)
 *   4. report      — consolidate everything into a Markdown report
 *
 * Each phase is a single Claude conversation seeded with a phase-specific
 * system prompt + a structured user prompt carrying the accumulated state.
 *
 * CLI:
 *   --workspace <dir>      per-scan workspace (artifacts + audit log)
 *   --output <dir>         final report directory
 *   --intensity <recon|enum|exploit>
 *   --scope-label <text>
 *   --host <h>             repeated, one per allowlisted host
 *   --config <yaml>        optional engagement config (currently informational)
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { runPentestLoop } from './claude-loop.js';
import type { Intensity, RunContext } from './types.js';

interface CliArgs {
  workspace: string;
  output: string;
  intensity: Intensity;
  scopeLabel: string;
  hosts: string[];
  config?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const out: Partial<CliArgs> & { hosts: string[] } = { hosts: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => {
      const v = args[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--workspace':
        out.workspace = next();
        break;
      case '--output':
        out.output = next();
        break;
      case '--intensity': {
        const v = next();
        if (v !== 'recon' && v !== 'enum' && v !== 'exploit') {
          throw new Error(`invalid intensity '${v}'`);
        }
        out.intensity = v;
        break;
      }
      case '--scope-label':
        out.scopeLabel = next();
        break;
      case '--host':
        out.hosts.push(next());
        break;
      case '--config':
        out.config = next();
        break;
      default:
        throw new Error(`unknown arg: ${a}`);
    }
  }
  if (!out.workspace) throw new Error('--workspace required');
  if (!out.output) throw new Error('--output required');
  if (!out.intensity) throw new Error('--intensity required');
  if (!out.hosts.length) throw new Error('at least one --host required');
  return out as CliArgs;
}

function loadPrompt(name: string): string {
  // Prompts are bundled next to the dist/ output by the container build.
  // In dev (running tsx directly from src/) they live one level up.
  const candidates = [
    path.join(import.meta.dirname, '..', 'prompts', name),
    path.join(import.meta.dirname, '..', '..', 'prompts', name),
    path.join(process.cwd(), 'apps/worker-network/prompts', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(`prompt not found: ${name} (looked in ${candidates.join(', ')})`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.workspace, { recursive: true });
  fs.mkdirSync(args.output, { recursive: true });

  const ctx: RunContext = {
    workspaceDir: args.workspace,
    outputDir: args.output,
    intensity: args.intensity,
    allowedHosts: args.hosts,
    scopeLabel: args.scopeLabel,
    auditLogPath: path.join(args.workspace, 'tool-audit.jsonl'),
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const client = new Anthropic({ apiKey });

  const baseSystem = loadPrompt('system-base.md');
  const reconPrompt = loadPrompt('phase-recon.md');
  const enumPrompt = loadPrompt('phase-enum.md');
  const exploitPrompt = loadPrompt('phase-exploit.md');
  const reportPrompt = loadPrompt('phase-report.md');

  const scopeBlock = [
    `Engagement scope: ${ctx.scopeLabel || '(unlabelled)'}`,
    `Allowlisted hosts (DO NOT exceed): ${ctx.allowedHosts.join(', ')}`,
    `Intensity: ${ctx.intensity}`,
    args.config ? `Engagement config file (informational): ${args.config}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Phase 1: recon
  process.stdout.write(`[phase:recon] starting against ${ctx.allowedHosts.length} hosts\n`);
  const reconResult = await runPentestLoop({
    client,
    ctx,
    phaseLabel: 'recon',
    systemPrompt: `${baseSystem}\n\n---\n\n${reconPrompt}`,
    userPrompt: `${scopeBlock}\n\nBegin reconnaissance.`,
  });
  fs.writeFileSync(path.join(ctx.workspaceDir, 'phase-recon.md'), reconResult.finalText);

  let enumResult: { finalText: string } = { finalText: '' };
  if (ctx.intensity === 'enum' || ctx.intensity === 'exploit') {
    process.stdout.write(`[phase:enum] starting\n`);
    enumResult = await runPentestLoop({
      client,
      ctx,
      phaseLabel: 'enum',
      systemPrompt: `${baseSystem}\n\n---\n\n${enumPrompt}`,
      userPrompt: `${scopeBlock}\n\nPrevious recon output:\n\n${reconResult.finalText}\n\nBegin enumeration.`,
    });
    fs.writeFileSync(path.join(ctx.workspaceDir, 'phase-enum.md'), enumResult.finalText);
  }

  let exploitResult: { finalText: string } = { finalText: '' };
  if (ctx.intensity === 'exploit') {
    process.stdout.write(`[phase:exploit] starting\n`);
    exploitResult = await runPentestLoop({
      client,
      ctx,
      phaseLabel: 'exploit',
      systemPrompt: `${baseSystem}\n\n---\n\n${exploitPrompt}`,
      userPrompt: `${scopeBlock}\n\nPrevious enumeration findings:\n\n${enumResult.finalText}\n\nBegin exploit verification.`,
    });
    fs.writeFileSync(path.join(ctx.workspaceDir, 'phase-exploit.md'), exploitResult.finalText);
  }

  // Phase 4: report
  process.stdout.write(`[phase:report] starting\n`);
  const evidenceList = fs
    .readdirSync(ctx.workspaceDir)
    .filter((f) => f.startsWith('tool-') && f.endsWith('.log'))
    .sort();
  const reportInput = [
    scopeBlock,
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Phase outputs',
    '### Recon',
    reconResult.finalText,
    '### Enumeration',
    enumResult.finalText || '(not executed at this intensity)',
    '### Exploitation',
    exploitResult.finalText || '(not executed at this intensity)',
    '',
    '## Evidence files (in workspace)',
    evidenceList.map((f) => `- ${f}`).join('\n'),
  ].join('\n');

  const reportResult = await runPentestLoop({
    client,
    ctx,
    phaseLabel: 'report',
    systemPrompt: `${baseSystem}\n\n---\n\n${reportPrompt}`,
    userPrompt: reportInput,
  });

  const scanId = process.env.NAHAYAT_SCAN_ID ?? path.basename(ctx.outputDir);
  const reportPath = path.join(ctx.outputDir, `network-pentest-${scanId}.md`);
  fs.writeFileSync(reportPath, reportResult.finalText);
  process.stdout.write(`[phase:report] wrote ${reportPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`worker-network fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
