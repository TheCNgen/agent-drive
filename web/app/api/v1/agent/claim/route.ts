import { config } from '@/app/lib/config';
import connectDB from '@/app/lib/mongodb';
import { Agent, AgentClaim, User } from '@/app/lib/models';
import { apiKeyPrefix, generateApiKey, sha256Hex, SUGGESTED_FUNDING_TINYBARS } from '@/app/lib/backend/agentKeys';
import { NextRequest, NextResponse } from 'next/server';

const CLAIM_CODE_PATTERN = /^[0-9a-f]{32}$/;

function claimInvalid() {
  // Deliberately identical for not-found, expired, already-redeemed, and
  // malformed - never leak which one it was.
  return NextResponse.json({ error: 'Claim code is invalid or expired', code: 'claim_invalid' }, { status: 400 });
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// The only unauthenticated write in the system.
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json().catch(() => null);
    const rawCode = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : '';

    if (!CLAIM_CODE_PATTERN.test(rawCode)) {
      return claimInvalid();
    }

    const codeHash = sha256Hex(rawCode);
    const clientString = body?.client ? JSON.stringify(body.client).slice(0, 2000) : null;

    // Single-document atomic redemption - no transaction needed.
    const claim = await AgentClaim.findOneAndUpdate(
      { codeHash, claimedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { claimedAt: new Date(), claimedByIp: clientIp(request), claimedByClient: clientString } },
      { new: true }
    );

    if (!claim) {
      return claimInvalid();
    }

    const agent = await Agent.findById(claim.agent);
    if (!agent) {
      return claimInvalid();
    }

    const apiKey = generateApiKey();
    agent.keyHash = sha256Hex(apiKey);
    agent.keyPrefix = apiKeyPrefix(apiKey);
    agent.onboardingState = 'claimed';
    await agent.save();

    const owner = await User.findById(agent.owner);

    return NextResponse.json({
      apiKey,
      agent: {
        id: agent._id.toString(),
        name: agent.name,
        status: agent.status,
        onboardingState: agent.onboardingState,
        scopes: agent.scopes,
        createdAt: agent.createdAt,
      },
      api: {
        baseUrl: config.hostName,
        apiPrefix: '/api',
      },
      wallet: {
        required: true,
        network: agent.network,
        suggestedFundingTinybars: SUGGESTED_FUNDING_TINYBARS,
      },
      owner: owner ? { id: owner._id.toString(), email: owner.email } : null,
    });
  } catch (error: any) {
    console.error('POST /api/v1/agent/claim error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
