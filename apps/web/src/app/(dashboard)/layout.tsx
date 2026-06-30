'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { isPlatformRole } from '@ai-phone/shared';
import { Nav } from '@/components/Nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, loading } = useMe();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
  }, [router]);

  // Platform staff use the Admin console, not the customer app.
  useEffect(() => {
    if (me && isPlatformRole(me.role)) router.replace('/admin');
  }, [me, router]);

  useEffect(() => { setOpen(false); }, [pathname]);

  if (!ready || loading) return <div className="center-screen muted">Lädt…</div>;
  if (me && isPlatformRole(me.role)) return <div className="center-screen muted">Weiterleitung zur Admin-Konsole…</div>;

  return (
    <div className="shell">
      <div className="app-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Menü öffnen">☰</button>
        <span className="brand">📞 AI Phone</span>
        <span />
      </div>
      <div className={`drawer-backdrop${open ? ' show' : ''}`} onClick={() => setOpen(false)} />
      <Nav open={open} />
      <main className="content">{children}</main>
    </div>
  );
}
