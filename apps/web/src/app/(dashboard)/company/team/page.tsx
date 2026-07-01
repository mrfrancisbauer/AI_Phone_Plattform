'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { ROLES, type Role } from '@ai-phone/shared';

interface TenantUser {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt?: string;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: ROLES.TENANT_ADMIN, label: 'Admin' },
  { value: ROLES.TENANT_MEMBER, label: 'Mitarbeiter' },
  { value: ROLES.READ_ONLY, label: 'Nur lesen' },
];

function roleLabel(role: string): string {
  return (
    {
      super_admin: 'Super Admin',
      tenant_admin: 'Admin',
      tenant_member: 'Mitarbeiter',
      read_only: 'Nur lesen',
    }[role] ?? role
  );
}

export default function UsersPage() {
  const { me, loading: meLoading } = useMe();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [magicLink, setMagicLink] = useState('');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>(ROLES.TENANT_MEMBER);
  const [busy, setBusy] = useState(false);

  const canManage = me?.role === ROLES.TENANT_ADMIN || me?.role === ROLES.SUPER_ADMIN;

  async function load() {
    try {
      setUsers(await api<TenantUser[]>('/api/users'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (meLoading) return <p className="muted">Lädt…</p>;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setMagicLink('');
    setBusy(true);
    try {
      const res = await api<{ userId: string; magicLink: string | null }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, name: name || undefined, role }),
      });
      setMsg(`${email} wurde hinzugefügt.`);
      if (res.magicLink) setMagicLink(res.magicLink);
      setEmail('');
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Einladen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: TenantUser, newRole: Role) {
    await api(`/api/users/${u.userId}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
    await load();
  }

  async function remove(u: TenantUser) {
    if (!confirm(`${u.email} aus dem Mandanten entfernen?`)) return;
    await api(`/api/users/${u.userId}`, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <h1>Team</h1>
      <p className="muted">Mitglieder, Rollen und Einladungen</p>
      {error && <p className="error">{error}</p>}
      {msg && <p className="success">{msg}</p>}
      {magicLink && (
        <div className="panel" style={{ borderColor: 'var(--accent)' }}>
          <strong>Login-Link</strong>
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            Einmaliger Link für den neuen Nutzer (gültig 15 Minuten):
          </p>
          <input readOnly value={magicLink} onFocus={(e) => e.target.select()} />
        </div>
      )}

      {canManage && (
        <>
          <h2>Nutzer einladen</h2>
          <div className="panel">
            <form onSubmit={invite}>
              <div className="grid cols-3">
                <div>
                  <label>E-Mail</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label>Name (optional)</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label>Rolle</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn" style={{ marginTop: '0.75rem' }} disabled={busy}>
                {busy ? 'Wird eingeladen…' : 'Einladen'}
              </button>
            </form>
          </div>
        </>
      )}

      <h2>Mitglieder</h2>
      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead><tr><th>E-Mail</th><th>Name</th><th>Rolle</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {users.map((u) => {
              const isTenantRole = ROLE_OPTIONS.some((o) => o.value === u.role);
              const editable = canManage && u.userId !== me?.userId && isTenantRole;
              const removable = canManage && u.userId !== me?.userId && u.role !== ROLES.SUPER_ADMIN;
              return (
                <tr key={u.userId}>
                  <td>{u.email}</td>
                  <td>{u.name ?? '–'}</td>
                  <td>
                    {editable ? (
                      <select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} style={{ maxWidth: 160 }}>
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="tag">{roleLabel(u.role)}</span>
                    )}
                  </td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      {removable && (
                        <button className="btn danger" onClick={() => remove(u)}>Entfernen</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {users.length === 0 && <tr><td colSpan={4} className="muted">Keine Nutzer.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
