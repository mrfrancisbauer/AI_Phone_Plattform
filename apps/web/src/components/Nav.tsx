'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api';
import { clearMeCache, useMe } from '@/lib/useMe';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ROLES, isPlatformRole } from '@ai-phone/shared';

const baseLinks = [
  { href: '/', label: 'Übersicht' },
  { href: '/calls', label: 'Gespräche' },
  { href: '/questionnaire', label: 'Fragebogen' },
  { href: '/assistant', label: 'Assistent' },
  { href: '/costs', label: 'Kosten' },
  { href: '/simulator', label: 'Testmodus' },
  { href: '/settings', label: 'Einstellungen' },
];

export function Nav({ open = false }: { open?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useMe();

  const canManageUsers =
    me?.role === ROLES.TENANT_ADMIN || me?.role === ROLES.SUPER_ADMIN;
  const isPlatform = me ? isPlatformRole(me.role) : false;

  const links = [
    ...baseLinks,
    ...(canManageUsers ? [{ href: '/users', label: 'Nutzer' }] : []),
    ...(isPlatform ? [{ href: '/admin', label: '⚙ Admin-Konsole' }] : []),
  ];

  function logout() {
    clearToken();
    clearMeCache();
    router.push('/login');
  }

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="brand">📞 AI Phone</div>
      {me && (
        <div className="muted" style={{ fontSize: '0.78rem', marginBottom: '1rem', wordBreak: 'break-all' }}>
          {me.email}
          <br />
          <span className="tag">{roleLabel(me.role)}</span>
        </div>
      )}
      <nav>
        {links.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div style={{ marginTop: 'auto', paddingTop: '1.25rem' }}>
        <ThemeToggle />
        <button className="btn secondary" style={{ marginTop: 8, width: '100%' }} onClick={logout}>
          Abmelden
        </button>
      </div>
    </aside>
  );
}

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
