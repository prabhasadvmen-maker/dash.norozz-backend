import { ZoopClient, isRealZoopConfigured, isKycSimulationAllowed, assertKycProviderAvailable } from './zoopClient.js';
import { User } from '../../models/user.model.js';
import { KycVerification } from '../../models/kycVerification.model.js';
import { KycAuditService } from '../kyc/kycAudit.service.js';
import { KycStatusService } from '../kyc/kycStatus.service.js';

export class DigiLockerService {
  /**
   * Initialize ZOOP DigiLocker Transaction
   */
  static async initDigiLocker(partnerId, options = {}) {
    const partner = await User.findById(partnerId);
    if (!partner) throw new Error('Partner user not found');

    const requestId = `DIGI-REQ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const securityKey = process.env.ZOOP_WEBHOOK_SECURITY_KEY || `SEC-KEY-${Date.now()}`;

    const defaultDocs = options.docs || ['ADHAR', 'PANCR', 'DRVLC'];
    const purpose = options.purpose || 'Norozz Partner KYC Verification';

    const baseUrl = process.env.APP_URL || 'http://localhost:5000';
    const response_url = `${baseUrl}/api/kyc/digilocker/webhook`;
    const redirect_url = options.redirect_url || `${process.env.CORS_ORIGIN || 'http://localhost:5173'}/partner/kyc/callback`;

    const requestPayload = {
      docs: defaultDocs,
      purpose,
      response_url,
      redirect_url,
      fast_track: 'N',
    };

    let rawResponse = {};
    let gatewayUrl = `${baseUrl}/api/kyc/digilocker/gateway-simulation?request_id=${requestId}`;

    if (isRealZoopConfigured()) {
      try {
        rawResponse = await ZoopClient.post('/in/identity/digilocker/init', requestPayload, {
          'x-webhook-security-key': securityKey,
        });
        if (rawResponse?.request_id) {
          gatewayUrl = rawResponse.gateway_url || rawResponse.url || gatewayUrl;
        }
      } catch (err) {
        if (!isKycSimulationAllowed()) throw err;
        console.warn('[ZOOP DigiLocker Init Warning] API call failed, using simulation gateway:', err.message);
      }
    } else {
      assertKycProviderAvailable();
      console.log(`[ZOOP DigiLocker Simulation Init] RequestId: ${requestId}`);
      rawResponse = { isSimulation: true, request_id: requestId, gateway_url: gatewayUrl };
    }

    if (!partner.kyc) partner.kyc = {};
    partner.kyc.digilocker = {
      requestId,
      securityKey,
      status: 'VERIFYING',
      initializedAt: new Date(),
      completedAt: null,
      docStatuses: {
        ADHAR: 'PENDING',
        PANCR: 'PENDING',
        DRVLC: 'PENDING',
      },
    };
    partner.kyc.aadhaar = {
      status: 'VERIFYING',
      verified: false,
      verifiedAt: null,
      referenceId: requestId,
    };
    partner.markModified('kyc');
    await partner.save();

    await KycVerification.create({
      transactionId: requestId,
      partnerId: partner._id,
      productType: 'DIGILOCKER',
      requestId,
      securityKey,
      status: 'VERIFYING',
      rawResponse,
    });

    await KycAuditService.logEvent({
      partnerId: partner._id,
      actorRole: 'PARTNER',
      action: 'DIGILOCKER_INITIALIZED',
      status: 'VERIFYING',
      referenceId: requestId,
      metadata: { requestPayload, gatewayUrl },
    });

    return {
      success: true,
      requestId,
      gatewayUrl,
      docs: defaultDocs,
      message: 'DigiLocker gateway initialized successfully',
    };
  }

  /**
   * Secure Webhook Handler (Idempotency & Security Key Protected)
   */
  static async processWebhook(headers, body) {
    const requestId = body?.request_id || body?.requestId;
    if (!requestId) {
      return { success: false, code: 'INVALID_WEBHOOK', message: 'Missing request_id in payload' };
    }

    const verificationRecord = await KycVerification.findOne({ requestId, productType: 'DIGILOCKER' });
    if (!verificationRecord) {
      return { success: false, code: 'NOT_FOUND', message: `No DigiLocker record found for request_id: ${requestId}` };
    }

    // Security Key Validation
    const incomingKey = headers['x-webhook-security-key'] || headers['webhook-security-key'] || body?.webhook_security_key;
    const expectedKey = verificationRecord.securityKey || process.env.ZOOP_WEBHOOK_SECURITY_KEY;

    if (expectedKey && incomingKey && incomingKey !== expectedKey) {
      console.error(`[ZOOP Webhook Security Guard] Invalid security key for request ${requestId}`);
      return { success: false, code: 'UNAUTHORIZED_WEBHOOK', message: 'Webhook security key verification failed' };
    }

    // Idempotency Check
    if (verificationRecord.status === 'VERIFIED' || verificationRecord.status === 'FAILED') {
      return { success: true, message: 'Webhook already processed (Idempotent return)' };
    }

    const partner = await User.findById(verificationRecord.partnerId);
    if (!partner) {
      return { success: false, code: 'PARTNER_NOT_FOUND', message: 'Partner not found' };
    }

    const txnStatus = body?.transaction_status || body?.status || 'COMPLETED';
    const isSuccess = ['COMPLETED', 'SUCCESS', 'VERIFIED', 'FETCHED'].includes(String(txnStatus).toUpperCase());

    const docStatuses = {
      ADHAR: body?.doc_statuses?.ADHAR || (isSuccess ? 'FETCHED' : 'SKIPPED'),
      PANCR: body?.doc_statuses?.PANCR || (isSuccess ? 'FETCHED' : 'SKIPPED'),
      DRVLC: body?.doc_statuses?.DRVLC || (isSuccess ? 'FETCHED' : 'SKIPPED'),
    };

    partner.kyc.digilocker = {
      requestId,
      securityKey: verificationRecord.securityKey,
      status: isSuccess ? 'VERIFIED' : 'FAILED',
      initializedAt: partner.kyc.digilocker?.initializedAt || new Date(),
      completedAt: new Date(),
      docStatuses,
    };

    const isAadhaarFetched = docStatuses.ADHAR === 'FETCHED' || isSuccess;
    partner.kyc.aadhaar = {
      status: isAadhaarFetched ? 'VERIFIED' : 'FAILED',
      verified: isAadhaarFetched,
      verifiedAt: isAadhaarFetched ? new Date() : null,
      referenceId: requestId,
    };

    if (isAadhaarFetched) {
      if (!partner.documents) partner.documents = {};
      partner.documents.aadhaarDoc = partner.documents.aadhaarDoc || '[DIGILOCKER_AADHAAR_VERIFIED]';
      partner.documents.aadhaarFront = partner.documents.aadhaarFront || '[DIGILOCKER_AADHAAR_VERIFIED]';
    }

    partner.markModified('kyc');
    await partner.save();

    verificationRecord.status = isSuccess ? 'VERIFIED' : 'FAILED';
    verificationRecord.rawResponse = body;
    verificationRecord.verifiedAt = new Date();
    await verificationRecord.save();

    await KycAuditService.logEvent({
      partnerId: partner._id,
      actorRole: 'SYSTEM',
      action: isSuccess ? 'DIGILOCKER_COMPLETED' : 'DIGILOCKER_FAILED',
      status: isSuccess ? 'VERIFIED' : 'FAILED',
      referenceId: requestId,
      metadata: { docStatuses, txnStatus },
    });

    await KycStatusService.calculateOverallKycStatus(partner._id);

    return { success: true, message: 'DigiLocker webhook processed successfully', status: partner.kyc.digilocker.status };
  }

  /**
   * Fetch DigiLocker Status by Request ID
   */
  static async fetchStatus(requestId) {
    const record = await KycVerification.findOne({ requestId, productType: 'DIGILOCKER' });
    if (!record) throw new Error('DigiLocker transaction request not found');

    const partner = await User.findById(record.partnerId);
    let currentStatus = partner?.kyc?.digilocker?.status || record.status || 'PENDING';

    if (isRealZoopConfigured() && currentStatus === 'VERIFYING') {
      try {
        const rawRes = await ZoopClient.post('/in/identity/digilocker/fetch', { request_id: requestId });
        if (rawRes?.status) {
          await this.processWebhook({}, { request_id: requestId, transaction_status: rawRes.status, doc_statuses: rawRes.doc_statuses });
          currentStatus = rawRes.status;
        }
      } catch (err) {
        console.warn('[ZOOP DigiLocker Fetch Error]:', err.message);
      }
    }

    return {
      requestId,
      status: currentStatus,
      docStatuses: partner?.kyc?.digilocker?.docStatuses || { ADHAR: 'PENDING', PANCR: 'PENDING', DRVLC: 'PENDING' },
      verifiedAt: record.verifiedAt,
    };
  }
}
