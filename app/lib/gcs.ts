import { Storage } from '@google-cloud/storage';
import { config } from './config';

const storage = new Storage({
  projectId: config.gcs.projectId,
  keyFilename: config.gcs.credentials,
});

const bucket = storage.bucket(config.gcs.bucketName!);

export interface UploadResult {
  url: string;
  key: string;
  size: number;
}

export async function uploadFile(
  file: File,
  fileName: string,
  userId: string
): Promise<UploadResult> {
  try {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${userId}/${timestamp}_${sanitizedFileName}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const fileRef = bucket.file(key);
    await fileRef.save(buffer, {
      contentType: file.type || 'application/octet-stream',
      resumable: false,
    });

    const url = `https://storage.googleapis.com/${config.gcs.bucketName}/${key}`;

    return {
      url,
      key,
      size: file.size,
    };
  } catch (error) {
    console.error('Error uploading file to GCS:', error);
    throw new Error('Failed to upload file to GCS');
  }
}

export async function deleteFile(key: string): Promise<void> {
  try {
    const fileRef = bucket.file(key);
    await fileRef.delete({ ignoreNotFound: true });
    console.log(`Successfully deleted GCS file: ${key}`);
  } catch (error) {
    console.error('Error deleting file from GCS:', error);
    throw new Error(`Failed to delete file from GCS: ${key}`);
  }
}

export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'storage.googleapis.com') {
      // Path is /bucket_name/key...
      const pathParts = urlObj.pathname.split('/');
      if (pathParts.length > 2 && pathParts[1] === config.gcs.bucketName) {
        return pathParts.slice(2).join('/');
      }
    }
    // Also support old S3 URL extraction for existing files in db if they weren't migrated
    if (urlObj.hostname.includes('.s3.')) {
      return urlObj.pathname.substring(1);
    }
    if (urlObj.hostname.startsWith('s3.')) {
      const pathParts = urlObj.pathname.split('/');
      return pathParts.slice(2).join('/');
    }
    return null;
  } catch (error) {
    console.error('Error extracting key from URL:', error);
    return null;
  }
}

export async function deleteFileByUrl(url: string): Promise<void> {
  try {
    const key = extractKeyFromUrl(url);
    if (!key) {
      throw new Error('Invalid URL format');
    }
    await deleteFile(key);
  } catch (error) {
    console.error('Error deleting file from GCS by URL:', error);
    throw new Error(`Failed to delete file from GCS: ${url}`);
  }
}

export async function cleanupOrphanedFile(uploadResult: UploadResult): Promise<void> {
  try {
    console.log(`Attempting to cleanup orphaned GCS file: ${uploadResult.url}`);
    await deleteFile(uploadResult.key);
    console.log(`Successfully cleaned up orphaned GCS file: ${uploadResult.key}`);
  } catch (error) {
    console.error('Failed to cleanup orphaned GCS file:', error);
  }
}

export async function generatePresignedUrl(key: string, contentType?: string): Promise<string> {
  try {
    const fileRef = bucket.file(key);
    const [signedUrl] = await fileRef.getSignedUrl({
      version: "v4",
      action: "write",
      contentType: contentType || 'application/octet-stream',
      expires: Date.now() + 15 * 60 * 1000 // 15 minutes
    });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw new Error('Failed to generate presigned URL');
  }
}

export async function generatePresignedReadUrl(key: string): Promise<string> {
  try {
    const fileRef = bucket.file(key);
    const [signedUrl] = await fileRef.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 10 * 60 * 1000 // 10-minute TTL, fixed
    });
    return signedUrl;
  } catch (error) {
    console.error('Error generating presigned read URL:', error);
    throw new Error('Failed to generate presigned read URL');
  }
}

export async function downloadFile(url: string): Promise<Buffer> {
  try {
    const key = extractKeyFromUrl(url);
    if (!key) {
      throw new Error('Invalid URL format');
    }

    const fileRef = bucket.file(key);
    const [buffer] = await fileRef.download();
    return buffer;
  } catch (error) {
    console.error('Error downloading file from GCS:', error);
    throw new Error(`Failed to download file from GCS: ${url}`);
  }
}

// Alias for migration compatibility
export const downloadFileFromS3 = downloadFile;
// Keep the other original names as aliases for the initial commit too?
export const uploadFileToS3 = uploadFile;
export const deleteFileFromS3 = deleteFile;
export const deleteFileFromS3ByUrl = deleteFileByUrl;
export const extractKeyFromS3Url = extractKeyFromUrl;
export const cleanupOrphanedS3File = cleanupOrphanedFile;
