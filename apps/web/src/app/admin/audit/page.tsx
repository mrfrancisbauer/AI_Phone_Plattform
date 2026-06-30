'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Card, EmptyState, PageHeader, Toolbar } from '@/components/admin/ui';

interface Audit { id: string; actorEmail: string | null; action: string; tenantName: string; targetType: string | null; targetId: string | null; ip: string | null; userAgent: string | null; createdAt: string }

function browser(ua: string | null): string {
  if (!ua) return '–';
  if (/Edg/.test(ua)) return 'Edge';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Safari/.test(ua)) return 'Safari';
  return ua.slice(0, 24);
}

export default function AuditPage() {
  const [rows, setRows] = useState<Audit[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '200' });
    if (q) params.set('q', q);
    try { setRows(await api<Audit[]>(`/api/admin/audit?${params}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }, [q]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Jede Admin-Aktion wird protokolliert" />
      {error && <p className="error">{error}</p>}
      <Toolbar><input placeholder="Suche (Aktion, Benutzer)…" value={q} onChange={(e) => setQ(e.target.value)} /></Toolbar>
      <Card>
        <table>
          <thead><tr><th>Zeit</th><th>Benutzer</th><th>Aktion</th><th>Mandant</th><th>IP</th><th>Browser</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted">{dateTime(r.createdAt)}</td>
                <td>{r.actorEmail ?? '–'}</td>
                <td><code>{r.action}</code></td>
                <td>{r.tenantName}</td>
                <td className="muted">{r.ip ?? '–'}</td>
                <td className="muted">{browser(r.userAgent)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><EmptyState>Keine Audit-Einträge.</EmptyState></td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
