'use client';

import { useApi } from '@/lib/useApi';
import { Card, PageHeader, Spinner } from '@/components/admin/ui';

interface SysInfo {
  appVersion: string; build: string; nodeVersion: string; prismaVersion: string; dbVersion: string;
  migrationsApplied: string[]; env: string; uptimeSeconds: number;
}

export default function SystemPage() {
  const { data, loading, error } = useApi<SysInfo>('/api/admin/system');
  if (loading) return <Spinner />;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  return (
    <>
      <PageHeader title="System" subtitle="Systeminformationen" />
      <div className="ac-grid k2">
        <Card title="Versionen">
          <dl className="ac-kv">
            <dt>App-Version</dt><dd>{data.appVersion}</dd>
            <dt>Build</dt><dd>{data.build}</dd>
            <dt>Umgebung</dt><dd>{data.env}</dd>
            <dt>Node</dt><dd>{data.nodeVersion}</dd>
            <dt>Prisma</dt><dd>{data.prismaVersion}</dd>
            <dt>Datenbank</dt><dd>{data.dbVersion}</dd>
            <dt>Uptime</dt><dd>{Math.floor(data.uptimeSeconds / 3600)} h {Math.floor((data.uptimeSeconds % 3600) / 60)} min</dd>
          </dl>
        </Card>
        <Card title={`Migrationen (${data.migrationsApplied.length})`}>
          {data.migrationsApplied.length === 0 ? (
            <p className="muted">Keine Migrationsdaten verfügbar.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
              {data.migrationsApplied.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
