import { decrypt, encrypt, getSetting, setSetting } from './db.js';
import type { Settings } from '../shared/types.js';

const KEY_ANTHROPIC = 'anthropic_api_key';
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

export function publicSettings(): Settings {
  const stored = getSetting(KEY_ANTHROPIC);
  const decoded = stored ? safeDecrypt(stored) : null;
  return {
    anthropicKeyConfigured: !!decoded,
    anthropicKeyHint: decoded ? decoded.slice(-4) : null,
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
