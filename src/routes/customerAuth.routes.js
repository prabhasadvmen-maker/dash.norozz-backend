import { Router } from 'express';
import { customerAuthController } from '../controllers/customerAuth.controller.js';
import {
  customerSignupRules,
  customerLoginRules,
  otpLoginRequestRules,
  otpLoginVerifyRules,
  customerForgotPasswordRules,
  customerResetPasswordRules,
  updateCustomerProfileRules,
  addAddressRules,
  updateAddressRules,
} from '../validators/customerAuth.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { otpAuthRateLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

// Public Customer Authentication & OTP Login Endpoints (Rate Limited)
router.post('/signup', otpAuthRateLimiter, customerSignupRules, validate, customerAuthController.signup);
router.post('/login', otpAuthRateLimiter, customerLoginRules, validate, customerAuthController.login);
router.post('/otp-login/request', otpAuthRateLimiter, otpLoginRequestRules, validate, customerAuthController.requestOtpLogin);
router.post('/otp-login/verify', otpAuthRateLimiter, otpLoginVerifyRules, validate, customerAuthController.verifyOtpLogin);
router.post('/forgot-password', otpAuthRateLimiter, customerForgotPasswordRules, validate, customerAuthController.forgotPassword);
router.post('/reset-password', otpAuthRateLimiter, customerResetPasswordRules, validate, customerAuthController.resetPassword);
router.post('/refresh-token', customerAuthController.refreshToken);

// Protected Customer Endpoints (Requires JWT Access Token)
router.post('/logout', verifyJWT, customerAuthController.logout);
router.get('/profile', verifyJWT, customerAuthController.getProfile);
router.put('/profile', verifyJWT, upload.single('profileImage'), updateCustomerProfileRules, validate, customerAuthController.updateProfile);
router.post('/secondary-otp/send', verifyJWT, customerAuthController.sendSecondaryOtp);
router.post('/secondary-otp/verify', verifyJWT, customerAuthController.verifySecondaryOtp);

// Address CRUD Operations
router.post('/addresses', verifyJWT, addAddressRules, validate, customerAuthController.addAddress);
router.get('/addresses', verifyJWT, customerAuthController.getAddresses);
router.put('/addresses/:addressId', verifyJWT, updateAddressRules, validate, customerAuthController.updateAddress);
router.delete('/addresses/:addressId', verifyJWT, customerAuthController.deleteAddress);

export default router;
