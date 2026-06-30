'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Card, EmptyState, PageHeader, Spinner, StatusDot } from '@/components/admin/ui';

interface Row { id: string; e164: string; provider: string; tenantId: string; tenantName: string; country: string; active: boolean }
interface Resp { voiceWebhookUrl: string; twilioConfigured: boolean; items: Row[] }

export default function AdminPhoneNumbersPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try { setData(await api<Resp>('/api/admin/phone-numbers')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }
  useEffect(() => { void load(); }, []);
  function flash(s: string) { setMsg(s); setTimeout(() => setMsg(''), 4000); }

  async function configure(r: Row) {
    setError('');
    try { await api(`/api/admin/phone-numbers/${r.id}/configure-webhook`, { method: 'POST' }); flash(`Webhook für ${r.e164} eingerichtet.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }

  if (!data) return error ? <p className="error">{error}</p> : <Spinner />;

  return (
    <>
      <PageHeader title="Telefonnummern" subtitle="Alle Nummern aller Mandanten" />
      {msg && <p className="success">{msg}</p>}
      {error && <Alert kind="error">{error}</Alert>}

      <Card>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Webhook-URL (eingehend): <code style={{ wordBreak: 'break-all' }}>{data.voiceWebhookUrl}</code>
          {!data.twilioConfigured && <><br /><span className="error">Twilio nicht konfiguriert — automatische Einrichtung deaktiviert.</span></>}
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn secondary" disabled title="Nummernkauf erfolgt im Twilio-Konto">Neue Nummer kaufen</button>
          <button className="btn secondary" disabled title="Im Mandanten-Dashboard verbinden">Bestehende verbinden</button>
          <button className="btn secondary" disabled title="SIP-Trunk konfigurieren">SIP verbinden</button>
        </div>
        <table>
          <thead><tr><th>Nummer</th><th>Provider</th><th>Mandant</th><th>Land</th><th>Status</th><th>Eingehend</th><th></th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td>{r.e164}</td><td>{r.provider}</td><td>{r.tenantName}</td><td>{r.country}</td>
                <td><StatusDot status={r.active ? 'active' : 'down'} label={r.active ? 'Aktiv' : 'Inaktiv'} /></td>
                <td><StatusDot status="ok" label="Webhook" /></td>
                <td>{r.provider === 'twilio' && data.twilioConfigured && <button className="btn secondary" onClick={() => configure(r)}>Webhook testen</button>}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={7}><EmptyState>Keine Nummern.</EmptyState></td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
