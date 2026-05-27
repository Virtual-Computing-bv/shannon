/**
 * Wire types shared by the Express server and the React client. Kept
 * dependency-free so we can import them from both build environments.
 */

export type TargetKind = 'webapp' | 'network';

/**
 * Pentest aggressiveness for network targets.
 * - recon: port + service discovery only (nmap, banner grab). No active probes.
 * - enum: + nuclei templates, gobuster, whatweb. Read-only fingerprinting.
 * - exploit: + searchsploit lookup + metasploit modules + hydra. Requires
 *   the global `exploitModuleEnabled` setting AND a per-target opt-in.
 */
export type NetworkIntensity = 'recon' | 'enum' | 'exploit';

export interface WebappTargetFields {
  /**
   * One of: github-url | local-path. For now we only support github-url and
   * shallow-clone the repo into a per-scan workspace at run time.
   */
  repoSource: 'github-url' | 'local-path';
  repoUrl: string;
  /**
   * True when an encrypted Git access token is stored for this target. The
   * token itself is never returned over the API — clients only know that it
   * is set (so the form can show a "leave blank to keep" placeholder).
   */
  repoTokenSet: boolean;
}

export interface NetworkTargetFields {
  /**
   * Host list — IPs, CIDR ranges, or hostnames. Resolved + scope-checked
   * before the workflow can dispatch any active probe.
   */
  hosts: string[];
  /** Free-text label describing the engagement scope, surfaced in reports. */
  scopeLabel: string;
  intensity: NetworkIntensity;
}

export interface Target {
  id: string;
  name: string;
  /** Running app URL for webapp targets, primary host for network targets. */
  url: string;
  kind: TargetKind;
  /** Optional YAML config (auth + rules). Stored verbatim. */
  configYaml: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated only when kind === 'webapp'. */
  webapp: WebappTargetFields | null;
  /** Populated only when kind === 'network'. */
  network: NetworkTargetFields | null;
}

export type ScanStatus =
  | 'pending'
  | 'scope-check'
  | 'cloning'
  | 'pre-recon'
  | 'recon'
  | 'network-recon'
  | 'enumeration'
  | 'analyzing'
  | 'exploiting'
  | 'post-exploit'
  | 'reporting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'scope-violation';

export interface Scan {
  id: string;
  targetId: string;
  status: ScanStatus;
  workspace: string;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
}

export interface ScanWithTarget extends Scan {
  target: Pick<Target, 'id' | 'name' | 'url' | 'kind'>;
}

export type ScopeRulePolicy = 'allow' | 'deny';

export interface ScopeRule {
  id: number;
  /** When null, the rule is global (applies to every network target). */
  targetId: string | null;
  policy: ScopeRulePolicy;
  /** Either cidr OR hostnameGlob is set, never both. */
  cidr: string | null;
  hostnameGlob: string | null;
  note: string | null;
  createdAt: string;
}

export interface Settings {
  /** Anthropic API key — encrypted at rest in SQLite, never exposed by API. */
  anthropicKeyConfigured: boolean;
  /** Last 4 chars of the configured key, for UX confirmation. */
  anthropicKeyHint: string | null;
  /**
   * Global GitHub Personal Access Token — encrypted at rest. Used as fallback
   * when a target has no per-target `repoToken` set. Never returned over the API.
   */
  githubTokenConfigured: boolean;
  /** Last 4 chars of the configured GitHub token, for UX confirmation. */
  githubTokenHint: string | null;
  /** Whether the admin password has been set (first-launch detection). */
  adminConfigured: boolean;
  /**
   * Default scope policy applied when no rule matches a host. 'deny' is the
   * safe default — every network target must be explicitly allowlisted.
   */
  scopeDefaultPolicy: ScopeRulePolicy;
  /**
   * Master switch for exploit-class tooling (metasploit, hydra, searchsploit
   * exploit suggestions). When false, network scans capped at 'enum' even if
   * a target requests 'exploit' intensity.
   */
  exploitModuleEnabled: boolean;
}
