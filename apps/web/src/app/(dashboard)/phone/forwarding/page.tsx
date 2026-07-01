'use client';

import { HeroHead, SettingCard, Field, Toggle, ComingSoon } from '@/components/app';
import { useState } from 'react';

export default function ForwardingPage() {
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState('');

  return (
    <>
      <HeroHead title="Rufumleitung" subtitle="Leiten Sie Anrufe bei Bedarf an einen Menschen weiter." />

      <SettingCard title="Weiterleitung" description="Wann und wohin soll der Assistent an einen Mitarbeiter übergeben?">
        <Toggle label="Weiterleitung aktivieren" description="Bei komplexen Anliegen an eine echte Person übergeben." checked={enabled} onChange={setEnabled} />
        <Field label="Zielrufnummer" hint="An diese Nummer wird bei Bedarf weitergeleitet.">
          <input placeholder="+49 …" value={number} onChange={(e) => setNumber(e.target.value)} disabled={!enabled} style={{ maxWidth: 280 }} />
        </Field>
        <ComingSoon>Live Call Transfer und Öffnungszeiten-Logik werden in einer kommenden Version freigeschaltet. Ihre Einstellungen dienen bereits als Vorschau.</ComingSoon>
      </SettingCard>
    </>
  );
}
