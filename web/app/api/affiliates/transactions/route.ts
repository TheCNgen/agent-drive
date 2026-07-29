import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/app/lib/mongodb';
import { Commission } from '@/app/models/Commission';
import { Transaction } from '@/app/models/Transaction';
import mongoose from 'mongoose';
import { requirePrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';

export async function GET(request: NextRequest) {
  const dbSession = await mongoose.startSession();

  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'affiliates:read');
    const userId = principal.userId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'earned'; // 'earned' or 'paid'
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    return await dbSession.withTransaction(async () => {
      // Query for commissions where user is either the affiliate (earned) or the content owner (paid)
      let query = type === 'earned'
        ? { 'affiliate.affiliateUser': userId }
        : { 'originalTransaction.seller': userId };

      const [commissions, totals] = await Promise.all([
        Commission.find()
          .populate({
            path: 'affiliate',
            match: type === 'earned' ? { affiliateUser: userId } : {},
            populate: { path: 'affiliateUser', select: 'name email' }
          })
          .populate({
            path: 'originalTransaction',
            match: type === 'paid' ? { seller: userId } : {},
            populate: [
              { path: 'buyer', select: 'name email' },
              { path: 'seller', select: 'name email' }
            ]
          })
          .populate('commissionTransaction', 'amountTinybars status metadata purchaseDate')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .session(dbSession),

        Commission.aggregate([
          {
            $lookup: {
              from: 'affiliates',
              localField: 'affiliate',
              foreignField: '_id',
              as: 'affiliate'
            }
          },
          {
            $lookup: {
              from: 'transactions',
              localField: 'originalTransaction',
              foreignField: '_id',
              as: 'originalTransaction'
            }
          },
          {
            $match: type === 'earned'
              ? { 'affiliate.affiliateUser': new mongoose.Types.ObjectId(userId) }
              : { 'originalTransaction.seller': new mongoose.Types.ObjectId(userId) }
          },
          {
            $group: {
              _id: '$status',
              amountTinybars: { $sum: { $toLong: '$commissionAmountTinybars' } },
              count: { $sum: 1 }
            }
          }
        ]).session(dbSession)
      ]);

      // Filter out commissions where the affiliate or original transaction doesn't match the query
      const filteredCommissions = commissions.filter(c => 
        type === 'earned' ? c.affiliate?.affiliateUser : c.originalTransaction?.seller
      );

      // Calculate totals by status
      const summary = {
        pending: { amountTinybars: 0, count: 0 },
        paid: { amountTinybars: 0, count: 0 },
        failed: { amountTinybars: 0, count: 0 }
      };

      totals.forEach(total => {
        const status = total._id as keyof typeof summary;
        if (summary[status]) {
          summary[status].amountTinybars = total.amountTinybars ? total.amountTinybars.toString() : "0";
          summary[status].count = total.count;
        }
      });

      return NextResponse.json({
        transactions: filteredCommissions,
        summary,
        pagination: {
          current: page,
          total: Math.ceil(filteredCommissions.length / limit),
          count: filteredCommissions.length
        }
      });
    });

  } catch (error) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Error fetching affiliate transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
}