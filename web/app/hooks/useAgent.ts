import { useState, useEffect, useCallback } from 'react';
import type { AgentDetail } from '@/app/lib/agents/types';

export function useAgent(id: string | null) {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to fetch agent');
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchAgent();
    } else {
      setData(null);
    }
  }, [id, fetchAgent]);

  return { data, loading, error, refetch: fetchAgent };
}
