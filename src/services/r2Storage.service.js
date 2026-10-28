import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
dotenv.config();

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  // Newer SDKs bake an empty-body CRC32 into presigned URLs, which breaks browser PUT uploads to R2
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export class R2StorageService {
  /**
   * Upload Buffer or File to Cloudflare R2
   */
  async uploadFile(fileBuffer, fileName, mimeType = 'application/octet-stream', folder = 'uploads') {
    try {
      if (!R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
        throw new Error('Cloudflare R2 storage credentials are not properly configured in environment variables.');
      }
      const key = `${folder}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      });

      await s3Client.send(command);

      // Return public Media Proxy URL (or R2 Public Custom Domain / r2.dev if configured)
      let baseMediaUrl = process.env.R2_PUBLIC_DOMAIN;
      if (!baseMediaUrl || baseMediaUrl.includes('r2.cloudflarestorage.com')) {
        const host = process.env.SERVER_URL || (process.env.NODE_ENV === 'production' ? 'https://api.norozz.in' : `http://localhost:${process.env.PORT || 5000}`);
        baseMediaUrl = `${host}/api/media`;
      }
      const publicUrl = `${baseMediaUrl.replace(/\/$/, '')}/${key}`;

      return {
        key,
        url: publicUrl,
        bucket: R2_BUCKET,
      };
    } catch (error) {
      console.error('❌ Cloudflare R2 Upload Error:', error);
      throw error;
    }
  }

  /**
   * Generate Presigned URL for Upload
   */
  async getPresignedUrl(fileName, mimeType, folder = 'uploads') {
    try {
      if (!R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
        throw new Error('Cloudflare R2 storage credentials are not properly configured.');
      }
      const key = `${folder}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: mimeType,
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      let baseMediaUrl = process.env.R2_PUBLIC_DOMAIN;
      if (!baseMediaUrl || baseMediaUrl.includes('r2.cloudflarestorage.com')) {
        const host = process.env.SERVER_URL || (process.env.NODE_ENV === 'production' ? 'https://api.norozz.in' : `http://localhost:${process.env.PORT || 5000}`);
        baseMediaUrl = `${host}/api/media`;
      }
      const publicUrl = `${baseMediaUrl.replace(/\/$/, '')}/${key}`;

      return {
        presignedUrl,
        publicUrl,
        key
      };
    } catch (error) {
      console.error('❌ Cloudflare R2 Presigned URL Error:', error);
      throw error;
    }
  }

  /**
   * Fetch object stream from Cloudflare R2
   */
  async getFileObject(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      });
      return await s3Client.send(command);
    } catch (error) {
      console.error(`❌ Cloudflare R2 Fetch Error for key [${key}]:`, error);
      throw error;
    }
  }

  /**
   * Upload Base64 Image or Video string to Cloudflare R2
   */
  async uploadBase64Media(base64String, folder = 'uploads') {
    try {
      if (!base64String || typeof base64String !== 'string') return null;

      // If already an HTTP/HTTPS URL, return as is
      if (base64String.startsWith('http://') || base64String.startsWith('https://')) {
        return base64String;
      }

      const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return base64String;
      }

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const isVideo = mimeType.startsWith('video/');
      const ext = mimeType.split('/')[1] || (isVideo ? 'mp4' : 'jpeg');
      const prefix = isVideo ? 'vid' : 'img';
      const fileName = `${prefix}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}.${ext}`;

      const res = await this.uploadFile(buffer, fileName, mimeType, folder);
      return res.url;
    } catch (error) {
      console.error('❌ Cloudflare R2 Base64 Media Upload Error:', error);
      return base64String;
    }
  }

  /**
   * Upload Base64 Image string to Cloudflare R2
   */
  async uploadBase64Image(base64String, folder = 'profiles') {
    return await this.uploadBase64Media(base64String, folder);
  }
}

export const r2StorageService = new R2StorageService();
