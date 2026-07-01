'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RETENTION_DAYS } from '@ai-phone/shared';
import { HeroHead, Field, SettingCard, Toggle } from '@/components/app';
import { Alert, Spinner } from '@/components/ui';

interface Retention { retentionDays: number; storeAudio: boolean }

export default function PrivacyPage() {
  const [r, setR] = useState<Retention | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Retention>('/api/settings/retention').then(setR).catch((e) => setError(e.message));
  }, []);

  async function save() {
    if (!r) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      await api('/api/settings/retention', { method: 'PUT', body: JSON.stringify(r) });
      setMsg('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  if (error && !r) return <Alert kind="error">{error}</Alert>;
  if (!r) return <Spinner />;

  return (
    <>
      <HeroHead title="Datenschutz" subtitle="Aufbewahrung und Umgang mit Gesprächsdaten (DSGVO)." />
      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <SettingCard title="Aufbewahrung & Löschung" footer={<button className="btn" disabled={saving} onClick={save}>{saving ? 'Speichern…' : 'Speichern'}</button>}>
        <Field label="Aufbewahrungsdauer" hint="Gespräche werden nach Ablauf der Frist automatisch gelöscht.">
          <select value={r.retentionDays} onChange={(e) => setR({ ...r, retentionDays: Number(e.target.value) })} style={{ maxWidth: 240 }}>
            {RETENTION_DAYS.map((d) => <option key={d} value={d}>{d} Tage</option>)}
          </select>
        </Field>
        <Toggle
          label="Audioaufzeichnungen speichern"
          description="Standardmäßig aus — es werden nur Transkripte und Zusammenfassungen gespeichert (Datenminimierung)."
          checked={r.storeAudio}
          onChange={(v) => setR({ ...r, storeAudio: v })}
        />
      </SettingCard>
    </>
  );
}
