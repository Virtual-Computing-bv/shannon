import { z } from 'zod';
import { assertHostsAllowed, runTool } from '../tool-helpers.js';
import type { ToolDefinition } from '../types.js';

function extractHost(target: string): string {
  try {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return new URL(target).hostname;
    }
    return target.split('/')[0] ?? target;
  } catch {
    return target;
  }
}

const GobusterInput = z.object({
  url: z.string().url(),
  wordlist: z.string().default('/usr/share/wordlists/dirb/common.txt'),
  extensions: z.array(z.string()).optional(),
  threads: z.number().int().min(1).max(50).default(10),
});

export const gobusterTool: ToolDefinition = {
  name: 'gobuster_dir',
  description:
    'Directory and file brute-forcing against an HTTP/HTTPS target with gobuster. Use moderate threads (≤20) to avoid breaking the target.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL including scheme. Host must be in scope allowlist.' },
      wordlist: { type: 'string', description: 'Path inside the container. Default /usr/share/wordlists/dirb/common.txt.' },
      extensions: { type: 'array', items: { type: 'string' }, description: 'File extensions to append, e.g. ["php","html"].' },
      threads: { type: 'number', description: 'Concurrent threads (1-50). Default 10.' },
    },
    required: ['url'],
  },
  minIntensity: 'enum',
  async run(rawInput, ctx) {
    const input = GobusterInput.parse(rawInput);
    assertHostsAllowed([extractHost(input.url)], ctx);
    const args: string[] = ['dir', '-q', '-u', input.url, '-w', input.wordlist, '-t', String(input.threads)];
    if (input.extensions && input.extensions.length) args.push('-x', input.extensions.join(','));
    const result = await runTool(ctx, 'gobuster', 'gobuster', args, input, { timeoutMs: 30 * 60 * 1000 });
    return result.output;
  },
};

const WhatwebInput = z.object({
  targets: z.array(z.string().min(1)).min(1),
  aggression: z.number().int().min(1).max(4).default(1),
});

export const whatwebTool: ToolDefinition = {
  name: 'whatweb_fingerprint',
  description:
    'Identify web technologies and CMS fingerprints with whatweb. Aggression 1 (passive) is the safe default; ≥3 sends probe requests.',
  input_schema: {
    type: 'object',
    properties: {
      targets: { type: 'array', items: { type: 'string' }, description: 'URLs or hostnames. Hosts must be in scope.' },
      aggression: { type: 'number', description: 'whatweb -a level: 1 passive, 3 aggressive, 4 heavy.' },
    },
    required: ['targets'],
  },
  minIntensity: 'enum',
  async run(rawInput, ctx) {
    const input = WhatwebInput.parse(rawInput);
    for (const t of input.targets) assertHostsAllowed([extractHost(t)], ctx);
    const args = ['--no-errors', `-a${input.aggression}`, ...input.targets];
    const result = await runTool(ctx, 'whatweb', 'whatweb', args, input, { timeoutMs: 10 * 60 * 1000 });
    return result.output;
  },
};
