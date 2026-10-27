import { pushNotificationService } from '../services/pushNotification.service.js';
import { r2StorageService } from '../services/r2Storage.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const AUDIENCES = ['all', 'customers', 'partners'];

export const pushNotificationController = {
  saveToken: asyncHandler(async (req, res) => {
    const { token, userAgent } = req.body;
    if (!token) throw new ApiError(400, 'FCM token is required');

    const saved = await pushNotificationService.saveToken({
      token,
      userId: req.user?._id || null,
      role: req.user?.role || '',
      userAgent: userAgent || req.headers['user-agent'] || '',
    });
    if (!saved) throw new ApiError(400, 'That is not a valid device token');
    return res.status(200).json(new ApiResponse(200, null, 'Token registered successfully'));
  }),

  sendNotification: asyncHandler(async (req, res) => {
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();
    const imageUrl = String(req.body.imageUrl || '').trim();
    const link = String(req.body.link || req.body.data?.link || '').trim();
    const audience = AUDIENCES.includes(req.body.audience) ? req.body.audience : 'all';

    if (!title || !body) throw new ApiError(400, 'title and body are required');
    if (title.length > 65) throw new ApiError(400, 'title must be 65 characters or fewer');
    if (body.length > 200) throw new ApiError(400, 'body must be 200 characters or fewer');
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) throw new ApiError(400, 'imageUrl must be an http(s) URL');
    if (link && !link.startsWith('/')) throw new ApiError(400, 'link must be an in-app path starting with /');

    const result = await pushNotificationService.sendToAll({
      title, body, imageUrl, link, audience, sentBy: req.user?._id || null, sentByName: req.user?.name || '',
    });
    return res.status(200).json(new ApiResponse(200, result, result.delivered ? 'Notification sent' : result.message));
  }),

  getSummary: asyncHandler(async (req, res) => {
    const summary = await pushNotificationService.getSummary();
    return res.status(200).json(new ApiResponse(200, summary, 'Push summary fetched'));
  }),

  getHistory: asyncHandler(async (req, res) => {
    const items = await pushNotificationService.getHistory(req.query.limit);
    return res.status(200).json(new ApiResponse(200, items, 'Broadcast history fetched'));
  }),

  getSubscriberCount: asyncHandler(async (req, res) => {
    const count = await pushNotificationService.getSubscriberCount();
    return res.status(200).json(new ApiResponse(200, { count }, 'Subscriber count fetched'));
  }),

  getSubscribers: asyncHandler(async (req, res) => {
    const subscribers = await pushNotificationService.getSubscribers();
    return res.status(200).json(new ApiResponse(200, subscribers, 'Subscribers fetched'));
  }),

  uploadImage: asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Image file is required');
    const result = await r2StorageService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'notifications'
    );
    return res.status(200).json(new ApiResponse(200, { url: result.url }, 'Image uploaded successfully'));
  }),
};
