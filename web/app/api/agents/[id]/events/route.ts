import { authOptions } from '@/app/lib/backend/authConfig';
import connectDB from '@/app/lib/mongodb';
import { Agent, AgentClaim } from '@/app/lib/models';
import { getCachedBalanceTinybars, refreshAgentWalletState } from '@/app/lib/backend/agentFunding';
import { SUGGESTED_FUNDING_TINYBARS } from '@/app/lib/backend/agentKeys';
import { getServerSession } from 'next-auth/next';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const TICK_MS = 3000;
const HEARTBEAT_MS = 15000;
const MAX_LIFETIME_MS = 15 * 60 * 1000;
const TERMINAL_STATES = new Set(['active', 'revoked', 'expired']);

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  await connectDB();
  const { id } = await context.params;
  const agent = await Agent.findOne({ _id: id, owner: session.user.id });
  if (!agent) {
    return new Response('Not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let tickInterval: ReturnType<typeof setInterval> | undefined;
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let lastSnapshot = '';
      const startedAt = Date.now();

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (tickInterval) clearInterval(tickInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        if (closed) return;

        try {
          let current = await Agent.findById(id);
          if (!current) {
            send('expired', { state: 'expired' });
            return cleanup();
          }

          if (current.onboardingState === 'waiting') {
            const pendingClaim = await AgentClaim.findOne({ agent: current._id }).sort({ createdAt: -1 });
            if (pendingClaim && !pendingClaim.claimedAt && pendingClaim.expiresAt <= new Date()) {
              send('expired', { state: 'expired' });
              return cleanup();
            }
          }

          if (['wallet', 'funded'].includes(current.onboardingState)) {
            current = await refreshAgentWalletState(current);
          }

          const balanceTinybars = current.accountId ? await getCachedBalanceTinybars(current.accountId) : '0';

          const snapshot = {
            onboardingState: current.onboardingState,
            status: current.status,
            evmAddress: current.evmAddress,
            accountId: current.accountId,
            balanceTinybars,
            suggestedFundingTinybars: SUGGESTED_FUNDING_TINYBARS,
            lastSeenAt: current.lastSeenAt,
          };
          const serialized = JSON.stringify(snapshot);

          if (serialized !== lastSnapshot) {
            lastSnapshot = serialized;
            send('state', snapshot);
          }

          if (TERMINAL_STATES.has(current.onboardingState)) {
            return cleanup();
          }
        } catch (error) {
          console.error('SSE tick error for agent', id, error);
        }

        if (Date.now() - startedAt > MAX_LIFETIME_MS) {
          cleanup();
        }
      };

      const heartbeat = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(`:\n\n`));
      };

      tickInterval = setInterval(tick, TICK_MS);
      heartbeatInterval = setInterval(heartbeat, HEARTBEAT_MS);
      request.signal.addEventListener('abort', cleanup);

      void tick();
    },
    cancel() {
      closed = true;
      if (tickInterval) clearInterval(tickInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
