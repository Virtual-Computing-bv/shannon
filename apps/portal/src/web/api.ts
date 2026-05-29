import type {
  NetworkIntensity,
  Scan,
  ScanWithTarget,
  ScopeRule,
  ScopeRulePolicy,
  Settings,
  Target,
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

/** Flat create bodies — mirror the server's discriminated-union zod schemas. */
export interface WebappCreateBody {
  kind: 'webapp';
  name: string;
  url: string;
  repoSource?: 'github-url' | 'local-path';
  repoUrl: string;
  repoToken?: string | null;
  configYaml?: string | null;
}

export interface NetworkCreateBody {
  kind: 'network';
  name: string;
  url: string;
  hosts: string[];
  scopeLabel: string;
  intensity: NetworkIntensity;
  configYaml?: string | null;
}

export type CreateTargetBody = WebappCreateBody | NetworkCreateBody;

export interface UpdateTargetBody {
  name?: string;
  url?: string;
  repoSource?: 'github-url' | 'local-path';
  repoUrl?: string;
  repoToken?: string | null;
  configYaml?: string | null;
  hosts?: string[];
  scopeLabel?: string;
  intensity?: NetworkIntensity;
}

export interface SettingsPatch {
  anthropicApiKey?: string | null;
  githubToken?: string | null;
  scopeDefaultPolicy?: ScopeRulePolicy;
  exploitModuleEnabled?: boolean;
  model?: string;
}

export interface ScopeRuleInput {
  targetId?: string | null;
  policy: ScopeRulePolicy;
  cidr?: string | null;
  hostnameGlob?: string | null;
  note?: string | null;
}

export const Api = {
  bootstrap: () => api<BootstrapResponse>('/bootstrap'),
  setup: (username: string, password: string) =>
    api<{ ok: true }>('/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    api<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api<{ ok: true }>('/logout', { method: 'POST' }),

  settings: () => api<Settings>('/settings'),
  patchSettings: (patch: SettingsPatch) => api<Settings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  saveSettings: (anthropicApiKey: string | null) =>
    api<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ anthropicApiKey }) }),
  saveGithubToken: (githubToken: string | null) =>
    api<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ githubToken }) }),
  saveModel: (model: string) => api<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ model }) }),
  testGithubToken: () =>
    api<{ ok: boolean; login?: string | null; scopes?: string | null; status?: number; error?: string }>(
      '/settings/github/test',
      { method: 'POST' },
    ),

  listTargets: () => api<{ data: Target[] }>('/targets').then((r) => r.data),
  createTarget: (body: CreateTargetBody) =>
    api<{ id: string }>('/targets', { method: 'POST', body: JSON.stringify(body) }),
  updateTarget: (id: string, body: UpdateTargetBody) =>
    api<{ ok: true }>(`/targets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTarget: (id: string) => api<{ ok: true }>(`/targets/${id}`, { method: 'DELETE' }),

  listScopeRules: (targetId?: string | null) => {
    const q = targetId === undefined ? '' : `?targetId=${targetId === null ? 'null' : encodeURIComponent(targetId)}`;
    return api<{ data: ScopeRule[] }>(`/scope-rules${q}`).then((r) => r.data);
  },
  createScopeRule: (input: ScopeRuleInput) =>
    api<{ data: ScopeRule }>('/scope-rules', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data),
  deleteScopeRule: (id: number) => api<{ ok: true }>(`/scope-rules/${id}`, { method: 'DELETE' }),

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
};

export type { Scan, ScanWithTarget, ScopeRule, ScopeRulePolicy, Settings, Target };
