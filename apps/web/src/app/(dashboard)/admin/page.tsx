'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { money } from '@/lib/format';
import { ROLES } from '@ai-phone/shared';

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  paused: boolean;
  monthlyBudgetLimit: number | null;
  users: number;
  phoneNumbers: number;
  calls: number;
  createdAt: string;
}

export default function AdminPage() {
  const { me, loading: meLoading } = useMe();
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [magicLink, setMagicLink] = useState('');

  // Provision form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setTenants(await api<AdminTenant[]>('/api/admin/tenants'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  }

  useEffect(() => {
    if (me?.role === ROLES.SUPER_ADMIN) void load();
  }, [me]);

  if (meLoading) return <p className="muted">Lädt…</p>;
  if (me?.role !== ROLES.SUPER_ADMIN) {
    return <p className="error">Nur für Super-Admins zugänglich.</p>;
  }

  async function provision(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setMagicLink('');
    setBusy(true);
    try {
      const res = await api<{ tenantId: string; slug: string; magicLink: string | null }>(
        '/api/admin/provision-tenant',
        {
          method: 'POST',
          body: JSON.stringify({
            tenant: {
              name,
              slug,
              locale: 'de',
              monthlyBudgetLimit: budget ? Number(budget) : null,
              autoPauseOnBudget: true,
            },
            admin: { email: adminEmail },
            seedStarterContent: true,
          }),
        },
      );
      setMsg(`Mandant „${name}" angelegt.`);
      if (res.magicLink) setMagicLink(res.magicLink);
      setName('');
      setSlug('');
      setAdminEmail('');
      setBudget('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  async function togglePause(t: AdminTenant) {
    await api(`/api/admin/tenants/${t.id}/${t.paused ? 'resume' : 'pause'}`, { method: 'POST' });
    await load();
  }

  return (
    <>
      <h1>Mandantenverwaltung</h1>
      <p className="muted">Super-Admin · alle Mandanten der Plattform</p>
      {error && <p className="error">{error}</p>}
      {msg && <p className="success">{msg}</p>}
      {magicLink && (
        <div className="panel" style={{ borderColor: 'var(--accent)' }}>
          <strong>Login-Link für den neuen Admin</strong>
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            Diesen einmaligen Link an den Mandanten-Admin weitergeben (gültig 15 Minuten):
          </p>
          <input readOnly value={magicLink} onFocus={(e) => e.target.select()} />
        </div>
      )}

      <h2>Neuen Mandanten anlegen</h2>
      <div className="panel">
        <form onSubmit={provision}>
          <div className="grid cols-2">
            <div>
              <label>Firmenname</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label>Slug (eindeutig, klein)</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="acme-gmbh"
                required
              />
            </div>
          </div>
          <div className="grid cols-2">
            <div>
              <label>Admin E-Mail</label>
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
            </div>
            <div>
              <label>Monatsbudget (EUR, optional)</label>
              <input type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            Es werden automatisch ein Standard-Assistent und ein Beispiel-Fragebogen angelegt. Der
            Admin erhält einen Login-Link.
          </p>
          <button className="btn" style={{ marginTop: '0.5rem' }} disabled={busy}>
            {busy ? 'Wird angelegt…' : 'Mandant provisionieren'}
          </button>
        </form>
      </div>

      <h2>Alle Mandanten</h2>
      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Nutzer</th>
              <th>Nummern</th>
              <th>Anrufe</th>
              <th>Budget</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="muted">{t.slug}</td>
                <td>{t.users}</td>
                <td>{t.phoneNumbers}</td>
                <td>{t.calls}</td>
                <td>{t.monthlyBudgetLimit ? money(t.monthlyBudgetLimit) : '–'}</td>
                <td>
                  {t.paused ? (
                    <span className="badge" style={{ background: 'var(--danger)' }}>pausiert</span>
                  ) : (
                    <span className="badge" style={{ background: '#0a7d2c' }}>aktiv</span>
                  )}
                </td>
                <td>
                  <button className="btn secondary" onClick={() => togglePause(t)}>
                    {t.paused ? 'Fortsetzen' : 'Pausieren'}
                  </button>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={8} className="muted">Noch keine Mandanten.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
