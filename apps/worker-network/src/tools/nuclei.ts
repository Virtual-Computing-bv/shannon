import { z } from 'zod';
import { assertHostsAllowed, runTool } from '../tool-helpers.js';
import type { ToolDefinition } from '../types.js';

const Input = z.object({
  targets: z.array(z.string().min(1)).min(1),
  severity: z
    .array(z.enum(['info', 'low', 'medium', 'high', 'critical']))
    .default(['medium', 'high', 'critical']),
  tags: z.array(z.string()).optional(),
  templates: z.array(z.string()).optional(),
});

export const nucleiTool: ToolDefinition = {
  name: 'nuclei_scan',
  description:
    'Run nuclei community templates against allowlisted targets. Severity filter defaults to medium/high/critical to avoid noise. Output is JSONL findings.',
  input_schema: {
    type: 'object',
    properties: {
      targets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hostnames or URLs (http/https). Must be subset of scope allowlist.',
      },
      severity: {
        type: 'array',
        items: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
        description: 'Severities to include. Default [medium, high, critical].',
      },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional nuclei tag filter (e.g. ["cve","oast"]).' },
      templates: { type: 'array', items: { type: 'string' }, description: 'Optional template paths or IDs.' },
    },
    required: ['targets'],
  },
  minIntensity: 'enum',
  async run(rawInput, ctx) {
    const input = Input.parse(rawInput);
    // Targets may be URLs — strip protocol/path to validate hostname against allowlist.
    for (const t of input.targets) {
      const host = extractHost(t);
      assertHostsAllowed([host], ctx);
    }
    const args: string[] = ['-silent', '-jsonl', '-no-color', '-severity', input.severity.join(',')];
    if (input.tags && input.tags.length) args.push('-tags', input.tags.join(','));
    if (input.templates && input.templates.length) {
      for (const t of input.templates) args.push('-t', t);
    }
    for (const t of input.targets) args.push('-u', t);
    const result = await runTool(ctx, 'nuclei', 'nuclei', args, input, { timeoutMs: 30 * 60 * 1000 });
    return result.output;
  },
};

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
