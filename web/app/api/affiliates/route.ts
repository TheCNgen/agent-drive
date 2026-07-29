import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/app/lib/mongodb';
import { Affiliate } from '@/app/models/Affiliate';
import { Listing } from '@/app/models/Listing';
import { SharedLink } from '@/app/models/SharedLink';
import { nanoid } from 'nanoid';
import { requirePrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'affiliates:read');
    const userId = principal.userId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'owned' or 'affiliate'
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    let query = {};
    if (type === 'owned') {
      query = { owner: userId };
    } else if (type === 'affiliate') {
      query = { affiliateUser: userId };
    } else {
      query = {
        $or: [
          { owner: userId },
          { affiliateUser: userId }
        ]
      };
    }

    const [affiliates, total] = await Promise.all([
      Affiliate.find(query)
        .populate('owner', 'name email')
        .populate('affiliateUser', 'name email')
        .populate('listing', 'title price status')
        .populate('sharedLink', 'title price type linkId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Affiliate.countDocuments(query)
    ]);

    return NextResponse.json({
      affiliates,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: affiliates.length,
        totalItems: total
      }
    });
  } catch (error) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Error fetching affiliates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'affiliates:write');

    let { listingId, sharedLinkId, affiliateUserId, commissionRate } = await request.json();

    if (!affiliateUserId || (!listingId && !sharedLinkId)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Commission rate validation will be done after we determine the rate
    if (commissionRate !== undefined && (commissionRate < 0 || commissionRate > 100)) {
      return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });
    }

    const userId = principal.userId;

    let contentItem = null;
    let isOwnerCreatingAffiliate = false;
    let isUserBecomingAffiliate = false;
    
    if (listingId) {
      contentItem = await Listing.findById(listingId);
      if (!contentItem) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
      }
      
      // Check if affiliate programs are enabled for this listing
      if (!contentItem.affiliateEnabled) {
        return NextResponse.json({ error: 'Affiliate program not enabled for this listing' }, { status: 400 });
      }
      
      isOwnerCreatingAffiliate = contentItem.seller.toString() === userId;
      isUserBecomingAffiliate = affiliateUserId === userId;
      
      // Either the owner is creating an affiliate OR the user is becoming an affiliate
      if (!isOwnerCreatingAffiliate && !isUserBecomingAffiliate) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
      
      // If user is becoming affiliate, use the default commission rate from the listing
      if (isUserBecomingAffiliate) {
        commissionRate = contentItem.defaultCommissionRate || 10;
      }
    } else if (sharedLinkId) {
      contentItem = await SharedLink.findById(sharedLinkId);
      if (!contentItem) {
        return NextResponse.json({ error: 'Shared link not found' }, { status: 404 });
      }
      
      isOwnerCreatingAffiliate = contentItem.owner.toString() === userId;
      isUserBecomingAffiliate = affiliateUserId === userId;
      
      // Either the owner is creating an affiliate OR the user is becoming an affiliate
      if (!isOwnerCreatingAffiliate && !isUserBecomingAffiliate) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
      
      // If user is becoming affiliate, use a default commission rate of 10%
      if (isUserBecomingAffiliate) {
        commissionRate = 10; // Default for shared links
      }
    }

    // Final validation of commission rate
    if (commissionRate < 0 || commissionRate > 100) {
      return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 });
    }

    // Determine the correct owner based on who is creating the affiliate
    const ownerId = isUserBecomingAffiliate 
      ? (listingId ? contentItem.seller : contentItem.owner) 
      : userId;

    // Check if affiliate already exists
    const existingAffiliate = await Affiliate.findOne({
      ...(listingId && { listing: listingId }),
      ...(sharedLinkId && { sharedLink: sharedLinkId }),
      owner: ownerId,
      affiliateUser: affiliateUserId
    });

    if (existingAffiliate) {
      return NextResponse.json({ error: 'Affiliate already exists for this content' }, { status: 409 });
    }

    // Generate unique affiliate code
    let affiliateCode;
    let isUnique = false;
    while (!isUnique) {
      affiliateCode = nanoid(8);
      const existing = await Affiliate.findOne({ affiliateCode });
      if (!existing) isUnique = true;
    }

    const affiliate = new Affiliate({
      ...(listingId && { listing: listingId }),
      ...(sharedLinkId && { sharedLink: sharedLinkId }),
      owner: ownerId,
      affiliateUser: affiliateUserId,
      commissionRate,
      affiliateCode,
      status: 'active'
    });

    await affiliate.save();
    await affiliate.populate([
      { path: 'owner', select: 'name email' },
      { path: 'affiliateUser', select: 'name email' },
      { path: 'listing', select: 'title price status' },
      { path: 'sharedLink', select: 'title price type linkId' }
    ]);

    return NextResponse.json({ affiliate }, { status: 201 });
  } catch (error) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Error creating affiliate:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}