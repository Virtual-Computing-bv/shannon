import { useCallback, useEffect, useState } from 'react';
import { Api, type Target } from '../api';

export function Targets() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTargets(await Api.listTargets());
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
  const [configYaml, setConfigYaml] = useState(initial?.configYaml ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name,
        url,
        repoSource: 'github-url' as const,
        repoUrl,
        configYaml: configYaml.trim() || null,
      };
      if (initial) {
        await Api.updateTarget(initial.id, body);
      } else {
        await Api.createTarget(body);
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
              Voor private repos: gebruik een HTTPS-URL met token, bv.{' '}
              <code>https://ghp_xxx@github.com/org/repo.git</code>
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
