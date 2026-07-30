import { authOptions } from '@/app/lib/backend/authConfig';
import connectDB from '@/app/lib/mongodb';
import { Agent, Transaction, Item } from '@/app/lib/models';
import { getServerSession } from 'next-auth/next';
import { NextRequest, NextResponse } from 'next/server';

import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    }

    await connectDB();
    const userIdObj = new mongoose.Types.ObjectId(session.user.id);

    const [agents, spend, files] = await Promise.all([
      Agent.aggregate([
        { $match: { owner: userIdObj } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Transaction.aggregate([
        { $match: { buyer: userIdObj, paymentFlow: 'x402', status: 'completed' } },
        { $group: { _id: null, purchaseCount: { $sum: 1 }, totalTinybars: { $sum: { $toDecimal: '$amountTinybars' } } } }
      ]),
      Item.aggregate([
        { $match: { owner: userIdObj, type: 'file' } },
        { $group: { _id: null, count: { $sum: 1 }, totalBytes: { $sum: '$size' } } }
      ])
    ]);

    const agentsObj = { total: 0, active: 0, pending: 0, revoked: 0 };
    for (const row of agents) {
      if (row._id === 'active') agentsObj.active = row.count;
      else if (row._id === 'pending') agentsObj.pending = row.count;
      else if (row._id === 'revoked') agentsObj.revoked = row.count;
      agentsObj.total += row.count;
    }

    const spendObj = {
      totalTinybars: spend[0] ? (spend[0].totalTinybars ? spend[0].totalTinybars.toString().split('.')[0] : '0') : '0',
      purchaseCount: spend[0]?.purchaseCount || 0,
    };

    const filesObj = {
      count: files[0]?.count || 0,
      totalBytes: files[0]?.totalBytes || 0,
    };

    return NextResponse.json({
      agents: agentsObj,
      spend: spendObj,
      files: filesObj,
    });
  } catch (error: any) {
    console.error('GET /api/agents/summary error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
