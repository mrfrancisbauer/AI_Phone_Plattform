'use client';

import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { money, duration } from '@/lib/format';
import { Alert, Bars, Card, Donut, PageHeader, Spinner, StatCard, StatusDot } from '@/components/admin/ui';

/** Warn the operator to top up the routing-number pool at/below this count. */
const ROUTING_POOL_LOW = 3;

interface DashboardData {
  kpis: {
    tenantsTotal: number; tenantsActive: number; activeNumbers: number;
    callsToday: number; callsMonth: number; minutesMonth: number;
    openaiCost: number; telephonyCost: number; platformRevenue: number; profit: number;
    mrr: number; arr: number; routingPoolAvailable: number; apiStatus: string; dbStatus: string;
  };
  charts: {
    callsPerDay: { date: string; value: number }[];
    costPerDay: { date: string; value: number }[];
    newTenants: { date: string; value: number }[];
    avgDuration: { date: string; value: number }[];
    leadDistribution: Record<string, number>;
  };
}

export default function AdminDashboard() {
  const { data, loading, error } = useApi<DashboardData>('/api/admin/dashboard?days=30');
  if (loading) return <Spinner />;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;
  const k = data.kpis;
  const c = data.charts;

  return (
    <>
      <PageHeader title="Plattform-Dashboard" subtitle="Überblick über alle Mandanten" />

      {k.routingPoolAvailable <= ROUTING_POOL_LOW && (
        <Alert kind={k.routingPoolAvailable === 0 ? 'error' : 'warning'}>
          {k.routingPoolAvailable === 0
            ? 'Der Weiterleitungs-Pool ist leer — neue Kunden können ihre Nummer nicht behalten. '
            : `Der Weiterleitungs-Pool ist fast leer (${k.routingPoolAvailable} verfügbar). `}
          <Link href="/admin/phone-numbers">Nummern zum Pool hinzufügen →</Link>
        </Alert>
      )}

      <div className="ac-grid k4">
        <StatCard label="Mandanten" value={k.tenantsTotal} hint={`${k.tenantsActive} aktiv`} />
        <StatCard label="Aktive Nummern" value={k.activeNumbers} />
        <StatCard label="Calls heute" value={k.callsToday} />
        <StatCard label="Calls Monat" value={k.callsMonth} hint={`${k.minutesMonth} Minuten`} />
      </div>

      <div className="ac-grid k4" style={{ marginTop: '0.9rem' }}>
        <StatCard label="OpenAI Kosten" value={money(k.openaiCost)} hint="laufender Monat" />
        <StatCard label="Telefoniekosten" value={money(k.telephonyCost)} hint="laufender Monat" />
        <StatCard label="Plattformumsatz" value={money(k.platformRevenue)} accent="blue" />
        <StatCard label="Gewinn (Aufschlag)" value={money(k.profit)} accent="green" />
      </div>

      <div className="ac-grid k4" style={{ marginTop: '0.9rem' }}>
        <StatCard label="MRR" value={money(k.mrr)} accent="green" />
        <StatCard label="ARR" value={money(k.arr)} accent="green" />
        <StatCard label="API Status" value={<StatusDot status={k.apiStatus} label={k.apiStatus === 'ok' ? 'Online' : 'Fehler'} />} />
        <StatCard label="Datenbank" value={<StatusDot status={k.dbStatus} label={k.dbStatus === 'ok' ? 'Online' : 'Offline'} />} />
      </div>

      <div className="ac-grid k2" style={{ marginTop: '1.1rem' }}>
        <Card title="Calls pro Tag"><Bars data={c.callsPerDay} /></Card>
        <Card title="Kosten pro Tag"><Bars data={c.costPerDay} color="#16a34a" format={(v) => money(v)} /></Card>
        <Card title="Neue Mandanten"><Bars data={c.newTenants} color="#8b5cf6" /></Card>
        <Card title="Ø Gesprächsdauer"><Bars data={c.avgDuration} color="#f59e0b" format={(v) => duration(v)} /></Card>
      </div>

      <div style={{ marginTop: '1.1rem' }}>
        <Card title="Lead-Verteilung">
          <Donut
            segments={[
              { label: 'A-Lead', value: c.leadDistribution.A ?? 0, color: '#16a34a' },
              { label: 'B-Lead', value: c.leadDistribution.B ?? 0, color: '#f59e0b' },
              { label: 'C-Lead', value: c.leadDistribution.C ?? 0, color: '#9ca3af' },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
