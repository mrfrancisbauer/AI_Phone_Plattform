'use client';

import { useState } from 'react';
import { HeroHead, Field, SettingCard, ComingSoon } from '@/components/app';

export default function KnowledgePage() {
  const [url, setUrl] = useState('');

  return (
    <>
      <HeroHead title="Wissen" subtitle="Geben Sie Ihrem Assistenten Kontext für präzisere Antworten." />

      <SettingCard title="Website" description="Ihr Assistent kann Inhalte Ihrer Website als Wissensbasis nutzen.">
        <Field label="Website-URL" hint="z. B. https://ihre-firma.de">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ihre-firma.de" />
        </Field>
        <ComingSoon>Das Anlernen von Website-Inhalten wird in Kürze aktiviert. Die URL können Sie bereits hinterlegen.</ComingSoon>
      </SettingCard>

      <SettingCard title="Dokumente" description="PDFs, FAQ und weitere Dokumente als Wissensquelle (in Vorbereitung).">
        <div
          style={{
            border: '2px dashed var(--border-strong)',
            borderRadius: 'var(--radius)',
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--muted)',
          }}
        >
          📄 Dateien hierher ziehen oder auswählen<br />
          <span style={{ fontSize: '0.85rem' }}>PDF, DOCX, TXT — bald verfügbar</span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn secondary" disabled>PDF hochladen</button>
          <button className="btn secondary" disabled>FAQ hinzufügen</button>
        </div>
        <ComingSoon>Der Upload von Dokumenten und FAQs wird in einer kommenden Version freigeschaltet.</ComingSoon>
      </SettingCard>
    </>
  );
}
