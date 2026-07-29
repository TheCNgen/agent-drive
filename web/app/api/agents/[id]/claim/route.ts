import { authOptions } from '@/app/lib/backend/authConfig';
import connectDB from '@/app/lib/mongodb';
import { Agent, AgentClaim } from '@/app/lib/models';
import { generateClaimCode, sha256Hex, CLAIM_CODE_TTL_MS } from '@/app/lib/backend/agentKeys';
import { getServerSession } from 'next-auth/next';
import { NextRequest, NextResponse } from 'next/server';

// Regenerate a claim for an unclaimed agent. Invalidates any prior claim.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    await connectDB();
    const { id } = await context.params;
    const agent = await Agent.findOne({ _id: id, owner: session.user.id });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found', code: 'not_found' }, { status: 404 });
    }

    if (agent.status === 'revoked') {
      return NextResponse.json({ error: 'Agent has been revoked', code: 'agent_revoked' }, { status: 400 });
    }

    if (agent.onboardingState !== 'waiting') {
      return NextResponse.json(
        { error: 'Agent has already been claimed', code: 'already_claimed' },
        { status: 400 }
      );
    }

    await AgentClaim.deleteMany({ agent: agent._id, claimedAt: null });

    const code = generateClaimCode();
    const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);

    await AgentClaim.create({
      agent: agent._id,
      codeHash: sha256Hex(code),
      expiresAt,
    });

    return NextResponse.json({
      agent: {
        id: agent._id.toString(),
        status: agent.status,
        onboardingState: agent.onboardingState,
      },
      claimCode: code,
      expiresAt,
    });
  } catch (error: any) {
    console.error('POST /api/agents/[id]/claim error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
