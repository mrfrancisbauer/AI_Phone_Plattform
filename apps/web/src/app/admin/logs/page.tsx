'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Alert, Card, EmptyState, PageHeader, StatusDot, Toolbar } from '@/components/admin/ui';

interface Log { id: string; level: string; channel: string; message: string; createdAt: string }

const CHANNELS = ['', 'api', 'login', 'openai', 'telephony', 'webhook', 'system', 'error'];

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '200' });
    if (channel) params.set('channel', channel);
    if (q) params.set('q', q);
    try { setLogs(await api<Log[]>(`/api/admin/logs?${params}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }, [channel, q]);
  useEffect(() => { void load(); }, [load]);

  function download() {
    const text = logs.map((l) => `${l.createdAt}\t${l.level}\t${l.channel}\t${l.message}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'logs.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Logs" subtitle="Plattform-Ereignisse" actions={<button className="btn secondary" onClick={download}>Download</button>} />
      {error && <Alert kind="error">{error}</Alert>}
      <Toolbar>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS.map((c) => <option key={c} value={c}>{c || 'Alle Kanäle'}</option>)}
        </select>
        <input placeholder="Suche…" value={q} onChange={(e) => setQ(e.target.value)} />
      </Toolbar>
      <Card>
        <div className="ac-log">
          <div className="ac-log-line" style={{ fontWeight: 600, color: 'var(--muted)' }}><span>Zeit</span><span>Level</span><span>Kanal</span><span>Nachricht</span></div>
          {logs.map((l) => (
            <div key={l.id} className="ac-log-line">
              <span className="muted">{dateTime(l.createdAt)}</span>
              <span><StatusDot status={l.level} label={l.level} /></span>
              <span>{l.channel}</span>
              <span>{l.message}</span>
            </div>
          ))}
          {logs.length === 0 && <EmptyState>Keine Logs.</EmptyState>}
        </div>
      </Card>
    </>
  );
}
