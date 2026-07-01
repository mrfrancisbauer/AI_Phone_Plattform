'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert } from '@/components/ui';
import { ASSISTANT_TASKS, VOICE_PERSONAS } from '@ai-phone/shared';

const STEPS = ['Unternehmen', 'Website', 'Aufgabe', 'Sprache', 'Stimme', 'Telefonie', 'Fertig'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [task, setTask] = useState('reception');
  const [locale, setLocale] = useState('de');
  const [voiceId, setVoiceId] = useState(VOICE_PERSONAS[0]!.voiceId);
  const [addNumberNow, setAddNumberNow] = useState(true);

  useEffect(() => {
    api<{ name: string }>('/api/settings/tenant').then((t) => setCompany((c) => c || t.name)).catch(() => {});
  }, []);

  const taskDef = ASSISTANT_TASKS.find((t) => t.id === task)!;

  function buildSystemPrompt() {
    return `Du bist der freundliche, professionelle KI-Telefonassistent von ${company || 'unserem Unternehmen'}.

Deine Hauptaufgabe: ${taskDef.label} — ${taskDef.description}

Regeln:
- Sprich natürlich, höflich und ${locale === 'en' ? 'auf Englisch' : 'auf Deutsch'}. Stelle immer nur eine Frage auf einmal.
- Erfinde niemals Informationen und gib keine verbindlichen Zusagen.
- Wenn du etwas nicht sicher weißt, sage: "Das kann ich nicht zuverlässig beantworten, ich gebe es an das Team weiter."
- Fasse am Ende kurz zusammen und frage, ob alles korrekt ist.`;
  }

  async function finish() {
    setBusy(true);
    setError('');
    try {
      // Reuse the existing assistant if one exists; otherwise create it.
      const existing = await api<{ id: string }[]>('/api/assistants');
      if (existing.length === 0) {
        await api('/api/assistants', {
          method: 'POST',
          body: JSON.stringify({
            name: `${company || 'Ihr'} Assistent`,
            greetingText: `Guten Tag, hier ist der digitale Assistent von ${company || 'unserem Unternehmen'}.`,
            consentText:
              'Hinweis: Dieses Gespräch wird von einem KI-Assistenten geführt und zur Bearbeitung Ihres Anliegens transkribiert. Sind Sie damit einverstanden?',
            systemPrompt: buildSystemPrompt(),
            voice: voiceId,
            locale,
            recordAudio: false,
          }),
        });
      }
      await api('/api/settings/tenant', { method: 'PUT', body: JSON.stringify({ name: company }) }).catch(() => {});
      router.push(addNumberNow ? '/phone' : '/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Einrichtung fehlgeschlagen');
      setBusy(false);
    }
  }

  const canNext =
    (step === 0 && company.trim().length > 1) ||
    step === 1 || step === 2 || step === 3 || step === 4 || step === 5;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="hero-head">
        <h1>Assistent einrichten</h1>
        <p>In wenigen Schritten ist Ihr KI-Telefonassistent startklar.</p>
      </div>

      <div className="ac-steps" style={{ marginBottom: '1.5rem' }}>
        {STEPS.map((s, i) => (
          <div key={s} className={`ac-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>{i + 1}. {s}</div>
        ))}
      </div>

      <div className="setting-card">
        <div className="body">
          {error && <Alert kind="error">{error}</Alert>}

          {step === 0 && (
            <>
              <label style={{ marginTop: 0 }}>Wie heißt Ihr Unternehmen?</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Muster GmbH" autoFocus />
            </>
          )}
          {step === 1 && (
            <>
              <label style={{ marginTop: 0 }}>Ihre Website (optional)</label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://ihre-firma.de" />
              <p className="muted" style={{ fontSize: '0.85rem' }}>Später kann Ihr Assistent daraus lernen.</p>
            </>
          )}
          {step === 2 && (
            <>
              <label style={{ marginTop: 0 }}>Was soll Ihr Assistent vor allem tun?</label>
              <div className="choice-grid">
                {ASSISTANT_TASKS.map((t) => (
                  <button key={t.id} className={`choice${task === t.id ? ' active' : ''}`} onClick={() => setTask(t.id)}>
                    <span className="choice-title">{t.label}</span>
                    <span className="choice-sub">{t.description}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <label style={{ marginTop: 0 }}>In welcher Sprache spricht Ihr Assistent?</label>
              <div className="choice-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button className={`choice${locale === 'de' ? ' active' : ''}`} onClick={() => setLocale('de')}><span className="choice-title">🇩🇪 Deutsch</span></button>
                <button className={`choice${locale === 'en' ? ' active' : ''}`} onClick={() => setLocale('en')}><span className="choice-title">🇬🇧 English</span></button>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <label style={{ marginTop: 0 }}>Welche Stimme passt zu Ihnen?</label>
              <div className="choice-grid">
                {VOICE_PERSONAS.map((p) => (
                  <button key={p.id} className={`choice${voiceId === p.voiceId ? ' active' : ''}`} onClick={() => setVoiceId(p.voiceId)}>
                    <span className="choice-badge">{p.gender}</span>
                    <span className="choice-title">{p.name}</span>
                    <span className="choice-sub">{p.description}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <label style={{ marginTop: 0 }}>Telefonnummer</label>
              <div className="choice-grid" style={{ gridTemplateColumns: '1fr' }}>
                <button className={`choice${addNumberNow ? ' active' : ''}`} onClick={() => setAddNumberNow(true)}>
                  <span className="choice-title">Jetzt eine Nummer verbinden</span>
                  <span className="choice-sub">Im Anschluss führen wir Sie durch die Anbindung.</span>
                </button>
                <button className={`choice${!addNumberNow ? ' active' : ''}`} onClick={() => setAddNumberNow(false)}>
                  <span className="choice-title">Später einrichten</span>
                  <span className="choice-sub">Sie können jederzeit unter „Telefonnummern" fortfahren.</span>
                </button>
              </div>
            </>
          )}
          {step === 6 && (
            <>
              <h3 style={{ marginTop: 0 }}>Zusammenfassung</h3>
              <dl className="ac-kv">
                <dt>Unternehmen</dt><dd>{company}</dd>
                <dt>Aufgabe</dt><dd>{taskDef.label}</dd>
                <dt>Sprache</dt><dd>{locale === 'en' ? 'English' : 'Deutsch'}</dd>
                <dt>Stimme</dt><dd>{VOICE_PERSONAS.find((p) => p.voiceId === voiceId)?.name}</dd>
                <dt>Telefonnummer</dt><dd>{addNumberNow ? 'im Anschluss verbinden' : 'später'}</dd>
              </dl>
              <p className="muted" style={{ fontSize: '0.88rem' }}>Wir erstellen jetzt Ihren Assistenten. Feineinstellungen können Sie danach jederzeit anpassen.</p>
            </>
          )}
        </div>
        <footer>
          {step > 0 && <button className="btn secondary" disabled={busy} onClick={() => setStep((s) => s - 1)}>Zurück</button>}
          {step < STEPS.length - 1 ? (
            <button className="btn" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Weiter</button>
          ) : (
            <button className="btn" disabled={busy} onClick={finish}>{busy ? 'Wird erstellt…' : 'Assistent erstellen'}</button>
          )}
        </footer>
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: 12 }}>
        <a href="/">Später einrichten</a>
      </p>
    </div>
  );
}
