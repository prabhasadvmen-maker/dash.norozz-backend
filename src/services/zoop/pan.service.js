import { ZoopClient, isRealZoopConfigured, isKycSimulationAllowed, assertKycProviderAvailable } from './zoopClient.js';
import { User } from '../../models/user.model.js';
import { KycVerification } from '../../models/kycVerification.model.js';
import { KycAuditService } from '../kyc/kycAudit.service.js';
import { KycStatusService } from '../kyc/kycStatus.service.js';

export class PanVerificationService {
  static maskPan(pan) {
    if (!pan || pan.length < 10) return 'XXXXX1234X';
    return `${pan.slice(0, 3)}XX${pan.slice(5, 8)}X${pan.slice(-1)}`;
  }

  static async verifyPan(partnerId, panNumber) {
    const partner = await User.findById(partnerId);
    if (!partner) throw new Error('Partner user not found');

    const cleanPan = (panNumber || '').trim().toUpperCase();
    if (!cleanPan || !cleanPan.match(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)) {
      throw new Error('Please enter a valid 10-character PAN number (e.g. ABCDE1234F)');
    }

    const referenceId = `PAN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!partner.kyc) partner.kyc = {};
    partner.kyc.pan = {
      status: 'VERIFYING',
      verified: false,
      verifiedAt: null,
      referenceId,
      panNumber: this.maskPan(cleanPan),
    };
    partner.markModified('kyc');
    await partner.save();

    let verificationResult = { verified: true, status: 'VERIFIED' };
    let rawResponse = {};

    if (isRealZoopConfigured()) {
      try {
        const payload = {
          mode: 'sync',
          data: {
            customer_pan_number: cleanPan,
            consent: 'Y',
            consent_text: 'I agree to share my PAN details for Norozz Partner KYC verification',
          },
        };
        rawResponse = await ZoopClient.post('/in/identity/pan/lite', payload);
        const resCode = String(rawResponse?.response_code || rawResponse?.status || '');
        const isSuccess = resCode === '100' || resCode === 'SUCCESS' || (rawResponse?.success === true && resCode !== '101' && resCode !== '106');

        verificationResult = {
          verified: isSuccess,
          status: isSuccess ? 'VERIFIED' : 'FAILED',
          failureReason: isSuccess ? '' : (rawResponse?.metadata?.reason_message || rawResponse?.response_message || 'PAN Verification Failed'),
        };
      } catch (err) {
        // Fallback for valid format in test mode if HTTP error occurs
        if (isKycSimulationAllowed() && cleanPan.match(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)) {
          verificationResult = { verified: true, status: 'VERIFIED', failureReason: '' };
        } else {
          verificationResult = {
            verified: false,
            status: 'FAILED',
            failureReason: err.response?.data?.response_message || err.message || 'ZOOP API error during PAN verification',
          };
        }
      }
    } else {
      // Simulation mode (development only)
      assertKycProviderAvailable();
      console.log(`[ZOOP PAN Simulation] Verified PAN ${this.maskPan(cleanPan)} for partner ${partnerId}`);
      rawResponse = { isSimulation: true, pan: this.maskPan(cleanPan), response_code: '100', response_message: 'PAN Verified (Simulation)' };
    }

    const isVerified = verificationResult.verified;
    partner.kyc.pan = {
      status: isVerified ? 'VERIFIED' : 'FAILED',
      verified: isVerified,
      verifiedAt: isVerified ? new Date() : null,
      referenceId,
      panNumber: this.maskPan(cleanPan),
    };
    if (isVerified) {
      if (!partner.documents) partner.documents = {};
      partner.documents.panDoc = partner.documents.panDoc || '[PAN_VERIFIED_ZOOP]';
    }
    partner.markModified('kyc');
    await partner.save();

    await KycVerification.create({
      transactionId: referenceId,
      partnerId: partner._id,
      productType: 'PAN',
      requestId: referenceId,
      status: isVerified ? 'VERIFIED' : 'FAILED',
      rawResponse,
      failureReason: verificationResult.failureReason || '',
      verifiedAt: isVerified ? new Date() : null,
    });

    await KycAuditService.logEvent({
      partnerId: partner._id,
      actorRole: 'PARTNER',
      action: isVerified ? 'PAN_VERIFIED' : 'PAN_VERIFICATION_FAILED',
      status: isVerified ? 'VERIFIED' : 'FAILED',
      referenceId,
      reason: verificationResult.failureReason || '',
    });

    await KycStatusService.calculateOverallKycStatus(partner._id);

    return {
      verified: isVerified,
      status: isVerified ? 'VERIFIED' : 'FAILED',
      referenceId,
      maskedPan: this.maskPan(cleanPan),
      message: isVerified ? 'PAN verified successfully!' : (verificationResult.failureReason || 'PAN verification failed'),
    };
  }
}
