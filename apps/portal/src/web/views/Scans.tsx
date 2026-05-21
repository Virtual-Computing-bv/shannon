import { useCallback, useEffect, useState } from 'react';
import { Api, type ScanWithTarget } from '../api';

const STATUS_LABEL: Record<ScanWithTarget['status'], { label: string; class: string }> = {
  pending: { label: 'In wachtrij', class: 'border-muted-foreground/30 text-muted-foreground' },
  cloning: { label: 'Repo klonen', class: 'border-violet/40 text-violet' },
  'pre-recon': { label: 'Code lezen', class: 'border-violet/40 text-violet' },
  recon: { label: 'Verkennen', class: 'border-violet/40 text-violet' },
  analyzing: { label: 'Analyseren', class: 'border-primary/40 text-primary' },
  exploiting: { label: 'Exploits draaien', class: 'border-primary/40 text-primary' },
  reporting: { label: 'Rapport schrijven', class: 'border-primary/40 text-primary' },
  completed: { label: 'Voltooid', class: 'border-emerald-500/40 text-emerald-400' },
  failed: { label: 'Mislukt', class: 'border-destructive/40 text-destructive' },
  cancelled: { label: 'Geannuleerd', class: 'border-muted-foreground/30 text-muted-foreground' },
};

export function Scans() {
  const [scans, setScans] = useState<ScanWithTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<ScanWithTarget | null>(null);

  const refresh = useCallback(async () => {
    try {
      setScans(await Api.listScans());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Scans</h1>
        <p className="text-sm text-muted-foreground">
          Live status + logs + rapporten van alle uitgevoerde pentests.
        </p>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Laden…</div>
      ) : scans.length === 0 ? (
        <div className="glass p-8 text-center text-muted-foreground">
          Nog geen scans. Start een scan vanuit het Targets-tabblad.
        </div>
      ) : (
        <div className="grid gap-2">
          {scans.map((s) => {
            const meta = STATUS_LABEL[s.status];
            return (
              <div key={s.id} className="glass p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{s.target.name}</h3>
                      <span className={`badge ${meta.class}`}>{meta.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.target.url} · gestart {new Date(s.startedAt).toLocaleString('nl-NL')}
                      {s.finishedAt &&
                        ` · klaar ${new Date(s.finishedAt).toLocaleString('nl-NL')}`}
                    </div>
                    {s.error && (
                      <div className="mt-1 text-xs text-destructive font-mono">{s.error}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setViewing(s)} className="btn-ghost">
                      Bekijken
                    </button>
                    {s.status === 'completed' && (
                      <a
                        href={Api.scanReportDownloadUrl(s.id)}
                        className="btn-primary"
                      >
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-onyx/70 p-6 backdrop-blur-md">
      <div className="glass flex h-[85vh] w-full max-w-5xl flex-col p-0 overflow-hidden">
        <header className="flex items-center justify-between border-b border-border/40 p-4">
          <div className="min-w-0">
            <h2 className="font-semibold">{scan.target.name}</h2>
            <p className="text-xs text-muted-foreground">{scan.target.url}</p>
          </div>
          <div className="flex gap-1">
            <TabButton current={tab} value="log" onClick={setTab}>
              Live log
            </TabButton>
            <TabButton current={tab} value="report" onClick={setTab}>
              Rapport
            </TabButton>
            <button onClick={onClose} className="btn-ghost ml-2">
              Sluiten
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {tab === 'log' ? (
            <pre className="whitespace-pre-wrap p-4 font-mono text-xs text-muted-foreground">
              {log || '(nog geen log-output)'}
            </pre>
          ) : report ? (
            <div className="p-6 text-sm leading-relaxed">
              <MarkdownPreview md={report} />
            </div>
          ) : (
            <div className="grid place-items-center p-12 text-muted-foreground">
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
        'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
        (active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary')
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
    <article className="prose prose-invert max-w-none">
      {parts.map((part, i) =>
        part.startsWith('```') ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-md border border-border bg-onyx-light/60 p-3 text-xs"
          >
            <code>{part.replace(/^```[\w-]*\n?/, '').replace(/```$/, '')}</code>
          </pre>
        ) : (
          <div
            key={i}
            dangerouslySetInnerHTML={{ __html: renderProse(part) }}
            className="space-y-2"
          />
        ),
      )}
    </article>
  );
}

function renderProse(md: string): string {
  // Headings → h tags.
  let out = md
    .replace(/^### (.*)$/gm, '<h3 class="mt-4 text-base font-semibold">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="mt-5 text-lg font-bold">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="mt-2 text-2xl font-bold">$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-secondary px-1.5 py-0.5 text-xs">$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>',
    )
    .replace(/^- (.*)$/gm, '<li class="ml-5 list-disc">$1</li>')
    .replace(/\n{2,}/g, '<br><br>');
  return out;
}
