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
      required: true,
    },
    type: {
      type: String,
      enum: ['Credit', 'Debit'],
      required: true,
    },
    category: {
      type: String,
      enum: ['Job Earnings', 'Referral Bonus', 'Bank Withdrawal', 'Security Deposit', 'Surge Bonus'],
      default: 'Job Earnings',
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
