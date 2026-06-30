'use client';

import { useApi } from '@/lib/useApi';
import { money, duration } from '@/lib/format';

interface Stats {
  totalCalls: number;
  totalDurationSeconds: number;
  monthToDateSpend: number;
  monthlyBudgetLimit: number | null;
  series: { date: string; calls: number; durationSeconds: number; cost: number }[];
}

export default function OverviewPage() {
  const { data, loading, error } = useApi<Stats>('/api/usage/stats?days=30');

  if (loading) return <p className="muted">Lädt…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const budgetPct =
    data.monthlyBudgetLimit && data.monthlyBudgetLimit > 0
      ? Math.min(100, Math.round((data.monthToDateSpend / data.monthlyBudgetLimit) * 100))
      : null;

  const maxCalls = Math.max(1, ...data.series.map((s) => s.calls));

  return (
    <>
      <h1>Übersicht</h1>
      <p className="muted">Letzte 30 Tage</p>

      <div className="grid cols-4" style={{ marginTop: '1rem' }}>
        <div className="stat">
          <div className="label">Anrufe</div>
          <div className="value">{data.totalCalls}</div>
        </div>
        <div className="stat">
          <div className="label">Gesamtdauer</div>
          <div className="value">{duration(data.totalDurationSeconds)}</div>
        </div>
        <div className="stat">
          <div className="label">Kosten (Monat)</div>
          <div className="value">{money(data.monthToDateSpend)}</div>
        </div>
        <div className="stat">
          <div className="label">Monatsbudget</div>
          <div className="value">{data.monthlyBudgetLimit ? money(data.monthlyBudgetLimit) : '–'}</div>
        </div>
      </div>

      {budgetPct !== null && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="row between">
            <strong>Budgetauslastung</strong>
            <span className={budgetPct >= 80 ? 'error' : 'muted'}>{budgetPct}%</span>
          </div>
          <div
            style={{
              height: 10,
              background: '#eef2f7',
              borderRadius: 999,
              marginTop: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${budgetPct}%`,
                height: '100%',
                background: budgetPct >= 80 ? 'var(--danger)' : 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}

      <h2>Anrufe pro Tag</h2>
      <div className="panel">
        {data.series.length === 0 ? (
          <p className="muted">Noch keine Anrufe.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160 }}>
            {data.series.map((s) => (
              <div key={s.date} style={{ flex: 1, textAlign: 'center' }} title={`${s.date}: ${s.calls} Anrufe`}>
                <div
                  style={{
                    height: `${(s.calls / maxCalls) * 130}px`,
                    background: 'var(--accent)',
                    borderRadius: '4px 4px 0 0',
                  }}
                />
                <div className="muted" style={{ fontSize: '0.6rem', marginTop: 4 }}>
                  {s.date.slice(5)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
