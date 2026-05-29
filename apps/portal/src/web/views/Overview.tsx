import { useEffect, useMemo, useState } from 'react';
import { Api, type ScanWithTarget, type Target } from '../api';

const ACTIVE_STATUSES: ReadonlySet<ScanWithTarget['status']> = new Set([
  'pending',
  'scope-check',
  'cloning',
  'pre-recon',
  'recon',
  'network-recon',
  'enumeration',
  'analyzing',
  'exploiting',
  'post-exploit',
  'reporting',
]);

type NavTarget = 'targets' | 'scans' | 'settings';

export function Overview({ onNavigate }: { onNavigate: (tab: NavTarget) => void }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [scans, setScans] = useState<ScanWithTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([Api.listTargets(), Api.listScans()])
      .then(([t, s]) => {
        setTargets(t);
        setScans(s);
      })
      .catch(() => {
        /* surfaced elsewhere; overview degrades to zeros */
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const web = targets.filter((t) => t.kind === 'webapp').length;
    const onprem = targets.filter((t) => t.kind === 'network').length;
    const active = scans.filter((s) => ACTIVE_STATUSES.has(s.status)).length;
    const done = scans.filter((s) => s.status === 'completed').length;
    return { web, onprem, total: targets.length, active, done, scans: scans.length };
  }, [targets, scans]);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-xl border border-line bg-ink-900 p-8 text-white shadow-lg">
        <div className="max-w-2xl">
          <span className="badge badge-blue mb-3">AI-gedreven security testing</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Eén hub voor web-apps én on-prem infrastructuur
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-200">
            Laat Claude autonoom je applicaties white-box analyseren en je interne netwerk
            verkennen. Van reconnaissance tot een uitvoerbaar security-rapport — geleverd en beheerd
            door Nahayat.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => onNavigate('targets')} className="btn-primary">
              + Target toevoegen
            </button>
            <button
              onClick={() => onNavigate('scans')}
              className="btn rounded-pill border border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              Scans bekijken
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Targets" value={loading ? '—' : stats.total} hint={`${stats.web} web · ${stats.onprem} on-prem`} />
        <Stat label="Scans totaal" value={loading ? '—' : stats.scans} />
        <Stat label="Actief nu" value={loading ? '—' : stats.active} accent={stats.active > 0} />
        <Stat label="Voltooid" value={loading ? '—' : stats.done} />
      </section>

      {/* Two pillars */}
      <section className="grid gap-4 md:grid-cols-2">
        <Pillar
          badge="Web-app"
          badgeClass="badge-blue"
          title="Web-applicaties"
          desc="White-box pentest met de broncode erbij. Geef een live-URL en een Git-repo op; Claude leest de code, brengt het aanvalsoppervlak in kaart en bevestigt kwetsbaarheden met echte exploits."
          points={['Injection, XSS, auth, authz & SSRF', 'Login-flows incl. MFA/TOTP', 'Per-target of globale GitHub-token']}
          cta="Web-app toevoegen"
          onClick={() => onNavigate('targets')}
        />
        <Pillar
          badge="On-prem"
          badgeClass="badge-cyan"
          title="On-prem infrastructuur"
          desc="Netwerk-gebaseerde verkenning van interne hosts en IP-ranges. Scope-regels bewaken precies wat geraakt mag worden; exploit-tooling staat standaard uit tot je het bewust inschakelt."
          points={['Recon → enumeratie → exploit-niveaus', 'Allow/deny scope-regels per host/CIDR', 'Veilig standaard-beleid: blokkeren']}
          cta="On-prem target toevoegen"
          onClick={() => onNavigate('targets')}
        />
      </section>

      {/* Pipeline */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Hoe een scan verloopt</h2>
        <p className="mt-1 text-sm text-ink-500">
          Elke fase bouwt voort op de vorige. Je volgt de voortgang live onder Scans.
        </p>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Phase n={1} title="Pre-recon" desc="Broncode-analyse voor een architectuur-baseline." />
          <Phase n={2} title="Recon" desc="Aanvalsoppervlak in kaart vanuit eerste bevindingen." />
          <Phase n={3} title="Analyse" desc="5 parallelle agents jagen op kwetsbaarheden." />
          <Phase n={4} title="Exploit" desc="Bevestigt bevindingen — alleen als ingeschakeld." />
          <Phase n={5} title="Rapport" desc="Executive security-rapport met remediatie." />
        </ol>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className={'mt-1 text-2xl font-extrabold tracking-tight ' + (accent ? 'text-blue-600' : 'text-ink-900')}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-500">{hint}</div>}
    </div>
  );
}

function Pillar({
  badge,
  badgeClass,
  title,
  desc,
  points,
  cta,
  onClick,
}: {
  badge: string;
  badgeClass: string;
  title: string;
  desc: string;
  points: string[];
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="card card-hover flex flex-col p-6">
      <span className={`badge ${badgeClass} self-start`}>{badge}</span>
      <h3 className="mt-3 text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{desc}</p>
      <ul className="mt-4 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-ink-700">
            <span className="mt-0.5 text-blue-600">✓</span>
            {p}
          </li>
        ))}
      </ul>
      <button onClick={onClick} className="btn-ink btn-sm mt-5 self-start">
        {cta}
      </button>
    </div>
  );
}

function Phase({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="rounded-md border border-line bg-panel p-4">
      <div className="icon-tile-ink mb-2 h-7 w-7 text-xs font-bold">{n}</div>
      <div className="font-semibold text-ink-900">{title}</div>
      <div className="mt-0.5 text-xs text-ink-500">{desc}</div>
    </li>
  );
}
