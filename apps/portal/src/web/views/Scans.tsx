import { useCallback, useEffect, useState } from 'react';
import { Api, type ScanWithTarget } from '../api';

const STATUS_LABEL: Record<ScanWithTarget['status'], { label: string; class: string }> = {
  pending: { label: 'In wachtrij', class: '' },
  'scope-check': { label: 'Scope-check', class: 'badge-cyan' },
  cloning: { label: 'Repo klonen', class: 'badge-blue' },
  'pre-recon': { label: 'Code lezen', class: 'badge-blue' },
  recon: { label: 'Verkennen', class: 'badge-blue' },
  'network-recon': { label: 'Netwerk verkennen', class: 'badge-cyan' },
  enumeration: { label: 'Enumeratie', class: 'badge-cyan' },
  analyzing: { label: 'Analyseren', class: 'badge-blue' },
  exploiting: { label: 'Exploits draaien', class: 'badge-warning' },
  'post-exploit': { label: 'Post-exploit', class: 'badge-warning' },
  reporting: { label: 'Rapport schrijven', class: 'badge-blue' },
  completed: { label: 'Voltooid', class: 'badge-success' },
  failed: { label: 'Mislukt', class: 'badge-danger' },
  cancelled: { label: 'Geannuleerd', class: '' },
  'scope-violation': { label: 'Buiten scope', class: 'badge-danger' },
};

const ACTIVE_SCAN_STATUSES: ReadonlySet<ScanWithTarget['status']> = new Set([
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

export function Scans() {
  const [scans, setScans] = useState<ScanWithTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<ScanWithTarget | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setScans(await Api.listScans());
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStop = useCallback(
    async (scan: ScanWithTarget) => {
      if (
        !window.confirm(
          'Weet je het zeker? De lopende scan-stappen worden afgebroken. Reeds opgeslagen tussenresultaten blijven bewaard.',
        )
      ) {
        return;
      }
      setStoppingId(scan.id);
      try {
        await Api.stopScan(scan.id);
        await refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        window.alert(`Stoppen mislukt: ${msg}`);
      } finally {
        setStoppingId(null);
      }
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Scans</h1>
        <p className="text-sm text-ink-500">
          Live status, logs en rapporten van alle uitgevoerde pentests.
        </p>
      </div>

      {loading ? (
        <div className="text-ink-500">Laden…</div>
      ) : scans.length === 0 ? (
        <div className="card p-10 text-center text-ink-500">
          Nog geen scans. Start een scan vanuit het Targets-tabblad.
        </div>
      ) : (
        <div className="grid gap-2">
          {scans.map((s) => {
            const meta = STATUS_LABEL[s.status];
            return (
              <div key={s.id} className="card card-hover p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{s.target.name}</h3>
                      <span className={`badge ${meta.class}`}>{meta.label}</span>
                      <span className={`badge ${s.target.kind === 'network' ? 'badge-cyan' : 'badge-blue'}`}>
                        {s.target.kind === 'network' ? 'On-prem' : 'Web-app'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-500">
                      {s.target.url} · gestart {new Date(s.startedAt).toLocaleString('nl-NL')}
                      {s.finishedAt && ` · klaar ${new Date(s.finishedAt).toLocaleString('nl-NL')}`}
                    </div>
                    {s.error && <div className="mt-1 font-mono text-xs text-danger-600">{s.error}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setViewing(s)} className="btn-ghost btn-sm">
                      Bekijken
                    </button>
                    {ACTIVE_SCAN_STATUSES.has(s.status) && (
                      <button
                        onClick={() => handleStop(s)}
                        disabled={stoppingId === s.id}
                        className="btn-danger"
                      >
                        {stoppingId === s.id ? 'Bezig met stoppen…' : 'Stop scan'}
                      </button>
                    )}
                    {s.status === 'completed' && (
                      <a href={Api.scanReportDownloadUrl(s.id)} className="btn-primary btn-sm">
                        Download rapport
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewing && <ScanDetail scan={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ScanDetail({ scan, onClose }: { scan: ScanWithTarget; onClose: () => void }) {
  const [tab, setTab] = useState<'log' | 'report'>('log');
  const [log, setLog] = useState<string>('');
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        const txt = await Api.scanLogs(scan.id);
        if (live) setLog(txt);
      } catch {
        /* ignore */
      }
      if (scan.status === 'completed') {
        try {
          const r = await Api.scanReport(scan.id);
          if (live) setReport(r);
        } catch {
          if (live) setReport(null);
        }
      }
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [scan.id, scan.status]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-6 backdrop-blur-sm">
      <div className="card flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden p-0">
        <header className="flex items-center justify-between border-b border-line p-4">
          <div className="min-w-0">
            <h2 className="font-semibold">{scan.target.name}</h2>
            <p className="text-xs text-ink-500">{scan.target.url}</p>
          </div>
          <div className="flex gap-1">
            <TabButton current={tab} value="log" onClick={setTab}>
              Live log
            </TabButton>
            <TabButton current={tab} value="report" onClick={setTab}>
              Rapport
            </TabButton>
            <button onClick={onClose} className="btn-ghost btn-sm ml-2">
              Sluiten
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-bg">
          {tab === 'log' ? (
            <pre className="whitespace-pre-wrap p-4 font-mono text-xs text-ink-600">
              {log || '(nog geen log-output)'}
            </pre>
          ) : report ? (
            <div className="p-6 text-sm leading-relaxed text-ink-700">
              <MarkdownPreview md={report} />
            </div>
          ) : (
            <div className="grid place-items-center p-12 text-ink-500">
              {scan.status === 'completed'
                ? 'Rapport wordt geladen…'
                : 'Rapport komt beschikbaar zodra de scan klaar is.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton<T extends string>({
  current,
  value,
  onClick,
  children,
}: {
  current: T;
  value: T;
  onClick: (v: T) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={
        'rounded-pill px-3 py-1.5 text-sm font-semibold transition ' +
        (active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-panel hover:text-ink-900')
      }
    >
      {children}
    </button>
  );
}

/**
 * Minimal markdown preview. Renders headings, paragraphs, lists, inline code,
 * code blocks and links via a tiny in-place transform — keeps the bundle small.
 */
function MarkdownPreview({ md }: { md: string }) {
  // Split into code blocks vs prose so we can render fenced ``` blocks raw.
  const parts = md.split(/(```[\s\S]*?```)/g);
  return (
    <article className="max-w-none">
      {parts.map((part, i) =>
        part.startsWith('```') ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-md border border-line bg-panel p-3 text-xs text-ink-700"
          >
            <code>{part.replace(/^```[\w-]*\n?/, '').replace(/```$/, '')}</code>
          </pre>
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: renderProse(part) }} className="space-y-2" />
        ),
      )}
    </article>
  );
}

function renderProse(md: string): string {
  // Headings → h tags.
  const out = md
    .replace(/^### (.*)$/gm, '<h3 class="mt-4 text-base font-semibold text-ink-900">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="mt-5 text-lg font-bold text-ink-900">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="mt-2 text-2xl font-bold text-ink-900">$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-ink-900">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-panel px-1.5 py-0.5 text-xs text-ink-700">$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">$1</a>',
    )
    .replace(/^- (.*)$/gm, '<li class="ml-5 list-disc">$1</li>')
    .replace(/\n{2,}/g, '<br><br>');
  return out;
}
