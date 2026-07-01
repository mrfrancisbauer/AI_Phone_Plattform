'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Msg {
  role: 'assistant' | 'caller';
  text: string;
}

export default function SimulatorPage() {
  const [assistants, setAssistants] = useState<{ id: string; name: string }[]>([]);
  const [assistantId, setAssistantId] = useState('');
  const [callId, setCallId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ id: string; name: string }[]>('/api/assistants')
      .then((list) => {
        setAssistants(list);
        if (list[0]) setAssistantId(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function start() {
    setError('');
    setMessages([]);
    setEnded(false);
    try {
      const res = await api<{ callId: string; say: string }>('/api/simulate/start', {
        method: 'POST',
        body: JSON.stringify({ assistantId }),
      });
      setCallId(res.callId);
      setMessages([{ role: 'assistant', text: res.say }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Start fehlgeschlagen');
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!callId || !input.trim()) return;
    const text = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'caller', text }]);
    try {
      const res = await api<{ say: string; action: 'gather' | 'hangup' }>(
        `/api/simulate/${callId}/say`,
        { method: 'POST', body: JSON.stringify({ text }) },
      );
      setMessages((m) => [...m, { role: 'assistant', text: res.say }]);
      if (res.action === 'hangup') setEnded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  }

  return (
    <>
      <h1>Testanruf</h1>
      <p className="muted">
        Testen Sie den Assistenten und den Fragebogen, bevor Sie live gehen — ohne echten Anruf.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <div className="row">
          <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)} style={{ maxWidth: 280 }}>
            {assistants.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn" onClick={start} disabled={!assistantId}>
            {callId ? 'Neu starten' : 'Gespräch starten'}
          </button>
        </div>
      </div>

      {callId && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 8 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'assistant' ? 'flex-start' : 'flex-end',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    maxWidth: '75%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 12,
                    background: m.role === 'assistant' ? '#eef2f7' : 'var(--primary)',
                    color: m.role === 'assistant' ? 'var(--text)' : '#fff',
                  }}
                >
                  {m.text}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {ended ? (
            <p className="success">Gespräch beendet. Zusammenfassung wurde erstellt und E-Mails versendet.</p>
          ) : (
            <form onSubmit={send} className="row" style={{ marginTop: '0.75rem' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Antwort des Anrufers…"
                autoFocus
              />
              <button className="btn" type="submit">Senden</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
