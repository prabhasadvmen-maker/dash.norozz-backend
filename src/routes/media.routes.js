import { Router } from 'express';
import { r2StorageService } from '../services/r2Storage.service.js';

const router = Router();

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
