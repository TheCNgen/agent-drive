import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/app/lib/mongodb';
import { Affiliate } from '@/app/models/Affiliate';
import { Commission } from '@/app/models/Commission';
import { requirePrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'affiliates:read');

    const { id } = await params;
    const affiliate = await Affiliate.findById(id)
      .populate('owner', 'name email')
      .populate('affiliateUser', 'name email')
      .populate('listing', 'title price status')
      .populate('sharedLink', 'title price type linkId');

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Check if user has access to this affiliate
    const hasAccess = affiliate.owner._id.toString() === principal.userId ||
                     affiliate.affiliateUser._id.toString() === principal.userId;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ affiliate });
  } catch (error) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Error fetching affiliate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'affiliates:write');

    const { commissionRate, status } = await request.json();

    const { id } = await params;
    const affiliate = await Affiliate.findById(id);
    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Only owner can update commission rate and status
    if (affiliate.owner.toString() !== principal.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (commissionRate !== undefined) {
      if (commissionRate < 0 || commissionRate > 100) {
        return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });
      }
      affiliate.commissionRate = commissionRate;
    }

    if (status !== undefined) {
      if (!['active', 'inactive', 'suspended'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      affiliate.status = status;
    }

    await affiliate.save();
    await affiliate.populate([
      { path: 'owner', select: 'name email' },
      { path: 'affiliateUser', select: 'name email' },
      { path: 'listing', select: 'title price status' },
      { path: 'sharedLink', select: 'title price type linkId' }
    ]);

    return NextResponse.json({ affiliate });
  } catch (error) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Error updating affiliate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requirePrincipal(request, 'affiliates:write');

    const { action, commissionId, status, paidAt } = await request.json();

    if (action === 'updateCommission' && commissionId) {
      // Update commission record
      const updatedCommission = await Commission.findByIdAndUpdate(
        commissionId,
        {
          ...(status && { status }),
          ...(paidAt && { paidAt: new Date(paidAt) }),
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!updatedCommission) {
        return NextResponse.json({ error: 'Commission not found' }, { status: 404 });
      }

      return NextResponse.json({
        message: 'Commission updated successfully',
        commission: updatedCommission
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Error updating commission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'affiliates:write');

    const { id } = await params;
    const affiliate = await Affiliate.findById(id);
    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Only owner can delete affiliate
    if (affiliate.owner.toString() !== principal.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await Affiliate.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Affiliate deleted successfully' });
  } catch (error) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Error deleting affiliate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
