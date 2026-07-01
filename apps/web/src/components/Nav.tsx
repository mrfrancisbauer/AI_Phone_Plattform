'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, clearToken } from '@/lib/api';
import { clearMeCache, useMe } from '@/lib/useMe';
import { ThemeToggle } from '@/components/ThemeToggle';
import { APP_NAV } from '@/lib/app-nav';

export function Nav({ open = false }: { open?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useMe();
  const [tenantName, setTenantName] = useState<string>('');

  useEffect(() => {
    api<{ name: string }>('/api/settings/tenant')
      .then((t) => setTenantName(t.name))
      .catch(() => {});
  }, []);

  function logout() {
    clearToken();
    clearMeCache();
    router.push('/login');
  }

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="brand">
        <span className="brand-mark">◉</span> AI&nbsp;Phone
      </div>

      {tenantName && (
        <div className="tenant-chip" title={tenantName}>
          <span className="tenant-ico">🏢</span>
          <span className="tenant-name">{tenantName}</span>
        </div>
      )}

      <nav>
        {APP_NAV.map((section, i) => (
          <div key={i} className="nav-section">
            {section.title && <div className="nav-section-title">{section.title}</div>}
            {section.items.map((it) => (
              <Link key={it.href} href={it.href} className={isActive(it.href) ? 'active' : ''}>
                <span className="nav-ico">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        {me && (
          <div className="user-chip">
            <span className="avatar">{(me.email[0] ?? 'U').toUpperCase()}</span>
            <span className="user-meta">
              <span className="user-email" title={me.email}>{me.email}</span>
              <span className="muted" style={{ fontSize: '0.72rem' }}>{roleLabel(me.role)}</span>
            </span>
          </div>
        )}
        <ThemeToggle />
        <button className="btn secondary sm" style={{ width: '100%', marginTop: 8 }} onClick={logout}>
          Abmelden
        </button>
      </div>
    </aside>
  );
}

function roleLabel(role: string): string {
  return { tenant_admin: 'Admin', tenant_member: 'Mitarbeiter', read_only: 'Nur lesen' }[role] ?? role;
}
