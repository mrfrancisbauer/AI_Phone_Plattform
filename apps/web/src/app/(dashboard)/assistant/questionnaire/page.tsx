'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { QUESTION_TYPES, type QuestionType } from '@ai-phone/shared';

interface QEditQuestion {
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  order: number;
  options?: { value: string; label: string }[];
  scaleMin?: number;
  scaleMax?: number;
  condition?: { questionKey: string; operator: string; value?: string | number | boolean } | null;
}

interface Questionnaire {
  id: string;
  name: string;
  questions: QEditQuestion[];
}

const TYPE_LABELS: Record<QuestionType, string> = {
  free_text: 'Freitext',
  yes_no: 'Ja/Nein',
  multiple_choice: 'Mehrfachauswahl',
  scale: 'Skala',
  datetime: 'Datum/Uhrzeit',
  phone: 'Telefonnummer',
  email: 'E-Mail',
  budget: 'Budget',
  urgency: 'Dringlichkeit',
};

export default function QuestionnairePage() {
  const [q, setQ] = useState<Questionnaire | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Questionnaire[]>('/api/questionnaires')
      .then((list) => setQ(list[0] ?? { id: '', name: 'Neuer Fragebogen', questions: [] }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function update(idx: number, patch: Partial<QEditQuestion>) {
    if (!q) return;
    const questions = q.questions.map((qq, i) => (i === idx ? { ...qq, ...patch } : qq));
    setQ({ ...q, questions });
    setSaved(false);
  }

  function addQuestion() {
    if (!q) return;
    setQ({
      ...q,
      questions: [
        ...q.questions,
        { key: `frage_${q.questions.length + 1}`, prompt: '', type: 'free_text', required: false, order: q.questions.length + 1 },
      ],
    });
  }

  function removeQuestion(idx: number) {
    if (!q) return;
    setQ({ ...q, questions: q.questions.filter((_, i) => i !== idx) });
  }

  function move(idx: number, dir: -1 | 1) {
    if (!q) return;
    const target = idx + dir;
    if (target < 0 || target >= q.questions.length) return;
    const arr = [...q.questions];
    [arr[idx], arr[target]] = [arr[target]!, arr[idx]!];
    setQ({ ...q, questions: arr.map((qq, i) => ({ ...qq, order: i + 1 })) });
  }

  async function save() {
    if (!q) return;
    setError('');
    setSaved(false);
    const payload = {
      name: q.name,
      questions: q.questions.map((qq, i) => ({ ...qq, order: i + 1 })),
    };
    try {
      if (q.id) {
        await api(`/api/questionnaires/${q.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const created = await api<Questionnaire>('/api/questionnaires', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setQ((prev) => (prev ? { ...prev, id: created.id } : prev));
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    }
  }

  if (loading) return <p className="muted">Lädt…</p>;
  if (!q) return <p className="error">{error}</p>;

  return (
    <>
      <div className="row between">
        <h1>Fragebogen</h1>
        <button className="btn" onClick={save}>
          Speichern
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">Gespeichert.</p>}

      <div className="panel">
        <label>Name des Fragebogens</label>
        <input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} />
      </div>

      {q.questions.map((qq, idx) => (
        <div key={idx} className="panel" style={{ marginTop: '1rem' }}>
          <div className="row between">
            <strong>Frage {idx + 1}</strong>
            <div className="row">
              <button className="btn secondary" onClick={() => move(idx, -1)} title="Nach oben">↑</button>
              <button className="btn secondary" onClick={() => move(idx, 1)} title="Nach unten">↓</button>
              <button className="btn danger" onClick={() => removeQuestion(idx)}>Entfernen</button>
            </div>
          </div>

          <div className="grid cols-2">
            <div>
              <label>Schlüssel (intern)</label>
              <input value={qq.key} onChange={(e) => update(idx, { key: e.target.value })} />
            </div>
            <div>
              <label>Typ</label>
              <select value={qq.type} onChange={(e) => update(idx, { type: e.target.value as QuestionType })}>
                {Object.values(QUESTION_TYPES).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label>Fragetext (wird vorgelesen)</label>
          <input value={qq.prompt} onChange={(e) => update(idx, { prompt: e.target.value })} />

          {qq.type === 'multiple_choice' && (
            <div>
              <label>Optionen (Komma-getrennt)</label>
              <input
                value={(qq.options ?? []).map((o) => o.label).join(', ')}
                onChange={(e) =>
                  update(idx, {
                    options: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((label) => ({ value: label.toLowerCase().replace(/\s+/g, '_'), label })),
                  })
                }
              />
            </div>
          )}

          {qq.type === 'scale' && (
            <div className="grid cols-2">
              <div>
                <label>Min</label>
                <input type="number" value={qq.scaleMin ?? 1} onChange={(e) => update(idx, { scaleMin: Number(e.target.value) })} />
              </div>
              <div>
                <label>Max</label>
                <input type="number" value={qq.scaleMax ?? 10} onChange={(e) => update(idx, { scaleMax: Number(e.target.value) })} />
              </div>
            </div>
          )}

          <div className="grid cols-2" style={{ marginTop: '0.5rem' }}>
            <label className="row" style={{ margin: 0 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={qq.required}
                onChange={(e) => update(idx, { required: e.target.checked })}
              />
              <span style={{ marginLeft: 8 }}>Pflichtfeld</span>
            </label>
          </div>

          <details style={{ marginTop: '0.75rem' }}>
            <summary className="muted">Bedingte Folgefrage</summary>
            <div className="grid cols-3" style={{ marginTop: '0.5rem' }}>
              <div>
                <label>Abhängig von (Schlüssel)</label>
                <input
                  value={qq.condition?.questionKey ?? ''}
                  onChange={(e) =>
                    update(idx, {
                      condition: e.target.value
                        ? { questionKey: e.target.value, operator: qq.condition?.operator ?? 'equals', value: qq.condition?.value }
                        : null,
                    })
                  }
                />
              </div>
              <div>
                <label>Operator</label>
                <select
                  value={qq.condition?.operator ?? 'equals'}
                  onChange={(e) =>
                    update(idx, { condition: { ...(qq.condition ?? { questionKey: '' }), operator: e.target.value } })
                  }
                >
                  <option value="equals">ist gleich</option>
                  <option value="not_equals">ungleich</option>
                  <option value="gte">größer/gleich</option>
                  <option value="lte">kleiner/gleich</option>
                  <option value="truthy">vorhanden/ja</option>
                </select>
              </div>
              <div>
                <label>Wert</label>
                <input
                  value={qq.condition?.value === undefined ? '' : String(qq.condition.value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value = raw === 'true' ? true : raw === 'false' ? false : raw;
                    update(idx, { condition: { ...(qq.condition ?? { questionKey: '', operator: 'equals' }), value } });
                  }}
                />
              </div>
            </div>
          </details>
        </div>
      ))}

      <button className="btn secondary" style={{ marginTop: '1rem' }} onClick={addQuestion}>
        + Frage hinzufügen
      </button>
    </>
  );
}
