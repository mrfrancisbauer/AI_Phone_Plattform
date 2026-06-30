'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, clearToken } from '@/lib/api';
import { clearMeCache, useMe } from '@/lib/useMe';
import { ADMIN_NAV } from '@/lib/admin-nav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isPlatformRole, roleHasCapability } from '@ai-phone/shared';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, loading } = useMe();
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setChecked(true);
  }, [router]);

  // Close the drawer on navigation.
  useEffect(() => { setOpen(false); }, [pathname]);

  if (!checked || loading) return <div className="center-screen muted">Lädt…</div>;

  if (!me || !isPlatformRole(me.role)) {
    return (
      <div className="center-screen">
        <div className="auth-card panel">
          <h1>Kein Zugriff</h1>
          <p className="muted">Dieser Bereich ist ausschließlich für Plattform-Administratoren.</p>
          <Link className="btn" href="/">Zurück zum Dashboard</Link>
        </div>
      </div>
    );
  }

  const items = ADMIN_NAV.filter((i) => roleHasCapability(me.role, i.cap));

  function logout() {
    clearToken();
    clearMeCache();
    router.push('/login');
  }

  return (
    <div className="ac-shell">
      <div className="app-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Menü öffnen">☰</button>
        <span className="brand">📞 AI Phone <span className="ac-pill">Admin</span></span>
        <span />
      </div>

      <div className={`drawer-backdrop${open ? ' show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`ac-sidebar${open ? ' open' : ''}`}>
        <div className="ac-brand">📞 AI Phone <span className="ac-pill">Admin</span></div>
        <div className="muted" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>{me.email}</div>
        <nav>
          {items.map((i) => {
            const active = i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href);
            return <Link key={i.href} href={i.href} className={active ? 'active' : ''}>{i.label}</Link>;
          })}
        </nav>
        <div className="ac-side-foot">
          <Link href="/" style={{ display: 'block', marginBottom: 8 }}>← Zur Kunden-App</Link>
          <ThemeToggle />
          <button className="btn secondary" style={{ width: '100%', marginTop: 8 }} onClick={logout}>Abmelden</button>
        </div>
      </aside>

      <main className="ac-content">{children}</main>
    </div>
  );
}
