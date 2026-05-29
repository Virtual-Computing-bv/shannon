import { useCallback, useEffect, useState } from 'react';
import type { NetworkIntensity, TargetKind } from '../../shared/types';
import { Api, type Settings, type Target } from '../api';

const INTENSITY_LABEL: Record<NetworkIntensity, string> = {
  recon: 'Recon — alleen poort/service-ontdekking',
  enum: 'Enumeratie — read-only fingerprinting',
  exploit: 'Exploit — actieve exploit-modules',
};

export function Targets() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([Api.listTargets(), Api.settings()]);
      setTargets(list);
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function remove(t: Target) {
    if (!confirm(`Target "${t.name}" verwijderen?`)) return;
    await Api.deleteTarget(t.id);
    await refresh();
  }

  async function startScan(t: Target) {
    try {
      await Api.startScan(t.id);
      alert(`Scan gestart voor ${t.name}. Open het Scans-tabblad voor live status.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Targets</h1>
          <p className="text-sm text-ink-500">
            Web-applicaties én on-prem infrastructuur die je wil laten testen.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="btn-primary"
        >
          + Nieuwe target
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="text-ink-500">Laden…</div>
      ) : targets.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-500">Nog geen targets. Voeg een web-app of on-prem target toe om te beginnen.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {targets.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              globalGithubTokenSet={settings?.githubTokenConfigured ?? false}
              onScan={() => startScan(t)}
              onEdit={() => {
                setEditing(t);
                setShowForm(true);
              }}
              onRemove={() => remove(t)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <TargetForm
          initial={editing}
          exploitModuleEnabled={settings?.exploitModuleEnabled ?? false}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function TargetCard({
  target: t,
  globalGithubTokenSet,
  onScan,
  onEdit,
  onRemove,
}: {
  target: Target;
  globalGithubTokenSet: boolean;
  onScan: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const isNetwork = t.kind === 'network';
  return (
    <div className="card card-hover p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{t.name}</h3>
            <span className={`badge ${isNetwork ? 'badge-cyan' : 'badge-blue'}`}>
              {isNetwork ? 'On-prem' : 'Web-app'}
            </span>
            {isNetwork && t.network && <span className="badge">{t.network.intensity}</span>}
            {!isNetwork && t.webapp?.repoTokenSet && (
              <span className="badge" title="Encrypted Git access token opgeslagen">
                token
              </span>
            )}
            {!isNetwork && !t.webapp?.repoTokenSet && globalGithubTokenSet && (
              <span className="badge" title="Geen target-specifieke token — valt terug op globale token uit Settings">
                global token
              </span>
            )}
          </div>

          {isNetwork && t.network ? (
            <div className="mt-1 space-y-1">
              <div className="font-mono text-xs text-ink-600">{t.network.hosts.join(', ')}</div>
              {t.network.scopeLabel && <div className="text-xs text-ink-500">Scope: {t.network.scopeLabel}</div>}
            </div>
          ) : (
            <div className="mt-1 space-y-1">
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                {t.url}
              </a>
              <div className="truncate font-mono text-xs text-ink-400">{t.webapp?.repoUrl}</div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={onScan} className="btn-primary btn-sm">
            Scan starten
          </button>
          <button onClick={onEdit} className="btn-ghost btn-sm">
            Bewerken
          </button>
          <button onClick={onRemove} className="btn-danger">
            Verwijderen
          </button>
        </div>
      </div>
    </div>
  );
}

function TargetForm({
  initial,
  exploitModuleEnabled,
  onClose,
  onSaved,
}: {
  initial: Target | null;
  exploitModuleEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Kind is fixed once a target exists (the server PATCH never changes kind).
  const [kind, setKind] = useState<TargetKind>(initial?.kind ?? 'webapp');
  const [name, setName] = useState(initial?.name ?? '');

  // Webapp fields
  const [url, setUrl] = useState(initial?.kind === 'webapp' ? initial.url : '');
  const [repoUrl, setRepoUrl] = useState(initial?.webapp?.repoUrl ?? '');
  const [repoToken, setRepoToken] = useState('');

  // Network fields
  const [hostsText, setHostsText] = useState(initial?.network?.hosts.join('\n') ?? '');
  const [scopeLabel, setScopeLabel] = useState(initial?.network?.scopeLabel ?? '');
  const [intensity, setIntensity] = useState<NetworkIntensity>(initial?.network?.intensity ?? 'recon');

  const [configYaml, setConfigYaml] = useState(initial?.configYaml ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExistingToken = !!initial?.webapp?.repoTokenSet;
  const isEdit = !!initial;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (kind === 'network') {
        const hosts = hostsText
          .split('\n')
          .map((h) => h.trim())
          .filter(Boolean);
        const [primaryHost] = hosts;
        if (!primaryHost) throw new Error('Voeg minimaal één host, IP of CIDR-range toe.');
        const body = {
          name,
          url: primaryHost,
          hosts,
          scopeLabel,
          intensity,
          configYaml: configYaml.trim() || null,
        };
        if (isEdit && initial) {
          await Api.updateTarget(initial.id, body);
        } else {
          await Api.createTarget({ kind: 'network', ...body });
        }
      } else {
        if (isEdit && initial) {
          await Api.updateTarget(initial.id, {
            name,
            url,
            repoUrl,
            configYaml: configYaml.trim() || null,
            ...(repoToken.trim() !== '' ? { repoToken: repoToken.trim() } : {}),
          });
        } else {
          await Api.createTarget({
            kind: 'webapp',
            name,
            url,
            repoSource: 'github-url',
            repoUrl,
            configYaml: configYaml.trim() || null,
            ...(repoToken.trim() !== '' ? { repoToken: repoToken.trim() } : {}),
          });
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-6 backdrop-blur-sm">
      <div className="card max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-1 text-xl font-bold">{isEdit ? 'Target bewerken' : 'Nieuwe target'}</h2>
        <p className="mb-4 text-sm text-ink-500">
          Kies het type doelwit. Web-apps worden white-box getest met de broncode; on-prem targets
          worden vanaf het netwerk verkend.
        </p>

        {/* Kind selector */}
        <div className="mb-5 grid grid-cols-2 gap-2">
          <KindOption
            active={kind === 'webapp'}
            disabled={isEdit}
            title="Web-applicatie"
            desc="Live URL + Git-repo (white-box)"
            onClick={() => setKind('webapp')}
          />
          <KindOption
            active={kind === 'network'}
            disabled={isEdit}
            title="On-prem device"
            desc="Hosts / IP-ranges (netwerk)"
            onClick={() => setKind('network')}
          />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Naam</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'network' ? 'bv. Kantoor DMZ' : 'bv. Productie acme.nl'}
              required
              autoFocus
            />
          </div>

          {kind === 'webapp' ? (
            <>
              <div>
                <label className="label">Target-URL</label>
                <input
                  type="url"
                  className="input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://app.acme.nl"
                  required
                />
              </div>
              <div>
                <label className="label">Git repository URL</label>
                <input
                  className="input font-mono text-xs"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/jouw-org/acme-web.git"
                  required
                />
                <p className="mt-1 text-[11px] text-ink-400">
                  Gewone HTTPS-URL — geen token erin. Vul hieronder een PAT in voor private repos.
                </p>
              </div>
              <div>
                <label className="label">
                  GitHub access token (PAT) <span className="text-ink-400">— optioneel</span>
                </label>
                <input
                  type="password"
                  className="input font-mono text-xs"
                  value={repoToken}
                  onChange={(e) => setRepoToken(e.target.value)}
                  placeholder={hasExistingToken ? '•••••••• (laat leeg om huidige token te behouden)' : 'ghp_… of github_pat_…'}
                  autoComplete="off"
                />
                <p className="mt-1 text-[11px] text-ink-400">
                  Laat leeg om de globale GitHub-token uit <strong>Instellingen</strong> te
                  gebruiken. Wordt versleuteld opgeslagen en alleen gebruikt voor <code>git clone</code>.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="alert alert-info">
                On-prem netwerk-scans draaien in een gefaseerde uitrol. Targets kun je nu al
                aanmaken en scopen; de actieve scan-engine wordt in een volgende release
                geactiveerd.
              </div>
              <div>
                <label className="label">Hosts / IP-ranges</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={4}
                  value={hostsText}
                  onChange={(e) => setHostsText(e.target.value)}
                  placeholder={'10.0.0.0/24\n192.168.1.10\nnas.intern.acme.nl'}
                  required
                />
                <p className="mt-1 text-[11px] text-ink-400">
                  Eén host, IP of CIDR-range per regel. Elke host wordt vóór actieve probes
                  gecontroleerd tegen de scope-regels uit Instellingen.
                </p>
              </div>
              <div>
                <label className="label">Scope-omschrijving</label>
                <input
                  className="input"
                  value={scopeLabel}
                  onChange={(e) => setScopeLabel(e.target.value)}
                  placeholder="bv. Interne servers Oisterwijk — toestemming klant 2026-05"
                  required
                />
              </div>
              <div>
                <label className="label">Intensiteit</label>
                <select className="select" value={intensity} onChange={(e) => setIntensity(e.target.value as NetworkIntensity)}>
                  {(['recon', 'enum', 'exploit'] as NetworkIntensity[]).map((i) => (
                    <option key={i} value={i}>
                      {INTENSITY_LABEL[i]}
                    </option>
                  ))}
                </select>
                {intensity === 'exploit' && !exploitModuleEnabled && (
                  <p className="mt-1 text-[11px] text-warning-600">
                    Exploit-modules staan globaal uit. Scans worden afgetopt op enumeratie tot je
                    ze inschakelt onder Instellingen.
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="label">YAML-config (optioneel)</label>
            <textarea
              className="input font-mono text-xs"
              rows={8}
              value={configYaml}
              onChange={(e) => setConfigYaml(e.target.value)}
              placeholder={
                kind === 'network'
                  ? '# Optioneel: rules of engagement, uitsluitingen, tijdvensters.'
                  : `# Optioneel: login-flow + scope.\nauthentication:\n  login_type: form\n  login_url: "${url || 'https://app.example.com'}/login"\n  credentials:\n    username: "test@example.com"\n    password: "..."`
              }
            />
          </div>

          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost" disabled={busy}>
              Annuleren
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Bezig…' : isEdit ? 'Bijwerken' : 'Aanmaken'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function KindOption({
  active,
  disabled,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ' +
        (active ? 'border-blue-600 bg-blue-50 shadow-ring' : 'border-line bg-surface hover:border-line-strong')
      }
    >
      <div className={'text-sm font-semibold ' + (active ? 'text-blue-700' : 'text-ink-900')}>{title}</div>
      <div className="text-[11px] text-ink-500">{desc}</div>
    </button>
  );
}
