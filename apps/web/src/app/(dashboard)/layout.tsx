'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { Nav } from '@/components/Nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
  }, [router]);

  useEffect(() => { setOpen(false); }, [pathname]);

  if (!ready) return <div className="center-screen muted">Lädt…</div>;

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
