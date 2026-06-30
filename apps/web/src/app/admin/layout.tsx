'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, clearToken } from '@/lib/api';
import { clearMeCache, useMe } from '@/lib/useMe';
import { ADMIN_NAV } from '@/lib/admin-nav';
import { isPlatformRole, roleHasCapability } from '@ai-phone/shared';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, loading } = useMe();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setChecked(true);
  }, [router]);

  if (!checked || loading) return <div className="center-screen muted">Lädt…</div>;

  // Server still enforces every endpoint; this is just UI gating.
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
      <aside className="ac-sidebar">
        <div className="ac-brand">📞 AI Phone <span className="ac-pill">Admin</span></div>
        <div className="muted" style={{ fontSize: '0.76rem', wordBreak: 'break-all' }}>{me.email}</div>
        <nav>
          {items.map((i) => {
            const active = i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href} className={active ? 'active' : ''}>{i.label}</Link>
            );
          })}
        </nav>
        <div className="ac-side-foot">
          <Link href="/" style={{ display: 'block', marginBottom: 8 }}>← Zur Kunden-App</Link>
          <button className="btn secondary" style={{ width: '100%' }} onClick={logout}>Abmelden</button>
        </div>
      </aside>
      <main className="ac-content">{children}</main>
    </div>
  );
}
