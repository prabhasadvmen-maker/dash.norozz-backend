import { User } from '../../models/user.model.js';
import { KycVerification } from '../../models/kycVerification.model.js';
import { KycAuditService } from '../kyc/kycAudit.service.js';
import { KycStatusService } from '../kyc/kycStatus.service.js';

export class MobileOtpService {
  static async verifyPartnerMobile(partnerId, phone) {
    const partner = await User.findById(partnerId);
    if (!partner) throw new Error('Partner not found');

    if (!partner.kyc) partner.kyc = {};
    if (!partner.kyc.mobile) partner.kyc.mobile = {};

    const referenceId = `MOB-OTP-${Date.now()}`;
    partner.kyc.mobile = {
      status: 'VERIFIED',
      verified: true,
      verifiedAt: new Date(),
      referenceId,
    };
    partner.isPhoneVerified = true;
    partner.markModified('kyc');
    await partner.save();

    await KycVerification.create({
      transactionId: referenceId,
      partnerId: partner._id,
      productType: 'MOBILE_OTP',
      requestId: referenceId,
      status: 'VERIFIED',
      verifiedAt: new Date(),
    });

    await KycAuditService.logEvent({
      partnerId: partner._id,
      actorRole: 'PARTNER',
      action: 'MOBILE_OTP_VERIFIED',
      status: 'VERIFIED',
      referenceId,
    });

    await KycStatusService.calculateOverallKycStatus(partner._id);

    return { verified: true, status: 'VERIFIED', referenceId };
  }
}
