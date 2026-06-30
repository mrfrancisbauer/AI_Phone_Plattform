'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import type { Role } from '@ai-phone/shared';

export interface Me {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
}

// Module-level cache so the session is fetched once across components.
let cached: Me | null = null;
let inflight: Promise<Me> | null = null;

export function useMe() {
  const [me, setMe] = useState<Me | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    inflight ??= api<Me>('/api/auth/me');
    inflight
      .then((m) => {
        cached = m;
        setMe(m);
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  return { me, loading };
}

export function clearMeCache() {
  cached = null;
  inflight = null;
}
