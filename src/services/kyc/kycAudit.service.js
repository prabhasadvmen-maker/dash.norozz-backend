import { KycAuditLog } from '../../models/kycAuditLog.model.js';

export class KycAuditService {
  static async logEvent({ partnerId, actorId = null, actorRole = 'SYSTEM', action, status = 'SUCCESS', referenceId = '', reason = '', metadata = {}, req = null }) {
    try {
      let ipAddress = '';
      let userAgent = '';
      if (req) {
        ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
        userAgent = req.headers['user-agent'] || '';
      }

      return await KycAuditLog.create({
        partnerId,
        actorId,
        actorRole,
        action,
        status,
        referenceId,
        reason,
        metadata,
        ipAddress,
        userAgent,
      });
    } catch (err) {
      console.warn('[KYC Audit Log Warning] Failed to save audit log:', err.message);
      return null;
    }
  }
}
