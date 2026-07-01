'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { HeroHead, SettingCard } from '@/components/app';
import { Alert, StatusDot } from '@/components/ui';

interface Connection { provider: string; status: string; accountEmail: string | null; connectedAt: string }
interface ProviderInfo { provider: string; label: string; configured: boolean; connection: Connection | null }
interface CalendarStatus { anyConfigured: boolean; providers: ProviderInfo[] }

const PROVIDER_ICON: Record<string, string> = { google: '📅', microsoft: '📆' };

export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsInner />
    </Suspense>
  );
}

function IntegrationsInner() {
  const params = useSearchParams();
  const [data, setData] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try { setData(await api<CalendarStatus>('/api/integrations/calendar')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }
  useEffect(() => { void load(); }, []);

  // Feedback after returning from the OAuth consent screen.
  useEffect(() => {
    const c = params.get('calendar');
    if (c === 'connected') setMsg('Kalender erfolgreich verbunden.');
    else if (c === 'error') setError('Die Verbindung konnte nicht hergestellt werden. Bitte erneut versuchen.');
  }, [params]);

  async function connect(provider: string) {
    setError(''); setBusy(provider);
    try {
      const { url } = await api<{ url: string }>(`/api/integrations/calendar/${provider}/connect`, { method: 'POST' });
      window.location.href = url; // hand off to the provider consent screen
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
      setBusy('');
    }
  }

  async function disconnect(provider: string) {
    if (!confirm('Diese Kalenderverbindung trennen?')) return;
    setError(''); setBusy(provider);
    try { await api(`/api/integrations/calendar/${provider}`, { method: 'DELETE' }); setMsg('Kalenderverbindung getrennt.'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setBusy(''); }
  }

  return (
    <>
      <HeroHead title="Integrationen" subtitle="Verbinden Sie Ihren Kalender — Termine aus Anrufen werden automatisch eingetragen." />
      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <SettingCard
        title="Kalender"
        description="Wenn ein Anrufer einen Termin nennt, trägt der Assistent ihn direkt in Ihren verbundenen Kalender ein."
      >
        {data && !data.anyConfigured && (
          <Alert kind="info">Kalender-Integrationen sind auf der Plattform noch nicht konfiguriert. Bitte wenden Sie sich an Ihren Betreuer.</Alert>
        )}
        {data?.providers.map((p) => (
          <div key={p.provider} className="switch-row">
            <div className="switch-text">
              <strong>{PROVIDER_ICON[p.provider] ?? '📅'} {p.label}</strong>
              {p.connection ? (
                <span className="row" style={{ gap: 8 }}>
                  <StatusDot status={p.connection.status === 'active' ? 'active' : 'error'} label={p.connection.status === 'active' ? 'Verbunden' : 'Neu verbinden nötig'} />
                  {p.connection.accountEmail && <span className="muted">{p.connection.accountEmail}</span>}
                </span>
              ) : (
                <span>{p.configured ? 'Nicht verbunden' : 'Nicht verfügbar'}</span>
              )}
            </div>
            {p.connection ? (
              <button className="btn secondary sm" disabled={busy === p.provider} onClick={() => disconnect(p.provider)}>Trennen</button>
            ) : (
              <button className="btn sm" disabled={!p.configured || busy === p.provider} onClick={() => connect(p.provider)}>
                {busy === p.provider ? '…' : 'Verbinden'}
              </button>
            )}
          </div>
        ))}
      </SettingCard>
    </>
  );
}
