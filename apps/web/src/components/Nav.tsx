'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api';

const links = [
  { href: '/', label: 'Übersicht' },
  { href: '/calls', label: 'Gespräche' },
  { href: '/questionnaire', label: 'Fragebogen' },
  { href: '/assistant', label: 'Assistent' },
  { href: '/costs', label: 'Kosten' },
  { href: '/simulator', label: 'Testmodus' },
  { href: '/settings', label: 'Einstellungen' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearToken();
    router.push('/login');
  }

  return (
    <aside className="sidebar">
      <div className="brand">📞 AI Phone</div>
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
      <button
        className="btn secondary"
        style={{ marginTop: '1.5rem', width: '100%' }}
        onClick={logout}
      >
        Abmelden
      </button>
    </aside>
  );
}
