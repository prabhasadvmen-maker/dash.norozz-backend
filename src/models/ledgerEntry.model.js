import mongoose from 'mongoose';

const ledgerEntrySchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    accountType: {
      type: String,
      enum: ['CUSTOMER_WALLET', 'PARTNER_WALLET', 'NOROZZ_REVENUE', 'ESCROW_HOLD'],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'CUSTOMER_PAYMENT',
        'CUSTOMER_WALLET_CREDIT',
        'CUSTOMER_WALLET_DEBIT',
        'PARTNER_EARNING',
        'PARTNER_COMMISSION',
        'CUSTOMER_PLATFORM_FEE',
        'NOROZZ_REVENUE',
        'NOROZZ_REFUND',
        'REFUND',
        'PARTIAL_REFUND',
        'CANCELLATION_CHARGE',
        'PARTNER_COMPENSATION',
        'WITHDRAWAL',
        'WITHDRAWAL_REVERSAL',
        'ADMIN_ADJUSTMENT',
        'SERVICE_SETTLEMENT',
      ],
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['DEBIT', 'CREDIT'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    balanceBefore: {
      type: Number,
      default: 0,
    },
    balanceAfter: {
      type: Number,
      default: 0,
    },
    referenceType: {
      type: String,
      default: 'Booking',
    },
    referenceId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Success', 'Reversed', 'Failed'],
      default: 'Success',
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
