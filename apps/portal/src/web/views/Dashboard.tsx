import { useState } from 'react';
import { Api } from '../api';
import { Brand } from '../components/Brand';
import { Targets } from './Targets';
import { Scans } from './Scans';
import { SettingsView } from './SettingsView';

type Tab = 'targets' | 'scans' | 'settings';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('targets');

  async function logout() {
    await Api.logout();
    onLogout();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col p-6">
      <header className="mb-8 flex items-center justify-between">
        <Brand />
        <nav className="flex gap-1">
          <TabButton current={tab} value="targets" onClick={setTab}>
            Targets
          </TabButton>
          <TabButton current={tab} value="scans" onClick={setTab}>
            Scans
          </TabButton>
          <TabButton current={tab} value="settings" onClick={setTab}>
            Instellingen
          </TabButton>
          <button onClick={logout} className="btn-ghost ml-2">
            Uitloggen
          </button>
        </nav>
      </header>
      {tab === 'targets' && <Targets />}
      {tab === 'scans' && <Scans />}
      {tab === 'settings' && <SettingsView />}
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
        'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-cream')
      }
    >
      {children}
    </button>
  );
}
