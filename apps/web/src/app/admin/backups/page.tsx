'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Card, EmptyState, PageHeader, Spinner, StatusDot } from '@/components/admin/ui';

interface Backup { id: string; status: string; sizeBytes: number | null; location: string | null; note: string | null; startedAt: string; completedAt: string | null }

function sizeFmt(b: number | null): string {
  if (!b) return '–';
  const mb = b / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() { try { setBackups(await api<Backup[]>('/api/admin/backups')); } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); } }
  useEffect(() => { void load(); }, []);

  async function start() {
    setBusy(true);
    try { await api('/api/admin/backups', { method: 'POST' }); await load(); }
    finally { setBusy(false); }
  }

  const last = backups?.[0];

  return (
    <>
      <PageHeader title="Backups" subtitle="Datenbank-Sicherungen" actions={<button className="btn" disabled={busy} onClick={start}>{busy ? 'Läuft…' : 'Backup starten'}</button>} />
      {error && <p className="error">{error}</p>}
      {!backups ? <Spinner /> : (
        <>
          <div className="ac-grid k3">
            <div className="ac-stat"><div className="ac-stat-label">Letztes Backup</div><div className="ac-stat-value" style={{ fontSize: '1.1rem' }}>{last ? dateTime(last.startedAt) : '–'}</div></div>
            <div className="ac-stat"><div className="ac-stat-label">Größe</div><div className="ac-stat-value" style={{ fontSize: '1.1rem' }}>{sizeFmt(last?.sizeBytes ?? null)}</div></div>
            <div className="ac-stat"><div className="ac-stat-label">Status</div><div className="ac-stat-value" style={{ fontSize: '1.1rem' }}>{last ? <StatusDot status={last.status} label={last.status} /> : '–'}</div></div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <Card title="Verlauf">
              <table>
                <thead><tr><th>Start</th><th>Status</th><th>Größe</th><th>Ablage</th><th></th></tr></thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td>{dateTime(b.startedAt)}</td>
                      <td><StatusDot status={b.status} label={b.status} /></td>
                      <td>{sizeFmt(b.sizeBytes)}</td>
                      <td className="muted">{b.location ?? '–'}</td>
                      <td><button className="btn secondary" disabled title="Restore erfordert ein konfiguriertes Backup-Ziel">Restore</button> <button className="btn secondary" disabled>Download</button></td>
                    </tr>
                  ))}
                  {backups.length === 0 && <tr><td colSpan={5}><EmptyState>Noch keine Backups.</EmptyState></td></tr>}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 8 }}>
                Backups werden als Metadaten erfasst. Für echte Dumps konfigurieren Sie ein Backup-Ziel (z. B. pg_dump → Object Storage) in der Infrastruktur.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
