import type {
  NetworkIntensity,
  Scan,
  ScanWithTarget,
  ScopeRule,
  ScopeRulePolicy,
  Settings,
  Target,
  TargetKind,
} from '../shared/types';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      if (body?.error) msg = body.error;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  if (r.headers.get('content-type')?.includes('application/json')) {
    return (await r.json()) as T;
  }
  return (await r.text()) as unknown as T;
}

export interface BootstrapResponse {
  needsSetup: boolean;
  authenticated: boolean;
  settings: Settings;
}

export interface SettingsPatch {
  anthropicApiKey?: string | null;
  githubToken?: string | null;
  scopeDefaultPolicy?: ScopeRulePolicy;
  exploitModuleEnabled?: boolean;
}

export interface ScopeRuleCreate {
  targetId?: string | null;
  policy: ScopeRulePolicy;
  cidr?: string | null;
  hostnameGlob?: string | null;
  note?: string | null;
}

/**
 * Webapp-target create payload. Mirrors the WebappTargetBody Zod schema on
 * the server. `repoTokenSet` is server-managed and never sent on create.
 */
export interface WebappTargetCreate {
  kind: 'webapp';
  name: string;
  url: string;
  repoSource: 'github-url' | 'local-path';
  repoUrl: string;
  repoToken?: string | null;
  configYaml?: string | null;
}

export interface NetworkTargetCreate {
  kind: 'network';
  name: string;
  url: string;
  hosts: string[];
  scopeLabel: string;
  intensity: NetworkIntensity;
  configYaml?: string | null;
}

export type TargetCreate = WebappTargetCreate | NetworkTargetCreate;

export const Api = {
  bootstrap: () => api<BootstrapResponse>('/bootstrap'),
  setup: (username: string, password: string) =>
    api<{ ok: true }>('/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    api<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api<{ ok: true }>('/logout', { method: 'POST' }),

  settings: () => api<Settings>('/settings'),
  saveSettings: (patch: SettingsPatch) =>
    api<Settings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  listTargets: () => api<{ data: Target[] }>('/targets').then((r) => r.data),
  createTarget: (body: TargetCreate) =>
    api<{ id: string }>('/targets', { method: 'POST', body: JSON.stringify(body) }),
  updateTarget: (id: string, body: Record<string, unknown>) =>
    api<{ ok: true }>(`/targets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTarget: (id: string) => api<{ ok: true }>(`/targets/${id}`, { method: 'DELETE' }),

  listScans: () => api<{ data: ScanWithTarget[] }>('/scans').then((r) => r.data),
  startScan: (targetId: string) =>
    api<{ id: string }>('/scans', { method: 'POST', body: JSON.stringify({ targetId }) }),
  stopScan: (id: string) =>
    api<{
      id: string;
      stopped: boolean;
      status: Scan['status'];
      finishedAt: string | null;
      exitCode: number | null;
      error: string | null;
    }>(`/scans/${id}/stop`, { method: 'POST' }),
  scanLogs: (id: string) => api<string>(`/scans/${id}/logs`),
  scanReport: (id: string) => api<string>(`/scans/${id}/report`),
  scanReportDownloadUrl: (id: string) => `/api/scans/${id}/report/download`,

  listScopeRules: (targetId?: string | null) => {
    const qs = targetId === undefined ? '' : `?targetId=${encodeURIComponent(targetId === null ? 'null' : targetId)}`;
    return api<{ data: ScopeRule[] }>(`/scope-rules${qs}`).then((r) => r.data);
  },
  createScopeRule: (body: ScopeRuleCreate) =>
    api<{ data: ScopeRule }>('/scope-rules', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  deleteScopeRule: (id: number) => api<{ ok: true }>(`/scope-rules/${id}`, { method: 'DELETE' }),
};

export type { NetworkIntensity, Scan, ScanWithTarget, ScopeRule, ScopeRulePolicy, Settings, Target, TargetKind };
