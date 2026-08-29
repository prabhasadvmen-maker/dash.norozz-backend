import mongoose from 'mongoose';

const commissionRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null, // null means global default rule
      index: true,
    },
    customerFeeType: {
      type: String,
      enum: ['percentage', 'fixed', 'percentage_plus_fixed'],
      default: 'percentage',
    },
    customerFeeValue: {
      type: Number,
      required: true,
      default: 5, // 5%
    },
    customerFeeFixed: {
      type: Number,
      default: 0,
    },
    partnerCommissionType: {
      type: String,
      enum: ['percentage', 'fixed', 'percentage_plus_fixed'],
      default: 'percentage',
    },
    partnerCommissionValue: {
      type: Number,
      required: true,
      default: 5, // 5%
    },
    partnerCommissionFixed: {
      type: Number,
      default: 0,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CommissionRule = mongoose.model('CommissionRule', commissionRuleSchema);
