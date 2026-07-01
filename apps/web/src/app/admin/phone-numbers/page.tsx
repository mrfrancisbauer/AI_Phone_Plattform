'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Card, EmptyState, PageHeader, Spinner, StatusDot } from '@/components/admin/ui';

interface Row { id: string; e164: string; provider: string; tenantId: string; tenantName: string; country: string; active: boolean; assistantId: string | null; assistantName: string | null }
interface Resp { voiceWebhookUrl: string; twilioConfigured: boolean; items: Row[] }

interface PoolItem { id: string; e164: string; provider: string; country: string; status: string; webhookConfigured: boolean; assignedTenantName: string | null }
interface PoolResp { canProvision: boolean; provisioningProvider: string | null; voiceWebhookUrl: string; available: number; items: PoolItem[] }
interface AvailableNumber { e164: string; friendlyName?: string }

export default function AdminPhoneNumbersPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [pool, setPool] = useState<PoolResp | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  // Add-to-pool form.
  const [newNumber, setNewNumber] = useState('');
  const [country, setCountry] = useState('DE');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AvailableNumber[]>([]);

  async function load() {
    try {
      const [d, p] = await Promise.all([
        api<Resp>('/api/admin/phone-numbers'),
        api<PoolResp>('/api/admin/routing-numbers'),
      ]);
      setData(d);
      setPool(p);
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }
  useEffect(() => { void load(); }, []);
  function flash(s: string) { setMsg(s); setTimeout(() => setMsg(''), 4000); }

  async function configure(r: Row) {
    setError('');
    try { await api(`/api/admin/phone-numbers/${r.id}/configure-webhook`, { method: 'POST' }); flash(`Webhook für ${r.e164} eingerichtet.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }

  async function addManual() {
    setError('');
    const e164 = newNumber.replace(/[^\d+]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) { setError('Bitte eine Nummer im Format +49… angeben.'); return; }
    setBusy(true);
    try {
      await api('/api/admin/routing-numbers', { method: 'POST', body: JSON.stringify({ e164, provider: 'twilio', country, purchase: false }) });
      setNewNumber('');
      flash('Nummer zum Pool hinzugefügt.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setBusy(false); }
  }

  async function searchInventory() {
    setError('');
    setBusy(true);
    try {
      const res = await api<{ numbers: AvailableNumber[] }>(`/api/admin/routing-numbers/available?country=${country}`);
      setResults(res.numbers);
      if (res.numbers.length === 0) flash('Keine kaufbaren Nummern gefunden.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setBusy(false); }
  }

  async function buyToPool(e164: string) {
    setError('');
    setBusy(true);
    try {
      await api('/api/admin/routing-numbers', { method: 'POST', body: JSON.stringify({ e164, provider: 'twilio', country, purchase: true }) });
      setResults((rs) => rs.filter((r) => r.e164 !== e164));
      flash(`${e164} gekauft und zum Pool hinzugefügt.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setBusy(false); }
  }

  async function removeFromPool(id: string) {
    if (!confirm('Diese Nummer aus dem Pool entfernen?')) return;
    setError('');
    try { await api(`/api/admin/routing-numbers/${id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }

  if (!data || !pool) return error ? <p className="error">{error}</p> : <Spinner />;

  return (
    <>
      <PageHeader title="Telefonnummern" subtitle="Weiterleitungs-Pool und Nummern aller Mandanten" />
      {msg && <p className="success">{msg}</p>}
      {error && <Alert kind="error">{error}</Alert>}

      <Card>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Weiterleitungs-Pool</h3>
          <span className="muted" style={{ fontSize: '0.85rem' }}>{pool.available} verfügbar · {pool.items.length} gesamt</span>
        </div>
        <p className="muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>
          Plattform-eigene Nummern, auf die Kunden ihre eigene Rufnummer weiterleiten. Kunden erhalten beim
          „Bestehende Nummer behalten"-Flow automatisch eine freie Nummer aus diesem Pool.
          {!pool.canProvision && <><br /><span className="error">Automatischer Kauf deaktiviert (Provider nicht konfiguriert) — Nummern manuell hinzufügen.</span></>}
        </p>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input placeholder="+49 … (bereits vorhandene Nummer)" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} style={{ maxWidth: 260 }} />
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ maxWidth: 90 }}>
            <option value="DE">DE</option><option value="AT">AT</option><option value="CH">CH</option>
          </select>
          <button className="btn secondary" disabled={busy} onClick={addManual}>Zum Pool hinzufügen</button>
          {pool.canProvision && <button className="btn secondary" disabled={busy} onClick={searchInventory}>{busy ? 'Suche…' : 'Verfügbare Nummern suchen'}</button>}
        </div>

        {results.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <tbody>
                {results.map((r) => (
                  <tr key={r.e164}>
                    <td><strong>{r.e164}</strong></td>
                    <td style={{ textAlign: 'right' }}><button className="btn sm" disabled={busy} onClick={() => buyToPool(r.e164)}>Kaufen &amp; hinzufügen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead><tr><th>Nummer</th><th>Provider</th><th>Land</th><th>Status</th><th>Webhook</th><th></th></tr></thead>
            <tbody>
              {pool.items.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.e164}</strong></td>
                  <td>{r.provider}</td>
                  <td>{r.country}</td>
                  <td>{r.status === 'available'
                    ? <StatusDot status="active" label="Verfügbar" />
                    : <StatusDot status="pending" label={`Zugewiesen${r.assignedTenantName ? ` · ${r.assignedTenantName}` : ''}`} />}</td>
                  <td>{r.webhookConfigured ? '✓' : <span className="muted">manuell</span>}</td>
                  <td style={{ textAlign: 'right' }}>{r.status === 'available' && <button className="btn danger sm" onClick={() => removeFromPool(r.id)}>Entfernen</button>}</td>
                </tr>
              ))}
              {pool.items.length === 0 && <tr><td colSpan={6}><EmptyState>Noch keine Pool-Nummern. Fügen Sie eine hinzu, damit Kunden ihre Nummer behalten können.</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Nummern der Mandanten</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Webhook-URL (eingehend): <code style={{ wordBreak: 'break-all' }}>{data.voiceWebhookUrl}</code>
          {!data.twilioConfigured && <><br /><span className="error">Twilio nicht konfiguriert — automatische Einrichtung deaktiviert.</span></>}
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nummer</th><th>Provider</th><th>Mandant</th><th>Assistent</th><th>Land</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>{r.e164}</td><td>{r.provider}</td><td>{r.tenantName}</td>
                  <td>{r.assistantName ?? <span className="error" style={{ margin: 0 }}>Kein Assistent zugeordnet</span>}</td>
                  <td>{r.country}</td>
                  <td><StatusDot status={r.active ? 'active' : 'down'} label={r.active ? 'Aktiv' : 'Inaktiv'} /></td>
                  <td>{r.provider === 'twilio' && data.twilioConfigured && <button className="btn secondary sm" onClick={() => configure(r)}>Webhook testen</button>}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={7}><EmptyState>Keine Nummern.</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
