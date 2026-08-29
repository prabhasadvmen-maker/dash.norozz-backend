import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global_settings',
      unique: true,
    },
    referralBonusAmount: {
      type: Number,
      default: 200,
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
