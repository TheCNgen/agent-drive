import { config } from '@/app/lib/config';
import connectDB from '@/app/lib/mongodb';
import { cleanupOrphanedFile, uploadFile, generatePresignedReadUrl, extractKeyFromUrl } from '@/app/lib/gcs';
import { submitHCSRecord } from '@/app/lib/hedera';
import { Item } from '@/app/models/Item';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parentId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const cursor = searchParams.get('cursor');

    await connectDB();

    const principal = await requirePrincipal(request, 'items:read');
    const userId = principal.userId;

    let query: any = parentId
      ? { parentId, owner: userId }
      : { _id: principal.rootFolder };

    if (!parentId) {
      let items = await Item.find(query).lean();
      
      // Transform URLs to presigned URLs if they are from GCS
      items = await Promise.all(items.map(async (item: any) => {
        if (item.url && item.url.includes('storage.googleapis.com')) {
          const key = extractKeyFromUrl(item.url);
          if (key) {
            try {
              item.url = await generatePresignedReadUrl(key);
            } catch (e) {
              console.error('Failed to presign url for', key, e);
            }
          }
        }
        return item;
      }));

      return NextResponse.json({
        items,
        pagination: {
          current: 1,
          total: 1,
          count: items.length,
          totalItems: items.length,
          hasNextPage: false,
          hasPreviousPage: false,
          nextCursor: null,
          limit: items.length
        }
      });
    }

    if (parentId) {
      const parentFolder = await Item.findOne({ 
        _id: parentId, 
        owner: userId,
        type: 'folder'
      });
      
      if (!parentFolder) {
        return NextResponse.json({ error: 'Parent folder not found or unauthorized' }, { status: 404 });
      }
    }

    if (cursor) {
      query._id = { $lt: cursor };
    }

    const totalItems = await Item.countDocuments({
      parentId,
      owner: userId
    });

    let items = await Item.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    // Transform URLs to presigned URLs if they are from GCS
    items = await Promise.all(items.map(async (item: any) => {
      if (item.url && item.url.includes('storage.googleapis.com')) {
        const key = extractKeyFromUrl(item.url);
        if (key) {
          try {
            item.url = await generatePresignedReadUrl(key);
          } catch (e) {
            console.error('Failed to presign url for', key, e);
          }
        }
      }
      return item;
    }));

    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = items.length === limit;
    const hasPreviousPage = page > 1;
    const nextCursor = hasNextPage ? items[items.length - 1]._id : null;

    return NextResponse.json({
      items,
      pagination: {
        current: page,
        total: totalPages,
        count: items.length,
        totalItems,
        hasNextPage,
        hasPreviousPage,
        nextCursor,
        limit
      }
    });

  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('Items GET API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const dbSession = await mongoose.startSession();

  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'items:write');
    const userId = principal.userId;
    const rootFolder = principal.rootFolder;

    const contentType = request.headers.get('content-type');

    if (contentType?.includes('multipart/form-data')) {
      return await dbSession.withTransaction(async () => {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const url = formData.get('url') as string;
        const parentId = formData.get('parentId') as string;
        const name = formData.get('name') as string;

        if (!name) {
          throw new Error('Name is required');
        }

        if (!file && !url) {
          throw new Error('Either file or URL must be provided');
        }

        if (parentId) {
          const parentFolder = await Item.findById(parentId).session(dbSession);
          if (!parentFolder || parentFolder?.type !== 'folder') {
            throw new Error('Invalid parent folder');
          }
          
          if (parentFolder.owner.toString() !== userId) {
            throw new Error('Unauthorized access to parent folder');
          }
        }

        let fileUrl: string;
        let fileSize: number = 0;
        let mimeType: string | null = null;
        let uploadResult: any = null;

        if (file) {
          fileSize = file.size;
          mimeType = file?.type;

          if (config.gcs.bucketName) {
            try {
              uploadResult = await uploadFile(file, name, userId);
              fileUrl = uploadResult.url;
              fileSize = uploadResult.size;
            } catch (error) {
              console.error('S3 upload failed:', error);
              throw new Error('File upload failed');
            }
          } else {
            console.warn('S3 not configured, using placeholder URL');
            fileUrl = 'placeholder-url-s3-not-configured';
          }
        } else if (url) {
          fileUrl = url;
          fileSize = 0;
          mimeType = null;
        } else {
          throw new Error('Either file or URL must be provided');
        }

        try {
          const [item] = await Item.create([{
            name,
            type: 'file',
            parentId: parentId || rootFolder,
            owner: userId,
            size: fileSize,
            mimeType: mimeType,
            url: fileUrl,
          }], { session: dbSession });

          const itemId = item._id.toString();
          
          const response = NextResponse.json(item, { status: 201 });

          // Submit HCS record synchronously
          await submitHCSRecord('ITEM_CREATED', {
            itemId: itemId,
            name: item.name,
            owner: item.owner.toString(),
            type: item.type
          });

          return response;

        } catch (dbError) {
          if (uploadResult && config.gcs.bucketName) {
            try {
              console.warn('Database operation failed, attempting S3 cleanup for:', uploadResult.url);
              await cleanupOrphanedFile(uploadResult);
            } catch (cleanupError) {
              console.error('Failed to cleanup S3 file:', cleanupError);
            }
          }
          throw dbError;
        }
      });

    } else {
      return await dbSession.withTransaction(async () => {
        const body = await request.json();
        const { name, parentId, type } = body;

        if (!name || !type) {
          throw new Error('Name and type are required');
        }

        if (!['file', 'folder'].includes(type)) {
          throw new Error('Invalid type. Must be "file" or "folder".');
        }

        if (parentId) {
          const parentFolder = await Item.findById(parentId).session(dbSession);
          if (!parentFolder || parentFolder?.type !== 'folder') {
            throw new Error('Invalid parent folder');
          }
          
          if (parentFolder.owner.toString() !== userId) {
            throw new Error('Unauthorized access to parent folder');
          }
        }

        if (type === 'folder') {
          const [item] = await Item.create([{
            name,
            type: 'folder',
            parentId: parentId || rootFolder,
            owner: userId,
          }], { session: dbSession });

          return NextResponse.json(item, { status: 201 });
        }

        throw new Error('Unsupported operation');
      });
    }

  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;

    console.error('API Error:', error);

    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error.message.includes('Name is required') ||
        error.message.includes('Either file or URL must be provided') ||
        error.message.includes('Invalid parent folder') ||
        error.message.includes('Invalid type')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    if (error.message.includes('File upload failed')) {
      return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
} 