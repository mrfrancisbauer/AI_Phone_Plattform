'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { money, duration, dateTime, leadColor } from '@/lib/format';

interface CallDetail {
  id: string;
  status: string;
  fromNumber: string;
  consentGiven: boolean;
  callerEmailConsent: boolean;
  leadCategory: string | null;
  durationSeconds: number;
  totalCost: number | null;
  startedAt: string;
  endedAt: string | null;
  summary: {
    callerName: string | null;
    callerEmail: string | null;
    concern: string | null;
    summary: string;
    leadCategory: string;
    recommendedAction: string;
  } | null;
  answers: { questionKey: string; type: string; value: unknown }[];
  transcript: { role: string; text: string; at: string }[];
  usage: {
    sttCost: number;
    ttsCost: number;
    llmCost: number;
    telephonyCost: number;
    platformMarkup: number;
    totalCost: number;
  } | null;
}

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error } = useApi<CallDetail>(`/api/calls/${id}`);

  async function remove() {
    if (!confirm('Dieses Gespräch endgültig löschen (DSGVO)?')) return;
    await api(`/api/calls/${id}`, { method: 'DELETE' });
    router.push('/calls');
  }

  if (loading) return <p className="muted">Lädt…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  return (
    <>
      <div className="row between">
        <h1>Gespräch</h1>
        <button className="btn danger" onClick={remove}>
          Löschen
        </button>
      </div>
      <p className="muted">
        {dateTime(data.startedAt)} · {duration(data.durationSeconds)} ·{' '}
        {data.leadCategory && (
          <span className="badge" style={{ background: leadColor(data.leadCategory) }}>
            Lead {data.leadCategory}
          </span>
        )}
      </p>

      <div className="grid cols-2">
        <div className="panel">
          <h3>Kontakt</h3>
          <table>
            <tbody>
              <tr><td className="muted">Name</td><td>{data.summary?.callerName ?? '–'}</td></tr>
              <tr><td className="muted">Telefon</td><td>{data.fromNumber}</td></tr>
              <tr><td className="muted">E-Mail</td><td>{data.summary?.callerEmail ?? '–'}</td></tr>
              <tr><td className="muted">Einwilligung</td><td>{data.consentGiven ? 'Ja' : 'Nein'}</td></tr>
              <tr><td className="muted">E-Mail-Versand erlaubt</td><td>{data.callerEmailConsent ? 'Ja' : 'Nein'}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Kostenaufstellung</h3>
          {data.usage ? (
            <table>
              <tbody>
                <tr><td className="muted">Telefonie</td><td>{money(data.usage.telephonyCost)}</td></tr>
                <tr><td className="muted">Speech-to-Text</td><td>{money(data.usage.sttCost)}</td></tr>
                <tr><td className="muted">Text-to-Speech</td><td>{money(data.usage.ttsCost)}</td></tr>
                <tr><td className="muted">KI-Modell</td><td>{money(data.usage.llmCost)}</td></tr>
                <tr><td className="muted">Plattformaufschlag</td><td>{money(data.usage.platformMarkup)}</td></tr>
                <tr><td><strong>Gesamt</strong></td><td><strong>{money(data.usage.totalCost)}</strong></td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">Noch keine Kostendaten.</p>
          )}
        </div>
      </div>

      {data.summary && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <h3>Zusammenfassung</h3>
          <p>{data.summary.summary}</p>
          <p className="muted"><strong>Anliegen:</strong> {data.summary.concern ?? '–'}</p>
          <p className="muted"><strong>Empfohlene Aktion:</strong> {data.summary.recommendedAction}</p>
        </div>
      )}

      <h2>Strukturierte Antworten</h2>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Frage</th><th>Antwort</th></tr></thead>
          <tbody>
            {data.answers.length === 0 && <tr><td colSpan={2} className="muted">Keine Antworten.</td></tr>}
            {data.answers.map((a) => (
              <tr key={a.questionKey}>
                <td className="muted">{a.questionKey}</td>
                <td>{String((a.value as { toString?: () => string }) ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Transkript</h2>
      <div className="panel">
        {data.transcript.length === 0 && <p className="muted">Kein Transkript.</p>}
        {data.transcript.map((m, i) => (
          <div key={i} style={{ marginBottom: '0.6rem' }}>
            <span className="tag">{m.role === 'assistant' ? 'Assistent' : m.role === 'caller' ? 'Anrufer' : 'System'}</span>{' '}
            {m.text}
          </div>
        ))}
      </div>
    </>
  );
}
