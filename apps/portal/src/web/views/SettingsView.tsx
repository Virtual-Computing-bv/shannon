import { useEffect, useState } from 'react';
import { Api, type Settings } from '../api';

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // GitHub global token state — separate so saving/clearing the Anthropic
  // key doesn't accidentally toggle GitHub UI state and vice versa.
  const [githubInput, setGithubInput] = useState('');
  const [githubSaving, setGithubSaving] = useState(false);
  const [githubSaved, setGithubSaved] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubTesting, setGithubTesting] = useState(false);
  const [githubTestResult, setGithubTestResult] = useState<string | null>(null);

  useEffect(() => {
    Api.settings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  async function save() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await Api.saveSettings(keyInput.trim());
      setSettings(next);
      setKeyInput('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  async function clear() {
    setSaving(true);
    try {
      const next = await Api.saveSettings(null);
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  async function saveGithub() {
    if (!githubInput.trim()) return;
    setGithubSaving(true);
    setGithubError(null);
    setGithubSaved(false);
    setGithubTestResult(null);
    try {
      const next = await Api.saveGithubToken(githubInput.trim());
      setSettings(next);
      setGithubInput('');
      setGithubSaved(true);
      setTimeout(() => setGithubSaved(false), 3000);
    } catch (e) {
      setGithubError(e instanceof Error ? e.message : String(e));
    }
    setGithubSaving(false);
  }

  async function clearGithub() {
    setGithubSaving(true);
    setGithubTestResult(null);
    try {
      const next = await Api.saveGithubToken(null);
      setSettings(next);
    } catch (e) {
      setGithubError(e instanceof Error ? e.message : String(e));
    }
    setGithubSaving(false);
  }

  async function testGithub() {
    setGithubTesting(true);
    setGithubTestResult(null);
    setGithubError(null);
    try {
      const result = await Api.testGithubToken();
      if (result.ok) {
        const scopes = result.scopes ? ` (scopes: ${result.scopes})` : '';
        setGithubTestResult(`Verbinding OK — ingelogd als ${result.login ?? '?'}${scopes}`);
      } else {
        setGithubTestResult(
          `Test mislukt${result.status ? ` (HTTP ${result.status})` : ''}: ${result.error ?? 'unknown'}`,
        );
      }
    } catch (e) {
      setGithubError(e instanceof Error ? e.message : String(e));
    }
    setGithubTesting(false);
  }

  if (!settings) return <div className="text-muted-foreground">Laden…</div>;

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h2 className="mb-1 text-lg font-semibold">Anthropic API-key</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Scans worden uitgevoerd door Claude. Vul je eigen Anthropic API-key in — deze wordt
          versleuteld lokaal opgeslagen en alleen tijdens het uitvoeren van een scan gebruikt.
        </p>

        {settings.anthropicKeyConfigured ? (
          <div className="mb-4 flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-onyx">
              ✓
            </div>
            <div className="flex-1 text-sm">
              <div className="font-medium">API-key actief</div>
              <div className="text-xs text-muted-foreground">
                Eindigt op <code className="font-mono">…{settings.anthropicKeyHint}</code>
              </div>
            </div>
            <button onClick={clear} className="btn-danger" disabled={saving}>
              Verwijderen
            </button>
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            Nog geen key actief — voeg er één toe om scans te kunnen draaien.
          </div>
        )}

        <label className="label">Anthropic API-key</label>
        <div className="flex gap-2">
          <input
            className="input font-mono"
            type="password"
            placeholder="sk-ant-…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button onClick={save} className="btn-primary" disabled={saving || !keyInput.trim()}>
            {saving ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
        {saved && <p className="mt-2 text-xs text-primary">Opgeslagen.</p>}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Krijgen via{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            console.anthropic.com
          </a>
          . Eén scan kost circa $20–$50 aan tokens — laad je account vooraf op.
        </p>
      </div>

      <div className="glass p-6">
        <h2 className="mb-1 text-lg font-semibold">GitHub Integration</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Globale GitHub Personal Access Token (PAT). Wordt gebruikt als{' '}
          <strong>fallback</strong> voor elke target zonder eigen token — handig als al je
          private repos onder dezelfde org vallen. Per-target tokens hebben altijd voorrang.
          De token wordt versleuteld lokaal opgeslagen en nooit teruggegeven door de API.
        </p>

        {settings.githubTokenConfigured ? (
          <div className="mb-4 flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-onyx">
              ✓
            </div>
            <div className="flex-1 text-sm">
              <div className="font-medium">Globale GitHub token actief</div>
              <div className="text-xs text-muted-foreground">
                Eindigt op <code className="font-mono">…{settings.githubTokenHint}</code>
              </div>
            </div>
            <button
              onClick={testGithub}
              className="btn-ghost"
              disabled={githubTesting || githubSaving}
            >
              {githubTesting ? 'Testen…' : 'Test verbinding'}
            </button>
            <button onClick={clearGithub} className="btn-danger" disabled={githubSaving}>
              Verwijderen
            </button>
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-muted/40 bg-muted/5 p-3 text-sm">
            Nog geen globale GitHub token ingesteld — targets zonder eigen token kunnen geen
            private repos clonen.
          </div>
        )}

        <label className="label">GitHub Personal Access Token</label>
        <div className="flex gap-2">
          <input
            className="input font-mono text-xs"
            type="password"
            placeholder="ghp_… of github_pat_…"
            value={githubInput}
            onChange={(e) => setGithubInput(e.target.value)}
            autoComplete="off"
          />
          <button
            onClick={saveGithub}
            className="btn-primary"
            disabled={githubSaving || !githubInput.trim()}
          >
            {githubSaving ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
        {githubSaved && <p className="mt-2 text-xs text-primary">Opgeslagen.</p>}
        {githubTestResult && (
          <p className="mt-2 text-xs text-muted-foreground">{githubTestResult}</p>
        )}
        {githubError && <p className="mt-2 text-sm text-destructive">{githubError}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Maak een fine-grained PAT met <code>Contents: read</code> op de repos die je wil
          scannen via{' '}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            github.com/settings/personal-access-tokens
          </a>
          .
        </p>
      </div>

      <div className="glass p-6">
        <h2 className="mb-1 text-lg font-semibold">Over Nahayat Pentest</h2>
        <p className="text-sm text-muted-foreground">
          Powered by{' '}
          <a
            href="https://github.com/Virtual-Computing-bv/shannon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Shannon Lite (AGPL-3.0)
          </a>
          . Open-source fork beheerd door Virtual Computing. Source code beschikbaar op aanvraag.
        </p>
      </div>
    </div>
  );
}
