'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { type CostBreakdown } from '@ai-phone/shared';

export default function CostsPage() {
  const { data: history } = useApi<{ month: string; total: number }[]>('/api/usage/history');

  const [seconds, setSeconds] = useState(180);
  const [inTok, setInTok] = useState(3000);
  const [outTok, setOutTok] = useState(1500);
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null);

  async function calculate() {
    const res = await api<CostBreakdown>('/api/usage/estimate', {
      method: 'POST',
      body: JSON.stringify({ durationSeconds: seconds, llmInputTokens: inTok, llmOutputTokens: outTok }),
    });
    setEstimate(res);
  }

  return (
    <>
      <h1>Analytics</h1>

      <h2>Kostenhistorie (pro Monat)</h2>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Monat</th><th>Gesamtkosten</th></tr></thead>
          <tbody>
            {(!history || history.length === 0) && (
              <tr><td colSpan={2} className="muted">Noch keine Kostendaten.</td></tr>
            )}
            {history?.map((h) => (
              <tr key={h.month}><td>{h.month}</td><td>{money(h.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Kostenrechner pro Gespräch</h2>
      <div className="panel">
        <div className="grid cols-3">
          <div>
            <label>Gesprächsdauer (Sekunden)</label>
            <input type="number" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
          </div>
          <div>
            <label>LLM Input-Tokens</label>
            <input type="number" value={inTok} onChange={(e) => setInTok(Number(e.target.value))} />
          </div>
          <div>
            <label>LLM Output-Tokens</label>
            <input type="number" value={outTok} onChange={(e) => setOutTok(Number(e.target.value))} />
          </div>
        </div>
        <button className="btn" style={{ marginTop: '1rem' }} onClick={calculate}>
          Berechnen
        </button>

        {estimate && (
          <table style={{ marginTop: '1rem' }}>
            <tbody>
              <tr><td className="muted">Telefoniekosten</td><td>{money(estimate.telephonyCost)}</td></tr>
              <tr><td className="muted">Speech-to-Text</td><td>{money(estimate.sttCost)}</td></tr>
              <tr><td className="muted">Text-to-Speech</td><td>{money(estimate.ttsCost)}</td></tr>
              <tr><td className="muted">KI-Modellkosten</td><td>{money(estimate.llmCost)}</td></tr>
              <tr><td className="muted">Zwischensumme</td><td>{money(estimate.providerSubtotal)}</td></tr>
              <tr><td className="muted">Plattformaufschlag</td><td>{money(estimate.platformMarkup)}</td></tr>
              <tr><td><strong>Gesamtkosten</strong></td><td><strong>{money(estimate.totalCost)}</strong></td></tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
