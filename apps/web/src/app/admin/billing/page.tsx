'use client';

import { useEffect, useState } from 'react';
import { api, API_URL, getToken } from '@/lib/api';
import { money } from '@/lib/format';
import { Card, PageHeader, Spinner, StatCard } from '@/components/admin/ui';

interface Billing {
  range: string; openaiCost: number; telephonyCost: number; sttCost: number; ttsCost: number;
  platformMarkup: number; revenue: number; profit: number; markupPercent: number; mrr: number; arr: number; events: number;
}

export default function BillingPage() {
  const [range, setRange] = useState<'today' | 'month' | 'year'>('month');
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api<Billing>(`/api/admin/billing?range=${range}`).then(setData).catch((e) => setError(e.message)); }, [range]);

  async function exportCsv() {
    const res = await api<Response>('/api/admin/billing/export.csv', { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'platform-billing.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Abrechnung"
        subtitle="Plattformweite Kosten, Umsatz und Gewinn"
        actions={
          <div className="row">
            <select value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
              <option value="today">Heute</option><option value="month">Monat</option><option value="year">Jahr</option>
            </select>
            <button className="btn secondary" onClick={exportCsv} disabled={!getToken()}>Export CSV</button>
          </div>
        }
      />
      {error && <p className="error">{error}</p>}
      {!data ? <Spinner /> : (
        <>
          <div className="ac-grid k4">
            <StatCard label="Plattformumsatz" value={money(data.revenue)} accent="blue" />
            <StatCard label="Gewinn" value={money(data.profit)} accent="green" hint={`Aufschlag ${Math.round(data.markupPercent * 100)} %`} />
            <StatCard label="MRR" value={money(data.mrr)} accent="green" />
            <StatCard label="ARR" value={money(data.arr)} accent="green" />
          </div>
          <div className="ac-grid k4" style={{ marginTop: '0.9rem' }}>
            <StatCard label="OpenAI Kosten" value={money(data.openaiCost)} />
            <StatCard label="Telefoniekosten" value={money(data.telephonyCost)} />
            <StatCard label="Speech-to-Text" value={money(data.sttCost)} />
            <StatCard label="Text-to-Speech" value={money(data.ttsCost)} />
          </div>
          <div style={{ marginTop: '1rem' }}>
            <Card title="Hinweis">
              <p className="muted" style={{ margin: 0 }}>
                {data.events} Usage-Events im Zeitraum. Excel/PDF-Export sowie Stripe-Rechnungsstellung sind für die
                spätere Billing-Ausbaustufe vorgesehen; der CSV-Export ist sofort verfügbar. API: {API_URL}
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
