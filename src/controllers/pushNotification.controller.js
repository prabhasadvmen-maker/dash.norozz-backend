import { pushNotificationService } from '../services/pushNotification.service.js';
import { r2StorageService } from '../services/r2Storage.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const pushNotificationController = {
  saveToken: asyncHandler(async (req, res) => {
    const { token, userAgent } = req.body;
    if (!token) throw new ApiError(400, 'FCM token is required');

    pushNotificationService.saveToken(token, userAgent || req.headers['user-agent'] || '');
    return res.status(200).json(new ApiResponse(200, null, 'Token registered successfully'));
  }),

  sendNotification: asyncHandler(async (req, res) => {
    const { title, body, imageUrl, data } = req.body;
    if (!title || !body) throw new ApiError(400, 'title and body are required');

    const result = await pushNotificationService.sendToAll({ title, body, imageUrl, data });
    return res.status(200).json(new ApiResponse(200, result, 'Notification sent'));
  }),

  getSubscriberCount: asyncHandler(async (req, res) => {
    const count = pushNotificationService.getSubscriberCount();
    return res.status(200).json(new ApiResponse(200, { count }, 'Subscriber count fetched'));
  }),

  getSubscribers: asyncHandler(async (req, res) => {
    const subscribers = pushNotificationService.getSubscribers();
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
