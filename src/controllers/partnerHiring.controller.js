import { BaseController } from './base.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { partnerHiringService } from '../services/partnerHiring.service.js';
import { getClientIp } from '../middleware/rateLimiter.middleware.js';

class PartnerHiringController extends BaseController {
  sendOtp = asyncHandler(async (req, res) => {
    const data = await partnerHiringService.sendOtp(req.body.channel, req.body.value);
    return this.sendSuccess(res, data, 'OTP sent successfully');
  });

  verifyOtp = asyncHandler(async (req, res) => {
    const data = await partnerHiringService.verifyOtp(req.body.channel, req.body.value, req.body.otp);
    return this.sendSuccess(res, data, 'OTP verified');
  });

  apply = asyncHandler(async (req, res) => {
    const data = await partnerHiringService.submitApplication(req.body, req.files || {}, getClientIp(req));
    return this.sendCreated(res, data, 'Application created. Complete the payment to submit.');
  });

  verifyPayment = asyncHandler(async (req, res) => {
    const data = await partnerHiringService.verifyPayment(req.params.id, req.body);
    return this.sendSuccess(res, data, 'Payment verified. Registration submitted.');
  });

  adminList = asyncHandler(async (req, res) =>
    this.sendSuccess(res, await partnerHiringService.adminList(req.query)));

  adminStats = asyncHandler(async (req, res) =>
    this.sendSuccess(res, await partnerHiringService.adminStats()));

  adminGet = asyncHandler(async (req, res) =>
    this.sendSuccess(res, await partnerHiringService.adminGet(req.params.id)));

  adminReview = asyncHandler(async (req, res) =>
    this.sendSuccess(
      res,
      await partnerHiringService.adminReview(req.params.id, req.body, req.user?._id || req.user?.id),
      'Application updated'
    ));
}

export const partnerHiringController = new PartnerHiringController();
