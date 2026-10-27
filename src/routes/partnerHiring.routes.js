import { Router } from 'express';
import multer from 'multer';
import { partnerHiringController } from '../controllers/partnerHiring.controller.js';
import { hiringOtpSendRules, hiringOtpVerifyRules, hiringVerifyPaymentRules } from '../validators/partnerHiring.validator.js';
import { validate } from '../validators/index.js';
import { otpAuthRateLimiter } from '../middleware/rateLimiter.middleware.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new ApiError(HTTP_STATUS.BAD_REQUEST, 'Only images and PDF files up to 5 MB are allowed'), false);
  },
});

const documentFields = upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'identityProof', maxCount: 1 },
  { name: 'addressProof', maxCount: 1 },
  { name: 'drivingLicence', maxCount: 1 },
]);

// Public endpoints (no login) used by the /partner/hiring form
router.post('/otp/send', otpAuthRateLimiter, hiringOtpSendRules, validate, partnerHiringController.sendOtp);
router.post('/otp/verify', otpAuthRateLimiter, hiringOtpVerifyRules, validate, partnerHiringController.verifyOtp);
router.post('/applications', documentFields, partnerHiringController.apply);
router.post('/applications/:id/verify-payment', hiringVerifyPaymentRules, validate, partnerHiringController.verifyPayment);

export default router;
