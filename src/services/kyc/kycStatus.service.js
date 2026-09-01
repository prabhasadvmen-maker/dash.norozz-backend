import { User } from '../../models/user.model.js';
import { KycAuditService } from './kycAudit.service.js';

export class KycStatusService {
  /**
   * Centralized Evaluator for Partner Overall KYC Status
   */
  static async calculateOverallKycStatus(partnerId) {
    const partner = await User.findById(partnerId);
    if (!partner) return null;

    // Auto-align mobile status if phone is verified
    if (partner.isPhoneVerified) {
      if (!partner.kyc.mobile) partner.kyc.mobile = {};
      partner.kyc.mobile.status = 'VERIFIED';
      partner.kyc.mobile.verified = true;
    }

    // Auto-align photo / face match if photo is uploaded
    if (partner.documents?.passportPhoto || partner.profileImage) {
      if (!partner.kyc.faceMatch) partner.kyc.faceMatch = {};
      if (!partner.kyc.faceLiveness) partner.kyc.faceLiveness = {};
      partner.kyc.faceMatch.status = 'VERIFIED';
      partner.kyc.faceMatch.verified = true;
      partner.kyc.faceLiveness.status = 'VERIFIED';
      partner.kyc.faceLiveness.verified = true;
    }

    // Auto-align optional driving license for non-driver categories
    const catName = String(partner.category || partner.agencyName || '').toLowerCase();
    const isDriverCat = catName.includes('driver') || catName.includes('cab') || catName.includes('driving') || catName.includes('delivery');
    if (!isDriverCat && (!partner.kyc.drivingLicense || partner.kyc.drivingLicense.status === 'PENDING')) {
      if (!partner.kyc.drivingLicense) partner.kyc.drivingLicense = {};
      partner.kyc.drivingLicense.status = 'VERIFIED';
      partner.kyc.drivingLicense.verified = true;
    }

    const checks = [
      partner.kyc.mobile?.status || 'PENDING',
      partner.kyc.pan?.status || 'PENDING',
      partner.kyc.aadhaar?.status || partner.kyc.digilocker?.status || 'PENDING',
      partner.kyc.drivingLicense?.status || 'PENDING',
      partner.kyc.bankAccount?.status || 'PENDING',
      partner.kyc.faceMatch?.status || 'PENDING',
      partner.kyc.faceLiveness?.status || 'PENDING',
    ];

    let newOverall = 'PENDING';

    const hasFailed = checks.some((s) => s === 'FAILED');
    const allVerified = checks.every((s) => s === 'VERIFIED');
    const anyInVerification = checks.some((s) => s === 'VERIFIED' || s === 'VERIFYING');

    if (allVerified) {
      newOverall = 'VERIFIED';
    } else if (hasFailed) {
      newOverall = 'FAILED';
    } else if (anyInVerification) {
      newOverall = 'IN_PROGRESS';
    }

    const previousOverall = partner.kyc.overallStatus || 'PENDING';
    partner.kyc.overallStatus = newOverall;

    // Ensure approvalStatus is default PENDING_ADMIN_REVIEW unless already set
    if (!partner.kyc.approvalStatus) {
      partner.kyc.approvalStatus = 'PENDING_ADMIN_REVIEW';
    }

    partner.markModified('kyc');
    await partner.save();

    if (previousOverall !== newOverall) {
      await KycAuditService.logEvent({
        partnerId: partner._id,
        actorRole: 'SYSTEM',
        action: 'KYC_OVERALL_STATUS_CHANGED',
        status: newOverall,
        reason: `KYC overall status evaluated from '${previousOverall}' to '${newOverall}'`,
        metadata: {
          previousOverall,
          newOverall,
          checks: {
            mobile: partner.kyc.mobile?.status,
            pan: partner.kyc.pan?.status,
            aadhaar: partner.kyc.aadhaar?.status,
            digilocker: partner.kyc.digilocker?.status,
            drivingLicense: partner.kyc.drivingLicense?.status,
            bankAccount: partner.kyc.bankAccount?.status,
            faceMatch: partner.kyc.faceMatch?.status,
            faceLiveness: partner.kyc.faceLiveness?.status,
          },
        },
      });
    }

    return {
      overallStatus: newOverall,
      approvalStatus: partner.kyc.approvalStatus,
      partnerStatus: partner.status,
      checks: partner.kyc,
    };
  }
}
