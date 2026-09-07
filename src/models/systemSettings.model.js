import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global_settings',
      unique: true,
    },
    customerPlatformFeePercent: {
      type: Number,
      default: 5,
    },
    partnerPlatformFeePercent: {
      type: Number,
      default: 10,
    },
    referralBonusAmount: {
      type: Number,
      default: 200,
    },
    partnerCancellationPenaltyAmount: {
      type: Number,
      default: 100,
    },
    maxDailyFreeCancellations: {
      type: Number,
      default: 3,
    },
    partnerOnboardingFee: {
      type: Number,
      default: 999,
    },
    currency: {
      type: String,
      default: 'INR',
    },
  },
  {
    timestamps: true,
  }
);

export const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);
