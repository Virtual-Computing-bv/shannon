/**
 * Wire types shared by the Express server and the React client. Kept
 * dependency-free so we can import them from both build environments.
 */

export interface Target {
  id: string;
  name: string;
  url: string;
  /**
   * One of: github-url | local-path. For now we only support github-url and
   * shallow-clone the repo into a per-scan workspace at run time.
   */
  repoSource: 'github-url' | 'local-path';
  repoUrl: string;
  /** Optional YAML config (auth + rules). Stored verbatim. */
  configYaml: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScanStatus =
  | 'pending'
  | 'cloning'
  | 'pre-recon'
  | 'recon'
  | 'analyzing'
  | 'exploiting'
  | 'reporting'
  | 'completed'
  | 'failed'
  | 'cancelled';

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
  target: Pick<Target, 'id' | 'name' | 'url'>;
}

export interface Settings {
  /** Anthropic API key — encrypted at rest in SQLite, never exposed by API. */
  anthropicKeyConfigured: boolean;
  /** Last 4 chars of the configured key, for UX confirmation. */
  anthropicKeyHint: string | null;
  /** Whether the admin password has been set (first-launch detection). */
  adminConfigured: boolean;
}
