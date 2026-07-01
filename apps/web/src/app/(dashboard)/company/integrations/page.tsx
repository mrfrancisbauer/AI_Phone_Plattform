'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { HeroHead, SettingCard } from '@/components/app';
import { Alert } from '@/components/ui';

interface Connection { provider: string; status: string; color: 'green' | 'yellow' | 'red'; accountEmail: string | null; calendarId: string; connectedAt: string }
interface ProviderInfo { provider: string; label: string; configured: boolean; connection: Connection | null }
interface CalendarStatus { anyConfigured: boolean; providers: ProviderInfo[] }
interface CalendarInfo { id: string; name: string; primary: boolean }

const PROVIDER_ICON: Record<string, string> = { google: '📅', microsoft: '📆' };
const DOT: Record<string, string> = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' };
const STATUS_LABEL: Record<string, string> = { green: 'Verbunden', yellow: 'Aufmerksamkeit nötig', red: 'Getrennt / fehlerhaft' };

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
  // Per-provider loaded calendar lists + the currently-selected id.
  const [calendars, setCalendars] = useState<Record<string, CalendarInfo[]>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setData(await api<CalendarStatus>('/api/integrations/calendar')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Load calendar lists for connected providers.
  useEffect(() => {
    if (!data) return;
    for (const p of data.providers) {
      if (p.connection && !calendars[p.provider]) {
        api<{ calendars: CalendarInfo[] }>(`/api/integrations/calendar/${p.provider}/calendars`)
          .then((r) => {
            setCalendars((c) => ({ ...c, [p.provider]: r.calendars }));
            setSelected((s) => ({ ...s, [p.provider]: p.connection!.calendarId }));
          })
          .catch(() => {});
      }
    }
  }, [data, calendars]);

  useEffect(() => {
    const c = params.get('calendar');
    if (c === 'connected') setMsg('Kalender erfolgreich verbunden.');
    else if (c === 'error') setError('Die Verbindung konnte nicht hergestellt werden. Bitte erneut versuchen.');
  }, [params]);

  function flash(s: string) { setMsg(s); setTimeout(() => setMsg(''), 4000); }

  async function connect(provider: string) {
    setError(''); setBusy(provider);
    try {
      const { url } = await api<{ url: string }>(`/api/integrations/calendar/${provider}/connect`, { method: 'POST' });
      window.location.href = url;
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); setBusy(''); }
  }

  async function disconnect(provider: string) {
    if (!confirm('Diese Kalenderverbindung trennen?')) return;
    setError(''); setBusy(provider);
    try { await api(`/api/integrations/calendar/${provider}`, { method: 'DELETE' }); flash('Kalenderverbindung getrennt.'); setCalendars((c) => ({ ...c, [provider]: [] })); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setBusy(''); }
  }

  async function saveDefault(provider: string) {
    setError(''); setBusy(provider);
    try {
      await api(`/api/integrations/calendar/${provider}`, { method: 'PATCH', body: JSON.stringify({ calendarId: selected[provider] }) });
      flash('Standardkalender gespeichert.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setBusy(''); }
  }

  async function test(provider: string) {
    setError(''); setBusy(provider);
    try {
      const r = await api<{ ok: boolean; message: string }>(`/api/integrations/calendar/${provider}/test`, { method: 'POST' });
      if (r.ok) flash(r.message); else setError(r.message);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setBusy(''); }
  }

  return (
    <>
      <HeroHead title="Integrationen" subtitle="Verbinden Sie Ihren Kalender — Termine aus Anrufen werden automatisch eingetragen." />
      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <SettingCard
        title="Kalender"
        description="Wenn ein Anrufer einen Termin nennt, prüft der Assistent die Verfügbarkeit und trägt den Termin in Ihren Standardkalender ein."
      >
        {data && !data.anyConfigured && (
          <Alert kind="info">Kalender-Integrationen sind auf der Plattform noch nicht konfiguriert. Bitte wenden Sie sich an Ihren Betreuer.</Alert>
        )}
        {data?.providers.map((p) => (
          <div key={p.provider} className="setting-card" style={{ marginBottom: 12 }}>
            <div className="switch-row" style={{ borderBottom: p.connection ? '1px solid var(--border)' : 'none' }}>
              <div className="switch-text">
                <strong>{PROVIDER_ICON[p.provider] ?? '📅'} {p.label}</strong>
                {p.connection ? (
                  <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: DOT[p.connection.color], display: 'inline-block' }} />
                    <span className="muted">{STATUS_LABEL[p.connection.color]}{p.connection.accountEmail ? ` · verbunden als ${p.connection.accountEmail}` : ''}</span>
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

            {p.connection && (
              <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ margin: 0 }}>Kalender</label>
                <select
                  value={selected[p.provider] ?? p.connection.calendarId}
                  onChange={(e) => setSelected((s) => ({ ...s, [p.provider]: e.target.value }))}
                  style={{ maxWidth: 260 }}
                >
                  {(calendars[p.provider] ?? []).length === 0 && <option value={p.connection.calendarId}>Primärkalender</option>}
                  {(calendars[p.provider] ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.primary ? ' (Primär)' : ''}</option>
                  ))}
                </select>
                <button className="btn sm" disabled={busy === p.provider} onClick={() => saveDefault(p.provider)}>Standardkalender speichern</button>
                <button className="btn secondary sm" disabled={busy === p.provider} onClick={() => test(p.provider)}>Verbindung testen</button>
              </div>
            )}
          </div>
        ))}
      </SettingCard>
    </>
  );
}
