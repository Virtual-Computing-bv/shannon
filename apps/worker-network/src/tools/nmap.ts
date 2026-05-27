import { z } from 'zod';
import { assertHostsAllowed, runTool } from '../tool-helpers.js';
import type { ToolDefinition } from '../types.js';

const Input = z.object({
  hosts: z.array(z.string().min(1)).min(1),
  ports: z.string().min(1).default('1-1000'),
  scripts: z.string().optional(),
  service_detect: z.boolean().default(true),
  timing: z.enum(['T0', 'T1', 'T2', 'T3', 'T4', 'T5']).default('T3'),
});

export const nmapTool: ToolDefinition = {
  name: 'nmap_scan',
  description:
    'Run nmap port + service discovery. Default Tor-safe T3 timing. Use a wide port range only when explicitly needed (default 1-1000 covers most services).',
  input_schema: {
    type: 'object',
    properties: {
      hosts: { type: 'array', items: { type: 'string' }, description: 'Allowlisted hosts. Must be a subset of the scan target set.' },
      ports: { type: 'string', description: 'Port spec passed to -p (e.g. "1-1000", "22,80,443"). Default 1-1000.' },
      scripts: { type: 'string', description: 'Optional --script value (e.g. "default,vuln"). Omit for plain TCP scan.' },
      service_detect: { type: 'boolean', description: 'Add -sV for service/version detection (default true).' },
      timing: { type: 'string', enum: ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'], description: 'nmap timing template. Default T3.' },
    },
    required: ['hosts'],
  },
  minIntensity: 'recon',
  async run(rawInput, ctx) {
    const input = Input.parse(rawInput);
    assertHostsAllowed(input.hosts, ctx);
    const args: string[] = ['-Pn', `-${input.timing}`, '-p', input.ports];
    if (input.service_detect) args.push('-sV');
    if (input.scripts) args.push('--script', input.scripts);
    args.push(...input.hosts);
    const result = await runTool(ctx, 'nmap', 'nmap', args, input, { timeoutMs: 20 * 60 * 1000 });
    return result.output;
  },
};
