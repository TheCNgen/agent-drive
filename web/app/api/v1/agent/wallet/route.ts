import connectDB from '@/app/lib/mongodb';
import { Agent } from '@/app/lib/models';
import { requireAgentPrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';
import { containsPrivateKeyField } from '@/app/lib/backend/security';
import { SUGGESTED_FUNDING_TINYBARS } from '@/app/lib/backend/agentKeys';
import { NextRequest, NextResponse } from 'next/server';

const EVM_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

// Allowed while status === 'pending' - onboarding routes are carved out in
// resolvePrincipal's ONBOARDING_PATHS set.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const principal = await requireAgentPrincipal(request);

    const body = await request.json().catch(() => ({}));

    if (containsPrivateKeyField(body)) {
      return NextResponse.json(
        { error: 'Private keys must never be sent to CashDrive.', code: 'private_key_rejected' },
        { status: 400 }
      );
    }

    const evmAddress = typeof body?.evmAddress === 'string' ? body.evmAddress.toLowerCase() : '';
    if (!EVM_ADDRESS_PATTERN.test(evmAddress)) {
      return NextResponse.json({ error: 'Invalid EVM address', code: 'wallet_invalid' }, { status: 400 });
    }

    const agent = await Agent.findById(principal.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    if (agent.evmAddress && agent.evmAddress !== evmAddress) {
      return NextResponse.json(
        { error: 'This agent already has a different wallet registered', code: 'wallet_already_registered' },
        { status: 409 }
      );
    }

    // Idempotent: registering the same address twice is a no-op, not an error.
    if (!agent.evmAddress) {
      agent.evmAddress = evmAddress;
      agent.publicKey = typeof body?.publicKey === 'string' ? body.publicKey : null;
      if (typeof body?.network === 'string' && body.network) {
        agent.network = body.network;
      }
      agent.onboardingState = 'wallet';
      await agent.save();
    }

    return NextResponse.json({
      agent: {
        id: agent._id.toString(),
        status: agent.status,
        onboardingState: agent.onboardingState,
      },
      wallet: {
        evmAddress: agent.evmAddress,
        accountId: agent.accountId,
        network: agent.network,
        balanceTinybars: '0',
        funded: !!agent.accountId,
        suggestedFundingTinybars: SUGGESTED_FUNDING_TINYBARS,
      },
    });
  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('POST /api/v1/agent/wallet error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
