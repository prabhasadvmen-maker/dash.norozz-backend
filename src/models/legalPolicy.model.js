import mongoose from 'mongoose';

const legalPolicySchema = new mongoose.Schema(
  {
    targetApp: {
      type: String,
      enum: ['customer', 'partner'],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['privacy_policy', 'terms_and_conditions'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      default: '',
    },
    version: {
      type: String,
      default: 'v1.0',
      trim: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    lastUpdatedBy: {
      type: String,
      default: 'Super Admin HQ',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure uniqueness for each targetApp + type pair
legalPolicySchema.index({ targetApp: 1, type: 1 }, { unique: true });

export const LegalPolicy = mongoose.model('LegalPolicy', legalPolicySchema);
