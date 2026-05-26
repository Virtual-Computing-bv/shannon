import { useCallback, useEffect, useState } from 'react';
import { Api, type Target } from '../api';

export function Targets() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether a global GitHub token is set — used to show the
  // "Using global token from Settings" hint on per-target rows that have no
  // per-target token of their own.
  const [globalGithubTokenSet, setGlobalGithubTokenSet] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([Api.listTargets(), Api.settings()]);
      setTargets(list);
      setGlobalGithubTokenSet(settings.githubTokenConfigured);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Targets</h1>
          <p className="text-sm text-muted-foreground">
            Web-applicaties die je wil testen. Voeg er één toe en start de scan.
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

      {error && <div className="glass border-destructive/30 p-3 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="text-muted-foreground">Laden…</div>
      ) : targets.length === 0 ? (
        <div className="glass p-8 text-center text-muted-foreground">
          Nog geen targets. Voeg er één toe om te beginnen.
        </div>
      ) : (
        <div className="grid gap-3">
          {targets.map((t) => (
            <div key={t.id} className="glass p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <span className="badge">{t.repoSource}</span>
                    {t.repoTokenSet ? (
                      <span className="badge" title="Encrypted Git access token opgeslagen">
                        token
                      </span>
                    ) : globalGithubTokenSet ? (
                      <span
                        className="badge"
                        title="Geen target-specifieke token — valt terug op globale token uit Settings"
                      >
                        global token
                      </span>
                    ) : null}
                  </div>
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {t.url}
                  </a>
                  <div className="mt-1 font-mono text-xs text-muted-foreground truncate">
                    {t.repoUrl}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startScan(t)} className="btn-primary">
                    Scan starten
                  </button>
                  <button
                    onClick={() => {
                      setEditing(t);
                      setShowForm(true);
                    }}
                    className="btn-ghost"
                  >
                    Bewerken
                  </button>
                  <button onClick={() => remove(t)} className="btn-danger">
                    Verwijderen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TargetForm
          initial={editing}
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

function TargetForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Target | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [repoUrl, setRepoUrl] = useState(initial?.repoUrl ?? '');
  const [repoToken, setRepoToken] = useState('');
  const [configYaml, setConfigYaml] = useState(initial?.configYaml ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExistingToken = !!initial?.repoTokenSet;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // On create: send the token if filled.
      // On edit:   empty input → keep existing (server sees ''), otherwise replace.
      const body: Parameters<typeof Api.createTarget>[0] & { repoTokenSet?: boolean } = {
        name,
        url,
        repoSource: 'github-url' as const,
        repoUrl,
        repoTokenSet: hasExistingToken,
        configYaml: configYaml.trim() || null,
      };
      const payload: Record<string, unknown> = { ...body };
      if (repoToken.trim() !== '') payload.repoToken = repoToken.trim();
      if (initial) {
        await Api.updateTarget(initial.id, payload as Partial<Target>);
      } else {
        await Api.createTarget(payload as Parameters<typeof Api.createTarget>[0]);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-onyx/70 p-6 backdrop-blur-md">
      <div className="glass w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <h2 className="mb-1 text-xl font-bold">{initial ? 'Target bewerken' : 'Nieuwe target'}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Vul de URL van de live applicatie en de Git-repo met de broncode. De repo wordt bij elke
          scan opnieuw shallow-cloned naar een geïsoleerde werkdirectory.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Naam</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="bv. Productie acme.nl"
              required
              autoFocus
            />
          </div>
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
            <p className="mt-1 text-[10px] text-muted-foreground">
              Gewone HTTPS-URL — geen token erin. Vul hieronder een PAT in voor private repos.
            </p>
          </div>
          <div>
            <label className="label">
              GitHub access token (PAT) <span className="text-muted-foreground">— optioneel</span>
            </label>
            <input
              type="password"
              className="input font-mono text-xs"
              value={repoToken}
              onChange={(e) => setRepoToken(e.target.value)}
              placeholder={
                hasExistingToken
                  ? '•••••••• (laat leeg om huidige token te behouden)'
                  : 'ghp_… of github_pat_…'
              }
              autoComplete="off"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Optioneel — laat leeg om de globale GitHub token uit{' '}
              <strong>Settings</strong> te gebruiken. Vul hier alleen iets in als deze target
              een afwijkende PAT nodig heeft. Token wordt encrypted opgeslagen en alleen
              gebruikt om <code>git clone</code> uit te voeren als{' '}
              <code>x-access-token:&lt;token&gt;@github.com/…</code>. Voor GitHub: maak een
              fine-grained PAT met <code>Contents: read</code> op de betreffende repo.
            </p>
          </div>
          <div>
            <label className="label">YAML-config (optioneel)</label>
            <textarea
              className="input font-mono text-xs"
              rows={10}
              value={configYaml}
              onChange={(e) => setConfigYaml(e.target.value)}
              placeholder={`# Optioneel: voeg login-flow + scope toe.\nauthentication:\n  login_type: form\n  login_url: "${url || 'https://app.example.com'}/login"\n  credentials:\n    username: "test@example.com"\n    password: "..."\n  login_flow:\n    - "Type $username into the email field"\n    - "Type $password into the password field"\n    - "Click the 'Sign In' button"\n  success_condition:\n    type: url_contains\n    value: "/dashboard"`}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost" disabled={busy}>
              Annuleren
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Bezig…' : initial ? 'Bijwerken' : 'Aanmaken'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
