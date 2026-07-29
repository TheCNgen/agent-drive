import connectDB from '@/app/lib/mongodb';
import { Agent } from '@/app/lib/models';
import { requireAgentPrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';
import { fetchMirrorAccount } from '@/app/lib/backend/agentFunding';
import { NextRequest, NextResponse } from 'next/server';

// Confirms the agent completed its self-paid hollow-account activation
// transaction. See the stage doc for why this step can never be skipped:
// a hollow account (funded via alias, key === null) can receive value but
// cannot send it, and an x402 facilitator payment can't complete it either
// because the facilitator - not the agent - is the fee payer. The agent's
// first Hedera transaction must be this self-paid activation.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const principal = await requireAgentPrincipal(request);

    const agent = await Agent.findById(principal.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    if (agent.onboardingState === 'active') {
      return NextResponse.json({
        agent: { status: agent.status, onboardingState: agent.onboardingState },
        wallet: { activated: true },
      });
    }

    if (agent.onboardingState !== 'funded' || !agent.accountId) {
      return NextResponse.json({ error: 'Agent is not yet funded', code: 'not_funded' }, { status: 400 });
    }

    const account = await fetchMirrorAccount(agent.accountId);
    if (!account || !account.key) {
      return NextResponse.json(
        { error: 'Account is still hollow - activation transaction not yet complete', code: 'not_activated' },
        { status: 400 }
      );
    }

    agent.onboardingState = 'active';
    agent.status = 'active';
    agent.activatedAt = new Date();
    await agent.save();

    return NextResponse.json({
      agent: { status: agent.status, onboardingState: agent.onboardingState },
      wallet: { activated: true },
    });
  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('POST /api/v1/agent/activate error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
