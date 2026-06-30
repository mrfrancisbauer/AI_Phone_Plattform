'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('admin@demo-kanzlei.de');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      router.push('/');
    } catch (err) {
      // At the login screen a 401 means wrong credentials, not an expired session.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError('E-Mail oder Passwort ist falsch.');
      } else {
        setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api('/api/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
      setInfo('Falls ein Konto existiert, wurde ein Login-Link per E-Mail versendet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="auth-card panel">
        <h1>Anmelden</h1>
        <p className="muted">KI-Telefonassistent · Kundenportal</p>

        <div className="row" style={{ margin: '1rem 0' }}>
          <button
            className={`btn ${mode === 'password' ? '' : 'secondary'}`}
            onClick={() => setMode('password')}
            type="button"
          >
            Passwort
          </button>
          <button
            className={`btn ${mode === 'magic' ? '' : 'secondary'}`}
            onClick={() => setMode('magic')}
            type="button"
          >
            Magic Link
          </button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={onPasswordLogin}>
            <label>E-Mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="btn" style={{ marginTop: '1rem', width: '100%' }} disabled={loading}>
              {loading ? 'Anmelden…' : 'Anmelden'}
            </button>
          </form>
        ) : (
          <form onSubmit={onMagicLink}>
            <label>E-Mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn" style={{ marginTop: '1rem', width: '100%' }} disabled={loading}>
              {loading ? 'Senden…' : 'Login-Link senden'}
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
        {info && <p className="success">{info}</p>}
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: '1.5rem' }}>
          Demo: admin@demo-kanzlei.de / demo-password-123
        </p>
      </div>
    </div>
  );
}
