'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { money, dateTime } from '@/lib/format';
import { Alert, Badge, EmptyState, PageHeader, Pagination, StatusDot, Toolbar } from '@/components/admin/ui';
import { TenantWizard } from '@/components/admin/TenantWizard';

interface TenantRow {
  id: string; name: string; slug: string; industry: string | null; plan: string;
  status: string; phoneNumber: string | null; users: number; calls: number; cost: number; createdAt: string;
}
interface ListResp { total: number; page: number; pageSize: number; items: TenantRow[] }

export default function TenantsPage() {
  const [data, setData] = useState<ListResp | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const [wizard, setWizard] = useState(false);
  const [magicLink, setMagicLink] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (plan) params.set('plan', plan);
    try {
      setData(await api<ListResp>(`/api/admin/tenants?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  }, [page, q, status, plan]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(t: TenantRow) {
    await api(`/api/admin/tenants/${t.id}/${t.status === 'paused' ? 'resume' : 'pause'}`, { method: 'POST' });
    await load();
  }
  async function remove(t: TenantRow) {
    if (!confirm(`Mandant „${t.name}" und ALLE Daten unwiderruflich löschen?`)) return;
    await api(`/api/admin/tenants/${t.id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <PageHeader
        title="Mandanten"
        subtitle="Alle Kunden der Plattform"
        actions={<button className="btn" onClick={() => setWizard(true)}>+ Mandant erstellen</button>}
      />

      {magicLink && (
        <div className="ac-card" style={{ borderColor: 'var(--accent)', marginBottom: '1rem' }}>
          <strong>Login-Link für den neuen Admin</strong>
          <input readOnly value={magicLink} onFocus={(e) => e.target.select()} style={{ marginTop: 6 }} />
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <Toolbar>
        <input placeholder="Suche (Name, Slug)…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Alle Status</option><option value="active">Aktiv</option><option value="paused">Pausiert</option>
        </select>
        <select value={plan} onChange={(e) => { setPage(1); setPlan(e.target.value); }}>
          <option value="">Alle Pläne</option><option value="starter">Starter</option><option value="business">Business</option><option value="enterprise">Enterprise</option>
        </select>
      </Toolbar>

      <div className="ac-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <th>Name</th><th>Branche</th><th>Plan</th><th>Status</th><th>Telefon</th><th>Calls</th><th>Kosten</th><th>Erstellt</th><th></th>
          </tr></thead>
          <tbody>
            {data?.items.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/admin/tenants/${t.id}`}><strong>{t.name}</strong></Link><div className="muted" style={{ fontSize: '0.78rem' }}>{t.slug}</div></td>
                <td>{t.industry ?? '–'}</td>
                <td><Badge>{t.plan}</Badge></td>
                <td><StatusDot status={t.status} label={t.status === 'active' ? 'Aktiv' : 'Pausiert'} /></td>
                <td>{t.phoneNumber ?? <span className="muted">–</span>}</td>
                <td>{t.calls}</td>
                <td>{money(t.cost)}</td>
                <td className="muted">{dateTime(t.createdAt)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary" onClick={() => toggle(t)}>{t.status === 'paused' ? 'Aktivieren' : 'Deaktivieren'}</button>{' '}
                  <button className="btn danger" onClick={() => remove(t)}>Löschen</button>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={9}><EmptyState>Keine Mandanten gefunden.</EmptyState></td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      {wizard && (
        <TenantWizard
          onClose={() => setWizard(false)}
          onCreated={(link) => { setWizard(false); setMagicLink(link ?? ''); void load(); }}
        />
      )}
    </>
  );
}
