import { ZoopClient, isRealZoopConfigured, isKycSimulationAllowed, assertKycProviderAvailable } from './zoopClient.js';
import { User } from '../../models/user.model.js';
import { KycVerification } from '../../models/kycVerification.model.js';
import { KycAuditService } from '../kyc/kycAudit.service.js';
import { KycStatusService } from '../kyc/kycStatus.service.js';

export class FaceLivenessService {
  static async verifyFaceLiveness(partnerId, options = {}) {
    const partner = await User.findById(partnerId);
    if (!partner) throw new Error('Partner user not found');

    const referenceId = `FL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!partner.kyc) partner.kyc = {};
    partner.kyc.faceLiveness = {
      status: 'VERIFYING',
      verified: false,
      verifiedAt: null,
    };
    partner.markModified('kyc');
    await partner.save();

    let isVerified = true;
    let rawResponse = {};

    if (isRealZoopConfigured()) {
      try {
        const payload = {
          mode: 'sync',
          data: {
            live_video_url: options.videoUrl || options.selfieUrl || partner.profileImage,
            consent: 'Y',
          },
        };
        rawResponse = await ZoopClient.post('/in/biometric/face/liveness', payload);
        const resCode = rawResponse?.response_code || rawResponse?.status;
        isVerified = resCode === '100' || resCode === 'SUCCESS' || rawResponse?.success === true;
      } catch (err) {
        isVerified = false;
        rawResponse = { error: err.message };
      }
    } else {
      assertKycProviderAvailable();
      console.log(`[ZOOP Face Liveness Simulation] Liveness verified for partner ${partnerId}`);
      rawResponse = { isSimulation: true, liveness: 'PASS', status: 'VERIFIED' };
    }

    partner.kyc.faceLiveness = {
      status: isVerified ? 'VERIFIED' : 'FAILED',
      verified: isVerified,
      verifiedAt: isVerified ? new Date() : null,
    };
    partner.markModified('kyc');
    await partner.save();

    await KycVerification.create({
      transactionId: referenceId,
      partnerId: partner._id,
      productType: 'FACE_LIVENESS',
      requestId: referenceId,
      status: isVerified ? 'VERIFIED' : 'FAILED',
      rawResponse,
      verifiedAt: isVerified ? new Date() : null,
    });

    await KycAuditService.logEvent({
      partnerId: partner._id,
      actorRole: 'PARTNER',
      action: isVerified ? 'FACE_LIVENESS_VERIFIED' : 'FACE_LIVENESS_FAILED',
      status: isVerified ? 'VERIFIED' : 'FAILED',
      referenceId,
    });

    await KycStatusService.calculateOverallKycStatus(partner._id);

    return {
      verified: isVerified,
      status: isVerified ? 'VERIFIED' : 'FAILED',
      referenceId,
      message: isVerified ? 'Face liveness check passed ✓' : 'Face liveness check failed',
    };
  }
}
