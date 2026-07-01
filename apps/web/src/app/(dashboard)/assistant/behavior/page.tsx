'use client';

import { useState } from 'react';
import { HeroHead, SettingCard, Toggle, ComingSoon } from '@/components/app';

interface Behavior {
  appointments: boolean;
  leads: boolean;
  messages: boolean;
  faq: boolean;
  support: boolean;
  forwarding: boolean;
}

const DEFAULTS: Behavior = { appointments: true, leads: true, messages: true, faq: true, support: false, forwarding: false };

export default function BehaviorPage() {
  const [b, setB] = useState<Behavior>(DEFAULTS);
  const set = (k: keyof Behavior) => (v: boolean) => setB((prev) => ({ ...prev, [k]: v }));

  return (
    <>
      <HeroHead title="Verhalten" subtitle="Legen Sie fest, welche Aufgaben Ihr Assistent übernimmt." />

      <SettingCard title="Fähigkeiten" description="Aktivieren Sie, was Ihr Assistent am Telefon tun soll.">
        <Toggle label="Termine vereinbaren" description="Rückrufe und Terminwünsche erfassen." checked={b.appointments} onChange={set('appointments')} />
        <Toggle label="Leads aufnehmen" description="Neue Interessenten qualifizieren und speichern." checked={b.leads} onChange={set('leads')} />
        <Toggle label="Nachrichten aufnehmen" description="Anliegen als Nachricht für Ihr Team festhalten." checked={b.messages} onChange={set('messages')} />
        <Toggle label="FAQ beantworten" description="Häufige Fragen automatisch beantworten." checked={b.faq} onChange={set('faq')} />
        <Toggle label="Support" description="Support-Anliegen aufnehmen und einordnen." checked={b.support} onChange={set('support')} />
        <Toggle label="Weiterleitungen" description="Bei Bedarf an einen Menschen weiterleiten." checked={b.forwarding} onChange={set('forwarding')} badge="Bald" />
      </SettingCard>

      <ComingSoon>
        Diese Fähigkeiten werden aktuell über den Fragebogen und den System-Prompt gesteuert. Die direkte Speicherung
        der Schalter folgt in einer kommenden Version — Ihre Auswahl dient bereits als Vorschau.
      </ComingSoon>
    </>
  );
}
