'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface Assistant {
  id: string;
  name: string;
  greetingText: string;
  consentText: string;
  systemPrompt: string;
  voice: string;
  locale: string;
  recordAudio: boolean;
  questionnaireId: string | null;
}

/** Loads the tenant's primary assistant (the first one). */
export function useAssistant() {
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api<Assistant[]>('/api/assistants');
      setAssistant(list[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { assistant, setAssistant, loading, error, refetch };
}
