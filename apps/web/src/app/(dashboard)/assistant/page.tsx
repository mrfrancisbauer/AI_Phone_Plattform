'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Assistant {
  id: string;
  name: string;
  greetingText: string;
  consentText: string;
  systemPrompt: string;
  voice: string;
  locale: string;
  recordAudio: boolean;
  questionnaireId: string | null;
}

export default function AssistantPage() {
  const [a, setA] = useState<Assistant | null>(null);
  const [questionnaires, setQuestionnaires] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<Assistant[]>('/api/assistants'), api<{ id: string; name: string }[]>('/api/questionnaires')])
      .then(([assistants, qs]) => {
        setA(assistants[0] ?? null);
        setQuestionnaires(qs);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!a) return;
    setError('');
    setSaved(false);
    try {
      await api(`/api/assistants/${a.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: a.name,
          greetingText: a.greetingText,
          consentText: a.consentText,
          systemPrompt: a.systemPrompt,
          voice: a.voice,
          locale: a.locale,
          recordAudio: a.recordAudio,
          questionnaireId: a.questionnaireId,
        }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    }
  }

  if (loading) return <p className="muted">Lädt…</p>;
  if (!a) return <p className="muted">Noch kein Assistent konfiguriert.</p>;

  return (
    <>
      <div className="row between">
        <h1>Assistent</h1>
        <button className="btn" onClick={save}>Speichern</button>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Gespeichert.</p>}

      <div className="panel">
        <label>Name</label>
        <input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />

        <label>Begrüßungstext</label>
        <textarea rows={2} value={a.greetingText} onChange={(e) => setA({ ...a, greetingText: e.target.value })} />

        <label>Einwilligungstext (DSGVO, am Gesprächsanfang)</label>
        <textarea rows={3} value={a.consentText} onChange={(e) => setA({ ...a, consentText: e.target.value })} />

        <label>Systemprompt</label>
        <textarea rows={12} value={a.systemPrompt} onChange={(e) => setA({ ...a, systemPrompt: e.target.value })} />

        <div className="grid cols-3">
          <div>
            <label>Stimme</label>
            <input value={a.voice} onChange={(e) => setA({ ...a, voice: e.target.value })} />
          </div>
          <div>
            <label>Sprache</label>
            <select value={a.locale} onChange={(e) => setA({ ...a, locale: e.target.value })}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label>Fragebogen</label>
            <select
              value={a.questionnaireId ?? ''}
              onChange={(e) => setA({ ...a, questionnaireId: e.target.value || null })}
            >
              <option value="">– keiner –</option>
              {questionnaires.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="row" style={{ marginTop: '1rem' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={a.recordAudio}
            onChange={(e) => setA({ ...a, recordAudio: e.target.checked })}
          />
          <span style={{ marginLeft: 8 }}>
            Audioaufzeichnung speichern (standardmäßig aus — nur Transkripte, Datenminimierung)
          </span>
        </label>
      </div>
    </>
  );
}
