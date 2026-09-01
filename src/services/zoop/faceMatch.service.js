import { ZoopClient, isRealZoopConfigured } from './zoopClient.js';
import { User } from '../../models/user.model.js';
import { KycVerification } from '../../models/kycVerification.model.js';
import { KycAuditService } from '../kyc/kycAudit.service.js';
import { KycStatusService } from '../kyc/kycStatus.service.js';

export class FaceMatchService {
  static async verifyFaceMatch(partnerId, options = {}) {
    const partner = await User.findById(partnerId);
    if (!partner) throw new Error('Partner user not found');

    const referenceId = `FM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!partner.kyc) partner.kyc = {};
    partner.kyc.faceMatch = {
      status: 'VERIFYING',
      verified: false,
      score: null,
      verifiedAt: null,
    };
    partner.markModified('kyc');
    await partner.save();

    let isVerified = true;
    let score = 0.94; // 94% match score
    let rawResponse = {};

    if (isRealZoopConfigured()) {
      try {
        const payload = {
          mode: 'sync',
          data: {
            card_image_url: options.idPhotoUrl || partner.documents?.passportPhoto || partner.profileImage,
            live_image_url: options.selfieUrl || partner.profileImage,
            consent: 'Y',
          },
        };
        rawResponse = await ZoopClient.post('/in/biometric/face/match', payload);
        const resCode = rawResponse?.response_code || rawResponse?.status;
        isVerified = resCode === '100' || resCode === 'SUCCESS' || rawResponse?.success === true;
        score = rawResponse?.match_score || rawResponse?.score || score;
      } catch (err) {
        isVerified = false;
        rawResponse = { error: err.message };
      }
    } else {
      console.log(`[ZOOP Face Match Simulation] Match score ${score * 100}% for partner ${partnerId}`);
      rawResponse = { isSimulation: true, match_score: score, status: 'VERIFIED' };
    }

    partner.kyc.faceMatch = {
      status: isVerified ? 'VERIFIED' : 'FAILED',
      verified: isVerified,
      score: isVerified ? Math.round(score * 100) : 0,
      verifiedAt: isVerified ? new Date() : null,
    };
    partner.markModified('kyc');
    await partner.save();

    await KycVerification.create({
      transactionId: referenceId,
      partnerId: partner._id,
      productType: 'FACE_MATCH',
      requestId: referenceId,
      status: isVerified ? 'VERIFIED' : 'FAILED',
      rawResponse,
      verifiedAt: isVerified ? new Date() : null,
    });

    await KycAuditService.logEvent({
      partnerId: partner._id,
      actorRole: 'PARTNER',
      action: isVerified ? 'FACE_MATCH_VERIFIED' : 'FACE_MATCH_FAILED',
      status: isVerified ? 'VERIFIED' : 'FAILED',
      referenceId,
      metadata: { matchScorePercent: Math.round(score * 100) },
    });

    await KycStatusService.calculateOverallKycStatus(partner._id);

    return {
      verified: isVerified,
      status: isVerified ? 'VERIFIED' : 'FAILED',
      scorePercent: Math.round(score * 100),
      referenceId,
      message: isVerified ? `Face match verified (${Math.round(score * 100)}% match)` : 'Face match failed',
    };
  }
}
