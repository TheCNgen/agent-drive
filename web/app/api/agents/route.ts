import { authOptions } from '@/app/lib/backend/authConfig';
import connectDB from '@/app/lib/mongodb';
import { Agent, AgentClaim, ALL_SCOPES, DEFAULT_SCOPES } from '@/app/lib/models';
import type { Scope } from '@/app/models/Agent';
import { generateClaimCode, sha256Hex, CLAIM_CODE_TTL_MS } from '@/app/lib/backend/agentKeys';
import { getServerSession } from 'next-auth/next';
import { NextRequest, NextResponse } from 'next/server';

function serializeAgentSummary(agent: any) {
  return {
    id: agent._id.toString(),
    name: agent.name,
    status: agent.status,
    onboardingState: agent.onboardingState,
    scopes: agent.scopes,
    evmAddress: agent.evmAddress,
    accountId: agent.accountId,
    createdAt: agent.createdAt,
    lastSeenAt: agent.lastSeenAt,
  };
}

// Mint an agent + claim. The only time claimCode is ever returned.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Agent name is required', code: 'invalid_request' }, { status: 400 });
    }

    let scopes: Scope[] = DEFAULT_SCOPES;
    if (Array.isArray(body?.scopes)) {
      const requested = body.scopes.filter((s: unknown): s is Scope =>
        (ALL_SCOPES as readonly string[]).includes(s as string)
      );
      if (requested.length > 0) scopes = requested;
    }

    const agent = await Agent.create({
      owner: session.user.id,
      name,
      scopes,
    });

    const code = generateClaimCode();
    const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);

    await AgentClaim.create({
      agent: agent._id,
      codeHash: sha256Hex(code),
      expiresAt,
    });

    return NextResponse.json(
      {
        agent: serializeAgentSummary(agent),
        claimCode: code,
        expiresAt,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/agents error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    await connectDB();

    const agents = await Agent.find({ owner: session.user.id }).sort({ createdAt: -1 });

    return NextResponse.json({ agents: agents.map(serializeAgentSummary) });
  } catch (error: any) {
    console.error('GET /api/agents error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
