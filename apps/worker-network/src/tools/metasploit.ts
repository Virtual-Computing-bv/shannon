import { z } from 'zod';
import { assertHostsAllowed, runTool } from '../tool-helpers.js';
import type { ToolDefinition } from '../types.js';

const Input = z.object({
  module: z.string().min(3).max(200),
  rhosts: z.array(z.string().min(1)).min(1),
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  action: z.enum(['check', 'run']).default('check'),
});

/**
 * Translate the structured input into a msfconsole resource script. We
 * always start with a clean DB-less workspace ('db_disconnect') so we
 * don't accidentally cross-pollinate scans, then load + configure the
 * module, then either 'check' (passive verification) or 'run' (active
 * exploit). The 'exit' at the end is critical — msfconsole hangs
 * otherwise.
 */
function buildResourceScript(input: z.infer<typeof Input>): string {
  const lines: string[] = ['db_disconnect'];
  lines.push(`use ${input.module}`);
  lines.push(`set RHOSTS ${input.rhosts.join(' ')}`);
  for (const [k, v] of Object.entries(input.options)) {
    lines.push(`set ${k} ${v}`);
  }
  lines.push(input.action === 'check' ? 'check' : 'run');
  lines.push('exit');
  return lines.join('\n');
}

export const metasploitTool: ToolDefinition = {
  name: 'metasploit_module',
  description:
    'Run a single Metasploit module non-interactively via msfconsole -x. Use action="check" first to verify the target is exploitable before action="run". RHOSTS must be a subset of the scope allowlist. EXPLOIT-INTENSITY ONLY.',
  input_schema: {
    type: 'object',
    properties: {
      module: { type: 'string', description: 'Module path, e.g. "exploit/multi/http/struts2_content_type_ognl".' },
      rhosts: { type: 'array', items: { type: 'string' }, description: 'Target hosts. Must be in scope.' },
      options: {
        type: 'object',
        description: 'Module-specific options (RPORT, PAYLOAD, etc). Values may be string, number, or boolean.',
      },
      action: { type: 'string', enum: ['check', 'run'], description: 'check = verify only; run = actively exploit. Default check.' },
    },
    required: ['module', 'rhosts'],
  },
  minIntensity: 'exploit',
  requiresExploit: true,
  async run(rawInput, ctx) {
    const input = Input.parse(rawInput);
    assertHostsAllowed(input.rhosts, ctx);
    const script = buildResourceScript(input);
    // msfconsole reads the resource script via stdin (-x is also fine
    // but multi-line commands need a script-file via -r). Stdin is the
    // most portable across container versions.
    const result = await runTool(
      ctx,
      'metasploit',
      'msfconsole',
      ['-q', '-n', '-x', script.replace(/\n/g, '; ')],
      input,
      { timeoutMs: 30 * 60 * 1000 },
    );
    return result.output;
  },
};
