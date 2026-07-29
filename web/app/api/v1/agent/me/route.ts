import connectDB from '@/app/lib/mongodb';
import { Agent, User } from '@/app/lib/models';
import { requireAgentPrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';
import { getCachedBalanceTinybars, refreshAgentWalletState } from '@/app/lib/backend/agentFunding';
import { NextRequest, NextResponse } from 'next/server';

// The SDK's polling and whoami endpoint - allowed in any non-revoked state.
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const principal = await requireAgentPrincipal(request);

    let agent = await Agent.findById(principal.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    if (['wallet', 'funded'].includes(agent.onboardingState)) {
      agent = await refreshAgentWalletState(agent);
    }

    const balanceTinybars = agent.accountId ? await getCachedBalanceTinybars(agent.accountId) : '0';
    const owner = await User.findById(agent.owner);

    return NextResponse.json({
      agent: {
        id: agent._id.toString(),
        name: agent.name,
        status: agent.status,
        onboardingState: agent.onboardingState,
        scopes: agent.scopes,
        createdAt: agent.createdAt,
        lastSeenAt: agent.lastSeenAt,
      },
      wallet: {
        evmAddress: agent.evmAddress,
        accountId: agent.accountId,
        network: agent.network,
        balanceTinybars,
        funded: !!agent.accountId,
        activated: agent.onboardingState === 'active',
      },
      owner: owner ? { id: owner._id.toString(), email: owner.email, name: owner.name } : null,
    });
  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('GET /api/v1/agent/me error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
