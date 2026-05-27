import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Api, type ScopeRule, type ScopeRulePolicy, type Settings } from '../api';

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Api.settings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  if (!settings) {
    return error ? <div className="text-destructive">{error}</div> : <div className="text-muted-foreground">Laden…</div>;
  }

  return (
    <div className="space-y-6">
      <AnthropicKeyCard settings={settings} onChange={setSettings} />
      <ScopePolicyCard settings={settings} onChange={setSettings} />
      <ExploitModuleCard settings={settings} onChange={setSettings} />
      <ScopeRulesCard />
      <AboutCard />
    </div>
  );
}

function AnthropicKeyCard({ settings, onChange }: { settings: Settings; onChange: (next: Settings) => void }) {
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await Api.saveSettings({ anthropicApiKey: keyInput.trim() });
      onChange(next);
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
      const next = await Api.saveSettings({ anthropicApiKey: null });
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="glass p-6">
      <h2 className="mb-1 text-lg font-semibold">Anthropic API-key</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Scans worden uitgevoerd door Claude. Vul je eigen Anthropic API-key in — deze wordt versleuteld lokaal
        opgeslagen en alleen tijdens het uitvoeren van een scan gebruikt.
      </p>

      {settings.anthropicKeyConfigured ? (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-onyx">✓</div>
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
    </div>
  );
}

function ScopePolicyCard({ settings, onChange }: { settings: Settings; onChange: (next: Settings) => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(policy: ScopeRulePolicy) {
    setSaving(true);
    setErr(null);
    try {
      const next = await Api.saveSettings({ scopeDefaultPolicy: policy });
      onChange(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="glass p-6">
      <h2 className="mb-1 text-lg font-semibold">Scope-beleid (netwerk-scans)</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Standaard-beslissing wanneer geen scope-regel matcht. <b>Deny</b> is de veilige default — elke netwerk-target
        moet expliciet via een allow-regel in scope worden gezet.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={settings.scopeDefaultPolicy === 'deny' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => pick('deny')}
          disabled={saving}
        >
          Default deny
        </button>
        <button
          type="button"
          className={settings.scopeDefaultPolicy === 'allow' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => pick('allow')}
          disabled={saving}
        >
          Default allow (gevaarlijk)
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
}

function ExploitModuleCard({ settings, onChange }: { settings: Settings; onChange: (next: Settings) => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setSaving(true);
    setErr(null);
    try {
      const updated = await Api.saveSettings({ exploitModuleEnabled: next });
      onChange(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="glass p-6">
      <h2 className="mb-1 text-lg font-semibold">Exploit-module</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Master-switch voor exploit-tooling: <code className="font-mono">metasploit</code>,{' '}
        <code className="font-mono">hydra</code>, <code className="font-mono">searchsploit</code> exploit-runs en
        andere actieve aanvalsmodules. Wanneer uit, worden netwerk-scans met intensity=exploit teruggebracht naar
        enum. Houd dit uit tenzij je actief tegen je lab/eigen infra werkt.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={settings.exploitModuleEnabled ? 'btn-primary' : 'btn-ghost'}
          onClick={() => toggle(!settings.exploitModuleEnabled)}
          disabled={saving}
        >
          {settings.exploitModuleEnabled ? 'Aan — exploit toegestaan' : 'Uit — alleen recon/enum'}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
}

function ScopeRulesCard() {
  const [rules, setRules] = useState<ScopeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRules(await Api.listScopeRules('null'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function remove(rule: ScopeRule) {
    if (!confirm(`Regel #${rule.id} verwijderen?`)) return;
    await Api.deleteScopeRule(rule.id);
    await refresh();
  }

  return (
    <div className="glass p-6">
      <h2 className="mb-1 text-lg font-semibold">Globale scope-regels</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        CIDR-allowlist en hostname-globs die op iedere netwerk-target gelden. Volgorde van evaluatie per host:
        per-target regels eerst (later toe te voegen), daarna deze globale regels, daarna default beleid (zie boven).
        Allow gaat boven Deny bij gelijke specificiteit.
      </p>
      <ScopeRuleForm onCreated={refresh} />
      <div className="mt-4">
        {loading ? (
          <div className="text-muted-foreground">Laden…</div>
        ) : rules.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nog geen regels. Voeg er één toe om netwerkscans toe te laten.</div>
        ) : (
          <div className="grid gap-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-card/30 p-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={r.policy === 'allow' ? 'badge text-primary' : 'badge text-destructive'}>{r.policy}</span>
                  <code className="font-mono text-xs truncate">{r.cidr ?? r.hostnameGlob}</code>
                  {r.note && <span className="text-xs text-muted-foreground truncate">— {r.note}</span>}
                </div>
                <button onClick={() => remove(r)} className="btn-danger">
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      </div>
    </div>
  );
}

function ScopeRuleForm({ onCreated }: { onCreated: () => void }) {
  const [policy, setPolicy] = useState<ScopeRulePolicy>('allow');
  const [matchKind, setMatchKind] = useState<'cidr' | 'hostnameGlob'>('cidr');
  const [matchValue, setMatchValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await Api.createScopeRule({
        targetId: null,
        policy,
        cidr: matchKind === 'cidr' ? matchValue.trim() : null,
        hostnameGlob: matchKind === 'hostnameGlob' ? matchValue.trim() : null,
        note: note.trim() || null,
      });
      setMatchValue('');
      setNote('');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[auto_auto_1fr_1fr_auto] items-end">
      <div>
        <label className="label">Beleid</label>
        <select className="input" value={policy} onChange={(e) => setPolicy(e.target.value as ScopeRulePolicy)}>
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </select>
      </div>
      <div>
        <label className="label">Match-type</label>
        <select
          className="input"
          value={matchKind}
          onChange={(e) => setMatchKind(e.target.value as 'cidr' | 'hostnameGlob')}
        >
          <option value="cidr">CIDR</option>
          <option value="hostnameGlob">Hostname glob</option>
        </select>
      </div>
      <div>
        <label className="label">Waarde</label>
        <input
          className="input font-mono text-xs"
          value={matchValue}
          onChange={(e) => setMatchValue(e.target.value)}
          placeholder={matchKind === 'cidr' ? '10.0.0.0/8' : '*.lab.virtualcomputing.biz'}
          required
        />
      </div>
      <div>
        <label className="label">Notitie</label>
        <input
          className="input text-xs"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="bv. eigen LAB-subnet"
        />
      </div>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Bezig…' : 'Toevoegen'}
      </button>
      {err && <p className="sm:col-span-5 text-sm text-destructive">{err}</p>}
    </form>
  );
}

function AboutCard() {
  return (
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
  );
}
