import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Api, type NetworkIntensity, type Target, type TargetCreate, type TargetKind } from '../api';

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
            Web-applicaties (whitebox-pentest) of netwerk-targets (IP/host/CIDR). Voeg er één toe en start de scan.
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
            <TargetCard key={t.id} target={t} onScan={() => startScan(t)} onEdit={() => { setEditing(t); setShowForm(true); }} onDelete={() => remove(t)} />
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

function TargetCard({
  target: t,
  onScan,
  onEdit,
  onDelete,
}: {
  target: Target;
  onScan: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="glass p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{t.name}</h3>
            <span className="badge">{t.kind}</span>
            {t.webapp && <span className="badge">{t.webapp.repoSource}</span>}
            {t.webapp?.repoTokenSet && (
              <span className="badge" title="Encrypted Git access token opgeslagen">
                token
              </span>
            )}
            {t.network && <span className="badge">{t.network.intensity}</span>}
          </div>
          {t.kind === 'webapp' ? (
            <>
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                {t.url}
              </a>
              <div className="mt-1 font-mono text-xs text-muted-foreground truncate">
                {t.webapp?.repoUrl}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm">{t.network?.scopeLabel}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                {t.network?.hosts.join(', ')}
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onScan} className="btn-primary">
            Scan starten
          </button>
          <button onClick={onEdit} className="btn-ghost">
            Bewerken
          </button>
          <button onClick={onDelete} className="btn-danger">
            Verwijderen
          </button>
        </div>
      </div>
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
  const [kind, setKind] = useState<TargetKind>(initial?.kind ?? 'webapp');
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [repoUrl, setRepoUrl] = useState(initial?.webapp?.repoUrl ?? '');
  const [repoToken, setRepoToken] = useState('');
  const [hostsText, setHostsText] = useState(initial?.network?.hosts.join('\n') ?? '');
  const [scopeLabel, setScopeLabel] = useState(initial?.network?.scopeLabel ?? '');
  const [intensity, setIntensity] = useState<NetworkIntensity>(initial?.network?.intensity ?? 'recon');
  const [configYaml, setConfigYaml] = useState(initial?.configYaml ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExistingToken = !!initial?.webapp?.repoTokenSet;
  const editingKind = initial?.kind ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        const patch: Record<string, unknown> = {
          name,
          url,
          configYaml: configYaml.trim() || null,
        };
        if (initial.kind === 'webapp') {
          patch.repoUrl = repoUrl;
          if (repoToken.trim() !== '') patch.repoToken = repoToken.trim();
        } else {
          patch.hosts = parseHosts(hostsText);
          patch.scopeLabel = scopeLabel;
          patch.intensity = intensity;
        }
        await Api.updateTarget(initial.id, patch);
      } else {
        let body: TargetCreate;
        if (kind === 'webapp') {
          body = {
            kind: 'webapp',
            name,
            url,
            repoSource: 'github-url',
            repoUrl,
            configYaml: configYaml.trim() || null,
          };
          if (repoToken.trim() !== '') (body as WebappCreateExtended).repoToken = repoToken.trim();
        } else {
          body = {
            kind: 'network',
            name,
            url,
            hosts: parseHosts(hostsText),
            scopeLabel,
            intensity,
            configYaml: configYaml.trim() || null,
          };
        }
        await Api.createTarget(body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-onyx/70 p-6 backdrop-blur-md">
      <div className="glass w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <h2 className="mb-1 text-xl font-bold">{initial ? 'Target bewerken' : 'Nieuwe target'}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {kind === 'webapp'
            ? 'Whitebox webapp-scan: Shannon cloned je broncode en exploiteert de live URL met Claude.'
            : 'Netwerk-pentest tegen IPs/CIDRs/hostnames. Doelen worden vooraf gecontroleerd tegen het scope-beleid.'}
        </p>
        {!initial && (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              className={kind === 'webapp' ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setKind('webapp')}
            >
              Webapp
            </button>
            <button
              type="button"
              className={kind === 'network' ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setKind('network')}
            >
              Netwerk
            </button>
          </div>
        )}
        {initial && (
          <div className="mb-4 text-xs text-muted-foreground">
            Type: <span className="badge">{editingKind}</span> (type wijziging vereist nieuwe target)
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Naam</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'webapp' ? 'bv. Productie acme.nl' : 'bv. Lab DMZ /24'}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">{kind === 'webapp' ? 'Target-URL' : 'Primair host/label'}</label>
            <input
              type={kind === 'webapp' ? 'url' : 'text'}
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={kind === 'webapp' ? 'https://app.acme.nl' : '10.20.30.0/24 of bastion.lab.example'}
              required
            />
          </div>

          {kind === 'webapp' ? (
            <>
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
                    hasExistingToken ? '•••••••• (laat leeg om huidige token te behouden)' : 'ghp_… of github_pat_…'
                  }
                  autoComplete="off"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Hosts / CIDRs / hostnames</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={4}
                  value={hostsText}
                  onChange={(e) => setHostsText(e.target.value)}
                  placeholder={'10.20.30.0/24\nbastion.lab.example\n203.0.113.5'}
                  required
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Eén entry per regel of komma-gescheiden. Alle hosts worden vooraf gevalideerd tegen het scope-beleid
                  in Instellingen — wat niet expliciet is toegestaan, wordt geblokkeerd.
                </p>
              </div>
              <div>
                <label className="label">Scope-label</label>
                <input
                  className="input"
                  value={scopeLabel}
                  onChange={(e) => setScopeLabel(e.target.value)}
                  placeholder="bv. Klant ACME — DMZ engagement 2026-Q2"
                  required
                />
              </div>
              <div>
                <label className="label">Intensiteit</label>
                <div className="flex flex-wrap gap-2">
                  {(['recon', 'enum', 'exploit'] as NetworkIntensity[]).map((opt) => (
                    <button
                      type="button"
                      key={opt}
                      className={intensity === opt ? 'btn-primary' : 'btn-ghost'}
                      onClick={() => setIntensity(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  <b>recon</b>: alleen port + service discovery (nmap). <b>enum</b>: + nuclei + dir/web fingerprinting.{' '}
                  <b>exploit</b>: + searchsploit + metasploit + hydra (vereist dat de globale exploit-module aan staat in
                  Instellingen).
                </p>
              </div>
            </>
          )}

          <div>
            <label className="label">YAML-config (optioneel)</label>
            <textarea
              className="input font-mono text-xs"
              rows={6}
              value={configYaml}
              onChange={(e) => setConfigYaml(e.target.value)}
              placeholder={
                kind === 'webapp'
                  ? `# Optioneel: voeg login-flow + scope toe.\nauthentication:\n  login_type: form\n  login_url: "${url || 'https://app.example.com'}/login"`
                  : `# Optioneel: override per-target tools/limits.\nnmap:\n  ports: "1-65535"\n  scripts: "default,vuln"\n`
              }
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

/**
 * Parse the hosts textarea into a deduped, non-empty list. Accepts both
 * comma-separated and newline-separated input. Whitespace is trimmed.
 */
function parseHosts(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

// Local helper type — narrows the WebappTargetCreate so we can attach
// repoToken without widening the public Api surface.
type WebappCreateExtended = TargetCreate & { repoToken?: string | null };
