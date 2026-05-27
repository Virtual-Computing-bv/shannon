import { z } from 'zod';
import { runTool } from '../tool-helpers.js';
import type { ToolDefinition } from '../types.js';

const Input = z.object({
  query: z.string().min(2).max(200),
  cve: z.string().optional(),
});

export const searchsploitTool: ToolDefinition = {
  name: 'searchsploit_lookup',
  description:
    'Search the local Exploit-DB index (via searchsploit) for known exploits matching a software/version string or CVE id. Read-only — does not execute anything.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text query, typically "<product> <version>" or a CVE id.' },
      cve: { type: 'string', description: 'Optional CVE id, used with --cve flag.' },
    },
    required: ['query'],
  },
  minIntensity: 'enum',
  async run(rawInput, ctx) {
    const input = Input.parse(rawInput);
    const args = ['--json'];
    if (input.cve) args.push('--cve', input.cve);
    args.push(input.query);
    const result = await runTool(ctx, 'searchsploit', 'searchsploit', args, input, { timeoutMs: 60_000 });
    return result.output;
  },
};
