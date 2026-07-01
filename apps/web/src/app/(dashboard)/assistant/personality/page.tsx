'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAssistant, type Assistant } from '@/lib/useAssistant';
import { HeroHead, Field, SettingCard } from '@/components/app';
import { Alert, Spinner } from '@/components/ui';
import { VOICE_PERSONAS, personaByVoiceId } from '@ai-phone/shared';

export default function PersonalityPage() {
  const { assistant, setAssistant, loading, error } = useAssistant();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  // System voices load asynchronously in most browsers — request them once so
  // they are ready by the time the user clicks the preview button.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!assistant) return <Alert kind="info">Noch kein Assistent vorhanden. Bitte richten Sie zuerst Ihren Assistenten ein.</Alert>;

  const persona = personaByVoiceId(assistant.voice);

  function set<K extends keyof Assistant>(k: K, v: Assistant[K]) {
    setAssistant((prev) => (prev ? { ...prev, [k]: v } : prev));
    setMsg('');
  }

  // Browser preview: system voices can't match the real neural phone voices,
  // but each persona must at least sound DIFFERENT here — so pick a distinct
  // locale-matching system voice per persona and shade it with pitch/rate.
  // Previously every persona used the same default voice, which made the
  // selector feel broken.
  function preview() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(assistant!.greetingText || 'Guten Tag, wie kann ich Ihnen helfen?');
    const lang = assistant!.locale === 'en' ? 'en' : 'de';
    u.lang = lang === 'en' ? 'en-US' : 'de-DE';

    const personaIndex = Math.max(0, VOICE_PERSONAS.findIndex((p) => p.voiceId === assistant!.voice));
    const matching = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
    if (matching.length > 0) u.voice = matching[personaIndex % matching.length]!;

    const tuning: Record<string, { pitch: number; rate: number }> = {
      anna: { pitch: 1.0, rate: 1.0 },
      david: { pitch: 0.75, rate: 0.95 },
      lisa: { pitch: 1.2, rate: 1.08 },
      julia: { pitch: 1.05, rate: 0.9 },
      alex: { pitch: 0.9, rate: 1.0 },
    };
    const t = tuning[VOICE_PERSONAS[personaIndex]?.id ?? 'anna'] ?? { pitch: 1, rate: 1 };
    u.pitch = t.pitch;
    u.rate = t.rate;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function save() {
    setSaving(true);
    setSaveError('');
    setMsg('');
    try {
      await api(`/api/assistants/${assistant!.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: assistant!.name,
          locale: assistant!.locale,
          voice: assistant!.voice,
          greetingText: assistant!.greetingText,
          consentText: assistant!.consentText,
        }),
      });
      setMsg('Gespeichert.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <HeroHead title="Persönlichkeit" subtitle="Wie Ihr Assistent klingt und Anrufer begrüßt." />
      {msg && <Alert kind="success">{msg}</Alert>}
      {saveError && <Alert kind="error">{saveError}</Alert>}

      <SettingCard
        title="Grunddaten"
        description="Name und Sprache Ihres Assistenten."
        footer={<button className="btn" disabled={saving} onClick={save}>{saving ? 'Speichern…' : 'Speichern'}</button>}
      >
        <div className="grid cols-2">
          <Field label="Name des Assistenten">
            <input value={assistant.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Sprache">
            <select value={assistant.locale} onChange={(e) => set('locale', e.target.value)}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>

        <label style={{ marginTop: '0.5rem' }}>Stimme</label>
        <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {VOICE_PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`choice${assistant.voice === p.voiceId ? ' active' : ''}`}
              onClick={() => set('voice', p.voiceId)}
            >
              <span className="choice-badge">{p.gender}</span>
              <span className="choice-title">{p.name}</span>
              <span className="choice-sub">{p.style}</span>
              <span className="choice-sub">{p.description}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn secondary sm" onClick={preview} type="button">▶ Hörprobe ({persona.name})</button>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Nur grobe Browser-Vorschau — am Telefon klingt der Assistent mit einer hochwertigen neuralen Stimme deutlich natürlicher.</span>
        </div>
      </SettingCard>

      <SettingCard
        title="Begrüßung & Einwilligung"
        description="Der erste Satz, den Anrufer hören, und der DSGVO-Einwilligungstext."
        footer={<button className="btn" disabled={saving} onClick={save}>{saving ? 'Speichern…' : 'Speichern'}</button>}
      >
        <Field label="Begrüßungstext" hint="Wird direkt zu Beginn des Anrufs gesprochen.">
          <textarea rows={2} value={assistant.greetingText} onChange={(e) => set('greetingText', e.target.value)} />
        </Field>
        <Field label="DSGVO-Einwilligungstext" hint="Wird nach der Begrüßung vorgelesen; ohne Zustimmung endet der Anruf höflich.">
          <textarea rows={3} value={assistant.consentText} onChange={(e) => set('consentText', e.target.value)} />
        </Field>
      </SettingCard>

      <ExpertMode assistantId={assistant.id} systemPrompt={assistant.systemPrompt} onSaved={(sp) => set('systemPrompt', sp)} />
    </>
  );
}

function ExpertMode({ assistantId, systemPrompt, onSaved }: { assistantId: string; systemPrompt: string; onSaved: (v: string) => void }) {
  const [value, setValue] = useState(systemPrompt);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await api(`/api/assistants/${assistantId}`, { method: 'PUT', body: JSON.stringify({ systemPrompt: value }) });
      onSaved(value);
      setMsg('Gespeichert.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="setting-card" style={{ padding: 0 }}>
      <summary style={{ cursor: 'pointer', padding: '1.1rem 1.35rem', fontWeight: 600, listStyle: 'none' }}>
        ⚙ Expertenmodus <span className="muted" style={{ fontWeight: 400, fontSize: '0.88rem' }}>— System-Prompt & KI-Parameter (optional)</span>
      </summary>
      <div className="body" style={{ paddingTop: 0 }}>
        {msg && <Alert kind={msg === 'Gespeichert.' ? 'success' : 'error'}>{msg}</Alert>}
        <Field label="System-Prompt" hint="Steuert Ton und Regeln des Assistenten. Nur für fortgeschrittene Nutzer.">
          <textarea rows={10} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Modell, Temperatur und weitere KI-Parameter werden zentral von der Plattform verwaltet, um gleichbleibende Qualität sicherzustellen.
        </p>
        <button className="btn" disabled={saving} onClick={save}>{saving ? 'Speichern…' : 'System-Prompt speichern'}</button>
      </div>
    </details>
  );
}
