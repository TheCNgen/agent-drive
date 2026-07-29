import { authOptions } from '@/app/lib/backend/authConfig';
import connectDB from '@/app/lib/mongodb';
import { Agent, AgentClaim } from '@/app/lib/models';
import { getServerSession } from 'next-auth/next';
import { NextRequest, NextResponse } from 'next/server';

async function loadOwnedAgent(id: string, userId: string) {
  return Agent.findOne({ _id: id, owner: userId });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    await connectDB();
    const { id } = await context.params;
    const agent = await loadOwnedAgent(id, session.user.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'not_found' }, { status: 404 });
    }

    // Pending-claim state and expiresAt only - never the code itself.
    let claim = null;
    if (agent.onboardingState === 'waiting') {
      const pendingClaim = await AgentClaim.findOne({ agent: agent._id }).sort({ createdAt: -1 });
      if (pendingClaim) {
        claim = {
          state: !pendingClaim.claimedAt && pendingClaim.expiresAt > new Date() ? 'pending' : 'expired',
          expiresAt: pendingClaim.expiresAt,
          claimedAt: pendingClaim.claimedAt,
          claimedByIp: pendingClaim.claimedByIp,
          claimedByClient: pendingClaim.claimedByClient,
        };
      }
    }

    return NextResponse.json({
      agent: {
        id: agent._id.toString(),
        name: agent.name,
        status: agent.status,
        onboardingState: agent.onboardingState,
        scopes: agent.scopes,
        evmAddress: agent.evmAddress,
        accountId: agent.accountId,
        network: agent.network,
        createdAt: agent.createdAt,
        lastSeenAt: agent.lastSeenAt,
        revokedAt: agent.revokedAt,
      },
      claim,
    });
  } catch (error: any) {
    console.error('GET /api/agents/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    await connectDB();
    const { id } = await context.params;
    const agent = await loadOwnedAgent(id, session.user.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'not_found' }, { status: 404 });
    }

    if (agent.status !== 'revoked') {
      agent.status = 'revoked';
      agent.onboardingState = 'revoked';
      agent.revokedAt = new Date();
      await agent.save();
    }

    return NextResponse.json({ revoked: true });
  } catch (error: any) {
    console.error('DELETE /api/agents/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
