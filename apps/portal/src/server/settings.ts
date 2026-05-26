import type { Settings } from '../shared/types.js';
import { decrypt, encrypt, getSetting, setSetting } from './db.js';

const KEY_ANTHROPIC = 'anthropic_api_key';
const KEY_GITHUB_TOKEN = 'github_token';
const KEY_ADMIN_INIT = 'admin_initialized';

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
