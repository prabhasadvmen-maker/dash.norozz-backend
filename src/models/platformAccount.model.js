import mongoose from 'mongoose';

const platformAccountSchema = new mongoose.Schema(
  {
    accountName: {
      type: String,
      default: 'Norozz Main Revenue Account',
      unique: true,
    },
    grossCustomerFees: {
      type: Number,
      default: 0,
    },
    grossPartnerCommissions: {
      type: Number,
      default: 0,
    },
    grossRevenue: {
      type: Number,
      default: 0,
    },
    totalRefundsAdjusted: {
      type: Number,
      default: 0,
    },
    totalGatewayFees: {
      type: Number,
      default: 0,
    },
    netPlatformRevenue: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const PlatformAccount = mongoose.model('PlatformAccount', platformAccountSchema);
