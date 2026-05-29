import { useEffect, useState } from 'react';
import { MODEL_OPTIONS } from '../../shared/types';
import { Api, type ScopeRule, type ScopeRulePolicy, type Settings } from '../api';

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
    Api.settings()
      .then(setSettings)
      .catch((e) => setError(e.message));
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

  if (!settings) return <div className="text-ink-500">Laden…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Instellingen</h1>
        <p className="text-sm text-ink-500">
          Sleutels, AI-model en scope-regels. Alles wordt versleuteld in jouw eigen deployment
          opgeslagen.
        </p>
      </div>

      {/* ── Anthropic API key ── */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Anthropic API-key</h2>
        <p className="mb-4 text-sm text-ink-500">
          Scans worden uitgevoerd door Claude. Vul je eigen Anthropic API-key in — deze wordt
          versleuteld lokaal opgeslagen en alleen tijdens het uitvoeren van een scan gebruikt.
        </p>

        {settings.anthropicKeyConfigured ? (
          <div className="mb-4 flex items-center gap-3 rounded-md border border-success-600/30 bg-success-100 p-3">
            <div className="icon-tile h-7 w-7 bg-success-600/15 text-success-600">✓</div>
            <div className="flex-1 text-sm">
              <div className="font-medium text-ink-900">API-key actief</div>
              <div className="text-xs text-ink-500">
                Eindigt op <code className="font-mono">…{settings.anthropicKeyHint}</code>
              </div>
            </div>
            <button onClick={clear} className="btn-danger" disabled={saving}>
              Verwijderen
            </button>
          </div>
        ) : (
          <div className="alert alert-warning mb-4">
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
        {saved && <p className="mt-2 text-xs text-success-600">Opgeslagen.</p>}
        {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
        <p className="mt-3 text-xs text-ink-400">
          Krijgen via{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            console.anthropic.com
          </a>
          . Eén scan kost circa $20–$50 aan tokens — laad je account vooraf op.
        </p>
      </section>

      {/* ── AI-model ── */}
      <ModelSection settings={settings} onChange={setSettings} />

      {/* ── GitHub integration ── */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">GitHub-integratie</h2>
        <p className="mb-4 text-sm text-ink-500">
          Globale GitHub Personal Access Token (PAT). Wordt gebruikt als <strong>fallback</strong>{' '}
          voor elke target zonder eigen token — handig als al je private repos onder dezelfde org
          vallen. Per-target tokens hebben altijd voorrang. De token wordt versleuteld lokaal
          opgeslagen en nooit teruggegeven door de API.
        </p>

        {settings.githubTokenConfigured ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-success-600/30 bg-success-100 p-3">
            <div className="icon-tile h-7 w-7 bg-success-600/15 text-success-600">✓</div>
            <div className="flex-1 text-sm">
              <div className="font-medium text-ink-900">Globale GitHub-token actief</div>
              <div className="text-xs text-ink-500">
                Eindigt op <code className="font-mono">…{settings.githubTokenHint}</code>
              </div>
            </div>
            <button onClick={testGithub} className="btn-ghost btn-sm" disabled={githubTesting || githubSaving}>
              {githubTesting ? 'Testen…' : 'Test verbinding'}
            </button>
            <button onClick={clearGithub} className="btn-danger" disabled={githubSaving}>
              Verwijderen
            </button>
          </div>
        ) : (
          <div className="alert alert-info mb-4">
            Nog geen globale GitHub-token ingesteld — targets zonder eigen token kunnen geen private
            repos clonen.
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
          <button onClick={saveGithub} className="btn-primary" disabled={githubSaving || !githubInput.trim()}>
            {githubSaving ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
        {githubSaved && <p className="mt-2 text-xs text-success-600">Opgeslagen.</p>}
        {githubTestResult && <p className="mt-2 text-xs text-ink-500">{githubTestResult}</p>}
        {githubError && <p className="mt-2 text-sm text-danger-600">{githubError}</p>}
        <p className="mt-3 text-xs text-ink-400">
          Maak een fine-grained PAT met <code>Contents: read</code> op de repos die je wil scannen
          via{' '}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            github.com/settings/personal-access-tokens
          </a>
          .
        </p>
      </section>

      {/* ── Network scope & exploits ── */}
      <ScopeSection settings={settings} onChange={setSettings} />

      {/* ── Vendor / about ── */}
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Over Nahayat Pentest</h2>
        <p className="text-sm text-ink-500">
          Deze pentest-hub wordt geleverd en beheerd door <strong>Nahayat</strong>. Vragen of een
          begeleide pentest nodig? Mail{' '}
          <a href="mailto:contact@nahayat.io" className="text-blue-600 hover:underline">
            contact@nahayat.io
          </a>{' '}
          of bel{' '}
          <a href="tel:+31133333101" className="text-blue-600 hover:underline">
            013 333 3101
          </a>
          .
        </p>
        <p className="mt-3 text-xs text-ink-400">
          Powered by{' '}
          <a
            href="https://github.com/Virtual-Computing-bv/shannon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Shannon Lite (AGPL-3.0)
          </a>
          . Open-source fork beheerd door Nahayat / Virtual Computing. Source code beschikbaar op
          aanvraag.
        </p>
      </section>
    </div>
  );
}

/** AI-model picker — drives the deep-reasoning (LARGE) tier for analysis/exploit. */
function ModelSection({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: string) {
    if (id === settings.model || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await Api.saveModel(id);
      onChange(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-lg font-semibold">AI-model</h2>
      <p className="mb-4 text-sm text-ink-500">
        Kies het Claude-model dat de zware analyse- en exploit-fases aanstuurt. Krachtigere modellen
        vinden subtielere kwetsbaarheden maar kosten meer per scan.
      </p>

      <label className="label" htmlFor="model-select">
        Redeneer-model
      </label>
      <select
        id="model-select"
        className="select"
        value={settings.model}
        onChange={(e) => pick(e.target.value)}
        disabled={busy}
      >
        {MODEL_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {MODEL_OPTIONS.map((m) => {
          const active = m.id === settings.model;
          return (
            <div
              key={m.id}
              className={
                'rounded-md border p-3 text-xs transition ' +
                (active ? 'border-blue-600 bg-blue-50' : 'border-line bg-panel')
              }
            >
              <div className={'font-semibold ' + (active ? 'text-blue-700' : 'text-ink-900')}>{m.label}</div>
              <div className="mt-0.5 text-ink-500">{m.description}</div>
            </div>
          );
        })}
      </div>

      {saved && <p className="mt-2 text-xs text-success-600">Model opgeslagen.</p>}
      {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
    </section>
  );
}

/** Network scope policy + exploit master switch + global allow/deny rules. */
function ScopeSection({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const [rules, setRules] = useState<ScopeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-rule form
  const [policy, setPolicy] = useState<ScopeRulePolicy>('allow');
  const [matchType, setMatchType] = useState<'cidr' | 'hostnameGlob'>('cidr');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      setRules(await Api.listScopeRules(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function patch(patchBody: Parameters<typeof Api.patchSettings>[0]) {
    setBusy(true);
    setError(null);
    try {
      onChange(await Api.patchSettings(patchBody));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await Api.createScopeRule({
        targetId: null,
        policy,
        cidr: matchType === 'cidr' ? value.trim() : null,
        hostnameGlob: matchType === 'hostnameGlob' ? value.trim() : null,
        note: note.trim() || null,
      });
      setValue('');
      setNote('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function removeRule(id: number) {
    setBusy(true);
    try {
      await Api.deleteScopeRule(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-lg font-semibold">Netwerk-scope & exploits</h2>
      <p className="mb-4 text-sm text-ink-500">
        Bepaalt wat on-prem scans mogen raken. Hosts worden vóór elke actieve probe gecontroleerd
        tegen deze regels — buiten scope = automatisch geblokkeerd.
      </p>

      {/* Default policy */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel p-3">
        <div className="text-sm">
          <div className="font-medium text-ink-900">Standaard-beleid</div>
          <div className="text-xs text-ink-500">
            Wat te doen met een host die op géén enkele regel matcht.
          </div>
        </div>
        <Segmented<ScopeRulePolicy>
          value={settings.scopeDefaultPolicy}
          disabled={busy}
          options={[
            { value: 'deny', label: 'Blokkeren (veilig)' },
            { value: 'allow', label: 'Toestaan' },
          ]}
          onChange={(v) => patch({ scopeDefaultPolicy: v })}
        />
      </div>

      {/* Exploit master switch */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel p-3">
        <div className="text-sm">
          <div className="font-medium text-ink-900">Exploit-modules</div>
          <div className="text-xs text-ink-500">
            Master-schakelaar voor actieve exploit-tooling. Staat dit uit, dan worden scans afgetopt
            op enumeratie — ook als een target “exploit” vraagt.
          </div>
        </div>
        <Toggle
          checked={settings.exploitModuleEnabled}
          disabled={busy}
          onChange={(v) => patch({ exploitModuleEnabled: v })}
        />
      </div>

      {/* Rules list */}
      <div className="mb-2 flex items-center justify-between">
        <label className="label mb-0">Globale scope-regels</label>
        <span className="text-xs text-ink-400">{rules.length} regel(s)</span>
      </div>

      {loading ? (
        <div className="text-sm text-ink-500">Regels laden…</div>
      ) : rules.length === 0 ? (
        <div className="alert alert-info mb-4">
          Nog geen scope-regels. Met het standaard “blokkeren”-beleid kan geen enkele host getest
          worden tot je een allow-regel toevoegt.
        </div>
      ) : (
        <ul className="mb-4 divide-y divide-line overflow-hidden rounded-md border border-line">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 bg-surface p-3">
              <span className={`badge ${r.policy === 'allow' ? 'badge-success' : 'badge-danger'}`}>
                {r.policy === 'allow' ? 'allow' : 'deny'}
              </span>
              <code className="font-mono text-xs text-ink-700">{r.cidr ?? r.hostnameGlob}</code>
              {r.note && <span className="text-xs text-ink-500">— {r.note}</span>}
              <button
                onClick={() => removeRule(r.id)}
                className="btn-danger ml-auto"
                disabled={busy}
                title="Regel verwijderen"
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add rule */}
      <form onSubmit={addRule} className="rounded-md border border-line bg-panel p-3">
        <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr]">
          <select
            className="select"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as ScopeRulePolicy)}
          >
            <option value="allow">Toestaan</option>
            <option value="deny">Blokkeren</option>
          </select>
          <select
            className="select"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as 'cidr' | 'hostnameGlob')}
          >
            <option value="cidr">CIDR / IP</option>
            <option value="hostnameGlob">Hostname-glob</option>
          </select>
          <input
            className="input font-mono text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={matchType === 'cidr' ? '10.0.0.0/24' : '*.intern.acme.nl'}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="input flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notitie (optioneel) — bv. toestemming klant 2026-05"
          />
          <button type="submit" className="btn-primary" disabled={busy || !value.trim()}>
            Regel toevoegen
          </button>
        </div>
      </form>

      {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
    </section>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition disabled:opacity-50 ' +
        (checked ? 'bg-blue-600' : 'bg-ink-200')
      }
    >
      <span
        className={
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ' +
          (checked ? 'translate-x-6' : 'translate-x-1')
        }
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={
              'rounded-pill px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ' +
              (active ? 'bg-ink-900 text-white shadow-sm' : 'text-ink-600 hover:text-ink-900')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
