import { z } from 'zod';
import { runTool } from '../tool-helpers.js';
import type { ToolDefinition } from '../types.js';

/**
 * Allow-list of binaries Claude may invoke through the generic shell
 * tool. Anything else is rejected before we ever spawn — this is the
 * difference between "AI pentest agent" and "AI with root shell".
 *
 * Adding to this list is a deliberate decision: it widens the agent's
 * blast radius from "things we wrapped + audited" to "anything that
 * binary can do". Keep it short.
 */
const ALLOWED_BINARIES = new Set<string>([
  'curl',
  'wget',
  'dig',
  'host',
  'nslookup',
  'whois',
  'ping',
  'traceroute',
  'tracepath',
  'mtr',
  'openssl',
  'sslyze',
  'ssh-keyscan',
  'sqlmap',
  'wpscan',
  'enum4linux',
  'enum4linux-ng',
  'smbclient',
  'rpcclient',
  'crackmapexec',
  'netexec',
  'showmount',
  'wfuzz',
  'feroxbuster',
  'kerbrute',
  'impacket-secretsdump',
  'impacket-GetNPUsers',
  'impacket-GetUserSPNs',
  'impacket-psexec',
  'impacket-smbserver',
  'impacket-smbexec',
]);

const Input = z.object({
  binary: z.string().min(1).max(80),
  args: z.array(z.string()).default([]),
  /** Optional stdin content piped to the process. Kept under 64KB. */
  stdin: z.string().max(64 * 1024).optional(),
});

export const shellTool: ToolDefinition = {
  name: 'shell_command',
  description: `Run an allowlisted binary with arbitrary args. Only the following binaries are allowed: ${[...ALLOWED_BINARIES].join(', ')}. Prefer the dedicated tools (nmap_scan, nuclei_scan, etc) over this — use shell_command only when nothing else fits.`,
  input_schema: {
    type: 'object',
    properties: {
      binary: { type: 'string', description: 'Binary name. Must be on the allowlist or the call is rejected.' },
      args: { type: 'array', items: { type: 'string' }, description: 'Arguments passed verbatim. No shell expansion happens.' },
      stdin: { type: 'string', description: 'Optional stdin content.' },
    },
    required: ['binary'],
  },
  minIntensity: 'recon',
  async run(rawInput, ctx) {
    const input = Input.parse(rawInput);
    if (!ALLOWED_BINARIES.has(input.binary)) {
      return `ERROR: binary '${input.binary}' is not on the shell-allowlist. Use one of the dedicated tools or pick a binary from: ${[...ALLOWED_BINARIES].slice(0, 20).join(', ')}…`;
    }
    const result = await runTool(
      ctx,
      `shell-${input.binary}`,
      input.binary,
      input.args,
      input,
      { timeoutMs: 10 * 60 * 1000, ...(input.stdin !== undefined ? { stdin: input.stdin } : {}) },
    );
    return result.output;
  },
};
