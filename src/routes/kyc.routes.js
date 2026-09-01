import { Router } from 'express';
import { kycController } from '../controllers/kyc.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';
import { ROLES } from '../constants/roles.constant.js';

const router = Router();

// Public / Webhook Endpoints (Protected by security headers, NOT JWT)
router.post('/digilocker/webhook', kycController.webhookDigiLocker);
router.all('/digilocker/callback', kycController.callbackDigiLocker);

// Partner KYC Verification Endpoints (JWT Protected)
router.use(verifyJWT);

router.post('/otp/send', kycController.sendMobileOtp);
router.post('/otp/verify', kycController.verifyMobileOtp);

router.post('/pan/verify', kycController.verifyPan);
router.post('/digilocker/init', kycController.initDigiLocker);
router.post('/digilocker/fetch', kycController.fetchDigiLocker);

router.post('/driving-license/verify', kycController.verifyDrivingLicense);
router.post('/bank-account/verify', kycController.verifyBankAccount);

router.post('/face-match', kycController.verifyFaceMatch);
router.post('/face-liveness', kycController.verifyFaceLiveness);

router.get('/status/:partnerId?', kycController.getStatus);

// City Admin & Super Admin Management Endpoints
router.get(
  '/admin/partners/:partnerId',
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.ADMIN),
  kycController.getAdminPartnerKyc
);
router.post(
  '/admin/partners/:partnerId/approve',
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.ADMIN),
  kycController.approvePartnerAdmin
);
router.post(
  '/admin/partners/:partnerId/reject',
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.ADMIN),
  kycController.rejectPartnerAdmin
);

export default router;
