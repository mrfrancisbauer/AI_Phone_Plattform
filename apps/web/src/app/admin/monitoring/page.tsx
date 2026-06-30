'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, PageHeader, Spinner, StatusDot } from '@/components/admin/ui';

interface Mon {
  services: { name: string; status: string }[];
  resources: { cpuPct: number; ramPct: number; ramUsedMb: number; ramTotalMb: number; diskPct: number | null; loadAvg: number[]; uptimeSeconds: number };
}

function Gauge({ label, pct, suffix }: { label: string; pct: number | null; suffix?: string }) {
  const color = pct == null ? '#9ca3af' : pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return (
    <div className="ac-stat">
      <div className="ac-stat-label">{label}</div>
      <div className="ac-stat-value">{pct == null ? 'n/a' : `${pct}%`}{suffix && <span className="muted" style={{ fontSize: '0.8rem' }}> {suffix}</span>}</div>
      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct ?? 0}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const [data, setData] = useState<Mon | null>(null);
  const [error, setError] = useState('');

  async function load() { try { setData(await api<Mon>('/api/admin/monitoring')); } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); } }
  useEffect(() => { void load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <Spinner />;

  const upH = Math.floor(data.resources.uptimeSeconds / 3600);

  return (
    <>
      <PageHeader title="Monitoring" subtitle="Health-Dashboard (Auto-Refresh alle 15 s)" />
      <Card title="Dienste">
        <div className="ac-grid k3">
          {data.services.map((s) => (
            <div key={s.name} className="row between" style={{ padding: '0.5rem 0.2rem' }}>
              <span>{s.name}</span>
              <StatusDot status={s.status} label={s.status === 'not_configured' ? 'n/a' : s.status === 'console' ? 'console' : s.status === 'ok' ? 'OK' : s.status} />
            </div>
          ))}
        </div>
      </Card>
      <div className="ac-grid k3" style={{ marginTop: '1rem' }}>
        <Gauge label="CPU" pct={data.resources.cpuPct} />
        <Gauge label="RAM" pct={data.resources.ramPct} suffix={`${data.resources.ramUsedMb}/${data.resources.ramTotalMb} MB`} />
        <Gauge label="Festplatte" pct={data.resources.diskPct} />
      </div>
      <p className="muted" style={{ fontSize: '0.82rem', marginTop: 10 }}>
        Load: {data.resources.loadAvg.join(' · ')} · Uptime: {upH} h · Festplatten-Metrik erfordert Host-Zugriff (im Container-Deployment einbinden).
      </p>
    </>
  );
}
