'use client';
import { useEffect, useRef, useState } from 'react';
import type { AgentStateEvent } from '@/app/lib/agents/types';

type Transport = 'sse' | 'polling' | 'closed';

interface Result {
  state: AgentStateEvent | null;
  transport: Transport;
  expired: boolean;
  error: string | null;
}

export function useAgentEvents(agentId: string | null, enabled = true): Result {
  const [state, setState] = useState<AgentStateEvent | null>(null);
  const [transport, setTransport] = useState<Transport>('sse');
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!agentId || !enabled) return;

    let cancelled = false;
    let es: EventSource | null = null;

    const stopPolling = () => {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}`, { cache: 'no-store' });
        if (!res.ok) return;                       // transient; keep polling
        const body = await res.json();
        if (cancelled) return;
        setState({
          onboardingState: body.agent.onboardingState,
          status: body.agent.status,
          evmAddress: body.wallet?.evmAddress ?? null,
          accountId: body.wallet?.accountId ?? null,
          balanceTinybars: body.wallet?.balanceTinybars ?? '0',
          suggestedFundingTinybars: body.wallet?.suggestedFundingTinybars ?? '500000000',
          lastSeenAt: body.agent.lastSeenAt ?? null,
        });
        if (body.agent.onboardingState === 'expired') setExpired(true);
        if (['active', 'revoked', 'expired'].includes(body.agent.onboardingState)) {
          stopPolling();
          setTransport('closed');
        }
      } catch {
        /* network blip — the next tick retries */
      }
    };

    const startPolling = () => {
      if (pollTimer.current || cancelled) return;
      setTransport('polling');
      void poll();
      pollTimer.current = setInterval(poll, 3000);
    };

    // EventSource sends the session cookie automatically on same-origin requests.
    es = new EventSource(`/api/agents/${agentId}/events`);

    es.addEventListener('state', (e) => {
      if (cancelled) return;
      const next = JSON.parse((e as MessageEvent).data) as AgentStateEvent;
      setState(next);
      setError(null);
      if (['active', 'revoked'].includes(next.onboardingState)) setTransport('closed');
    });

    es.addEventListener('expired', () => {
      if (cancelled) return;
      setExpired(true);
      setTransport('closed');
    });

    es.onerror = () => {
      // The server closes the stream on a terminal state and at its 15-minute cap.
      // Both arrive here as an error. If we already know we're done, stay done;
      // otherwise fall back to polling rather than letting EventSource reconnect-loop.
      es?.close();
      setState((s) => {
        if (s && ['active', 'revoked'].includes(s.onboardingState)) { setTransport('closed'); return s; }
        startPolling();
        return s;
      });
    };

    return () => {
      cancelled = true;
      es?.close();
      stopPolling();
    };
  }, [agentId, enabled]);

  return { state, transport, expired, error };
}
