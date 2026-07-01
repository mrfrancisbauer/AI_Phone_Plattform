'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HeroHead, SettingCard, Toggle, ComingSoon } from '@/components/app';
import { Alert, Spinner } from '@/components/ui';

interface Recipient { id: string; email: string; label: string | null }

export default function NotificationsPage() {
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // Prepared toggles (persisted in a later version).
  const [costWarn, setCostWarn] = useState(true);
  const [system, setSystem] = useState(true);

  async function load() {
    try { setRecipients(await api<Recipient[]>('/api/settings/email-recipients')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }
  useEffect(() => { void load(); }, []);
  function flash(s: string) { setMsg(s); setTimeout(() => setMsg(''), 2500); }

  async function add() {
    if (!newEmail) return;
    setError('');
    try {
      await api('/api/settings/email-recipients', { method: 'POST', body: JSON.stringify({ email: newEmail }) });
      setNewEmail('');
      await load();
      flash('Empfänger hinzugefügt.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }
  async function remove(id: string) {
    await api(`/api/settings/email-recipients/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <HeroHead title="Benachrichtigungen" subtitle="Wer wird worüber informiert." />
      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <SettingCard title="Gesprächszusammenfassungen" description="Diese Adressen erhalten nach jedem Anruf die Zusammenfassung.">
        {!recipients ? <Spinner /> : (
          <>
            <div className="table-wrap">
              <table>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id}>
                      <td>{r.email}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn danger sm" onClick={() => remove(r.id)}>Entfernen</button></td>
                    </tr>
                  ))}
                  {recipients.length === 0 && <tr><td className="muted">Noch keine Empfänger — ohne Empfänger wird keine Zusammenfassung versendet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <input type="email" placeholder="team@firma.de" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ minWidth: 220 }} />
              <button className="btn" onClick={add}>Hinzufügen</button>
            </div>
          </>
        )}
      </SettingCard>

      <SettingCard title="Weitere Benachrichtigungen">
        <Toggle label="Kostenwarnungen" description="Bei 50 %, 80 % und 100 % des Monatsbudgets." checked={costWarn} onChange={setCostWarn} />
        <Toggle label="Systemmeldungen" description="Wichtige technische Hinweise zur Plattform." checked={system} onChange={setSystem} />
        <ComingSoon>Kostenwarnungen sind bereits aktiv (an die obigen Empfänger). Die individuelle Steuerung dieser Schalter folgt.</ComingSoon>
      </SettingCard>
    </>
  );
}
