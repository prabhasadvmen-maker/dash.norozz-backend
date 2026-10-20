import { BaseController } from './base.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { User } from '../models/user.model.js';
import { MobileOtpService } from '../services/zoop/mobileOtp.service.js';
import { PanVerificationService } from '../services/zoop/pan.service.js';
import { DigiLockerService } from '../services/zoop/digilocker.service.js';
import { DrivingLicenseVerificationService } from '../services/zoop/drivingLicense.service.js';
import { BankAccountVerificationService } from '../services/zoop/bankAccount.service.js';
import { FaceMatchService } from '../services/zoop/faceMatch.service.js';
import { FaceLivenessService } from '../services/zoop/faceLiveness.service.js';
import { KycStatusService } from '../services/kyc/kycStatus.service.js';
import { cityAdminService } from '../services/cityAdmin.service.js';
import { KycAuditService } from '../services/kyc/kycAudit.service.js';

export class KycController extends BaseController {
  // 1. MOBILE OTP
  sendMobileOtp = asyncHandler(async (req, res) => {
    return this.sendSuccess(res, { sent: true, expirySeconds: 300 }, 'OTP sent to mobile number');
  });

  verifyMobileOtp = asyncHandler(async (req, res) => {
    const partnerId = req.user._id;
    const result = await MobileOtpService.verifyPartnerMobile(partnerId, req.body.phone || req.user.phone);
    return this.sendSuccess(res, result, 'Mobile OTP verified successfully');
  });

  // 2. PAN VERIFICATION
  verifyPan = asyncHandler(async (req, res) => {
    const partnerId = req.user._id;
    const { panNumber } = req.body;
    const result = await PanVerificationService.verifyPan(partnerId, panNumber);
    return this.sendSuccess(res, result, result.message);
  });

  // 3. DIGILOCKER INIT, WEBHOOK, FETCH, CALLBACK
  initDigiLocker = asyncHandler(async (req, res) => {
    const partnerId = req.user._id;
    const result = await DigiLockerService.initDigiLocker(partnerId, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  webhookDigiLocker = asyncHandler(async (req, res) => {
    const result = await DigiLockerService.processWebhook(req.headers, req.body);
    if (!result.success) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(result);
    }
    return res.status(HTTP_STATUS.OK).json(result);
  });

  fetchDigiLocker = asyncHandler(async (req, res) => {
    const { requestId } = req.body;
    const result = await DigiLockerService.fetchStatus(requestId);
    return this.sendSuccess(res, result, 'DigiLocker status retrieved successfully');
  });

  callbackDigiLocker = asyncHandler(async (req, res) => {
    const requestId = req.query?.request_id || req.body?.request_id || req.query?.requestId;
    if (requestId) {
      await DigiLockerService.processWebhook(req.headers, { request_id: requestId, transaction_status: 'COMPLETED' });
    }
    return this.sendSuccess(res, { completed: true, requestId }, 'DigiLocker authentication completed');
  });

  // 4. DRIVING LICENCE
  verifyDrivingLicense = asyncHandler(async (req, res) => {
    const partnerId = req.user._id;
    const { dlNumber, dob } = req.body;
    const result = await DrivingLicenseVerificationService.verifyDl(partnerId, dlNumber, dob);
    return this.sendSuccess(res, result, result.message);
  });

  // 5. BANK ACCOUNT
  verifyBankAccount = asyncHandler(async (req, res) => {
    const partnerId = req.user._id;
    const result = await BankAccountVerificationService.verifyBankAccount(partnerId, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  // 6. FACE MATCH
  verifyFaceMatch = asyncHandler(async (req, res) => {
    const partnerId = req.user._id;
    const result = await FaceMatchService.verifyFaceMatch(partnerId, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  // 7. FACE LIVENESS
  verifyFaceLiveness = asyncHandler(async (req, res) => {
    const partnerId = req.user._id;
    const result = await FaceLivenessService.verifyFaceLiveness(partnerId, req.body);
    return this.sendSuccess(res, result, result.message);
  });

  // 8. GET KYC STATUS
  getStatus = asyncHandler(async (req, res) => {
    const isAdmin = ['superadmin', 'admin', 'cityAdmin'].includes(req.user.role);
    if (req.params.partnerId && !isAdmin && String(req.params.partnerId) !== String(req.user._id)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'You can only view your own KYC status');
    }
    const targetPartnerId = req.params.partnerId || req.user._id;
    const statusObj = await KycStatusService.calculateOverallKycStatus(targetPartnerId);
    return this.sendSuccess(res, statusObj, 'KYC status retrieved successfully');
  });

  // 9. CITY ADMIN GET PARTNER KYC
  getAdminPartnerKyc = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;
    const partner = await User.findById(partnerId).select('-password -refreshToken').lean();
    if (!partner) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner not found');

    const statusObj = await KycStatusService.calculateOverallKycStatus(partnerId);
    return this.sendSuccess(res, { partner, kyc: statusObj }, 'Admin partner KYC details retrieved successfully');
  });

  // 10. CITY ADMIN APPROVE PARTNER
  approvePartnerAdmin = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;
    const { isManualOverride, overrideReason } = req.body || {};
    const assignedCity = req.user.assignedCity || req.user.city || 'Delhi NCR';

    if (isManualOverride) {
      if (!overrideReason) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Reason is required for manual override approval');
      }
      const partner = await User.findById(partnerId);
      if (!partner) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Partner not found');

      partner.kyc.approvalStatus = 'APPROVED';
      partner.kyc.manualOverride = true;
      partner.kyc.overrideReason = overrideReason;
      partner.kyc.adminReviewedAt = new Date();
      partner.kyc.adminReviewedBy = req.user._id;
      partner.kycStatus = 'approved';
      partner.status = 'active';
      await partner.save();

      await KycAuditService.logEvent({
        partnerId: partner._id,
        actorId: req.user._id,
        actorRole: 'CITY_ADMIN',
        action: 'MANUAL_OVERRIDE_APPROVE',
        status: 'APPROVED',
        reason: overrideReason,
      });

      return this.sendSuccess(res, { partner }, `Partner '${partner.name}' approved via MANUAL OVERRIDE`);
    }

    const result = await cityAdminService.approvePartner(partnerId, assignedCity);
    return this.sendSuccess(res, result, result.message);
  });

  // 11. CITY ADMIN REJECT PARTNER
  rejectPartnerAdmin = asyncHandler(async (req, res) => {
    const { partnerId } = req.params;
    const { reason } = req.body;
    const assignedCity = req.user.assignedCity || req.user.city || 'Delhi NCR';

    const result = await cityAdminService.rejectPartner(partnerId, reason || 'Document verification failed', assignedCity);
    return this.sendSuccess(res, result, result.message);
  });
}

export const kycController = new KycController();
