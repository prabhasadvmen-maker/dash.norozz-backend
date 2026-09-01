import mongoose from 'mongoose';

const kycVerificationSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productType: {
      type: String,
      enum: ['PAN', 'DIGILOCKER', 'DRIVING_LICENSE', 'BANK_ACCOUNT', 'FACE_MATCH', 'FACE_LIVENESS', 'MOBILE_OTP'],
      required: true,
    },
    requestId: {
      type: String,
      default: '',
      index: true,
    },
    securityKey: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFYING', 'VERIFIED', 'FAILED', 'EXPIRED'],
      default: 'PENDING',
    },
    idempotencyKey: {
      type: String,
      default: '',
      index: true,
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    failureCode: {
      type: String,
      default: '',
    },
    failureReason: {
      type: String,
      default: '',
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const KycVerification = mongoose.model('KycVerification', kycVerificationSchema);
