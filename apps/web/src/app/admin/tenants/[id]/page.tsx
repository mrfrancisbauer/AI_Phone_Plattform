'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { money, duration, dateTime, leadColor } from '@/lib/format';
import { Badge, Card, PageHeader, Spinner, StatCard, StatusDot } from '@/components/admin/ui';
import { PLANS } from '@ai-phone/shared';

interface Detail {
  id: string; name: string; slug: string; industry: string | null; country: string; timezone: string; locale: string;
  plan: string; status: string; telephonyMode: string; openaiMode: string;
  monthlyBudgetLimit: number | null; autoPauseOnBudget: boolean; createdAt: string;
  counts: { tenantUsers: number; phoneNumbers: number; calls: number; assistants: number };
  retention: { retentionDays: number; storeAudio: boolean } | null;
  phoneNumbers: { id: string; provider: string; e164: string; active: boolean }[];
  assistants: { id: string; name: string; locale: string; questionnaireId: string | null }[];
  cost: { total: number; openai: number; telephony: number };
  recentCalls: { id: string; status: string; leadCategory: string | null; durationSeconds: number; totalCost: number | null; startedAt: string }[];
}
interface TUser { userId: string; email: string; name: string | null; role: string; locked: boolean; lastLoginAt: string | null }

const TABS = ['Übersicht', 'Benutzer', 'Telefonnummern', 'Fragebogen', 'Assistent', 'Gespräche', 'Kosten', 'Logs', 'API Keys', 'DSGVO', 'Einstellungen'] as const;

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Übersicht');
  const [d, setD] = useState<Detail | null>(null);
  const [users, setUsers] = useState<TUser[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    try { setD(await api<Detail>(`/api/admin/tenants/${id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }
  useEffect(() => { void load(); }, [id]);
  useEffect(() => { if (tab === 'Benutzer' && !users) api<TUser[]>(`/api/admin/tenants/${id}/users`).then(setUsers).catch(() => {}); }, [tab, users, id]);

  if (error) return <p className="error">{error}</p>;
  if (!d) return <Spinner />;

  return (
    <>
      <PageHeader
        title={d.name}
        subtitle={`${d.slug} · ${d.industry ?? '–'} · ${d.country}`}
        actions={<><Badge>{d.plan}</Badge> <StatusDot status={d.status} label={d.status === 'active' ? 'Aktiv' : 'Pausiert'} /></>}
      />
      {msg && <p className="success">{msg}</p>}

      <div className="ac-tabs">
        {TABS.map((t) => <button key={t} className={`ac-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Übersicht' && (
        <>
          <div className="ac-grid k4">
            <StatCard label="Benutzer" value={d.counts.tenantUsers} />
            <StatCard label="Nummern" value={d.counts.phoneNumbers} />
            <StatCard label="Calls" value={d.counts.calls} />
            <StatCard label="Kosten gesamt" value={money(d.cost.total)} />
          </div>
          <div style={{ marginTop: '1rem' }}>
            <Card title="Stammdaten">
              <dl className="ac-kv">
                <dt>Plan</dt><dd>{d.plan}</dd>
                <dt>Sprache / Zeitzone</dt><dd>{d.locale} · {d.timezone}</dd>
                <dt>Telefonie</dt><dd>{d.telephonyMode}</dd>
                <dt>OpenAI</dt><dd>{d.openaiMode}</dd>
                <dt>Monatsbudget</dt><dd>{d.monthlyBudgetLimit ? money(d.monthlyBudgetLimit) : '–'} {d.autoPauseOnBudget ? '(Auto-Stopp)' : ''}</dd>
                <dt>Aufbewahrung</dt><dd>{d.retention?.retentionDays ?? 90} Tage</dd>
                <dt>Erstellt</dt><dd>{dateTime(d.createdAt)}</dd>
              </dl>
            </Card>
          </div>
        </>
      )}

      {tab === 'Benutzer' && (
        <Card title="Benutzer des Mandanten">
          {!users ? <Spinner /> : (
            <table><thead><tr><th>E-Mail</th><th>Name</th><th>Rolle</th><th>Status</th><th>Letzter Login</th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.userId}><td>{u.email}</td><td>{u.name ?? '–'}</td><td><Badge>{u.role}</Badge></td>
                  <td><StatusDot status={u.locked ? 'locked' : 'active'} label={u.locked ? 'Gesperrt' : 'Aktiv'} /></td>
                  <td className="muted">{u.lastLoginAt ? dateTime(u.lastLoginAt) : '–'}</td></tr>
              ))}</tbody></table>
          )}
        </Card>
      )}

      {tab === 'Telefonnummern' && (
        <Card title="Telefonnummern">
          <table><thead><tr><th>Nummer</th><th>Provider</th><th>Status</th></tr></thead>
            <tbody>{d.phoneNumbers.map((p) => <tr key={p.id}><td>{p.e164}</td><td>{p.provider}</td><td><StatusDot status={p.active ? 'active' : 'down'} label={p.active ? 'Aktiv' : 'Inaktiv'} /></td></tr>)}
              {d.phoneNumbers.length === 0 && <tr><td colSpan={3} className="muted">Keine Nummern.</td></tr>}</tbody></table>
        </Card>
      )}

      {tab === 'Fragebogen' && (
        <Card title="Fragebögen">
          <p className="muted">Dem Mandanten zugeordnete Assistenten verweisen auf folgende Fragebögen. Die inhaltliche Bearbeitung erfolgt im Mandanten-Kontext.</p>
          <table><thead><tr><th>Assistent</th><th>Fragebogen verknüpft</th></tr></thead>
            <tbody>{d.assistants.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.questionnaireId ? <StatusDot status="ok" label="Ja" /> : <span className="muted">Nein</span>}</td></tr>)}</tbody></table>
        </Card>
      )}

      {tab === 'Assistent' && (
        <Card title="Assistenten">
          <table><thead><tr><th>Name</th><th>Sprache</th></tr></thead>
            <tbody>{d.assistants.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.locale}</td></tr>)}
              {d.assistants.length === 0 && <tr><td colSpan={2} className="muted">Kein Assistent.</td></tr>}</tbody></table>
        </Card>
      )}

      {tab === 'Gespräche' && (
        <Card title="Letzte Gespräche">
          <table><thead><tr><th>Zeit</th><th>Status</th><th>Lead</th><th>Dauer</th><th>Kosten</th></tr></thead>
            <tbody>{d.recentCalls.map((c) => (
              <tr key={c.id}><td>{dateTime(c.startedAt)}</td><td>{c.status}</td>
                <td>{c.leadCategory ? <Badge color={leadColor(c.leadCategory)}>{c.leadCategory}</Badge> : '–'}</td>
                <td>{duration(c.durationSeconds)}</td><td>{money(c.totalCost)}</td></tr>
            ))}{d.recentCalls.length === 0 && <tr><td colSpan={5} className="muted">Keine Gespräche.</td></tr>}</tbody></table>
        </Card>
      )}

      {tab === 'Kosten' && (
        <div className="ac-grid k3">
          <StatCard label="Gesamtkosten" value={money(d.cost.total)} />
          <StatCard label="OpenAI" value={money(d.cost.openai)} />
          <StatCard label="Telefonie" value={money(d.cost.telephony)} />
        </div>
      )}

      {tab === 'Logs' && (
        <Card title="Logs">
          <p className="muted">Plattform-Logs sind im Bereich <strong>Logs</strong> einsehbar. Admin-Aktionen für diesen Mandanten erscheinen im <strong>Audit Log</strong>.</p>
        </Card>
      )}

      {tab === 'API Keys' && (
        <Card title="API-Quellen">
          <dl className="ac-kv">
            <dt>Telefonie</dt><dd>{d.telephonyMode === 'platform_twilio' ? 'Plattform-Twilio' : d.telephonyMode}</dd>
            <dt>OpenAI</dt><dd>{d.openaiMode === 'platform' ? 'Plattform-Key' : 'Eigener Key'}</dd>
          </dl>
          <p className="muted" style={{ fontSize: '0.82rem' }}>Aus Sicherheitsgründen werden keine Schlüssel im Klartext angezeigt. Mandantenspezifische Credentials werden verschlüsselt gespeichert.</p>
        </Card>
      )}

      {tab === 'DSGVO' && <GdprTab tenant={d} onMsg={setMsg} />}
      {tab === 'Einstellungen' && <SettingsTab tenant={d} reload={load} onMsg={setMsg} onDeleted={() => router.push('/admin/tenants')} />}
    </>
  );
}

function GdprTab({ tenant, onMsg }: { tenant: Detail; onMsg: (s: string) => void }) {
  return (
    <Card title="DSGVO">
      <dl className="ac-kv"><dt>Aufbewahrung</dt><dd>{tenant.retention?.retentionDays ?? 90} Tage</dd><dt>Audio speichern</dt><dd>{tenant.retention?.storeAudio ? 'Ja' : 'Nein'}</dd></dl>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 12 }}>
        Auskunfts- und Löschanfragen werden im Mandanten-Dashboard unter „Einstellungen → Datenschutz" (Export/Erase nach Telefonnummer) bearbeitet. Einzelne Gespräche können hier anonymisiert werden (Tab „Gespräche" → Anonymisieren). Die vollständige Mandantenlöschung erfolgt im Tab „Einstellungen".
      </p>
      <button className="btn secondary" onClick={() => onMsg('Hinweis: Export pro Telefonnummer im Mandanten-Dashboard verfügbar.')}>Auskunfts-Workflow anzeigen</button>
    </Card>
  );
}

function SettingsTab({ tenant, reload, onMsg, onDeleted }: { tenant: Detail; reload: () => Promise<void>; onMsg: (s: string) => void; onDeleted: () => void }) {
  const [plan, setPlan] = useState(tenant.plan);
  const [budget, setBudget] = useState(tenant.monthlyBudgetLimit?.toString() ?? '');
  const [autoStop, setAutoStop] = useState(tenant.autoPauseOnBudget);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/tenants/${tenant.id}`, { method: 'PUT', body: JSON.stringify({ plan, monthlyBudgetLimit: budget ? Number(budget) : null, autoPauseOnBudget: autoStop }) });
      onMsg('Gespeichert.');
      await reload();
    } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm(`Mandant „${tenant.name}" und ALLE Daten unwiderruflich löschen?`)) return;
    await api(`/api/admin/tenants/${tenant.id}`, { method: 'DELETE' });
    onDeleted();
  }

  return (
    <Card title="Einstellungen">
      <div className="ac-grid k2">
        <div><label>Plan</label><select value={plan} onChange={(e) => setPlan(e.target.value)}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div><label>Monatsbudget (EUR)</label><input type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
      </div>
      <label className="row" style={{ marginTop: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={autoStop} onChange={(e) => setAutoStop(e.target.checked)} /><span style={{ marginLeft: 8 }}>Automatischer Stopp bei 100 %</span></label>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" disabled={busy} onClick={save}>Speichern</button>
        <button className="btn danger" onClick={del}>Mandant löschen</button>
      </div>
    </Card>
  );
}
