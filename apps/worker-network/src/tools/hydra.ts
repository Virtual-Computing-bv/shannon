import { z } from 'zod';
import { assertHostsAllowed, runTool } from '../tool-helpers.js';
import type { ToolDefinition } from '../types.js';

const Input = z.object({
  host: z.string().min(1),
  service: z.string().min(2).max(40),
  userlist: z.string().min(1),
  passlist: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  threads: z.number().int().min(1).max(64).default(4),
  stop_on_first: z.boolean().default(true),
});

export const hydraTool: ToolDefinition = {
  name: 'hydra_brute',
  description:
    'Credential brute-force against a single host using hydra. Use sparingly — moderate threads (≤4) and stop_on_first=true by default to limit lockout risk. EXPLOIT-INTENSITY ONLY.',
  input_schema: {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Single host (allowlisted).' },
      service: {
        type: 'string',
        description: 'hydra service id (e.g. "ssh", "ftp", "rdp", "http-post-form").',
      },
      userlist: { type: 'string', description: 'Path inside container to username wordlist.' },
      passlist: { type: 'string', description: 'Path inside container to password wordlist.' },
      port: { type: 'number', description: 'Override default port.' },
      threads: { type: 'number', description: 'Concurrent tasks (1-64). Default 4.' },
      stop_on_first: { type: 'boolean', description: 'Exit on first valid pair. Default true.' },
    },
    required: ['host', 'service', 'userlist', 'passlist'],
  },
  minIntensity: 'exploit',
  requiresExploit: true,
  async run(rawInput, ctx) {
    const input = Input.parse(rawInput);
    assertHostsAllowed([input.host], ctx);
    const args: string[] = ['-L', input.userlist, '-P', input.passlist, '-t', String(input.threads)];
    if (input.stop_on_first) args.push('-f');
    if (input.port !== undefined) args.push('-s', String(input.port));
    args.push(input.host, input.service);
    const result = await runTool(ctx, 'hydra', 'hydra', args, input, { timeoutMs: 30 * 60 * 1000 });
    return result.output;
  },
};
