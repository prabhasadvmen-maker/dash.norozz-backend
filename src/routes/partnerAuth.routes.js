import { Router } from 'express';
import { partnerAuthController } from '../controllers/partnerAuth.controller.js';
import {
  partnerSignupRules,
  partnerLoginRules,
  partnerForgotPasswordRules,
  partnerResetPasswordRules,
  partnerOtpRequestRules,
  partnerOtpVerifyRules,
  updatePartnerProfileRules,
  onboardingDocumentsRules,
  onboardingCategoryRules,
  onboardingSkillsRules,
  onboardingServiceAreaRules,
  onboardingWorkingHoursRules,
} from '../validators/partnerAuth.validator.js';
import { validate } from '../validators/index.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { otpAuthRateLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

// Public Authentication Endpoints (Rate Limited)
router.post('/signup', otpAuthRateLimiter, partnerSignupRules, validate, partnerAuthController.signup);
router.post('/login', otpAuthRateLimiter, partnerLoginRules, validate, partnerAuthController.login);
router.post('/otp/request', otpAuthRateLimiter, partnerOtpRequestRules, validate, partnerAuthController.requestOtpLogin);
router.post('/otp/verify', otpAuthRateLimiter, partnerOtpVerifyRules, validate, partnerAuthController.verifyOtpLogin);
router.post('/forgot-password', otpAuthRateLimiter, partnerForgotPasswordRules, validate, partnerAuthController.forgotPassword);
router.post('/reset-password', otpAuthRateLimiter, partnerResetPasswordRules, validate, partnerAuthController.resetPassword);

// Multi-file Upload for KYC Documents (Aadhaar, PAN, GST, Bank Passbook, Profile Image, Driving License, Photo)
const kycDocUploadFields = upload.fields([
  { name: 'aadhaarDoc', maxCount: 1 },
  { name: 'aadhaarFront', maxCount: 1 },
  { name: 'aadhaarBack', maxCount: 1 },
  { name: 'panDoc', maxCount: 1 },
  { name: 'gstDoc', maxCount: 1 },
  { name: 'bankPassbookDoc', maxCount: 1 },
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'drivingLicenseDoc', maxCount: 1 },
  { name: 'profileImage', maxCount: 1 },
]);

// Protected Partner Endpoints (Requires JWT Access Token)
router.post('/logout', verifyJWT, partnerAuthController.logout);
router.get('/kyc-status', verifyJWT, partnerAuthController.getKycStatus);
router.put('/profile', verifyJWT, kycDocUploadFields, updatePartnerProfileRules, validate, partnerAuthController.updateProfile);
router.post('/kyc-submit', verifyJWT, partnerAuthController.submitKycSetup);

// Step-wise Dedicated Partner Onboarding Endpoints
router.post('/onboarding/location', verifyJWT, partnerAuthController.saveOnboardingLocation);
router.post('/onboarding/documents', verifyJWT, kycDocUploadFields, partnerAuthController.saveOnboardingDocuments);
router.post('/upload-documents', verifyJWT, kycDocUploadFields, partnerAuthController.uploadDocuments);
router.post('/onboarding/category', verifyJWT, onboardingCategoryRules, validate, partnerAuthController.saveOnboardingCategory);
router.post('/onboarding/skills', verifyJWT, onboardingSkillsRules, validate, partnerAuthController.saveOnboardingSkills);
router.post('/onboarding/service-area', verifyJWT, onboardingServiceAreaRules, validate, partnerAuthController.saveOnboardingServiceArea);
router.post('/onboarding/working-hours', verifyJWT, onboardingWorkingHoursRules, validate, partnerAuthController.saveOnboardingWorkingHours);

// Individual Certification Upload & Delete Endpoints
router.post('/certifications', verifyJWT, upload.single('certificateFile'), partnerAuthController.addCertification);
router.delete('/certifications/:certId', verifyJWT, partnerAuthController.deleteCertification);

export default router;
