import connectDB from '@/app/lib/mongodb';
import { Item } from '@/app/models/Item';
import { requirePrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');

    await connectDB();
    const principal = await requirePrincipal(request, 'items:read');

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    const targetItem = await Item.findOne({
      _id: itemId,
      owner: principal.userId
    });

    if (!targetItem) {
      return NextResponse.json({ error: 'Item not found or unauthorized' }, { status: 404 });
    }

    const path: any[] = [];
    let currentId = itemId;

    while (currentId) {
      const item = await Item.findOne({
        _id: currentId,
        owner: principal.userId
      });

      if (!item) break;

      path.unshift({
        id: item._id,
        name: item.name,
        type: item?.type
      });

      if (item._id.toString() === principal.rootFolder?.toString()) break;
      currentId = item.parentId;
    }

    return NextResponse.json(path);

  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Path API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
} 