'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { api, API_URL, getToken } from '@/lib/api';
import { money, duration, dateTime, leadColor } from '@/lib/format';

interface CallListItem {
  id: string;
  status: string;
  fromNumber: string;
  callerName: string | null;
  concern: string | null;
  leadCategory: string | null;
  durationSeconds: number;
  totalCost: number | null;
  startedAt: string;
}

export default function CallsPage() {
  const { data, loading, error } = useApi<{ items: CallListItem[] }>('/api/calls?limit=50');

  async function exportCsv() {
    // The CSV endpoint needs the auth header, so fetch then trigger download.
    const res = await api<Response>('/api/calls/export.csv', { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calls.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="row between">
        <h1>Gespräche</h1>
        <button className="btn secondary" onClick={exportCsv} disabled={!getToken()}>
          Export CSV
        </button>
      </div>

      {loading && <p className="muted">Lädt…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Anrufer</th>
                <th>Anliegen</th>
                <th>Lead</th>
                <th>Dauer</th>
                <th>Kosten</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Noch keine Gespräche vorhanden.
                  </td>
                </tr>
              )}
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td>{dateTime(c.startedAt)}</td>
                  <td>{c.callerName ?? c.fromNumber}</td>
                  <td>{c.concern ?? <span className="muted">–</span>}</td>
                  <td>
                    {c.leadCategory ? (
                      <span className="badge" style={{ background: leadColor(c.leadCategory) }}>
                        {c.leadCategory}
                      </span>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td>{duration(c.durationSeconds)}</td>
                  <td>{money(c.totalCost)}</td>
                  <td>
                    <Link href={`/calls/${c.id}`}>Details</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
        API: {API_URL}
      </p>
    </>
  );
}
