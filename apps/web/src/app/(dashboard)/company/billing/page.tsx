'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { HeroHead, Field, SettingCard, Toggle, ComingSoon } from '@/components/app';
import { Alert, Spinner } from '@/components/ui';

interface Tenant { monthlyBudgetLimit: number | null; autoPauseOnBudget: boolean }
interface HistItem { month: string; total: number }

export default function BillingPage() {
  const [t, setT] = useState<Tenant | null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api<Tenant>('/api/settings/tenant'), api<HistItem[]>('/api/usage/history')])
      .then(([tt, h]) => { setT(tt); setHistory(h); })
      .catch((e) => setError(e.message));
  }, []);

  async function save() {
    if (!t) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      await api('/api/settings/tenant', { method: 'PUT', body: JSON.stringify({ monthlyBudgetLimit: t.monthlyBudgetLimit, autoPauseOnBudget: t.autoPauseOnBudget }) });
      setMsg('Gespeichert.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setSaving(false); }
  }

  if (error && !t) return <Alert kind="error">{error}</Alert>;
  if (!t) return <Spinner />;

  return (
    <>
      <HeroHead title="Abrechnung" subtitle="Budget, Warnschwellen und Rechnungen." />
      {msg && <Alert kind="success">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <SettingCard title="Monatsbudget" description="Legen Sie ein Kostenlimit fest. Warnungen gehen automatisch bei 50 %, 80 % und 100 % raus." footer={<button className="btn" disabled={saving} onClick={save}>{saving ? 'Speichern…' : 'Speichern'}</button>}>
        <Field label="Kostenlimit (EUR / Monat)">
          <input type="number" step="0.01" value={t.monthlyBudgetLimit ?? ''} onChange={(e) => setT({ ...t, monthlyBudgetLimit: e.target.value ? Number(e.target.value) : null })} style={{ maxWidth: 240 }} />
        </Field>
        <Toggle label="Automatisch pausieren bei 100 %" description="Stoppt neue Anrufe, sobald das Budget erreicht ist." checked={t.autoPauseOnBudget} onChange={(v) => setT({ ...t, autoPauseOnBudget: v })} />
      </SettingCard>

      <SettingCard title="Kostenhistorie">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Monat</th><th>Gesamtkosten</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={2} className="muted">Noch keine Kostendaten.</td></tr>}
              {history.map((h) => <tr key={h.month}><td>{h.month}</td><td>{money(h.total)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </SettingCard>

      <SettingCard title="Rechnungen">
        <ComingSoon>Die automatische Rechnungsstellung über Stripe wird in Kürze aktiviert.</ComingSoon>
      </SettingCard>
    </>
  );
}
