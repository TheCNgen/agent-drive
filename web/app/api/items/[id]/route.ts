import { config } from '@/app/lib/config';
import connectDB from '@/app/lib/mongodb';
import { deleteFileByUrl, generatePresignedReadUrl, extractKeyFromUrl } from '@/app/lib/gcs';
import { Item } from '@/app/models/Item';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/app/lib/backend/resolvePrincipal';
import { principalErrorToResponse } from '@/app/lib/backend/errors';


export async function GET(
  request: NextRequest,
){
  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'items:read');

    const id = request.nextUrl.pathname.split("/")[3]

    const item = await Item.findOne({
      _id: id,
      owner: principal.userId
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    
    // Transform URL to presigned URL if it is from GCS
    const itemObj = item.toObject();
    if (itemObj.url && itemObj.url.includes('storage.googleapis.com')) {
      const key = extractKeyFromUrl(itemObj.url);
      if (key) {
        try {
          itemObj.url = await generatePresignedReadUrl(key);
        } catch (e) {
          console.error('Failed to presign url for', key, e);
        }
      }
    }

    return NextResponse.json(itemObj);

  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('GET /api/items/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const dbSession = await mongoose.startSession();

  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'items:write');
    const userId = principal.userId;

    const id = request.nextUrl.pathname.split("/")[3];
    const contentType = request.headers.get('content-type');

    let name: string | undefined;
    let parentId: string | undefined;

    if (contentType?.includes('multipart/form-data')) {
      const formData = await request.formData();
      const nameField = formData.get('name');
      const parentIdField = formData.get('parentId');
      
      name = nameField ? nameField.toString() : undefined;
      parentId = parentIdField ? parentIdField.toString() : undefined;
    } 
    else {
      const body = await request.json();
      name = body.name;
      parentId = body.parentId;
    }

    return await dbSession.withTransaction(async () => {
      const item = await Item.findOne({
        _id: id,
        owner: userId
      }).session(dbSession);

      if (!item) {
        throw new Error('Item not found');
      }

      if (parentId !== undefined && parentId !== item.parentId) {
        if (parentId) {
          const parentFolder = await Item.findOne({
            _id: parentId,
            owner: userId
          }).session(dbSession);
          
          if (!parentFolder || parentFolder?.type !== 'folder') {
            throw new Error('Invalid parent folder');
          }
          
          if (item?.type === 'folder') {
            const isDescendant = await checkIfDescendantWithSession(item._id, parentId, dbSession);
            if (isDescendant) {
              throw new Error('Cannot move folder into itself or its children');
            }
          }
        }
        item.parentId = parentId;
      }

      if (name && name !== item.name) {
        item.name = name;
      }

      await item.save({ session: dbSession });
      return NextResponse.json(item);
    });

  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('PUT /api/items/[id] error:', error);

    if (error.message === 'Item not found') {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    
    if (error.message === 'Invalid parent folder' || 
        error.message === 'Cannot move folder into itself or its children') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
}

export async function DELETE(request: NextRequest) {
  const dbSession = await mongoose.startSession();

  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'items:write');
    const userId = principal.userId;

    const id = request.nextUrl.pathname.split("/")[3];

    return await dbSession.withTransaction(async () => {
      const item = await Item.findOne({
        _id: id,
        owner: userId
      }).session(dbSession);

      if (!item) {
        throw new Error('Item not found');
      }

      const itemsToDelete = await collectItemsToDeleteWithSession(id, userId, dbSession);
      
      const itemIds = itemsToDelete.map(item => item._id);

      const s3DeletionPromises = [];
      if (config.gcs.bucketName) {
        for (const itemToDelete of itemsToDelete) {
          if (itemToDelete?.type === 'file' && itemToDelete.url && itemToDelete.url.startsWith('https://')) {
            s3DeletionPromises.push(
              deleteFileByUrl(itemToDelete.url)
                .then(() => console.log(`Deleted S3 object: ${itemToDelete.url}`))
                .catch(s3Error => console.error(`Failed to delete S3 object for item ${itemToDelete._id}:`, s3Error))
            );
          }
        }
      }

      await Item.deleteMany({ _id: { $in: itemIds } }).session(dbSession);

      if (s3DeletionPromises.length > 0) {
        Promise.all(s3DeletionPromises).catch(error => {
          console.error('S3 cleanup errors occurred:', error);
        });
      }

      return NextResponse.json({ 
        message: 'Item and children deleted successfully',
        deletedCount: itemIds.length 
      });
    });

  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('DELETE /api/items/[id] error:', error);

    if (error.message === 'Item not found') {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  } finally {
    await dbSession.endSession();
  }
}

async function collectItemsToDeleteWithSession(
  itemId: string, 
  ownerId: string, 
  session: mongoose.ClientSession
): Promise<any[]> {
  const item = await Item.findById(itemId).session(session);
  console.log('item', item);
  if (!item || String(item.owner) !== String(ownerId)) return [];

  const itemsToDelete = [item];
  console.log('itemsToDelete', itemsToDelete);

  if (item?.type === 'folder') {
    const children = await Item.find({ parentId: itemId }).session(session);
    for (const child of children) {
      const childItems = await collectItemsToDeleteWithSession(child._id, ownerId, session);
      itemsToDelete.push(...childItems);
    }
  }
  console.log('itemsToDelete', itemsToDelete);
  return itemsToDelete;
}

async function checkIfDescendantWithSession(
  sourceId: string, 
  targetId: string, 
  session: mongoose.ClientSession
): Promise<boolean> {
  if (sourceId === targetId) return true;
  
  const target = await Item.findById(targetId).session(session);
  if (!target || !target.parentId) return false;
  
  return await checkIfDescendantWithSession(sourceId, target.parentId, session);
}

