import { DEFAULT_MODEL, MODEL_OPTIONS, type ScopeRule, type ScopeRulePolicy, type Settings } from '../shared/types.js';
import { db, decrypt, encrypt, getSetting, setSetting } from './db.js';

const KEY_ANTHROPIC = 'anthropic_api_key';
const KEY_GITHUB_TOKEN = 'github_token';
const KEY_ADMIN_INIT = 'admin_initialized';
const KEY_SCOPE_DEFAULT = 'scope_default_policy';
const KEY_EXPLOIT_ENABLED = 'exploit_module_enabled';
const KEY_MODEL = 'large_model';

export function decryptedAnthropicKey(): string | null {
  const stored = getSetting(KEY_ANTHROPIC);
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

export function setAnthropicKey(plain: string | null): void {
  if (plain === null || plain.trim() === '') {
    setSetting(KEY_ANTHROPIC, '');
    return;
  }
  setSetting(KEY_ANTHROPIC, encrypt(plain.trim()));
}

/**
 * Global GitHub Personal Access Token, used as a fallback when a target has no
 * per-target `repo_token_enc` set. Encrypted at rest with the same AES-256-GCM
 * key used for the Anthropic key and per-target tokens.
 */
export function decryptedGithubToken(): string | null {
  const stored = getSetting(KEY_GITHUB_TOKEN);
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

export function setGithubToken(plain: string | null): void {
  if (plain === null || plain.trim() === '') {
    setSetting(KEY_GITHUB_TOKEN, '');
    return;
  }
  setSetting(KEY_GITHUB_TOKEN, encrypt(plain.trim()));
}

export function getScopeDefaultPolicy(): ScopeRulePolicy {
  const stored = getSetting(KEY_SCOPE_DEFAULT);
  return stored === 'allow' ? 'allow' : 'deny';
}

export function setScopeDefaultPolicy(policy: ScopeRulePolicy): void {
  setSetting(KEY_SCOPE_DEFAULT, policy);
}

export function getExploitModuleEnabled(): boolean {
  return getSetting(KEY_EXPLOIT_ENABLED) === 'true';
}

export function setExploitModuleEnabled(enabled: boolean): void {
  setSetting(KEY_EXPLOIT_ENABLED, enabled ? 'true' : 'false');
}

/** Deep-reasoning model id. Falls back to DEFAULT_MODEL when unset or unknown. */
export function getModel(): string {
  const stored = getSetting(KEY_MODEL);
  if (stored && MODEL_OPTIONS.some((m) => m.id === stored)) return stored;
  return DEFAULT_MODEL;
}

export function setModel(model: string): void {
  const valid = MODEL_OPTIONS.some((m) => m.id === model) ? model : DEFAULT_MODEL;
  setSetting(KEY_MODEL, valid);
}

interface ScopeRuleRow {
  id: number;
  target_id: string | null;
  policy: ScopeRulePolicy;
  cidr: string | null;
  hostname_glob: string | null;
  note: string | null;
  created_at: string;
}

function rowToScopeRule(row: ScopeRuleRow): ScopeRule {
  return {
    id: row.id,
    targetId: row.target_id,
    policy: row.policy,
    cidr: row.cidr,
    hostnameGlob: row.hostname_glob,
    note: row.note,
    createdAt: row.created_at,
  };
}

/**
 * List scope rules. Pass `targetId` to scope to a specific target — the
 * caller is responsible for merging global (target_id IS NULL) rules with
 * per-target rules in the order it needs.
 */
export function listScopeRules(targetId?: string | null): ScopeRule[] {
  const rows =
    targetId === undefined
      ? (db.prepare(`SELECT * FROM scope_rules ORDER BY id ASC`).all() as unknown as ScopeRuleRow[])
      : (db
          .prepare(`SELECT * FROM scope_rules WHERE target_id IS ? ORDER BY id ASC`)
          .all(targetId) as unknown as ScopeRuleRow[]);
  return rows.map(rowToScopeRule);
}

export interface ScopeRuleInput {
  targetId: string | null;
  policy: ScopeRulePolicy;
  cidr: string | null;
  hostnameGlob: string | null;
  note: string | null;
}

export function createScopeRule(input: ScopeRuleInput): ScopeRule {
  const info = db
    .prepare(
      `INSERT INTO scope_rules (target_id, policy, cidr, hostname_glob, note)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.targetId, input.policy, input.cidr, input.hostnameGlob, input.note);
  const row = db
    .prepare(`SELECT * FROM scope_rules WHERE id=?`)
    .get(Number(info.lastInsertRowid)) as unknown as ScopeRuleRow;
  return rowToScopeRule(row);
}

export function deleteScopeRule(id: number): boolean {
  const info = db.prepare(`DELETE FROM scope_rules WHERE id=?`).run(id);
  return info.changes > 0;
}

export function publicSettings(): Settings {
  const anthropicStored = getSetting(KEY_ANTHROPIC);
  const anthropicDecoded = anthropicStored ? safeDecrypt(anthropicStored) : null;
  const githubStored = getSetting(KEY_GITHUB_TOKEN);
  const githubDecoded = githubStored ? safeDecrypt(githubStored) : null;
  return {
    anthropicKeyConfigured: !!anthropicDecoded,
    anthropicKeyHint: anthropicDecoded ? anthropicDecoded.slice(-4) : null,
    githubTokenConfigured: !!githubDecoded,
    githubTokenHint: githubDecoded ? githubDecoded.slice(-4) : null,
    adminConfigured: getSetting(KEY_ADMIN_INIT) === 'true',
    scopeDefaultPolicy: getScopeDefaultPolicy(),
    exploitModuleEnabled: getExploitModuleEnabled(),
    model: getModel(),
  };
}

export function markAdminInitialized(): void {
  setSetting(KEY_ADMIN_INIT, 'true');
}

function safeDecrypt(stored: string): string | null {
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}
