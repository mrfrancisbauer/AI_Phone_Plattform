'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { Nav } from '@/components/Nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return <div className="center-screen muted">Lädt…</div>;

  return (
    <div className="shell">
      <Nav />
      <main className="content">{children}</main>
    </div>
  );
}
