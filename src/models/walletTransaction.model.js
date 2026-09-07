import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
    type: {
      type: String,
      enum: ['Credit', 'Debit'],
      required: true,
    },
    category: {
      type: String,
      enum: ['Added to Wallet', 'Deposit', 'Service Booking', 'Refund', 'Job Earnings', 'Referral Bonus', 'Bank Withdrawal', 'Security Deposit', 'Surge Bonus', 'Cancellation Penalty', 'Onboarding Fee'],
      default: 'Added to Wallet',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['Completed', 'Pending', 'Failed'],
      default: 'Completed',
    },
    paymentMethod: {
      type: String,
      default: 'Bank Transfer (IMPS)',
    },
  },
  { timestamps: true }
);

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
