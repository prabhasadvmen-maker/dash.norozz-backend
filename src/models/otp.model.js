import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    emailOrPhone: {
      type: String,
      required: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['verification', 'login', 'resetPassword', 'secondaryVerify', 'partnerLogin', 'hiringEmail', 'hiringMobile'],
      default: 'resetPassword',
    },
    attempts: {
      type: Number,
      default: 0,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically delete expired OTP records
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = mongoose.model('Otp', otpSchema);
