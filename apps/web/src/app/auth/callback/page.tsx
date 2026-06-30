'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setToken } from '@/lib/api';

function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Kein Token gefunden.');
      return;
    }
    api<{ token: string }>('/api/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        setToken(res.token);
        router.push('/');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Link ungültig'));
  }, [params, router]);

  return (
    <div className="center-screen">
      <div className="auth-card panel">
        <h1>Anmeldung…</h1>
        {error ? (
          <>
            <p className="error">{error}</p>
            <a className="btn secondary" href="/login">
              Zurück zum Login
            </a>
          </>
        ) : (
          <p className="muted">Sie werden angemeldet.</p>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div className="center-screen">Lädt…</div>}>
      <Callback />
    </Suspense>
  );
}
