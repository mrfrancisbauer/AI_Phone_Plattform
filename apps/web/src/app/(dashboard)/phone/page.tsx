'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { HeroHead } from '@/components/app';
import { Alert, Spinner, StatusDot } from '@/components/ui';
import { NumberWizard } from '@/components/NumberWizard';

interface PhoneNumber { id: string; provider: string; e164: string; displayNumber: string | null; forwardingStatus: string; active: boolean; assistantId: string | null; assistantName: string | null }
interface AssistantRef { id: string; name: string }
interface TelephonyInfo { voiceWebhookUrl: string; canProvision: boolean; provisioningProvider: string | null }

export default function PhonePage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [assistants, setAssistants] = useState<AssistantRef[]>([]);
  const [wh, setWh] = useState<TelephonyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setError('');
    try {
      const [n, a, w] = await Promise.all([
        api<PhoneNumber[]>('/api/phone-numbers'),
        api<AssistantRef[]>('/api/assistants'),
        api<TelephonyInfo>('/api/phone-numbers/telephony-info'),
      ]);
      setNumbers(n);
      setAssistants(a);
      setWh(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);
  function flash(s: string) { setMsg(s); setTimeout(() => setMsg(''), 3000); }

  async function remove(id: string) {
    if (!confirm('Diese Nummer entfernen?')) return;
    await api(`/api/phone-numbers/${id}`, { method: 'DELETE' });
    await load();
  }
  async function reassign(id: string, assistantId: string) {
    setError('');
    try {
      await api(`/api/phone-numbers/${id}`, { method: 'PATCH', body: JSON.stringify({ assistantId }) });
      await load();
      flash('Assistent zugeordnet.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <HeroHead
        title="Telefonnummern"
        subtitle="Ihre Rufnummern und die zugeordneten Assistenten."
        actions={<button className="btn" onClick={() => setWizard(true)}>+ Nummer hinzufügen</button>}
      />
      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="setting-card">
        <div className="body" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nummer</th><th>Weiterleitung</th><th>Status</th><th>Assistent</th><th></th></tr></thead>
              <tbody>
                {numbers.map((n) => (
                  <tr key={n.id}>
                    <td>
                      {n.displayNumber ? (
                        <>
                          <strong>{n.displayNumber}</strong>
                          <div className="muted" style={{ fontSize: '0.8rem' }}>→ {n.e164}</div>
                        </>
                      ) : (
                        <strong>{n.e164}</strong>
                      )}
                    </td>
                    <td>
                      {n.displayNumber ? (
                        n.forwardingStatus === 'active'
                          ? <StatusDot status="active" label="Aktiv" />
                          : <StatusDot status="pending" label="Warte auf ersten Anruf" />
                      ) : <span className="muted">Direkt</span>}
                    </td>
                    <td><StatusDot status={n.active ? 'active' : 'down'} label={n.active ? 'Aktiv' : 'Inaktiv'} /></td>
                    <td>
                      {n.assistantName ? n.assistantName : assistants.length > 0 ? (
                        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <span className="error" style={{ margin: 0 }}>Kein Assistent</span>
                          <select defaultValue="" onChange={(e) => e.target.value && reassign(n.id, e.target.value)} style={{ maxWidth: 190 }}>
                            <option value="">zuordnen…</option>
                            {assistants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </span>
                      ) : <span className="error" style={{ margin: 0 }}>Kein Assistent</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href="/testcall" className="btn secondary sm">Testanruf</Link>{' '}
                      <button className="btn danger sm" onClick={() => remove(n.id)}>Löschen</button>
                    </td>
                  </tr>
                ))}
                {numbers.length === 0 && (
                  <tr><td colSpan={5}>
                    <div className="ac-empty muted">
                      Noch keine Telefonnummer verbunden.<br />
                      <button className="btn" style={{ marginTop: 12 }} onClick={() => setWizard(true)}>Erste Nummer hinzufügen</button>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {wizard && wh && (
        <NumberWizard
          assistants={assistants}
          webhookUrl={wh.voiceWebhookUrl}
          canProvision={wh.canProvision}
          onClose={() => setWizard(false)}
          onCreated={() => { setWizard(false); flash('Nummer hinzugefügt.'); void load(); }}
        />
      )}
    </>
  );
}
