'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Alert, Badge, EmptyState, PageHeader, Pagination, StatusDot, Toolbar } from '@/components/admin/ui';

interface URow { userId: string; email: string; name: string | null; tenantId: string; tenantName: string; role: string; status: string; lastLoginAt: string | null }
interface Resp { total: number; page: number; pageSize: number; items: URow[] }

const ROLE_OPTIONS = ['tenant_admin', 'tenant_member', 'read_only', 'platform_support', 'billing', 'super_admin'];

export default function AdminUsersPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (q) params.set('q', q);
    try { setData(await api<Resp>(`/api/admin/users?${params}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  }, [page, q]);
  useEffect(() => { void load(); }, [load]);

  function flash(s: string) { setMsg(s); setTimeout(() => setMsg(''), 6000); }

  async function resetPw(u: URow) {
    const r = await api<{ tempPassword: string }>(`/api/admin/users/${u.userId}/reset-password`, { method: 'POST' });
    flash(`Temporäres Passwort für ${u.email}: ${r.tempPassword}`);
  }
  async function magicLink(u: URow) {
    const r = await api<{ magicLink: string }>(`/api/admin/users/${u.userId}/magic-link`, { method: 'POST' });
    flash(`Magic Link für ${u.email}: ${r.magicLink}`);
  }
  async function toggleLock(u: URow) {
    await api(`/api/admin/users/${u.userId}/${u.status === 'locked' ? 'unlock' : 'lock'}`, { method: 'POST' });
    await load();
  }
  async function changeRole(u: URow, role: string) {
    await api(`/api/admin/users/${u.userId}/role`, { method: 'PUT', body: JSON.stringify({ role, tenantId: u.tenantId }) });
    await load();
  }
  async function remove(u: URow) {
    if (!confirm(`Benutzer ${u.email} löschen?`)) return;
    await api(`/api/admin/users/${u.userId}`, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <PageHeader title="Benutzer" subtitle="Globale Benutzerverwaltung" />
      {msg && <div className="ac-card" style={{ borderColor: 'var(--accent)', marginBottom: '1rem' }}><span style={{ wordBreak: 'break-all' }}>{msg}</span></div>}
      {error && <Alert kind="error">{error}</Alert>}

      <Toolbar><input placeholder="Suche (E-Mail, Name)…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} /></Toolbar>

      <div className="ac-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>E-Mail</th><th>Mandant</th><th>Rolle</th><th>Status</th><th>Letzter Login</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={`${u.userId}-${u.tenantId}`}>
                <td>{u.name ?? '–'}</td>
                <td>{u.email}</td>
                <td>{u.tenantName}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ minWidth: 150 }}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td><StatusDot status={u.status} label={u.status === 'locked' ? 'Gesperrt' : 'Aktiv'} /></td>
                <td className="muted">{u.lastLoginAt ? dateTime(u.lastLoginAt) : '–'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary" onClick={() => resetPw(u)}>Passwort</button>{' '}
                  <button className="btn secondary" onClick={() => magicLink(u)}>Link</button>{' '}
                  <button className="btn secondary" onClick={() => toggleLock(u)}>{u.status === 'locked' ? 'Entsperren' : 'Sperren'}</button>{' '}
                  <button className="btn danger" onClick={() => remove(u)}>Löschen</button>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={7}><EmptyState>Keine Benutzer.</EmptyState></td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
