import { useState } from 'react';
import { Api } from '../api';
import { Brand } from '../components/Brand';
import { Footer } from '../components/Footer';

export function Setup({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Minimaal 8 tekens.');
      return;
    }
    if (password !== confirm) {
      setError('Wachtwoorden komen niet overeen.');
      return;
    }
    setBusy(true);
    try {
      await Api.setup(username.trim(), password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col p-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="card w-full max-w-md p-8">
          <Brand />
          <h1 className="mb-1 mt-6 text-2xl font-bold">Eerste instelling</h1>
          <p className="mb-6 text-sm text-ink-500">
            Kies een admin-gebruiker. Deze gegevens worden lokaal opgeslagen in jouw eigen
            deployment — Nahayat heeft hier geen toegang toe.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Gebruikersnaam</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Wachtwoord</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Bevestig wachtwoord</label>
              <input
                type="password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Bezig…' : 'Account aanmaken'}
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
