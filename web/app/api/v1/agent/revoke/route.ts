import connectDB from '@/app/lib/mongodb';
import { Agent } from '@/app/lib/models';
import { requireAgentPrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';
import { NextRequest, NextResponse } from 'next/server';

// Idempotent by design: an agent that detects its host is compromised must
// be able to kill its own key, including calling this twice.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const principal = await requireAgentPrincipal(request);

    const agent = await Agent.findById(principal.agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    if (agent.status !== 'revoked') {
      agent.status = 'revoked';
      agent.onboardingState = 'revoked';
      agent.revokedAt = new Date();
      await agent.save();
    }

    return NextResponse.json({ revoked: true });
  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('POST /api/v1/agent/revoke error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
