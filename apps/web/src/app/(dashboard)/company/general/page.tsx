'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HeroHead, Field, SettingCard, ComingSoon } from '@/components/app';
import { Alert, Spinner } from '@/components/ui';

interface Tenant { name: string; locale: string; country: string; timezone: string }

const TIMEZONES = ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'UTC'];

export default function GeneralPage() {
  const [t, setT] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Tenant>('/api/settings/tenant').then(setT).catch((e) => setError(e.message));
  }, []);

  async function save() {
    if (!t) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      await api('/api/settings/tenant', {
        method: 'PUT',
        body: JSON.stringify({ name: t.name, locale: t.locale, country: t.country, timezone: t.timezone }),
      });
      setMsg('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  if (error && !t) return <Alert kind="error">{error}</Alert>;
  if (!t) return <Spinner />;

  return (
    <>
      <HeroHead title="Allgemein" subtitle="Stammdaten Ihres Unternehmens." />
      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <SettingCard title="Unternehmen" footer={<button className="btn" disabled={saving} onClick={save}>{saving ? 'Speichern…' : 'Speichern'}</button>}>
        <Field label="Firmenname"><input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
        <div className="grid cols-2">
          <Field label="Land">
            <select value={t.country} onChange={(e) => setT({ ...t, country: e.target.value })}>
              <option value="DE">Deutschland</option><option value="AT">Österreich</option><option value="CH">Schweiz</option>
            </select>
          </Field>
          <Field label="Zeitzone">
            <select value={t.timezone} onChange={(e) => setT({ ...t, timezone: e.target.value })}>
              {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <Field label="Standardsprache">
            <select value={t.locale} onChange={(e) => setT({ ...t, locale: e.target.value })}>
              <option value="de">Deutsch</option><option value="en">English</option>
            </select>
          </Field>
        </div>
      </SettingCard>

      <SettingCard title="Logo" description="Ihr Logo für das White-Label-Portal.">
        <ComingSoon>Der Logo-Upload wird in einer kommenden Version freigeschaltet.</ComingSoon>
      </SettingCard>
    </>
  );
}
