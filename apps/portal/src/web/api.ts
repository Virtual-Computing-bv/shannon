import type { Scan, ScanWithTarget, Settings, Target } from '../shared/types';

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

export const Api = {
  bootstrap: () => api<BootstrapResponse>('/bootstrap'),
  setup: (username: string, password: string) =>
    api<{ ok: true }>('/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    api<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api<{ ok: true }>('/logout', { method: 'POST' }),

  settings: () => api<Settings>('/settings'),
  saveSettings: (anthropicApiKey: string | null) =>
    api<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ anthropicApiKey }) }),

  listTargets: () => api<{ data: Target[] }>('/targets').then((r) => r.data),
  createTarget: (body: Omit<Target, 'id' | 'createdAt' | 'updatedAt'>) =>
    api<{ id: string }>('/targets', { method: 'POST', body: JSON.stringify(body) }),
  updateTarget: (id: string, body: Partial<Omit<Target, 'id'>>) =>
    api<{ ok: true }>(`/targets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTarget: (id: string) =>
    api<{ ok: true }>(`/targets/${id}`, { method: 'DELETE' }),

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

export type { Scan, ScanWithTarget, Settings, Target };
