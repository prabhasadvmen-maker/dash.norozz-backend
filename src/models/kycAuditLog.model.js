import mongoose from 'mongoose';

const kycAuditLogSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorRole: {
      type: String,
      enum: ['PARTNER', 'CITY_ADMIN', 'SUPER_ADMIN', 'SYSTEM'],
      default: 'SYSTEM',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      default: 'SUCCESS',
    },
    referenceId: {
      type: String,
      default: '',
    },
    reason: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export const KycAuditLog = mongoose.model('KycAuditLog', kycAuditLogSchema);
