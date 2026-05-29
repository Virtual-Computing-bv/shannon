import { useCallback, useEffect, useState } from 'react';
import { Api, type BootstrapResponse } from './api';
import { Login } from './views/Login';
import { Setup } from './views/Setup';
import { Dashboard } from './views/Dashboard';

export function App() {
  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBoot(await Api.bootstrap());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error && !boot) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="card max-w-md p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold">Backend onbereikbaar</h1>
          <p className="text-sm text-ink-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!boot) {
    return <div className="flex min-h-screen items-center justify-center text-ink-500">Laden…</div>;
  }

  if (boot.needsSetup) return <Setup onDone={refresh} />;
  if (!boot.authenticated) return <Login onDone={refresh} />;
  return <Dashboard onLogout={refresh} />;
}
