import { useState } from 'react';
import { Api } from '../api';
import { Brand } from '../components/Brand';
import { Footer } from '../components/Footer';
import { Overview } from './Overview';
import { Targets } from './Targets';
import { Scans } from './Scans';
import { SettingsView } from './SettingsView';

type Tab = 'overview' | 'targets' | 'scans' | 'settings';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');

  async function logout() {
    await Api.logout();
    onLogout();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col p-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Brand />
        <nav className="flex flex-wrap gap-1">
          <TabButton current={tab} value="overview" onClick={setTab}>
            Overzicht
          </TabButton>
          <TabButton current={tab} value="targets" onClick={setTab}>
            Targets
          </TabButton>
          <TabButton current={tab} value="scans" onClick={setTab}>
            Scans
          </TabButton>
          <TabButton current={tab} value="settings" onClick={setTab}>
            Instellingen
          </TabButton>
          <button onClick={logout} className="btn-ghost btn-sm ml-2">
            Uitloggen
          </button>
        </nav>
      </header>

      <main className="flex-1">
        {tab === 'overview' && <Overview onNavigate={setTab} />}
        {tab === 'targets' && <Targets />}
        {tab === 'scans' && <Scans />}
        {tab === 'settings' && <SettingsView />}
      </main>

      <Footer />
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: (v: Tab) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={
        'rounded-pill px-3.5 py-1.5 text-sm font-semibold transition ' +
        (active ? 'bg-ink-900 text-white shadow-sm' : 'text-ink-600 hover:bg-panel hover:text-ink-900')
      }
    >
      {children}
    </button>
  );
}
