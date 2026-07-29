import { useState, useEffect, useCallback } from 'react';
import type { AgentSummary } from '@/app/lib/agents/types';

export function useAgents() {
  const [data, setData] = useState<AgentSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      const json = await res.json();
      setData(json.agents);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { data, loading, error, refetch: fetchAgents };
}
