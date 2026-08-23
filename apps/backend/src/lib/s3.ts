import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

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

/**
 * Generates a presigned URL for the client to upload an attachment directly to S3.
 * Returns the URL and the final destination key/URL.
 */
export async function generatePresignedUploadUrl(
  organizationId: string,
  cardId: string,
  fileName: string,
  fileType?: string
) {
  if (!s3Client || !env.STORAGE_BUCKET) {
    throw new Error('S3 storage is not configured on the server.');
  }

  // Sanitize filename and create a unique key
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  const key = `orgs/${organizationId}/cards/${cardId}/${timestamp}-${safeFileName}`;

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
