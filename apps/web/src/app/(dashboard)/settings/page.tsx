'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RETENTION_DAYS } from '@ai-phone/shared';
import { money } from '@/lib/format';

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  locale: string;
  monthlyBudgetLimit: number | null;
  autoPauseOnBudget: boolean;
  paused: boolean;
}
interface Recipient { id: string; email: string; label: string | null }
interface PhoneNumber { id: string; provider: string; e164: string; active: boolean }
interface Retention { retentionDays: number; storeAudio: boolean }

export default function SettingsPage() {
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [retention, setRetention] = useState<Retention>({ retentionDays: 90, storeAudio: false });
  const [newEmail, setNewEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function loadAll() {
    const [t, r, n, ret] = await Promise.all([
      api<TenantSettings>('/api/settings/tenant'),
      api<Recipient[]>('/api/settings/email-recipients'),
      api<PhoneNumber[]>('/api/phone-numbers'),
      api<Retention>('/api/settings/retention'),
    ]);
    setTenant(t);
    setRecipients(r);
    setNumbers(n);
    setRetention(ret);
  }

  useEffect(() => {
    loadAll().catch((e) => setError(e.message));
  }, []);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  }

  async function saveTenant() {
    if (!tenant) return;
    await api('/api/settings/tenant', {
      method: 'PUT',
      body: JSON.stringify({
        name: tenant.name,
        locale: tenant.locale,
        monthlyBudgetLimit: tenant.monthlyBudgetLimit,
        autoPauseOnBudget: tenant.autoPauseOnBudget,
      }),
    });
    flash('Gespeichert.');
  }

  async function addRecipient() {
    if (!newEmail) return;
    await api('/api/settings/email-recipients', { method: 'POST', body: JSON.stringify({ email: newEmail }) });
    setNewEmail('');
    setRecipients(await api<Recipient[]>('/api/settings/email-recipients'));
  }

  async function removeRecipient(id: string) {
    await api(`/api/settings/email-recipients/${id}`, { method: 'DELETE' });
    setRecipients((r) => r.filter((x) => x.id !== id));
  }

  async function saveRetention() {
    await api('/api/settings/retention', { method: 'PUT', body: JSON.stringify(retention) });
    flash('Gespeichert.');
  }

  if (error) return <p className="error">{error}</p>;
  if (!tenant) return <p className="muted">Lädt…</p>;

  return (
    <>
      <h1>Einstellungen</h1>
      {msg && <p className="success">{msg}</p>}
      {tenant.paused && (
        <p className="error">Achtung: Dieser Mandant ist wegen Budgetüberschreitung pausiert.</p>
      )}

      <h2>Mandant &amp; Budget</h2>
      <div className="panel">
        <label>Name</label>
        <input value={tenant.name} onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
        <div className="grid cols-2">
          <div>
            <label>Monatsbudget / Kostenlimit (EUR)</label>
            <input
              type="number"
              step="0.01"
              value={tenant.monthlyBudgetLimit ?? ''}
              onChange={(e) =>
                setTenant({ ...tenant, monthlyBudgetLimit: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <label className="row" style={{ alignItems: 'flex-end', marginBottom: 4 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={tenant.autoPauseOnBudget}
              onChange={(e) => setTenant({ ...tenant, autoPauseOnBudget: e.target.checked })}
            />
            <span style={{ marginLeft: 8 }}>Automatisch pausieren bei 100 %</span>
          </label>
        </div>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Kostenwarnungen werden automatisch bei 50 %, 80 % und 100 % des Limits versendet.
        </p>
        <button className="btn" style={{ marginTop: '0.5rem' }} onClick={saveTenant}>
          Speichern
        </button>
      </div>

      <h2>E-Mail-Empfänger für Zusammenfassungen</h2>
      <div className="panel">
        <table>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn danger" onClick={() => removeRecipient(r.id)}>Entfernen</button>
                </td>
              </tr>
            ))}
            {recipients.length === 0 && (
              <tr><td className="muted">Noch keine Empfänger — ohne Empfänger wird keine Mandanten-E-Mail versendet.</td></tr>
            )}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <input
            type="email"
            placeholder="team@firma.de"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button className="btn" onClick={addRecipient}>Hinzufügen</button>
        </div>
      </div>

      <h2>Telefonnummern</h2>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Nummer</th><th>Anbieter</th><th>Status</th></tr></thead>
          <tbody>
            {numbers.map((n) => (
              <tr key={n.id}>
                <td>{n.e164}</td>
                <td>{n.provider}</td>
                <td>{n.active ? 'aktiv' : 'inaktiv'}</td>
              </tr>
            ))}
            {numbers.length === 0 && <tr><td colSpan={3} className="muted">Keine Nummern zugeordnet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Datenschutz &amp; Aufbewahrung (DSGVO)</h2>
      <div className="panel">
        <div className="grid cols-2">
          <div>
            <label>Aufbewahrungsdauer</label>
            <select
              value={retention.retentionDays}
              onChange={(e) => setRetention({ ...retention, retentionDays: Number(e.target.value) })}
            >
              {RETENTION_DAYS.map((d) => (
                <option key={d} value={d}>{d} Tage</option>
              ))}
            </select>
          </div>
          <label className="row" style={{ alignItems: 'flex-end', marginBottom: 4 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={retention.storeAudio}
              onChange={(e) => setRetention({ ...retention, storeAudio: e.target.checked })}
            />
            <span style={{ marginLeft: 8 }}>Audioaufzeichnungen speichern (Standard: aus)</span>
          </label>
        </div>
        <p className="muted" style={{ fontSize: '0.82rem' }}>
          Gespräche werden nach Ablauf der Frist automatisch gelöscht.
        </p>
        <button className="btn" style={{ marginTop: '0.5rem' }} onClick={saveRetention}>
          Speichern
        </button>
      </div>
    </>
  );
}
