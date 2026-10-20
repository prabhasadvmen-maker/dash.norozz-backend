import { Router } from 'express';
import { r2StorageService } from '../services/r2Storage.service.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const ALLOWED_UPLOAD_FOLDERS = ['banners', 'services', 'categories', 'uploads'];
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif|svg\+xml)|video\/(mp4|webm)|application\/pdf)$/;

const router = Router();

/**
 * Generate Presigned URL for Upload
 * POST /api/media/presigned-url
 */
router.post('/presigned-url', verifyJWT, authorizeRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN), async (req, res) => {
  try {
    const { fileName, mimeType, folder } = req.body;
    if (!fileName || !mimeType) {
      return res.status(400).json({ success: false, message: 'fileName and mimeType are required' });
    }
    if (!ALLOWED_MIME.test(String(mimeType))) {
      return res.status(400).json({ success: false, message: 'File type is not allowed' });
    }
    const safeFolder = ALLOWED_UPLOAD_FOLDERS.includes(folder) ? folder : 'banners';
    const result = await r2StorageService.getPresignedUrl(String(fileName).slice(0, 120), mimeType, safeFolder);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Presigned URL Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate presigned URL' });
  }
});

/**
 * Public Media Proxy Endpoint for Cloudflare R2 files
 * GET /api/media/*
 */
router.get('/*', async (req, res) => {
  try {
    const rawKey = req.params[0] || req.path.replace(/^\//, '');
    if (!rawKey) {
      return res.status(400).json({ error: 'Media file key is required' });
    }

    // Decode URI component (e.g. spaces or special chars)
    let key = decodeURIComponent(rawKey);
    const bucketName = process.env.R2_BUCKET || 'advmenngo';
    if (key.startsWith(`${bucketName}/`)) {
      key = key.substring(bucketName.length + 1);
    }

    if (key.includes('..')) {
      return res.status(400).json({ error: 'Invalid media key' });
    }

    const s3Object = await r2StorageService.getFileObject(key);

    // Allow cross-origin image loading in browsers (prevents ERR_BLOCKED_BY_RESPONSE.NotSameOrigin)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');

    if (s3Object.ContentType) {
      res.setHeader('Content-Type', s3Object.ContentType);
    }
    if (s3Object.ContentLength) {
      res.setHeader('Content-Length', s3Object.ContentLength);
    }

    // Set browser caching header (1 year cache)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Stream Cloudflare R2 file directly to browser
    s3Object.Body.pipe(res);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    console.error('❌ Media Proxy Stream Error:', error);
    return res.status(500).json({ error: 'Failed to stream media file' });
  }
});

export default router;
