/**
 * Wire types and runtime values shared across the worker-network tools.
 */

export type Intensity = 'recon' | 'enum' | 'exploit';

export interface RunContext {
  /** Absolute path to the per-scan workspace dir. Tools write artifacts here. */
  workspaceDir: string;
  /** Final report directory. The reporter agent writes its markdown into this dir. */
  outputDir: string;
  /** Effective intensity for this scan (after exploit-module downgrade). */
  intensity: Intensity;
  /** Allow-list of hosts the scope-gate cleared. Tools refuse any host outside this set. */
  allowedHosts: string[];
  /** Free-text scope label surfaced in the report. */
  scopeLabel: string;
  /** Append-only audit log file (JSONL) — one line per Claude tool call. */
  auditLogPath: string;
}

export interface ToolDefinition {
  /** Tool name surfaced to Claude. snake_case. */
  name: string;
  description: string;
  /**
   * JSONSchema-style input shape. Anthropic SDK accepts a loose shape;
   * we keep our own typing minimal because we validate with Zod at call
   * time anyway.
   */
  input_schema: Record<string, unknown>;
  /**
   * Minimum intensity at which this tool may be invoked. recon < enum < exploit.
   * Tools with `requiresExploit: true` additionally need the global
   * exploit-module switch enabled at the portal level — but that switch
   * has already been applied by the time intensity is set here.
   */
  minIntensity: Intensity;
  /** True for tools that actively attack (msf, hydra). Gated on intensity==='exploit'. */
  requiresExploit?: boolean;
  /** Executes the tool. Receives validated input, returns a string for the LLM. */
  run(input: unknown, ctx: RunContext): Promise<string>;
}

export const INTENSITY_RANK: Record<Intensity, number> = { recon: 0, enum: 1, exploit: 2 };
