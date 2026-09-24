import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import fs from 'fs';
import { env } from './env';

export const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
  try {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  } catch {}
}

let s3Client: S3Client | null = null;

if (env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY && env.STORAGE_BUCKET) {
  s3Client = new S3Client({
    region: env.STORAGE_REGION || 'us-east-1',
    endpoint: env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
    forcePathStyle: true, // Often needed for MinIO and some S3-compatible providers
  });
}

export { s3Client };

/**
 * Generates a presigned URL for the client to upload an attachment directly to S3.
 * If S3 is not configured, gracefully falls back to local storage endpoints.
 * Returns the URL and the final destination key/URL.
 */
export async function generatePresignedUploadUrl(
  organizationId: string,
  cardId: string,
  fileName: string,
  fileType?: string,
  // S3 key scope, e.g. `cards/<cardId>` (default) or `chat/<channelId>`.
  // Local-dev fallback endpoints are key-agnostic, so only the S3 path changes.
  keyScope?: string
) {
  // Sanitize filename and create a unique key
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  const fileKey = `${timestamp}-${safeFileName}`;

  if (!s3Client || !env.STORAGE_BUCKET) {
    // Local dev mode fallback
    const baseUrl = env.API_URL || 'http://localhost:3001';
    const uploadUrl = `${baseUrl}/v1/cards/attachments/local-upload?key=${encodeURIComponent(fileKey)}`;
    const publicUrl = `${baseUrl}/v1/cards/attachments/file/${encodeURIComponent(fileKey)}`;
    return { uploadUrl, publicUrl, key: fileKey };
  }

  const key = `orgs/${organizationId}/${keyScope || `cards/${cardId}`}/${fileKey}`;

  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: key,
    ContentType: fileType || 'application/octet-stream',
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  // Construct the final public URL
  let publicUrl = '';
  if (env.STORAGE_ENDPOINT) {
    publicUrl = `${env.STORAGE_ENDPOINT}/${env.STORAGE_BUCKET}/${key}`;
  } else {
    publicUrl = `https://${env.STORAGE_BUCKET}.s3.${env.STORAGE_REGION || 'us-east-1'}.amazonaws.com/${key}`;
  }

  return { uploadUrl, publicUrl, key };
}
