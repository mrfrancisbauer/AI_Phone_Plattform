'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HeroHead, SettingCard, CopyField, ComingSoon } from '@/components/app';
import { Alert } from '@/components/ui';

interface WebhookInfo { voiceWebhookUrl: string; twilioConfigured: boolean }

export default function ApiPage() {
  const [wh, setWh] = useState<WebhookInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<WebhookInfo>('/api/phone-numbers/webhook-info').then(setWh).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <HeroHead title="API & Webhooks" subtitle="Technische Integrationen und Endpunkte." />
      {error && <Alert kind="error">{error}</Alert>}

      <SettingCard title="Telefonie-Webhook" description="Diese URL hinterlegen Sie im Telefonie-Anbieter als Voice-Webhook (A call comes in).">
        {wh && <CopyField value={wh.voiceWebhookUrl} />}
        {wh && !wh.twilioConfigured && (
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
            Hinweis: Auf der Plattform sind keine Twilio-Zugangsdaten hinterlegt — die automatische Einrichtung ist deaktiviert.
          </p>
        )}
      </SettingCard>

      <SettingCard title="API-Schlüssel" description="Programmatischer Zugriff auf Ihre Gesprächsdaten.">
        <ComingSoon>Persönliche API-Schlüssel und ausgehende Webhooks (CRM, Slack, Zapier) werden in einer kommenden Version freigeschaltet.</ComingSoon>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn secondary" disabled>API-Schlüssel erstellen</button>
          <button className="btn secondary" disabled>Webhook hinzufügen</button>
        </div>
      </SettingCard>
    </>
  );
}
