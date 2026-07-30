import { authOptions } from '@/app/lib/backend/authConfig';
import connectDB from '@/app/lib/mongodb';
import { Agent, AgentClaim, Transaction } from '@/app/lib/models';
import { getCachedBalanceTinybars } from '@/app/lib/backend/agentFunding';
import { SUGGESTED_FUNDING_TINYBARS } from '@/app/lib/backend/agentKeys';
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

    const balanceTinybars = agent.accountId ? await getCachedBalanceTinybars(agent.accountId) : '0';

    const spend = await Transaction.aggregate([
      { $match: { agent: agent._id, paymentFlow: 'x402' } },
      { $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: { $toDecimal: '$amountTinybars' } },
      } },
    ]);

    let totalSpentTinybars = '0';
    let purchasesSucceeded = 0;
    let purchasesFailed = 0;

    for (const row of spend) {
      if (row._id === 'completed') {
        purchasesSucceeded += row.count;
        totalSpentTinybars = (BigInt(totalSpentTinybars) + BigInt(row.total.toString().split('.')[0])).toString();
      } else if (row._id === 'failed') {
        purchasesFailed += row.count;
      }
    }

    const total = purchasesSucceeded + purchasesFailed;
    const successRate = total > 0 ? Number((purchasesSucceeded / total * 100).toFixed(1)) : null;

    return NextResponse.json({
      agent: {
        id: agent._id.toString(),
        name: agent.name,
        status: agent.status,
        onboardingState: agent.onboardingState,
        scopes: agent.scopes,
        evmAddress: agent.evmAddress,
        accountId: agent.accountId,
        network: agent.network || 'hedera-testnet',
        createdAt: agent.createdAt,
        lastSeenAt: agent.lastSeenAt,
        revokedAt: agent.revokedAt,
        stats: {
          totalSpentTinybars,
          purchasesSucceeded,
          purchasesFailed,
          successRate,
        },
        spendingLimits: agent.spendingLimits || {
          dailyLimitHbar: null,
          monthlyLimitHbar: null,
          orderLimitHbar: null,
          approvalLimitHbar: null,
        },
      },
      wallet: {
        evmAddress: agent.evmAddress || null,
        accountId: agent.accountId || null,
        network: agent.network || 'hedera-testnet',
        balanceTinybars,
        usdcBalance: null,
        funded: ['funded', 'active'].includes(agent.onboardingState),
        activated: agent.onboardingState === 'active',
        suggestedFundingTinybars: SUGGESTED_FUNDING_TINYBARS,
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const body = await request.json();

    if (body.status === 'suspended' && agent.status === 'active') {
      agent.status = 'suspended';
    } else if (body.status === 'active' && agent.status === 'suspended') {
      agent.status = 'active';
    }

    if (body.spendingLimits) {
      agent.spendingLimits = {
        dailyLimitHbar: body.spendingLimits.dailyLimitHbar ?? null,
        monthlyLimitHbar: body.spendingLimits.monthlyLimitHbar ?? null,
        orderLimitHbar: body.spendingLimits.orderLimitHbar ?? null,
        approvalLimitHbar: body.spendingLimits.approvalLimitHbar ?? null,
      };
    }

    await agent.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/agents/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
